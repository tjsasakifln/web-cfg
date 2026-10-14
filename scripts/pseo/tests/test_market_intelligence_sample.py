from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from scripts.pseo import build as pseo_build
from scripts.pseo import market_intelligence_sample as sample


ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "data" / "pseo" / "market-intelligence-sample.v1.json"
MANIFEST = ROOT / "data" / "pseo" / "market-intelligence-verification.v1.json"


def test_snapshot_is_contract_grain_and_recomputes_the_approved_result():
    raw = SNAPSHOT.read_text(encoding="utf-8")
    data = sample.load_snapshot(SNAPSHOT)

    assert data["grain"] == "one PNCP contract"
    assert data["as_of"] == "2026-10-14"
    assert len(data["contracts"]) == 10
    assert data["summary"] == {
        "contracts": 10,
        "distinct_buyer_cnpjs": 10,
        "distinct_supplier_nis": 10,
        "signature_window": {"from": "2026-08-21", "to": "2026-10-09"},
        "publication_lag_days": {"min": 0, "max": 49},
        "term_days": {"min": 89, "max": 913},
        "category_counts": {"Obras": 4, "Serviços": 3, "Serviços de Engenharia": 2, "Compras": 1},
        "buyer_uf_counts": {"SP": 3, "MG": 2, "BA": 1, "PA": 1, "RO": 1, "RS": 1, "SC": 1},
        "aggregate_integral_value_brl": 41446506.23,
    }
    assert data["lineage"]["selection_release_sha"] == "14c8b2473c4e52566a7fed96c45057bd3214a2fe"
    assert data["lineage"]["verification_interface"].startswith("PNCP official contract API")
    assert "source_extract" not in raw.lower()
    assert "public_read_v1" not in raw.lower()


def test_snapshot_fails_closed_if_a_contract_changes_without_a_new_approval(tmp_path: Path):
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    data["contracts"][0]["value_global_brl"] += 1
    changed = tmp_path / SNAPSHOT.name
    changed.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    shutil.copyfile(MANIFEST, tmp_path / MANIFEST.name)

    with pytest.raises(sample.SampleError, match="snapshot fields diverge"):
        sample.load_snapshot(changed)


def test_snapshot_fails_closed_if_the_independent_manifest_changes(tmp_path: Path):
    shutil.copyfile(SNAPSHOT, tmp_path / SNAPSHOT.name)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["coverage"]["http_200"] = 9
    (tmp_path / MANIFEST.name).write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(sample.SampleError, match="manifest canonical hash"):
        sample.load_snapshot(tmp_path / SNAPSHOT.name)


def test_renderer_writes_two_source_linked_analyses_without_human_authorship(tmp_path: Path):
    target_snapshot = tmp_path / "data" / "pseo" / SNAPSHOT.name
    target_snapshot.parent.mkdir(parents=True)
    shutil.copyfile(SNAPSHOT, target_snapshot)
    shutil.copyfile(MANIFEST, target_snapshot.parent / MANIFEST.name)
    snapshot_data = sample.load_snapshot(target_snapshot)
    snapshot_digest = sample._canonical_sha256(snapshot_data)

    written = sample.render_all(root=tmp_path, capture_factory=pseo_build._market_intelligence_capture)
    assert written == [
        "inteligencia/relacoes-compradores-fornecedores/index.html",
        "inteligencia/composicao-contratos-amostra/index.html",
    ]

    for route in sample.ROUTES:
        html = (tmp_path / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert 'content="index,follow" name="robots"' in html
        assert html.count("<form") == 1
        assert html.count('id="captura-estudo"') == 1
        assert 'name="analysis_cutoff" value="2026-10-14"' in html
        assert 'name="evidence_pack_version" value="market-intelligence-sample.v1"' in html
        assert 'name="source_cutoff"' not in html
        assert 'name="source_version"' not in html
        assert 'data-runtime-profile="shared_lead_form_v1"' in html
        assert 'id="estagio" type="hidden" name="estagio" value="pesquisa de mercado"' in html
        assert 'id="jornada-hidden" type="hidden" name="jornada" value="outro"' in html
        assert 'class="form-hint form-nojs-note"' in html
        assert 'id="turnstile-slot"' in html
        assert 'data-turnstile-sitekey=""' in html
        assert 'data-market-sample-version="market-intelligence-sample.v1"' in html
        assert 'data-market-sample-as-of="2026-10-14"' in html
        assert f'data-market-sample-sha256="{snapshot_digest}"' in html
        assert '<meta content="Engº Tiago Sasaki" name="author"/>' not in html
        assert '"@type":"Person"' not in html
        assert 'class="author-box"' not in html
        assert html.count("Abrir contrato no PNCP") >= 10
        assert "carteira de clientes" in html
        assert "revisão exploratória de 26 CNPJs" in html
        assert "não registra uma regra reproduzível" in html
        assert '"spatialCoverage":"Brasil"' not in html
        assert "public_read_v1" not in html
        assert "source_extract" not in html
        assert "human_review" not in html

    relations = (tmp_path / sample.RELATIONS_ROUTE.strip("/") / "index.html").read_text(encoding="utf-8")
    assert "interesse comercial" in relations
    assert "oportunidade de subcontratação" in relations
    assert "Papel observado neste contrato" in relations
    assert "Razão de inclusão na comparação" in relations
    assert "O que ainda pesquisar" in relations
    assert "Categoria igual não significa papel comercial igual" in relations
    assert "distribuidor, integrador, instalador ou mantenedor" in relations
    composition = (tmp_path / sample.COMPOSITION_ROUTE.strip("/") / "index.html").read_text(encoding="utf-8")
    assert "R$ 41.446.506,23" in composition
    assert "89 a 913 dias" in composition
    assert "0 a 49 dias" in composition
    assert "não sustenta tendência histórica, previsão, TAM, market share" in composition
    assert "“Compras” pode conter engenharia" in composition
    assert "UF do comprador não resolve o local" in composition
    assert "81,0% da soma integral desta amostra" in composition
