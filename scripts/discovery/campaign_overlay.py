"""Four-URL campaign overlay on the existing discovery observatory.

Does not replace the #86 8-member registry. Adds a frozen cohort view with
campaign stages: eligibility → appearance → referral → engagement → cta_lead → pipeline.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.discovery.http_client import DEFAULT_UA, Transport, UrllibTransport, request
from scripts.discovery.inspect import (
    inspect_asset,
    jsonld_types,
    load_sitemap_urls,
    parse_html,
    path_blocked_by_robots,
)
from scripts.discovery.metrics import count_event
from scripts.discovery.registry import repo_root
from scripts.discovery.url_inspection import founder_manual_checklist, inspect_urls
from scripts.revops.search_demand_observatory import (
    SEARCH_ANALYTICS_LIMITATION,
    complete_windows,
    credential_presence,
    ctr_optimization_decision,
    git_safe_aggregate,
    is_live_gsc_payload,
    snapshot_manifest,
    sync_incremental,
)

CAMPAIGN_ID = "CONFENGE-SEARCH-OBSERVABILITY-DISTRIBUTION-01"
CAMPAIGN_STAGES = (
    "eligibility",
    "appearance",
    "referral",
    "engagement",
    "cta_lead",
    "pipeline",
)
STAGE_STATUSES = frozenset({"TRUE", "FALSE", "UNKNOWN", "BLOCKED"})
OWNER = "Tiago Sasaki"

FROZEN_COHORT: list[dict[str, Any]] = [
    {
        "id": "limite-aditivo-25-50-obra-publica",
        "intent": "limite_aditivo_25_50",
        "canonical": "https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/",
        "local_path": "conteudos/limite-aditivo-25-50-obra-publica/index.html",
        "index_intent": "INDEX",
        "noindex": False,
        "fixture": False,
        "publicable": True,
        "category": "guide",
        "cta_id": "diagnosticar-contrato",
        "attribution_source": "CONFENGE_WEB",
        "content_version": "2026-08-17",
        "method_version": "UNKNOWN",
        "as_of": "2026-08-17",
        "freshness": "page_dateModified_2026-08-17",
        "correction_owner": OWNER,
    },
    {
        "id": "aditivos-obras-publicas",
        "intent": "aditivos_servicos_extras",
        "canonical": "https://confenge.com.br/aditivos-obras-publicas/",
        "local_path": "aditivos-obras-publicas/index.html",
        "index_intent": "INDEX",
        "noindex": False,
        "fixture": False,
        "publicable": True,
        "category": "hub",
        "cta_id": "diagnosticar-contrato",
        "attribution_source": "CONFENGE_WEB",
        "content_version": "2026-08-17",
        "method_version": "UNKNOWN",
        "as_of": "2026-08-17",
        "freshness": "page_dateModified_2026-08-17",
        "correction_owner": OWNER,
    },
    {
        "id": "reequilibrio-obras-publicas",
        "intent": "reequilibrio_economico_financeiro",
        "canonical": "https://confenge.com.br/reequilibrio-obras-publicas/",
        "local_path": "reequilibrio-obras-publicas/index.html",
        "index_intent": "INDEX",
        "noindex": False,
        "fixture": False,
        "publicable": True,
        "category": "hub",
        "cta_id": "diagnosticar-contrato",
        "attribution_source": "CONFENGE_WEB",
        "content_version": "2026-08-17",
        "method_version": "UNKNOWN",
        "as_of": "2026-08-17",
        "freshness": "page_dateModified_2026-08-17",
        "correction_owner": OWNER,
    },
    {
        "id": "valor-tipico-contratos-pavimentacao",
        "intent": "quanto_custa_ticket_contratual",
        "canonical": "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/",
        "local_path": "inteligencia/valor-tipico-contratos-pavimentacao/index.html",
        "index_intent": "INDEX",
        "noindex": False,
        "fixture": False,
        "publicable": True,
        "category": "market_answer",
        "cta_id": "veja-sua-empresa",
        "attribution_source": "CONFENGE_WEB",
        "content_version": "public-read-market-answer/1.0",
        "method_version": "integral-nominal-nearest-rank/1.0",
        "as_of": "2026-08-17",
        "freshness": "live_proven_pr113_2026-08-17",
        "correction_owner": OWNER,
    },
]

WATCHED_BOTS = ("Googlebot", "Bingbot", "OAI-SearchBot")
CAMPAIGN_DIR_REL = Path("docs/ops/campaigns") / CAMPAIGN_ID


def campaign_urls() -> list[str]:
    return [str(row["canonical"]) for row in FROZEN_COHORT]


def campaign_dir(root: Path | None = None) -> Path:
    return (root or repo_root()) / CAMPAIGN_DIR_REL


def load_live_gsc_snapshot(root: Path | None = None) -> dict[str, Any] | None:
    """Load only a provider-backed, decision-ready Search Analytics snapshot."""
    root = root or repo_root()
    path = root / "data/revops/gsc/latest_import.json"
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or not is_live_gsc_payload(payload):
        return None
    return payload


def gsc_page_evidence(payload: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Aggregate returned Search Analytics rows by canonical page.

    A missing page is deliberately absent from the result: Search Analytics
    returns top rows, so missing is not a proven zero.
    """
    out: dict[str, dict[str, Any]] = {}
    for row in (payload or {}).get("queries") or []:
        page = str(row.get("page") or "")
        if not page:
            continue
        cell = out.setdefault(
            page,
            {"returned_rows": 0, "impressions": 0.0, "clicks": 0.0, "max_date": None},
        )
        cell["returned_rows"] += 1
        cell["impressions"] += float(row.get("impressions") or 0)
        cell["clicks"] += float(row.get("clicks") or 0)
        row_date = row.get("date")
        if row_date and (cell["max_date"] is None or str(row_date) > cell["max_date"]):
            cell["max_date"] = str(row_date)
    return out



