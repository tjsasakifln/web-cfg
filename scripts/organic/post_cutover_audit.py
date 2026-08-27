"""Post-cutover organic census and fail-closed campaign evidence checks.

The module deliberately owns no deploy, DNS, scheduler or runtime mutation.  It
can read the public surface, inspect the versioned sitemap graph and validate a
campaign report.  Network output contains public URLs and aggregate counts
only; query text, credentials and visitor data are never collected.
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
from collections import defaultdict, deque
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from scripts.organic.sitemap_graph import (
    SITE,
    extract_canonical,
    loc_key,
    loc_path,
    meta_robots_noindex,
    parse_sitemap_index,
    parse_urlset_locs,
)

REPORT_SCHEMA = "organic-post-cutover-campaign/v1"
TERMINAL_PREFIXES = ("GO:ORGANIC_MARKET_CAPTURE", "DEGRADED:", "BLOCKED:", "NO_GO:")
DECISION_STATES = {"EXECUTE_NOW", "VALIDATE", "DEFER", "SUNSET", "SUPERSEDED"}
ALLOWED_LEVERAGE = {"revenue", "distribution", "data", "automation", "trust", "customer"}
PHONE_LIKE_RE = re.compile(r"(?:\+?\d[\s().-]*){10,15}")
HASH_RE = re.compile(r"^(?:sha256:)?[a-f0-9]{16,64}$", re.I)


class _HtmlSignals(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.json_ld = 0
        self._in_title = False
        self._in_h1 = False
        self.title_parts: list[str] = []
        self.h1_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs}
        if tag.lower() == "a" and values.get("href"):
            self.hrefs.append(str(values["href"]))
        elif tag.lower() == "script" and str(values.get("type") or "").lower() == "application/ld+json":
            self.json_ld += 1
        elif tag.lower() == "title":
            self._in_title = True
        elif tag.lower() == "h1":
            self._in_h1 = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False
        elif tag.lower() == "h1":
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        if self._in_h1:
            self.h1_parts.append(data)


def html_signals(html: str) -> dict[str, Any]:
    parser = _HtmlSignals()
    parser.feed(html or "")
    title = " ".join("".join(parser.title_parts).split())
    h1 = " ".join("".join(parser.h1_parts).split())
    return {
        "canonical": extract_canonical(html or ""),
        "noindex": meta_robots_noindex(html or ""),
        "title_present": bool(title),
        "h1_present": bool(h1),
        "json_ld_blocks": parser.json_ld,
        "hrefs": parser.hrefs,
    }


def normalize_internal_href(href: str, *, source_path: str = "/") -> str | None:
    raw = str(href or "").strip()
    if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    absolute = urljoin(f"{SITE}{source_path}", raw)
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "confenge.com.br",
        "www.confenge.com.br",
    }:
        return None
    path = parsed.path or "/"
    if "." not in Path(path).name and path != "/":
        path = path.rstrip("/") + "/"
    return loc_key(path)


def local_html_path(root: Path, path: str) -> Path:
    normalized = loc_path(path)
    if normalized == "/":
        return root / "index.html"
    return root / normalized.strip("/") / "index.html"


def internal_link_census(root: Path, sitemap_locs: Iterable[str]) -> dict[str, Any]:
    """Measure reachability among the indexable sitemap universe from home."""
    paths = {loc_key(loc) for loc in sitemap_locs}
    edges: dict[str, set[str]] = {path: set() for path in paths}
    missing_html: list[str] = []
    broken_internal: set[tuple[str, str]] = set()
    in_degree: dict[str, int] = defaultdict(int)

    for source in sorted(paths):
        page = local_html_path(root, source)
        if not page.is_file():
            missing_html.append(source)
            continue
        signals = html_signals(page.read_text(encoding="utf-8", errors="replace"))
        for href in signals["hrefs"]:
            target = normalize_internal_href(href, source_path=source)
            if target is None:
                continue
            candidate = local_html_path(root, target)
            if target in paths:
                if target not in edges[source]:
                    edges[source].add(target)
                    in_degree[target] += 1
            elif not candidate.is_file() and "." not in Path(target).name:
                broken_internal.add((source, target))

    depth: dict[str, int] = {}
    if "/" in paths:
        depth["/"] = 0
        queue: deque[str] = deque(["/"])
        while queue:
            source = queue.popleft()
            for target in sorted(edges.get(source, set())):
                if target not in depth:
                    depth[target] = depth[source] + 1
                    queue.append(target)

    orphans = sorted(paths - set(depth))
    zero_in_degree = sorted(path for path in paths if path != "/" and in_degree[path] == 0)
    deep = sorted(
        ({"path": path, "depth": value} for path, value in depth.items() if value > 3),
        key=lambda item: (item["depth"], item["path"]),
    )
    return {
        "indexable_paths": len(paths),
        "internal_edges": sum(len(targets) for targets in edges.values()),
        "reachable_from_home": len(depth),
        "orphans": orphans,
        "zero_in_degree": zero_in_degree,
        "max_depth": max(depth.values(), default=None),
        "depth_gt_3": deep,
        "missing_html": missing_html,
        "broken_internal": [
            {"from": source, "to": target}
            for source, target in sorted(broken_internal)
        ],
        "ok": not orphans and not deep and not missing_html and not broken_internal,
    }


@dataclass(frozen=True)
class FetchResult:
    requested_url: str
    final_url: str
    status: int
    headers: dict[str, str]
    body: str
    error: str | None = None


def fetch_public(url: str, *, timeout: float = 20.0) -> FetchResult:
    request = Request(
        url,
        headers={
            "User-Agent": "CONFENGE-Organic-Post-Cutover-Audit/1.0",
            "Accept": "text/html,application/xml,text/plain;q=0.9,*/*;q=0.1",
        },
    )
    try:
        with urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
            raw = response.read(2 * 1024 * 1024)
            return FetchResult(
                requested_url=url,
                final_url=response.geturl(),
                status=int(response.status),
                headers={key.lower(): value for key, value in response.headers.items()},
                body=raw.decode("utf-8", errors="replace"),
            )
    except HTTPError as error:
        raw = error.read(2 * 1024 * 1024)
        return FetchResult(
            requested_url=url,
            final_url=error.geturl(),
            status=int(error.code),
            headers={key.lower(): value for key, value in error.headers.items()},
            body=raw.decode("utf-8", errors="replace"),
        )
    except (URLError, TimeoutError, OSError) as error:
        return FetchResult(url, url, 0, {}, "", error=type(error).__name__)


def live_census(*, base_url: str = SITE, timeout: float = 20.0) -> dict[str, Any]:
    """Walk the live sitemap index and validate every declared indexable URL."""
    base = base_url.rstrip("/")
    robots = fetch_public(f"{base}/robots.txt", timeout=timeout)
    index = fetch_public(f"{base}/sitemap-index.xml", timeout=timeout)
    members = parse_sitemap_index(index.body) if index.status == 200 else []
    member_rows: list[dict[str, Any]] = []
    locs: list[str] = []
    for member in members:
        response = fetch_public(member.loc, timeout=timeout)
        member_locs = parse_urlset_locs(response.body) if response.status == 200 else []
        locs.extend(member_locs)
        member_rows.append(
            {"url": member.loc, "status": response.status, "locs": len(member_locs)}
        )

    pages: list[dict[str, Any]] = []
    issue_counts: dict[str, int] = defaultdict(int)
    structured_data_missing: list[str] = []
    for loc in sorted(set(locs)):
        response = fetch_public(loc, timeout=timeout)
        signals = html_signals(response.body)
        expected = loc_key(loc)
        final = loc_key(response.final_url)
        canonical = signals["canonical"]
        row = {
            "path": loc_path(loc),
            "status": response.status,
            "redirected": final != expected,
            "canonical": canonical,
            "canonical_self": bool(canonical and loc_key(canonical) == expected),
            "noindex": signals["noindex"],
            "title_present": signals["title_present"],
            "h1_present": signals["h1_present"],
            "json_ld_blocks": signals["json_ld_blocks"],
        }
        if response.status != 200:
            issue_counts["non_200"] += 1
        if row["redirected"]:
            issue_counts["redirected_indexable"] += 1
        if not row["canonical_self"]:
            issue_counts["canonical_mismatch"] += 1
        if row["noindex"]:
            issue_counts["noindex_in_sitemap"] += 1
        if not row["title_present"]:
            issue_counts["missing_title"] += 1
        if not row["h1_present"]:
            issue_counts["missing_h1"] += 1
        if not row["json_ld_blocks"]:
            # JSON-LD is useful census evidence, but it is not universally
            # required (for example, legal pages have no eligible rich result).
            structured_data_missing.append(row["path"])
        pages.append(row)

    missing_probe = fetch_public(f"{base}/__organic-audit-missing-20260827/", timeout=timeout)
    unique_locs = {loc_key(loc) for loc in locs}
    return {
        "base_url": base,
        "robots": {
            "status": robots.status,
            "sitemap_index_declared": f"Sitemap: {SITE}/sitemap-index.xml" in robots.body,
        },
        "sitemap_index": {"status": index.status, "members": len(members)},
        "member_sitemaps": member_rows,
        "declared_locs": len(locs),
        "unique_locs": len(unique_locs),
        "duplicate_locs": len(locs) - len(unique_locs),
        "pages": pages,
        "issue_counts": dict(sorted(issue_counts.items())),
        "structured_data": {
            "with_json_ld": len(pages) - len(structured_data_missing),
            "without_json_ld": len(structured_data_missing),
            "without_json_ld_paths": structured_data_missing,
        },
        "missing_probe": {
            "status": missing_probe.status,
            "final_path": loc_path(missing_probe.final_url),
        },
        "server": index.headers.get("server"),
        "ok": (
            robots.status == 200
            and index.status == 200
            and bool(members)
            and bool(locs)
            and len(locs) == len(unique_locs)
            and not issue_counts
            and missing_probe.status in {404, 410}
        ),
    }


def is_sensitive_gsc_value(value: Any) -> bool:
    """Mirror the current producer/runtime value guard for regression evidence."""
    if not isinstance(value, str):
        return False
    if HASH_RE.fullmatch(value):
        return False
    if re.match(r"^(?:https?://|/)[^\s]*[?#]", value, re.I):
        return True
    return bool(
        re.search(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b", value)
        or PHONE_LIKE_RE.search(value)
        or re.search(r"(?:wa\.me|whatsapp\.com)/", value, re.I)
    )


def sensitive_gsc_value_paths(value: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(sensitive_gsc_value_paths(item, f"{path}[{index}]"))
    elif isinstance(value, dict):
        for key, item in value.items():
            found.extend(sensitive_gsc_value_paths(item, f"{path}.{key}"))
    elif is_sensitive_gsc_value(value):
        found.append(path)
    return found


def opportunity_score(inputs: dict[str, Any]) -> float:
    demand = float(inputs["demand_observed"])
    intent = float(inputs["commercial_intent"])
    proximity = float(inputs["ranking_proximity"])
    conversion = float(inputs["conversion_capacity"])
    effort = float(inputs["effort"])
    if demand < 0 or intent <= 0 or proximity <= 0 or conversion <= 0 or effort <= 0:
        raise ValueError("opportunity_score_inputs_invalid")
    return round(demand * intent * proximity * conversion / effort, 2)


def validate_campaign_report(report: dict[str, Any], *, root: Path) -> list[str]:
    errors: list[str] = []
    if report.get("schema_version") != REPORT_SCHEMA:
        errors.append("schema_version_invalid")
    terminal = str(report.get("terminal_state") or "")
    if not terminal.startswith(TERMINAL_PREFIXES):
        errors.append("terminal_state_invalid")
    opportunities = report.get("top_10_opportunities")
    if not isinstance(opportunities, list) or len(opportunities) != 10:
        errors.append("top_10_cardinality")
        opportunities = []
    scores: list[float] = []
    for index, item in enumerate(opportunities, start=1):
        if item.get("rank") != index:
            errors.append(f"opportunity_rank_invalid:{index}")
        if item.get("decision_state") not in DECISION_STATES:
            errors.append(f"opportunity_decision_invalid:{index}")
        if not set(item.get("leverage") or []).intersection(ALLOWED_LEVERAGE):
            errors.append(f"opportunity_leverage_missing:{index}")
        for required in (
            "evidence",
            "baseline",
            "time_to_evidence",
            "repetition_100x",
            "decision_criteria",
            "kill_criteria",
            "existing_issue",
        ):
            if not item.get(required):
                errors.append(f"opportunity_{required}_missing:{index}")
        try:
            expected = opportunity_score(item["score_inputs"])
            actual = float(item["priority_score"])
            if actual != expected:
                errors.append(f"opportunity_score_mismatch:{index}")
            scores.append(actual)
        except (KeyError, TypeError, ValueError):
            errors.append(f"opportunity_score_invalid:{index}")
        target = item.get("existing_url")
        if target and not local_html_path(root, str(target)).is_file():
            errors.append(f"opportunity_new_or_missing_url:{index}")
    if scores != sorted(scores, reverse=True):
        errors.append("opportunity_order_invalid")

    mutations = report.get("mutations") or {}
    if mutations.get("new_public_pages", 0) != 0:
        errors.append("new_public_pages_forbidden")
    if mutations.get("html_edits", 0) and not mutations.get("semantic_owner_proven"):
        errors.append("html_edit_without_owner")
    gsc = report.get("gsc_durable_state") or {}
    if gsc.get("durable_readback") is not True and terminal.startswith("GO:"):
        errors.append("go_without_gsc_durable_readback")
    return errors


def _write_output(path: Path | None, payload: dict[str, Any]) -> None:
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if path is None:
        print(rendered, end="")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    live = sub.add_parser("live-census")
    live.add_argument("--base-url", default=SITE)
    live.add_argument("--timeout", type=float, default=20.0)
    live.add_argument("--out", type=Path)

    links = sub.add_parser("link-census")
    links.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    links.add_argument("--out", type=Path)

    validate = sub.add_parser("validate-report")
    validate.add_argument("report", type=Path)
    validate.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])

    sensitive = sub.add_parser("diagnose-gsc-history")
    sensitive.add_argument("history", type=Path)

    args = parser.parse_args(argv)
    if args.command == "live-census":
        result = live_census(base_url=args.base_url, timeout=args.timeout)
        _write_output(args.out, result)
        return 0 if result["ok"] else 1
    if args.command == "link-census":
        from scripts.organic.sitemap_graph import load_graph_locs

        result = internal_link_census(args.root, load_graph_locs(args.root))
        _write_output(args.out, result)
        return 0 if result["ok"] else 1
    if args.command == "diagnose-gsc-history":
        history = json.loads(args.history.read_text(encoding="utf-8"))
        paths = sensitive_gsc_value_paths(history)
        result = {"ok": not paths, "sensitive_value_paths": paths}
        _write_output(None, result)
        return 0 if result["ok"] else 1

    report = json.loads(args.report.read_text(encoding="utf-8"))
    errors = validate_campaign_report(report, root=args.root)
    print(json.dumps({"ok": not errors, "errors": errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
