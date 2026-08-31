"""Read-only live technical probe. GET/HEAD only. No search queries."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

from scripts.discovery.http_client import (
    DEFAULT_RATE_LIMIT_S,
    DEFAULT_RETRIES,
    DEFAULT_TIMEOUT_S,
    DEFAULT_UA,
    FakeTransport,
    ProbeResponse,
    RateLimiter,
    Transport,
    request,
)
from scripts.discovery.inspect import (
    extract_sitemap_locs,
    jsonld_types,
    parse_html,
    path_blocked_by_robots,
    robots_disallows,
    robots_target_from_url,
)
from scripts.discovery.observation import (
    REASON_CANONICAL_DIVERGENT,
    REASON_HTTP_429,
    REASON_HTTP_5XX,
    REASON_HTTP_TIMEOUT,
    REASON_HTTP_UNAVAILABLE,
    REASON_ROBOTS_BLOCKING,
    REASON_SITEMAP_ABSENT,
    REASON_TECHNICAL_LIVE,
    REASON_UNEXPECTED_EXTERNAL_REDIRECT,
    build_observation,
    sha256_text,
)
from scripts.discovery.registry import load_cohort, repo_root
from scripts.discovery.schema import CANONICAL_ORIGIN, HOST, UNKNOWN

MAX_REDIRECTS = 5
SITEMAP_CANDIDATES = (
    "/sitemap.xml",
    "/sitemap-editorial.xml",
    "/sitemap-inteligencia.xml",
    "/sitemap-jurisprudencia.xml",
)
INTERNAL_PREFIXES = (
    "/",
    CANONICAL_ORIGIN,
    f"https://www.{HOST}",
    f"http://{HOST}",
    f"http://www.{HOST}",
)
HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)
SITEMAP_LINE_RE = re.compile(r"(?i)^sitemap:\s*(\S+)")


def same_site(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in {HOST, f"www.{HOST}"}


def classify_redirect(from_url: str, to_url: str) -> str:
    if not to_url:
        return "empty_location"
    target = urljoin(from_url, to_url)
    parsed_from = urlparse(from_url)
    parsed_to = urlparse(target)
    if not same_site(target):
        return "unexpected_external"
    if parsed_from.scheme == "http" and parsed_to.scheme == "https":
        return "http_to_https"
    if (parsed_from.path or "/") != (parsed_to.path or "/") and same_site(target):
        return "same_site_path"
    return "same_site"


def extract_hrefs(html: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for match in HREF_RE.findall(html):
        if match not in seen:
            seen.add(match)
            ordered.append(match)
    return ordered


def internal_links(html: str, page_url: str) -> list[str]:
    out: list[str] = []
    for href in extract_hrefs(html):
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        absolute = urljoin(page_url, href)
        if same_site(absolute) or href.startswith("/"):
            out.append(absolute if same_site(absolute) else urljoin(CANONICAL_ORIGIN, href))
    # stable unique
    seen: set[str] = set()
    ordered: list[str] = []
    for item in out:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def robots_sitemaps(robots_text: str) -> list[str]:
    found: list[str] = []
    for line in robots_text.splitlines():
        match = SITEMAP_LINE_RE.match(line.strip())
        if match:
            found.append(match.group(1).strip())
    return found


def indexability(robots_meta: str, x_robots: str) -> dict[str, Any]:
    tokens = set()
    for raw in (robots_meta, x_robots):
        for part in (raw or "").split(","):
            token = part.strip().lower()
            if token:
                tokens.add(token)
    if "noindex" in tokens:
        state = "noindex"
    elif "index" in tokens or not tokens:
        state = "indexable"
    else:
        state = "unknown"
    return {"state": state, "tokens": sorted(tokens)}


def _status_reasons(response: ProbeResponse) -> list[str]:
    if response.error == "timeout":
        return [REASON_HTTP_TIMEOUT]
    if response.error:
        return [REASON_HTTP_UNAVAILABLE]
    if response.status == 429:
        return [REASON_HTTP_429]
    if response.status is not None and response.status >= 500:
        return [REASON_HTTP_5XX]
    if response.status is None:
        return [REASON_HTTP_UNAVAILABLE]
    return []


def fetch(
    method: str,
    url: str,
    *,
    transport: Transport | None,
    timeout: float,
    retries: int,
    rate_limiter: RateLimiter | None,
    user_agent: str,
) -> ProbeResponse:
    return request(
        method,
        url,
        transport=transport,
        timeout=timeout,
        retries=retries,
        rate_limiter=rate_limiter,
        user_agent=user_agent,
    )


def follow_redirects(
    url: str,
    *,
    transport: Transport | None,
    timeout: float,
    retries: int,
    rate_limiter: RateLimiter | None,
    user_agent: str,
) -> tuple[list[dict[str, Any]], ProbeResponse | None]:
    chain: list[dict[str, Any]] = []
    current = url
    seen: set[str] = set()
    final: ProbeResponse | None = None
    for _ in range(MAX_REDIRECTS + 1):
        if current in seen:
            chain.append(
                {
                    "url": current,
                    "status": None,
                    "classification": "redirect_loop",
                    "error": "redirect_loop",
                }
            )
            break
        seen.add(current)
        response = fetch(
            "GET",
            current,
            transport=transport,
            timeout=timeout,
            retries=retries,
            rate_limiter=rate_limiter,
            user_agent=user_agent,
        )
        hop = {
            "url": current,
            "final_url": response.url,
            "status": response.status,
            "error": response.error,
            "classification": "terminal",
        }
        location = response.headers.get("location") if response.headers else None
        if response.status and 300 <= response.status < 400 and location:
            classification = classify_redirect(current, location)
            hop["classification"] = classification
            hop["location"] = urljoin(current, location)
            chain.append(hop)
            if classification == "unexpected_external":
                final = response
                break
            current = hop["location"]
            continue
        chain.append(hop)
        final = response
        break
    return chain, final


def probe_asset(
    asset: dict[str, Any],
    *,
    observed_at: str,
    transport: Transport | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    retries: int = DEFAULT_RETRIES,
    rate_limit_s: float = DEFAULT_RATE_LIMIT_S,
    user_agent: str = DEFAULT_UA,
    include_head: bool = True,
) -> dict[str, Any]:
    canonical = str(asset.get("canonical") or "")
    asset_id = str(asset.get("id") or "")
    limiter = RateLimiter(rate_limit_s)
    reasons: list[str] = []
    chain, page = follow_redirects(
        canonical,
        transport=transport,
        timeout=timeout,
        retries=retries,
        rate_limiter=limiter,
        user_agent=user_agent,
    )
    head: ProbeResponse | None = None
    if include_head and page is not None and not page.unavailable:
        head = fetch(
            "HEAD",
            canonical,
            transport=transport,
            timeout=timeout,
            retries=retries,
            rate_limiter=limiter,
            user_agent=user_agent,
        )

    if page is None:
        reasons.append(REASON_HTTP_UNAVAILABLE)
        status = "UNAVAILABLE"
        parsed = {
            "title": UNKNOWN,
            "h1": UNKNOWN,
            "description": UNKNOWN,
            "robots": UNKNOWN,
            "canonical": "",
            "jsonld": [],
            "renderable": False,
        }
        body_hash = None
        headers: dict[str, str] = {}
    else:
        reasons.extend(_status_reasons(page))
        headers = dict(page.headers or {})
        if page.unavailable or page.status not in {200, 203, 204}:
            status = "UNAVAILABLE" if page.unavailable or page.status is None else "UNKNOWN"
            parsed = parse_html(page.text) if page.body else {
                "title": UNKNOWN,
                "robots": UNKNOWN,
                "canonical": "",
                "jsonld": [],
                "h1": UNKNOWN,
                "description": UNKNOWN,
                "renderable": False,
            }
            body_hash = sha256_text(page.body) if page.body else None
        else:
            status = "observed"
            parsed = parse_html(page.text)
            body_hash = sha256_text(page.body)

    if any(hop.get("classification") == "unexpected_external" for hop in chain):
        reasons.append(REASON_UNEXPECTED_EXTERNAL_REDIRECT)
        if status == "observed":
            status = "UNKNOWN"

    declared = (parsed.get("canonical") or "").strip()
    if declared and canonical and declared.rstrip("/") != canonical.rstrip("/"):
        reasons.append(REASON_CANONICAL_DIVERGENT)

    origin = f"{urlparse(canonical).scheme}://{urlparse(canonical).netloc}"
    robots_url = urljoin(origin + "/", "robots.txt")
    robots_resp = fetch(
        "GET",
        robots_url,
        transport=transport,
        timeout=timeout,
        retries=retries,
        rate_limiter=limiter,
        user_agent=user_agent,
    )
    robots_text = robots_resp.text if robots_resp.body else ""
    robots_blocked = False
    if robots_resp.body and not robots_resp.unavailable:
        parsed_path = robots_target_from_url(canonical)
        robots_blocked = path_blocked_by_robots(
            parsed_path, robots_text, user_agent=user_agent
        )
    if robots_blocked:
        reasons.append(REASON_ROBOTS_BLOCKING)

    sitemap_urls: list[str] = []
    sitemap_locs: set[str] = set()
    for listed in robots_sitemaps(robots_text):
        sitemap_urls.append(listed)
    for rel in SITEMAP_CANDIDATES:
        sitemap_urls.append(urljoin(origin + "/", rel.lstrip("/")))
    seen_sitemaps: set[str] = set()
    unique_sitemaps: list[str] = []
    for sm_url in sitemap_urls:
        if sm_url not in seen_sitemaps:
            seen_sitemaps.add(sm_url)
            unique_sitemaps.append(sm_url)
    for sm_url in unique_sitemaps:
        sm_resp = fetch(
            "GET",
            sm_url,
            transport=transport,
            timeout=timeout,
            retries=0,
            rate_limiter=limiter,
            user_agent=user_agent,
        )
        if sm_resp.unavailable or sm_resp.status != 200 or not sm_resp.body:
            continue
        sitemap_locs.update(extract_sitemap_locs(sm_resp.text))
        # sitemap index → child locs that look like sitemaps
        for loc in list(extract_sitemap_locs(sm_resp.text)):
            if "sitemap" in loc.lower() and loc not in seen_sitemaps:
                seen_sitemaps.add(loc)
                unique_sitemaps.append(loc)

    in_sitemap = canonical in sitemap_locs or canonical.rstrip("/") + "/" in sitemap_locs
    if not in_sitemap:
        reasons.append(REASON_SITEMAP_ABSENT)

    x_robots = headers.get("x-robots-tag") or (head.headers.get("x-robots-tag") if head else "")
    robots_meta = parsed.get("robots") or UNKNOWN
    indexable = indexability(str(robots_meta), str(x_robots or ""))
    etag = headers.get("etag") or (head.headers.get("etag") if head else None)
    last_modified = headers.get("last-modified") or (
        head.headers.get("last-modified") if head else None
    )
    links = internal_links(page.text, canonical) if page and page.body else []
    types = jsonld_types(parsed.get("jsonld") or [])

    if status == "observed" and not robots_blocked and in_sitemap and REASON_CANONICAL_DIVERGENT not in reasons:
        reasons.append(REASON_TECHNICAL_LIVE)
        technical_status = "TECHNICAL_LIVE"
    elif status == "UNAVAILABLE":
        technical_status = "UNAVAILABLE"
    else:
        technical_status = "UNKNOWN"

    # stable unique reasons
    seen_reasons: set[str] = set()
    ordered_reasons: list[str] = []
    for item in reasons:
        if item not in seen_reasons:
            seen_reasons.add(item)
            ordered_reasons.append(item)

    extras = {
        "technical_status": technical_status,
        "http": {
            "method": "GET",
            "head_used": bool(head is not None),
            "status": page.status if page else None,
            "final_url": page.url if page else None,
            "chain": chain,
            "etag": etag,
            "last_modified": last_modified,
            "x_robots_tag": x_robots or None,
        },
        "declared_canonical": declared or None,
        "robots": {
            "url": robots_url,
            "status": robots_resp.status,
            "blocked": robots_blocked,
            "disallows": (
                robots_disallows(robots_text, user_agent=user_agent)
                if robots_text
                else []
            ),
            "meta": robots_meta,
        },
        "indexability": indexable,
        "sitemap": {
            "present": in_sitemap,
            "checked": unique_sitemaps,
            "match": canonical if in_sitemap else None,
        },
        "content_hash": body_hash,
        "structured_data": types,
        "internal_links": links[:50],
        "replay_command": (
            "python3 -m scripts.discovery probe "
            f"--asset-id {asset_id} --as-of {observed_at}"
        ),
        "user_agent": user_agent,
        "limits": {
            "timeout_s": timeout,
            "retries": retries,
            "rate_limit_s": rate_limit_s,
            "max_redirects": MAX_REDIRECTS,
            "methods": ["GET", "HEAD"],
        },
    }
    return build_observation(
        asset_id=asset_id,
        observation_type="technical_probe",
        observed_at=observed_at,
        source="public_http_get_head",
        status=status if status in {"observed", "UNKNOWN", "UNAVAILABLE"} else "UNKNOWN",
        reason_codes=ordered_reasons,
        dimensions={
            "canonical_url": canonical,
            "host": HOST,
        },
        metrics={
            "http_status": page.status if page else None,
            "content_hash": body_hash,
            "redirect_hops": len(chain),
        },
        extras=extras,
    )


def probe_by_id(
    asset_id: str,
    *,
    root=None,
    observed_at: str,
    transport: Transport | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    root = root or repo_root()
    cohort = load_cohort(root=root)
    for asset in cohort["assets"]:
        if asset.get("id") == asset_id:
            return probe_asset(asset, observed_at=observed_at, transport=transport, **kwargs)
    raise ValueError(f"unknown_asset:{asset_id}")


# Re-export the test seam so tests drive the shipped client.
__all__ = [
    "FakeTransport",
    "Transport",
    "classify_redirect",
    "probe_asset",
    "probe_by_id",
]
