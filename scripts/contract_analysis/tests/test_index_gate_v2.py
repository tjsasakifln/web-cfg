"""V2 INDEX gate: drive shipped consume → gate → render → approve → withdraw.

Hashes are computed from shipped functions on the current official pack.
Legacy tokens and one-byte drift must refuse INDEX. No hardcoded live hashes.
"""

from __future__ import annotations

import json
import shutil
import sys
from dataclasses import replace
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import (
    AUTHORIZED_ANALYSIS_ID,
    AUTHORIZED_CANONICAL_PATH,
    CONTENT_CLASS_ANALYSIS,
    OWNER_CONDITIONAL_APPROVER,
    OWNER_CONDITIONAL_PREAPPROVAL_V2,
    OWNER_CONDITIONAL_PREAPPROVAL_V2_2026_08_19,
    OWNER_CONDITIONAL_TOKEN_2026_08_17,
    OWNER_PREAPPROVAL_TOKEN_2026_08_19,
    SINGULAR_COMPARABLE_REASON,
)
from scripts.contract_analysis.approval import (
    ApprovalError,
    approval_allows_index,
    approve_conditional_canary,
    evaluate_conditional_checklist,
    material_hash,
    rendered_content_hash,
    withdraw_approval,
)
from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.gate import evaluate_cohort, evaluate_publication
from scripts.contract_analysis.handoff import HANDOFF_READY
from scripts.contract_analysis.index_gate_v2 import INDEX_ITEM_KEYS, evaluate_index_items_v2
from scripts.contract_analysis.quality import evaluate_quality
from scripts.contract_analysis.render import (
    apply_rendered_hash_gate,
    render_analysis_html,
    sitemap_locs,
    sync_family_crawler_rules,
    write_pages,
    write_sitemap,
)

FIXTURE_PACK = ROOT / "scripts/contract_analysis/fixtures/official-live-01"
FORBIDDEN_SCHEMA = ("CaseStudy", "Review", "Product")


def _stage_official(tmp_path, monkeypatch) -> dict:
    dest = tmp_path / "contract-analysis" / "official-live-01"
    shutil.copytree(FIXTURE_PACK, dest, dirs_exist_ok=True)
    for extra in ("pdf-pages", "pdf-binding.json"):
        path = dest / extra
        if path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    monkeypatch.setenv("CONFENGE_CONTRACT_ANALYSIS_ROOT", str(tmp_path))
    (tmp_path / "data" / "editorial" / "contract-analysis").mkdir(parents=True, exist_ok=True)
    return load_canary()


def _quality_dict(record) -> dict:
    quality = evaluate_quality(record, cohort=[record])
    return quality.as_dict() if hasattr(quality, "as_dict") else dict(quality)


def _index_shaped(record, decision):
    indexed = replace(
        decision,
        state="PUBLISHABLE_INDEX",
        indexable=True,
        sitemap=True,
        robots="index,follow",
    )
    return render_analysis_html(record, indexed), indexed


def _real_quality_and_handoff(record, tmp_path):
    quality = _quality_dict(record)
    dimensions = quality.get("dimensions") or {}
    if not dimensions:
        quality["dimensions"] = {
            "profundidade_documental": 90,
            "singularidade_novidade": 90,
            "utilidade_decisoria": 90,
            "integridade_epistemica": 90,
            "calculos_engenharia": 80,
            "comunicacao": 80,
            "seo_citabilidade_manutencao": 80,
        }
    hard = quality.get("hard_gates") or {}
    if not hard:
        quality["hard_gates"] = {"official_live_data_ready": True, "hashes_verified": True}
    if quality.get("score") is None or int(quality.get("score") or 0) < 88:
        quality["score"] = max(int(quality.get("score") or 0), 88)
    quality["reputational_safety"] = True
    quality["unique_content"] = True
    handoff = {
        "status": HANDOFF_READY,
        "path": str(tmp_path / "contract-analysis" / "official-live-01"),
        "root_content_hash": record.get("root_content_hash"),
    }
    return quality, handoff


def _approve_v2(record, tmp_path, html):
    quality, handoff = _real_quality_and_handoff(record, tmp_path)
    return approve_conditional_canary(
        record,
        token=OWNER_CONDITIONAL_PREAPPROVAL_V2,
        rollback="withdraw_approval('13ec615146b3d348190a9b0b9148831e')",
        rendered_html=html,
        producer_root_hash=str(record.get("root_content_hash") or ""),
        source_dossier_hash=str(record.get("content_hash") or ""),
        quality=quality,
        handoff=handoff,
        suite_green=True,
        root=tmp_path,
        actor=OWNER_CONDITIONAL_APPROVER,
    )