def appearance_from_gsc(
    *,
    page_gsc: dict[str, Any] | None,
    gsc_ready: bool,
    inspect_row: dict[str, Any] | None,
    credential_present: bool,
) -> dict[str, str]:
    """Map Search Analytics + URL Inspection to appearance.

    URL Inspection proves index/eligibility only. A campaign URL absent from
    Search Analytics top rows is UNKNOWN (missing_is_not_zero), never zero
    impressions/clicks. Inspection PASS cannot invent appearance.
    """
    inspect_row = inspect_row or {}
    if gsc_ready and page_gsc and float(page_gsc.get("impressions") or 0) > 0:
        return {
            "status": "TRUE",
            "note": (
                "search_analytics_api_returned_page_rows; "
                f"impressions={page_gsc['impressions']:g}; clicks={page_gsc['clicks']:g}; "
                f"returned_rows={page_gsc['returned_rows']}; max_date={page_gsc['max_date']}; "
                "impression_is_not_engagement"
            ),
        }
    if gsc_ready:
        if inspect_row.get("verdict") == "PASS":
            note = (
                "url_inspection_pass_but_no_page_row_returned_by_search_analytics; "
                "missing_top_row_is_not_zero"
            )
        else:
            note = "page_absent_from_returned_top_rows_missing_is_not_zero"
        return {"status": "UNKNOWN", "note": note}
    if not credential_present:
        return {"status": "BLOCKED", "note": "BLOCKED_GSC_READONLY_CREDENTIAL"}
    return {"status": "UNKNOWN", "note": "no_live_gsc_appearance; impression_is_not_engagement"}


def stage_cell(
    status: str,
    *,
    source: str,
    freshness: str,
    owner: str = OWNER,
    next_action: str,
    note: str | None = None,
) -> dict[str, Any]:
    if status not in STAGE_STATUSES:
        raise ValueError(f"invalid_stage_status:{status}")
    cell = {
        "status": status,
        "source": source,
        "freshness": freshness,
        "owner": owner,
        "next_action": next_action,
    }
    if note:
        cell["note"] = note
    return cell


def refuse_collapsed_stage(event_type: str, stage: str) -> None:
    """Delegate to the shipped metric-stage refusals. Overlay does not invent counts."""
    count_event(event_type, stage)


