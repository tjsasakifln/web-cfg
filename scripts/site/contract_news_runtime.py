"""Exact release acceptance for the four durable contract-news documents."""
from __future__ import annotations

import hashlib
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "confenge.contract-news-runtime/v1"
PREFIX = "/noticias/contratos-publicos/"
ORIGIN = "https://confenge.com.br"
HTML = PREFIX.lstrip("/") + "index.html"
RECENT = PREFIX.lstrip("/") + "news-sitemap.xml"
DOCUMENTS = {PREFIX.lstrip("/") + name: PREFIX + ("" if name == "index.html" else name)
             for name in ("index.html", "sitemap.xml", "news-sitemap.xml", "feed.xml")}
ALIASES = {path: {"status": 308, "location": PREFIX, "runtime_marker_required": path != PREFIX[:-1]}
           for path in (PREFIX[:-1], PREFIX + "index.html", PREFIX + "pagina/1/",
                        PREFIX + "index.html?contract-news-probe=1")}
SOURCE_FILES = {
    "runtime/contract.json", "runtime/lib/server.mjs", "runtime/contract-news/attest.mjs",
    "runtime/contract-news/server.mjs", "runtime/contract-news/schema.mjs",
    "runtime/contract-news/render.mjs", "data/site/brand.json", "data/site/public-ia-map.json",
}
MATERIAL_HEADERS = {
    "content-type", "content-security-policy", "cache-control", "x-robots-tag",
    "retry-after", "x-confenge-contract-news", "x-confenge-news-state", "x-confenge-news-snapshot",
}
HEX = re.compile(r"[a-f0-9]{64}\Z")
ARTICLE_URL = re.compile(re.escape(ORIGIN + PREFIX) + r"[a-z0-9]+(?:-[a-z0-9]+)*/\Z")
MAX_RESPONSE = 32 * 1024 * 1024
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
NEWS_NS = "{http://www.google.com/schemas/sitemap-news/0.9}"


def timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("timestamp must be a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def validate_inventory(raw: Any, release_sha: str, html: dict, assets: dict,
                       source_root: Path = ROOT) -> tuple[dict | None, list[str]]:
    """No prefix-wide allowance: the attestation is bound to four exact files."""
    present = {rel for rel in {*html, *assets} if rel.startswith(PREFIX.lstrip("/"))}
    if raw is None:
        return None, (["contract_news_attestation_missing"] if present else [])
    errors: list[str] = []
    required = {"schema", "release_sha", "prefix", "observed_at", "state", "snapshot_sha256",
                "generated_at", "article_count", "source_files_sha256", "documents", "aliases",
                "news_candidates", "physical_sha256"}
    if not isinstance(raw, dict) or set(raw) != required:
        return None, ["contract_news_attestation_shape_invalid"]
    if raw.get("schema") != SCHEMA or raw.get("prefix") != PREFIX or raw.get("release_sha") != release_sha:
        errors.append("contract_news_attestation_identity_invalid")
    physical = raw.get("physical_sha256")
    if not isinstance(physical, dict):
        return None, ["contract_news_physical_digest_invalid"]
    if present != set(DOCUMENTS) or set(physical) != set(DOCUMENTS):
        errors.append("contract_news_document_accounting_invalid")
    combined = html | assets
    if any(raw["physical_sha256"].get(rel) != combined.get(rel) or not HEX.fullmatch(str(combined.get(rel) or ""))
           for rel in DOCUMENTS):
        errors.append("contract_news_physical_digest_invalid")
    source = raw.get("source_files_sha256")
    if not isinstance(source, dict) or set(source) != SOURCE_FILES:
        errors.append("contract_news_source_files_invalid")
    else:
        for rel in sorted(SOURCE_FILES):
            file = source_root / rel
            if (not file.is_file() or file.is_symlink()
                    or source[rel] != hashlib.sha256(file.read_bytes()).hexdigest()):
                errors.append(f"contract_news_source_digest_mismatch:{rel}")
    state, count, snapshot = raw.get("state"), raw.get("article_count"), raw.get("snapshot_sha256")
    if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= 49_999:
        errors.append("contract_news_article_count_invalid")
    if state == "bootstrap":
        if snapshot is not None or raw.get("generated_at") is not None or count != 0:
            errors.append("contract_news_bootstrap_identity_invalid")
    elif state in {"empty", "published"}:
        if not HEX.fullmatch(str(snapshot or "")) or (state == "empty") != (count == 0):
            errors.append("contract_news_snapshot_identity_invalid")
        try:
            timestamp(raw.get("generated_at"))
        except (TypeError, ValueError):
            errors.append("contract_news_snapshot_time_invalid")
    else:
        errors.append("contract_news_state_invalid")
    try:
        timestamp(raw.get("observed_at"))
    except (TypeError, ValueError):
        errors.append("contract_news_observed_time_invalid")
    if raw.get("aliases") != ALIASES:
        errors.append("contract_news_aliases_invalid")
    docs = raw.get("documents")
    if not isinstance(docs, dict) or set(docs) != set(DOCUMENTS):
        errors.append("contract_news_responses_accounting_invalid")
    else:
        for rel, path in DOCUMENTS.items():
            row = docs[rel]
            if (not isinstance(row, dict) or set(row) != {"request_path", "status", "location", "sha256", "bytes", "headers"}
                    or row.get("request_path") != path or row.get("location") is not None
                    or row.get("status") != (503 if state == "bootstrap" else 200)
                    or not HEX.fullmatch(str(row.get("sha256") or ""))
                    or isinstance(row.get("bytes"), bool) or not isinstance(row.get("bytes"), int)
                    or not 0 < row["bytes"] <= MAX_RESPONSE):
                errors.append(f"contract_news_response_invalid:{rel}")
                continue
            headers = row.get("headers")
            if (not isinstance(headers, dict) or not set(headers) <= MATERIAL_HEADERS
                    or headers.get("x-confenge-contract-news") != SCHEMA
                    or headers.get("x-confenge-news-state") != ("unavailable" if state == "bootstrap" else state)
                    or headers.get("x-confenge-news-snapshot") != snapshot
                    or not str(headers.get("content-security-policy") or "").startswith("default-src 'self';")
                    or "unsafe-inline" in str(headers.get("content-security-policy"))):
                errors.append(f"contract_news_response_headers_invalid:{rel}")
                continue
            expected_type = "text/html; charset=utf-8" if state == "bootstrap" or rel == HTML else (
                "application/rss+xml; charset=utf-8" if rel.endswith("/feed.xml") else "application/xml; charset=utf-8")
            if headers.get("content-type") != expected_type:
                errors.append(f"contract_news_response_type_invalid:{rel}")
            if state == "bootstrap" and (headers.get("x-robots-tag") != "noindex, nofollow"
                    or headers.get("retry-after") != "300" or headers.get("cache-control") != "no-store, no-transform"):
                errors.append(f"contract_news_bootstrap_response_invalid:{rel}")
    candidates = raw.get("news_candidates")
    if not isinstance(candidates, list) or not isinstance(count, int) or len(candidates) > max(0, count):
        errors.append("contract_news_recent_candidates_invalid")
    else:
        urls: set[str] = set()
        for row in candidates:
            if (not isinstance(row, dict) or set(row) != {"url", "title", "published_at"}
                    or not ARTICLE_URL.fullmatch(str(row.get("url") or ""))
                    or row.get("url") in urls or not isinstance(row.get("title"), str)
                    or not 1 <= len(row["title"]) <= 200):
                errors.append("contract_news_recent_candidate_invalid")
                continue
            urls.add(row["url"])
            try:
                timestamp(row.get("published_at"))
            except (TypeError, ValueError):
                errors.append("contract_news_recent_candidate_time_invalid")
    return (raw if not errors else None), errors


