"""Build and validate the Search Ads canary package. No spend path."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

from scripts.paid_search.schema import (
    ALLOWED_CHANNELS,
    ALLOWED_MATCH_TYPES,
    ATTRIBUTION_URL_ALLOWLIST,
    CAMPAIGN_ID,
    CONVERSION_HIERARCHY,
    DEFAULT_KILL_THRESHOLDS,
    FORBIDDEN_AUDIENCE_MODES,
    FORBIDDEN_CHANNELS,
    FORBIDDEN_MATCH_TYPES,
    FORBIDDEN_PARAM_NAMES,
    FORBIDDEN_PRIMARY_METRICS,
    HUMAN_REQUIRED_FIELDS,
    ISSUE,
    KILL_SPECS,
    NEGATIVE_STEMS,
    PRIMARY_METRIC,
    SCHEMA,
    SOURCE,
    UNKNOWN,
)


def _human_required() -> dict[str, Any]:
    return {
        field: {
            "status": "HUMAN_REQUIRED",
            "approved": False,
            "value": None,
        }
        for field in HUMAN_REQUIRED_FIELDS
    }


def _terms_from_queries(queries: list[dict[str, Any]]) -> dict[str, Any]:
    exact: list[str] = []
    phrase: list[str] = []
    seen_exact: set[str] = set()
    seen_phrase: set[str] = set()
    for row in queries:
        text = str(row.get("query") or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key not in seen_exact:
            seen_exact.add(key)
            exact.append(text)
        if key not in seen_phrase:
            seen_phrase.add(key)
            phrase.append(text)
        # Substring phrase only when it is a contiguous token run of the evidenced query.
        tokens = text.split()
        if len(tokens) >= 3:
            shorter = " ".join(tokens[:3])
            sk = shorter.casefold()
            if sk not in seen_phrase:
                seen_phrase.add(sk)
                phrase.append(shorter)
    return {
        "exact": [{"text": t, "match_type": "EXACT"} for t in exact],
        "phrase": [{"text": t, "match_type": "PHRASE"} for t in phrase],
    }


def _negatives(winner_id: str, families: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(text: str, match_type: str, reason: str) -> None:
        key = f"{match_type}:{text.casefold()}"
        if not text or key in seen:
            return
        seen.add(key)
        out.append({"text": text, "match_type": match_type, "reason": reason})

    for stem in NEGATIVE_STEMS:
        add(stem, "PHRASE", "pre_registered_junk_or_wrong_family")
    add("confenge", "PHRASE", "brand_split_non_brand_canary")
    add("smartlic", "PHRASE", "legacy_brand_forbidden")

    for family in families:
        if family.get("id") == winner_id:
            continue
        for row in family.get("gsc_queries") or []:
            query = str(row.get("query") or "").strip()
            if query:
                add(query, "EXACT", f"other_family:{family.get('id')}")
    return out


def _final_url(landing: dict[str, Any], family_id: str, cluster: str) -> dict[str, Any]:
    canonical = landing.get("canonical") or ""
    params = {
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": f"{CAMPAIGN_ID}-{family_id}",
        "utm_content": "{matchtype}",
        "utm_term": "{keyword}",
        "jornada": landing.get("jornada") or "contrato",
        "origem": landing.get("path") or "",
        "landing_page": landing.get("path") or "",
        "route_family": landing.get("route_family") or "",
        "cta_id": landing.get("cta_id") or "",
        "asset_id": landing.get("asset_id") or "",
        "intent": "operational_urgency" if family_id == "glosa_medicao" else "contract_review",
        "content_cluster": cluster or "",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items() if v)
    return {
        "base": canonical,
        "params": params,
        "url": f"{canonical}?{query}" if canonical else "",
        "allowlist": list(ATTRIBUTION_URL_ALLOWLIST),
    }


def build_package(selection: dict[str, Any]) -> dict[str, Any]:
    family = selection.get("family") or {}
    landing = family.get("landing") or {}
    terms = _terms_from_queries(family.get("gsc_queries") or [])
    final_url = _final_url(
        landing,
        str(family.get("id") or "unknown"),
        str(family.get("cluster") or ""),
    )
    return {
        "schema": SCHEMA,
        "issue": ISSUE,
        "campaign_id": CAMPAIGN_ID,
        "decision": selection.get("decision"),
        "channel": "SEARCH",
        "match_types_allowed": sorted(ALLOWED_MATCH_TYPES),
        "hypothesis": selection.get("hypothesis"),
        "family": {
            "id": family.get("id"),
            "label": family.get("label"),
            "cluster": family.get("cluster"),
            "event_family": family.get("event_family"),
            "score": family.get("score"),
            "eligible": family.get("eligible"),
            "ineligible_reasons": family.get("ineligible_reasons") or [],
            "organic_demand": family.get("organic_demand"),
            "paid_demand": family.get("paid_demand"),
            "gsc_queries": family.get("gsc_queries") or [],
            "gsc_totals": family.get("gsc_totals"),
        },
        "icp": selection.get("icp"),
        "geography": selection.get("geography"),
        "device": selection.get("device"),
        "schedule": selection.get("schedule"),
        "exclusions": selection.get("exclusions"),
        "brand_non_brand": {
            "canary_split": "non_brand",
            "brand_terms": [
                {"text": "confenge", "match_type": "EXACT", "ad_group": "brand_holdout"}
            ],
            "note": "Brand is recorded and excluded from the non-brand canary. Not a second campaign.",
        },
        "terms": terms,
        "negatives": _negatives(str(family.get("id")), selection.get("families") or []),
        "landing": landing,
        "conversion_hierarchy": list(CONVERSION_HIERARCHY),
        "conversion_definitions": {
            "qualified_engagement": (
                "asset_view plus at least one of contract_selected, "
                "contract_analyzed, cta_view"
            ),
            "valid_lead": (
                "lead_created with persisted id, consent, and complete "
                "CONFENGE_WEB attribution"
            ),
            "qualified_lead": (
                "reserved — operator/Warmbly signal. Stays "
                f"{UNKNOWN} until observed."
            ),
            "meeting_pipeline": (
                f"reserved — Warmbly meeting/pipeline. Stays {UNKNOWN} until observed."
            ),
        },
        "events": [
            "organic_landing",
            "asset_view",
            "contract_selected",
            "contract_analyzed",
            "cta_view",
            "cta_click",
            "lead_created",
            "qualified_lead",
        ],
        "primary_metric": {
            "name": PRIMARY_METRIC,
            "not": sorted(FORBIDDEN_PRIMARY_METRICS),
            "definition": (
                "qualified_lead + meeting_pipeline + material Demand Engine "
                "candidate/rejection learning, per real approved spend. "
                "Click and CTR are diagnostics, never the objective."
            ),
        },
        "attribution": {
            "source": SOURCE,
            "contract": "confenge.inbound.v1",
            "final_url": final_url,
            "keep_list": list(ATTRIBUTION_URL_ALLOWLIST),
            "forbidden_params": sorted(FORBIDDEN_PARAM_NAMES),
            "pii_in_ads": False,
            "pii_in_params": False,
            "pii_in_analytics": False,
        },
        "human_required": _human_required(),
        "kill": {
            "specs": [dict(spec) for spec in KILL_SPECS],
            "thresholds": dict(DEFAULT_KILL_THRESHOLDS),
            "observed": {
                "spend_brl": 0,
                "hard_stop_spend_brl": None,
                "qualified_intent_signals": 0,
                "search_term_mismatch_rate": 0,
                "search_terms_observed": 0,
                "valid_leads": 0,
                "qualified_lead_rate": 0,
                "tracking_reconcile_ok": True,
                **DEFAULT_KILL_THRESHOLDS,
            },
            "note": "Observed spend stays 0 until a human authorizes an account and cap.",
        },
        "forbidden": {
            "channels": sorted(FORBIDDEN_CHANNELS),
            "match_types": sorted(FORBIDDEN_MATCH_TYPES),
            "audiences": sorted(FORBIDDEN_AUDIENCE_MODES),
            "ads_mutate": True,
            "spend_without_approval": True,
        },
        "demand_engine": {
            "status": (selection.get("demand_engine") or {}).get("status"),
            "available": (selection.get("demand_engine") or {}).get("available"),
            "schema": (selection.get("demand_engine") or {}).get("schema"),
            "authorizes_page": False,
            "prerequisite": (selection.get("demand_engine") or {}).get("prerequisite"),
            "next_command": (selection.get("demand_engine") or {}).get("next_command"),
        },
        "snapshots": selection.get("snapshots") or [],
        "go_live": False,
        "executable": False,
        "campaign_created": False,
        "spend_authorized": False,
        "ads_mutate": False,
    }


def _human_approved(package: dict[str, Any]) -> tuple[bool, list[str]]:
    missing: list[str] = []
    block = package.get("human_required") or {}
    for field in HUMAN_REQUIRED_FIELDS:
        slot = block.get(field) or {}
        if slot.get("status") == "HUMAN_REQUIRED" and not slot.get("approved"):
            missing.append(f"HUMAN_REQUIRED_{field.upper()}")
        elif not slot.get("approved"):
            missing.append(f"HUMAN_REQUIRED_{field.upper()}")
        elif slot.get("value") in (None, "", 0, "0"):
            missing.append(f"HUMAN_REQUIRED_{field.upper()}_VALUE")
    return (not missing, missing)


def _match_types_used(package: dict[str, Any]) -> list[str]:
    used: list[str] = []
    terms = package.get("terms") or {}
    for group in ("exact", "phrase", "broad", "other"):
        for row in terms.get(group) or []:
            used.append(str(row.get("match_type") or "").upper())
    for row in package.get("negatives") or []:
        used.append(str(row.get("match_type") or "").upper())
    extra = package.get("match_types") or package.get("match_types_used") or []
    used.extend(str(x).upper() for x in extra)
    return used


def validate_package(package: dict[str, Any]) -> dict[str, Any]:
    reasons: list[str] = []
    if not isinstance(package, dict):
        return {"ok": False, "reasons": ["PACKAGE_NOT_OBJECT"]}
    if package.get("schema") != SCHEMA:
        reasons.append("SCHEMA_MISMATCH")
    if package.get("decision") != "SELECTED":
        reasons.append("FAMILY_NOT_SELECTED")
    family = package.get("family") or {}
    if not family.get("id") or not family.get("gsc_queries"):
        reasons.append("FAMILY_EVIDENCE_MISSING")
    if family.get("paid_demand") not in (UNKNOWN, None) and family.get("paid_demand") == 0:
        reasons.append("PAID_DEMAND_COERCED")
    if str(family.get("paid_demand") or UNKNOWN) != UNKNOWN:
        # Paid demand may only be UNKNOWN until real spend exists.
        if family.get("paid_demand") != UNKNOWN:
            reasons.append("PAID_DEMAND_INVENTED")
    landing = package.get("landing") or {}
    if not landing.get("exists"):
        reasons.append("LANDING_MISSING")
    if landing.get("noindex"):
        reasons.append("LANDING_NOINDEX")
    if landing.get("wrong_landing"):
        reasons.append("WRONG_LANDING")
    if not landing.get("eligible"):
        reasons.append("LANDING_INELIGIBLE")

    channel = str(package.get("channel") or "").upper()
    if channel in FORBIDDEN_CHANNELS or channel == "PMAX":
        reasons.append("PMAX_OR_FORBIDDEN_CHANNEL")
    if channel not in ALLOWED_CHANNELS:
        reasons.append("CHANNEL_NOT_SEARCH")

    for match in _match_types_used(package):
        if match in FORBIDDEN_MATCH_TYPES or match == "BROAD":
            reasons.append("BROAD_MATCH")
            break
        if match and match not in ALLOWED_MATCH_TYPES:
            reasons.append("MATCH_TYPE_FORBIDDEN")
            break

    audiences = package.get("audiences") or package.get("audience_modes") or []
    for aud in audiences:
        if str(aud).upper() in FORBIDDEN_AUDIENCE_MODES:
            reasons.append("RETARGETING")
            break
    if package.get("retargeting") or package.get("remarketing"):
        reasons.append("RETARGETING")

    primary = package.get("primary_metric") or {}
    primary_name = str(primary.get("name") or primary or "").lower()
    if primary_name in FORBIDDEN_PRIMARY_METRICS:
        reasons.append("PRIMARY_IS_CLICK_OR_CTR")
    if PRIMARY_METRIC not in primary_name and primary_name != PRIMARY_METRIC:
        reasons.append("PRIMARY_METRIC_MISSING")

    hierarchy = list(package.get("conversion_hierarchy") or [])
    if hierarchy != list(CONVERSION_HIERARCHY):
        reasons.append("CONVERSION_HIERARCHY_INCOMPLETE")

    events = set(package.get("events") or [])
    for required in ("asset_view", "cta_click", "lead_created"):
        if required not in events:
            reasons.append("TRACKING_INCOMPLETE")
            break

    attr = package.get("attribution") or {}
    if attr.get("source") != SOURCE:
        reasons.append("ATTRIBUTION_SOURCE")
    final_url = (attr.get("final_url") or {}).get("url") or attr.get("url") or ""
    pii_reasons = detect_pii(final_url, attr.get("final_url") or {})
    reasons.extend(pii_reasons)

    _, human_missing = _human_approved(package)
    reasons.extend(human_missing)

    # unique, stable order
    ordered: list[str] = []
    for reason in reasons:
        if reason not in ordered:
            ordered.append(reason)
    ok = not ordered
    return {
        "ok": ok,
        "reasons": ordered,
        "go_live": False if human_missing or ordered else True,
        "human_required_blocking": human_missing,
    }


def detect_pii(url: str, final_url: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    params = dict(final_url.get("params") or {})
    parsed = urlparse(url or "")
    for key, values in parse_qs(parsed.query, keep_blank_values=True).items():
        params.setdefault(key, values[0] if values else "")
    for key, value in params.items():
        low = str(key).lower()
        if low in FORBIDDEN_PARAM_NAMES:
            reasons.append("PII_IN_PARAMS")
            break
        if low not in ATTRIBUTION_URL_ALLOWLIST and low not in {"utm_source", "utm_medium"}:
            # gclid is added by Google, not by us; still refuse if we authored it
            if low in {"gclid", "wbraid", "gbraid"}:
                reasons.append("TRACKING_INCOMPLETE")
                break
            if low not in ATTRIBUTION_URL_ALLOWLIST:
                reasons.append("PII_IN_PARAMS")
                break
        text = str(value or "")
        if re.search(r"@", text) or re.search(r"\d{14}", re.sub(r"\D", "", text)):
            reasons.append("PII_IN_PARAMS")
            break
    return reasons
