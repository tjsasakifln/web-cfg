"""Semantic coherence: content → service_fit → bridge ↔ editorial architecture.

Uses content-service-map.json as the single registry (path → cluster → service).
Known bridge pages must resolve via path_overrides, not silent token ties.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.bridges import apply_bridges, inject_bridge, render_bridge_html
from scripts.organic.service_map import (
    extract_bridge_service,
    extract_principal_aside_service,
    extract_related_section_service,
    load_service_map,
    map_content_to_service,
    resolve_cluster_result,
    score_clusters,
)

BRIDGES_APPLY = ROOT / "data" / "organic" / "bridges-apply.json"
SERVICE_MAP = ROOT / "data" / "organic" / "content-service-map.json"


def _bridge_paths() -> list[str]:
    doc = json.loads(BRIDGES_APPLY.read_text(encoding="utf-8"))
    return [r["path"] for r in doc["results"]]


BRIDGE_PATHS = _bridge_paths()


def test_registry_schema_and_override_integrity():
    smap = load_service_map()
    assert smap["schema_version"] == "content-service-map-v1"
    cluster_ids = {c["id"] for c in smap["clusters"]}
    assert cluster_ids
    for path, cid in (smap.get("path_overrides") or {}).items():
        assert path.startswith("/conteudos/"), path
        assert path.endswith("/"), path
        assert cid in cluster_ids, f"override {path} → unknown cluster {cid}"
        cluster = next(c for c in smap["clusters"] if c["id"] == cid)
        assert cluster.get("service_path"), cid


@pytest.mark.parametrize("path", BRIDGE_PATHS)
def test_bridge_path_has_explicit_override(path: str):
    smap = load_service_map()
    overrides = smap.get("path_overrides") or {}
    assert path in overrides, f"{path} must have path_overrides entry (no token-only canonical)"
    fit = map_content_to_service(path, smap)
    assert fit["matched"] is True
    assert fit["match_source"] == "override"
    assert fit["confidence"] == "high"
    assert fit["cluster_id"] == overrides[path]
    assert fit["service_path"]
    assert fit["ambiguous"] is False


@pytest.mark.parametrize("path", BRIDGE_PATHS)
def test_bridge_html_matches_registry_service(path: str):
    fit = map_content_to_service(path)
    page = ROOT / path.strip("/") / "index.html"
    assert page.exists(), path
    html = page.read_text(encoding="utf-8")
    assert 'data-commercial-bridge="1"' in html or "commercial-bridge" in html
    bridge_svc = extract_bridge_service(html)
    assert bridge_svc is not None, f"no bridge href on {path}"
    assert bridge_svc.rstrip("/") == fit["service_path"].rstrip("/"), (
        f"{path}: bridge={bridge_svc} registry={fit['service_path']}"
    )
    # cluster attr on bridge
    m = re.search(
        r'<aside[^>]*commercial-bridge[^>]*data-cluster=["\']([^"\']*)["\']',
        html,
        re.I,
    )
    assert m, path
    assert m.group(1) == fit["cluster_id"]


@pytest.mark.parametrize("path", BRIDGE_PATHS)
def test_principal_aside_and_related_cohere_with_registry(path: str):
    fit = map_content_to_service(path)
    html = (ROOT / path.strip("/") / "index.html").read_text(encoding="utf-8")
    expected = (fit["service_path"] or "").rstrip("/") + "/"

    aside = extract_principal_aside_service(html)
    if aside:
        assert aside.rstrip("/") == expected.rstrip("/"), (
            f"{path}: principal aside {aside} ≠ registry {expected}"
        )

    related = extract_related_section_service(html)
    if related:
        assert related.rstrip("/") == expected.rstrip("/"), (
            f"{path}: related-section {related} ≠ registry {expected}"
        )


def test_known_regressions_fixed():
    """The two PR #59 semantic regressions must map to editorial architecture."""
    empreitada = map_content_to_service(
        "/conteudos/empreitada-preco-global-preco-unitario/"
    )
    assert empreitada["cluster_id"] == "edital-proposta"
    assert empreitada["service_path"] == "/diagnostico-pre-licitacao/"
    assert empreitada["match_source"] == "override"

    data_base = map_content_to_service(
        "/conteudos/data-base-orcamento-reajuste-obra-publica/"
    )
    assert data_base["cluster_id"] == "orcamento-bdi"
    assert data_base["service_path"] == "/auditoria-orcamento-licitacao/"
    assert data_base["match_source"] == "override"

    defesa = map_content_to_service(
        "/conteudos/resposta-notificacao-atraso-obra-publica/"
    )
    assert defesa["cluster_id"] == "defesa-sancoes"
    assert defesa["service_path"] == "/defesa-tecnica-contratos-publicos/"


def test_token_tie_does_not_pick_json_order():
    """Equal top token scores must not silently pick first cluster in JSON."""
    smap = {
        "schema_version": "content-service-map-v1",
        "default_specialist": "/especialista/tiago-jun-sasaki/",
        "clusters": [
            {
                "id": "alpha",
                "tokens": ["tie-token"],
                "service_path": "/svc-alpha/",
                "service_slug": "svc-alpha",
            },
            {
                "id": "beta",
                "tokens": ["tie-token"],
                "service_path": "/svc-beta/",
                "service_slug": "svc-beta",
            },
        ],
        "path_overrides": {},
    }
    result = resolve_cluster_result("/conteudos/something-tie-token-page/", smap)
    assert result["cluster"] is None
    assert result["ambiguous"] is True
    assert set(result.get("tied_clusters") or []) == {"alpha", "beta"}

    fit = map_content_to_service("/conteudos/something-tie-token-page/", smap)
    assert fit["matched"] is False
    assert fit["ambiguous"] is True
    assert fit["service_path"] is None


