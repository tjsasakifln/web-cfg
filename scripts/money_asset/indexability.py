#!/usr/bin/env python3
"""Apply the existing organic indexability gate to the Money Asset."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.organic.gates import indexability_quality_gate  # noqa: E402


def _diagnosis() -> dict:
    script = """
const { createRequire } = require("module");
const { readFileSync } = require("fs");
const { resolve } = require("path");
const root = process.cwd();
const { diagnoseMargin, evaluateIndexability, diagnoseProducerBlock } = require(resolve(root, "assets/js/diagnose-margin.cjs"));
const snap = JSON.parse(readFileSync(resolve(root, "data/extra-cli/public-read-margin-defense/1.0/margem-export.json"), "utf8"));
const d = diagnoseMargin(snap.records[0], snap);
const inputs = evaluateIndexability(d, { sample_size: 1 });
process.stdout.write(JSON.stringify({
  diagnosis: d,
  inputs,
  producer_block: diagnoseProducerBlock(snap, d, inputs),
}));
"""
    raw = subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True)
    return json.loads(raw)


def main() -> int:
    payload = _diagnosis()
    inputs = payload["inputs"]
    gate = indexability_quality_gate(**inputs)
    html = (ROOT / "ferramentas/diagnostico-defesa-margem/index.html").read_text(encoding="utf-8")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    url = "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/"
    in_sitemap = url in sitemap
    noindex = "noindex" in html
    result = {
        "asset": url,
        "gate": gate,
        "inputs": inputs,
        "in_sitemap": in_sitemap,
        "html_noindex": noindex,
        "policy": (
            "include_in_sitemap_only_if_indexable"
            if gate["indexable"]
            else "omit_from_sitemap_and_noindex"
        ),
        "consistent": (gate["indexable"] and in_sitemap and not noindex)
        or ((not gate["indexable"]) and (not in_sitemap) and noindex),
    }
    out = ROOT / "data/organic/money-asset-indexability.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    block = payload.get("producer_block") or {}
    if not gate["indexable"]:
        block_path = ROOT / "data/organic/money-asset-producer-block.json"
        block_path.write_text(json.dumps(block, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": result["consistent"],
                "indexable": gate["indexable"],
                "fails": gate["fails"],
                "producer_block_fields": [
                    row.get("field") for row in (block.get("blocking_official_fields") or [])
                ],
            },
            ensure_ascii=False,
        )
    )
    if not result["consistent"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
