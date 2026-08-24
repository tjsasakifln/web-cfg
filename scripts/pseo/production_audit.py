#!/usr/bin/env python3
"""Production pSEO auditor — GET confenge.com.br (never localhost as proof).

Stages vocabulary (never call earlier stages "indexado"):
  GENERATED_LOCAL → QUALITY_ELIGIBLE → EDITORIALLY_APPROVED →
  DEPLOYED_PRODUCTION → CRAWLABLE_PRODUCTION → DISCOVERED_BY_GOOGLE →
  CRAWLED_BY_GOOGLE → INDEXED_BY_GOOGLE → RECEIVING_IMPRESSIONS →
  GENERATING_QUALIFIED_LEADS

This auditor only proves up to CRAWLABLE_PRODUCTION (HTTP 200, robots, canonical,
sitemap membership, local-vs-prod HTML). Discovery/crawl/index require GSC.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://confenge.com.br"
DEFAULT_OUT_DIR = ROOT / "seo"
SCRATCH_HINT = Path("/tmp/grok-goal-3094e0e6c9ea/implementer/prod-audit")

UA_BROWSER = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
UA_GOOGLEBOT = (
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
)

# Critical defect codes that force non-zero exit
CRITICAL_CODES = frozenset(
    {
        "http_3xx_on_canonical",
        "http_4xx",
        "http_5xx",
        "noindex_on_publish",
        "x_robots_noindex",
        "canonical_divergent",
        "canonical_home_or_hub",
        "canonical_netlify_host",
        "orphan_page",
        "missing_from_sitemap",
        "sitemap_non_indexable",
        "empty_or_soft404",
        "ua_skew",
        "future_lastmod",
        "prod_html_mismatch",
        "local_artifact_missing",
        "fetch_error",
    }
)


@dataclass
class UrlAudit:
    path: str
    expected_role: str  # publish | hub | noindex_sample
    browser: dict[str, Any] = field(default_factory=dict)
    googlebot: dict[str, Any] = field(default_factory=dict)
    local_html_sha256: str | None = None
    prod_html_sha256: str | None = None
    in_sitemap: bool = False
    in_hub: bool | None = None
    defects: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    stage_reached: str = "UNKNOWN"


class _LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for k, v in attrs:
            if k.lower() == "href" and v:
                self.hrefs.append(v)


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _git_sha(repo: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=10,
        )
        return out.strip()
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return None


def _meta(html: str, name: str) -> str | None:
    pat = (
        rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']*)["\']'
        rf'|<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']{re.escape(name)}["\']'
    )
    m = re.search(pat, html, re.I | re.S)
    if not m:
        return None
    return (m.group(1) or m.group(2) or "").strip()


def _tag_text(html: str, tag: str) -> str | None:
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, re.I | re.S)
    if not m:
        return None
    return re.sub(r"<[^>]+>", "", m.group(1)).strip()


def _canonical(html: str) -> str | None:
    m = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']'
        r'|<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        re.I | re.S,
    )
    if not m:
        return None
    return (m.group(1) or m.group(2) or "").strip()


def _visible_text_len(html: str) -> int:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # rough non-boilerplate: drop very short chrome phrases
    return len(text)


def fetch_url(
    url: str,
    ua: str,
    *,
    timeout: float = 25.0,
    max_redirects: int = 8,
) -> dict[str, Any]:
    """GET with redirect chain (urllib follows; we also capture final URL)."""
    ctx = ssl.create_default_context()
    chain: list[dict[str, Any]] = []
    current = url
    body = b""
    headers: dict[str, str] = {}
    status: int | None = None
    err: str | None = None

    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
            return None

    # First try with redirect following for body; separately walk chain without follow
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    walk = urllib.request.build_opener(
        _NoRedirect(),
        urllib.request.HTTPSHandler(context=ctx),
    )

    # Walk redirects for chain
    seen = set()
    walk_url = url
    for _ in range(max_redirects + 1):
        if walk_url in seen:
            chain.append({"url": walk_url, "error": "redirect_loop"})
            break
        seen.add(walk_url)
        req = urllib.request.Request(
            walk_url,
            method="GET",
            headers={"User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*"},
        )
        try:
            with walk.open(req, timeout=timeout) as resp:
                st = getattr(resp, "status", None) or resp.getcode()
                hdrs = {k.lower(): v for k, v in resp.headers.items()}
                chain.append(
                    {
                        "url": walk_url,
                        "status": st,
                        "location": hdrs.get("location"),
                        "content_type": hdrs.get("content-type"),
                    }
                )
                if 200 <= int(st) < 300:
                    break
                # non-redirect terminal
                if not (300 <= int(st) < 400):
                    break
        except urllib.error.HTTPError as e:
            hdrs = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
            loc = hdrs.get("location")
            chain.append(
                {
                    "url": walk_url,
                    "status": e.code,
                    "location": loc,
                    "content_type": hdrs.get("content-type"),
                }
            )
            if e.code in {301, 302, 303, 307, 308} and loc:
                walk_url = urljoin(walk_url, loc)
                continue
            break
        except Exception as e:  # noqa: BLE001
            chain.append({"url": walk_url, "error": str(e)})
            err = str(e)
            break

    # Full GET with follow for body
    req2 = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*"},
    )
    try:
        with opener.open(req2, timeout=timeout) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            body = resp.read()
            current = resp.geturl()
    except urllib.error.HTTPError as e:
        status = e.code
        headers = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
        try:
            body = e.read() or b""
        except Exception:  # noqa: BLE001
            body = b""
        current = e.geturl() if hasattr(e, "geturl") else url
        err = f"HTTPError {e.code}"
    except Exception as e:  # noqa: BLE001
        err = str(e)
        status = None

    html = body.decode("utf-8", errors="replace") if body else ""
    parsed = {
        "title": _tag_text(html, "title"),
        "h1": _tag_text(html, "h1"),
        "meta_robots": _meta(html, "robots"),
        "meta_description": _meta(html, "description"),
        "canonical": _canonical(html),
        "text_len": _visible_text_len(html) if html else 0,
    }
    return {
        "request_url": url,
        "final_url": current,
        "status": status,
        "error": err,
        "headers": {
            "content-type": headers.get("content-type"),
            "x-robots-tag": headers.get("x-robots-tag"),
            "server": headers.get("server"),
            "cache-status": headers.get("cache-status"),
        },
        "redirect_chain": chain,
        "body_size": len(body),
        "html_sha256": _sha256_bytes(body) if body else None,
        "html_snippet": html[:500] if html else "",
        **parsed,
    }


def load_registry(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"pages": []}
    return json.loads(path.read_text(encoding="utf-8"))


def load_sitemap_urls(path: Path) -> set[str]:
    if not path.exists():
        return set()
    text = path.read_text(encoding="utf-8")
    return set(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text))


def local_html_hash(root: Path, path: str) -> str | None:
    rel = path.strip("/")
    # Netlify publishes _site. Once that artifact exists, never conceal a
    # missing public route by falling back to a source HTML file at repo root.
    artifact = root / "_site"
    base = artifact if artifact.is_dir() else root
    fp = base / rel / "index.html"
    return _sha256_bytes(fp.read_bytes()) if fp.is_file() else None


def collect_targets(
    reg: dict[str, Any],
    *,
    extra_paths: list[str] | None = None,
) -> list[tuple[str, str]]:
    """Return (path, role) list: all publish, all hubs, sample noindex."""
    hubs = [
        "/inteligencia/",
        "/inteligencia/mercados/",
        "/inteligencia/orgaos/",
        "/inteligencia/precos/",
        "/inteligencia/concorrencia/",
        "/inteligencia/cenarios/",
        "/radar/",
    ]
    out: list[tuple[str, str]] = [(h, "hub") for h in hubs]
    seen = {h for h, _ in out}
    pages = reg.get("pages") or []
    for p in pages:
        url = p.get("url") or ""
        if not url or url in seen:
            continue
        status = p.get("status")
        if status == "publish":
            out.append((url, "publish"))
            seen.add(url)
    # sample noindex / reject (up to 5)
    n_sample = 0
    for p in pages:
        url = p.get("url") or ""
        if not url or url in seen:
            continue
        if p.get("status") in {"noindex", "reject"}:
            out.append((url, "noindex_sample"))
            seen.add(url)
            n_sample += 1
            if n_sample >= 5:
                break
    # Ensure Wave-0 seed URLs are audited even if not among the noindex sample.
    # Role follows registry status when known — never force demoted seeds to "publish".
    seed_wave0 = [
        "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
        "/inteligencia/cenarios/inconsistencia-orcamento-edital/",
        "/inteligencia/cenarios/referencia-sinapi-sicro-margem/",
        "/radar/edificacoes-publicas-pr/",
    ]
    status_by_url = {
        (p.get("url") or ""): (p.get("status") or "")
        for p in pages
        if p.get("url")
    }
    for s in seed_wave0:
        if s in seen:
            continue
        st = status_by_url.get(s, "publish")
        if st == "publish":
            role = "publish"
        elif st in {"noindex", "reject"}:
            role = "noindex_sample"
        else:
            role = "publish_candidate"
        out.append((s, role))
        seen.add(s)
    # Legacy / demoted paths — sample only (no critical index requirements)
    legacy = [
        "/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/",
        "/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/",
        "/radar/pavimentacao-infraestrutura-viaria-sc/",
    ]
    for s in legacy:
        if s not in seen:
            out.append((s, "publish_candidate"))
            seen.add(s)
    for p in extra_paths or []:
        if p not in seen:
            out.append((p, "extra"))
            seen.add(p)
    return out


def _host(url: str | None) -> str | None:
    if not url:
        return None
    return urlparse(url).netloc.lower()


def evaluate_row(
    row: UrlAudit,
    *,
    sitemap_urls: set[str],
    hub_link_targets: set[str] | None = None,
) -> UrlAudit:
    b = row.browser
    g = row.googlebot
    defects: list[str] = []
    notes: list[str] = list(row.notes)

    if row.local_html_sha256 is None and row.expected_role in {
        "publish",
        "hub",
        "noindex_sample",
    }:
        defects.append("local_artifact_missing")

    if b.get("error") and not b.get("status"):
        if row.expected_role != "noindex_sample":
            defects.append("fetch_error")
        else:
            notes.append("fetch_error_on_noindex_sample")
    st = b.get("status")
    if st is not None:
        if 300 <= int(st) < 400:
            if row.expected_role in {"publish", "hub"}:
                defects.append("http_3xx_on_canonical")
            else:
                notes.append("http_3xx_sample_or_legacy")
        elif 400 <= int(st) < 500:
            # 4xx on noindex samples / former seeds is informational
            if row.expected_role in {"publish", "hub"}:
                defects.append("http_4xx")
            else:
                notes.append("http_4xx_sample")
        elif int(st) >= 500:
            defects.append("http_5xx")

    chain = b.get("redirect_chain") or []
    if any(
        isinstance(c.get("status"), int) and 300 <= c["status"] < 400 for c in chain
    ):
        final_st = b.get("status")
        if final_st and int(final_st) == 200 and len(chain) > 1:
            notes.append("redirect_chain_present")
            # canonical leaf publish must not 3xx
            if row.expected_role == "publish" and chain:
                if chain[0].get("url", "").rstrip("/") == (SITE + row.path).rstrip("/"):
                    if isinstance(chain[0].get("status"), int) and 300 <= chain[0]["status"] < 400:
                        defects.append("http_3xx_on_canonical")

    robots = (b.get("meta_robots") or "").lower()
    xrobots = ((b.get("headers") or {}).get("x-robots-tag") or "").lower()
    # Empty hubs intentionally use noindex,follow — only leaf publish pages must be indexable.
    if row.expected_role in {"publish"}:
        if "noindex" in robots:
            defects.append("noindex_on_publish")
        if "noindex" in xrobots:
            defects.append("x_robots_noindex")
    elif row.expected_role == "hub":
        # noindex on hub is allowed (empty-hub policy); X-Robots noindex still noted
        if "noindex" in xrobots and "noindex" not in robots:
            defects.append("x_robots_noindex")
    elif row.expected_role == "publish_candidate":
        # Historical seed paths that may have been demoted — soft note only
        if "noindex" in robots:
            notes.append("noindex_on_former_seed")
        if "noindex" in xrobots:
            notes.append("x_robots_noindex_former_seed")

    canon = b.get("canonical")
    expected_canon = SITE + row.path
    if canon:
        ch = _host(canon)
        if ch and "netlify.app" in ch:
            defects.append("canonical_netlify_host")
        # self-canonical for leaf pages
        if row.expected_role == "publish":
            if canon.rstrip("/") != expected_canon.rstrip("/"):
                if canon.rstrip("/").endswith(
                    (
                        "/inteligencia",
                        "/radar",
                        "/inteligencia/",
                        "/radar/",
                        "/inteligencia/mercados",
                        "/inteligencia/orgaos",
                        "/inteligencia/precos",
                        "/inteligencia/concorrencia",
                        "/inteligencia/cenarios",
                    )
                ):
                    defects.append("canonical_home_or_hub")
                else:
                    defects.append("canonical_divergent")

    # soft-404 / empty (only meaningful on 200 responses for roles we care about)
    text_len = int(b.get("text_len") or 0)
    body_size = int(b.get("body_size") or 0)
    if row.expected_role in {"publish", "publish_candidate", "hub"} and st == 200:
        if body_size < 800 or text_len < 400:
            defects.append("empty_or_soft404")
        title = (b.get("title") or "").lower()
        if "404" in title or "not found" in title or "página não encontrada" in title:
            defects.append("empty_or_soft404")

    # UA skew: status or robots differ
    if g.get("status") is not None and b.get("status") is not None:
        if int(g["status"]) != int(b["status"]):
            defects.append("ua_skew")
        gr = (g.get("meta_robots") or "").lower()
        if gr and robots and ("noindex" in gr) != ("noindex" in robots):
            defects.append("ua_skew")

    # sitemap
    full = SITE + row.path
    row.in_sitemap = full in sitemap_urls or full.rstrip("/") in {
        u.rstrip("/") for u in sitemap_urls
    }
    if row.expected_role == "publish" and st == 200:
        if "noindex" not in robots and not row.in_sitemap:
            defects.append("missing_from_sitemap")
    if row.in_sitemap and "noindex" in robots and row.expected_role == "publish":
        defects.append("sitemap_non_indexable")
    # Hub noindex while listed in sitemap is a policy bug
    if row.expected_role == "hub" and row.in_sitemap and "noindex" in robots:
        defects.append("sitemap_non_indexable")

    # hub membership (inbound from hub HTML mesh)
    variants = {row.path, row.path.rstrip("/") + "/", row.path.rstrip("/")}
    if hub_link_targets is not None:
        row.in_hub = bool(variants & hub_link_targets)
    else:
        row.in_hub = None

    # orphan: publish page not linked from any hub (when hub map provided)
    if hub_link_targets is not None and row.expected_role == "publish":
        if not row.in_hub:
            if st == 200 and "noindex" not in robots:
                defects.append("orphan_page")

    # local vs prod hash for current publish + hubs only
    row.prod_html_sha256 = b.get("html_sha256")
    if (
        row.local_html_sha256
        and row.prod_html_sha256
        and row.local_html_sha256 != row.prod_html_sha256
        and row.expected_role in {"publish", "hub"}
    ):
        defects.append("prod_html_mismatch")
        notes.append("local_and_production_html_differ")

    row.defects = sorted(set(defects))
    row.notes = notes

    # stage
    if st == 200 and "noindex" not in robots and "noindex" not in xrobots:
        row.stage_reached = "CRAWLABLE_PRODUCTION"
    elif st == 200:
        row.stage_reached = "DEPLOYED_PRODUCTION"
    elif st:
        row.stage_reached = "DEPLOYED_PRODUCTION"
    else:
        row.stage_reached = "UNKNOWN"
    return row


def audit_sitemap_lastmod(sitemap_text: str, today: date | None = None) -> list[str]:
    # Prefer UTC calendar day — Netlify/build and lastmod are written in UTC.
    # Local date.today() can lag behind UTC near midnight and false-flag lastmod.
    if today is None:
        from datetime import datetime, timezone

        today = datetime.now(timezone.utc).date()
    defects: list[str] = []
    for m in re.finditer(r"<lastmod>\s*([^<\s]+)\s*</lastmod>", sitemap_text):
        raw = m.group(1).strip()[:10]
        try:
            d = date.fromisoformat(raw)
        except ValueError:
            continue
        if d > today:
            defects.append("future_lastmod")
            break
    return defects


def collect_hub_links(root: Path) -> set[str]:
    targets: set[str] = set()
    for hub in (
        "inteligencia/index.html",
        "inteligencia/mercados/index.html",
        "inteligencia/orgaos/index.html",
        "inteligencia/precos/index.html",
        "inteligencia/concorrencia/index.html",
        "inteligencia/cenarios/index.html",
        "radar/index.html",
        "index.html",
    ):
        fp = root / hub
        if not fp.exists():
            continue
        html = fp.read_text(encoding="utf-8", errors="replace")
        parser = _LinkCollector()
        try:
            parser.feed(html)
        except Exception:  # noqa: BLE001
            continue
        for href in parser.hrefs:
            if href.startswith("http"):
                if "confenge.com.br" in href:
                    path = urlparse(href).path
                else:
                    continue
            else:
                path = href.split("#")[0].split("?")[0]
            if path.startswith(("/inteligencia/", "/radar/")):
                if not path.endswith("/"):
                    path = path + "/"
                targets.add(path)
    return targets


def run_audit(
    *,
    root: Path = ROOT,
    base_url: str = SITE,
    out_dir: Path | None = None,
    also_scratch: Path | None = None,
) -> dict[str, Any]:
    out_dir = out_dir or DEFAULT_OUT_DIR
    reg = load_registry(root / "data" / "pseo" / "registry.json")
    # Prefer production sitemap for membership truth; also load local
    local_sm = load_sitemap_urls(root / "sitemap-inteligencia.xml")
    prod_sm_text = ""
    prod_sm: set[str] = set()
    try:
        sm_res = fetch_url(f"{base_url}/sitemap-inteligencia.xml", UA_BROWSER)
        prod_sm_text = sm_res.get("html_snippet") or ""
        if sm_res.get("body_size"):
            # re-fetch full via urllib already truncated in snippet — use full GET body
            req = urllib.request.Request(
                f"{base_url}/sitemap-inteligencia.xml",
                headers={"User-Agent": UA_BROWSER},
            )
            with urllib.request.urlopen(req, timeout=25) as r:
                prod_sm_text = r.read().decode("utf-8", errors="replace")
        prod_sm = set(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", prod_sm_text))
    except Exception as e:  # noqa: BLE001
        prod_sm = set()
        prod_sm_text = f"<!-- fetch_error: {e} -->"

    production_sitemap_available = bool(prod_sm)
    sitemap_urls = prod_sm or local_sm
    hub_links = collect_hub_links(root)
    targets = collect_targets(reg)

    rows: list[UrlAudit] = []
    for path, role in targets:
        url = base_url.rstrip("/") + path
        row = UrlAudit(path=path, expected_role=role)
        row.local_html_sha256 = local_html_hash(root, path)
        row.browser = fetch_url(url, UA_BROWSER)
        row.googlebot = fetch_url(url, UA_GOOGLEBOT)
        # for googlebot, also parse meta if body present
        if row.googlebot.get("html_snippet") and not row.googlebot.get("meta_robots"):
            # already parsed in fetch_url
            pass
        row = evaluate_row(row, sitemap_urls=sitemap_urls, hub_link_targets=hub_links)
        rows.append(row)

    sm_defects = audit_sitemap_lastmod(prod_sm_text) if prod_sm_text else []

    critical: list[str] = []
    for r in rows:
        for d in r.defects:
            if d in CRITICAL_CODES:
                critical.append(f"{r.path}:{d}")
    for d in sm_defects:
        critical.append(f"sitemap:{d}")
    if not production_sitemap_available:
        critical.append("sitemap:production_sitemap_unavailable")

    # global: netlify host as canonical anywhere
    web_cfg_sha = _git_sha(root)
    technical_ok = len(critical) == 0

    # Deploy-bound identity (never copy ok from a prior SHA)
    from scripts.pseo.audit_identity import (
        bind_ok_to_identity,
        evaluate_audit_currency,
        identity_block,
        public_artifact_hash,
        seed_set_hash,
        snapshot_hash_from_manifest,
    )

    seed_urls = [p for p, role in targets if role == "publish"]
    live_manifest_sha = None
    live_snapshot_short = None
    try:
        man_res = fetch_url(f"{base_url}/.well-known/pseo-build.json", UA_BROWSER)
        if man_res.get("status") == 200 and man_res.get("html_snippet"):
            # body may be full JSON in snippet if small; re-fetch full
            req = urllib.request.Request(
                f"{base_url}/.well-known/pseo-build.json",
                headers={"User-Agent": UA_BROWSER},
            )
            with urllib.request.urlopen(req, timeout=25) as r:
                live_man = json.loads(r.read().decode("utf-8", errors="replace"))
            live_manifest_sha = live_man.get("web_cfg_sha")
            live_snapshot_short = live_man.get("snapshot_hash_short")
    except Exception:  # noqa: BLE001
        pass

    snap_hash = snapshot_hash_from_manifest(root) or reg.get("dataset_hash")
    art_hash = public_artifact_hash(root, "_site")
    # audit_target_sha is the deploy under audit (live tip), NOT local git HEAD.
    # Evidence-only commits may advance HEAD without redeploying HTML; binding to
    # git HEAD falsely yields STALE_AUDIT_DEPLOY_MISMATCH against a healthy live tip.
    audit_target = live_manifest_sha or web_cfg_sha or "unknown"
    identity = identity_block(
        audit_target_sha=audit_target,
        live_manifest_sha=live_manifest_sha,
        snapshot_hash=snap_hash,
        public_artifact_hash_value=art_hash,
        seed_urls=seed_urls,
    )
    currency = evaluate_audit_currency(
        identity,
        netlify_deployed_sha=live_manifest_sha,
        live_snapshot_hash=live_snapshot_short,
        current_seed_set_hash=seed_set_hash(seed_urls),
    )
    bound = bind_ok_to_identity(technical_ok, identity, currency)

    result = {
        "ok": bound["ok"],
        "technical_ok": technical_ok,
        "production_audit_is_current": bound["production_audit_is_current"],
        "stale_code": bound.get("stale_code"),
        "identity_mismatches": bound.get("mismatches") or [],
        "audit_generated_at": identity["audit_generated_at"],
        "audit_target_sha": identity["audit_target_sha"],
        "live_manifest_sha": identity["live_manifest_sha"],
        "snapshot_hash": identity["snapshot_hash"],
        "public_artifact_hash": identity["public_artifact_hash"],
        "seed_set_hash": identity["seed_set_hash"],
        "auditor_version": identity["auditor_version"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "web_cfg_sha": web_cfg_sha,
        "git_head": web_cfg_sha,
        "netlify_deployed_sha": live_manifest_sha,
        "dataset_hash": reg.get("dataset_hash"),
        "vocabulary_note": (
            "CRAWLABLE_PRODUCTION ≠ INDEXED_BY_GOOGLE. "
            "index,follow / sitemap / local build never mean 'indexado'. "
            "ok=true only when technical audit passes AND identities match live deploy."
        ),
        "sitemap": {
            "url_count": len(sitemap_urls),
            "urls": sorted(sitemap_urls),
            "defects": sm_defects,
            "source": "production" if prod_sm else "local",
            "production_available": production_sitemap_available,
        },
        "counts": {
            "urls_audited": len(rows),
            "critical_defects": len(critical),
            "crawlable_production": sum(
                1 for r in rows if r.stage_reached == "CRAWLABLE_PRODUCTION"
            ),
            "deployed_only": sum(
                1 for r in rows if r.stage_reached == "DEPLOYED_PRODUCTION"
            ),
        },
        "critical": critical,
        "rows": [
            {
                **asdict(r),
                # drop large snippets from JSON rows to keep file usable
                "browser": {
                    k: v
                    for k, v in r.browser.items()
                    if k != "html_snippet"
                },
                "googlebot": {
                    k: v
                    for k, v in r.googlebot.items()
                    if k != "html_snippet"
                },
            }
            for r in rows
        ],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "pseo-production-audit.json"
    md_path = out_dir / "pseo-production-audit.md"
    json_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    md_path.write_text(_render_md(result), encoding="utf-8")

    if also_scratch:
        also_scratch.mkdir(parents=True, exist_ok=True)
        (also_scratch / "pseo-production-audit.json").write_text(
            json_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
        (also_scratch / "pseo-production-audit.md").write_text(
            md_path.read_text(encoding="utf-8"), encoding="utf-8"
        )

    return result


def _render_md(result: dict[str, Any]) -> str:
    lines = [
        "# pSEO production audit",
        "",
        f"- generated_at: `{result.get('generated_at')}`",
        f"- base_url: `{result.get('base_url')}`",
        f"- web_cfg_sha: `{result.get('web_cfg_sha')}`",
        f"- ok: **{result.get('ok')}**",
        f"- critical_defects: `{result['counts']['critical_defects']}`",
        f"- crawlable_production: `{result['counts']['crawlable_production']}`",
        "",
        result.get("vocabulary_note") or "",
        "",
        "## Critical",
        "",
    ]
    crit = result.get("critical") or []
    if not crit:
        lines.append("_none_")
    else:
        for c in crit:
            lines.append(f"- `{c}`")
    lines += ["", "## Per-URL matrix", ""]
    lines.append(
        "| path | role | HTTP | robots | canonical | sitemap | stage | defects |"
    )
    lines.append("|---|---|---:|---|---|---|---|---|")
    for r in result.get("rows") or []:
        b = r.get("browser") or {}
        lines.append(
            "| `{path}` | {role} | {st} | {rob} | {can} | {sm} | {stage} | {def_} |".format(
                path=r.get("path"),
                role=r.get("expected_role"),
                st=b.get("status"),
                rob=(b.get("meta_robots") or "")[:40],
                can=(b.get("canonical") or "")[:48],
                sm="yes" if r.get("in_sitemap") else "no",
                stage=r.get("stage_reached"),
                def_=", ".join(r.get("defects") or []) or "—",
            )
        )
    lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Audit pSEO pages on production")
    ap.add_argument("--base-url", default=SITE)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument(
        "--scratch",
        type=Path,
        default=SCRATCH_HINT if SCRATCH_HINT.parent.exists() else None,
    )
    ap.add_argument(
        "--allow-critical",
        action="store_true",
        help="Exit 0 even with critical defects (report still written)",
    )
    args = ap.parse_args(argv)
    result = run_audit(
        base_url=args.base_url.rstrip("/"),
        out_dir=args.out_dir,
        also_scratch=args.scratch,
    )
    print(
        json.dumps(
            {
                "ok": result["ok"],
                "critical": result["critical"][:30],
                "counts": result["counts"],
                "report": str((args.out_dir / "pseo-production-audit.json")),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if result["ok"] or args.allow_critical:
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
