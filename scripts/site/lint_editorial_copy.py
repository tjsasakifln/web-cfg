#!/usr/bin/env python3
"""Lint CONFENGE public copy for em-dashes and high-confidence AI phrases.

Covers:
- data/editorial/pages/*.json fields
- ferramentas/** HTML (visible text)
- public HTML surfaces via residual_em_dashes (official source titles allowed)
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


def snip(t: str, i: int) -> str:
    return t[max(0, i - 24) : i + 72].replace("\n", " ")


def scan(text: str, path: str, field: str, out: list) -> None:
    if not text:
        return
    for name, rx in PATS:
        for m in rx.finditer(text):
            out.append(
                {
                    "path": path,
                    "field": field,
                    "pattern": name,
                    "snippet": snip(text, m.start()),
                }
            )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", type=Path)
    ap.add_argument(
        "--skip-public-html",
        action="store_true",
        help="Only scan editorial JSON + ferramentas (legacy scope)",
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

    for p in sorted((ROOT / "ferramentas").rglob("index.html")):
        raw = p.read_text(encoding="utf-8")
        visible = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw, flags=re.I | re.S)
        visible = re.sub(r"<style\b[^>]*>.*?</style>", " ", visible, flags=re.I | re.S)
        visible = re.sub(r"<[^>]+>", " ", visible)
        scan(re.sub(r"\s+", " ", visible), str(p.relative_to(ROOT)), "html_visible", findings)

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
    rep = {
        "ok": len(em) == 0,
        "em_dash_count": len(em),
        "em_dash": em[:200],
        "patterns": [f for f in findings if f["pattern"] != "em_dash"],
        "public_html_residual": len(public_residual),
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")

    print("em_dash hits:", len(em), f"(public_html residual: {len(public_residual)})")
    for f in em[:20]:
        print(" EM", f["path"], f["field"], f["snippet"])
    if em:
        print("FAIL", file=sys.stderr)
        return 1
    print("PASS copy lint")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
