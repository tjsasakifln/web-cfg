#!/usr/bin/env python3
"""Fail-closed integrity gate for every published CONFENGE HTML document.

The source census is derived from the same public allowlist used by the
production artifact builder. The artifact census reads every ``*.html`` under
``_site``. There is no route allowlist in this gate, so a newly published
family is covered automatically.

Findings per document: structural closure, ``<use href="#id">`` without its
symbol, JSON-LD/FAQ parity and, since BOFU-FECHAMENTO-20260919, document
identity: ``duplicate_id``, ``aria_idref_undefined`` (every ARIA idref
attribute) and ``fragment_target_missing`` for ``href="#frag"`` on the same
page and ``href="/rota/#frag"`` resolved on the destination page of the same
surface. Counter-proofs live in ``scripts/site/fixtures/html_integrity``.
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import posixpath
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import PUBLIC_ROOT_FILES, PUBLIC_TOP_DIRS  # noqa: E402
from scripts.site.svg_sprite import missing_symbols  # noqa: E402

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


# --- Document identity: ids, fragment links and ARIA idrefs (BOFU-FECHAMENTO-20260919,
# A11Y-FRAGMENTOS-06). A link to ``#x`` without ``id="x"`` scrolls nowhere, an
# ``aria-labelledby`` pointing at a missing id names nothing and a duplicated id
# makes both silent, with every other gate still green. The parser is
# html.parser, never a regex over attributes.
ARIA_IDREF_ATTRS = (
    "aria-labelledby",
    "aria-describedby",
    "aria-controls",
    "aria-owns",
    "aria-details",
    "aria-errormessage",
    "aria-activedescendant",
    "aria-flowto",
)
# ``#top`` scrolls to the document start by specification even without an id.
SPECIAL_FRAGMENTS = frozenset({"top"})
SITE_HOSTS = frozenset({"confenge.com.br", "www.confenge.com.br"})
# Below these totals the sitewide identity census is not the public surface
# (a parser regression or an emptied tree); the source tree carries ~1500
# same-page fragment links and ~780 ARIA idrefs (2026-09-19).
IDENTITY_CENSUS_MIN_HTML_FILES = 100
IDENTITY_CENSUS_MIN_FRAGMENT_LINKS = 1000
IDENTITY_CENSUS_MIN_ARIA_IDREFS = 400


@dataclass
class DocumentIdentity:
    ids: Counter = field(default_factory=Counter)
    anchor_names: set[str] = field(default_factory=set)
    fragment_links: list[str] = field(default_factory=list)
    aria_refs: list[tuple[str, str]] = field(default_factory=list)

    def has_target(self, fragment: str) -> bool:
        return fragment in self.ids or fragment in self.anchor_names


class _IdentityParser(HTMLParser):
    """Collect ids, ``<a name>`` targets, ``href="…#frag"`` and ARIA idrefs.

    ``<template>`` content never enters the document tree, so neither its ids
    nor its references count.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.identity = DocumentIdentity()
        self._template_depth = 0

    def _collect(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._template_depth:
            return
        row = {name.lower(): (value or "") for name, value in attrs}
        element_id = row.get("id", "").strip()
        if element_id:
            self.identity.ids[element_id] += 1
        if tag == "a" and row.get("name", "").strip():
            self.identity.anchor_names.add(row["name"].strip())
        if tag in {"a", "area"} and "#" in row.get("href", ""):
            self.identity.fragment_links.append(row["href"])
        for attr in ARIA_IDREF_ATTRS:
            value = row.get(attr)
            if value:
                for ref in value.split():
                    self.identity.aria_refs.append((attr, ref))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self._collect(tag, attrs)
        if tag == "template":
            self._template_depth += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._collect(tag.lower(), attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "template" and self._template_depth:
            self._template_depth -= 1


def document_identity(raw: str) -> DocumentIdentity:
    parser = _IdentityParser()
    parser.feed(raw or "")
    parser.close()
    return parser.identity


def _route_of(rel: str) -> str:
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def resolve_fragment_link(href: str, page_rel: str) -> tuple[str | None, str] | None:
    """Return ``(target_rel or None for the same page, fragment)`` for a site link.

    ``None`` means the link leaves the site (other host, mailto, tel, javascript)
    or carries no usable fragment (``#`` alone, ``#top``).
    """
    parts = urlsplit(unquote(href.strip()))
    fragment = parts.fragment.strip()
    if not fragment or fragment in SPECIAL_FRAGMENTS:
        return None
    if parts.scheme and parts.scheme not in {"http", "https"}:
        return None
    if parts.netloc and parts.netloc.lower() not in SITE_HOSTS:
        return None
    path = parts.path
    if not path:
        return (None, fragment)
    if not path.startswith("/"):
        trailing = path.endswith("/")
        path = posixpath.normpath(posixpath.join(posixpath.dirname(_route_of(page_rel)), path))
        if trailing and not path.endswith("/"):
            path += "/"
    if path.endswith("/"):
        target = path.lstrip("/") + "index.html"
    elif path.endswith(".html"):
        target = path.lstrip("/")
    else:
        target = path.lstrip("/") + "/index.html"
    if target == page_rel:
        return (None, fragment)
    return (target, fragment)


def identity_findings(
    rel: str,
    identity: DocumentIdentity,
    census: dict[str, DocumentIdentity] | None = None,
) -> list[Finding]:
    findings: list[Finding] = []
    for element_id, count in sorted(identity.ids.items()):
        if count > 1:
            findings.append(Finding(rel, "duplicate_id", f"#{element_id} x{count}"))
    for attr, ref in identity.aria_refs:
        if ref not in identity.ids:
            findings.append(Finding(rel, "aria_idref_undefined", f"{attr}={ref}"))
    seen: set[str] = set()
    for href in identity.fragment_links:
        if href in seen:
            continue
        seen.add(href)
        resolved = resolve_fragment_link(href, rel)
        if resolved is None:
            continue
        target, fragment = resolved
        if target is None:
            if not identity.has_target(fragment):
                findings.append(Finding(rel, "fragment_target_missing", f"href={href}"))
            continue
        if census is None or target not in census:
            # A page outside this census (or a single-file audit) cannot be
            # checked here; the link is not reported as broken.
            continue
        if not census[target].has_target(fragment):
            findings.append(
                Finding(rel, "fragment_target_missing", f"href={href} -> {target}")
            )
    return findings


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


def audit_html(
    path: Path,
    *,
    display_path: str | None = None,
    census: dict[str, DocumentIdentity] | None = None,
) -> tuple[list[Finding], int, int]:
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

    # An icon drawn as <use href="#id"> resolves only inside the same document.
    # Without <symbol id="id"> the browser renders nothing and reports nothing,
    # so the control disappears with every other gate still green.
    for symbol_id in missing_symbols(raw):
        findings.append(Finding(rel, "svg_symbol_undefined", f"#{symbol_id}"))

    identity = census[rel] if census is not None and rel in census else document_identity(raw)
    findings.extend(identity_findings(rel, identity, census))

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
    # Cross-page ``/rota/#frag`` links resolve against every page of the same
    # surface, so the identity census is built before any page is audited.
    census: dict[str, DocumentIdentity] = {}
    for path in paths:
        census[path.relative_to(root).as_posix()] = document_identity(
            path.read_text(encoding="utf-8", errors="replace")
        )
    fragment_links = sum(len(identity.fragment_links) for identity in census.values())
    aria_idrefs = sum(len(identity.aria_refs) for identity in census.values())
    if len(paths) >= IDENTITY_CENSUS_MIN_HTML_FILES and (
        fragment_links < IDENTITY_CENSUS_MIN_FRAGMENT_LINKS
        or aria_idrefs < IDENTITY_CENSUS_MIN_ARIA_IDREFS
    ):
        findings.append(
            Finding(
                str(root),
                "identity_census_collapsed",
                f"fragment_links={fragment_links} aria_idrefs={aria_idrefs}",
            )
        )
    for path in paths:
        path_findings, page_count, question_count = audit_html(
            path, display_path=path.relative_to(root).as_posix(), census=census
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
        "identity": {
            "ids": sum(sum(identity.ids.values()) for identity in census.values()),
            "fragment_links": fragment_links,
            "aria_idrefs": aria_idrefs,
        },
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
        f" fragment_links={report['identity']['fragment_links']}"
        f" aria_idrefs={report['identity']['aria_idrefs']}"
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