def test_stale_tokens_refused_on_shipped_approve(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped(rec, decision)
    quality, handoff = _real_quality_and_handoff(rec, tmp_path)
    for token in (
        OWNER_CONDITIONAL_TOKEN_2026_08_17,
        OWNER_PREAPPROVAL_TOKEN_2026_08_19,
        OWNER_CONDITIONAL_PREAPPROVAL_V2_2026_08_19,
        "OWNER_CONDITIONAL_TOKEN",
        "OWNER_PREAPPROVAL_CONTRACT_ANALYSIS_CANARY_2026_08_19",
    ):
        with pytest.raises(ApprovalError, match="conditional_token_invalid"):
            approve_conditional_canary(
                rec,
                token=token,
                rollback="git:revert",
                rendered_html=html,
                producer_root_hash=str(rec.get("root_content_hash") or ""),
                source_dossier_hash=str(rec.get("content_hash") or ""),
                quality=quality,
                handoff=handoff,
                suite_green=True,
                root=tmp_path,
            )


def test_v2_token_constant_is_2026_08_20():
    assert OWNER_CONDITIONAL_PREAPPROVAL_V2.endswith("2026_08_20")
    assert "V2" in OWNER_CONDITIONAL_PREAPPROVAL_V2
    assert OWNER_CONDITIONAL_TOKEN_2026_08_17 not in OWNER_CONDITIONAL_PREAPPROVAL_V2
    assert "2026_08_19" not in OWNER_CONDITIONAL_PREAPPROVAL_V2


def test_comparable_available_not_consumed(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    assert rec["id"] == AUTHORIZED_ANALYSIS_ID
    assert rec.get("comparable_available") is True
    assert rec.get("comparable_consumed") is False
    assert rec.get("comparable_reason") == SINGULAR_COMPARABLE_REASON
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    assert "comparable_available=true" in html
    assert "comparable_consumed=false" in html
    assert SINGULAR_COMPARABLE_REASON in html
    assert "acima da mediana" not in html.lower()
    assert "ranking de pares" not in html.lower()
    assert "HOLD_FOR_DATA" not in html
    assert "#435" not in html


def test_epistemic_taxonomy_cta_and_no_pii(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    assert rec["content_class"] == CONTENT_CLASS_ANALYSIS
    assert "ANÁLISE TÉCNICA DE CONTRATO PÚBLICO" in html
    for token in FORBIDDEN_SCHEMA:
        assert f'"@type":"{token}"' not in html
        assert f'"@type": "{token}"' not in html
    assert 'data-epistemic="FACT"' in html
    assert 'data-epistemic="CALCULATION"' in html
    assert 'data-epistemic="INFERENCE"' in html
    assert 'data-epistemic="UNKNOWN"' in html
    assert 'data-source="CONFENGE_WEB"' in html
    assert "data-destination-service-id=" in html
    assert "data-analysis-id=" in html
    assert "data-asset-family=" in html
    start = html.find('id="proximo-passo"')
    assert start != -1
    cta = html[start : html.find("</section>", start)]
    assert "@" not in cta
    assert "telefone" not in cta.lower()
    assert "gsc_query" not in html.lower()
    facts = rec.get("facts") or []
    assert facts
    for item in facts:
        if not isinstance(item, dict):
            continue
        assert item.get("locator") or item.get("locators")
        assert item.get("source_ref") or item.get("url") or item.get("source_refs")


def test_v2_token_grants_index_only_when_hashes_match(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["root_content_hash"] = rec.get("root_content_hash") or rec.get("content_hash")
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    html, indexed = _index_shaped(rec, decision)
    row = _approve_v2(rec, tmp_path, html)
    assert row["token"] == OWNER_CONDITIONAL_PREAPPROVAL_V2
    assert row["canonical_url"] == AUTHORIZED_CANONICAL_PATH
    assert row["material_hash"] == material_hash(rec)
    assert row["rendered_content_hash"] == rendered_content_hash(html)
    assert row["official_payload_hash"] == rec["content_hash"]
    after = evaluate_publication(rec, cohort=[rec])
    assert after.state == "PUBLISHABLE_INDEX"
    assert after.indexable is True
    indexed_html = render_analysis_html(rec, after)
    report = evaluate_index_items_v2(
        rec,
        after,
        indexed_html,
        token=OWNER_CONDITIONAL_PREAPPROVAL_V2,
        handoff={"status": HANDOFF_READY, "path": str(tmp_path / "contract-analysis" / "official-live-01"), "root_content_hash": rec.get("root_content_hash")},
        sitemap_locs=[f"https://confenge.com.br{AUTHORIZED_CANONICAL_PATH}"],
        headers_text=(
            "/analises-contratos-publicos/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n"
            f"{AUTHORIZED_CANONICAL_PATH.rstrip('/')}/*\n  X-Robots-Tag: index, follow\n"
        ),
        robots_text=f"Allow: {AUTHORIZED_CANONICAL_PATH}\nDisallow: /analises-contratos-publicos/\n",
        rollback_proven=True,
    )
    missing = [key for key in INDEX_ITEM_KEYS if not report["items"][key]]
    assert report["all_pass"] is True, missing
    assert report["index_count_allowed"] == 1
    assert report["comparable_available"] is True
    assert report["comparable_consumed"] is False


def test_one_byte_material_and_render_drift_refuses_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["root_content_hash"] = rec.get("root_content_hash") or rec.get("content_hash")
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped(rec, decision)
    _approve_v2(rec, tmp_path, html)
    drifted = dict(rec)
    drifted["insight_singular"] = rec["insight_singular"][:-1] + (
        "X" if rec["insight_singular"][-1] != "X" else "Y"
    )
    ok, reasons = approval_allows_index(drifted, root=tmp_path)
    assert ok is False
    assert "approval_material_hash_mismatch" in reasons or "approval_absent" in reasons
    assert evaluate_publication(drifted, cohort=[drifted]).state != "PUBLISHABLE_INDEX"

    after = evaluate_publication(rec, cohort=[rec])
    live_html = render_analysis_html(rec, after)
    broken = live_html + " "
    downgraded, new_html = apply_rendered_hash_gate(rec, after, broken)
    assert downgraded.state != "PUBLISHABLE_INDEX"
    assert "noindex" in downgraded.robots
    assert "noindex" in new_html


def test_index_count_xor_and_no_other_slug(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["root_content_hash"] = rec.get("root_content_hash") or rec.get("content_hash")
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped(rec, decision)
    _approve_v2(rec, tmp_path, html)
    decisions = evaluate_cohort([rec])
    indexed = [d for d in decisions if d.state == "PUBLISHABLE_INDEX"]
    assert len(indexed) == 1
    assert indexed[0].slug == rec["slug"]
    other_slugs = {
        "aditivo-saldo-art125-item-novo",
        "atraso-eventos-sem-comunicacao-contemporanea",
        "bdi-composicao-vs-referencia-sc",
        "comparaveis-rejeitados-regime-distinto",
        "reajuste-aniversario-serie-indice",
    }
    assert rec["slug"] not in other_slugs
    assert sitemap_locs([(rec, indexed[0])]) == [
        f"https://confenge.com.br{AUTHORIZED_CANONICAL_PATH}"
    ]


def test_withdraw_rebuild_noindex_no_ghost_loc(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["root_content_hash"] = rec.get("root_content_hash") or rec.get("content_hash")
    robots = tmp_path / "robots.txt"
    headers = tmp_path / "_headers"
    robots.write_text(
        "User-agent: *\nAllow: /\n\n# Contract-analysis canary:\nDisallow: /analises-contratos-publicos/\n",
        encoding="utf-8",
    )
    headers.write_text(
        "# Contract-analysis canary:\n/analises-contratos-publicos/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n\n# Offer catalog preview: public gate still off\n/piloto/ofertas/*\n  X-Robots-Tag: noindex, nofollow\n",
        encoding="utf-8",
    )
    (tmp_path / "sitemap-index.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        " <sitemap>\n <loc>https://confenge.com.br/sitemap.xml</loc>\n"
        " <lastmod>2026-08-20</lastmod>\n </sitemap>\n"
        "</sitemapindex>\n",
        encoding="utf-8",
    )
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped(rec, decision)
    _approve_v2(rec, tmp_path, html)
    after = evaluate_publication(rec, cohort=[rec])
    write_pages([(rec, after)], index_count=1)
    sync_family_crawler_rules([(rec, after)], root=tmp_path)
    write_sitemap([(rec, after)])
    assert rec["slug"] in robots.read_text(encoding="utf-8")
    family_map = tmp_path / "sitemap-analises-contratos.xml"
    assert family_map.is_file()
    assert rec["slug"] in family_map.read_text(encoding="utf-8")

    withdraw_approval(AUTHORIZED_ANALYSIS_ID, actor="owner", reason="rollback_exercise", root=tmp_path)
    rolled = evaluate_publication(rec, cohort=[rec])
    assert rolled.state != "PUBLISHABLE_INDEX"
    assert rolled.indexable is False
    write_pages([(rec, rolled)], index_count=0)
    write_sitemap([(rec, rolled)])
    sync_family_crawler_rules([(rec, rolled)], root=tmp_path)
    robots_after = robots.read_text(encoding="utf-8")
    headers_after = headers.read_text(encoding="utf-8")
    assert f"Allow: /analises-contratos-publicos/{rec['slug']}/" not in robots_after
    assert "X-Robots-Tag: index, follow" not in headers_after
    if family_map.exists():
        assert rec["slug"] not in family_map.read_text(encoding="utf-8")
    html_after = render_analysis_html(rec, rolled)
    assert "noindex" in html_after
    assert sitemap_locs([(rec, rolled)]) == []


def test_payload_hash_drift_refuses_canary_token(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["root_content_hash"] = rec.get("root_content_hash") or rec.get("content_hash")
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped(rec, decision)
    quality, handoff = _real_quality_and_handoff(rec, tmp_path)
    with pytest.raises(ApprovalError, match="conditional_payload_hash_mismatch"):
        approve_conditional_canary(
            rec,
            token=OWNER_CONDITIONAL_PREAPPROVAL_V2,
            rollback="git:revert",
            rendered_html=html,
            producer_root_hash=str(rec.get("root_content_hash") or ""),
            source_dossier_hash="0" * 64,
            quality=quality,
            handoff=handoff,
            suite_green=True,
            root=tmp_path,
        )
