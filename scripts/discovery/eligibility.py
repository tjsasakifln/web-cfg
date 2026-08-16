"""Eligibility rules: fixture/noindex cannot enter publicable or IndexNow sets."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from scripts.discovery.schema import CANONICAL_ORIGIN, HOST, UNKNOWN


def robots_is_noindex(robots_meta: Any) -> bool:
    if not isinstance(robots_meta, str) or robots_meta == UNKNOWN:
        return False
    tokens = {part.strip().lower() for part in robots_meta.split(",")}
    return "noindex" in tokens


def is_fixture(asset: dict[str, Any]) -> bool:
    if asset.get("fixture") is True:
        return True
    if str(asset.get("label") or "").upper() == "FIXTURE_ONLY":
        return True
    if str(asset.get("watermark") or "").upper() == "FIXTURE_ONLY":
        return True
    return False


def is_approved_canonical(url: str | None) -> bool:
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https" or parsed.hostname != HOST:
        return False
    if parsed.query or parsed.fragment:
        return False
    if parsed.path and not parsed.path.startswith("/"):
        return False
    return True


def eligibility_defects(asset: dict[str, Any], inspected: dict[str, Any]) -> list[str]:
    defects: list[str] = []
    fixture = is_fixture(asset)
    if fixture:
        defects.append("fixture")
        if asset.get("public_canonical"):
            defects.append("fixture_has_public_canonical")
        if inspected.get("sitemap") is True:
            defects.append("fixture_listed_in_sitemap")
    canonical = asset.get("canonical")
    if not fixture:
        if not canonical:
            defects.append("missing_canonical")
        elif not is_approved_canonical(str(canonical)):
            defects.append("canonical_not_https_host")
        declared = inspected.get("declared_canonical")
        if declared and canonical and declared.rstrip("/") != str(canonical).rstrip("/"):
            defects.append("canonical_mismatch")
    robots_meta = inspected.get("robots_meta")
    noindex = bool(asset.get("noindex")) or robots_is_noindex(robots_meta)
    intent = asset.get("index_intent")
    if intent == "DO_NOT_INDEX" and not noindex and inspected.get("http", {}).get("local_file") == "present":
        defects.append("do_not_index_but_robots_allow_index")
    if intent == "INDEX" and noindex:
        defects.append("index_intent_but_noindex")
    if intent == "INDEX" and inspected.get("sitemap") is not True and not fixture:
        if inspected.get("http", {}).get("local_file") == "present":
            defects.append("index_intent_missing_sitemap")
    if intent == "DO_NOT_INDEX" and inspected.get("sitemap") is True:
        defects.append("noindex_listed_in_sitemap")
    if inspected.get("robots_txt_blocked") and intent == "INDEX":
        defects.append("robots_txt_blocks_index_intent")
    if inspected.get("http", {}).get("local_file") == "absent" and not fixture:
        defects.append("local_page_absent")
    if inspected.get("renderability") not in {"static_html_present", "not_public"} and not fixture:
        if inspected.get("http", {}).get("local_file") == "present":
            defects.append("not_renderable")
    for sd_defect in inspected.get("structured_data_defects") or []:
        defects.append(sd_defect)
    # stable unique
    seen: set[str] = set()
    ordered: list[str] = []
    for item in defects:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def is_publicable(asset: dict[str, Any], inspected: dict[str, Any]) -> bool:
    if is_fixture(asset):
        return False
    if asset.get("publicable") is False:
        return False
    if asset.get("index_intent") == "DO_NOT_INDEX":
        return False
    if asset.get("noindex") is True:
        return False
    if robots_is_noindex(inspected.get("robots_meta")):
        return False
    if not is_approved_canonical(asset.get("canonical")):
        return False
    defects = eligibility_defects(asset, inspected)
    blocking = {
        "fixture",
        "fixture_has_public_canonical",
        "fixture_listed_in_sitemap",
        "missing_canonical",
        "canonical_not_https_host",
        "index_intent_but_noindex",
        "noindex_listed_in_sitemap",
        "robots_txt_blocks_index_intent",
        "local_page_absent",
    }
    return not any(d in blocking for d in defects)


def is_indexnow_eligible(
    url: str,
    *,
    allowlist: list[str],
    asset: dict[str, Any] | None,
    inspected: dict[str, Any] | None,
) -> tuple[bool, str]:
    if asset is not None and is_fixture(asset):
        return False, "fixture"
    if not is_approved_canonical(url):
        return False, "not_approved_canonical"
    if asset is not None and (
        asset.get("index_intent") == "DO_NOT_INDEX" or asset.get("noindex") is True
    ):
        return False, "noindex"
    if inspected is not None and robots_is_noindex(inspected.get("robots_meta")):
        return False, "noindex"
    if url not in allowlist:
        return False, "not_on_allowlist"
    if inspected is not None and inspected.get("sitemap") is not True:
        return False, "not_in_sitemap"
    return True, "ok"


def publicable_urls(
    assets: list[dict[str, Any]], inspections: dict[str, dict[str, Any]]
) -> list[str]:
    urls: list[str] = []
    for asset in assets:
        inspected = inspections.get(asset["id"], {})
        if is_publicable(asset, inspected) and asset.get("canonical"):
            urls.append(str(asset["canonical"]))
    return urls
