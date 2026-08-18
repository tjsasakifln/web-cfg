"""Independent discovery states. Pure functions over already-collected facts.

HTTP 200 + robots allow + sitemap listing is publication, not INDEXED and
not DISCOVERED. A ``site:`` hit is a weak signal and never INDEXED.
Missing GSC/credentials is UNKNOWN or BLOCKED, never FALSE.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from scripts.discovery.observation import (
    REASON_CANONICAL_DIVERGENT,
    REASON_GSC_NOT_PROVIDED,
    REASON_HTTP_429,
    REASON_HTTP_5XX,
    REASON_HTTP_TIMEOUT,
    REASON_HTTP_UNAVAILABLE,
    REASON_OUTCOME_NOT_PROVIDED,
    REASON_PROVEN_ZERO,
    REASON_ROBOTS_BLOCKING,
    REASON_SITEMAP_ABSENT,
    REASON_UNEXPECTED_EXTERNAL_REDIRECT,
    REASON_ZERO_ROWS,
)

TRUE = "TRUE"
FALSE = "FALSE"
UNKNOWN = "UNKNOWN"
BLOCKED = "BLOCKED"

STATE_VALUES = frozenset({TRUE, FALSE, UNKNOWN, BLOCKED})
STATE_NAMES = (
    "HTTP_OK",
    "CRAWL_ALLOWED",
    "SITEMAP_LISTED",
    "CANONICAL_VALID",
    "DISCOVERED",
    "INDEXED",
    "IMPRESSION",
    "CLICK",
    "LEAD",
    "REVENUE",
)

STRENGTH_STRONG = "strong"
STRENGTH_WEAK = "weak"
STRENGTH_NONE = "none"

SOURCE_PUBLIC_HTTP = "public_http_get_head"
SOURCE_GSC_EXPORT = "gsc_export"
SOURCE_GSC_API = "gsc_api"
SOURCE_SITE_OPERATOR = "site_operator"
SOURCE_OUTCOME = "outcome_export"
SOURCE_NONE = "none"

REASON_PROBE_NOT_PROVIDED = "PROBE_NOT_PROVIDED"
REASON_HTTP_4XX = "HTTP_4XX"
REASON_REDIRECT_NOT_RESOLVED = "REDIRECT_NOT_RESOLVED"
REASON_SITE_OPERATOR_WEAK = "SITE_OPERATOR_WEAK"
REASON_PUBLICATION_IS_NOT_INDEX = "PUBLICATION_IS_NOT_INDEX"
REASON_PUBLICATION_IS_NOT_DISCOVERY = "PUBLICATION_IS_NOT_DISCOVERY"
REASON_INDEX_STATE_NOT_PROVIDED = "INDEX_STATE_NOT_PROVIDED"
REASON_ZERO_IMPRESSIONS_NOT_ABSENT = "ZERO_IMPRESSIONS_IS_NOT_NOT_DISCOVERED"
REASON_OPAQUE_LEAD_NOT_LEAD = "OPAQUE_LEAD_ID_IS_NOT_LEAD"
REASON_GSC_BLOCKED = "BLOCKED_GSC_READONLY_CREDENTIAL"
REASON_NO_EXPLICIT_INDEX_STATE = "NO_EXPLICIT_INDEX_STATE"

SITE_OPERATOR_SOURCES = frozenset(
    {"site_operator", "site:", "google_site_operator", "bing_site_operator"}
)
INDEXED_VERDICTS = frozenset(
    {
        "indexed",
        "submitted and indexed",
        "url is on google",
        "submitted_and_indexed",
        "url_is_on_google",
    }
)
DISCOVERED_VERDICTS = frozenset(
    {
        "discovered",
        "discovered - currently not indexed",
        "crawled - currently not indexed",
        "discovered_not_indexed",
        "crawled_not_indexed",
    }
)

GSC_ACCESS_NOT_PROVIDED = "not_provided"
GSC_ACCESS_IMPORTED = "imported"
GSC_ACCESS_BLOCKED = "blocked"


def normalize_url(url: str | None) -> str:
    if not url:
        return ""
    text = str(url).strip()
    if not text:
        return ""
    parsed = urlparse(text)
    path = parsed.path or "/"
    if not path.endswith("/"):
        path = path + "/"
    host = (parsed.hostname or "").lower()
    scheme = parsed.scheme or "https"
    return f"{scheme}://{host}{path}"


def _cell(
    value: str,
    *,
    source: str,
    strength: str,
    reason: str,
    previous: str | None = None,
    evidence_hash: str | None = None,
) -> dict[str, Any]:
    if value not in STATE_VALUES:
        raise ValueError(f"invalid_state_value:{value}")
    cell: dict[str, Any] = {
        "value": value,
        "source": source,
        "strength": strength,
        "reason": reason,
        "previous": previous,
    }
    if evidence_hash:
        cell["evidence_hash"] = evidence_hash
    return cell


def _terminal_http(probe: dict[str, Any] | None) -> dict[str, Any]:
    if not probe:
        return {"status": None, "error": None, "classification": None, "reasons": []}
    http = probe.get("http") if isinstance(probe.get("http"), dict) else {}
    chain = http.get("chain") if isinstance(http.get("chain"), list) else []
    last = chain[-1] if chain else {}
    status = http.get("status")
    if status is None:
        status = last.get("status")
    return {
        "status": status,
        "error": last.get("error") or probe.get("status"),
        "classification": last.get("classification"),
        "reasons": list(probe.get("reason_codes") or []),
        "record_hash": probe.get("record_hash"),
    }


def _has_site_operator(rows: list[dict[str, Any]]) -> bool:
    for row in rows:
        source = str(row.get("source") or "")
        dims = row.get("dimensions") if isinstance(row.get("dimensions"), dict) else {}
        signal = str(dims.get("signal") or dims.get("operator") or "")
        if source in SITE_OPERATOR_SOURCES or signal in SITE_OPERATOR_SOURCES or signal == "site:":
            return True
    return False


def _explicit_index_verdict(rows: list[dict[str, Any]]) -> str | None:
    for row in rows:
        dims = row.get("dimensions") if isinstance(row.get("dimensions"), dict) else {}
        metrics = row.get("metrics") if isinstance(row.get("metrics"), dict) else {}
        candidates = (
            dims.get("index_state"),
            dims.get("coverage_state"),
            dims.get("inspection_verdict"),
            metrics.get("index_state"),
        )
        for raw in candidates:
            if raw in (None, ""):
                continue
            token = str(raw).strip().lower()
            if token in INDEXED_VERDICTS or token is True or token == "true":
                return "indexed"
            if token in DISCOVERED_VERDICTS:
                return "discovered"
    return None


def derive_gsc_access(gsc_rows: list[dict[str, Any]], *, declared: str | None = None) -> str:
    if declared in {GSC_ACCESS_BLOCKED, GSC_ACCESS_IMPORTED, GSC_ACCESS_NOT_PROVIDED}:
        return declared
    for row in gsc_rows:
        reasons = row.get("reason_codes") or []
        if REASON_GSC_BLOCKED in reasons or row.get("status") == BLOCKED:
            return GSC_ACCESS_BLOCKED
        source = str(row.get("source") or "")
        if source in {SOURCE_GSC_API, "gsc_api_blocked"}:
            if row.get("status") in {BLOCKED, "UNAVAILABLE"}:
                return GSC_ACCESS_BLOCKED
    if gsc_rows:
        return GSC_ACCESS_IMPORTED
    return GSC_ACCESS_NOT_PROVIDED


def classify_http_ok(probe: dict[str, Any] | None, *, previous: str | None = None) -> dict[str, Any]:
    if not probe:
        return _cell(
            UNKNOWN,
            source=SOURCE_NONE,
            strength=STRENGTH_NONE,
            reason=REASON_PROBE_NOT_PROVIDED,
            previous=previous,
        )
    hop = _terminal_http(probe)
    reasons = hop["reasons"]
    digest = hop["record_hash"]
    status = hop["status"]
    if REASON_HTTP_TIMEOUT in reasons:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_HTTP_TIMEOUT,
            previous=previous,
            evidence_hash=digest,
        )
    if REASON_HTTP_UNAVAILABLE in reasons or hop["error"] == "unavailable":
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_HTTP_UNAVAILABLE,
            previous=previous,
            evidence_hash=digest,
        )
    if REASON_HTTP_429 in reasons:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_HTTP_429,
            previous=previous,
            evidence_hash=digest,
        )
    if REASON_HTTP_5XX in reasons or (isinstance(status, int) and status >= 500):
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_HTTP_5XX,
            previous=previous,
            evidence_hash=digest,
        )
    if REASON_UNEXPECTED_EXTERNAL_REDIRECT in reasons:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_UNEXPECTED_EXTERNAL_REDIRECT,
            previous=previous,
            evidence_hash=digest,
        )
    if isinstance(status, int) and 300 <= status < 400:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_REDIRECT_NOT_RESOLVED,
            previous=previous,
            evidence_hash=digest,
        )
    if isinstance(status, int) and 400 <= status < 500:
        return _cell(
            FALSE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_HTTP_4XX,
            previous=previous,
            evidence_hash=digest,
        )
    if status in {200, 203}:
        return _cell(
            TRUE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason="HTTP_OK",
            previous=previous,
            evidence_hash=digest,
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_PUBLIC_HTTP,
        strength=STRENGTH_NONE,
        reason=REASON_HTTP_UNAVAILABLE,
        previous=previous,
        evidence_hash=digest,
    )


def classify_crawl_allowed(probe: dict[str, Any] | None, *, previous: str | None = None) -> dict[str, Any]:
    if not probe:
        return _cell(
            UNKNOWN,
            source=SOURCE_NONE,
            strength=STRENGTH_NONE,
            reason=REASON_PROBE_NOT_PROVIDED,
            previous=previous,
        )
    robots = probe.get("robots") if isinstance(probe.get("robots"), dict) else {}
    digest = probe.get("record_hash")
    if robots.get("blocked") is True or REASON_ROBOTS_BLOCKING in (probe.get("reason_codes") or []):
        return _cell(
            FALSE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_ROBOTS_BLOCKING,
            previous=previous,
            evidence_hash=digest,
        )
    if robots.get("status") is None or robots.get("status") != 200:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_NONE,
            reason=REASON_HTTP_UNAVAILABLE,
            previous=previous,
            evidence_hash=digest,
        )
    return _cell(
        TRUE,
        source=SOURCE_PUBLIC_HTTP,
        strength=STRENGTH_STRONG,
        reason="CRAWL_ALLOWED",
        previous=previous,
        evidence_hash=digest,
    )


def classify_sitemap_listed(probe: dict[str, Any] | None, *, previous: str | None = None) -> dict[str, Any]:
    if not probe:
        return _cell(
            UNKNOWN,
            source=SOURCE_NONE,
            strength=STRENGTH_NONE,
            reason=REASON_PROBE_NOT_PROVIDED,
            previous=previous,
        )
    sitemap = probe.get("sitemap") if isinstance(probe.get("sitemap"), dict) else {}
    digest = probe.get("record_hash")
    if sitemap.get("present") is True:
        return _cell(
            TRUE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason="SITEMAP_LISTED",
            previous=previous,
            evidence_hash=digest,
        )
    if sitemap.get("checked"):
        return _cell(
            FALSE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_SITEMAP_ABSENT,
            previous=previous,
            evidence_hash=digest,
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_PUBLIC_HTTP,
        strength=STRENGTH_NONE,
        reason=REASON_SITEMAP_ABSENT,
        previous=previous,
        evidence_hash=digest,
    )


def classify_canonical_valid(
    probe: dict[str, Any] | None,
    asset: dict[str, Any],
    *,
    previous: str | None = None,
) -> dict[str, Any]:
    if not probe:
        return _cell(
            UNKNOWN,
            source=SOURCE_NONE,
            strength=STRENGTH_NONE,
            reason=REASON_PROBE_NOT_PROVIDED,
            previous=previous,
        )
    digest = probe.get("record_hash")
    registered = normalize_url(str(asset.get("canonical") or ""))
    declared = normalize_url(str(probe.get("declared_canonical") or ""))
    if REASON_CANONICAL_DIVERGENT in (probe.get("reason_codes") or []):
        return _cell(
            FALSE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason=REASON_CANONICAL_DIVERGENT,
            previous=previous,
            evidence_hash=digest,
        )
    if declared and registered and declared == registered:
        return _cell(
            TRUE,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_STRONG,
            reason="CANONICAL_VALID",
            previous=previous,
            evidence_hash=digest,
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_PUBLIC_HTTP,
        strength=STRENGTH_NONE,
        reason="CANONICAL_NOT_DECLARED",
        previous=previous,
        evidence_hash=digest,
    )


def _gsc_blocked_cell(name: str) -> dict[str, Any]:
    return _cell(
        BLOCKED,
        source=SOURCE_GSC_API,
        strength=STRENGTH_NONE,
        reason=REASON_GSC_BLOCKED,
    )


def classify_discovered(
    *,
    gsc_access: str,
    gsc_summary: dict[str, Any] | None,
    gsc_rows: list[dict[str, Any]],
    site_operator: bool,
) -> dict[str, Any]:
    if gsc_access == GSC_ACCESS_BLOCKED:
        return _gsc_blocked_cell("DISCOVERED")
    verdict = _explicit_index_verdict(gsc_rows)
    if verdict in {"indexed", "discovered"}:
        return _cell(
            TRUE,
            source=SOURCE_GSC_EXPORT,
            strength=STRENGTH_STRONG,
            reason="GSC_URL_KNOWN",
            evidence_hash=(gsc_rows[0].get("record_hash") if gsc_rows else None),
        )
    impressions = (gsc_summary or {}).get("impressions") or {}
    if impressions.get("status") == "observed" and (impressions.get("value") or 0) > 0:
        return _cell(
            TRUE,
            source=SOURCE_GSC_EXPORT,
            strength=STRENGTH_STRONG,
            reason="GSC_IMPRESSIONS_PROVE_URL_KNOWN",
        )
    if site_operator:
        return _cell(
            UNKNOWN,
            source=SOURCE_SITE_OPERATOR,
            strength=STRENGTH_WEAK,
            reason=REASON_SITE_OPERATOR_WEAK,
        )
    if gsc_access == GSC_ACCESS_NOT_PROVIDED:
        return _cell(
            UNKNOWN,
            source=SOURCE_NONE,
            strength=STRENGTH_NONE,
            reason=REASON_GSC_NOT_PROVIDED,
        )
    if impressions.get("status") == "PROVEN_ZERO":
        return _cell(
            UNKNOWN,
            source=SOURCE_GSC_EXPORT,
            strength=STRENGTH_NONE,
            reason=REASON_ZERO_IMPRESSIONS_NOT_ABSENT,
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_GSC_EXPORT,
        strength=STRENGTH_NONE,
        reason=REASON_PUBLICATION_IS_NOT_DISCOVERY,
    )


def classify_indexed(
    *,
    gsc_access: str,
    gsc_rows: list[dict[str, Any]],
    site_operator: bool,
    publication_true: bool,
) -> dict[str, Any]:
    if gsc_access == GSC_ACCESS_BLOCKED:
        return _gsc_blocked_cell("INDEXED")
    if site_operator:
        return _cell(
            UNKNOWN,
            source=SOURCE_SITE_OPERATOR,
            strength=STRENGTH_WEAK,
            reason=REASON_SITE_OPERATOR_WEAK,
        )
    verdict = _explicit_index_verdict(gsc_rows)
    if verdict == "indexed":
        return _cell(
            TRUE,
            source=SOURCE_GSC_EXPORT,
            strength=STRENGTH_STRONG,
            reason="GSC_INDEX_STATE",
            evidence_hash=(gsc_rows[0].get("record_hash") if gsc_rows else None),
        )
    if gsc_access == GSC_ACCESS_IMPORTED:
        return _cell(
            UNKNOWN,
            source=SOURCE_GSC_EXPORT,
            strength=STRENGTH_NONE,
            reason=REASON_NO_EXPLICIT_INDEX_STATE,
        )
    if publication_true:
        return _cell(
            UNKNOWN,
            source=SOURCE_PUBLIC_HTTP,
            strength=STRENGTH_NONE,
            reason=REASON_PUBLICATION_IS_NOT_INDEX,
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_NONE,
        strength=STRENGTH_NONE,
        reason=REASON_INDEX_STATE_NOT_PROVIDED,
    )


def classify_impression(*, gsc_access: str, gsc_summary: dict[str, Any] | None) -> dict[str, Any]:
    if gsc_access == GSC_ACCESS_BLOCKED:
        return _gsc_blocked_cell("IMPRESSION")
    impressions = (gsc_summary or {}).get("impressions") or {}
    status = impressions.get("status")
    value = impressions.get("value")
    if status == "observed" and value not in (None, 0):
        return _cell(TRUE, source=SOURCE_GSC_EXPORT, strength=STRENGTH_STRONG, reason="GSC_IMPRESSIONS")
    if status == "PROVEN_ZERO" or (status == "observed" and value == 0):
        return _cell(FALSE, source=SOURCE_GSC_EXPORT, strength=STRENGTH_STRONG, reason=REASON_PROVEN_ZERO)
    if status == "NO_ROWS":
        return _cell(UNKNOWN, source=SOURCE_GSC_EXPORT, strength=STRENGTH_NONE, reason=REASON_ZERO_ROWS)
    return _cell(
        UNKNOWN,
        source=SOURCE_NONE if gsc_access == GSC_ACCESS_NOT_PROVIDED else SOURCE_GSC_EXPORT,
        strength=STRENGTH_NONE,
        reason=REASON_GSC_NOT_PROVIDED,
    )


def classify_click(*, gsc_access: str, gsc_summary: dict[str, Any] | None) -> dict[str, Any]:
    if gsc_access == GSC_ACCESS_BLOCKED:
        return _gsc_blocked_cell("CLICK")
    clicks = (gsc_summary or {}).get("clicks") or {}
    status = clicks.get("status")
    value = clicks.get("value")
    if status == "observed" and value not in (None, 0):
        return _cell(TRUE, source=SOURCE_GSC_EXPORT, strength=STRENGTH_STRONG, reason="GSC_CLICKS")
    if status == "PROVEN_ZERO" or (status == "observed" and value == 0):
        return _cell(FALSE, source=SOURCE_GSC_EXPORT, strength=STRENGTH_STRONG, reason="ZERO_CLICKS_PROVEN")
    if status == "NO_ROWS":
        return _cell(UNKNOWN, source=SOURCE_GSC_EXPORT, strength=STRENGTH_NONE, reason=REASON_ZERO_ROWS)
    return _cell(
        UNKNOWN,
        source=SOURCE_NONE if gsc_access == GSC_ACCESS_NOT_PROVIDED else SOURCE_GSC_EXPORT,
        strength=STRENGTH_NONE,
        reason=REASON_GSC_NOT_PROVIDED,
    )


def classify_lead(outcome_rows: list[dict[str, Any]]) -> dict[str, Any]:
    from scripts.discovery.operations import lead_attributed_to_search

    leads = [row for row in outcome_rows if row.get("observation_type") == "lead"]
    if any(lead_attributed_to_search(row) for row in leads):
        attributed = next(row for row in leads if lead_attributed_to_search(row))
        return _cell(
            TRUE,
            source=SOURCE_OUTCOME,
            strength=STRENGTH_STRONG,
            reason="LEAD_SEARCH_CORRELATED",
            evidence_hash=attributed.get("record_hash"),
        )
    if leads:
        return _cell(
            UNKNOWN,
            source=SOURCE_OUTCOME,
            strength=STRENGTH_NONE,
            reason=REASON_OPAQUE_LEAD_NOT_LEAD,
            evidence_hash=leads[0].get("record_hash"),
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_NONE,
        strength=STRENGTH_NONE,
        reason=REASON_OUTCOME_NOT_PROVIDED,
    )


def classify_revenue(outcome_rows: list[dict[str, Any]]) -> dict[str, Any]:
    commercial = [row for row in outcome_rows if row.get("observation_type") == "commercial_outcome"]
    with_value = [
        row
        for row in commercial
        if (row.get("metrics") or {}).get("revenue") is not None
        or (row.get("metrics") or {}).get("reconciled") is True
    ]
    if with_value:
        return _cell(
            TRUE,
            source=SOURCE_OUTCOME,
            strength=STRENGTH_STRONG,
            reason="COMMERCIAL_EVENT_RECONCILED",
            evidence_hash=with_value[0].get("record_hash"),
        )
    return _cell(
        UNKNOWN,
        source=SOURCE_NONE if not commercial else SOURCE_OUTCOME,
        strength=STRENGTH_NONE,
        reason=REASON_OUTCOME_NOT_PROVIDED,
    )


def state_values(states: dict[str, Any]) -> dict[str, str]:
    return {name: str((states.get(name) or {}).get("value") or UNKNOWN) for name in STATE_NAMES}


def classify_states(
    *,
    asset: dict[str, Any],
    probe: dict[str, Any] | None,
    previous_probe: dict[str, Any] | None = None,
    gsc_summary: dict[str, Any] | None = None,
    gsc_rows: list[dict[str, Any]] | None = None,
    outcome_rows: list[dict[str, Any]] | None = None,
    extra_rows: list[dict[str, Any]] | None = None,
    gsc_access: str | None = None,
) -> dict[str, Any]:
    """Map collected observations to the ten named states.

    Technical publication (HTTP/robots/sitemap/canonical) never sets
    DISCOVERED or INDEXED. ``site:`` never sets INDEXED.
    """
    gsc_rows = list(gsc_rows or [])
    outcome_rows = list(outcome_rows or [])
    extra_rows = list(extra_rows or [])
    access = derive_gsc_access(gsc_rows, declared=gsc_access)
    previous = None
    if previous_probe is not None:
        previous = classify_states(
            asset=asset,
            probe=previous_probe,
            gsc_summary=None,
            gsc_rows=[],
            outcome_rows=[],
            gsc_access=GSC_ACCESS_NOT_PROVIDED,
        )

    def prev(name: str) -> str | None:
        if not previous:
            return None
        cell = previous.get(name)
        if isinstance(cell, dict):
            return cell.get("value")
        return None

    http_ok = classify_http_ok(probe, previous=prev("HTTP_OK"))
    crawl = classify_crawl_allowed(probe, previous=prev("CRAWL_ALLOWED"))
    sitemap = classify_sitemap_listed(probe, previous=prev("SITEMAP_LISTED"))
    canonical = classify_canonical_valid(probe, asset, previous=prev("CANONICAL_VALID"))
    publication_true = (
        http_ok["value"] == TRUE
        and crawl["value"] == TRUE
        and sitemap["value"] == TRUE
    )
    site_operator = _has_site_operator(gsc_rows + extra_rows)
    discovered = classify_discovered(
        gsc_access=access,
        gsc_summary=gsc_summary,
        gsc_rows=gsc_rows,
        site_operator=site_operator,
    )
    indexed = classify_indexed(
        gsc_access=access,
        gsc_rows=gsc_rows,
        site_operator=site_operator,
        publication_true=publication_true,
    )
    impression = classify_impression(gsc_access=access, gsc_summary=gsc_summary)
    click = classify_click(gsc_access=access, gsc_summary=gsc_summary)
    lead = classify_lead(outcome_rows)
    revenue = classify_revenue(outcome_rows)
    states = {
        "HTTP_OK": http_ok,
        "CRAWL_ALLOWED": crawl,
        "SITEMAP_LISTED": sitemap,
        "CANONICAL_VALID": canonical,
        "DISCOVERED": discovered,
        "INDEXED": indexed,
        "IMPRESSION": impression,
        "CLICK": click,
        "LEAD": lead,
        "REVENUE": revenue,
    }
    return {
        **states,
        "values": state_values(states),
        "publication_is_not_discovery": discovered["value"] != TRUE or access != GSC_ACCESS_NOT_PROVIDED,
        "publication_is_not_index": indexed["value"] != TRUE or not publication_true or access != GSC_ACCESS_NOT_PROVIDED,
        "site_operator_is_weak": True,
        "gsc_access": access,
    }
