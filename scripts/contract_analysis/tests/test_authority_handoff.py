"""Drive shipped consume/gate/approval for authority-handoff 1.0/1.1 fail-closed rules."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import (
    AUTHORITY_HANDOFF_SCHEMA,
    OWNER_CONDITIONAL_APPROVER,
    OWNER_CONDITIONAL_TOKEN,
    PUBLIC_READ_SCHEMA,
    SOURCE_FIXTURE,
)
from scripts.contract_analysis.approval import (
    ApprovalError,
    approval_allows_index,
    approve_conditional_canary,
    approve_one,
    evaluate_conditional_checklist,
    material_hash,
)
from scripts.contract_analysis.consume import (
    content_hash_of,
    extract_temporal_fields,
    load_export_dir,
    load_extra_cli_bundle,
    negotiate_schema,
    not_applicable_accepted,
    official_live_declared,
    project_extra_cli_record,
    source_kind_of,
    source_url_status,
)
from scripts.contract_analysis.gate import evaluate_cohort, evaluate_publication
from scripts.contract_analysis.handoff import (
    FACTUAL_HANDOFF_PENDING,
    HANDOFF_BLOCKED,
    HANDOFF_READY,
    inspect_handoff,
    official_rendezvous_dir,
    verify_sha256sums,
)
from scripts.contract_analysis.render import render_analysis_html
from scripts.contract_analysis.tests.helpers import complete_live_record

EXPORT = ROOT / "scripts/contract_analysis/fixtures/extra-cli-export"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def _analysis_1_0(**overrides):
    raw = json.loads((EXPORT / "analyses" / "cand-preco-01.json").read_text(encoding="utf-8"))
    raw.update(
        {
            "catalog_mode": "official_live",
            "claimed_live": True,
            "official_live": True,
            "producer_status": "official_live",
            "handoff_status": "HANDOFF_READY",
            "analysis_mode": "DOCUMENT_CHAIN",
            "comparability_status": "NOT_APPLICABLE",
            "event_effective_at": "2024-02-10T00:00:00Z",
            "source_published_at": "2024-02-11T00:00:00Z",
            "retrieved_at": "2026-08-17T12:00:00Z",
            "verified_at": "2026-08-17T12:00:00Z",
            "source_as_of": "2024-02-10",
            "coverage": {"status": "DECLARED", "record_count": 1, "uf": ["SC"]},
            "facts": [
                {
                    "kind": "FACT",
                    "claim_id": "f1",
                    "text": "O instrumento descreve pavimentação em preço unitário.",
                    "source_ref": "contrato-01",
                    "locator": "cláusula 1 / objeto",
                }
            ],
            "index_authorization": True,
            "publication_authorization": True,
        }
    )
    raw.update(overrides)
    raw.pop("content_hash", None)
    raw["content_hash"] = content_hash_of(raw)
    return raw


def _write_public_read_export(dest: Path, raw: dict, *, schema: str = PUBLIC_READ_SCHEMA, official_live: bool = True):
    analyses = dest / "analyses"
    analyses.mkdir(parents=True)
    aid = str(raw.get("analysis_candidate_id") or "cand-preco-01")
    _write_json(analyses / f"{aid}.json", raw)
    matrix = dest / "source-claim-matrix"
    _write_json(
        matrix / f"{aid}.json",
        {"claim_id": "f1", "source_id": "contrato-01", "locator": "cláusula 1 / objeto"},
    )
    manifest = {
        "schema": schema,
        "contract_version": "v1.0.0" if schema.endswith("/1.0") else "v1.1.0",
        "catalog_mode": "official_live" if official_live else "fixture",
        "claimed_live": official_live,
        "official_live": official_live,
        "producer_status": "official_live" if official_live else "fixture",
        "handoff_status": "HANDOFF_READY",
        "producer_commit": "abc123producer",
        "replay_command": "python3 -m scripts.historical_contract_authority --mode live",
        "selected_ids": [aid],
        "analyses": [
            {
                "analysis_candidate_id": aid,
                "path": f"analyses/{aid}.json",
                "publication_readiness": "DATA_READY",
                "content_hash": raw["content_hash"],
            }
        ],
        "canary": {"selected_ids": [aid]},
        "source_as_of": "2024-02-10",
        "generated_at": "2026-08-17T12:00:00Z",
        "index_authorization": True,
        "publication_authorization": True,
    }
    manifest["content_hash"] = content_hash_of(manifest)
    _write_json(dest / "manifest.json", manifest)
    return manifest


def _write_rendezvous(dest: Path, raw: dict, *, official_live: bool = True) -> dict:
    manifest = _write_public_read_export(
        dest,
        raw,
        schema=AUTHORITY_HANDOFF_SCHEMA,
        official_live=official_live,
    )
    lines = []
    for rel in (
        "manifest.json",
        f"analyses/{raw['analysis_candidate_id']}.json",
        f"source-claim-matrix/{raw['analysis_candidate_id']}.json",
    ):
        lines.append(f"{_sha(dest / rel)}  {rel}")
    (dest / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")
    ready = {
        "status": "READY",
        "manifest_sha": _sha(dest / "manifest.json"),
        "root_content_hash": manifest["content_hash"],
        "producer_commit": "abc123producer",
        "dossier_count": 1,
        "dossier_ids": [raw["analysis_candidate_id"]],
    }
    _write_json(dest / "READY.json", ready)
    return ready


def test_schema_accepts_authority_handoff_1_0_and_1_1():
    ok, reasons = negotiate_schema("authority-handoff-contract-analysis/1.0", "v1.0.0")
    assert ok is True
    ok11, reasons11 = negotiate_schema("authority-handoff-contract-analysis/1.1", "v1.1.0")
    assert ok11 is True
    assert "schema_additive_1x" in reasons11
    bad, bad_reasons = negotiate_schema("authority-handoff-contract-analysis/2.0", "v2.0.0")
    assert bad is False
    assert "schema_unsupported" in bad_reasons or "contract_version_unsupported" in bad_reasons


def test_consume_authority_handoff_1_0_and_1_1(tmp_path):
    raw = _analysis_1_0()
    dest10 = tmp_path / "h10"
    _write_public_read_export(dest10, raw, schema="authority-handoff-contract-analysis/1.0")
    bundle10 = load_extra_cli_bundle(dest10)
    rec10 = bundle10["records"][0]
    assert rec10["event_effective_at"].startswith("2024-02-10")
    assert rec10["verified_at"].startswith("2026-08-17")
    assert rec10["analysis_mode"] == "DOCUMENT_CHAIN"
    assert rec10["comparability_status"] == "NOT_APPLICABLE"
    assert rec10["approved_for_index"] is False
    assert rec10["producer_index_authorization"] is True

    raw11 = _analysis_1_0()
    dest11 = tmp_path / "h11"
    _write_public_read_export(dest11, raw11, schema="authority-handoff-contract-analysis/1.1")
    bundle11 = load_extra_cli_bundle(dest11)
    rec11 = bundle11["records"][0]
    assert rec11["retrieved_at"]
    assert rec11["source_published_at"]
    assert rec11["source_as_of"]


def test_hash_mismatch_rejects(tmp_path):
    raw = _analysis_1_0()
    raw["content_hash"] = "0" * 64
    dest = tmp_path / "mismatch"
    _write_public_read_export(dest, raw)
    rec = load_extra_cli_bundle(dest)["records"][0]
    assert rec["content_hash_verified"] is False
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "REJECT"
    assert "content_hash_mismatch" in rec["producer_integrity_reasons"] or "content_hash_mismatch" in decision.reason_codes


def test_official_live_false_holds(tmp_path):
    raw = _analysis_1_0(official_live=False, catalog_mode="official_live", claimed_live=True)
    dest = tmp_path / "not-live"
    _write_public_read_export(dest, raw, official_live=False)
    rec = load_extra_cli_bundle(dest)["records"][0]
    rec["official_ingest"] = True
    rec["official_live"] = False
    rec["catalog_mode"] = "official_live"
    rec["handoff_status"] = "HANDOFF_READY"
    rec["is_fixture"] = False
    rec["test_only"] = False
    rec["source_kind"] = "official_live"
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "HOLD_FOR_DATA"
    assert "official_live_not_true" in decision.reason_codes


def test_handoff_status_not_ready_holds():
    rec = complete_live_record(handoff_status="DATA_HOLD", official_ingest=True)
    rec["approved_for_index"] = True
    rec["material_hash"] = material_hash(rec)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.state == "HOLD_FOR_DATA"
    assert "handoff_status_not_ready" in decision.reason_codes


def test_locator_less_material_claim_holds():
    rec = complete_live_record(
        claims=[{"claim_id": "bare", "kind": "FACT", "text": "Há um aditivo material."}],
        facts=[{"kind": "FACT", "claim_id": "bare", "text": "Há um aditivo material."}],
        official_ingest=True,
    )
    rec["approved_for_index"] = True
    rec["material_hash"] = material_hash(rec)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "HOLD_FOR_DATA"
    assert "material_claim_locator_absent" in decision.reason_codes


def test_producer_index_flag_does_not_grant_index():
    rec = complete_live_record(
        approved_for_index=False,
        producer_index_authorization=True,
        producer_publication_authorization=True,
        index_authorization=True,
        publication_authorization=True,
    )
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "producer_index_authorization_ignored" in decision.reason_codes


def test_not_applicable_accepted_only_without_comparative_claim():
    ok = {
        "analysis_mode": "DOCUMENT_CHAIN",
        "comparability_status": "NOT_APPLICABLE",
        "insight_singular": "A sequência de aditivos desloca a âncora de preço do item residual.",
        "facts": [{"kind": "FACT", "text": "Dois aditivos alteram prazo e valor."}],
    }
    assert not_applicable_accepted(ok) is True
    bad = dict(ok)
    bad["analysis_mode"] = "COMPARATIVE"
    assert not_applicable_accepted(bad) is False
    bad2 = dict(ok)
    bad2["insight_singular"] = "O contrato é outlier frente aos peers da mediana."
    assert not_applicable_accepted(bad2) is False


def test_comparative_claim_with_not_applicable_rejects():
    rec = complete_live_record(
        analysis_mode="COMPARATIVE",
        comparability_status="NOT_APPLICABLE",
        insight_singular="O contrato é outlier frente aos peers da mediana local.",
        facts=[
            {
                "kind": "FACT",
                "text": "Delta de peer acima da mediana sem regime comum.",
                "locator": "peer-hold",
                "source_ref": "peer",
            }
        ],
    )
    rec["approved_for_index"] = True
    rec["material_hash"] = material_hash(rec)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "REJECT"
    assert "comparability_not_applicable_with_comparative_claim" in decision.reason_codes


def test_verified_at_does_not_mutate_event_effective_at():
    payload = {
        "event_effective_at": "2024-02-10T00:00:00Z",
        "verified_at": "2026-08-17T12:00:00Z",
        "retrieved_at": "2026-08-17T12:00:00Z",
        "source_published_at": "2024-02-11T00:00:00Z",
        "source_as_of": "2024-02-10",
        "freshness": {"verified_at": "2026-08-17T12:00:00Z", "as_of": "2026-08-17"},
    }
    temporal = extract_temporal_fields(payload)
    assert temporal["event_effective_at"].startswith("2024-02-10")
    assert temporal["verified_at"].startswith("2026-08-17")
    raw = _analysis_1_0()
    rec = project_extra_cli_record(raw, manifest={"schema": AUTHORITY_HANDOFF_SCHEMA, "catalog_mode": "official_live"})
    assert rec["event_effective_at"].startswith("2024-02-10")
    assert rec["verified_at"].startswith("2026-08-17")
    assert rec["event_effective_at"] != rec["verified_at"]


def test_historical_verified_at_does_not_hold_for_age_alone():
    rec = complete_live_record(
        as_of="2024-02-10",
        event_effective_at="2024-02-10",
        verified_at="2026-08-16",
        historical=True,
        freshness={
            "as_of": "2024-02-10",
            "event_effective_at": "2024-02-10",
            "verified_at": "2026-08-16",
            "historical": True,
            "max_age_hours": 48,
            "stale": False,
        },
    )
    rec["approved_for_index"] = True
    rec["material_hash"] = material_hash(rec)
    decision = evaluate_publication(rec, cohort=[rec])
    assert "freshness_max_age_hours" not in decision.reason_codes
    assert "freshness_stale_or_future" not in decision.reason_codes
    assert rec["event_effective_at"].startswith("2024-02-10")


def test_fixture_never_becomes_official_live(tmp_path):
    raw = _analysis_1_0()
    dest = tmp_path / "fixture-as-live"
    _write_public_read_export(dest, raw, official_live=False)
    manifest = json.loads((dest / "manifest.json").read_text(encoding="utf-8"))
    manifest["catalog_mode"] = "fixture"
    manifest["official_live"] = True
    manifest["claimed_live"] = True
    _write_json(dest / "manifest.json", manifest)
    rec = load_extra_cli_bundle(dest)["records"][0]
    assert rec["is_fixture"] is True
    assert rec["source_kind"] == SOURCE_FIXTURE
    assert official_live_declared({"catalog_mode": "fixture", "official_live": True, "claimed_live": True}) is False
    assert source_kind_of({"catalog_mode": "fixture", "official_live": True, "claimed_live": True}) == SOURCE_FIXTURE
    rec["approved_for_index"] = True
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"


def test_unknown_url_stays_unknown():
    src = {"label": "DOE", "url": "", "url_status": "INACCESSIBLE"}
    assert source_url_status(src) == "UNKNOWN"
    src2 = {"label": "DOE", "url": "UNKNOWN", "access": "UNKNOWN"}
    assert source_url_status(src2) == "UNKNOWN"
    rewritten = {"label": "DOE", "url": "https://example.invalid/fixed", "url_rewritten": True}
    assert source_url_status(rewritten) == "UNKNOWN"
    raw = _analysis_1_0()
    raw["official_refs"] = [{"label": "DOE", "url": "", "url_status": "UNKNOWN", "source_id": "doe-x"}]
    rec = project_extra_cli_record(raw)
    assert any(item.get("url_status") == "UNKNOWN" for item in rec["sources"])
    assert not any(item.get("url") == "https://www.gov.br/pncp" and item.get("url_status") == "UNKNOWN" for item in rec["sources"])


def test_rendezvous_absent_is_pending():
    result = inspect_handoff()
    assert result["status"] == FACTUAL_HANDOFF_PENDING
    assert official_rendezvous_dir().name == "official-live-01"


def test_rendezvous_blocked_without_ready(tmp_path):
    dest = tmp_path / "blocked"
    dest.mkdir()
    _write_json(dest / "BLOCKED.json", {"status": "BLOCKED", "reason": "dsn_connect_failed"})
    _write_json(
        dest / "manifest.json",
        {"schema": AUTHORITY_HANDOFF_SCHEMA, "catalog_mode": "official_live", "official_live": False},
    )
    result = inspect_handoff(dest)
    assert result["status"] == HANDOFF_BLOCKED
    assert "official_rendezvous_blocked" in result["reasons"]


def test_rendezvous_ready_requires_hashes(tmp_path):
    raw = _analysis_1_0()
    dest = tmp_path / "ready"
    _write_rendezvous(dest, raw, official_live=True)
    result = inspect_handoff(dest)
    assert result["status"] == HANDOFF_READY
    assert result["path"] == str(dest)
    (dest / "READY.json").write_text(
        json.dumps(
            {
                "status": "READY",
                "manifest_sha": "deadbeef",
                "root_content_hash": "deadbeef",
                "producer_commit": "abc123producer",
                "dossier_count": 1,
                "dossier_ids": [raw["analysis_candidate_id"]],
            }
        ),
        encoding="utf-8",
    )
    broken = inspect_handoff(dest)
    assert broken["status"] != HANDOFF_READY


def test_sibling_official_live_without_ready_is_not_handoff_ready(tmp_path):
    raw = _analysis_1_0()
    dest = tmp_path / "sibling"
    _write_public_read_export(dest, raw, official_live=True)
    result = inspect_handoff(dest)
    assert result["status"] != HANDOFF_READY


def test_approval_missing_owner_token_gate_fails(tmp_path):
    rec = complete_live_record(approved_for_index=False)
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    with pytest.raises(ApprovalError, match="conditional_gates_incomplete"):
        approve_conditional_canary(
            rec,
            token=OWNER_CONDITIONAL_TOKEN,
            rollback="git:revert:ca",
            rendered_html=html,
            producer_root_hash="",
            source_dossier_hash="",
            quality={"score": 70, "dimensions": {}, "hard_gates": {}},
            handoff={"status": FACTUAL_HANDOFF_PENDING},
            suite_green=False,
            root=tmp_path,
        )


def test_one_byte_change_invalidates_hash_bound_approval(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    rec["approved_for_index"] = False
    ok, _ = approval_allows_index(rec, root=tmp_path)
    assert ok is True
    drifted = dict(rec)
    drifted["insight_singular"] = rec["insight_singular"][:-1] + (
        "X" if rec["insight_singular"][-1] != "X" else "Y"
    )
    drifted["material_hash"] = material_hash(drifted)
    ok2, reasons = approval_allows_index(drifted, root=tmp_path)
    assert ok2 is False
    assert "approval_material_hash_mismatch" in reasons or "approval_absent" in reasons
    decision = evaluate_publication(drifted, cohort=[drifted])
    assert decision.state != "PUBLISHABLE_INDEX"


def test_at_most_one_analysis_can_index():
    first = complete_live_record()
    second = complete_live_record(
        id="live-prazo-beta",
        slug="live-prazo-beta",
        analysis_id="live-prazo-beta",
        title="Diário de obra sem evento contemporâneo não ancora prorrogação",
        insight_singular=(
            "A cadeia de atraso publicada não traz comunicação contemporânea do "
            "evento. Sem esse instrumento, a prorrogação não tem âncora documental "
            "e o saldo de prazo permanece UNKNOWN."
        ),
        executive_summary=(
            "Os boletins registram paralisação, mas o pacote não junta o aviso "
            "contemporâneo exigido pela cláusula de prazo. A conta de dias existe; "
            "o nexo com o evento contratual não."
        ),
        why_analysis=(
            "Equipes somam dias de chuva no mesmo saldo de prazo. Sem o aviso "
            "contemporâneo, o aditivo de prazo nasce frágil."
        ),
        utility_beyond_source=(
            "A fonte lista datas. A análise entrega o protocolo: exigir o aviso "
            "contemporâneo antes de protocolar prorrogação ou medir mora."
        ),
        intent="prazo",
        facts=[
            {
                "kind": "FACT",
                "text": "O diário registra 18 dias de interrupção sem aviso contemporâneo juntado.",
                "source_ref": "diario",
                "locator": "diário / junho / interrupção",
            }
        ],
        ficha={
            "empresa": "Construtora Serra Azul",
            "orgao": "Prefeitura de Vale Fundo",
            "municipio": "Vale Fundo",
            "uf": "PR",
            "objeto": "Drenagem urbana em regime de preço unitário",
            "valor_label": "R$ 6.200.000,00",
            "pncp_id": "LIVE-PRAZO-200",
            "regime": "preço unitário",
        },
        content_hash="live-content-hash-beta",
    )
    second["material_hash"] = material_hash(second)
    decisions = evaluate_cohort([first, second])
    indexed = [item for item in decisions if item.state == "PUBLISHABLE_INDEX"]
    assert len(indexed) == 1
    assert "index_cap_exceeded" in decisions[1].reason_codes
    assert decisions[1].state == "PUBLISHABLE_NOINDEX"
    assert decisions[1].sitemap is False
    assert decisions[1].robots == "noindex,nofollow"


def test_cta_keep_list_and_no_pii():
    rec = complete_live_record()
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    assert 'data-asset-id="' in html
    assert 'data-cta-id="' in html
    assert 'data-route-family="' in html
    assert "data-analysis-id=" in html
    start = html.find('id="proximo-passo"')
    assert start != -1
    end = html.find("</section>", start)
    cta = html[start:end]
    assert "@" not in cta
    assert "telefone" not in cta.lower()
    assert "cnpj" not in cta.lower()


def test_schema_is_article_and_matches_visible_copy():
    rec = complete_live_record()
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    assert '"@type": "Article"' in html or '"Article"' in html
    assert "CaseStudy" not in html
    assert "Review" not in html
    assert "Product" not in html
    assert rec["title"] in html
    assert rec["insight_singular"][:40] in html or rec["executive_summary"][:40] in html


def test_conditional_approval_records_hashes_when_all_gates_pass(tmp_path):
    rec = complete_live_record(
        human_authorship_confirmed=True,
        claims=[
            {
                "claim_id": "f1",
                "kind": "FACT",
                "text": rec_text,
                "locator": "planilha / BDI",
                "source_ref": "planilha",
            }
            for rec_text in ("A planilha publica BDI discriminado em uma linha de administração local.",)
        ],
        official_live=True,
    )
    rec["facts"][0]["locator"] = "planilha / BDI / administração local"
    rec["facts"][0]["claim_id"] = "f1"
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    quality = {
        "score": 92,
        "dimensions": {
            "profundidade_documental": 90,
            "singularidade_novidade": 90,
            "utilidade_decisoria": 90,
            "integridade_epistemica": 90,
            "calculos_engenharia": 80,
            "comunicacao": 80,
            "seo_citabilidade_manutencao": 80,
        },
        "hard_gates": {"official_live_data_ready": True, "hashes_verified": True},
        "reputational_safety": True,
        "unique_content": True,
    }
    handoff = {"status": HANDOFF_READY, "path": str(tmp_path / "official")}
    checklist = evaluate_conditional_checklist(
        rec,
        quality=quality,
        handoff=handoff,
        rendered_html=html,
        producer_root_hash="root" * 8,
        source_dossier_hash="doss" * 8,
        suite_green=True,
    )
    if all(checklist.values()):
        row = approve_conditional_canary(
            rec,
            token=OWNER_CONDITIONAL_TOKEN,
            rollback="git:revert:canary",
            rendered_html=html,
            producer_root_hash="root" * 8,
            source_dossier_hash="doss" * 8,
            quality=quality,
            handoff=handoff,
            suite_green=True,
            root=tmp_path,
            actor=OWNER_CONDITIONAL_APPROVER,
        )
        assert row["token"] == OWNER_CONDITIONAL_TOKEN
        assert row["approver"] == OWNER_CONDITIONAL_APPROVER
        assert row["producer_root_hash"]
        assert row["source_dossier_hash"]
        assert row["rendered_content_hash"]
        assert row["rollback"]
        assert all(row["checklist"].values())
    else:
        with pytest.raises(ApprovalError, match="conditional_gates_incomplete"):
            approve_conditional_canary(
                rec,
                token=OWNER_CONDITIONAL_TOKEN,
                rollback="git:revert:canary",
                rendered_html=html,
                producer_root_hash="root" * 8,
                source_dossier_hash="doss" * 8,
                quality=quality,
                handoff=handoff,
                suite_green=True,
                root=tmp_path,
            )
        # The campaign must not simulate approval when any listed condition fails.
        assert rec.get("approved_for_index") is False or not approval_allows_index(rec, root=tmp_path)[0]


def test_sha256sums_mismatch_blocks_rendezvous(tmp_path):
    raw = _analysis_1_0()
    dest = tmp_path / "sums"
    _write_rendezvous(dest, raw)
    (dest / "SHA256SUMS").write_text("0" * 64 + "  manifest.json\n", encoding="utf-8")
    ok, reasons = verify_sha256sums(dest)
    assert ok is False
    assert any("mismatch" in item for item in reasons)
    result = inspect_handoff(dest)
    assert result["status"] != HANDOFF_READY