def recent_sitemap_errors(body: bytes, proof: dict, now: datetime) -> list[str]:
    """Allow only the 48-hour clock boundary, bounded by 60s cache plus transit."""
    try:
        text = body.decode("utf-8", errors="strict")
        after_declaration = re.sub(r"^<\?xml\s[^?]*\?>", "", text, count=1)
        if "\x00" in text or "<!" in text or "<?" in after_declaration:
            return ["contract_news_recent_xml_declaration_forbidden"]
        root = ET.fromstring(text)
        if root.tag != SITEMAP_NS + "urlset" or root.attrib:
            return ["contract_news_recent_root_invalid"]
        leaves = {SITEMAP_NS + "loc", *(NEWS_NS + name for name in ("name", "language", "publication_date", "title"))}
        containers = {SITEMAP_NS + "urlset", SITEMAP_NS + "url", NEWS_NS + "news", NEWS_NS + "publication"}
        for element in root.iter():
            if (element.attrib or (element.tail or "").strip()
                    or (element.tag in leaves and len(element))
                    or (element.tag in containers and (element.text or "").strip())
                    or element.tag not in leaves | containers):
                return ["contract_news_recent_tree_invalid"]
        facts = {row["url"]: row for row in proof["news_candidates"]}
        actual = []
        for row in root:
            if row.tag != SITEMAP_NS + "url" or row.attrib or [child.tag for child in row] != [SITEMAP_NS + "loc", NEWS_NS + "news"]:
                return ["contract_news_recent_entry_invalid"]
            url = row.findtext(SITEMAP_NS + "loc")
            news = row.find(NEWS_NS + "news")
            fact = facts.get(url)
            if fact is None or url in actual or news is None:
                return ["contract_news_recent_snapshot_membership_invalid"]
            publication = news.find(NEWS_NS + "publication")
            if (publication is None or [child.tag for child in news] != [NEWS_NS + "publication", NEWS_NS + "publication_date", NEWS_NS + "title"]
                    or [child.tag for child in publication] != [NEWS_NS + "name", NEWS_NS + "language"]
                    or publication.findtext(NEWS_NS + "name") != "CONFENGE"
                    or publication.findtext(NEWS_NS + "language") != "pt"
                    or news.findtext(NEWS_NS + "title") != fact["title"]
                    or news.findtext(NEWS_NS + "publication_date") != fact["published_at"]):
                return ["contract_news_recent_facts_invalid"]
            actual.append(url)
        def eligible(clock: datetime) -> set[str]:
            return {row["url"] for row in proof["news_candidates"]
                    if clock - timedelta(hours=48) <= timestamp(row["published_at"]) <= clock}
        # Candidates retain the renderer's stable newest-first ordering.
        early, late = eligible(now - timedelta(seconds=120)), eligible(now + timedelta(seconds=120))
        early = set([row["url"] for row in proof["news_candidates"] if row["url"] in early][:1000])
        late = set([row["url"] for row in proof["news_candidates"] if row["url"] in late][:1000])
        required, allowed = early & late, early | late
        if len(actual) > 1000 or not required <= set(actual) <= allowed:
            return ["contract_news_recent_48h_window_invalid"]
        if actual != [row["url"] for row in proof["news_candidates"] if row["url"] in set(actual)]:
            return ["contract_news_recent_order_invalid"]
        return []
    except (ET.ParseError, TypeError, ValueError, KeyError):
        return ["contract_news_recent_xml_invalid"]