def test_override_beats_tokens():
    smap = {
        "schema_version": "content-service-map-v1",
        "default_specialist": "/x/",
        "clusters": [
            {
                "id": "tokens-win",
                "tokens": ["super-specific-slug-token"],
                "service_path": "/from-tokens/",
                "service_slug": "from-tokens",
            },
            {
                "id": "override-win",
                "tokens": ["zzz-never"],
                "service_path": "/from-override/",
                "service_slug": "from-override",
            },
        ],
        "path_overrides": {
            "/conteudos/super-specific-slug-token/": "override-win",
        },
    }
    fit = map_content_to_service("/conteudos/super-specific-slug-token/", smap)
    assert fit["matched"] is True
    assert fit["match_source"] == "override"
    assert fit["cluster_id"] == "override-win"
    assert fit["service_path"] == "/from-override/"
    # tokens would have preferred tokens-win
    scores = score_clusters("/conteudos/super-specific-slug-token/", smap)
    assert "tokens-win" in scores


def test_generic_tokens_do_not_force_empreitada_to_orcamento():
    """Without override, bare 'preco' must not drag empreitada into orcamento-bdi."""
    smap = load_service_map()
    # Strip override to exercise fallback
    smap = json.loads(json.dumps(smap))
    smap["path_overrides"].pop("/conteudos/empreitada-preco-global-preco-unitario/", None)
    fit = map_content_to_service(
        "/conteudos/empreitada-preco-global-preco-unitario/", smap
    )
    # Prefer edital via empreitada-preco; must NOT be orcamento-bdi from bare preco
    if fit["matched"]:
        assert fit["cluster_id"] != "orcamento-bdi"
        assert fit["cluster_id"] == "edital-proposta"


def test_data_base_without_override_not_silent_reequilibrio_from_reajuste():
    smap = json.loads(SERVICE_MAP.read_text(encoding="utf-8"))
    smap["path_overrides"].pop(
        "/conteudos/data-base-orcamento-reajuste-obra-publica/", None
    )
    result = resolve_cluster_result(
        "/conteudos/data-base-orcamento-reajuste-obra-publica/", smap
    )
    # reajuste removed from reequilibrio tokens; orcamento should uniquely win
    # or if multi-equal, ambiguous — never silent reequilibrio-from-reajuste alone
    if result["cluster"]:
        assert result["cluster"]["id"] == "orcamento-bdi"
    else:
        assert result["ambiguous"] is True


def test_bridge_render_uses_registry_service_for_regressions():
    for path, service in [
        (
            "/conteudos/empreitada-preco-global-preco-unitario/",
            "/diagnostico-pre-licitacao/",
        ),
        (
            "/conteudos/data-base-orcamento-reajuste-obra-publica/",
            "/auditoria-orcamento-licitacao/",
        ),
    ]:
        fit = map_content_to_service(path)
        html = render_bridge_html(fit, source_path=path, soft=True)
        assert service.rstrip("/") in html
        assert "origem=" in html
        assert "popup" not in html.lower()


def test_semantic_bridge_coverage_is_100_percent():
    """semantic bridge coverage = 100% for indexable paths in bridges-apply."""
    smap = load_service_map()
    missing = []
    for path in BRIDGE_PATHS:
        fit = map_content_to_service(path, smap)
        page = ROOT / path.strip("/") / "index.html"
        html = page.read_text(encoding="utf-8")
        noindex = bool(
            re.search(
                r'name=["\']robots["\'][^>]*noindex|content=["\'][^"\']*noindex',
                html,
                re.I,
            )
        )
        if noindex:
            continue
        bridge_svc = extract_bridge_service(html)
        if (
            not fit["matched"]
            or fit["match_source"] != "override"
            or not bridge_svc
            or bridge_svc.rstrip("/") != (fit["service_path"] or "").rstrip("/")
        ):
            missing.append(
                {
                    "path": path,
                    "matched": fit["matched"],
                    "source": fit.get("match_source"),
                    "registry": fit.get("service_path"),
                    "bridge": bridge_svc,
                }
            )
    assert missing == [], f"semantic bridge coverage gaps: {missing}"


def test_apply_bridges_dry_run_respects_overrides(tmp_path: Path):
    """apply_bridges (dry) would target registry services for the two regressions."""
    report = apply_bridges(
        ROOT,
        only_indexable=True,
        paths=[
            "/conteudos/empreitada-preco-global-preco-unitario/",
            "/conteudos/data-base-orcamento-reajuste-obra-publica/",
        ],
        dry_run=True,
    )
    by_path = {r["path"]: r for r in report["results"]}
    assert (
        by_path["/conteudos/empreitada-preco-global-preco-unitario/"]["service_path"]
        == "/diagnostico-pre-licitacao/"
    )
    assert (
        by_path["/conteudos/data-base-orcamento-reajuste-obra-publica/"]["service_path"]
        == "/auditoria-orcamento-licitacao/"
    )


def test_ambiguity_audit_scores_exposed():
    scores = score_clusters("/conteudos/aditivo-empreitada-por-preco-global/")
    # may still hit aditivos tokens; scores always a dict
    assert isinstance(scores, dict)
    fit = map_content_to_service("/conteudos/aditivo-empreitada-por-preco-global/")
    assert "token_scores" in fit
    assert fit["match_source"] == "override"
