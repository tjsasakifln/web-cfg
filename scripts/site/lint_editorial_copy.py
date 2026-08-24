#!/usr/bin/env python3
"""Lint CONFENGE public copy for em-dashes and high-confidence AI phrases.

Every pattern in PATS governs `ok` and the exit code (issue #298). Before that
fix only `em_dash` did: the five phrase rules were computed, written to the
report's `patterns` field and then ignored, so the report was green because no
travessão existed, not because the phrases were absent.

Covers:
- data/editorial/pages/*.json fields
- every shipped visitor HTML file (visible text), derived from
  scripts/site/public_copy_scope, not from a hand-written route list
- public HTML surfaces via residual_em_dashes (official source titles allowed)

Legitimate individual occurrences live in data/site/copy-exceptions.json with a
written reason, one entry per (rule, match, exact path).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    is_excepted,
    visible_text,
    visitor_facing_html_files,
)
from scripts.site.scrub_em_dashes import (  # noqa: E402
    EM,
    iter_public_html,
    residual_em_dashes,
)

FIELDS = (
    "title",
    "lead",
    "direct_answer",
    "meta_description",
    "body_markdown",
    "cta_whatsapp",
    "cta_email_subject",
    "cta_email_body",
    "cta_offer",
    "cta_blurb",
)
PATS = [
    ("em_dash", re.compile(EM)),
    ("resultado_acionavel", re.compile(r"resultado acion[aá]vel", re.I)),
    ("ordem_de_ataque", re.compile(r"ordem de ataque", re.I)),
    ("engenharia_mais_prova", re.compile(r"engenharia\s*\+\s*prova", re.I)),
    ("diligencia_eterna", re.compile(r"dilig[eê]ncia eterna", re.I)),
    ("agrega_valor", re.compile(r"agrega valor", re.I)),
]

# Rule name used by data/site/copy-exceptions.json for this lint.
EXCEPTION_RULE = "editorial_copy_phrase"


def snip(t: str, i: int) -> str:
    return t[max(0, i - 24) : i + 72].replace("\n", " ")


def scan(text: str, path: str, field: str, out: list) -> None:
    if not text:
        return
    for name, rx in PATS:
        for m in rx.finditer(text):
            if name != "em_dash" and is_excepted(EXCEPTION_RULE, name, path):
                continue
            out.append(
                {
                    "path": path,
                    "field": field,
                    "pattern": name,
                    "snippet": snip(text, m.start()),
                }
            )


def build_report(
    em: list[dict],
    phrase: list[dict],
    public_residual: int,
    scanned_html: int,
) -> dict:
    """The report and the exit code come from BOTH em-dash and phrase findings.

    Issue #298: `ok` used to be computed from em-dash findings only, so the five
    phrase rules were reported and never enforced.
    """
    return {
        "ok": len(em) == 0 and len(phrase) == 0,
        "scanned_html": scanned_html,
        "em_dash_count": len(em),
        "em_dash": em[:200],
        "phrase_count": len(phrase),
        "patterns": phrase,
        "public_html_residual": public_residual,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", type=Path)
    ap.add_argument(
        "--skip-public-html",
        action="store_true",
        help="Only scan editorial JSON + visitor HTML (skip residual em-dash sweep)",
    )
    args = ap.parse_args()
    findings: list[dict] = []

    for p in sorted((ROOT / "data/editorial/pages").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        rel = str(p.relative_to(ROOT))
        for f in FIELDS:
            if isinstance(d.get(f), str):
                scan(d[f], rel, f, findings)
        for i, item in enumerate(d.get("faq") or []):
            if isinstance(item, dict):
                if isinstance(item.get("q"), str):
                    scan(item["q"], rel, f"faq[{i}].q", findings)
                if isinstance(item.get("a"), str):
                    scan(item["a"], rel, f"faq[{i}].a", findings)
        for i, req in enumerate(d.get("checklist_items") or []):
            if isinstance(req, dict) and isinstance(req.get("label"), str):
                scan(req["label"], rel, f"items[{i}]", findings)

    # Sitewide: every shipped visitor HTML file, derived from the repository.
    # The em_dash pattern stays on the residual sweep below (official source
    # titles may keep —); here only the five phrase rules run.
    html_files = visitor_facing_html_files(ROOT)
    for p in html_files:
        raw = p.read_text(encoding="utf-8")
        rel = str(p.relative_to(ROOT))
        text = visible_text(raw)
        for name, rx in PATS:
            if name == "em_dash":
                continue
            for m in rx.finditer(text):
                if is_excepted(EXCEPTION_RULE, name, rel):
                    continue
                findings.append(
                    {
                        "path": rel,
                        "field": "html_visible",
                        "pattern": name,
                        "snippet": snip(text, m.start()),
                    }
                )

    public_residual: list[dict] = []
    if not args.skip_public_html:
        for p in iter_public_html(ROOT):
            try:
                raw = p.read_text(encoding="utf-8")
            except OSError:
                continue
            snips = residual_em_dashes(raw)
            if snips:
                rel = str(p.relative_to(ROOT))
                for s in snips:
                    public_residual.append(
                        {
                            "path": rel,
                            "field": "public_html",
                            "pattern": "em_dash_prose",
                            "snippet": s,
                        }
                    )

    em = [f for f in findings if f["pattern"] == "em_dash"] + public_residual
    phrase = [f for f in findings if f["pattern"] != "em_dash"]
    rep = build_report(em, phrase, len(public_residual), len(html_files))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"scanned {len(html_files)} visitor HTML files; "
        f"em_dash hits: {len(em)} (public_html residual: {len(public_residual)}); "
        f"phrase hits: {len(phrase)}"
    )
    for f in em[:20]:
        print(" EM", f["path"], f["field"], f["snippet"])
    for f in phrase[:40]:
        print(" PHRASE", f["pattern"], f["path"], f["field"], f["snippet"])
    if em or phrase:
        print("FAIL", file=sys.stderr)
        return 1
    print("PASS copy lint")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