def verify_public(proof: dict | None, *, site: Path, base: str, fetcher: Callable,
                  timeout: float, now: datetime | None = None,
                  deadline_at: float | None = None, clock: Callable = time.monotonic,
                  sleeper: Callable = time.sleep) -> tuple[dict, dict[str, bytes]]:
    if proof is None:
        return {"applicable": False, "ok": True, "planned": 0, "executed": 0, "errors": []}, {}
    fixed_now = now
    now = now or datetime.now(timezone.utc)
    deadline_at = clock() + 310 if deadline_at is None else deadline_at
    errors: list[str] = []
    bodies: dict[str, bytes] = {}
    observed = timestamp(proof["observed_at"])
    if not now - timedelta(minutes=30) <= observed <= now + timedelta(minutes=5):
        errors.append("contract_news_attestation_not_current")

    def fetch_verified(path: str, assess: Callable):
        attempts = []
        while True:
            entry, body = fetcher(base + path, timeout)
            failures = assess(entry, body, fixed_now or datetime.now(timezone.utc))
            headers = entry.get("headers") or {}
            cache = str(headers.get("cf-cache-status") or "").upper()
            remaining = deadline_at - clock()
            retryable = (bool(failures) and entry.get("error") is None
                         and entry.get("read_completed") is True
                         and cache in {"HIT", "STALE", "UPDATING"})
            retry = retryable and remaining > 0
            attempts.append({"status": entry.get("status"), "sha256": entry.get("sha256"),
                             "snapshot_sha256": headers.get("x-confenge-news-snapshot"),
                             "cf_cache_status": cache or None, "errors": failures,
                             "decision": "retry_cache_propagation" if retry else (
                                 "verified" if not failures else "cache_deadline_exhausted" if retryable else "mismatch_no_retry")})
            if not retry:
                return entry, body, failures, attempts
            sleeper(min(15.0, remaining))

    rows = []
    for rel, expected in proof["documents"].items():
        physical = site / rel
        if not physical.is_file() or hashlib.sha256(physical.read_bytes()).hexdigest() != proof["physical_sha256"][rel]:
            errors.append(f"contract_news_packaged_shell_digest_mismatch:{rel}")
        clock_dependent = rel == RECENT and proof["state"] != "bootstrap"
        def assess_document(entry, body, at_time):
            headers = entry.get("headers") or {}
            transport = (entry.get("error") is None and entry.get("read_completed") is True
                         and entry.get("status") == expected["status"] and entry.get("location") is None
                         and str(headers.get("content-encoding") or "identity").lower() == "identity"
                         and body is not None and 0 < len(body) <= MAX_RESPONSE)
            digest = hashlib.sha256(body).hexdigest() if body is not None else None
            failures = []
            if not transport or entry.get("sha256") != digest:
                failures.append("transport_or_status_invalid")
            if not all(headers.get(key) == expected["headers"].get(key) for key in MATERIAL_HEADERS):
                failures.append("runtime_headers_invalid")
            if body is not None and clock_dependent:
                failures.extend(recent_sitemap_errors(body, proof, at_time))
            elif digest != expected["sha256"]:
                failures.append("snapshot_render_digest_mismatch")
            if body is not None and rel == HTML:
                text = body.decode("utf-8", errors="replace")
                robots = "noindex,follow" if proof["state"] != "published" else "index,follow,max-image-preview:large"
                if (f'<link rel="canonical" href="{ORIGIN + PREFIX}">' not in text
                        or f'<meta name="robots" content="{robots}">' not in text
                        or 'data-route-family="noticias-contratos-publicos"' not in text
                        or bool(re.search(r'<article class="news-card">', text)) != (proof["state"] == "published")):
                    failures.append("html_state_semantics_invalid")
            return failures
        entry, body, row_errors, attempts = fetch_verified(expected["request_path"], assess_document)
        headers = entry.get("headers") or {}
        digest = hashlib.sha256(body).hexdigest() if body is not None else None
        if body is not None:
            bodies[rel] = body
        errors.extend(f"contract_news_public:{rel}:{error}" for error in row_errors)
        rows.append({"path": rel, "status": entry.get("status"), "sha256": digest,
                     "snapshot_sha256": proof["snapshot_sha256"], "headers": headers,
                     "validation": "snapshot_facts_48h" if clock_dependent else "snapshot_render_sha256",
                     "attempts": attempts, "ok": not row_errors, "errors": row_errors})
    alias_rows = []
    for path, expected in proof["aliases"].items():
        def assess_alias(entry, _body, _time):
            ok = (entry.get("error") is None and entry.get("read_completed") is True
                  and entry.get("status") == expected["status"] and entry.get("location") == expected["location"]
                  and (not expected["runtime_marker_required"]
                       or (entry.get("headers") or {}).get("x-confenge-contract-news") == SCHEMA))
            return [] if ok else ["alias_response_invalid"]
        entry, _, failures, attempts = fetch_verified(path, assess_alias)
        ok = not failures
        alias_rows.append({"request_path": path, "status": entry.get("status"), "location": entry.get("location"), "attempts": attempts, "ok": ok})
        if not ok:
            errors.append(f"contract_news_alias_response_invalid:{path}")
    return {"schema": SCHEMA, "applicable": True, "release_sha": proof["release_sha"],
            "infrastructure_published": not errors, "archive_initialized": proof["state"] != "bootstrap",
            "state": proof["state"], "snapshot_sha256": proof["snapshot_sha256"], "article_count": proof["article_count"],
            "planned": len(DOCUMENTS), "executed": len(rows), "responses": rows, "aliases": alias_rows,
            "recent_cache_boundary_seconds": 120, "errors": errors, "ok": not errors}, bodies
