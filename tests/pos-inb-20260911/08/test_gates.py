"""Campaign-08 ownership: drive the shipped generator, extracts and public files."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.demonstrative.infrastructure_pilot.derive import (  # noqa: E402
    PROBLEM_OMITTED_PUBLIC_RESOURCE,
    PROBLEM_REVISION_DRIFT,
    PROBLEM_UNIT_INCONSISTENT,
    PUBLIC_DIR_REL,
    derive,
    load_source,
    verify,
    verify_declared_assets,
)
from scripts.demonstrative.infrastructure_pilot.generate import generate  # noqa: E402
from scripts.demonstrative.infrastructure_pilot.render import PAGE_H1, write_outputs  # noqa: E402
from tests.demonstrative_infrastructure.reference import compute  # noqa: E402


def test_shipped_generator_matches_independent_reference() -> None:
    source = load_source(root=ROOT)
    extracts = derive(source)
    expected = compute(source)
    assert verify(source, extracts) == []
    assert extracts["named_totals"]["pavement_area_m2"] == format(expected["pavement_area_m2"], "f")
    assert extracts["named_totals"]["pipe_length_m"] == format(expected["pipe_length_m"], "f")
    assert extracts["named_totals"]["mh02_mismatch_r00_m"] == format(expected["mh02_mismatch_r00_m"], "f")


def test_generate_writes_every_declared_public_file() -> None:
    result = generate(ROOT)
    extracts = result["extracts"]
    assert verify_declared_assets(ROOT, extracts) == []
    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    assert PAGE_H1 in html
    assert "não servem para execução" in html.lower()
    assert "hipotétic" in html.lower()
    consumption = json.loads(
        (ROOT / "data/demonstrative/infrastructure-pilot/consumption.v1.json").read_text(encoding="utf-8")
    )
    public_urls = {asset["url"] for asset in consumption["assets"]}
    for asset in consumption["assets"]:
        path = ROOT / asset["path"]
        assert path.is_file(), asset["path"]
        assert asset["url"] in public_urls
        assert not str(asset["path"]).startswith("docs/")


def test_gate_units_revision_omitted_and_not_client(tmp_path: Path) -> None:
    source = load_source(root=ROOT)
    extracts = copy.deepcopy(derive(source))
    extracts["quantity_rows"][0]["unit"] = "yd2"
    assert PROBLEM_UNIT_INCONSISTENT in verify(source, extracts)

    drifted = copy.deepcopy(derive(source))
    drifted["revision"] = "R99"
    assert PROBLEM_REVISION_DRIFT in verify(source, drifted)

    written = write_outputs(tmp_path, derive(source))
    written["perfil-r00"].unlink()
    assert PROBLEM_OMITTED_PUBLIC_RESOURCE in verify_declared_assets(tmp_path, derive(source))

    html = (ROOT / PUBLIC_DIR_REL / "index.html").read_text(encoding="utf-8")
    lowered = html.lower()
    assert "caso de cliente" not in lowered
    assert "cliente real" not in lowered
    assert "loteadora horizonte" not in lowered
    assert 'data-permission-class="demonstrativo"' in html
