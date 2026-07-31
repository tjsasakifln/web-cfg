#!/usr/bin/env python3
"""Audit pSEO: determinism, PII tracking hooks, regression inventory, forbidden fields."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build import build  # noqa: E402
from scripts.pseo.schema import validate_snapshot  # noqa: E402
from scripts.pseo.validate import validate_all  # noqa: E402
from scripts.pseo.editorial_audit import run_editorial_audit  # noqa: E402


def hash_tree(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in sorted(paths, key=lambda x: str(x)):
        h.update(p.as_posix().encode())
        h.update(p.read_bytes())
    return h.hexdigest()


def collect_pseo_html() -> list[Path]:
    paths = []
    for base in (ROOT / "inteligencia", ROOT / "radar"):
        if not base.exists():
            continue
        paths.extend(base.rglob("index.html"))
    return paths


def audit_determinism() -> dict:
    """Second build should not change HTML hashes of pSEO pages."""
    before = collect_pseo_html()
    h1 = hash_tree(before) if before else ""
    build(ROOT / "data" / "pseo", dry_run=False)
    after = collect_pseo_html()
    h2 = hash_tree(after)
    # rebuild again
    build(ROOT / "data" / "pseo", dry_run=False)
    after2 = collect_pseo_html()
    h3 = hash_tree(after2)
    return {
        "first_hash": h2,
        "second_hash": h3,
        "deterministic": h2 == h3,
        "page_count": len(after2),
    }


def audit_script_tracking() -> dict:
    script = (ROOT / "script.js").read_text(encoding="utf-8")
    required = [
        "pseo_cta_click",
        "pseo_whatsapp_click",
        "pseo_related_page_click",
        "pseo_source_open",
        "pseo_table_interaction",
        "pseo_form_start",
        "pseo_form_submit",
    ]
    missing = [e for e in required if e not in script and f'"{e}"' not in script]
    # confengeTrack must still filter PII
    has_filter = "@/|\\+?\\d{8,}/" in script or r"/@|\+?\d{8,}/" in script
    return {
        "events_declared_or_handled": [e for e in required if e not in missing],
        "missing_events": missing,
        "pii_filter_present": has_filter,
        "confengeTrack_exported": "confengeTrack" in script,
    }


def audit_no_regression_inventory() -> dict:
    """Count pre-existing content pages still present."""
    conteudos = list((ROOT / "conteudos").glob("*/index.html")) if (ROOT / "conteudos").exists() else []
    pillars = [
        "auditoria-orcamento-licitacao",
        "medicoes-glosas-obras-publicas",
        "aditivos-obras-publicas",
        "reequilibrio-obras-publicas",
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "diagnostico-pre-licitacao",
        "acompanhamento-contratos-obras",
    ]
    missing_pillars = [p for p in pillars if not (ROOT / p / "index.html").exists()]
    main_sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    # ensure we didn't wipe main sitemap
    sm_urls = len(re.findall(r"<loc>", main_sitemap))
    return {
        "conteudos_pages": len(conteudos),
        "missing_pillars": missing_pillars,
        "main_sitemap_urls": sm_urls,
        "ok": len(missing_pillars) == 0 and sm_urls >= 100 and len(conteudos) >= 100,
    }


def audit_forbidden_in_data() -> dict:
    text = ""
    for p in (ROOT / "data" / "pseo").glob("*.json"):
        text += p.read_text(encoding="utf-8")
    bad = []
    for needle in (
        "score_total",
        "commercial_state",
        "human_notes",
        "do_not_contact",
        "suggested_offer",
        "next_human_step",
    ):
        if needle in text:
            bad.append(needle)
    return {"forbidden_found": bad, "ok": len(bad) == 0}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-determinism", action="store_true")
    args = ap.parse_args(argv)

    results = {
        "snapshot": None,
        "validate": None,
        "determinism": None,
        "tracking": audit_script_tracking(),
        "regression": audit_no_regression_inventory(),
        "data_forbidden": audit_forbidden_in_data(),
    }
    try:
        results["snapshot"] = {"ok": True, **{k: validate_snapshot(ROOT / "data" / "pseo")[k] for k in ("ok",)}}
    except Exception as e:
        results["snapshot"] = {"ok": False, "error": str(e)}

    results["validate"] = validate_all()
    results["editorial"] = run_editorial_audit()

    if not args.skip_determinism:
        results["determinism"] = audit_determinism()

    ok = (
        results["snapshot"].get("ok")
        and results["validate"].get("ok")
        and results["editorial"].get("ok")
        and results["regression"].get("ok")
        and results["data_forbidden"].get("ok")
        and (args.skip_determinism or results["determinism"].get("deterministic"))
        and results["tracking"].get("pii_filter_present")
        and results["tracking"].get("confengeTrack_exported")
    )
    # tracking events may be wired in this audit pass — missing is warning if we patch script after
    out = {"ok": bool(ok), "results": results}
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
    (ROOT / "seo" / "pseo-audit-report.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
