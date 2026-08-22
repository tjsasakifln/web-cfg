"""Inbound-first gates: naturalness, index surface, brand shell, conversion, legacy.

These operate on the shipped public HTML (repo root), not re-implementations.
Allowlists are explicit and justified in ALLOWLIST notes below.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SITE = "https://confenge.com.br"
ONPAGE_CAPTURE_ROUTES = (
    "defesa-margem-contratos-publicos",
    "atrasos-prorrogacao-obras-publicas",
    "defesa-tecnica-contratos-publicos",
    "acompanhamento-contratos-obras",
    "bid-room-licitacoes-obras",
)
CAPTURE_HIDDEN_FIELDS = (
    "offer_id",
    "terms_id",
    "jornada",
    "estagio",
    "origem",
    "asset_id",
    "cta_id",
    "route_family",
    "landing_page",
)

# --- Patterns that signal machine / keyword-stuffed copy ---
MACHINE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "converta_discussao",
        re.compile(
            r"Converta a discuss[aã]o sobre\s+[a-záàâãéêíóôõúç0-9\s\-]{8,80}\s+em um objeto delimitado",
            re.I,
        ),
    ),
    (
        "faq_doc_caso_de",
        re.compile(
            r"Qual documento deve ser lido primeiro em um caso de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,90}\??",
            re.I,
        ),
    ),
    (
        "faq_risco_caso_de",
        re.compile(
            r"Qual o primeiro risco pr[aá]tico em um caso de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,90}\??",
            re.I,
        ),
    ),
    (
        "caso_de_slug",
        re.compile(
            r"O caso de\s+[a-z0-9][a-z0-9\s]{12,70}\s+s[oó] se sustenta",
            re.I,
        ),
    ),
    (
        "caso_de_slug_loose",
        re.compile(
            r"O caso de\s+.{8,80}?\s+s[oó] se sustenta",
            re.I,
        ),
    ),
    (
        "absorver_keyword",
        re.compile(
            r"absorver custo ou risco de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,60}\s+sem prova",
            re.I,
        ),
    ),
    (
        "pipeline_internal",
        re.compile(
            r"\b(page_material_hash|dataset_hash|source_run_id|mandatory_fail|quality_gates?|"
            r"PUBLISH_READY|human_review\s*=|template_id|seed_url)\b",
            re.I,
        ),
    ),
]

# Shared chrome / docs / tests may contain patterns for detection — not public editorial.
ALLOWLIST_PATH_PREFIXES = (
    "docs/",
    "scripts/",
    "data/",
    "seo/scripts/",
    "node_modules/",
    "_site/",
    ".git/",
    "C:\\",
)

# Legacy entity strings must not appear in public marketing pages.
LEGACY_ENTITY_RE = re.compile(
    r"\b(Vision|NexGen|AVCB|CLCB|avalia[cç][oõ]es?\s+imobili[aá]ri|intelig[eê]ncia\s+artificial\s+gen[eé]rica)\b",
    re.I,
)

# Paths intentionally allowed to mention legacy only in historical cleanup docs (not here).
LEGACY_SCAN_SKIP = re.compile(r"(privacidade|termos-de-uso|404\.html|obrigado)")


@dataclass
class Finding:
    gate: str
    path: str
    reason: str
    excerpt: str = ""
    severity: str = "error"  # error | warn


@dataclass
class GateReport:
    ok: bool
    findings: list[Finding] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "findings": [asdict(f) for f in self.findings],
            "stats": self.stats,
        }


def strip_html(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = re.sub(r"&\w+;", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def robots_of(html: str) -> str:
    m = re.search(
        r'name=["\']robots["\'][^>]*content=["\']([^"\']+)',
        html,
        re.I,
    ) or re.search(
        r'content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']',
        html,
        re.I,
    )
    return (m.group(1) if m else "MISSING").lower()


def is_noindex(html: str) -> bool:
    return "noindex" in robots_of(html)


def is_indexable_html(html: str) -> bool:
    rob = robots_of(html)
    if rob == "MISSING":
        return True  # crawlers treat missing robots as indexable
    return "noindex" not in rob


def path_to_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def public_html_files() -> list[Path]:
    """HTML under publish roots, excluding tooling and intelligence bulk if huge."""
    out: list[Path] = []
    skip_dirs = {
        "node_modules",
        ".git",
        "_site",
        "docs",
        "scripts",
        "data",
        "seo",
        ".pytest_cache",
        ".benchmarks",
        ".netlify",
        ".playwright-mcp",
        "netlify",
        ".worktrees",
    }
    # Always include these trees
    roots = [
        ROOT,
        ROOT / "conteudos",
        ROOT / "guias-contratos-obras",
        ROOT / "lei-14133-obras",
        ROOT / "jurisprudencia-contratos-obras",
        ROOT / "bid-room-licitacoes-obras",
        ROOT / "defesa-margem-contratos-publicos",
        ROOT / "diretoria-b2g",
        ROOT / "diagnostico-b2g-360",
        ROOT / "medicoes-glosas-obras-publicas",
        ROOT / "aditivos-obras-publicas",
        ROOT / "reequilibrio-obras-publicas",
        ROOT / "atrasos-prorrogacao-obras-publicas",
        ROOT / "defesa-tecnica-contratos-publicos",
        ROOT / "auditoria-orcamento-licitacao",
        ROOT / "diagnostico-pre-licitacao",
        ROOT / "acompanhamento-contratos-obras",
        ROOT / "metodologia-inteligencia",
        ROOT / "especialista",
        ROOT / "radar",
        ROOT / "privacidade",
        ROOT / "termos-de-uso",
        ROOT / "inteligencia",  # hubs only scanned shallowly below
    ]
    seen: set[Path] = set()
    for base in roots:
        if not base.exists():
            continue
        if base == ROOT:
            for p in base.glob("*.html"):
                if p not in seen:
                    seen.add(p)
                    out.append(p)
            continue
        if base.name == "inteligencia":
            # hubs + one level only (avoid 1k+ org pages in every gate run)
            for p in list(base.glob("index.html")) + list(base.glob("*/index.html")):
                if p not in seen:
                    seen.add(p)
                    out.append(p)
            continue
        for p in base.rglob("*.html"):
            if any(part in skip_dirs for part in p.parts):
                continue
            if p not in seen:
                seen.add(p)
                out.append(p)
    return out


def indexable_public_pages() -> list[Path]:
    return [p for p in public_html_files() if is_indexable_html(p.read_text(encoding="utf-8", errors="replace"))]


def sitemap_locs(path: Path) -> list[str]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text)


def gate_naturalness(*, only_indexable: bool = True) -> GateReport:
    findings: list[Finding] = []
    scanned = 0
    hit_pages = 0
    for p in public_html_files():
        html = p.read_text(encoding="utf-8", errors="replace")
        if only_indexable and not is_indexable_html(html):
            continue
        # Skip pure legal/privacy shells for machine FAQ patterns (still scan pipeline)
        scanned += 1
        text = strip_html(html)
        page_hits = []
        # Scan both raw HTML and stripped text so <strong> cannot hide slug keywords
        for name, pat in MACHINE_PATTERNS:
            for src in (html, text):
                for m in pat.finditer(src):
                    page_hits.append((name, m.group(0)[:120]))
                    break
                else:
                    continue
                break
        if page_hits:
            hit_pages += 1
            for name, excerpt in page_hits[:6]:
                findings.append(
                    Finding(
                        gate="naturalness",
                        path=str(p.relative_to(ROOT)),
                        reason=name,
                        excerpt=excerpt,
                    )
                )
        # Keyword sequence from slug in body (indexable only)
        if only_indexable and p.parent.name and p.parent.parent.name == "conteudos":
            slug_tokens = [t for t in p.parent.name.split("-") if len(t) > 2]
            if len(slug_tokens) >= 5:
                raw_seq = " ".join(slug_tokens)
                # Look for 5+ consecutive slug tokens without articles/prepositions in a phrase
                if raw_seq in text.lower():
                    findings.append(
                        Finding(
                            gate="naturalness",
                            path=str(p.relative_to(ROOT)),
                            reason="slug_token_sequence_in_body",
                            excerpt=raw_seq[:100],
                            severity="error",
                        )
                    )
    # warnings don't fail unless error
    errors = [f for f in findings if f.severity == "error"]
    return GateReport(
        ok=len(errors) == 0,
        findings=findings,
        stats={"scanned": scanned, "pages_with_hits": hit_pages, "error_count": len(errors)},
    )


def pillar_guide_count_findings(pillar: str, html: str) -> list[Finding]:
    """Fail when published guide counts exceed library-item size.

    Uses strip_html so HTML wrapping like <strong>15</strong><span>guias cannot hide
    overclaims (regression against gate theater).
    """
    findings: list[Finding] = []
    kept = len(re.findall(r'class="library-item"', html))
    plain = strip_html(html)
    for m in re.finditer(r"\b(\d{1,3})\s+guias?\b", plain, re.I):
        n = int(m.group(1))
        if n > kept:
            findings.append(
                Finding(
                    gate="index_surface",
                    path=f"{pillar}/index.html",
                    reason="pillar_guide_count_exceeds_library",
                    excerpt=f"{m.group(0)} kept={kept}",
                )
            )
    for m in re.finditer(
        r'class="pillar-stat"[^>]*>\s*<strong>(\d+)</strong>\s*<span>([^<]*guia[^<]*)</span>',
        html,
        re.I,
    ):
        n = int(m.group(1))
        if n != kept:
            findings.append(
                Finding(
                    gate="index_surface",
                    path=f"{pillar}/index.html",
                    reason="pillar_stat_count_mismatch_library",
                    excerpt=f"strong={n} label={m.group(2)[:40]} kept={kept}",
                )
            )
    return findings


def gate_index_surface() -> GateReport:
    findings: list[Finding] = []
    # Walk sitemap-index members (not a hardcoded four-file list).
    from scripts.organic.sitemap_graph import load_graph_locs, load_index_members

    all_locs: list[str] = list(load_graph_locs(ROOT))
    for member in load_index_members(ROOT):
        sm = ROOT / member.filename
        if not sm.is_file():
            findings.append(
                Finding(
                    gate="index_surface",
                    path=member.filename,
                    reason="sitemap_member_inaccessible",
                    excerpt=member.loc,
                )
            )
            continue
        for loc in sitemap_locs(sm):
            path_part = urlparse(loc).path
            if not path_part or path_part == "/":
                local = ROOT / "index.html"
            else:
                local = ROOT / path_part.strip("/") / "index.html"
                if not local.exists():
                    local = ROOT / path_part.strip("/")
            if local.exists() and local.suffix == ".html":
                html = local.read_text(encoding="utf-8", errors="replace")
                if is_noindex(html):
                    findings.append(
                        Finding(
                            gate="index_surface",
                            path=str(sm.relative_to(ROOT)),
                            reason="noindex_in_sitemap",
                            excerpt=loc,
                        )
                    )
            elif local.exists() and (local / "index.html").exists():
                html = (local / "index.html").read_text(encoding="utf-8", errors="replace")
                if is_noindex(html):
                    findings.append(
                        Finding(
                            gate="index_surface",
                            path=str(sm.relative_to(ROOT)),
                            reason="noindex_in_sitemap",
                            excerpt=loc,
                        )
                    )

    # Hub must not promote noindex
    hub = ROOT / "conteudos" / "index.html"
    if hub.exists():
        ht = hub.read_text(encoding="utf-8", errors="replace")
        # guide count claims
        for m in re.finditer(r"\b(\d{2,3})\s+(guias|conteúdos|conteudos)\b", ht, re.I):
            n = int(m.group(1))
            # count indexable children
            idx_n = sum(
                1
                for p in (ROOT / "conteudos").glob("*/index.html")
                if is_indexable_html(p.read_text(encoding="utf-8", errors="replace"))
            )
            if n > idx_n:
                findings.append(
                    Finding(
                        gate="index_surface",
                        path="conteudos/index.html",
                        reason="guide_count_exceeds_indexable",
                        excerpt=f"{m.group(0)} (indexable={idx_n})",
                    )
                )
        # directory items
        for m in re.finditer(
            r'<article class="content-directory-item"[^>]*>.*?</article>',
            ht,
            re.S,
        ):
            block = m.group(0)
            hrefs = re.findall(r'href="(/conteudos/[^"]+/)"', block)
            for href in hrefs:
                local = ROOT / href.strip("/") / "index.html"
                if local.exists() and is_noindex(local.read_text(encoding="utf-8", errors="replace")):
                    findings.append(
                        Finding(
                            gate="index_surface",
                            path="conteudos/index.html",
                            reason="noindex_in_hub_directory",
                            excerpt=href,
                        )
                    )
        for href in re.findall(r'class="featured-content" href="(/conteudos/[^"]+)"', ht):
            local = ROOT / href.strip("/") / "index.html"
            if local.exists() and is_noindex(local.read_text(encoding="utf-8", errors="replace")):
                findings.append(
                    Finding(
                        gate="index_surface",
                        path="conteudos/index.html",
                        reason="noindex_in_hub_featured",
                        excerpt=href,
                    )
                )


    # Pillar hubs must not promote noindex library items
    for pillar in (
        "medicoes-glosas-obras-publicas",
        "aditivos-obras-publicas",
        "reequilibrio-obras-publicas",
        "atrasos-prorrogacao-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "acompanhamento-contratos-obras",
        "diagnostico-pre-licitacao",
        "auditoria-orcamento-licitacao",
    ):
        pp = ROOT / pillar / "index.html"
        if not pp.exists():
            continue
        ph = pp.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r'<article class="library-item"[^>]*>.*?</article>', ph, re.S
        ):
            hrefs = re.findall(r'href="(/conteudos/[^"]+/)"', m.group(0))
            for href in hrefs:
                local = ROOT / href.strip("/") / "index.html"
                if local.exists() and is_noindex(
                    local.read_text(encoding="utf-8", errors="replace")
                ):
                    findings.append(
                        Finding(
                            gate="index_surface",
                            path=f"{pillar}/index.html",
                            reason="noindex_in_pillar_library",
                            excerpt=href,
                        )
                    )
        for f in pillar_guide_count_findings(pillar, ph):
            findings.append(f)

    # Feed
    feed = ROOT / "feed.xml"
    if feed.exists():
        ft = feed.read_text(encoding="utf-8", errors="replace")
        for loc in re.findall(r"<link>([^<]+)</link>", ft):
            path = urlparse(loc).path if loc.startswith("http") else loc
            if not path.startswith("/conteudos/") or path.rstrip("/") == "/conteudos":
                continue
            local = ROOT / path.strip("/") / "index.html"
            if local.exists() and is_noindex(local.read_text(encoding="utf-8", errors="replace")):
                findings.append(
                    Finding(
                        gate="index_surface",
                        path="feed.xml",
                        reason="noindex_in_feed",
                        excerpt=loc,
                    )
                )

    # Overclaim / invalid schema withdraws INDEX: sitemap members must pass parity.
    from scripts.site.visible_parity import index_eligibility

    for loc in all_locs:
        path_part = urlparse(loc).path
        if not path_part or path_part == "/":
            local = ROOT / "index.html"
        else:
            local = ROOT / path_part.strip("/") / "index.html"
            if not local.exists():
                local = ROOT / path_part.strip("/")
        if not (local.exists() and local.suffix == ".html"):
            if local.exists() and (local / "index.html").exists():
                local = local / "index.html"
            else:
                continue
        html = local.read_text(encoding="utf-8", errors="replace")
        if is_noindex(html):
            continue
        elig = index_eligibility(html, url=loc)
        if not elig.get("sitemap_include"):
            codes = ",".join(d.get("code") or "" for d in (elig.get("defects") or []))
            findings.append(
                Finding(
                    gate="index_surface",
                    path=str(local.relative_to(ROOT)),
                    reason="visible_parity_overclaim",
                    excerpt=f"{loc} {codes}",
                )
            )

    # Indexable pages need self-canonical
    for p in indexable_public_pages():
        if "inteligencia/" in str(p) and p.name != "index.html":
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        can = re.search(
            r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)',
            html,
            re.I,
        ) or re.search(
            r'href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']',
            html,
            re.I,
        )
        if not can:
            findings.append(
                Finding(
                    gate="index_surface",
                    path=str(p.relative_to(ROOT)),
                    reason="missing_canonical",
                )
            )

    unique_locs = {urlparse(loc).path.rstrip("/") or "/" for loc in all_locs}
    return GateReport(
        ok=not any(f.severity == "error" for f in findings),
        findings=findings,
        stats={"sitemap_locs": len(unique_locs)},
    )


def gate_brand_shell() -> GateReport:
    """Public commercial + indexable content must use brand navigation and footer blurb."""
    from scripts.site.brand import footer_blurb, load_brand, org_description

    brand = load_brand()
    nav_labels = [n["label"] for n in (brand.get("navigation") or {}).get("desktop") or []]
    org = org_description(brand)
    foot = footer_blurb(brand)
    findings: list[Finding] = []

    # Pages that must use current shell
    must = [ROOT / "index.html"]
    for o in brand.get("offers") or []:
        url = (o.get("url") or "").strip("/")
        if url:
            must.append(ROOT / url / "index.html")
    # sample of indexable conteudos + all indexable
    for p in (ROOT / "conteudos").glob("*/index.html"):
        html = p.read_text(encoding="utf-8", errors="replace")
        if is_indexable_html(html):
            must.append(p)
    for base in ("guias-contratos-obras", "lei-14133-obras"):
        for p in (ROOT / base).glob("*/index.html"):
            html = p.read_text(encoding="utf-8", errors="replace")
            if is_indexable_html(html):
                must.append(p)

    legacy_nav_markers = ["/#atuacao", "/#diferenciais", "/#metodo"]
    old_footer_start = "Diretoria B2G fracionada para construtoras:"
    old_org = "Diretoria B2G fracionada para construtoras e empresas de engenharia"

    scanned = 0
    for p in must:
        if not p.exists():
            findings.append(
                Finding(gate="brand_shell", path=str(p.relative_to(ROOT)), reason="missing_page")
            )
            continue
        scanned += 1
        html = p.read_text(encoding="utf-8", errors="replace")
        for marker in legacy_nav_markers:
            if marker in html and 'class="desktop-nav"' in html:
                # only fail if desktop nav still has old anchors as primary
                nav_block = re.search(r'class="desktop-nav"[^>]*>(.*?)</nav>', html, re.S)
                if nav_block and marker in nav_block.group(1):
                    findings.append(
                        Finding(
                            gate="brand_shell",
                            path=str(p.relative_to(ROOT)),
                            reason="legacy_nav",
                            excerpt=marker,
                        )
                    )
                    break
        if old_footer_start in html:
            findings.append(
                Finding(
                    gate="brand_shell",
                    path=str(p.relative_to(ROOT)),
                    reason="legacy_footer_blurb",
                    excerpt=old_footer_start,
                )
            )
        # Footer / whole chrome must not use pre-rebrand anchors
        for bad in ("/#atuacao", "/#diferenciais", "/#metodo"):
            if bad in html:
                findings.append(
                    Finding(
                        gate="brand_shell",
                        path=str(p.relative_to(ROOT)),
                        reason="legacy_footer_or_nav_anchor",
                        excerpt=bad,
                    )
                )
                break
        if old_org in html and org and org not in html:
            findings.append(
                Finding(
                    gate="brand_shell",
                    path=str(p.relative_to(ROOT)),
                    reason="legacy_org_description",
                    excerpt=old_org[:80],
                )
            )
        # Require at least one brand nav label present
        if nav_labels and not any(lab in html for lab in nav_labels[:3]):
            findings.append(
                Finding(
                    gate="brand_shell",
                    path=str(p.relative_to(ROOT)),
                    reason="missing_brand_nav_labels",
                    excerpt=",".join(nav_labels[:3]),
                )
            )

    return GateReport(
        ok=not findings,
        findings=findings,
        stats={"scanned": scanned, "org_description": org[:80], "footer": foot[:80]},
    )


def _onpage_capture_findings(root: Path, pii_re: re.Pattern[str]) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    scanned = 0
    for slug in ONPAGE_CAPTURE_ROUTES:
        page = root / slug / "index.html"
        scanned += 1
        if not page.is_file():
            findings.append(Finding(gate="conversion", path=str(page), reason="capture_page_missing"))
            continue
        html = page.read_text(encoding="utf-8", errors="replace")
        form_match = re.search(
            r'<form\b(?=[^>]*\bmethod=["\']post["\'])(?=[^>]*\baction=["\']/'
            r'\.netlify/functions/lead["\'])[^>]*>(.*?)</form>',
            html,
            re.I | re.S,
        )
        if not form_match:
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="pillar_missing_onpage_capture",
                )
            )
            continue
        form = form_match.group(0)
        if html.find('href="#captura-pilar"') < 0 or html.find('href="#captura-pilar"') > form_match.start():
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="pillar_primary_cta_bypasses_capture",
                )
            )
        for attr in ("data-offer-id", "data-cta-id", "data-asset-id", "data-route-family", "data-cta-position"):
            if not re.search(rf'\b{attr}=["\'][^"\']*["\']', form_match.group(0).split(">", 1)[0], re.I):
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(page.relative_to(root)),
                        reason="capture_data_contract_missing",
                        excerpt=attr,
                    )
                )
        for name in CAPTURE_HIDDEN_FIELDS:
            field = re.search(
                rf'<input\b(?=[^>]*\btype=["\']hidden["\'])(?=[^>]*\bname=["\']{name}["\'])[^>]*>',
                form,
                re.I,
            )
            if not field:
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(page.relative_to(root)),
                        reason="capture_attribution_missing",
                        excerpt=name,
                    )
                )
        expected_values = {
            "origem": slug,
            "asset_id": slug,
            "route_family": slug,
            "landing_page": f"{SITE}/{slug}/",
        }
        for name, expected in expected_values.items():
            field = re.search(
                rf'<input\b(?=[^>]*\bname=["\']{name}["\'])[^>]*\bvalue=["\']([^"\']*)["\'][^>]*>',
                form,
                re.I,
            )
            if not field or field.group(1) != expected:
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(page.relative_to(root)),
                        reason="capture_attribution_mismatch",
                        excerpt=f"{name}={field.group(1) if field else 'MISSING'} expected={expected}",
                    )
                )
        for empty_name in ("offer_id", "terms_id"):
            field = re.search(
                rf'<input\b(?=[^>]*\bname=["\']{empty_name}["\'])[^>]*\bvalue=["\']([^"\']*)["\'][^>]*>',
                form,
                re.I,
            )
            if field and field.group(1).strip():
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(page.relative_to(root)),
                        reason="unpriced_pillar_offer_invented",
                        excerpt=f"{empty_name}={field.group(1)[:80]}",
                    )
                )
        consent = re.search(
            r'<input\b(?=[^>]*\btype=["\']checkbox["\'])(?=[^>]*\bname=["\']consentimento["\'])'
            r'(?=[^>]*\brequired\b)[^>]*>',
            form,
            re.I,
        )
        if not consent:
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="capture_consent_not_required",
                )
            )
        if "priceValidUntil" in html or re.search(r'"price"\s*:', html):
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="unpriced_pillar_price_invented",
                )
            )
        for match in re.finditer(r'data-[a-z-]+="([^"]{1,200})"', form, re.I):
            if pii_re.search(match.group(1)):
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(page.relative_to(root)),
                        reason="possible_pii_in_data_attr",
                        excerpt=match.group(1)[:80],
                    )
                )
    return findings, scanned


def _main_html(html: str) -> str:
    match = re.search(r"(?is)<main\b[^>]*>(.*?)</main>", html)
    return match.group(1) if match else ""


def _as_date(value: date | datetime | str | None) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return date.today()


def _conversion_files(base: Path) -> list[Path]:
    if base.resolve() == ROOT.resolve():
        return public_html_files()
    skip = {"docs", "scripts", "data", "seo", "tests", "node_modules", ".git", "_site"}
    return [
        page
        for page in base.rglob("*.html")
        if not any(part in skip for part in page.relative_to(base).parts)
    ]


def gate_conversion(
    root: Path | None = None,
    *,
    now: date | datetime | str | None = None,
) -> GateReport:
    """Audit public surfaces with family-specific, in-``main`` BOFU actions."""
    from scripts.bofu_dominance.frozen_specs.constants import (
        EARLIEST_SAFE_ACTION_AT,
        PILLARS as FROZEN_PILLARS,
    )
    from scripts.site.brand import load_brand

    base = root or ROOT
    brand = load_brand()
    journeys = {j["id"]: j for j in brand.get("journeys") or []}
    matrix = json.loads((ROOT / "data/organic/bofu-intent-matrix.json").read_text(encoding="utf-8"))
    service_routes = {
        str(row["canonical_service_route"]): str(row["destination_service_id"])
        for row in matrix.get("rows") or []
    }
    frozen_routes = {str(row["path"]) for row in FROZEN_PILLARS}
    today = _as_date(now)
    findings: list[Finding] = []
    scanned = 0
    main_cta_count = 0
    service_scanned = 0
    service_capture_count = 0
    pii_re = re.compile(
        r"\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b",
        re.I,
    )
    for p in _conversion_files(base):
        html = p.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        scanned += 1
        rel = p.relative_to(base)
        route = "/" if rel.as_posix() == "index.html" else "/" + rel.as_posix().removesuffix("index.html")
        main = _main_html(html)
        conversion_exempt = route in {"/privacidade/", "/termos-de-uso/"}
        has_main_wa = bool(re.search(r'(?is)<a\b[^>]+href=["\'][^"\']*(?:wa\.me|whatsapp\.com)', main))
        has_main_form = bool(
            re.search(r'(?is)<form\b[^>]+action=["\']/.netlify/functions/lead["\']', main)
        )
        has_main_service_link = any(
            f'href="{destination}"' in main or f"href='{destination}'" in main
            for destination in service_routes
            if destination != route
        )
        has_main_contact = bool(
            re.search(
                r'(?is)<a\b[^>]+href=["\'](?:/#(?:contato|formulario-contato)|#(?:contato|pedido|formulario))',
                main,
            )
        )
        has_attributed_cta = bool(
            re.search(
                r'(?is)<a\b(?=[^>]*\bdata-cta-id=["\'][^"\']+)(?=[^>]*\bhref=["\'][^"\']+)[^>]*>',
                main,
            )
        )
        has_tool_result_cta = (
            route.startswith("/ferramentas/")
            and route != "/ferramentas/"
            and len(
                re.findall(
                    r'(?is)data-cta-id=["\'][^"\']+["\'][^>]+href=["\']/[^"\']+',
                    html,
                )
            )
            >= 2
        )
        has_main_cta = (
            conversion_exempt
            or has_main_wa
            or has_main_form
            or has_main_service_link
            or has_main_contact
            or has_attributed_cta
            or has_tool_result_cta
        )
        if has_main_cta:
            main_cta_count += 1
        else:
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(p.relative_to(base)),
                    reason="missing_main_cta",
                )
            )
        if route in service_routes:
            service_scanned += 1
            if has_main_form:
                service_capture_count += 1
            else:
                severity = "warn" if route in frozen_routes and today < EARLIEST_SAFE_ACTION_AT else "error"
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(p.relative_to(base)),
                        reason="missing_on_page_form",
                        excerpt=f"profile=service_pillar route={route}",
                        severity=severity,
                    )
                )
        # dataLayer / analytics events should not embed emails/CPF in attributes
        for m in re.finditer(r'data-[a-z-]+=\"([^\"]{10,200})\"', html, re.I):
            if pii_re.search(m.group(1)) and "@confenge" not in m.group(1).lower():
                findings.append(
                    Finding(
                        gate="conversion",
                        path=str(p.relative_to(base)),
                        reason="possible_pii_in_data_attr",
                        excerpt=m.group(1)[:80],
                    )
                )
        # Journey hint: data-journey or known CTA phrases
        journey_signals = (
            "Enviar documentos para análise",
            "Enviar edital para triagem",
            "Diagnosticar",
            "jornada=contrato",
            "jornada=edital",
            "jornada=operacao",
            "data-journey",
            "problema urgente",
            "Falar no WhatsApp",
            "Conversar pelo WhatsApp",
            "Analisar este cenário",
            "Analisar meu cenário",
        )
        if not any(s.lower() in html.lower() for s in journey_signals):
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(p.relative_to(base)),
                    reason="missing_journey_signal",
                    severity="warn",
                )
            )

    capture_findings, capture_scanned = _onpage_capture_findings(base, pii_re)
    findings.extend(capture_findings)
    errors = [f for f in findings if f.severity == "error"]
    return GateReport(
        ok=len(errors) == 0,
        findings=findings,
        stats={
            "scanned": scanned,
            "onpage_capture_scanned": capture_scanned,
            "journeys": list(journeys.keys()),
            "profiles": {
                "service_pillar": service_scanned,
                "editorial_or_other": scanned - service_scanned,
            },
            "main_cta": {
                "covered": main_cta_count,
                "total": scanned,
                "coverage": round(main_cta_count / scanned, 4) if scanned else 0.0,
            },
            "on_page_capture": {
                "covered": service_capture_count,
                "total": service_scanned,
                "coverage": round(service_capture_count / service_scanned, 4)
                if service_scanned
                else 0.0,
            },
            "freeze": {
                "earliest_safe_action_at": EARLIEST_SAFE_ACTION_AT.isoformat(),
                "warn_before_date": today < EARLIEST_SAFE_ACTION_AT,
            },
            "errors": len(errors),
            "warnings": sum(1 for finding in findings if finding.severity == "warn"),
        },
    )


def gate_legacy_entity_matrix() -> GateReport:
    """Check _redirects rules exist for priority legacy paths; optional live probe is separate."""
    findings: list[Finding] = []
    redirects = (ROOT / "_redirects").read_text(encoding="utf-8", errors="replace")
    expected = {
        "/vision": "410",
        "/nexgen": "410",
        "/avcbclcb": "410",
        "/avaliacoes": "410",
        "/ia": "410",
        "/automacao": "410",
        "/blog": "301",
        "/servicos": "301",
    }
    for path, code in expected.items():
        # line like `/vision     /404.html  410`
        if not re.search(rf"^{re.escape(path)}\s+\S+\s+{code}", redirects, re.M):
            findings.append(
                Finding(
                    gate="legacy_entity",
                    path="_redirects",
                    reason="missing_rule",
                    excerpt=f"{path} -> {code}",
                )
            )

    # Public pages should not promote abandoned products
    for p in [ROOT / "index.html", ROOT / "diretoria-b2g" / "index.html"]:
        if not p.exists():
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        for m in LEGACY_ENTITY_RE.finditer(html):
            findings.append(
                Finding(
                    gate="legacy_entity",
                    path=str(p.relative_to(ROOT)),
                    reason="legacy_string_in_public",
                    excerpt=m.group(0),
                )
            )

    return GateReport(ok=not findings, findings=findings, stats={"rules_checked": len(expected)})


def gate_similarity_indexable(threshold: float = 0.55) -> GateReport:
    """Flag highly similar indexable article bodies (boilerplate clones)."""
    from scripts.editorial.naturalness import jaccard_similarity

    findings: list[Finding] = []
    bodies: list[tuple[str, str]] = []
    for p in (ROOT / "conteudos").glob("*/index.html"):
        html = p.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        # article main only
        art = re.search(r"<article[^>]*>(.*?)</article>", html, re.S | re.I)
        body = strip_html(art.group(1) if art else html)
        # drop shared CTA boilerplate noise
        for drop in (
            "Quer validar este cenário com a CONFENGE",
            "Envie o edital, a planilha ou a notificação",
            "Conteúdo educacional. Não substitui",
            "Engenheiro Civil formado pela EESC-USP",
        ):
            body = body.replace(drop, " ")
        bodies.append((str(p.relative_to(ROOT)), body))

    pairs = 0
    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            pairs += 1
            sim = jaccard_similarity(bodies[i][1], bodies[j][1], n=6)
            if sim >= threshold:
                findings.append(
                    Finding(
                        gate="similarity",
                        path=bodies[i][0],
                        reason=f"similar_to:{bodies[j][0]}",
                        excerpt=f"jaccard6={sim:.3f}",
                        severity="warn" if sim < 0.7 else "error",
                    )
                )
    errors = [f for f in findings if f.severity == "error"]
    return GateReport(
        ok=len(errors) == 0,
        findings=findings,
        stats={"pages": len(bodies), "pairs": pairs, "threshold": threshold},
    )


def run_all_gates() -> dict[str, Any]:
    reports = {
        "naturalness": gate_naturalness(only_indexable=True),
        "index_surface": gate_index_surface(),
        "brand_shell": gate_brand_shell(),
        "conversion": gate_conversion(),
        "legacy_entity": gate_legacy_entity_matrix(),
        "similarity": gate_similarity_indexable(),
    }
    ok = all(r.ok for r in reports.values())
    return {
        "ok": ok,
        "gates": {k: v.to_dict() for k, v in reports.items()},
    }


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    out_path = None
    if "--out" in argv:
        i = argv.index("--out")
        out_path = Path(argv[i + 1])
    report = run_all_gates()
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