def parse_robots_bot_policy(robots_text: str, path: str) -> dict[str, Any]:
    """Public robots: * Allow:/ with specific Disallow. Named bots inherit unless blocked."""
    blocked = path_blocked_by_robots(path, robots_text)
    named: dict[str, str] = {}
    for bot in WATCHED_BOTS:
        named[bot] = "disallowed" if blocked else "allowed_via_star"
    return {
        "path": path,
        "star_blocked": blocked,
        "bots": named,
        "bot_hit_is_not_citation": True,
        "private_content_released": False,
    }


def _cta_and_attribution(html: str, expected_cta: str) -> dict[str, Any]:
    cta_present = expected_cta in html or "data-cta-id=" in html
    attribution = "CONFENGE_WEB" if (
        "CONFENGE_WEB" in html or 'data-route-family=' in html or "data-asset-id=" in html
    ) else "UNKNOWN"
    return {
        "cta_present": cta_present,
        "cta_id_expected": expected_cta,
        "attribution_ids_present": "data-cta-id=" in html or "data-asset-id=" in html,
        "attribution_source": attribution,
    }


def inspect_local(asset: dict[str, Any], *, root: Path) -> dict[str, Any]:
    inspected = inspect_asset(asset, root=root)
    page = root / str(asset["local_path"])
    html = page.read_text(encoding="utf-8", errors="replace") if page.is_file() else ""
    parsed = parse_html(html) if html else {}
    robots_text = (root / "robots.txt").read_text(encoding="utf-8", errors="replace")
    path = urlparse(str(asset["canonical"])).path or "/"
    cta = _cta_and_attribution(html, str(asset.get("cta_id") or ""))
    self_canonical = (
        (parsed.get("canonical") or "").rstrip("/") == str(asset["canonical"]).rstrip("/")
    )
    indexable = "noindex" not in str(parsed.get("robots") or "").lower()
    return {
        **inspected,
        "declared_canonical": parsed.get("canonical") or inspected.get("declared_canonical"),
        "self_canonical": self_canonical,
        "indexable_robots": indexable,
        "structured_data_visible": jsonld_types(parsed.get("jsonld") or inspected.get("jsonld") or []),
        "cta": cta,
        "bot_policy": parse_robots_bot_policy(robots_text, path),
        "copy_changed": False,
    }


def reprove_live(
    asset: dict[str, Any],
    *,
    root: Path,
    transport: Transport | None = None,
    timeout: float = 20.0,
) -> dict[str, Any]:
    """Live HTTP reproof of one frozen URL. GET only. No search queries."""
    local = inspect_local(asset, root=root)
    url = str(asset["canonical"])
    client = transport or UrllibTransport()
    hop = request("GET", url, transport=client, timeout=timeout, retries=1, user_agent=DEFAULT_UA)
    live_html = hop.text if hop.status == 200 and hop.body else ""
    parsed = parse_html(live_html) if live_html else {}
    declared = parsed.get("canonical") or ""
    self_canonical = declared.rstrip("/") == url.rstrip("/") if declared else False
    robots_meta = parsed.get("robots") or ""
    indexable = "noindex" not in robots_meta.lower() if robots_meta else False
    sitemap_live = False
    robots_live_text = ""
    robots_resp = request(
        "GET",
        "https://confenge.com.br/robots.txt",
        transport=client,
        timeout=timeout,
        retries=1,
        user_agent=DEFAULT_UA,
    )
    if robots_resp.status == 200:
        robots_live_text = robots_resp.text
    path = urlparse(url).path or "/"
    live_bot = parse_robots_bot_policy(robots_live_text or (root / "robots.txt").read_text(encoding="utf-8"), path)
    sm_resp = request(
        "GET",
        "https://confenge.com.br/sitemap.xml",
        transport=client,
        timeout=timeout,
        retries=1,
        user_agent=DEFAULT_UA,
    )
    sm_int = request(
        "GET",
        "https://confenge.com.br/sitemap-inteligencia.xml",
        transport=client,
        timeout=timeout,
        retries=1,
        user_agent=DEFAULT_UA,
    )
    sitemap_blob = (sm_resp.text if sm_resp.status == 200 else "") + (
        sm_int.text if sm_int.status == 200 else ""
    )
    sitemap_live = url in sitemap_blob
    cta = _cta_and_attribution(live_html, str(asset.get("cta_id") or ""))
    http_ok = hop.status == 200 and hop.error is None
    redirect = hop.status is not None and 300 <= hop.status < 400
    return {
        "id": asset["id"],
        "canonical": url,
        "http_status": hop.status,
        "http_error": hop.error,
        "redirect": bool(redirect),
        "self_canonical": self_canonical,
        "declared_canonical": declared or None,
        "robots_meta": robots_meta or None,
        "indexable_robots": indexable,
        "robots_txt_blocked": live_bot["star_blocked"],
        "bot_policy": live_bot,
        "sitemap": sitemap_live,
        "renderable": bool(parsed.get("renderable")),
        "structured_data_visible": jsonld_types(parsed.get("jsonld") or []),
        "title": parsed.get("title") or None,
        "h1": parsed.get("h1") or None,
        "cta": cta,
        "elapsed_ms": hop.elapsed_ms,
        "local": {
            "self_canonical": local.get("self_canonical"),
            "sitemap": local.get("sitemap"),
            "robots_meta": local.get("robots_meta"),
            "structured_data_visible": local.get("structured_data_visible"),
            "cta": local.get("cta"),
        },
        "copy_changed": False,
        "probed": True,
        "technical_ok": bool(
            http_ok
            and self_canonical
            and indexable
            and not live_bot["star_blocked"]
            and sitemap_live
            and parsed.get("renderable")
            and cta["cta_present"]
        ),
    }


