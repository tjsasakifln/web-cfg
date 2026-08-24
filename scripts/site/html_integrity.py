#!/usr/bin/env python3
"""Fail-closed integrity gate for every published CONFENGE HTML document.

The source census is derived from the same public allowlist used by the
production artifact builder. The artifact census reads every ``*.html`` under
``_site``. There is no route allowlist in this gate, so a newly published
family is covered automatically.
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import PUBLIC_ROOT_FILES, PUBLIC_TOP_DIRS  # noqa: E402

JSON_LD_RE = re.compile(
    r'<script\b(?=[^>]*\btype=["\']application/ld\+json["\'])[^>]*>'
    r"(.*?)</script\s*>",
    re.I | re.S,
)
DETAIL_RE = re.compile(r"<details\b[^>]*>(.*?)</details\s*>", re.I | re.S)
SUMMARY_RE = re.compile(r"<summary\b[^>]*>(.*?)</summary\s*>", re.I | re.S)


@dataclass(frozen=True)
class Finding:
    path: str
    code: str
    detail: str = ""


class _VisibleTextParser(HTMLParser):
    """Collect visitor-visible text while excluding scripts, styles and templates."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "template"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "template"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)


def normalize_text(value: str) -> str:
    parser = _VisibleTextParser()
    parser.feed(value or "")
    parser.close()
    return re.sub(r"\s+", " ", html_lib.unescape(" ".join(parser.parts))).strip()


def is_noindex(raw: str) -> bool:
    """Read the robots directive without depending on attribute order."""
    for tag in re.findall(r"<meta\b[^>]*>", raw, re.I):
        attrs = {
            name.lower(): value
            for name, _, value in re.findall(
                r"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*([\"'])(.*?)\2", tag
            )
        }
        if attrs.get("name", "").casefold() != "robots":
            continue
        directives = {part.strip().casefold() for part in attrs.get("content", "").split(",")}
        if "noindex" in directives:
            return True
    return False


def source_html_files(root: Path) -> list[Path]:
    """Return the production source census without a gate-specific allowlist."""
    paths: set[Path] = set()
    for name in PUBLIC_TOP_DIRS:
        directory = root / name
        if directory.is_dir():
            paths.update(directory.rglob("*.html"))
    for name in PUBLIC_ROOT_FILES:
        path = root / name
        if path.is_file() and path.suffix.lower() == ".html":
            paths.add(path)
    return sorted(paths)


def artifact_html_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.html") if path.is_file())


