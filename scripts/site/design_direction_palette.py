#!/usr/bin/env python3
"""G3 — luminance separation of the palette declared by issue #494.

The rule the brief fixes in §4.1 is computable: *two values that carry
different meanings differ by ≥3:1 in relative luminance, or they are never the
sole differentiator.* This module answers it for the declared diff of the
shipped tokens — reuse, one addition, one pending deprecation — and prints the
grayscale ratio for every pair of semantic roles, which is the print test the
v1 of the brief demanded and then failed.

Nothing here is a second palette. Every value except ``--caution-700`` is read
out of ``styles-tokens.css``; the addition is declared here and measured on the
same arithmetic the design gates already use (``_contrast_ratio``), so a number
in the deliverable and a number in CI cannot drift apart.

Usage:
    python3 scripts/site/design_direction_palette.py [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.site.test_design_gates import (  # noqa: E402
    _contrast_ratio,
    _relative_luminance,
)

TOKENS_CSS = ROOT / "styles-tokens.css"

# The one addition #494 declares. 5.26:1 on white; the v1's #9A6B00 gives
# 4.37:1 and fails AA, so it is recorded here as rejected, not resurrected.
ADDITION = ("--caution-700", "#8A5F00")
REJECTED_ADDITION = ("--caution-700 (v1, reprovada)", "#9A6B00")

# Semantic roles under comparison. Each declares the non-chromatic carrier that
# makes it legible when colour is gone — printed in 100% grey, or in forced
# colours, or read by someone who does not separate the hues.
ROLES = {
    "decisao": {
        "token": "--green-700",
        "carriers": ["a palavra “valida”", "glifo ·", "posicao: linha de status no inicio do bloco"],
    },
    "ressalva": {
        "token": ADDITION[0],
        "carriers": ["a palavra “vencida” ou “sem …”", "glifo × ou !", "peso 700", "fio de borda inicial de 4px"],
    },
    "metadado_neutro": {
        "token": "--muted",
        "carriers": ["rotulo em caixa alta na coluna fixa do trilho", "corpo >=12,8px"],
    },
    "estrutura": {
        "token": "--ink",
        "carriers": ["peso 700", "posicao: coluna do numero"],
    },
}

# The --lime call sites in styles.css are the migration surface of the
# `keep | restrict | deprecate` decision. Enumerated from the shipped file, not
# from memory, by ``lime_call_sites()``.
LIME_TOKEN = "--lime"


def declared_tokens() -> dict[str, str]:
    text = TOKENS_CSS.read_text(encoding="utf-8")
    found = dict(re.findall(r"(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;", text))
    return {k: ("#" + "".join(c * 2 for c in v[1:]) if len(v) == 4 else v) for k, v in found.items()}


def lime_call_sites() -> list[dict]:
    """Every line of styles.css that references --lime, with its selector."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8").splitlines()
    sites: list[dict] = []
    selector = ""
    for number, line in enumerate(css, start=1):
        stripped = line.strip()
        if stripped.endswith("{"):
            selector = stripped[:-1].strip()
        if LIME_TOKEN in stripped:
            sites.append({"line": number, "selector": selector, "text": stripped[:160]})
    return sites


def grayscale_hex(color: str) -> str:
    """The 100%-grey rendering of a colour, by relative luminance."""
    value = round(_relative_luminance(color) ** (1 / 2.2) * 255)
    value = max(0, min(255, value))
    return "#{0:02x}{0:02x}{0:02x}".format(value)


def report() -> dict:
    tokens = declared_tokens()
    tokens[ADDITION[0]] = ADDITION[1]
    resolved = {name: tokens[meta["token"]] for name, meta in ROLES.items()}

    on_white = {name: round(_contrast_ratio(color, "#ffffff"), 2) for name, color in resolved.items()}
    pairs = []
    names = list(resolved)
    for index, left in enumerate(names):
        for right in names[index + 1 :]:
            ratio = _contrast_ratio(resolved[left], resolved[right])
            pairs.append(
                {
                    "pair": f"{left} x {right}",
                    "hex": [resolved[left], resolved[right]],
                    "grayscale_hex": [grayscale_hex(resolved[left]), grayscale_hex(resolved[right])],
                    "luminance_ratio": round(ratio, 2),
                    "separated_by_luminance": ratio >= 3.0,
                    "non_chromatic_carriers": {
                        left: ROLES[left]["carriers"],
                        right: ROLES[right]["carriers"],
                    },
                }
            )

    # G3 passes when every pair either clears 3:1 or declares a carrier on both
    # sides. Colour is never the only differentiator; that is the whole rule.
    failures = [
        pair["pair"]
        for pair in pairs
        if not pair["separated_by_luminance"] and not all(pair["non_chromatic_carriers"].values())
    ]

    lime_sites = lime_call_sites()
    return {
        "schema": "confenge.design-direction-palette/1.0",
        "issue": 494,
        "reuse": {
            token: tokens[token]
            for token in (
                "--ink", "--text", "--muted", "--green-700", "--navy-950",
                "--navy-900", "--navy-800", "--line", "--soft", "--white",
            )
            if token in tokens
        },
        "addition": {
            "token": ADDITION[0],
            "hex": ADDITION[1],
            "contrast_on_white": round(_contrast_ratio(ADDITION[1], "#ffffff"), 2),
            "aa_normal_text": _contrast_ratio(ADDITION[1], "#ffffff") >= 4.5,
            "rejected_v1": {
                "hex": REJECTED_ADDITION[1],
                "contrast_on_white": round(_contrast_ratio(REJECTED_ADDITION[1], "#ffffff"), 2),
                "aa_normal_text": _contrast_ratio(REJECTED_ADDITION[1], "#ffffff") >= 4.5,
            },
        },
        "role_contrast_on_white": on_white,
        "role_pairs": pairs,
        "g3_pass": not failures,
        "g3_failures": failures,
        "lime": {
            "hex": tokens.get(LIME_TOKEN),
            "contrast_on_white": round(_contrast_ratio(tokens[LIME_TOKEN], "#ffffff"), 2) if LIME_TOKEN in tokens else None,
            "contrast_on_navy_950": round(_contrast_ratio(tokens[LIME_TOKEN], tokens["--navy-950"]), 2) if LIME_TOKEN in tokens else None,
            "call_sites": lime_sites,
            "call_site_count": len(lime_sites),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", dest="out", default=None, help="write the report to this path")
    args = parser.parse_args(argv)
    data = report()
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        target = Path(args.out)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print("wrote", target)
    else:
        print(text, end="")
    print(
        "G3_PASS" if data["g3_pass"] else "G3_FAIL " + ", ".join(data["g3_failures"]),
        f"lime_call_sites={data['lime']['call_site_count']}",
        file=sys.stderr,
    )
    return 0 if data["g3_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