def _eligibility_from_reproof(reproof: dict[str, Any], freshness: str) -> dict[str, Any]:
    if not reproof.get("probed"):
        local = reproof.get("local") or {}
        ok = bool(
            local.get("self_canonical")
            and local.get("sitemap")
            and local.get("cta", {}).get("cta_present")
        )
        return stage_cell(
            "TRUE" if ok else "UNKNOWN",
            source="local_inspect",
            freshness=freshness,
            next_action="keep_observe_do_not_change_copy",
            note="live HTTP not recorded; local files only",
        )
    if reproof.get("http_error"):
        return stage_cell(
            "UNKNOWN",
            source="live_http",
            freshness=freshness,
            next_action="retry_live_http",
            note=str(reproof.get("http_error")),
        )
    if reproof.get("technical_ok"):
        return stage_cell(
            "TRUE",
            source="live_http+local_inspect",
            freshness=freshness,
            next_action="keep_observe_do_not_change_copy",
        )
    return stage_cell(
        "FALSE",
        source="live_http+local_inspect",
        freshness=freshness,
        next_action="document_technical_defect_before_any_copy_change",
        note="see reproof fields",
    )


def build_stage_report(
    *,
    root: Path | None = None,
    generated_at: str | None = None,
    live: bool = False,
    transport: Transport | None = None,
    gsc_ready: bool | None = None,
) -> dict[str, Any]:
    root = root or repo_root()
    stamp = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sitemap = load_sitemap_urls(root)
    creds = credential_presence()
    gsc_snapshot = load_live_gsc_snapshot(root)
    snapshot_ready = bool(gsc_snapshot)
    if gsc_ready is None:
        gsc_ready = snapshot_ready
    else:
        gsc_ready = bool(gsc_ready and snapshot_ready)
    page_evidence = gsc_page_evidence(gsc_snapshot)
    urls = campaign_urls()
    inspections = inspect_urls(urls, inspected_at=stamp)
    assets_out: list[dict[str, Any]] = []
    for asset in FROZEN_COHORT:
        local = inspect_local(asset, root=root)
        if live:
            reproof = reprove_live(asset, root=root, transport=transport)
        else:
            reproof = {
                "id": asset["id"],
                "canonical": asset["canonical"],
                "probed": False,
                "http_status": None,
                "redirect": False,
                "self_canonical": local.get("self_canonical"),
                "robots_meta": local.get("robots_meta"),
                "indexable_robots": local.get("indexable_robots"),
                "robots_txt_blocked": local.get("robots_txt_blocked"),
                "bot_policy": local.get("bot_policy"),
                "sitemap": local.get("sitemap") or asset["canonical"] in sitemap,
                "renderable": local.get("renderability") == "static_html_present",
                "structured_data_visible": local.get("structured_data_visible"),
                "cta": local.get("cta"),
                "local": local,
                "copy_changed": False,
                "technical_ok": bool(
                    local.get("self_canonical")
                    and (local.get("sitemap") or asset["canonical"] in sitemap)
                    and local.get("cta", {}).get("cta_present")
                    and local.get("indexable_robots")
                ),
            }
        inspect_row = next(
            (row for row in inspections.get("inspections") or [] if row.get("url") == asset["canonical"]),
            {"index_state": "UNKNOWN", "ok": False, "error": "missing"},
        )
        page_gsc = page_evidence.get(asset["canonical"])
        appearance = appearance_from_gsc(
            page_gsc=page_gsc,
            gsc_ready=gsc_ready,
            inspect_row=inspect_row,
            credential_present=bool(creds["present"]),
        )
        appearance_status = appearance["status"]
        appearance_note = appearance["note"]
        stages = {
            "eligibility": _eligibility_from_reproof(reproof, stamp),
            "appearance": stage_cell(
                appearance_status,
                source="url_inspection+gsc_search_analytics",
                freshness=stamp,
                next_action=(
                    "observe_engagement_and_referral_separately"
                    if appearance_status == "TRUE"
                    else "continue_gsc_observation_missing_is_not_zero"
                ),
                note=appearance_note,
            ),
            "referral": stage_cell(
                "UNKNOWN",
                source="analytics_not_imported",
                freshness=stamp,
                next_action="import_referral_when_available",
                note="referral_is_not_lead; impression_is_not_referral",
            ),
            "engagement": stage_cell(
                "UNKNOWN",
                source="analytics_not_imported",
                freshness=stamp,
                next_action="observe_engaged_sessions_separately",
                note="impression_is_not_engagement",
            ),
            "cta_lead": stage_cell(
                "UNKNOWN",
                source="lead_store_not_joined",
                freshness=stamp,
                next_action="do_not_infer_lead_from_cta_presence",
                note="cta_present="
                + str(bool((reproof.get("cta") or {}).get("cta_present"))).lower()
                + "; cta_is_not_lead",
            ),
            "pipeline": stage_cell(
                "UNKNOWN",
                source="warmbly_not_observed",
                freshness=stamp,
                next_action="do_not_invent_pipeline",
                note="lead_is_not_pipeline",
            ),
        }
        assets_out.append(
            {
                "id": asset["id"],
                "intent": asset["intent"],
                "canonical": asset["canonical"],
                "index_intent": asset["index_intent"],
                "reproof": reproof,
                "url_inspection": {
                    "index_state": inspect_row.get("index_state") or "UNKNOWN",
                    "coverage_state": inspect_row.get("coverage_state") or "UNKNOWN",
                    "verdict": inspect_row.get("verdict") or "UNKNOWN",
                    "last_crawl": inspect_row.get("last_crawl") or "UNKNOWN",
                    "source": inspect_row.get("source") or "url_inspection_api",
                    "inspected_at": inspect_row.get("inspected_at") or stamp,
                    "ok": inspect_row.get("ok"),
                    "error": inspect_row.get("error"),
                    "indexing_api_called": False,
                },
                "gsc_search_analytics": page_gsc or {
                    "returned_rows": None,
                    "impressions": None,
                    "clicks": None,
                    "max_date": None,
                    "reason": "page_absent_from_returned_top_rows_missing_is_not_zero",
                },
                "stages": stages,
                "copy_changed": False,
            }
        )
    return {
        "schema": "campaign_search_overlay_v1",
        "campaign": CAMPAIGN_ID,
        "related_issue": 86,
        "mode": "overlay",
        "replaces_86_registry": False,
        "llms_txt_strategy": False,
        "geo_hacks": False,
        "cloaking": False,
        "fake_citations": False,
        "generated_at": stamp,
        "network_probed": live,
        "gsc_credential_present": creds["present"],
        "ready_for_product_decisions": bool(creds["present"] and gsc_ready),
        "live_baseline_invented": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "gsc_sync": {
            "ok": bool(gsc_snapshot),
            "source": (gsc_snapshot or {}).get("source") or "none",
            "synthetic": bool((gsc_snapshot or {}).get("synthetic")),
            "max_date": (gsc_snapshot or {}).get("max_date"),
            "latency_ms": (gsc_snapshot or {}).get("latency_ms"),
            "rows": (gsc_snapshot or {}).get("query_count"),
            "ready_for_product_decisions": bool(
                (gsc_snapshot or {}).get("ready_for_product_decisions")
            ),
            "manifest_sha256": ((gsc_snapshot or {}).get("manifest") or {}).get(
                "content_sha256"
            ),
        },
        "stage_rules": {
            "impression_is_not_engagement": True,
            "impression_is_not_referral": True,
            "indexnow_receipt_is_not_index": True,
            "crawler_hit_is_not_citation": True,
            "url_inspection_is_not_appearance": True,
            "cta_is_not_lead": True,
            "lead_is_not_pipeline": True,
            "missing_day_is_not_zero": True,
        },
        "windows": complete_windows(
            today=datetime.now(timezone.utc).date(),
            provider_max_date=None,
        ),
        "url_inspection_summary": {
            "indexing_api_called": False,
            "error": inspections.get("error"),
            "credential_present": inspections.get("credential_present"),
        },
        "assets": assets_out,
        "public_urls": urls,
        "new_public_url_created": False,
    }


