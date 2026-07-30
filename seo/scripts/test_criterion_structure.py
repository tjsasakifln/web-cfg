#!/usr/bin/env python3
"""Prove validate_seo structural checks catch duplicate criterion numbers and orphans.

Drives the same regex/logic as seo/scripts/validate_seo.py against fixtures
and the real aditivo-qualitativo page (must be clean 01–04).
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def structural_errors(html: str, slug: str = "fixture") -> list[str]:
    """Mirror of validate_seo.py #diagnostico structural invariants."""
    errors: list[str] = []
    diag = re.search(
        r'<section\b[^>]*\bid=["\']diagnostico["\'][^>]*>(.*?)</section>',
        html,
        re.S | re.I,
    )
    if not diag:
        return errors
    dbody = diag.group(1)
    nums = re.findall(
        r'<div class="criterion-card"[^>]*>\s*<span>([^<]+)</span>',
        dbody,
    )
    for num, count in Counter(nums).items():
        if count >= 2:
            errors.append(
                f"duplicate criterion number {num!r} x{count} in #diagnostico of {slug}"
            )
    gpos = dbody.find('class="criteria-grid"')
    if gpos == -1:
        gpos = dbody.find("class='criteria-grid'")
    if gpos != -1 and "criterion-card" in dbody:
        grid_start = dbody.rfind("<div", 0, gpos + 1)
        if grid_start != -1:
            gt = dbody.find(">", grid_start)
            depth = 1
            i = gt + 1
            grid_end = -1
            while i < len(dbody) and depth > 0:
                no = dbody.find("<div", i)
                nc = dbody.find("</div>", i)
                if nc == -1:
                    break
                if no != -1 and no < nc:
                    depth += 1
                    i = no + 4
                else:
                    depth -= 1
                    i = nc + len("</div>")
                    if depth == 0:
                        grid_end = i
                        break
            if grid_end != -1:
                outside = dbody[:grid_start] + dbody[grid_end:]
                if "criterion-card" in outside:
                    errors.append(
                        f"orphan criterion-card outside .criteria-grid in #diagnostico of {slug}"
                    )
    return errors


BAD_FIXTURE = """
<section id="diagnostico">
<div class="criteria-grid">
<div class="criterion-card"><span>01</span><div><h3>A</h3><p>ok</p></div></div>
<div class="criterion-card"><span>02</span><div><h3>B</h3><p>ok</p></div></div>
</div>
<div class="criterion-card"><span>02</span><div><h3>Consequências sobre preço</h3><p>leftover</p></div></div>
<div class="criterion-card"><span>03</span><div><h3>Solução técnica</h3><p>leftover</p></div></div>
</section>
"""


def main() -> int:
    bad = structural_errors(BAD_FIXTURE, "bad-fixture")
    assert any("duplicate criterion number" in e for e in bad), bad
    assert any("orphan criterion-card" in e for e in bad), bad
    print("FIXTURE_FAILS_AS_EXPECTED", bad)

    ad_path = ROOT / "conteudos/aditivo-qualitativo-quantitativo/index.html"
    ad = ad_path.read_text(encoding="utf-8")
    good = structural_errors(ad, "aditivo-qualitativo-quantitativo")
    assert good == [], good

    body = re.search(
        r'id=["\']diagnostico["\'][^>]*>(.*?)</section>', ad, re.S | re.I
    )
    assert body, "missing #diagnostico"
    nums = re.findall(
        r'criterion-card[^>]*>\s*<span>([^<]+)</span>', body.group(1)
    )
    h3s = [
        re.sub(r"<[^>]+>", "", h).strip()
        for h in re.findall(r"<h3>(.*?)</h3>", body.group(1), re.S)
    ]
    assert nums == ["01", "02", "03", "04"], nums
    assert "Consequências sobre preço" not in body.group(1)
    assert "Solução técnica" not in body.group(1)
    assert h3s == [
        "Natureza da alteração",
        "Base de cálculo do limite",
        "Formação de preço",
        "Prova e formalização",
    ], h3s
    print("ADITIVO_CLEAN", nums, h3s)
    print("CRITERION_STRUCTURE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
