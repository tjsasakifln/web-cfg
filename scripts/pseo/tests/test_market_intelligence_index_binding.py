import copy
import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from scripts.site.inbound_gates import (
    IndexationContext, _sub_official_live, validate_index_evidence_declarations,
)

ROOT = Path(__file__).resolve().parents[3]
FAMILY = {"id": "inteligencia-amostras-reais"}
ROUTE = "/inteligencia/composicao-contratos-amostra/"


@pytest.fixture
def candidate(tmp_path):
    directory = tmp_path / "data/pseo"
    directory.mkdir(parents=True)
    for name in ("market-intelligence-sample.v1.json", "market-intelligence-verification.v1.json"):
        shutil.copyfile(ROOT / "data/pseo" / name, directory / name)
    html = (ROOT / ROUTE.strip("/") / "index.html").read_text(encoding="utf-8")
    return tmp_path, html, IndexationContext(base=tmp_path, today=date(2026, 10, 14))


def test_independent_manifest_and_rendered_identity_are_required(candidate):
    root, html, context = candidate
    assert _sub_official_live(ROUTE, html, FAMILY, context).passed
    (root / "data/pseo/market-intelligence-verification.v1.json").unlink()
    assert not _sub_official_live(ROUTE, html, FAMILY, context).passed


def test_rendered_version_mismatch_fails_closed(candidate):
    _, html, context = candidate
    changed = html.replace('data-market-sample-version="market-intelligence-sample.v1"', 'data-market-sample-version="invented.v9"')
    assert changed != html
    assert not _sub_official_live(ROUTE, changed, FAMILY, context).passed


def test_mutated_public_claim_is_not_replaced_by_a_status_literal(candidate):
    root, html, context = candidate
    path = root / "data/pseo/market-intelligence-sample.v1.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["contracts"][0]["supplier"]["legal_name"] = "UNVERIFIED COMPANY"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    assert not _sub_official_live(ROUTE, html, FAMILY, context).passed


def test_external_sample_can_never_waive_its_sources():
    family = copy.deepcopy(FAMILY)
    family["index_evidence"] = {
        "substrate": "first_party_publication", "not_applicable": ["official_live", "citable_source"],
        "reason": "A label is not source proof.", "authority": ["data/pseo/market-intelligence-sample.v1.json"],
        "declared_at": "2026-10-14", "owner_issue": 61,
    }
    with pytest.raises(SystemExit, match="may never declare first_party_publication"):
        validate_index_evidence_declarations([family])