def format_stage_report(report: dict[str, Any]) -> str:
    lines = [
        "CAMPAIGN SEARCH OVERLAY",
        f"campaign: {report['campaign']}",
        f"generated_at: {report['generated_at']}",
        f"network_probed: {str(report['network_probed']).lower()}",
        f"ready_for_product_decisions: {str(report['ready_for_product_decisions']).lower()}",
        f"live_baseline_invented: {str(report['live_baseline_invented']).lower()}",
        f"search_analytics_limitation: {report['search_analytics_limitation']}",
        "",
        "STAGES per URL: eligibility -> appearance -> referral -> engagement -> cta_lead -> pipeline",
        "values: TRUE | FALSE | UNKNOWN | BLOCKED",
        "",
    ]
    for asset in report["assets"]:
        lines.append(f"URL {asset['canonical']}")
        lines.append(f"  intent: {asset['intent']}")
        reproof = asset.get("reproof") or {}
        lines.append(f"  http: {reproof.get('http_status')}")
        lines.append(f"  self_canonical: {reproof.get('self_canonical')}")
        lines.append(f"  robots: {reproof.get('robots_meta')}")
        lines.append(f"  sitemap: {reproof.get('sitemap')}")
        lines.append(f"  url_inspection: {asset['url_inspection']['index_state']}")
        for stage in CAMPAIGN_STAGES:
            cell = asset["stages"][stage]
            lines.append(
                f"  {stage}: {cell['status']} source={cell['source']} "
                f"freshness={cell['freshness']} owner={cell['owner']} "
                f"next={cell['next_action']}"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def write_campaign_artifacts(
    report: dict[str, Any],
    *,
    root: Path | None = None,
    gsc_sync: dict[str, Any] | None = None,
) -> dict[str, Path]:
    root = root or repo_root()
    gsc_sync = gsc_sync or report.get("gsc_sync") or {}
    dest = campaign_dir(root)
    dest.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}

    status_path = dest / "COHORT_STATUS.json"
    status_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    written["COHORT_STATUS.json"] = status_path

    metrics = {
        "schema": "campaign_metrics_summary_v1",
        "campaign": CAMPAIGN_ID,
        "generated_at": report["generated_at"],
        "ready_for_product_decisions": report["ready_for_product_decisions"],
        "live_baseline_invented": False,
        "synthetic_gsc": True if not report.get("gsc_credential_present") else False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "gsc_sync": {
            "ok": bool(gsc_sync.get("ok")),
            "source": gsc_sync.get("source") or "none",
            "synthetic": bool(gsc_sync.get("synthetic")),
            "max_date": gsc_sync.get("max_date"),
            "latency_ms": gsc_sync.get("latency_ms"),
            "rows": gsc_sync.get("rows"),
            "ready_for_product_decisions": bool(gsc_sync.get("ready_for_product_decisions")),
            "manifest_sha256": gsc_sync.get("manifest_sha256"),
        },
        "urls": [
            {
                "id": a["id"],
                "canonical": a["canonical"],
                "intent": a["intent"],
                "stages": {k: v["status"] for k, v in a["stages"].items()},
            }
            for a in report["assets"]
        ],
        "ctr_rule": ctr_optimization_decision(0),
    }
    metrics_path = dest / "METRICS_SUMMARY.json"
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    written["METRICS_SUMMARY.json"] = metrics_path

    checklist_rows = []
    for asset in report["assets"]:
        reproof = asset.get("reproof") or {}
        tech_bits = [
            f"http={reproof.get('http_status')}",
            f"canonical={'self' if reproof.get('self_canonical') else 'UNKNOWN'}",
            f"robots={reproof.get('robots_meta') or 'UNKNOWN'}",
            f"sitemap={reproof.get('sitemap')}",
        ]
        checklist_rows.append(
            {
                "url": asset["canonical"],
                "technical_state": "; ".join(tech_bits),
                "inspection_field": (
                    f"{asset['url_inspection']['index_state']}; "
                    f"verdict={asset['url_inspection']['verdict']}; "
                    f"last_crawl={asset['url_inspection']['last_crawl']}"
                ),
            }
        )
    manual = founder_manual_checklist(checklist_rows, inspected_at=report["generated_at"])
    manual_path = dest / "FOUNDER_GSC_MANUAL_4_URLS.txt"
    manual_path.write_text(manual, encoding="utf-8")
    written["FOUNDER_GSC_MANUAL_4_URLS.txt"] = manual_path

    action = (
        founder_action_required_gsc()
        if not report.get("gsc_credential_present")
        else founder_action_resolved_gsc(report)
    )
    action_path = dest / "FOUNDER_ACTION_REQUIRED_GSC.txt"
    action_path.write_text(action, encoding="utf-8")
    written["FOUNDER_ACTION_REQUIRED_GSC.txt"] = action_path

    evidence = render_evidence_md(report, gsc_sync=gsc_sync)
    evidence_path = dest / "EVIDENCE.md"
    evidence_path.write_text(evidence, encoding="utf-8")
    written["EVIDENCE.md"] = evidence_path
    return written


