import copy
import shutil
from datetime import date
from pathlib import Path

import pytest

from scripts.site.inbound_gates import IndexationContext, _sub_official_live, archetype_editorial_ready_for_family, validate_index_evidence_declarations

ROOT = Path(__file__).resolve().parents[3]
FAMILY = {"id": "inteligencia-climatizacao"}
ROUTE = "/inteligencia/fornecedores-climatizacao-contratos-publicos/"


def test_live_evidence_requires_pinned_manifest_and_rendered_identity(tmp_path):
    target = tmp_path / "data/pseo"
    target.mkdir(parents=True)
    for name in ("climatizacao-sample.v1.json", "climatizacao-verification.v1.json"):
        shutil.copyfile(ROOT / "data/pseo" / name, target / name)
    html = (ROOT / ROUTE.strip("/") / "index.html").read_text(encoding="utf-8")
    context = IndexationContext(base=tmp_path, today=date(2026, 10, 14))
    assert _sub_official_live(ROUTE, html, FAMILY, context).passed
    family = {**FAMILY, "profile": "commercial_content", "visitor_job": "Compare documented suppliers before requesting a selection."}
    _, result = archetype_editorial_ready_for_family(family, [(ROUTE, html)], context)
    assert result["subgates"]["specific_value"]["passed"]
    assert not _sub_official_live(ROUTE, html.replace('data-sector-sample-version="climatizacao-sample.v1"', 'data-sector-sample-version="invented.v2"'), FAMILY, context).passed
    (target / "climatizacao-verification.v1.json").unlink()
    assert not _sub_official_live(ROUTE, html, FAMILY, context).passed


def test_sector_records_cannot_exempt_their_official_sources():
    family = copy.deepcopy(FAMILY)
    family["index_evidence"] = {
        "substrate": "first_party_publication", "not_applicable": ["official_live", "citable_source"],
        "reason": "A publication label cannot replace source verification.",
        "authority": ["data/pseo/climatizacao-sample.v1.json"],
        "declared_at": "2026-10-14", "owner_issue": 61,
    }
    with pytest.raises(SystemExit, match="may never declare first_party_publication"):
        validate_index_evidence_declarations([family])