def _walk_faq_pages(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        if value.get("@type") == "FAQPage":
            yield value
        for child in value.values():
            yield from _walk_faq_pages(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_faq_pages(child)


def _details(html: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for details_match in DETAIL_RE.finditer(html):
        block = details_match.group(1)
        summary_match = SUMMARY_RE.search(block)
        if not summary_match:
            continue
        question = normalize_text(summary_match.group(1))
        answer = normalize_text(block[summary_match.end() :])
        pairs.append((question, answer))
    return pairs


def _answer_fragments(answer: str) -> list[str]:
    """Fragments permit a direct-answer layout to interleave supporting facts."""
    fragments = [part.strip() for part in re.split(r"(?<=[.!?])\s+", answer) if part.strip()]
    return fragments or ([answer] if answer else [])


def audit_html(path: Path, *, display_path: str | None = None) -> tuple[list[Finding], int, int]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    rel = display_path or str(path)
    findings: list[Finding] = []

    counts = {
        "html_open": len(re.findall(r"<html\b", raw, re.I)),
        "html_close": len(re.findall(r"</html\s*>", raw, re.I)),
        "body_open": len(re.findall(r"<body\b", raw, re.I)),
        "body_close": len(re.findall(r"</body\s*>", raw, re.I)),
        "main_open": len(re.findall(r"<main\b", raw, re.I)),
        "main_close": len(re.findall(r"</main\s*>", raw, re.I)),
    }
    for element in ("html", "body"):
        opened, closed = counts[f"{element}_open"], counts[f"{element}_close"]
        if opened != 1 or closed != 1:
            findings.append(
                Finding(rel, f"{element}_not_closed_once", f"open={opened} close={closed}")
            )
    if counts["main_open"] != counts["main_close"] or counts["main_open"] > 1:
        findings.append(
            Finding(
                rel,
                "main_unbalanced",
                f"open={counts['main_open']} close={counts['main_close']}",
            )
        )
    if counts["html_close"] == 1 and not re.search(r"</html\s*>\s*\Z", raw, re.I):
        findings.append(Finding(rel, "content_after_html_close"))
    if counts["body_close"] == 1 and counts["html_close"] == 1:
        if raw.lower().rfind("</body") > raw.lower().rfind("</html"):
            findings.append(Finding(rel, "body_closes_after_html"))
    if counts["main_close"] == 1 and counts["body_close"] == 1:
        if raw.lower().rfind("</main") > raw.lower().rfind("</body"):
            findings.append(Finding(rel, "main_closes_after_body"))

    faq_pages: list[dict[str, Any]] = []
    for index, script in enumerate(JSON_LD_RE.findall(raw)):
        try:
            payload = json.loads(script)
        except json.JSONDecodeError as exc:
            findings.append(Finding(rel, "jsonld_invalid", f"script={index}: {exc.msg}"))
            continue
        faq_pages.extend(_walk_faq_pages(payload))

    pairs = _details(raw)
    pair_map: dict[str, list[str]] = {}
    for question, answer in pairs:
        pair_map.setdefault(question, []).append(answer)
    visible = normalize_text(raw)
    faq_questions = 0

    for faq_index, faq in enumerate(faq_pages):
        entities = faq.get("mainEntity")
        if not isinstance(entities, list) or not entities:
            findings.append(Finding(rel, "faq_main_entity_missing", f"faq={faq_index}"))
            continue
        parsed: list[tuple[str, str]] = []
        for question_index, entity in enumerate(entities):
            answer = entity.get("acceptedAnswer") if isinstance(entity, dict) else None
            name = normalize_text(str(entity.get("name") or "")) if isinstance(entity, dict) else ""
            answer_text = (
                normalize_text(str(answer.get("text") or "")) if isinstance(answer, dict) else ""
            )
            if (
                not isinstance(entity, dict)
                or entity.get("@type") != "Question"
                or not isinstance(answer, dict)
                or answer.get("@type") != "Answer"
                or not name
                or not answer_text
            ):
                findings.append(
                    Finding(rel, "faq_entity_malformed", f"faq={faq_index} question={question_index}")
                )
                continue
            parsed.append((name, answer_text))
            faq_questions += 1

        # Standard FAQ surfaces render schema questions as disclosures. If one
        # schema question uses that contract, all questions must use it. Direct
        # answer pages may instead expose the same question/answer in ordinary DOM.
        uses_details = any(question in pair_map for question, _ in parsed)
        for question, answer in parsed:
            if uses_details:
                visible_answers = pair_map.get(question) or []
                if not visible_answers:
                    findings.append(Finding(rel, "faq_question_not_in_details", question[:120]))
                elif not any(visible_answer.strip() for visible_answer in visible_answers):
                    findings.append(Finding(rel, "faq_answer_missing_from_details", question[:120]))
                elif not is_noindex(raw) and not any(
                    all(fragment in visible_answer for fragment in _answer_fragments(answer))
                    for visible_answer in visible_answers
                ):
                    findings.append(Finding(rel, "faq_answer_not_in_details", question[:120]))
                continue
            if question not in visible:
                findings.append(Finding(rel, "faq_question_not_visible", question[:120]))
            missing = [fragment for fragment in _answer_fragments(answer) if fragment not in visible]
            if missing:
                findings.append(Finding(rel, "faq_answer_not_visible", missing[0][:120]))

    return findings, len(faq_pages), faq_questions


def audit_surface(root: Path, *, surface: str) -> dict[str, Any]:
    paths = source_html_files(root) if surface == "source" else artifact_html_files(root)
    findings: list[Finding] = []
    faq_pages = 0
    faq_questions = 0
    if not paths:
        findings.append(Finding(str(root), "html_census_empty", surface))
    for path in paths:
        path_findings, page_count, question_count = audit_html(
            path, display_path=path.relative_to(root).as_posix()
        )
        findings.extend(path_findings)
        faq_pages += page_count
        faq_questions += question_count
    return {
        "ok": not findings,
        "surface": surface,
        "root": str(root),
        "html_files": len(paths),
        "faq_pages": faq_pages,
        "faq_questions": faq_questions,
        "findings": [asdict(finding) for finding in findings],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--surface", choices=("source", "artifact"), required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)

    report = audit_surface(args.root.resolve(), surface=args.surface)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(
        "HTML_INTEGRITY"
        f" surface={report['surface']}"
        f" html_files={report['html_files']}"
        f" faq_pages={report['faq_pages']}"
        f" faq_questions={report['faq_questions']}"
        f" failures={len(report['findings'])}"
    )
    for finding in report["findings"][:100]:
        print(
            f"FAIL {finding['path']} {finding['code']} {finding.get('detail') or ''}",
            file=sys.stderr,
        )
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