def founder_action_required_gsc() -> str:
    return (
        "FOUNDER ACTION REQUIRED — GSC READ-ONLY CREDENTIAL\n"
        "\n"
        "email/role: tiago.sasaki@confenge.com.br as Owner or Full user of the\n"
        "Search Console property (service account invited as Restricted/Full with\n"
        "read-only API use).\n"
        "\n"
        "property: sc-domain:confenge.com.br\n"
        "         (fallback: https://confenge.com.br/)\n"
        "\n"
        "scope (minimum, read-only):\n"
        "  https://www.googleapis.com/auth/webmasters.readonly\n"
        "\n"
        "variable/path (do not paste JSON into chat or git):\n"
        "  GSC_SITE_URL=sc-domain:confenge.com.br\n"
        "  GSC_CREDENTIALS_JSON=/secure/path/gsc-service-account.json\n"
        "  # alternative: GSC_CLIENT_SECRETS_JSON + GSC_TOKEN_JSON\n"
        "\n"
        "smoke test (does not print credential JSON):\n"
        "  python3 scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke\n"
        "\n"
        "expected first line when still blocked:\n"
        "  GSC_SMOKE ok=false error=missing_credentials site=sc-domain:confenge.com.br …\n"
        "\n"
        "Do not invent a live baseline. Existing snapshots stay synthetic/fixture\n"
        "with ready_for_product_decisions=false until this handoff succeeds.\n"
    )


