"""Fail-closed validation and reporting for the #543 buyer-decision projection."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.bofu_dominance.core.constants import (
    BUYER_DECISION_MAP_PATH,
    BUYER_DECISION_MAP_SCHEMA,
    BUYER_DECISION_REPORT_PATH,
    MANUAL_GSC_SNAPSHOT_PATH,
    ORIGIN_MAIN_SHA,
    ROOT,
)

PUBLIC_ORIGIN = "https://confenge.com.br"
ALLOWED_COVERAGE_STATES = (
    "DOMINANT_CANDIDATE",
    "OWNED_BUT_WEAK",
    "CANNIBALIZED",
    "CONTENT_GAP",
    "COMMERCIAL_BRIDGE_GAP",
    "MEASUREMENT_WAIT",
    "NO_DEMAND_EVIDENCE",
)
PROTECTED_ROUTES = (
    "/diagnostico-pre-licitacao/",
    "/auditoria-orcamento-licitacao/",
    "/medicoes-glosas-obras-publicas/",
    "/aditivos-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/diagnostico-b2g-360/",
)
PROTECTED_ISSUES = frozenset({126, 127, 128, 327, 387, 529})
MANUAL_GSC_SOURCE = "seo/gsc-2026-08-31/manual-page-snapshot.v1.json"
MANUAL_PAGE_MAPPING_PATHS = {
    "aditivos": [
        "/aditivos-obras-publicas/",
        "/conteudos/limite-aditivo-25-50-obra-publica/",
        "/conteudos/aditivo-qualitativo-quantitativo/",
    ],
    "medicoes-pagamentos": [
        "/medicoes-glosas-obras-publicas/",
        "/conteudos/glosa-de-medicao-obra-publica/",
    ],
    "reequilibrio": ["/reequilibrio-obras-publicas/"],
    "orcamento-bdi": [
        "/auditoria-orcamento-licitacao/",
        "/conteudos/sinapi-desonerado-nao-desonerado/",
        "/conteudos/bdi-diferenciado-obra-publica/",
        "/conteudos/administracao-local-orcamento-obra-publica/",
    ],
    "carteira-operacao": ["/diagnostico-b2g-360/"],
    "edital-proposta": [
        "/diagnostico-pre-licitacao/",
        "/conteudos/comprovacao-exequibilidade-proposta-obra/",
        "/conteudos/empreitada-preco-global-preco-unitario/",
    ],
    "defesa-margem": ["/defesa-margem-contratos-publicos/"],
    "atrasos-prorrogacao": [
        "/atrasos-prorrogacao-obras-publicas/",
        "/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/",
        "/conteudos/chuva-prorrogacao-prazo-obra-publica/",
    ],
    "defesa-sancoes": ["/defesa-tecnica-contratos-publicos/"],
    "gestao-contratual": ["/acompanhamento-contratos-obras/"],
    "bid-room": ["/bid-room-licitacoes-obras/"],
    "diagnostico-expansao": ["/diagnostico-b2g-expansao/"],
    "diretoria-b2g": ["/diretoria-b2g/"],
    "bid-readiness": [],
    "partner-integrity": [],
}
MANUAL_MAPPING_EXCLUSIONS = [
    {
        "path": "/",
        "state": "OUTSIDE_15_BUYER_JOB_OWNER_SCOPE",
        "reason": "The home page is a cross-family navigation surface, not a canonical owner for one of the 15 buyer jobs.",
    },
    {
        "path": "/conteudos/",
        "state": "OUTSIDE_15_BUYER_JOB_OWNER_SCOPE",
        "reason": "The editorial hub is a cross-family library surface, not a canonical owner for one buyer job.",
    },
    {
        "path": "http://confenge.com.br/",
        "state": "OUTSIDE_15_BUYER_JOB_OWNER_SCOPE",
        "reason": "The legacy HTTP home observation is canonical hygiene evidence, not a buyer-job owner mapping.",
    },
    {
        "path": "/especialista/tiago-jun-sasaki/",
        "state": "OUTSIDE_15_BUYER_JOB_OWNER_SCOPE",
        "reason": "The specialist profile is a trust surface shared across families, not a canonical buyer-job owner.",
    },
    {
        "path": "/conteudos/reequilibrio-empreitada-preco-global/",
        "state": "UNMAPPED_NO_EXISTING_CONTRACT",
        "reason": "The page row is retained, but current route and content-service contracts do not map this URL to reequilibrio; a visible query cannot create that mapping.",
    },
    {
        "path": "/ferramentas/diagnostico-defesa-margem/",
        "state": "UNMAPPED_NO_EXISTING_CONTRACT",
        "reason": "The tool is a separate utility and the current BOFU matrix declares no supporting route for defesa-margem, so its impressions do not inflate the canonical-owner score.",
    },
]
REQUIRED_ROW_FIELDS = (
    "family_id",
    "buyer_job",
    "query_family",
    "commercial_intent",
    "economic_consequence",
    "canonical_owner_url",
    "gap",
    "supporting_urls",
    "gsc",
    "manual_page_evidence",
    "content_quality",
    "proof",
    "offer",
    "cta",
    "conversion_path",
    "coverage_state",
    "execution_state",
    "current_answer",
    "next_likely_decision",
    "canonical_destination",
    "edge_reason",
    "operational_owner",
    "issue_refs",
    "prioritization",
)
GENERIC_EDGE_TOKENS = (
    "relacionado",
    "conteúdo relacionado",
    "conteudo relacionado",
    "saiba mais",
    "veja mais",
    "clique aqui",
)
ALLOWED_EXECUTION_STATES = {
    "EXECUTE_NOW",
    "VALIDATE",
    "MEASUREMENT_WAIT",
    "DEFER",
    "DEFER_EXTERNAL",
}
GSC_NONCOMPARABLE_REASON_BY_ROUTE = {
    "/aditivos-obras-publicas/": "The owner observation is Spain/mixed-device and is not comparable for the Brazilian query family.",
    "/auditoria-orcamento-licitacao/": "The owner observation is Chile/mobile and is not comparable for the Brazilian query family.",
}
GSC_ABSENT_REASON = (
    "Owner absent from returned live top rows; absence is not zero demand or zero rank."
)
GSC_NO_OWNER_REASON = "There is no canonical owner path to observe; this is not zero demand."
CONTENT_QUALITY_BY_COVERAGE = {
    "OWNED_BUT_WEAK": {"WEAK"},
    "CONTENT_GAP": {"GAP"},
    "COMMERCIAL_BRIDGE_GAP": {"BRIDGE_GAP"},
    "MEASUREMENT_WAIT": {
        "PROTECTED_WAIT",
        "SUPPORTING_MEASUREMENT_WAIT",
        "MEASUREMENT_PENDING",
    },
    "NO_DEMAND_EVIDENCE": {"GAP"},
    "CANNIBALIZED": {"WEAK"},
    "DOMINANT_CANDIDATE": {"STRONG"},
}
ALLOWED_PROOF_STATES = {
    "PUBLIC_METHOD_AND_SUPPORT",
    "PUBLIC_METHOD_ONLY",
    "NO_PUBLIC_PROOF",
}
ALLOWED_OFFER_STATES = {
    "EXISTING_SERVICE_ROUTE",
    "EXISTING_PAID_OFFER",
    "NO_AUTHORIZED_OFFER",
}
FORBIDDEN_MANUAL_EVIDENCE_KEYS = {
    "query",
    "queries",
    "query_text",
    "query_rows",
    "keyword",
    "keywords",
    "search_term",
    "search_terms",
    "url",
    "page_url",
}


@dataclass(frozen=True)
class MapFinding:
    path: str
    reason: str
    detail: str
    severity: str = "error"


@dataclass
class MapValidationReport:
    ok: bool = True
    findings: list[MapFinding] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def add(self, path: str, reason: str, detail: str) -> None:
        self.findings.append(MapFinding(path=path, reason=reason, detail=detail))
        self.ok = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "findings": [asdict(item) for item in self.findings],
            "stats": self.stats,
        }


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _full_url(route: str) -> str:
    return f"{PUBLIC_ORIGIN}{route}"


def _route_from_url(value: str) -> str | None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != "confenge.com.br":
        return None
    return parsed.path or "/"


def _route_file(root: Path, route: str) -> Path:
    clean = route.strip("/")
    return root / clean / "index.html" if clean else root / "index.html"


def _is_non_generic(value: Any) -> bool:
    text = str(value or "").strip()
    lowered = text.casefold()
    return len(text) >= 24 and not any(token in lowered for token in GENERIC_EDGE_TOKENS)


def _validate_source_hashes(
    document: dict[str, Any], root: Path, report: MapValidationReport
) -> dict[str, dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(document.get("derived_from") or []):
        label = f"derived_from[{index}]"
        if not isinstance(item, dict) or not item.get("path") or not item.get("sha256"):
            report.add(label, "source_contract_invalid", "path and sha256 are required")
            continue
        relative = str(item["path"])
        if relative in sources:
            report.add(label, "source_contract_duplicate", relative)
            continue
        source_path = root / relative
        if not source_path.is_file():
            report.add(label, "source_contract_missing", relative)
            continue
        actual = _sha256_file(source_path)
        if actual != item["sha256"]:
            report.add(
                label,
                "source_contract_hash_drift",
                f"{relative}: expected={item['sha256']} actual={actual}",
            )
        sources[relative] = item
    return sources


def _validate_manual_gsc_snapshot(
    snapshot: dict[str, Any], report: MapValidationReport
) -> dict[str, dict[str, Any]]:
    """Validate the sanitized founder snapshot without promoting it to CURRENT."""
    if snapshot.get("schema_version") != "confenge-manual-gsc-snapshot/v1":
        report.add("manual-gsc", "manual_snapshot_schema_invalid", str(snapshot.get("schema_version")))
    if snapshot.get("source_kind") != "MANUAL_GSC_SNAPSHOT":
        report.add("manual-gsc", "manual_snapshot_source_kind_invalid", str(snapshot.get("source_kind")))

    def reject_sensitive_keys(value: Any, path: str) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                normalized = str(key).casefold().replace("-", "_")
                if normalized in FORBIDDEN_MANUAL_EVIDENCE_KEYS:
                    report.add(
                        path,
                        "plaintext_query_or_sensitive_url_forbidden",
                        f"forbidden key={key!r}",
                    )
                reject_sensitive_keys(nested, f"{path}.{key}")
        elif isinstance(value, list):
            for index, nested in enumerate(value):
                reject_sensitive_keys(nested, f"{path}[{index}]")

    reject_sensitive_keys(snapshot, "manual-gsc")

    def require_closed_keys(value: Any, expected: set[str], path: str) -> None:
        if not isinstance(value, dict) or set(value) != expected:
            actual = sorted(value) if isinstance(value, dict) else type(value).__name__
            report.add(
                path,
                "manual_snapshot_closed_schema_violation",
                f"expected={sorted(expected)} actual={actual}",
            )

    def strictly_matches(actual: Any, expected: Any) -> bool:
        if type(actual) is not type(expected):
            return False
        if isinstance(expected, dict):
            return set(actual) == set(expected) and all(
                strictly_matches(actual[key], expected[key]) for key in expected
            )
        if isinstance(expected, list):
            return len(actual) == len(expected) and all(
                strictly_matches(actual_item, expected_item)
                for actual_item, expected_item in zip(actual, expected)
            )
        return actual == expected

    require_closed_keys(
        snapshot,
        {
            "schema_version",
            "source_kind",
            "reported_at",
            "reported_by_role",
            "property",
            "export",
            "raw_export_provenance",
            "durable_authority_relationship",
            "site_summary",
            "country_summary",
            "device_summary",
            "weekly_samples",
            "weekly_interpretation",
            "query_visibility",
            "page_rows",
            "interpretation_guardrail",
        },
        "manual-gsc",
    )
    require_closed_keys(
        snapshot.get("export"),
        {"search_type", "ui_period", "start_date", "end_date", "timezone"},
        "manual-gsc.export",
    )
    expected_top_scalars = {
        "schema_version": "confenge-manual-gsc-snapshot/v1",
        "source_kind": "MANUAL_GSC_SNAPSHOT",
        "reported_at": "2026-08-31",
        "reported_by_role": "founder",
        "property": "sc-domain:confenge.com.br",
        "weekly_interpretation": "Two weekly samples are not a trend claim because query mix and volume are not controlled.",
        "interpretation_guardrail": "This snapshot proves page exposure for mapped URLs. It does not by itself prove conversion failure, query-family completeness, causality, trend, ranking durability or #413 CURRENT authority.",
    }
    for key, expected in expected_top_scalars.items():
        if not strictly_matches(snapshot.get(key), expected):
            report.add(
                f"manual-gsc.{key}",
                "manual_snapshot_scalar_drift",
                f"expected={expected!r} actual={snapshot.get(key)!r}",
            )
    expected_export = {
        "search_type": "Web",
        "ui_period": "last_28_days",
        "start_date": "2026-08-02",
        "end_date": "2026-08-29",
        "timezone": "America/Sao_Paulo",
    }
    if not strictly_matches(snapshot.get("export"), expected_export):
        report.add(
            "manual-gsc.export",
            "manual_snapshot_export_drift",
            f"expected={expected_export} actual={snapshot.get('export')}",
        )

    raw_value = snapshot.get("raw_export_provenance")
    require_closed_keys(
        raw_value,
        {"expected_campaign_path", "workspace_status", "archived", "checksum_status", "sha256", "basis"},
        "manual-gsc.raw_export_provenance",
    )
    raw = raw_value if isinstance(raw_value, dict) else {}
    expected_raw = {
        "expected_campaign_path": "evidence/search-console-2026-08-31/",
        "workspace_status": "NOT_AVAILABLE_IN_EXECUTION_WORKSPACE",
        "archived": False,
        "checksum_status": "UNKNOWN_RAW_FILES_UNAVAILABLE",
        "sha256": None,
        "basis": "The founder supplied the measured export summary in the 2026-08-31 campaign goal, but the referenced CSV package was not present in the shared workspace, attachment cache or campaign worktrees. No raw checksum is invented.",
    }
    if not strictly_matches(raw, expected_raw):
        report.add(
            "manual-gsc.raw_export_provenance",
            "manual_raw_provenance_overclaim",
            f"expected={expected_raw} actual={raw_value}",
        )

    durable_value = snapshot.get("durable_authority_relationship")
    require_closed_keys(
        durable_value,
        {
            "issue",
            "current_authority_state",
            "durable_distinct_observations",
            "durable_observations_required",
            "counts_as_durable_observation",
            "read_after_write_proven",
            "reason",
        },
        "manual-gsc.durable_authority_relationship",
    )
    durable = durable_value if isinstance(durable_value, dict) else {}
    expected_durable = {
        "issue": 413,
        "current_authority_state": "UNKNOWN",
        "durable_distinct_observations": 2,
        "durable_observations_required": 3,
        "counts_as_durable_observation": False,
        "read_after_write_proven": False,
        "reason": "A manual UI export has no producer snapshot/pointer write, durable host read-back or producer-consumer manifest parity and therefore cannot satisfy the third #413 observation.",
    }
    if not strictly_matches(durable, expected_durable):
        report.add(
            "manual-gsc.durable_authority_relationship",
            "manual_snapshot_promoted_to_durable",
            f"expected={expected_durable} actual={durable_value}",
        )

    site_value = snapshot.get("site_summary")
    require_closed_keys(
        site_value,
        {"clicks", "impressions", "ctr", "impression_weighted_daily_position"},
        "manual-gsc.site_summary",
    )
    site = site_value if isinstance(site_value, dict) else {}
    expected_site = {
        "clicks": 27,
        "impressions": 1201,
        "ctr": 0.02248,
        "impression_weighted_daily_position": 8.24,
    }
    if not strictly_matches(site, expected_site):
        report.add(
            "manual-gsc.site_summary",
            "manual_site_totals_drift",
            f"expected={expected_site} actual={site_value}",
        )
    if site.get("clicks") != 27 or site.get("impressions") != 1201:
        report.add("manual-gsc.site_summary", "manual_site_totals_drift", str(site))
    expected_site_ctr = 27 / 1201
    if not isinstance(site.get("ctr"), (int, float)) or abs(site["ctr"] - expected_site_ctr) > 0.000005:
        report.add("manual-gsc.site_summary", "manual_site_ctr_invalid", str(site.get("ctr")))

    query_visibility_value = snapshot.get("query_visibility")
    require_closed_keys(
        query_visibility_value,
        {
            "status",
            "visible_query_rows",
            "visible_query_impressions",
            "site_impressions",
            "visible_impression_ratio",
            "permitted_use",
            "forbidden_inference",
            "raw_query_text_committed",
        },
        "manual-gsc.query_visibility",
    )
    query_visibility = (
        query_visibility_value if isinstance(query_visibility_value, dict) else {}
    )
    expected_query_visibility = {
        "status": "HEAVILY_CENSORED_OR_ANONYMIZED",
        "visible_query_rows": 17,
        "visible_query_impressions": 52,
        "site_impressions": 1201,
        "visible_impression_ratio": 0.043297,
        "permitted_use": "QUALITATIVE_CORROBORATION_ONLY",
        "forbidden_inference": "The visible queries are not the query universe and cannot create an owner or prove absence of demand.",
        "raw_query_text_committed": False,
    }
    if not strictly_matches(query_visibility, expected_query_visibility):
        report.add(
            "manual-gsc.query_visibility",
            "query_visibility_contract_drift",
            f"expected={expected_query_visibility} actual={query_visibility_value}",
        )
    expected_ratio = 52 / 1201
    ratio = query_visibility.get("visible_impression_ratio")
    if not isinstance(ratio, (int, float)) or abs(ratio - expected_ratio) > 0.000001:
        report.add("manual-gsc.query_visibility", "query_visibility_ratio_invalid", str(ratio))

    country_summary = snapshot.get("country_summary")
    require_closed_keys(
        country_summary,
        {"country", "clicks", "impressions", "ctr", "position"},
        "manual-gsc.country_summary",
    )
    expected_country = {
        "country": "Brazil",
        "clicks": 27,
        "impressions": 1048,
        "ctr": 0.0258,
        "position": 7.14,
    }
    if not strictly_matches(country_summary, expected_country):
        report.add(
            "manual-gsc.country_summary",
            "manual_country_summary_drift",
            f"expected={expected_country} actual={country_summary}",
        )
    device_summary = snapshot.get("device_summary")
    if not isinstance(device_summary, list):
        report.add("manual-gsc.device_summary", "manual_snapshot_closed_schema_violation", type(device_summary).__name__)
    else:
        for index, row in enumerate(device_summary):
            require_closed_keys(
                row,
                {"device", "clicks", "impressions", "ctr", "position"},
                f"manual-gsc.device_summary[{index}]",
            )
    expected_devices = [
        {"device": "Desktop", "clicks": 22, "impressions": 938, "ctr": 0.0235, "position": 7.75},
        {"device": "Mobile", "clicks": 5, "impressions": 262, "ctr": 0.0191, "position": 9.92},
    ]
    if not strictly_matches(device_summary, expected_devices):
        report.add(
            "manual-gsc.device_summary",
            "manual_device_summary_drift",
            f"expected={expected_devices} actual={device_summary}",
        )
    weekly_samples = snapshot.get("weekly_samples")
    if not isinstance(weekly_samples, list):
        report.add("manual-gsc.weekly_samples", "manual_snapshot_closed_schema_violation", type(weekly_samples).__name__)
    else:
        for index, row in enumerate(weekly_samples):
            require_closed_keys(
                row,
                {"start_date", "end_date", "clicks", "impressions", "ctr", "impression_weighted_position"},
                f"manual-gsc.weekly_samples[{index}]",
            )
    expected_weekly_samples = [
        {"start_date": "2026-08-23", "end_date": "2026-08-29", "clicks": 8, "impressions": 212, "ctr": 0.0377, "impression_weighted_position": 7.42},
        {"start_date": "2026-08-16", "end_date": "2026-08-22", "clicks": 5, "impressions": 305, "ctr": 0.0164, "impression_weighted_position": 7.08},
    ]
    if not strictly_matches(weekly_samples, expected_weekly_samples):
        report.add(
            "manual-gsc.weekly_samples",
            "manual_weekly_samples_drift",
            f"expected={expected_weekly_samples} actual={weekly_samples}",
        )
    pages: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(snapshot.get("page_rows") or []):
        label = f"manual-gsc.page_rows[{index}]"
        if not isinstance(row, dict):
            report.add(label, "manual_page_row_invalid", str(row))
            continue
        expected_page_keys = {"path", "clicks", "impressions", "ctr", "position"}
        if set(row) != expected_page_keys:
            report.add(
                label,
                "manual_page_row_schema_invalid",
                f"expected={sorted(expected_page_keys)} actual={sorted(row)}",
            )
        path = row.get("path")
        if not isinstance(path, str) or not path:
            report.add(label, "manual_page_path_invalid", str(path))
            continue
        if path in pages:
            report.add(label, "manual_page_path_duplicate", path)
            continue
        clicks = row.get("clicks")
        impressions = row.get("impressions")
        ctr = row.get("ctr")
        position = row.get("position")
        if type(clicks) is not int or clicks < 0 or type(impressions) is not int or impressions <= 0 or clicks > impressions:
            report.add(label, "manual_page_counts_invalid", str(row))
        if type(ctr) is not float or not 0 <= ctr <= 1:
            report.add(label, "manual_page_ctr_invalid", str(ctr))
        elif type(clicks) is int and type(impressions) is int and impressions > 0:
            if abs(ctr - clicks / impressions) > 0.0001:
                report.add(label, "manual_page_ctr_incoherent", str(row))
        if type(position) is not float or position <= 0:
            report.add(label, "manual_page_position_invalid", str(position))
        pages[path] = row
    return pages


def _manual_aggregate(observations: list[dict[str, Any]]) -> dict[str, Any]:
    impressions = sum(item["impressions"] for item in observations)
    clicks = sum(item["clicks"] for item in observations)
    weighted_position = sum(item["impressions"] * item["position"] for item in observations)
    return {
        "clicks": clicks,
        "impressions": impressions,
        "ctr": round(clicks / impressions, 6),
        "position": round(weighted_position / impressions, 2),
    }


def _validate_priority(
    row: dict[str, Any], label: str, report: MapValidationReport
) -> tuple[int, int] | None:
    priority = row.get("prioritization") or {}
    if not priority.get("controllable"):
        if not str(priority.get("exclusion") or "").strip():
            report.add(label, "uncontrolled_gap_without_exclusion", row.get("family_id", "?"))
        return None
    if row.get("coverage_state") in {"MEASUREMENT_WAIT", "NO_DEMAND_EVIDENCE"}:
        report.add(label, "non_controllable_state_queued", str(row.get("coverage_state")))
    factors = ("commercial_intent", "economic_value", "ability_to_win", "content_gap")
    values: list[int] = []
    for factor in factors:
        value = priority.get(factor)
        if not isinstance(value, int) or not 1 <= value <= 5:
            report.add(label, "priority_factor_invalid", f"{factor}={value!r}")
            return None
        values.append(value)
    demand = priority.get("query_demand") or {}
    if demand != {"state": "UNKNOWN_QUERY_UNIVERSE_CENSORED", "score": None}:
        report.add(label, "unknown_query_demand_not_preserved", json.dumps(demand, ensure_ascii=False))
        return None
    manual = row.get("manual_page_evidence") or {}
    owner_observation = manual.get("owner_observation") or {}
    exposure = priority.get("page_exposure") or {}
    expected_exposure = {
        "state": "OBSERVED_CANONICAL_OWNER_PAGE",
        "source_kind": "MANUAL_GSC_SNAPSHOT",
        "impressions": owner_observation.get("impressions"),
        "clicks": owner_observation.get("clicks"),
        "ctr": owner_observation.get("ctr"),
        "position": owner_observation.get("position"),
        "conversion_inference": "INSUFFICIENT_EVIDENCE_TINY_SAMPLE",
    }
    if manual.get("status") != "MANUAL_GSC_SNAPSHOT" or exposure != expected_exposure:
        report.add(label, "page_exposure_priority_drift", f"expected={expected_exposure} actual={exposure}")
        return None
    impressions = exposure.get("impressions")
    if not isinstance(impressions, int) or impressions <= 0:
        report.add(label, "page_exposure_impressions_invalid", str(impressions))
        return None
    base = values[0] * values[1] * values[2] * values[3]
    if priority.get("commercial_intent") != (row.get("commercial_intent") or {}).get("score"):
        report.add(label, "commercial_intent_priority_drift", str(priority.get("commercial_intent")))
    if priority.get("economic_value") != (row.get("economic_consequence") or {}).get("score"):
        report.add(label, "economic_value_priority_drift", str(priority.get("economic_value")))
    expected = {
        "state": "OBSERVED_PAGE_EXPOSURE",
        "value": base * impressions,
        "known_factor_product": base,
        "canonical_owner_impressions": impressions,
    }
    if priority.get("score") != expected:
        report.add(
            label,
            "priority_score_invalid",
            f"expected={expected} actual={priority.get('score')}",
        )
    if not str(priority.get("next_wave_output") or "").strip():
        report.add(label, "priority_next_wave_output_missing", row.get("family_id", "?"))
    return base * impressions, base


def _validate_reconciled_authorities(
    *,
    doc: dict[str, Any],
    root: Path,
    registry_by_id: dict[str, dict[str, Any]],
    matrix_by_id: dict[str, dict[str, Any]],
    demand_map: dict[str, Any],
    content_map: dict[str, Any],
    frozen_ownership: dict[str, Any],
    semantic_ownership: dict[str, Any],
    report: MapValidationReport,
) -> None:
    """Interpret every pinned authority instead of accepting hashes alone."""
    expected_exceptions = {
        "need-edital-orcamento": {
            "source": "data/organic/demand-map.json",
            "source_id": "need-edital-orcamento",
            "source_cluster": "edital-proposta",
            "source_service_path": "/auditoria-orcamento-licitacao/",
            "canonical_owner_path": "/diagnostico-pre-licitacao/",
            "resolution": "intent-registry.v2 and bofu-intent-matrix own the edital-proposta query family; the budget audit remains the adjacent orçamento-bdi decision.",
        },
        "need-benchmark-mercado": {
            "source": "data/organic/demand-map.json",
            "source_id": "need-benchmark-mercado",
            "source_cluster": "inteligencia-mercado",
            "state": "OUTSIDE_BOFU_INTENT_UNIVERSE",
            "resolution": "The node is TOFU market-method demand, not one of the 15 current economic BOFU buyer jobs.",
        },
    }
    actual_exceptions = {
        str(item.get("source_id")): item
        for item in doc.get("reconciliation_exceptions") or []
        if isinstance(item, dict)
    }
    if actual_exceptions != expected_exceptions:
        report.add(
            "reconciliation_exceptions",
            "demand_reconciliation_drift",
            f"expected={expected_exceptions} actual={actual_exceptions}",
        )

    seen_demand_nodes: set[str] = set()
    for node in demand_map.get("nodes") or []:
        if not isinstance(node, dict):
            report.add("demand-map", "demand_node_invalid", str(node))
            continue
        node_id = str(node.get("id") or "")
        cluster = str(node.get("cluster") or "")
        seen_demand_nodes.add(node_id)
        if cluster not in registry_by_id:
            exception = actual_exceptions.get(node_id)
            if not exception or exception.get("state") != "OUTSIDE_BOFU_INTENT_UNIVERSE":
                report.add("demand-map", "demand_node_unreconciled", f"{node_id}:{cluster}")
            continue
        expected_path = (registry_by_id[cluster].get("canonical_owner") or {}).get("path")
        source_path = node.get("service_path")
        if source_path != expected_path:
            exception = actual_exceptions.get(node_id)
            if not exception or exception.get("source_service_path") != source_path or exception.get(
                "canonical_owner_path"
            ) != expected_path:
                report.add(
                    "demand-map",
                    "demand_owner_conflict_unreconciled",
                    f"{node_id}: source={source_path} canonical={expected_path}",
                )
    if set(actual_exceptions) - seen_demand_nodes:
        report.add(
            "reconciliation_exceptions",
            "reconciliation_exception_source_missing",
            str(sorted(set(actual_exceptions) - seen_demand_nodes)),
        )

    content_clusters = {
        str(item.get("id")): item
        for item in content_map.get("clusters") or []
        if isinstance(item, dict)
    }
    for cluster, item in content_clusters.items():
        family = registry_by_id.get(cluster)
        if not family:
            report.add("content-service-map", "content_cluster_unknown", cluster)
            continue
        expected_path = (family.get("canonical_owner") or {}).get("path")
        if item.get("service_path") != expected_path:
            report.add(
                "content-service-map",
                "content_cluster_owner_drift",
                f"{cluster}: expected={expected_path} actual={item.get('service_path')}",
            )
    path_overrides = content_map.get("path_overrides") or {}
    for route, cluster in path_overrides.items():
        if cluster not in content_clusters:
            report.add("content-service-map", "content_override_cluster_unknown", f"{route}:{cluster}")
        if not _route_file(root, str(route)).is_file():
            report.add("content-service-map", "content_override_route_missing", str(route))
    for family_id, matrix_row in matrix_by_id.items():
        for route in matrix_row.get("supporting_indexable_routes") or []:
            mapped = path_overrides.get(route)
            if mapped is not None and mapped != family_id:
                report.add(
                    "content-service-map",
                    "content_supporting_owner_conflict",
                    f"{route}: matrix={family_id} content_map={mapped}",
                )

    expected_pillars = {route.strip("/") for route in PROTECTED_ROUTES}
    pillars = frozen_ownership.get("pillars") or {}
    if set(pillars) != expected_pillars:
        report.add(
            "frozen-query-ownership",
            "frozen_pillar_set_drift",
            f"expected={sorted(expected_pillars)} actual={sorted(pillars)}",
        )
    owner_path_to_family = {
        str((family.get("canonical_owner") or {}).get("path")): family_id
        for family_id, family in registry_by_id.items()
        if (family.get("canonical_owner") or {}).get("path")
    }
    for slug, pillar in pillars.items():
        route = f"/{slug}/"
        if route not in owner_path_to_family:
            report.add("frozen-query-ownership", "frozen_pillar_owner_missing", route)
        cannibalization = (pillar or {}).get("cannibalization") or {}
        if not str(cannibalization.get("status") or "").strip():
            report.add("frozen-query-ownership", "cannibalization_state_missing", slug)
    owned_queries: dict[str, str] = {}
    for slug, pillar in pillars.items():
        for query in ((pillar or {}).get("query_ownership") or {}).get("owned") or []:
            normalized = " ".join(str(query).casefold().split())
            prior = owned_queries.get(normalized)
            if prior and prior != slug:
                report.add(
                    "frozen-query-ownership",
                    "duplicate_owned_query",
                    f"{query!r} owned by {prior} and {slug}",
                )
            owned_queries[normalized] = slug

    semantic_cluster = str(semantic_ownership.get("cluster_id") or "")
    semantic_family = registry_by_id.get(semantic_cluster)
    semantic_destination = semantic_ownership.get("commercial_destination")
    expected_semantic_destination = (
        (semantic_family.get("canonical_owner") or {}).get("path") if semantic_family else None
    )
    if not semantic_family or semantic_destination != expected_semantic_destination:
        report.add(
            "semantic-query-ownership",
            "semantic_cluster_owner_drift",
            f"cluster={semantic_cluster} destination={semantic_destination}",
        )
    intents = {
        str(item.get("id")): item
        for item in semantic_ownership.get("intents") or []
        if isinstance(item, dict)
    }
    routes = semantic_ownership.get("routes") or []
    for intent_id, intent in intents.items():
        owners = [
            route.get("path")
            for route in routes
            if isinstance(route, dict)
            and route.get("status") == "INDEXABLE"
            and any(
                role.get("intent_id") == intent_id and role.get("role") == "OWNER"
                for role in route.get("intent_roles") or []
                if isinstance(role, dict)
            )
        ]
        if owners != [intent.get("canonical_owner")]:
            report.add(
                "semantic-query-ownership",
                "semantic_intent_owner_invalid",
                f"{intent_id}: declared={intent.get('canonical_owner')} owners={owners}",
            )
    for overlap in semantic_ownership.get("overlaps") or []:
        family_id = str(overlap.get("family") or "")
        family = registry_by_id.get(family_id)
        expected_path = (family.get("canonical_owner") or {}).get("path") if family else None
        if not family or overlap.get("owner_path") != expected_path:
            report.add(
                "semantic-query-ownership",
                "semantic_overlap_owner_drift",
                f"{family_id}: expected={expected_path} actual={overlap.get('owner_path')}",
            )
    for conflict in semantic_ownership.get("conflicts") or []:
        intent = intents.get(str(conflict.get("intent_id") or ""))
        if not intent or conflict.get("owner_path") != intent.get("canonical_owner"):
            report.add(
                "semantic-query-ownership",
                "cannibalization_owner_drift",
                str(conflict.get("id")),
            )
        if not _is_non_generic(conflict.get("resolution")):
            report.add(
                "semantic-query-ownership",
                "cannibalization_resolution_missing",
                str(conflict.get("id")),
            )


def validate_buyer_decision_map(
    root: Path = ROOT,
    document: dict[str, Any] | None = None,
    manual_snapshot: dict[str, Any] | None = None,
) -> MapValidationReport:
    """Validate completeness, ownership, honesty, protected routes and priority."""
    report = MapValidationReport()
    map_path = root / BUYER_DECISION_MAP_PATH.relative_to(ROOT)
    try:
        doc = document if document is not None else _read_json(map_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report.add(str(map_path.relative_to(root)), "projection_unreadable", str(exc))
        return report

    if doc.get("schema_version") != BUYER_DECISION_MAP_SCHEMA:
        report.add("schema_version", "projection_schema_invalid", str(doc.get("schema_version")))
    if (doc.get("baseline") or {}).get("origin_main") != ORIGIN_MAIN_SHA:
        report.add(
            "baseline.origin_main",
            "baseline_origin_main_drift",
            f"expected={ORIGIN_MAIN_SHA} actual={(doc.get('baseline') or {}).get('origin_main')}",
        )
    if tuple(doc.get("allowed_coverage_states") or ()) != ALLOWED_COVERAGE_STATES:
        report.add("allowed_coverage_states", "coverage_enum_drift", str(doc.get("allowed_coverage_states")))
    if tuple(doc.get("protected_routes") or ()) != PROTECTED_ROUTES:
        report.add("protected_routes", "protected_route_contract_drift", str(doc.get("protected_routes")))
    if doc.get("wave_decision") not in {"REPEAT", "CHANGE", "STOP", "INSUFFICIENT_EVIDENCE"}:
        report.add("wave_decision", "wave_decision_invalid", str(doc.get("wave_decision")))
    sources = _validate_source_hashes(doc, root, report)

    required_sources = {
        "data/bofu-dominance/core/intent-registry.v2.json",
        "data/organic/bofu-intent-matrix.json",
        "data/organic/demand-map.json",
        "data/organic/content-service-map.json",
        "data/organic/public-family-registry.json",
        "data/bofu-dominance/frozen-specs/query-ownership.json",
        "data/organic/medicoes-glosas-query-ownership.v1.json",
        "data/bofu-dominance/core/gsc-live-overlay.v1.json",
        "data/bofu-dominance/core/issue-state-snapshot.v1.json",
        MANUAL_GSC_SOURCE,
    }
    if set(sources) != required_sources:
        report.add(
            "derived_from",
            "authority_set_incomplete",
            f"missing={sorted(required_sources - set(sources))} extra={sorted(set(sources) - required_sources)}",
        )

    try:
        registry = _read_json(root / "data/bofu-dominance/core/intent-registry.v2.json")
        matrix = _read_json(root / "data/organic/bofu-intent-matrix.json")
        public_families = _read_json(root / "data/organic/public-family-registry.json")
        demand_map = _read_json(root / "data/organic/demand-map.json")
        content_map = _read_json(root / "data/organic/content-service-map.json")
        frozen_ownership = _read_json(
            root / "data/bofu-dominance/frozen-specs/query-ownership.json"
        )
        semantic_ownership = _read_json(
            root / "data/organic/medicoes-glosas-query-ownership.v1.json"
        )
        gsc_overlay = _read_json(root / "data/bofu-dominance/core/gsc-live-overlay.v1.json")
        manual_gsc_snapshot = (
            manual_snapshot
            if manual_snapshot is not None
            else _read_json(root / MANUAL_GSC_SNAPSHOT_PATH.relative_to(ROOT))
        )
        issue_snapshot = _read_json(
            root / "data/bofu-dominance/core/issue-state-snapshot.v1.json"
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report.add("authority", "authority_unreadable", str(exc))
        return report

    registry_by_id = {item["id"]: item for item in registry.get("families") or []}
    matrix_by_id = {item["intent_cluster"]: item for item in matrix.get("rows") or []}
    rows = doc.get("rows") or []
    manual_pages = _validate_manual_gsc_snapshot(manual_gsc_snapshot, report)
    if doc.get("manual_mapping_exclusions") != MANUAL_MAPPING_EXCLUSIONS:
        report.add(
            "manual_mapping_exclusions",
            "manual_mapping_exclusions_drift",
            f"expected={MANUAL_MAPPING_EXCLUSIONS} actual={doc.get('manual_mapping_exclusions')}",
        )
    mapped_manual_paths = [
        path for paths in MANUAL_PAGE_MAPPING_PATHS.values() for path in paths
    ]
    if len(mapped_manual_paths) != len(set(mapped_manual_paths)):
        report.add(
            "manual_page_mapping",
            "manual_page_mapped_to_multiple_families",
            str(mapped_manual_paths),
        )
    excluded_manual_paths = [item["path"] for item in MANUAL_MAPPING_EXCLUSIONS]
    if len(excluded_manual_paths) != len(set(excluded_manual_paths)):
        report.add(
            "manual_mapping_exclusions",
            "manual_mapping_exclusion_duplicate",
            str(excluded_manual_paths),
        )
    mapped_set = set(mapped_manual_paths)
    excluded_set = set(excluded_manual_paths)
    if mapped_set & excluded_set:
        report.add(
            "manual_page_mapping",
            "manual_page_mapped_and_excluded",
            str(sorted(mapped_set & excluded_set)),
        )
    if mapped_set | excluded_set != set(manual_pages):
        report.add(
            "manual_page_mapping",
            "manual_page_classification_incomplete",
            f"unclassified={sorted(set(manual_pages) - mapped_set - excluded_set)} missing={sorted((mapped_set | excluded_set) - set(manual_pages))}",
        )
    if not isinstance(rows, list):
        report.add("rows", "projection_rows_invalid", "rows must be an array")
        return report
    row_ids = [str(item.get("family_id")) for item in rows if isinstance(item, dict)]
    if len(row_ids) != len(set(row_ids)):
        report.add("rows", "duplicate_query_family", str(row_ids))
    if set(row_ids) != set(registry_by_id):
        report.add(
            "rows",
            "buyer_job_coverage_incomplete",
            f"missing={sorted(set(registry_by_id) - set(row_ids))} extra={sorted(set(row_ids) - set(registry_by_id))}",
        )

    expected_issue_ref = {
        "path": "data/bofu-dominance/core/issue-state-snapshot.v1.json",
        "schema_version": "bofu-issue-state-snapshot/v1",
    }
    if doc.get("issue_state_evidence") != expected_issue_ref:
        report.add(
            "issue_state_evidence",
            "issue_state_evidence_drift",
            f"expected={expected_issue_ref} actual={doc.get('issue_state_evidence')}",
        )
    if issue_snapshot.get("schema_version") != expected_issue_ref["schema_version"]:
        report.add(
            "issue-state-snapshot",
            "issue_snapshot_schema_invalid",
            str(issue_snapshot.get("schema_version")),
        )
    if issue_snapshot.get("audited_origin_main") != ORIGIN_MAIN_SHA:
        report.add(
            "issue-state-snapshot",
            "issue_snapshot_baseline_drift",
            str(issue_snapshot.get("audited_origin_main")),
        )
    issue_rows = issue_snapshot.get("issues") or []
    issue_numbers = [item.get("number") for item in issue_rows if isinstance(item, dict)]
    if len(issue_numbers) != len(set(issue_numbers)):
        report.add("issue-state-snapshot", "issue_snapshot_duplicate", str(issue_numbers))
    issue_states = {
        str(item.get("number")): item.get("state")
        for item in issue_rows
        if isinstance(item, dict) and isinstance(item.get("number"), int)
    }
    for item in issue_rows:
        if not isinstance(item, dict):
            report.add("issue-state-snapshot", "issue_snapshot_row_invalid", str(item))
            continue
        number = item.get("number")
        state = item.get("state")
        if state not in {"OPEN", "CLOSED"}:
            report.add("issue-state-snapshot", "issue_snapshot_state_invalid", f"#{number}={state}")
        if item.get("url") != f"https://github.com/tjsasakifln/web-cfg/issues/{number}":
            report.add("issue-state-snapshot", "issue_snapshot_url_invalid", f"#{number}")
        if state == "CLOSED" and not item.get("closed_at"):
            report.add("issue-state-snapshot", "closed_issue_without_timestamp", f"#{number}")
        if state == "OPEN" and item.get("closed_at") is not None:
            report.add("issue-state-snapshot", "open_issue_with_closed_timestamp", f"#{number}")
    for family_id, family in registry_by_id.items():
        issue_numbers = [
            family.get("active_issue"),
            (family.get("canonical_owner") or {}).get("issue"),
        ]
        for number in {value for value in issue_numbers if isinstance(value, int)}:
            state = issue_states.get(str(number))
            if state is None:
                report.add(f"registry:{family_id}", "operational_issue_state_unknown", f"issue #{number}")
            elif state != "OPEN":
                report.add(f"registry:{family_id}", "closed_issue_is_operational_owner", f"issue #{number}={state}")

    service_family = next(
        (item for item in public_families.get("families") or [] if item.get("id") == "service-pillars"),
        None,
    )
    expected_source = "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route"
    if not service_family or (service_family.get("match") or {}).get("source") != expected_source:
        report.add("public-family-registry", "service_family_authority_drift", expected_source)

    _validate_reconciled_authorities(
        doc=doc,
        root=root,
        registry_by_id=registry_by_id,
        matrix_by_id=matrix_by_id,
        demand_map=demand_map,
        content_map=content_map,
        frozen_ownership=frozen_ownership,
        semantic_ownership=semantic_ownership,
        report=report,
    )

    gsc_policy = doc.get("gsc_policy") or {}
    expected_gsc_source = "data/bofu-dominance/core/gsc-live-overlay.v1.json"
    if gsc_policy.get("latest_versioned_source") != expected_gsc_source:
        report.add("gsc_policy", "gsc_policy_source_drift", str(gsc_policy))
    if gsc_policy.get("as_of") != gsc_overlay.get("as_of"):
        report.add("gsc_policy", "gsc_policy_as_of_drift", str(gsc_policy))
    if gsc_policy.get("state") != "UNKNOWN" or gsc_overlay.get(
        "core_ready_for_product_decisions"
    ) is not False:
        report.add(
            "gsc_policy",
            "gsc_policy_readiness_overclaim",
            f"policy={gsc_policy.get('state')} overlay_ready={gsc_overlay.get('core_ready_for_product_decisions')}",
        )
    expected_manual_policy = {
        "source": MANUAL_GSC_SOURCE,
        "source_kind": "MANUAL_GSC_SNAPSHOT",
        "page_evidence_state": "OBSERVED_WHERE_EXACTLY_MAPPED",
        "query_visibility_state": "HEAVILY_CENSORED_OR_ANONYMIZED",
        "counts_as_issue_413_observation": False,
        "durable_current_authority": "UNKNOWN",
    }
    if gsc_policy.get("manual_snapshot") != expected_manual_policy:
        report.add(
            "gsc_policy.manual_snapshot",
            "manual_gsc_policy_drift",
            f"expected={expected_manual_policy} actual={gsc_policy.get('manual_snapshot')}",
        )

    declared_owner_rows: dict[str, list[str]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("canonical_owner_url"):
            declared_owner_rows.setdefault(str(row["canonical_owner_url"]), []).append(
                str(row.get("family_id") or "")
            )
    for owner_url, families in declared_owner_rows.items():
        if len(families) > 1:
            report.add(
                "rows",
                "duplicate_canonical_owner",
                f"{owner_url} owns {sorted(families)}",
            )
    owner_to_family = {url: families[0] for url, families in declared_owner_rows.items()}
    controllable: list[tuple[int, int, str, dict[str, Any]]] = []
    unknown_gsc = 0
    manual_observed = 0
    manual_unknown = 0
    coverage_counts: dict[str, int] = {}
    protected_seen: set[str] = set()
    protected_family_ids: set[str] = set()
    for index, row in enumerate(rows):
        label = f"rows[{index}]"
        if not isinstance(row, dict):
            report.add(label, "projection_row_invalid", "row must be an object")
            continue
        family_id = str(row.get("family_id") or "")
        label = f"rows:{family_id or index}"
        missing = [field for field in REQUIRED_ROW_FIELDS if field not in row]
        if missing:
            report.add(label, "projection_row_fields_missing", str(missing))
            continue
        family = registry_by_id.get(family_id)
        if not family:
            continue
        if row.get("buyer_job") != family.get("job"):
            report.add(label, "buyer_job_drift", f"expected={family.get('job')!r}")
        query_family = row.get("query_family") or {}
        expected_query = {
            "id": family_id,
            "primary_queries": family.get("primary_queries"),
            "negative_queries": family.get("negative_queries"),
        }
        if query_family != expected_query:
            report.add(label, "query_family_drift", "must match intent-registry.v2 exactly")
        intent = row.get("commercial_intent") or {}
        if intent.get("level") == "HIGH" and not (row.get("canonical_owner_url") or row.get("gap")):
            report.add(label, "high_intent_orphan", family_id)
        if not isinstance(intent.get("score"), int) or not 1 <= intent.get("score", 0) <= 5:
            report.add(label, "commercial_intent_invalid", str(intent))
        if not _is_non_generic(intent.get("basis")):
            report.add(label, "commercial_intent_basis_missing", str(intent))
        consequence = row.get("economic_consequence") or {}
        if not _is_non_generic(consequence.get("summary")):
            report.add(label, "economic_consequence_missing", str(consequence))
        if not isinstance(consequence.get("score"), int) or not 1 <= consequence.get("score", 0) <= 5:
            report.add(label, "economic_consequence_score_invalid", str(consequence))

        quality = row.get("content_quality") or {}
        if not str(quality.get("state") or "").strip() or not _is_non_generic(
            quality.get("basis")
        ):
            report.add(label, "content_quality_invalid", str(quality))
        allowed_quality = CONTENT_QUALITY_BY_COVERAGE.get(str(row.get("coverage_state"))) or set()
        if quality.get("state") not in allowed_quality:
            report.add(
                label,
                "content_quality_state_invalid",
                f"coverage={row.get('coverage_state')} state={quality.get('state')}",
            )
        proof = row.get("proof") or {}
        if proof.get("state") not in ALLOWED_PROOF_STATES:
            report.add(label, "proof_state_invalid", str(proof))
        if not isinstance(proof.get("sources"), list):
            report.add(label, "proof_sources_invalid", str(proof))
        if not _is_non_generic(proof.get("claim_boundary")):
            report.add(label, "proof_claim_boundary_missing", str(proof))

        owner_url = row.get("canonical_owner_url")
        gap = row.get("gap")
        expected_route = (family.get("canonical_owner") or {}).get("path")
        if bool(owner_url) == bool(gap):
            report.add(label, "owner_gap_xor_invalid", "exactly one of canonical_owner_url or gap is required")
        if expected_route:
            expected_url = _full_url(expected_route)
            if owner_url != expected_url or gap is not None:
                report.add(label, "canonical_owner_drift", f"expected={expected_url}")
            if not _route_file(root, expected_route).is_file():
                report.add(label, "canonical_owner_missing", expected_route)
            if not proof.get("sources"):
                report.add(label, "owned_intent_without_proof_source", family_id)
            matrix_row = matrix_by_id.get(family_id)
            if not matrix_row:
                report.add(label, "owner_missing_from_route_projection", family_id)
            else:
                if matrix_row.get("canonical_service_route") != expected_route:
                    report.add(label, "matrix_owner_drift", str(matrix_row.get("canonical_service_route")))
                expected_supporting = [_full_url(path) for path in matrix_row.get("supporting_indexable_routes") or []]
                if row.get("supporting_urls") != expected_supporting:
                    report.add(label, "supporting_urls_drift", f"expected={expected_supporting}")
                if (row.get("cta") or {}).get("label") != matrix_row.get("cta"):
                    report.add(label, "cta_drift", str(matrix_row.get("cta")))
                offer = row.get("offer") or {}
                for field_name in ("destination_service_id", "offer_class", "offer_id"):
                    if offer.get(field_name) != matrix_row.get(field_name):
                        report.add(label, "offer_drift", f"{field_name}={matrix_row.get(field_name)!r}")
                if not str(offer.get("state") or "").strip():
                    report.add(label, "offer_state_missing", str(offer))
                expected_offer_state = (
                    "EXISTING_PAID_OFFER"
                    if matrix_row.get("offer_id")
                    else "EXISTING_SERVICE_ROUTE"
                )
                if offer.get("state") != expected_offer_state:
                    report.add(
                        label,
                        "offer_state_invalid",
                        f"expected={expected_offer_state} actual={offer.get('state')}",
                    )
                cta = row.get("cta") or {}
                if cta.get("state") != "DECLARED" or cta.get("terminal_action") != "capture_form":
                    report.add(label, "cta_contract_invalid", str(cta))
        else:
            if owner_url is not None or not isinstance(gap, dict):
                report.add(label, "gap_state_missing", family_id)
            if family_id in matrix_by_id:
                report.add(label, "gap_has_matrix_owner", family_id)
            if row.get("supporting_urls") != []:
                report.add(label, "gap_has_supporting_owner", str(row.get("supporting_urls")))
            if isinstance(gap, dict) and gap.get("state") != row.get("coverage_state"):
                report.add(
                    label,
                    "gap_coverage_state_mismatch",
                    f"gap={gap.get('state')} coverage={row.get('coverage_state')}",
                )
            if proof.get("state") != "NO_PUBLIC_PROOF" or proof.get("sources") != []:
                report.add(label, "gap_proof_invalid", str(proof))
            offer = row.get("offer") or {}
            cta = row.get("cta") or {}
            expected_gap_offer = {
                "state": "NO_AUTHORIZED_OFFER",
                "destination_service_id": None,
                "offer_class": None,
                "offer_id": None,
            }
            if offer != expected_gap_offer:
                report.add(label, "gap_offer_invalid", str(offer))
            if cta != {"state": "NONE", "label": None, "terminal_action": None}:
                report.add(label, "gap_cta_invalid", str(cta))

        supporting = row.get("supporting_urls") or []
        for url in supporting:
            route = _route_from_url(str(url))
            if route is None or not _route_file(root, route).is_file():
                report.add(label, "supporting_url_missing", str(url))
            if str(url) in owner_to_family and owner_to_family[str(url)] != family_id:
                report.add(label, "supporting_url_is_other_owner", str(url))
        for url in (row.get("proof") or {}).get("sources") or []:
            proof_route = _route_from_url(str(url))
            if proof_route is None or not _route_file(root, proof_route).is_file():
                report.add(label, "proof_source_missing", str(url))

        state = row.get("coverage_state")
        if state not in ALLOWED_COVERAGE_STATES:
            report.add(label, "coverage_state_invalid", str(state))
        else:
            coverage_counts[state] = coverage_counts.get(state, 0) + 1
        execution_state = row.get("execution_state")
        if execution_state not in ALLOWED_EXECUTION_STATES:
            report.add(label, "execution_state_invalid", str(execution_state))
        route = _route_from_url(str(owner_url)) if owner_url else None
        referenced_issues = {
            item.get("number")
            for item in row.get("issue_refs") or []
            if isinstance(item, dict)
        }
        active_issue = family.get("active_issue")
        authority_protected = route in PROTECTED_ROUTES or active_issue in PROTECTED_ISSUES
        if active_issue in PROTECTED_ISSUES and active_issue not in referenced_issues:
            report.add(
                label,
                "protected_issue_reference_missing",
                f"intent-registry.v2 active_issue=#{active_issue}",
            )
        if route in PROTECTED_ROUTES:
            protected_seen.add(str(route))
        if authority_protected:
            protected_family_ids.add(family_id)
            if state != "MEASUREMENT_WAIT" or execution_state != "MEASUREMENT_WAIT":
                report.add(
                    label,
                    "protected_route_executable_now",
                    f"{route or family_id}: {state}/{execution_state}; authority_issue={active_issue}",
                )

        gsc = row.get("gsc") or {}
        if gsc.get("status") != gsc_policy.get("state"):
            report.add(
                label,
                "gsc_policy_state_mismatch",
                f"expected={gsc_policy.get('state')} actual={gsc.get('status')}",
            )
        if gsc.get("source") != gsc_policy.get("latest_versioned_source"):
            report.add(label, "gsc_source_drift", str(gsc.get("source")))
        if gsc.get("as_of") != gsc_overlay.get("as_of") or gsc_policy.get("as_of") != gsc_overlay.get(
            "as_of"
        ):
            report.add(
                label,
                "gsc_as_of_drift",
                f"row={gsc.get('as_of')} policy={gsc_policy.get('as_of')} overlay={gsc_overlay.get('as_of')}",
            )
        reason = str(gsc.get("reason") or "")
        if not _is_non_generic(reason):
            report.add(label, "gsc_reason_missing", reason)
        overlay_record = (gsc_overlay.get("paths") or {}).get(route) if route else None
        observation = gsc.get("observation")
        if overlay_record:
            expected_reason = GSC_NONCOMPARABLE_REASON_BY_ROUTE.get(str(route))
            if not expected_reason:
                report.add(label, "gsc_context_unclassified", str(route))
            expected_observation = {
                key: overlay_record.get(key)
                for key in ("impressions", "clicks", "position", "geo", "device", "denominator")
            }
            if observation != expected_observation:
                report.add(
                    label,
                    "gsc_observation_drift",
                    f"expected={expected_observation} actual={observation}",
                )
        elif observation is not None:
            report.add(label, "gsc_observation_without_overlay", str(observation))
            expected_reason = GSC_ABSENT_REASON if route else GSC_NO_OWNER_REASON
        else:
            expected_reason = GSC_ABSENT_REASON if route else GSC_NO_OWNER_REASON
        if reason != expected_reason:
            report.add(
                label,
                "gsc_reason_drift",
                f"expected={expected_reason!r} actual={reason!r}",
            )
        if gsc.get("status") == "UNKNOWN":
            unknown_gsc += 1
            if state == "NO_DEMAND_EVIDENCE":
                basis = str((gap or {}).get("evidence_basis") or "")
                registry_gate = family.get("gate") or {}
                independent = (
                    family_id == "bid-readiness"
                    and basis == "ISSUE_155_BACKLOG_SANITATION"
                    and (gap or {}).get("historical_issue") == 155
                    and registry_gate.get("status") == "CLOSED_NOT_PLANNED"
                    and registry_gate.get("historical_issue") == 155
                    and issue_states.get("155") == "CLOSED"
                )
                if not independent:
                    report.add(label, "unknown_gsc_inferred_as_no_demand", basis or "missing independent basis")
        elif gsc.get("status") != "OBSERVED_COMPARABLE":
            report.add(label, "gsc_state_invalid", str(gsc.get("status")))

        manual = row.get("manual_page_evidence") or {}
        expected_paths = MANUAL_PAGE_MAPPING_PATHS.get(family_id)
        if expected_paths is None:
            report.add(label, "manual_family_mapping_missing", family_id)
            expected_paths = []
        if expected_paths:
            missing_paths = [path for path in expected_paths if path not in manual_pages]
            if missing_paths:
                report.add(label, "manual_mapped_page_missing", str(missing_paths))
            observations = [manual_pages[path] for path in expected_paths if path in manual_pages]
            matrix_support = {
                item.replace(PUBLIC_ORIGIN, "", 1)
                for item in row.get("supporting_urls") or []
            }
            expected_mappings = [
                {
                    "path": path,
                    "role": (
                        "CANONICAL_OWNER"
                        if path == route
                        else "DECLARED_SUPPORT"
                        if path in matrix_support
                        else "CONTRACT_MAPPED_SUPPORT"
                    ),
                }
                for path in expected_paths
            ]
            expected_manual = {
                "status": "MANUAL_GSC_SNAPSHOT",
                "source": MANUAL_GSC_SOURCE,
                "mapping_confidence": (
                    "HIGH_EXACT_CANONICAL_OWNER"
                    if len(expected_paths) == 1
                    else "HIGH_EXACT_OWNER_AND_CONTRACTED_SUPPORT"
                ),
                "mapped_pages": expected_mappings,
                "owner_observation": manual_pages.get(route),
                "family_aggregate": _manual_aggregate(observations) if observations else None,
                "interpretation": "PAGE_EXPOSURE_ONLY_NOT_CONVERSION_FAILURE",
            }
            if manual != expected_manual:
                report.add(
                    label,
                    "manual_page_evidence_drift",
                    f"expected={expected_manual} actual={manual}",
                )
            manual_observed += 1
        else:
            expected_manual = {
                "status": "UNKNOWN",
                "source": MANUAL_GSC_SOURCE,
                "mapping_confidence": "NONE_NO_CANONICAL_MAPPING",
                "mapped_pages": [],
                "owner_observation": None,
                "family_aggregate": None,
                "reason": "No valid canonical page mapping exists; manual page evidence remains UNKNOWN and is not zero demand.",
            }
            if manual != expected_manual:
                report.add(
                    label,
                    "manual_page_unknown_drift",
                    f"expected={expected_manual} actual={manual}",
                )
            manual_unknown += 1

        current = row.get("current_answer") or {}
        if not current.get("type") or not isinstance(current.get("source_urls"), list):
            report.add(label, "current_answer_invalid", str(current))
        if owner_url and not current.get("source_urls"):
            report.add(label, "owned_intent_without_current_answer", family_id)
        if gap and (current.get("type") != "GAP" or current.get("source_urls") != []):
            report.add(label, "gap_current_answer_invalid", str(current))
        for url in current.get("source_urls") or []:
            current_route = _route_from_url(str(url))
            allowed_answers = set(supporting)
            if owner_url:
                allowed_answers.add(str(owner_url))
            if current_route is None or not _route_file(root, current_route).is_file():
                report.add(label, "current_answer_missing", str(url))
            elif str(url) not in allowed_answers:
                report.add(label, "current_answer_not_declared", str(url))
        if not _is_non_generic(row.get("next_likely_decision")):
            report.add(label, "generic_edge_without_next_decision", str(row.get("next_likely_decision")))
        if not _is_non_generic(row.get("edge_reason")):
            report.add(label, "generic_edge_without_reason", str(row.get("edge_reason")))
        destination = str(row.get("canonical_destination") or "")
        if destination.startswith("GAP:"):
            if not gap or destination != f"GAP:{family_id}":
                report.add(label, "gap_destination_invalid", destination)
        else:
            destination_route = _route_from_url(destination)
            if destination_route is None or not _route_file(root, destination_route).is_file():
                report.add(label, "canonical_destination_missing", destination)
        if row.get("conversion_path") not in (doc.get("conversion_path_definitions") or {}):
            report.add(label, "conversion_path_unknown", str(row.get("conversion_path")))
        if row.get("operational_owner") != "web-cfg/organic-market-capture":
            report.add(label, "operational_owner_invalid", str(row.get("operational_owner")))
        for issue_ref in row.get("issue_refs") or []:
            number = issue_ref.get("number")
            role = str(issue_ref.get("role") or "")
            issue_state = issue_states.get(str(number))
            if issue_state is None:
                report.add(label, "issue_reference_state_unknown", f"#{number}")
            if role == "OPERATIONAL_OWNER" and issue_state != "OPEN":
                report.add(label, "closed_issue_is_operational_owner", f"#{number}={issue_state}")
            if issue_state == "CLOSED" and not role.startswith("HISTORICAL_"):
                report.add(label, "closed_issue_role_invalid", f"#{number} role={role}")

        priority_score = _validate_priority(row, label, report)
        if priority_score:
            if authority_protected:
                report.add(label, "protected_route_in_controllable_queue", str(route or family_id))
            score, known_product = priority_score
            controllable.append((score, known_product, family_id, row))

    if protected_seen != set(PROTECTED_ROUTES):
        report.add(
            "protected_routes",
            "protected_route_coverage_incomplete",
            f"missing={sorted(set(PROTECTED_ROUTES) - protected_seen)}",
        )

    expected_sorted = sorted(controllable, key=lambda item: (-item[0], -item[1], item[2]))[:5]
    expected_queue = [
        {
            "rank": rank,
            "family_id": family_id,
            "coverage_state": row["coverage_state"],
            "score": row["prioritization"]["score"],
        }
        for rank, (_, _, family_id, row) in enumerate(expected_sorted, start=1)
    ]
    queue = doc.get("controllable_gap_queue") or []
    if len(queue) > 5:
        report.add("controllable_gap_queue", "controllable_gap_queue_exceeds_cap", str(len(queue)))
    if queue != expected_queue:
        report.add(
            "controllable_gap_queue",
            "controllable_gap_queue_drift",
            f"expected={expected_queue} actual={queue}",
        )

    report.stats = {
        "buyer_jobs": len(rows),
        "registry_buyer_jobs": len(registry_by_id),
        "coverage_percent": round(100 * len(set(row_ids) & set(registry_by_id)) / len(registry_by_id), 2)
        if registry_by_id
        else 0,
        "canonical_owners": len(owner_to_family),
        "gaps": sum(1 for row in rows if isinstance(row, dict) and row.get("gap")),
        "duplicate_owners": sum(
            len(families) - 1 for families in declared_owner_rows.values() if len(families) > 1
        ),
        "durable_gsc_unknown": unknown_gsc,
        "manual_page_observed": manual_observed,
        "manual_page_unknown": manual_unknown,
        "protected_routes": len(protected_seen),
        "protected_families": len(protected_family_ids),
        "controllable_queue": len(queue),
        "reconciled_authorities": len(required_sources),
        "coverage_states": dict(sorted(coverage_counts.items())),
        "wave_decision": doc.get("wave_decision"),
    }
    return report


def render_buyer_decision_report(document: dict[str, Any]) -> str:
    """Render the tracked, deterministic human evidence report."""
    rows = document["rows"]
    owners = sum(1 for row in rows if row.get("canonical_owner_url"))
    gaps = len(rows) - owners
    durable_unknown = sum(1 for row in rows if (row.get("gsc") or {}).get("status") == "UNKNOWN")
    manual_observed = sum(
        1
        for row in rows
        if (row.get("manual_page_evidence") or {}).get("status") == "MANUAL_GSC_SNAPSHOT"
    )
    manual_mapped_pages = sum(
        len((row.get("manual_page_evidence") or {}).get("mapped_pages") or [])
        for row in rows
    )
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["coverage_state"]] = counts.get(row["coverage_state"], 0) + 1
    lines = [
        "# Buyer decision map — issue #543",
        "",
        f"**As of:** `{document['as_of']}`",
        f"**Origin/main baseline:** `{document['baseline']['origin_main']}`",
        f"**Decision state:** `{document['baseline']['decision_state']}`",
        f"**Wave decision:** `{document['wave_decision']}`",
        f"**North Star:** organic/high-intent visit → useful progression → CTA → CONFENGE_WEB receipt → qualified opportunity → proposal → contract → margin",
        "",
        "## Outcome",
        "",
        f"The canonical 15-family intent universe is projected 1:1 into **{owners} URL owners** and **{gaps} explicit gaps**. Every buyer job has exactly one owner or gap; no public HTML, navigation, CTA, form, runtime or measurement window changed.",
        "",
        "## Visitor job and hypothesis",
        "",
        "For each economically relevant decision, the buyer must find one CONFENGE answer, a truthful proof/offer boundary and an explicit next decision. The hypothesis is that one versioned projection prevents cannibalization and sends the next wave to the highest-leverage controllable gaps instead of creating pages per keyword.",
        "",
        "## Coverage and honesty",
        "",
        f"- buyer jobs: **{len(rows)}/{len(rows)} (100%)**",
        f"- unique canonical owners: **{owners}**",
        f"- explicit gaps: **{gaps}**",
        f"- durable/current GSC authority `UNKNOWN`: **{durable_unknown}/{len(rows)}**; the manual export does not count as #413 observation 3/3",
        f"- manual page evidence observed: **{manual_observed}/{len(rows)}** families; the two ownerless gaps remain page-level `UNKNOWN`",
        "- query visibility: **52/1,201 impressions (4.3%)**; visible queries are qualitative corroboration only, never the query universe",
        f"- protected routes held at `MEASUREMENT_WAIT`: **{len(document['protected_routes'])}/{len(document['protected_routes'])}**",
        f"- coverage states: {', '.join(f'`{key}`={value}' for key, value in sorted(counts.items()))}",
        "",
        "## GSC evidence status and #413 boundary",
        "",
        "- `MANUAL_GSC_SNAPSHOT`: founder-reported Search Console UI export for Web / last 28 days (`2026-08-02`..`2026-08-29`); page rows may be used as measured exposure where URL mapping is exact.",
        "- durable/current authority: remains `UNKNOWN` at **2/3** distinct durable observations. There is no snapshot/pointer write, host read-after-write or manifest parity for this manual export.",
        "- raw provenance: the referenced campaign CSV directory was unavailable in the execution workspace, so no raw checksum is claimed. The normalized page aggregate is hash-pinned; plaintext queries are not committed.",
        f"- page classification: **{manual_mapped_pages} mapped rows** and **{len(document['manual_mapping_exclusions'])} explicit exclusions**. The reequilíbrio/global-price article and defesa-margem tool are retained but not mapped because current contracts do not authorize using them to inflate a family score.",
        "- interpretation: zero clicks on six, four or three impressions is exposure, not a conversion-failure conclusion.",
        "",
        "## Buyer job → owner/gap → next decision",
        "",
        "| Query family | Buyer job | Owner or gap | State | Manual owner-page evidence | Proof | Offer / CTA | Next decision → destination |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        owner = row.get("canonical_owner_url") or f"GAP: {(row.get('gap') or {}).get('state')}"
        offer = (row.get("offer") or {}).get("destination_service_id") or "none"
        cta = (row.get("cta") or {}).get("label") or "none"
        observation = (row.get("manual_page_evidence") or {}).get("owner_observation")
        if observation:
            page_evidence = (
                f"{observation['clicks']} clicks / {observation['impressions']} imp / "
                f"{observation['ctr'] * 100:.2f}% CTR / pos {observation['position']:.2f}; "
                f"`{row['manual_page_evidence']['mapping_confidence']}`"
            )
        else:
            page_evidence = "UNKNOWN; `NONE_NO_CANONICAL_MAPPING`"
        lines.append(
            f"| `{row['family_id']}` | {row['buyer_job']} | `{owner}` | `{row['coverage_state']}` | {page_evidence} | `{row['proof']['state']}` | `{offer}` / {cta} | {row['next_likely_decision']} → `{row['canonical_destination']}` |"
        )
    lines.extend(
        [
            "",
            "## Controllable gaps for the next wave",
            "",
            f"Rule: `{document['priority_rule']['formula']}`. Query-universe demand stays UNKNOWN because only 4.3% of site impressions are visible in the query table. The realized priority index uses actual canonical-owner page impressions; clicks, CTR and position remain context and do not turn tiny zero-click samples into conversion failure. Hard cap: five.",
            "",
            "| Rank | Family | State | Page-exposure priority index | Finite next-wave output |",
            "|---:|---|---|---:|---|",
        ]
    )
    by_id = {row["family_id"]: row for row in rows}
    for item in document["controllable_gap_queue"]:
        row = by_id[item["family_id"]]
        score = item["score"]
        exposure = row["prioritization"]["page_exposure"]
        lines.append(
            f"| {item['rank']} | `{item['family_id']}` | `{item['coverage_state']}` | {score['value']} = {score['known_factor_product']} × {score['canonical_owner_impressions']} owner-page impressions; {exposure['clicks']} clicks, {exposure['ctr'] * 100:.2f}% CTR, pos {exposure['position']:.2f} | {row['prioritization']['next_wave_output']} |"
        )
    lines.extend(
        [
            "",
            "The two URL gaps are deliberately absent from this controllable queue: `bid-readiness` has independent `NO_DEMAND_EVIDENCE` governance evidence in closed #155, while `partner-integrity` is blocked on the official upstream contract in open #156.",
            "",
            "## Data ownership, analytics and gates",
            "",
            "- `intent-registry.v2` remains the only intent universe; this file is a hash-pinned derived projection.",
            "- `bofu-intent-matrix` owns existing route/CTA/offer projection; `public-family-registry` remains the public conversion gate.",
            "- `content-service-map` is read-only here because it is frozen by the active measurement window.",
            "- The manual page snapshot is a sanitized, hash-pinned measurement overlay. It does not replace the durable GSC authority or count toward #413.",
            "- `extra-cli` owns facts and provenance through versioned SELECT-only contracts.",
            "- Warmbly owns qualified opportunity, proposal, contract, margin and outcomes after `source=CONFENGE_WEB` receipt.",
            "- Public analytics remain aggregate allowlist only, without PII.",
            "- `npm run bofu-ownership:check` verifies input hashes, 100% coverage, owner uniqueness/existence, closed operational issues, high-intent orphans, explicit decision edges, protected routes and UNKNOWN honesty.",
            "- `npm run inbound:gates` embeds the same fail-closed projection gate.",
            "",
            "## Source reconciliation",
            "",
            "| Versioned authority | SHA-256 |",
            "|---|---|",
        ]
    )
    for item in document["derived_from"]:
        lines.append(f"| `{item['path']}` | `{item['sha256']}` |")
    lines.extend(
        [
            "",
            "## Rollback and architecture",
            "",
            "Rollback is a revert of this projection, validator, generated report and the historical/operational issue-field reconciliation in the existing registry. There is no URL, indexation, copy, link, CTA, form or runtime rollback because none changed.",
            "",
            "Affected authorities: ADR-STRAT-002, RUNTIME-AUTHORITY and MARKET-CAPTURE-OS. No boundary changes: CONFENGE remains the only public surface, extra-cli remains truth/provenance owner and Warmbly remains commercial-action owner.",
            "",
            "## 100-repetition test",
            "",
            "Passes: each future query observation, owner decision and outcome enriches the same 15-family projection and deterministic priority rule. It does not create 100 pages, 100 keyword issues or a second identity/data model.",
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def check_report(root: Path = ROOT) -> MapValidationReport:
    report = validate_buyer_decision_map(root)
    if not report.ok:
        return report
    doc = _read_json(root / BUYER_DECISION_MAP_PATH.relative_to(ROOT))
    expected = render_buyer_decision_report(doc)
    report_path = root / BUYER_DECISION_REPORT_PATH.relative_to(ROOT)
    if not report_path.is_file():
        report.add(str(report_path.relative_to(root)), "generated_report_missing", "run --write")
    elif report_path.read_text(encoding="utf-8") != expected:
        report.add(str(report_path.relative_to(root)), "generated_report_drift", "run --write")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate/report the #543 buyer-decision map")
    parser.add_argument("--check", action="store_true", help="validate contract and tracked report")
    parser.add_argument("--write", action="store_true", help="write deterministic Markdown report")
    parser.add_argument("--json", action="store_true", dest="dump_json", help="print validation JSON")
    args = parser.parse_args(argv)
    validation = validate_buyer_decision_map()
    if validation.ok and args.write:
        document = _read_json(BUYER_DECISION_MAP_PATH)
        BUYER_DECISION_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        BUYER_DECISION_REPORT_PATH.write_text(render_buyer_decision_report(document), encoding="utf-8")
    if args.check and validation.ok:
        validation = check_report()
    if args.dump_json or not (args.check or args.write):
        sys.stdout.write(json.dumps(validation.to_dict(), ensure_ascii=False, indent=2) + "\n")
    elif not validation.ok:
        sys.stderr.write(json.dumps(validation.to_dict(), ensure_ascii=False, indent=2) + "\n")
    return 0 if validation.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