def founder_action_resolved_gsc(report: dict[str, Any]) -> str:
    sync = report.get("gsc_sync") or {}
    return (
        "FOUNDER ACTION RESOLVED — GSC READ-ONLY CREDENTIAL\n\n"
        "property: sc-domain:confenge.com.br\n"
        "service_account: confenge-gsc-observer@pncp-486312.iam.gserviceaccount.com\n"
        "permission: Restricted\n"
        "scope: https://www.googleapis.com/auth/webmasters.readonly\n"
        "credential_location: local secure path; not in git\n\n"
        f"sync_source: {sync.get('source') or 'none'}\n"
        f"max_date: {sync.get('max_date')}\n"
        f"rows: {sync.get('rows')}\n"
        f"ready_for_product_decisions: {str(bool(sync.get('ready_for_product_decisions'))).lower()}\n"
        f"resolved_at: {report.get('generated_at')}\n\n"
        "Search Analytics returns top rows and is not an exhaustive total.\n"
        "No credential JSON or private key is stored in this repository.\n"
    )


def render_evidence_md(report: dict[str, Any], *, gsc_sync: dict[str, Any] | None = None) -> str:
    lines = [
        f"# Evidence — {CAMPAIGN_ID}",
        "",
        f"Generated: `{report['generated_at']}`",
        "Related issue: [#86](https://github.com/tjsasakifln/web-cfg/issues/86)",
        "Decision: VALIDATE / EXECUTE_NOW for observability + unsent distribution kit.",
        "Leverage: data + distribution + trust. Time to evidence: this PR.",
        "",
        "## Frozen cohort",
        "",
    ]
    for asset in report["assets"]:
        lines.append(f"- `{asset['canonical']}` intent=`{asset['intent']}`")
    lines.extend(
        [
            "",
            "## Technical reproof",
            "",
            "| URL | HTTP | self-canonical | robots | sitemap | SD | CTA | copy |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for asset in report["assets"]:
        r = asset.get("reproof") or {}
        sd = ",".join(r.get("structured_data_visible") or []) or "UNKNOWN"
        cta = (r.get("cta") or {}).get("cta_present")
        lines.append(
            f"| {asset['canonical']} | {r.get('http_status')} | {r.get('self_canonical')} | "
            f"{r.get('robots_meta')} | {r.get('sitemap')} | {sd} | {cta} | unchanged |"
        )
    lines.extend(
        [
            "",
            "## Stages",
            "",
            "Impression ≠ engagement ≠ referral ≠ lead. IndexNow receipt ≠ index. "
            "Crawler hit ≠ citation. URL Inspection ≠ appearance.",
            "",
        ]
    )
    for asset in report["assets"]:
        lines.append(f"### {asset['id']}")
        for stage in CAMPAIGN_STAGES:
            cell = asset["stages"][stage]
            line = (
                f"- **{stage}**: `{cell['status']}` · source `{cell['source']}` · "
                f"freshness `{cell['freshness']}` · owner `{cell['owner']}` · next `{cell['next_action']}`"
            )
            if cell.get("note"):
                line += f" · observation `{cell['note']}`"
            lines.append(line)
        lines.append("")
    gsc = gsc_sync or {}
    lines.extend(
        [
            "## GSC collector",
            "",
            f"- credential present: `{report.get('gsc_credential_present')}`",
            f"- ready_for_product_decisions: `{report.get('ready_for_product_decisions')}`",
            f"- live baseline invented: `false`",
            f"- sync source: `{gsc.get('source')}`",
            f"- max_date: `{gsc.get('max_date')}`",
            f"- latency_ms: `{gsc.get('latency_ms')}`",
            f"- limitation: {SEARCH_ANALYTICS_LIMITATION}",
            "",
            "## Reproduction",
            "",
            "```bash",
            "python3 scripts/revops/search_demand_observatory.py sync --fixture",
            "python3 scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke",
            "python3 -m scripts.discovery campaign-report --as-of " + report["generated_at"],
            "python3 -m scripts.discovery indexnow --url "
            + " --url ".join(report["public_urls"]),
            "```",
            "",
            "Raw query rows stay out of git. See `.gitignore` `data/revops/gsc/private/`.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def run_fixture_collector() -> dict[str, Any]:
    return sync_incremental(use_fixture=True)


def overlay_git_safe_from_fixture() -> dict[str, Any]:
    result = run_fixture_collector()
    fixture = repo_root() / "data" / "revops" / "gsc" / "fixtures" / "sample_rows.json"
    rows = json.loads(fixture.read_text(encoding="utf-8")) if fixture.is_file() else []
    return {
        "sync": result,
        "aggregate": git_safe_aggregate(rows),
        "manifest": snapshot_manifest(
            source="fixture",
            rows=rows,
            max_date=result.get("max_date"),
            latency_ms=result.get("latency_ms"),
            ready_for_product_decisions=False,
            synthetic=True,
        ),
    }
