"""Inbound-first gates: naturalness, index surface, brand shell, conversion, legacy.

These operate on the shipped public HTML (repo root), not re-implementations.
Allowlists are explicit and justified in ALLOWLIST notes below.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
# Fail closed when the walk collapses: a real checkout ships far more than this.
MIN_PUBLIC_HTML_FILES = 100
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


def _relative_parts(path: Path) -> tuple[str, ...]:
    """Path parts relative to the checkout root.

    Skip rules describe directories inside the repository, not ancestors of it.
    A checkout at `.claude/worktrees/<agent>` or `repo/.worktrees/<name>` must
    still see every public HTML file, otherwise the gate silently scans nothing.
    """
    try:
        return path.resolve().relative_to(ROOT.resolve()).parts
    except ValueError:
        return path.parts


def _public_scan_files() -> list[Path]:
    """The raw walk, without the volume floor, so scope can be unit-tested.

    Scope is the published visitor census. Skip names apply to directories
    inside the checkout, never to ancestor path parts — a worktree living
    under `.worktrees/` still sees every public HTML file.
    """
    from scripts.site.public_copy_scope import visitor_facing_html_files

    return list(visitor_facing_html_files(ROOT))


def public_html_files() -> list[Path]:
    """HTML under publish roots, excluding tooling and intelligence bulk if huge.

    Fails closed: a walk that collapses to a handful of files means the scan root
    was misread, and every downstream gate would report ok on an empty census.
    """
    out = _public_scan_files()
    if len(out) < MIN_PUBLIC_HTML_FILES:
        raise SystemExit(
            f"INBOUND_GATE_SCOPE_COLLAPSED scanned={len(out)} "
            f"expected_at_least={MIN_PUBLIC_HTML_FILES} root={ROOT}"
        )
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


_FEATURED_BLOCK = re.compile(
    r'<(?:article|section|div|p|a)[^>]*(?:class="[^"]*(?:featured|library-item)[^"]*")[^>]*>[\s\S]*?</(?:article|section|div|p|a)>',
    re.I,
)
_HREF = re.compile(r"""href=["']([^"']+)["']""", re.I)
_FUNCTIONAL_NOINDEX_HREFS = frozenset(
    {
        "/nurture/sair/",
        "/nurture/sair",
    }
)


def _pseo_reject_pages_not_public() -> list[Finding]:
    """A pSEO page rejected by the editorial gate must not be publicly served.

    `reject` is fail-closed: the route is withdrawn, not merely de-indexed.
    This gate proves the withdrawal actually happened, by checking that no
    rejected route survives on disk, in a sitemap, or as a link from an
    indexable page.

    A dead link is an error on every route, frozen BOFU pillar HTML (#291)
    included. An earlier revision of this gate downgraded the frozen six to a
    warning, on the reading that the measurement freeze made the link
    unfixable. It does not: `html_mutation_authorized: false` gates the
    campaign's own patch application, and a reviewed edit carrying a
    same-commit baseline recapture is merged practice (cf33385d4, 2f26ac0ba).
    `internal-link-reachability` in site_excellence.py has no exception path
    either, so a warning here would only hide a failure that lands anyway.
    """
    findings: list[Finding] = []
    reg_path = ROOT / "data" / "pseo" / "registry.json"
    if not reg_path.exists():
        return findings
    try:
        registry = json.loads(reg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return findings
    rejected = {
        (p.get("url") or "").strip()
        for p in registry.get("pages") or []
        if p.get("status") == "reject" and p.get("url")
    }
    if not rejected:
        return findings

    # 1) Never present in the public HTML tree.
    for url in sorted(rejected):
        page = ROOT / url.strip("/") / "index.html"
        if page.exists():
            findings.append(
                Finding(
                    gate="pseo_reject_withdrawn",
                    path=page.relative_to(ROOT).as_posix(),
                    reason="rejected_pseo_page_is_publicly_served",
                    excerpt=url,
                )
            )

    # 2) Never listed in any sitemap.
    for sm in sorted(ROOT.glob("**/sitemap*.xml")):
        if any(part in {"node_modules", "_site", ".git"} for part in sm.parts):
            continue
        text = sm.read_text(encoding="utf-8", errors="replace")
        for url in sorted(rejected):
            if url in text:
                findings.append(
                    Finding(
                        gate="pseo_reject_withdrawn",
                        path=sm.relative_to(ROOT).as_posix(),
                        reason="rejected_pseo_page_in_sitemap",
                        excerpt=url,
                    )
                )

    # 3) Never linked from an indexable page.
    for path in _public_scan_files():
        if path.suffix != ".html":
            continue
        rel = path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8", errors="replace")
        if is_noindex(html):
            continue
        for url in sorted(rejected):
            if f'href="{url}"' not in html:
                continue
            findings.append(
                Finding(
                    gate="pseo_reject_withdrawn",
                    path=rel,
                    reason="indexable_page_links_rejected_pseo_page",
                    excerpt=url,
                )
            )
    return findings


def _featured_noindex_from_indexable() -> list[Finding]:
    """Indexable pages must not featured-link noindex hubs/articles.

    Frozen BOFU pillar HTML (#291) is skipped. That skip is a scope decision,
    not an impossibility: #566 showed a reviewed edit with a same-commit
    baseline recapture is merged practice (cf33385d4, 2f26ac0ba), so the freeze
    does not make these six unfixable. It stays because rewriting a featured
    link is an editorial change with its own remedy and its own review, unlike
    a link that resolves to 404 — which `_pseo_reject_pages_not_public` reports
    as an error on every route, frozen included. Lifting this skip belongs to
    the six routes' copy pass, tracked in
    docs/decisions/DEFERRED-BY-MEASUREMENT-FREEZE-2026-08-30.md item 3.
    """
    from scripts.organic.canonical_hrefs import FROZEN_HTML_REL

    findings: list[Finding] = []
    public = [
        p
        for p in _public_scan_files()
        if p.suffix == ".html"
    ]
    noindex_paths: set[str] = set()
    indexable_files: list[tuple[Path, str]] = []
    for path in public:
        html = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        route = path_to_url(path)
        if is_noindex(html):
            noindex_paths.add(route)
            noindex_paths.add(route.rstrip("/") or "/")
            continue
        if rel in FROZEN_HTML_REL:
            continue
        indexable_files.append((path, html))
    for path, html in indexable_files:
        rel = path.relative_to(ROOT).as_posix()
        for block in _FEATURED_BLOCK.findall(html):
            for href in _HREF.findall(block):
                if href.startswith(("http", "mailto:", "tel:", "#", "//")):
                    if href.startswith(SITE):
                        href = urlparse(href).path or "/"
                    else:
                        continue
                target = href.split("?")[0].split("#")[0]
                if not target.startswith("/"):
                    continue
                if target in _FUNCTIONAL_NOINDEX_HREFS:
                    continue
                normalized = target if target.endswith("/") or target.endswith(".html") else target + "/"
                if normalized in noindex_paths or target in noindex_paths:
                    findings.append(
                        Finding(
                            gate="index_surface",
                            path=rel,
                            reason="featured_link_to_noindex",
                            excerpt=href,
                        )
                    )
    return findings


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
    # No pillar page renders the .pillar-stat tile today and its CSS is gone,
    # but this is a content guard, not a CSS reference: it fails closed if the
    # markup ever comes back with a count the library cannot back.
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
        # The hub ships a lead article plus a support list, not .featured-content cards.
        for block in re.finditer(
            r'<(?P<tag>article|ul) class="featured-(?:lead|support)"[\s\S]*?</(?P=tag)>', ht
        ):
            for href in re.findall(r'href="(/conteudos/[^"]+)"', block.group(0)):
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

    findings.extend(_featured_noindex_from_indexable())
    findings.extend(_pseo_reject_pages_not_public())

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
        if not canonical_hrefs(html):
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
        form_open = form.split(">", 1)[0]
        if not re.search(r'\bdata-receipt-required=["\']true["\']', form_open, re.I):
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="capture_confirmation_not_fail_closed",
                )
            )
        if html.find('href="#captura-pilar"') < 0 or html.find('href="#captura-pilar"') > form_match.start():
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(page.relative_to(root)),
                    reason="pillar_primary_cta_bypasses_capture",
                )
            )
        for attr in ("data-offer-id", "data-cta-id", "data-asset-id", "data-route-family", "data-cta-position"):
            if not re.search(rf'\b{attr}=["\'][^"\']*["\']', form_open, re.I):
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


# --- Public family registry: fail-closed conversion contract (issue #300) ---
#
# The default conversion profile used to be ``commercial_content``, the most
# permissive one, satisfied by any ``<a data-cta-id href>``. Every newly
# published family landed there and passed. The default is now "declare
# yourself": an indexable route with no family declaration in
# ``data/organic/public-family-registry.json`` fails the gate. The declaration
# is versioned data, not a Python constant, and every claim it makes is checked
# against the rendered HTML.
FAMILY_REGISTRY_REL = "data/organic/public-family-registry.json"
FAMILY_REGISTRY_SCHEMA = "public-family-registry-v1"
BOFU_SERVICE_ROUTE_SOURCE = (
    "data/organic/bofu-intent-matrix.json#rows[].canonical_service_route"
)
CONVERSION_PROFILES = {"service_pillar", "priced_offer", "commercial_content", "trust_or_legal"}
TERMINAL_ACTIONS = {
    "capture_form",
    "whatsapp",
    "capture_form_or_whatsapp",
    "service_transition",
    "none",
}
GATE_COVERAGE_LEVELS = {"full", "partial", "none"}
GATE_COVERAGE_KEYS = ("conversion", "copy", "accessibility")
MIN_WRITTEN_REASON = 24
MAX_DEBT_DURATION_DAYS = 90

# NOINDEX governance
NOINDEX_GOVERNANCE_REL = "data/organic/noindex-governance-registry.json"

# Internal jargon tokens that must not appear in visible editorial text
# (but may legitimately appear in <script>, <meta>, data-* attributes, JSON-LD)
EDITORIAL_JARGON_TOKENS = (
    "UNKNOWN",
    "as_of",
    "generated_at",
    "epistemic",
    "classe epistêmica",
    "reason_code",
    "content_hash",
)
EDITORIAL_JARGON_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in EDITORIAL_JARGON_TOKENS) + r")\b",
    re.I | re.U,
)

# A price is "displayed" when structured offer markup is present, or when a
# BRL amount sits next to a commitment word. Bare BRL amounts are data (contract
# values, reference costs), not offers, so they must not escalate the profile.
PRICE_MARKUP_RE = re.compile(r'"price"\s*:|"priceCurrency"\s*:|itemprop=["\']price["\']', re.I)
_PRICE_AMOUNT = r"R\$\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?(?![\d.,])"
_PRICE_COMMITMENT = (
    r"investimento|pre[çc]o|a partir de|por unidade|pagamento [úu]nico|"
    r"mensal|assinatura|por relat[óo]rio|entrega por|sob demanda|avulso|por entrega|plano"
)
PRICE_NEAR_RE = re.compile(
    rf"(?is)(?:{_PRICE_COMMITMENT})[^.]{{0,80}}?{_PRICE_AMOUNT}"
    rf"|{_PRICE_AMOUNT}[^.]{{0,60}}?(?:{_PRICE_COMMITMENT})"
)
PRICED_CAPTURE_DATA_ATTRS = (
    "data-offer-id",
    "data-cta-id",
    "data-asset-id",
    "data-route-family",
    "data-cta-position",
)


def _is_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _is_owner_issue(value: Any) -> bool:
    """A bool is an int in Python, but it is not an issue identifier."""
    return type(value) is int and value > 0


def _is_safe_public_path(value: Any) -> bool:
    if not isinstance(value, str) or not value.startswith("/"):
        return False
    if any(char.isspace() for char in value):
        return False
    if any(token in value for token in ("?", "#", "\\", "//", "/./", "/../")):
        return False
    return not value.endswith("index.html")


def _is_canonical_route(value: Any) -> bool:
    return _is_safe_public_path(value) and (value == "/" or value.endswith("/"))


def _is_safe_family_prefix(value: Any) -> bool:
    # A root prefix would silently absorb every future family and recreate the
    # permissive default this registry exists to remove.
    return _is_safe_public_path(value) and value != "/"


def _displays_price(main: str) -> bool:
    """True when ``<main>`` shows a price for something CONFENGE sells."""
    if PRICE_MARKUP_RE.search(main):
        return True
    return bool(PRICE_NEAR_RE.search(strip_html(main)))


def priced_action_registry() -> tuple[set[str], set[str]]:
    """Return the action and handraise ids with an owner-authorized amount."""
    matrix = json.loads(
        (ROOT / "docs/contracts/intent-action/intent-action-matrix.v1.json").read_text(
            encoding="utf-8"
        )
    )
    actions: set[str] = set()
    offers: set[str] = set()
    for row in matrix.get("routes") or []:
        cents = row.get("authorized_amount_cents")
        if not isinstance(cents, int) or isinstance(cents, bool) or cents <= 0:
            continue
        if row.get("id"):
            actions.add(str(row["id"]))
        if row.get("offer_id"):
            offers.add(str(row["offer_id"]))
    return actions, offers


def priced_offer_routes(base: Path | None = None) -> dict[str, str]:
    """Discover routes whose effective profile is a non-reference priced offer."""
    root = base or ROOT
    routes: dict[str, str] = {}
    registry = load_family_registry()
    families = registry.get("families") or []
    service_routes = _bofu_service_routes()
    for page in _conversion_files(root):
        html = page.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        main = _main_html(html)
        if not _displays_price(main):
            continue
        rel = page.relative_to(root).as_posix()
        route = "/" if rel == "index.html" else "/" + rel.removesuffix("index.html")
        family = _match_family(route, families, service_routes)
        priced_refs = {
            str(entry.get("route"))
            for entry in (family or {}).get("priced_reference_routes") or []
        }
        if route in service_routes or route in priced_refs:
            continue
        routes[route] = "displayed_price"
    return routes


def _priced_offer_findings(
    page: Path,
    base: Path,
    route: str,
    main: str,
    priced_offers: set[str],
    family_id: str,
) -> list[Finding]:
    """A priced surface must persist a fully attributed, non-checkout handraise."""
    rel = str(page.relative_to(base))
    findings: list[Finding] = []

    def fail(reason: str, excerpt: str = "") -> None:
        findings.append(
            Finding(
                gate="conversion",
                path=rel,
                reason=reason,
                excerpt=excerpt or f"route={route}",
            )
        )

    form_match = re.search(
        r'<form\b(?=[^>]*\bmethod=["\']post["\'])'
        r'(?=[^>]*\baction=["\']/.netlify/functions/lead["\'])[^>]*>.*?</form>',
        main,
        re.I | re.S,
    )
    if not form_match:
        fail("priced_offer_missing_persisted_capture")
        return findings
    form = form_match.group(0)
    open_tag = form.split(">", 1)[0]

    declared: dict[str, str] = {}
    for attr in PRICED_CAPTURE_DATA_ATTRS:
        match = re.search(rf'\b{re.escape(attr)}=["\']([^"\']*)["\']', open_tag, re.I)
        if not match:
            fail("priced_offer_capture_data_contract_missing", attr)
        else:
            declared[attr] = match.group(1)

    offer_id = declared.get("data-offer-id", "")
    if offer_id and offer_id not in priced_offers:
        fail("priced_offer_capture_offer_unregistered", offer_id[:80])
    direct_model = family_id == "casos-modelos-precificados"
    if direct_model and not offer_id:
        fail("priced_offer_capture_offer_missing")
    if direct_model and offer_id and main.count(f'data-offer-id="{offer_id}"') < 2:
        fail("priced_offer_capture_offer_mismatch", offer_id[:80])

    form_id = re.search(r'\bid=["\']([^"\']+)["\']', open_tag, re.I)
    if direct_model:
        if not form_id:
            fail("priced_offer_capture_anchor_missing", "form has no id")
        else:
            anchor = main.find(f'href="#{form_id.group(1)}"')
            if anchor < 0 or anchor > form_match.start():
                fail("priced_offer_capture_not_linked", f"#{form_id.group(1)}")

    hidden: dict[str, str] = {}
    for name in CAPTURE_HIDDEN_FIELDS:
        field = re.search(
            rf'<input\b(?=[^>]*\btype=["\']hidden["\'])'
            rf'(?=[^>]*\bname=["\']{re.escape(name)}["\'])'
            r'[^>]*\bvalue=["\']([^"\']*)["\'][^>]*>',
            form,
            re.I,
        )
        if not field:
            fail("priced_offer_capture_attribution_missing", name)
        else:
            hidden[name] = field.group(1)

    expected = {
        "asset_id": declared.get("data-asset-id", ""),
        "cta_id": declared.get("data-cta-id", ""),
        "route_family": declared.get("data-route-family", ""),
        "landing_page": f"{SITE}{route}",
    }
    if direct_model:
        expected["origem"] = route
    for name, want in expected.items():
        got = hidden.get(name, "MISSING")
        if got != want:
            fail("priced_offer_capture_attribution_mismatch", f"{name}={got} expected={want}")
    for name in ("origem", "jornada", "estagio"):
        if not hidden.get(name, "").strip():
            fail("priced_offer_capture_attribution_empty", name)

    for empty_name in ("offer_id", "terms_id", "amount_cents"):
        field = re.search(
            rf'<input\b(?=[^>]*\bname=["\']{empty_name}["\'])'
            r'[^>]*\bvalue=["\']([^"\']*)["\'][^>]*>',
            form,
            re.I,
        )
        if field and field.group(1).strip():
            fail("priced_offer_checkout_invented", f"{empty_name}={field.group(1)[:80]}")

    if not re.search(
        r'<input\b(?=[^>]*\btype=["\']checkbox["\'])'
        r'(?=[^>]*\bname=["\']consentimento["\'])(?=[^>]*\brequired\b)[^>]*>',
        form,
        re.I,
    ):
        fail("priced_offer_capture_consent_not_required")
    return findings


def _has_linked_capture_route(root: Path, main: str) -> bool:
    """Prove that an explicit terminal link lands on a real persisted capture.

    A generic internal link is never terminal. This narrow contract exists for
    dedicated noindex transaction steps: the source opts in on the anchor and
    the gate follows only canonical ``/comercial/`` routes whose ``<main>``
    contains the complete lead-function attribution/consent contract.
    """
    for tag in re.findall(r"(?is)<a\b[^>]*>", main):
        marker = re.search(
            r'\bdata-terminal-action=["\']capture-route["\']', tag, re.I
        )
        href_match = re.search(r'\bhref=["\']([^"\']+)["\']', tag, re.I)
        if not marker or not href_match:
            continue
        route = href_match.group(1)
        if not _is_canonical_route(route) or not route.startswith("/comercial/"):
            continue
        page = root / route.strip("/") / "index.html"
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8", errors="replace")
        if not is_noindex(html):
            continue
        destination_main = _main_html(html)
        form_match = re.search(
            r'<form\b(?=[^>]*\bmethod=["\']post["\'])'
            r'(?=[^>]*\baction=["\']/.netlify/functions/lead["\'])[^>]*>.*?</form>',
            destination_main,
            re.I | re.S,
        )
        if not form_match:
            continue
        form = form_match.group(0)
        form_open = form.split(">", 1)[0]
        if any(
            not re.search(rf'\b{attr}=["\'][^"\']+["\']', form_open, re.I)
            for attr in (
                "data-cta-id",
                "data-asset-id",
                "data-route-family",
                "data-cta-position",
            )
        ):
            continue
        if any(
            not re.search(rf'\bname=["\']{name}["\']', form, re.I)
            for name in (
                "nome",
                "estagio",
                "jornada",
                "origem",
                "asset_id",
                "cta_id",
                "route_family",
            )
        ):
            continue
        if not re.search(
            r'<input\b(?=[^>]*\btype=["\']checkbox["\'])'
            r'(?=[^>]*\bname=["\']consentimento["\'])(?=[^>]*\brequired\b)[^>]*>',
            form,
            re.I,
        ):
            continue
        return True
    return False


SERVICE_TRANSITION_ATTRS = (
    "data-cta-id",
    "data-cta-position",
    "data-asset-id",
    "data-asset-family",
    "data-route-family",
    "data-journey",
)


def _service_transition_destinations(main: str, service_routes: set[str]) -> list[str]:
    """Return fully attributed, canonical service CTAs in ``<main>``.

    This is intentionally narrower than ``has_main_service_link``. A navigation
    link does not pay terminal-action debt. The owning family must declare a
    service transition and expose exactly one dominant CTA whose destination is
    in the versioned BOFU service contract and whose analytics context is
    complete enough to emit ``content_to_service`` without guessing.
    """
    destinations: list[str] = []
    for tag in re.findall(r"(?is)<a\b[^>]*>", main):
        href_match = re.search(r'\bhref=["\']([^"\']+)["\']', tag, re.I)
        if not href_match or href_match.group(1) not in service_routes:
            continue
        if any(
            not re.search(rf'\b{re.escape(attr)}=["\'][^"\']+["\']', tag, re.I)
            for attr in SERVICE_TRANSITION_ATTRS
        ):
            continue
        destinations.append(href_match.group(1))
    return destinations


def load_family_registry(root: Path | None = None) -> dict[str, Any]:
    path = (root or ROOT) / FAMILY_REGISTRY_REL
    return json.loads(path.read_text(encoding="utf-8"))


def _bofu_service_routes(root: Path | None = None) -> set[str]:
    matrix = json.loads(
        ((root or ROOT) / "data/organic/bofu-intent-matrix.json").read_text(encoding="utf-8")
    )
    return {str(row["canonical_service_route"]) for row in matrix.get("rows") or []}


def _family_routes(family: dict[str, Any], service_routes: set[str]) -> tuple[set[str], str | None]:
    """Return (explicit routes, prefix) declared by a family."""
    match = family.get("match") or {}
    if match.get("source") == BOFU_SERVICE_ROUTE_SOURCE:
        return set(service_routes), None
    if isinstance(match.get("routes"), list):
        return {r for r in match["routes"] if _is_canonical_route(r)}, None
    if _is_safe_family_prefix(match.get("prefix")):
        return set(), str(match["prefix"])
    return set(), None


def _match_family(
    route: str, families: list[dict[str, Any]], service_routes: set[str]
) -> dict[str, Any] | None:
    """Most specific declaration wins: exact route, then longest prefix."""
    best: dict[str, Any] | None = None
    best_len = -1
    for family in families:
        routes, prefix = _family_routes(family, service_routes)
        if route in routes:
            return family
        if prefix and route.startswith(prefix) and len(prefix) > best_len:
            best, best_len = family, len(prefix)
    return best


def _a11y_census(root: Path | None = None) -> set[str]:
    """Routes actually audited by scripts/site/audit_accessibility.py."""
    from scripts.site.audit_accessibility import accessibility_pages
    from scripts.site.public_copy_scope import relpath, route_for

    base = root or ROOT
    return {route_for(relpath(page, base)) for page in accessibility_pages(base)}


def _copy_lint_census(root: Path | None = None) -> set[str]:
    """Routes actually linted by the published-route copy census."""
    from scripts.site.public_copy_scope import published_gate_census

    return published_gate_census(root or ROOT)["copy"]


def _coverage_level(matched: set[str], census: set[str]) -> str:
    if not matched:
        return "none"
    covered = matched & census
    if not covered:
        return "none"
    return "full" if covered == matched else "partial"


def _validate_family_registry(
    registry: dict[str, Any],
    service_routes: set[str],
    indexable_routes: set[str],
    *,
    verify_coverage: bool = True,
) -> list[Finding]:
    """The registry must not be satisfiable by an empty line. Every field is checked."""
    findings: list[Finding] = []
    rel = FAMILY_REGISTRY_REL

    def bad(reason: str, excerpt: str) -> None:
        findings.append(Finding(gate="conversion", path=rel, reason=reason, excerpt=excerpt[:160]))

    if registry.get("schema_version") != FAMILY_REGISTRY_SCHEMA:
        bad("registry_schema_mismatch", str(registry.get("schema_version")))
    if registry.get("fail_closed") is not True:
        bad("registry_not_fail_closed", "fail_closed must be true")
    registry_as_of_value = registry.get("as_of")
    registry_as_of = (
        date.fromisoformat(registry_as_of_value)
        if _is_iso_date(registry_as_of_value)
        else None
    )
    if registry_as_of is None:
        bad("registry_as_of_invalid", str(registry_as_of_value))
    if not _is_owner_issue(registry.get("owner_issue")):
        bad("registry_owner_issue_invalid", str(registry.get("owner_issue")))

    families_value = registry.get("families")
    if not isinstance(families_value, list) or not families_value:
        bad("registry_empty", "no families declared")
        families: list[dict[str, Any]] = []
    else:
        families = families_value

    a11y_census = _a11y_census()
    copy_census = _copy_lint_census()
    seen_ids: set[str] = set()
    exact_owners: dict[str, str] = {}
    prefix_owners: dict[str, str] = {}
    service_source_ids: set[str] = set()
    for family in families:
        if not isinstance(family, dict):
            bad("family_entry_invalid", repr(family))
            continue
        fid = str(family.get("id") or "")
        if not fid or fid in seen_ids:
            bad("family_id_invalid_or_duplicated", fid or "<empty>")
            continue
        seen_ids.add(fid)
        profile = family.get("profile")
        action = family.get("terminal_action")
        if profile not in CONVERSION_PROFILES:
            bad("family_profile_invalid", f"{fid}: {profile}")
        if action not in TERMINAL_ACTIONS:
            bad("family_terminal_action_invalid", f"{fid}: {action}")
        if len(str(family.get("visitor_job") or "").strip()) < MIN_WRITTEN_REASON:
            bad("family_visitor_job_missing", fid)
        if not _is_owner_issue(family.get("owner_issue")):
            bad("family_owner_issue_missing", fid)
        declared_at_value = family.get("declared_at")
        declared_at = (
            date.fromisoformat(declared_at_value) if _is_iso_date(declared_at_value) else None
        )
        if declared_at is None:
            bad("family_declared_at_invalid", f"{fid}: {declared_at_value}")
        elif registry_as_of is not None and declared_at > registry_as_of:
            bad("family_declared_at_after_registry_as_of", f"{fid}: {declared_at_value}")
        match = family.get("match") or {}
        if not isinstance(match, dict):
            match = {}
        match_keys = [key for key in ("routes", "prefix", "source") if key in match]
        if len(match_keys) != 1:
            bad("family_match_invalid", fid)
        elif match_keys[0] == "source" and match.get("source") != BOFU_SERVICE_ROUTE_SOURCE:
            bad("family_match_source_invalid", f"{fid}: {match.get('source')}")
        elif match_keys[0] == "routes":
            route_values = match.get("routes")
            if not isinstance(route_values, list) or not route_values:
                bad("family_match_routes_invalid", fid)
            else:
                if len(route_values) != len(set(map(str, route_values))):
                    bad("family_match_routes_duplicated", fid)
                for route in route_values:
                    if not _is_canonical_route(route):
                        bad("family_match_route_invalid", f"{fid}: {route}")
        elif match_keys[0] == "prefix" and not _is_safe_family_prefix(match.get("prefix")):
            bad("family_match_prefix_invalid", f"{fid}: {match.get('prefix')}")
        uses_service_source = match.get("source") == BOFU_SERVICE_ROUTE_SOURCE
        if uses_service_source:
            service_source_ids.add(fid)
        if profile == "service_pillar" and not uses_service_source:
            bad("family_service_profile_match_invalid", fid)
        if uses_service_source and profile != "service_pillar":
            bad("family_service_source_profile_invalid", fid)
        if profile == "service_pillar" and action != "capture_form":
            bad("family_service_terminal_action_invalid", fid)
        coverage = family.get("gate_coverage") or {}
        for key in GATE_COVERAGE_KEYS:
            if coverage.get(key) not in GATE_COVERAGE_LEVELS:
                bad("family_gate_coverage_invalid", f"{fid}.{key}={coverage.get(key)}")
        if coverage.get("conversion") != "full":
            bad("family_conversion_coverage_understated", fid)
        if action == "none" and profile != "trust_or_legal":
            bad("family_no_action_outside_trust", fid)
        if profile == "trust_or_legal" and action != "none":
            bad("family_trust_action_invalid", fid)
        if action == "service_transition" and profile != "commercial_content":
            bad("family_service_transition_profile_invalid", fid)
        if action == "service_transition" and not isinstance(match.get("routes"), list):
            bad("family_service_transition_match_invalid", fid)
        if action == "none" and len(
            str(family.get("exemption_reason") or "").strip()
        ) < MIN_WRITTEN_REASON:
            bad("family_exemption_reason_missing", fid)

        routes, prefix = _family_routes(family, service_routes)
        for route in routes:
            previous = exact_owners.setdefault(route, fid)
            if previous != fid:
                bad("family_match_overlap", f"{route}: {previous}, {fid}")
        if prefix:
            previous = prefix_owners.setdefault(prefix, fid)
            if previous != fid:
                bad("family_match_overlap", f"{prefix}: {previous}, {fid}")
        matched = {r for r in indexable_routes if r in routes}
        if prefix:
            matched |= {r for r in indexable_routes if r.startswith(prefix)}
        # A prefix family only owns the routes no more specific family claims.
        for other in families:
            if other is family:
                continue
            other_routes, other_prefix = _family_routes(other, service_routes)
            matched -= {r for r in matched if r in other_routes}
            if other_prefix and prefix and len(other_prefix) > len(prefix):
                matched -= {r for r in matched if r.startswith(other_prefix)}

        # Declared gate coverage is verified against the real gate censuses,
        # so the field cannot become decoration.
        if verify_coverage:
            for key, census in (("accessibility", a11y_census), ("copy", copy_census)):
                actual = _coverage_level(matched, census)
                declared = coverage.get(key)
                if declared in GATE_COVERAGE_LEVELS and declared != actual and matched:
                    bad(
                        "family_gate_coverage_mismatch",
                        f"{fid}.{key} declared={declared} actual={actual}",
                    )

        debt_entries = family.get("debt") or []
        if not isinstance(debt_entries, list):
            bad("family_debt_invalid", fid)
            debt_entries = []
        seen_debt_routes: set[str] = set()
        for entry in debt_entries:
            if not isinstance(entry, dict):
                bad("debt_entry_invalid", f"{fid}: {entry}")
                continue
            route = str(entry.get("route") or "")
            if not route:
                bad("debt_route_missing", fid)
                continue
            if not _is_canonical_route(route):
                bad("debt_route_invalid", f"{fid}:{route}")
            if route in seen_debt_routes:
                bad("debt_route_duplicated", f"{fid}:{route}")
            seen_debt_routes.add(route)
            if not _is_owner_issue(entry.get("owner_issue")):
                bad("debt_owner_issue_missing", f"{fid}:{route}")
            if len(str(entry.get("reason") or "").strip()) < MIN_WRITTEN_REASON:
                bad("debt_reason_missing", f"{fid}:{route}")
            expires_at_value = entry.get("expires_at")
            expires_at = (
                date.fromisoformat(expires_at_value) if _is_iso_date(expires_at_value) else None
            )
            if expires_at is None:
                bad("debt_expires_at_invalid", f"{fid}:{route}")
            elif declared_at is not None and not (
                0 <= (expires_at - declared_at).days <= MAX_DEBT_DURATION_DAYS
            ):
                bad(
                    "debt_expiry_window_invalid",
                    f"{fid}:{route} declared={declared_at} expires={expires_at}",
                )
            in_family = route in routes or (prefix and route.startswith(prefix))
            if not in_family:
                bad("debt_route_outside_family", f"{fid}:{route}")
            if verify_coverage and route not in indexable_routes:
                bad("debt_route_not_indexable", f"{fid}:{route}")

        priced_reference_entries = family.get("priced_reference_routes") or []
        if not isinstance(priced_reference_entries, list):
            bad("family_priced_reference_invalid", fid)
            priced_reference_entries = []
        seen_reference_routes: set[str] = set()
        for entry in priced_reference_entries:
            if not isinstance(entry, dict):
                bad("priced_reference_entry_invalid", f"{fid}: {entry}")
                continue
            route = str(entry.get("route") or "")
            if not _is_canonical_route(route):
                bad("priced_reference_route_invalid", f"{fid}:{route}")
            if route in seen_reference_routes:
                bad("priced_reference_route_duplicated", f"{fid}:{route}")
            seen_reference_routes.add(route)
            if len(str(entry.get("reason") or "").strip()) < MIN_WRITTEN_REASON:
                bad("priced_reference_reason_missing", f"{fid}:{route}")
            in_family = route in routes or (prefix and route.startswith(prefix))
            if not in_family:
                bad("priced_reference_route_outside_family", f"{fid}:{route}")
            if verify_coverage and route not in indexable_routes:
                bad("priced_reference_route_not_indexable", f"{fid}:{route}")
    if len(service_source_ids) != 1:
        bad(
            "registry_service_source_owner_invalid",
            f"expected one owner for {BOFU_SERVICE_ROUTE_SOURCE}, got {sorted(service_source_ids)}",
        )
    return findings


def _conversion_profile(
    route: str,
    service_routes: set[str],
    family: dict[str, Any] | None = None,
    priced: bool = False,
) -> str:
    """Effective conversion profile. Derived from data + rendered HTML, never defaulted."""
    if route in service_routes:
        return "service_pillar"
    if family is not None:
        declared = str(family.get("profile"))
        if declared == "trust_or_legal":
            return "trust_or_legal"
        return "priced_offer" if priced else declared
    # No declaration: legacy legal allowlist stays only so that a registry
    # failure still classifies legal pages sanely. The missing declaration is
    # reported as an error by gate_conversion itself.
    if route in {"/privacidade/", "/termos-de-uso/", "/conflitos/", "/uso-de-ia/", "/imprensa/", "/correcoes/"}:
        return "trust_or_legal"
    if route.startswith("/politica-editorial/"):
        return "trust_or_legal"
    return "priced_offer" if priced else "commercial_content"


def _conversion_files(base: Path) -> list[Path]:
    """Conversion walks the same published visitor census as copy/SEO/a11y."""
    from scripts.site.public_copy_scope import visitor_facing_html_files

    return list(visitor_facing_html_files(base))


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
    main_cta_required = 0
    main_cta_exempt = 0
    service_scanned = 0
    service_capture_count = 0
    profile_counts = {
        "service_pillar": 0,
        "priced_offer": 0,
        "commercial_content": 0,
        "trust_or_legal": 0,
    }
    terminal_required = 0
    terminal_covered = 0
    terminal_exempt_legal = 0
    terminal_debt = 0
    priced_capture_total = 0
    priced_capture_covered = 0
    exemptions: list[dict[str, Any]] = []
    _, registered_priced_offers = priced_action_registry()
    pii_re = re.compile(
        r"\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b",
        re.I,
    )

    # Pass 1: census of indexable public routes (sitewide, derived, never a list).
    pages: list[tuple[Path, str, str, str]] = []
    for p in _conversion_files(base):
        html = p.read_text(encoding="utf-8", errors="replace")
        if not is_indexable_html(html):
            continue
        rel = p.relative_to(base)
        route = "/" if rel.as_posix() == "index.html" else "/" + rel.as_posix().removesuffix("index.html")
        pages.append((p, html, route, _main_html(html)))
    indexable_routes = {route for _, _, route, _ in pages}

    registry = load_family_registry()
    families = registry.get("families") or []
    findings.extend(
        _validate_family_registry(
            registry,
            set(service_routes),
            indexable_routes,
            # Declared gate coverage describes the real public surface, so it is
            # verified against ROOT, not against a fixture root under test.
            verify_coverage=base == ROOT,
        )
    )
    satisfied_debt: set[tuple[str, str]] = set()

    for p, html, route, main in pages:
        scanned += 1
        family = _match_family(route, families, set(service_routes))
        priced = _displays_price(main)
        priced_refs = (
            {str(e.get("route")) for e in (family or {}).get("priced_reference_routes") or []}
        )
        priced_reference = priced and route in priced_refs
        if priced_reference:
            priced = False
        profile = _conversion_profile(route, set(service_routes), family, priced)
        profile_counts[profile] += 1
        conversion_exempt = profile == "trust_or_legal"
        has_main_wa = bool(re.search(r'(?is)<a\b[^>]+href=["\'][^"\']*(?:wa\.me|whatsapp\.com)', main))
        has_main_form = bool(
            re.search(r'(?is)<form\b[^>]+action=["\']/.netlify/functions/lead["\']', main)
        )
        if profile == "priced_offer":
            priced_capture_total += 1
            priced_findings = _priced_offer_findings(
                p,
                base,
                route,
                main,
                registered_priced_offers,
                str((family or {}).get("id") or ""),
            )
            findings.extend(priced_findings)
            if not priced_findings:
                priced_capture_covered += 1
        has_linked_capture_route = _has_linked_capture_route(base, main)
        service_transition_destinations = _service_transition_destinations(
            main, set(service_routes)
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
        if conversion_exempt:
            main_cta_exempt += 1
        else:
            main_cta_required += 1
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
        # --- Fail-closed family + terminal-action contract (issue #300) ---
        rel_path = str(p.relative_to(base))
        if family is None:
            findings.append(
                Finding(
                    gate="conversion",
                    path=rel_path,
                    reason="public_family_not_declared",
                    excerpt=(
                        f"{route} — declare a família em {FAMILY_REGISTRY_REL} "
                        "(profile, ação terminal, cobertura de gate)"
                    ),
                )
            )
        else:
            declared_profile = str(family.get("profile"))
            if priced_reference:
                entry = next(
                    e
                    for e in family.get("priced_reference_routes") or []
                    if str(e.get("route")) == route
                )
                exemptions.append(
                    {
                        "route": route,
                        "family": family.get("id"),
                        "kind": "priced_reference",
                        "reason": entry.get("reason"),
                        "owner_issue": family.get("owner_issue"),
                        "expires_at": None,
                    }
                )
            if profile == "trust_or_legal" and priced:
                findings.append(
                    Finding(
                        gate="conversion",
                        path=rel_path,
                        reason="priced_route_in_trust_family",
                        excerpt=f"{route} family={family.get('id')} rendered_price=yes",
                    )
                )
            elif profile == "priced_offer" and declared_profile not in {
                "priced_offer",
                "service_pillar",
            }:
                findings.append(
                    Finding(
                        gate="conversion",
                        path=rel_path,
                        reason="undeclared_priced_offer",
                        excerpt=f"{route} declared={declared_profile} rendered_price=yes",
                    )
                )

            required = "none" if profile == "trust_or_legal" else str(family.get("terminal_action"))
            if profile == "priced_offer":
                # A displayed price always demands persisted capture, whatever
                # the family declared. Derived from the HTML, not declarable away.
                required = "capture_form"
            satisfied = {
                "none": True,
                "capture_form": has_main_form,
                "whatsapp": has_main_wa,
                "capture_form_or_whatsapp": (
                    has_main_form or has_main_wa or has_linked_capture_route
                ),
                "service_transition": len(service_transition_destinations) == 1,
            }.get(required, False)

            if required == "none":
                terminal_exempt_legal += 1
                exemptions.append(
                    {
                        "route": route,
                        "family": family.get("id"),
                        "kind": "trust_or_legal",
                        "reason": family.get("exemption_reason"),
                        "owner_issue": family.get("owner_issue"),
                        "expires_at": None,
                    }
                )
            else:
                terminal_required += 1
                debt = next(
                    (e for e in family.get("debt") or [] if str(e.get("route")) == route), None
                )
                if satisfied:
                    terminal_covered += 1
                    if debt is not None:
                        satisfied_debt.add((str(family.get("id")), route))
                elif route in service_routes:
                    # Owned by the dedicated missing_on_page_form rule below,
                    # which honours the #291 freeze. Do not duplicate it here.
                    pass
                elif debt is None:
                    findings.append(
                        Finding(
                            gate="conversion",
                            path=rel_path,
                            reason="missing_terminal_action",
                            excerpt=f"{route} family={family.get('id')} required={required}",
                        )
                    )
                else:
                    expires = _as_date(debt.get("expires_at"))
                    expired = today > expires
                    terminal_debt += 1
                    exemptions.append(
                        {
                            "route": route,
                            "family": family.get("id"),
                            "kind": "debt",
                            "reason": debt.get("reason"),
                            "owner_issue": debt.get("owner_issue"),
                            "expires_at": expires.isoformat(),
                            "required_terminal_action": required,
                            "expired": expired,
                        }
                    )
                    findings.append(
                        Finding(
                            gate="conversion",
                            path=rel_path,
                            reason="terminal_action_debt_expired"
                            if expired
                            else "terminal_action_debt",
                            excerpt=(
                                f"{route} required={required} "
                                f"issue=#{debt.get('owner_issue')} expires_at={expires.isoformat()}"
                            ),
                            severity="error" if expired else "warn",
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
            "Solicitar canal seguro para envio",
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
        if not conversion_exempt and not any(s.lower() in html.lower() for s in journey_signals):
            findings.append(
                Finding(
                    gate="conversion",
                    path=str(p.relative_to(base)),
                    reason="missing_journey_signal",
                    severity="warn",
                )
            )

    # Debt that the owning issue already paid must be removed, not left to rot
    # into a silent exemption for whatever lands on that route next.
    for family in families:
        for entry in family.get("debt") or []:
            if (str(family.get("id")), str(entry.get("route"))) in satisfied_debt:
                findings.append(
                    Finding(
                        gate="conversion",
                        path=FAMILY_REGISTRY_REL,
                        reason="debt_entry_satisfied_remove_it",
                        excerpt=f"{entry.get('route')} issue=#{entry.get('owner_issue')}",
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
            "profiles": profile_counts,
            "main_cta": {
                "covered": main_cta_count - main_cta_exempt,
                "total": main_cta_required,
                "coverage": round((main_cta_count - main_cta_exempt) / main_cta_required, 4)
                if main_cta_required
                else 0.0,
                "exempt": main_cta_exempt,
                "public_scanned": scanned,
            },
            "on_page_capture": {
                "covered": service_capture_count,
                "total": service_scanned,
                "coverage": round(service_capture_count / service_scanned, 4)
                if service_scanned
                else 0.0,
            },
            "priced_offer_capture": {
                "covered": priced_capture_covered,
                "total": priced_capture_total,
                "coverage": round(priced_capture_covered / priced_capture_total, 4)
                if priced_capture_total
                else 0.0,
            },
            "family_registry": {
                "path": FAMILY_REGISTRY_REL,
                "schema_version": registry.get("schema_version"),
                "families": len(families),
                "fail_closed": bool(registry.get("fail_closed")),
                "undeclared_routes": sum(
                    1 for f in findings if f.reason == "public_family_not_declared"
                ),
            },
            "terminal_action": {
                "covered": terminal_covered,
                "total": terminal_required,
                "coverage": round(terminal_covered / terminal_required, 4)
                if terminal_required
                else 0.0,
                "exempt_trust_or_legal": terminal_exempt_legal,
                "registered_debt": terminal_debt,
            },
            "exemptions": sorted(exemptions, key=lambda e: (e["kind"], e["route"])),
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


def gate_semantic_query_ownership() -> GateReport:
    """Require a complete, conflict-safe Medicoes/Glosas ownership ledger."""
    from scripts.organic.query_ownership import validate_query_ownership

    report = validate_query_ownership(ROOT)
    findings = [
        Finding(
            gate="semantic_query_ownership",
            path=item.path,
            reason=item.reason,
            excerpt=item.detail,
            severity=item.severity,
        )
        for item in report.findings
    ]
    return GateReport(ok=report.ok, findings=findings, stats=report.stats)


def gate_bofu_buyer_decision_map() -> GateReport:
    """Require the complete, unique and decision-bearing #543 BOFU projection."""
    from scripts.bofu_dominance.core.buyer_decision_map import (
        validate_buyer_decision_map,
    )

    report = validate_buyer_decision_map(ROOT)
    findings = [
        Finding(
            gate="bofu_buyer_decision_map",
            path=item.path,
            reason=item.reason,
            excerpt=item.detail,
            severity=item.severity,
        )
        for item in report.findings
    ]
    return GateReport(ok=report.ok, findings=findings, stats=report.stats)


def _strip_html_preserve_visibility(html: str) -> str:
    """Remove script/style/meta tags and attribute content, keeping only visible text.

    Unlike strip_html, this explicitly excludes <script> blocks (including JSON-LD),
    <style>, and their content, so jargon tokens in machine-readable sections
    do not trigger false positives.
    """
    # Remove <script> tags (including type="application/ld+json")
    t = re.sub(r"(?is)<script\b[^>]*>.*?</script>", " ", html)
    # Remove <style> tags
    t = re.sub(r"(?is)<style\b[^>]*>.*?</style>", " ", t)
    # Remove all other tags but keep content
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    # Decode HTML entities
    t = re.sub(r"&\w+;", " ", t)
    # Normalize whitespace
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------------------
# Independent indexation evidence
# (CONFENGE-PSEO-EDITORIAL-INDEXATION-CUTOVER)
#
# INSTANCE_INDEX_READY and ARCHETYPE_EDITORIAL_READY used to be circular. The
# first asked only "is there a recorded excuse for the robots tag this page
# already carries"; the second only "does this page contain a banned token".
# Neither ever asked whether the page had earned an index slot.
#
# Both are now evidence-first verdicts computed WITHOUT reading the page's
# current robots meta, its sitemap membership or its governance record. The
# comparison against the shipped public state happens afterwards, in the
# caller (gate_instance_index_ready, universe_sweep), so that
# "index-ready but noindex" can finally mean what it says.
#
# Every subgate is answered from an authority that already exists in this
# repository. Nothing here re-implements a check another gate owns:
#   - machine/doorway residue  -> MACHINE_PATTERNS (gate_naturalness)
#   - template clones          -> jaccard_similarity (gate_similarity_indexable)
#   - canonical ownership      -> canonical_hrefs (gate_index_surface)
#   - query cannibalization    -> medicoes-glosas-query-ownership.v1.json
#                                 (gate_semantic_query_ownership)
#   - CTA subordination        -> the terminal_action framework of the family
#                                 registry (gate_conversion)
#   - named editorial verdicts -> #83's contract-analysis-publication-gate/1.0,
#                                 data/editorial/EDITORIAL-REGISTRY.json,
#                                 seo/content-disposition-2026-08-02.json
#   - reputational safety      -> scripts/contract_analysis/reputation.py
# ---------------------------------------------------------------------------

INDEXATION_EVIDENCE_SCHEMA = "indexation-evidence-v1"

# A public claim older than 18 months is stale: it has to be re-dated before it
# can be offered to a search visitor as the current answer.
MAX_CONTENT_AGE_DAYS = 548

# Archetype floors. Below these the page cannot answer its own visitor_job.
MIN_SUBSTANTIVE_WORDS = 300
MIN_ANSWER_FIRST_CHARS = 120
ANSWER_FIRST_WINDOW_CHARS = 900
MIN_CONCRETE_SPECIFICS = 3

# Two pages of the same family sharing this much 6-gram surface are one template
# with different nouns, not distinct grain. This is the threshold the existing
# ``similarity`` gate already treats as an error, not a new, looser one.
FAMILY_CLONE_JACCARD = 0.70
SHINGLE_N = 6
MAX_SIBLING_COMPARISONS = 60

# Deterministic per-family sample for the archetype verdict.
ARCHETYPE_SAMPLE_SIZE = 6

SUBGATE_MATERIAL = "material"
SUBGATE_REMEDIABLE = "remediable"

# Families that name a real, identifiable counterparty (a company, a CNPJ, a
# contracting body) in the page body. Reputational safety is a real risk only
# there; the educational library discusses "irregularidade" and "sobrepreço" as
# subjects, which is not an accusation against anyone.
NAMED_ENTITY_FAMILY_IDS = frozenset({"analises-contratos-publicos"})

CONTRACT_ANALYSIS_STATUS_REL = "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json"
EDITORIAL_REGISTRY_REL = "data/editorial/EDITORIAL-REGISTRY.json"
CONTENT_DISPOSITION_REL = "seo/content-disposition-2026-08-02.json"
LIVE_INTELLIGENCE_CONTRACT_REL = "docs/contracts/confenge-live-intelligence-v1.json"
QUERY_OWNERSHIP_REL = "data/organic/medicoes-glosas-query-ownership.v1.json"

# The page's own visible copy admitting that the record behind it is not
# production data. "demonstrativo" is deliberately absent: /casos/ ships
# labelled demonstrations that are legitimately public.
FIXTURE_MARKER_RE = re.compile(
    r"(test_only_fixture|\bfixtures?\b|sint[ée]tic|preview\s+noindex|"
    r"dados?\s+fict[íi]ci|dados?\s+de\s+teste)",
    re.I,
)

OFFICIAL_SOURCE_HREF_RE = re.compile(
    r'href=["\']https?://[^"\']*'
    r"(?:\.gov\.br|\.leg\.br|\.jus\.br|planalto|pncp|comprasnet|tcu\.|ibge|"
    r"caixa\.gov|sinapi|portaltransparencia)",
    re.I,
)
LEGAL_DEVICE_RE = re.compile(
    r"\bLei\s*n?[º°]?\s*\d{1,2}\.?\d{3}\b"
    r"|\bart(?:igo)?s?\.?\s*\d{1,3}\b"
    r"|\bAc[óo]rd[ãa]o\s+\d{1,5}[/-]\d{4}\b"
    r"|\bS[úu]mula\s+\d+\b"
    r"|\bDecreto\s+n?[º°]?\s*\d"
    r"|\bIN\s+\d+/\d{4}\b",
    re.I,
)

_DATETIME_ATTR_RE = re.compile(r'datetime=["\'](\d{4}-\d{2}-\d{2})', re.I)
_JSONLD_DATE_RE = re.compile(
    r'"(?:dateModified|datePublished)"\s*:\s*"(\d{4}-\d{2}-\d{2})', re.I
)
_META_DATE_RE = re.compile(
    r'(?:article:modified_time|article:published_time)["\'][^>]*'
    r'content=["\'](\d{4}-\d{2}-\d{2})',
    re.I,
)
_VISIBLE_ISO_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_PT_MONTHS = {
    "janeiro": 1,
    "fevereiro": 2,
    "marco": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}
_VISIBLE_PT_DATE_RE = re.compile(
    r"\b(\d{1,2})\s*(?:º|°)?\s+de\s+([A-Za-zçÇáéíóúâêôãõà]+)\s+de\s+(20\d{2})\b", re.I
)
_VISIBLE_BR_DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(20\d{2})\b")

# Visible disclosure of a limitation or of residual uncertainty. Removing raw
# internal jargon must not remove these: "as_of" leaving the copy is a fix,
# "we do not know this" leaving the copy is a regression.
CAVEAT_MARKER_RE = re.compile(
    r"(n[ãa]o substitui|n[ãa]o constitui|conte[úu]do educacional|limita[çc][õo]?e?s?\b"
    r"|n[ãa]o informad|n[ãa]o publicad[oa] pela fonte|n[ãa]o se afirma|n[ãa]o significa"
    r"|sujeit[oa] a|estimativa|estimad|aproximad|pode variar|depende do caso"
    r"|confirme|verifique|sem prova documental|n[ãa]o [ée] parecer|refer[êe]ncia,? n[ãa]o)",
    re.I,
)
# A page only owes a caveat when it actually asserts a figure or an
# epistemic label. A legal notice that asserts nothing owes nothing.
CLAIM_NEEDING_CAVEAT_RE = re.compile(
    r"(R\$\s*\d|\d+(?:[.,]\d+)?\s*%|\bFACT\b|\bINFERENCE\b|\bCALCULATION\b|\bUNKNOWN\b"
    r"|\bestimativa\b|\bproje[çc][ãa]o\b|\bcalculad)",
    re.I,
)

CTA_PHRASE_RE = re.compile(
    r"(fale com|falar no whatsapp|conversar pelo whatsapp|solicitar|solicite|agendar|"
    r"agende|pe[çc]a |quero |contrate|contratar|envie (?:o|a|os|as|seu|sua) |"
    r"receba |baixe |assine |analisar (?:este|meu) )",
    re.I,
)
_CONCRETE_SPECIFIC_RE = re.compile(
    r"(\bR\$\s*[\d.]+|\d+(?:[.,]\d+)?\s*%|\b20\d{2}\b|\bart(?:igo)?s?\.?\s*\d{1,3}\b"
    r"|\bAc[óo]rd[ãa]o\s+\d|\bLei\s*n?[º°]?\s*\d|\b\d{1,3}\s*dias?\b)",
    re.I,
)

_SLUG_STOPWORDS = frozenset(
    {
        "para",
        "como",
        "obra",
        "obras",
        "publica",
        "publicas",
        "publico",
        "publicos",
        "contrato",
        "contratos",
        "index",
        "sobre",
        "quando",
        "pelo",
        "pela",
        "com",
        "sem",
        "dos",
        "das",
        "que",
        "nao",
        "uma",
    }
)


# check_reputational_safety was written for structured analysis records. Run
# over a whole rendered page it also reads the page's own disclaimer sentences
# ("Limitação: não é parecer jurídico, não julga irregularidade e não transforma
# 'atípico' em 'irregular'"), whose verbs sit outside its own _SAFE_SCOPE list.
# A disclaimer is the opposite of an accusation, so the sentence carrying one is
# dropped before the check runs — the check itself is never weakened.
PAGE_DISCLAIMER_RE = re.compile(
    r"n[ãa]o\s+(julga|imputa|acusa|atribui|aponta|declara|qualifica|transforma|"
    r"caracteriza|presume|[ée]\s+(parecer|den[úu]ncia|acusa[çc][ãa]o|julgamento))"
    r"|limita[çc][õo]es?\s*:",
    re.I,
)


LEGACY_DISCLAIMER_RE = re.compile(
    r"n[ãa]o\s+(somos|fazemos|atuamos|oferecemos|prestamos|vendemos)"
    r"|entidade\s+legada"
    r"|p[áa]ginas?\s+410"
    r"|descontinuad",
    re.I,
)


def _fold(value: str) -> str:
    """Lowercase and strip accents, so ``medicao`` in a slug meets ``medição``."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def canonical_hrefs(html: str) -> list[str]:
    """Every ``rel=canonical`` href on the page, in document order.

    gate_index_surface only ever needed "is there one". Instance readiness also
    needs "is there exactly one, and does it point at this page", so the
    extraction moved here and gate_index_surface now calls it.
    """
    found: list[str] = []
    for match in re.finditer(r"(?is)<link\b[^>]*>", html):
        tag = match.group(0)
        if not re.search(r'rel=["\']canonical["\']', tag, re.I):
            continue
        href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
        if href:
            found.append(href.group(1).strip())
    return found


def visible_main_text(html: str) -> str:
    """Visible reader text of ``<main>``, falling back to the whole document."""
    main = _main_html(html)
    return _strip_html_preserve_visibility(main or html)


def _shingle_set(text: str, n: int = SHINGLE_N) -> frozenset[str]:
    """Same shingling as scripts.editorial.naturalness.jaccard_similarity.

    Precomputed once per page because the family-level comparison is pairwise;
    ``test_family_shingles_match_the_similarity_gate`` pins the equivalence.
    """
    tokens = re.findall(r"\w+", text.lower())
    if len(tokens) < n:
        return frozenset({" ".join(tokens)} if tokens else set())
    return frozenset(" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def _sampled(items: list[str], cap: int) -> list[str]:
    """Deterministic, evenly spaced sample so the verdict is reproducible."""
    if len(items) <= cap:
        return list(items)
    step = len(items) / cap
    return [items[int(i * step)] for i in range(cap)]


@dataclass(frozen=True)
class Subgate:
    """One evidence question, its answer, and why."""

    name: str
    passed: bool
    severity: str = SUBGATE_REMEDIABLE
    detail: str = ""
    applicable: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "applicable": self.applicable,
            "severity": self.severity,
            "detail": self.detail,
        }


@dataclass
class IndexationContext:
    """Everything the per-route and per-family verdicts read, loaded once.

    Built by :func:`build_indexation_context`. Passing it in keeps
    ``instance_index_ready_for_route`` cheap enough to call in a loop from a
    downstream remediation pass; omitting it makes the call self-contained.
    """

    base: Path
    today: date
    families: list[dict[str, Any]] = field(default_factory=list)
    service_routes: set[str] = field(default_factory=set)
    route_family: dict[str, dict[str, Any]] = field(default_factory=dict)
    family_routes: dict[str, list[str]] = field(default_factory=dict)
    html_by_route: dict[str, str] = field(default_factory=dict)
    path_by_route: dict[str, Path] = field(default_factory=dict)
    shingles_by_route: dict[str, frozenset[str]] = field(default_factory=dict)
    title_owners: dict[str, list[str]] = field(default_factory=dict)
    editorial_registry: dict[str, str] = field(default_factory=dict)
    content_disposition: dict[str, dict[str, Any]] = field(default_factory=dict)
    contract_analysis: dict[str, dict[str, Any]] = field(default_factory=dict)
    live_contract_status: str = ""
    ownership_route_status: dict[str, str] = field(default_factory=dict)
    ownership_loser_routes: dict[str, str] = field(default_factory=dict)


_INDEXATION_CONTEXT_CACHE: dict[tuple[str, str], IndexationContext] = {}


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _normalized_title(html: str) -> str:
    match = re.search(r"(?is)<title\b[^>]*>(.*?)</title>", html)
    if not match:
        return ""
    title = _fold(strip_html(match.group(1)))
    title = re.split(r"\s*[|·—–]\s*confenge", title)[0]
    return re.sub(r"\s+", " ", title).strip()


def build_indexation_context(
    base: Path | None = None, *, now: date | datetime | str | None = None
) -> IndexationContext:
    """Load every authority the readiness verdicts consult, exactly once."""
    root = base or ROOT
    today = _as_date(now)
    key = (str(root), today.isoformat())
    cached = _INDEXATION_CONTEXT_CACHE.get(key)
    if cached is not None:
        return cached

    registry = load_family_registry(root)
    families = [f for f in (registry.get("families") or []) if isinstance(f, dict)]
    service_routes = _bofu_service_routes(root)

    ctx = IndexationContext(
        base=root, today=today, families=families, service_routes=service_routes
    )

    for page in _conversion_files(root):
        rel = page.relative_to(root).as_posix()
        route = "/" if rel == "index.html" else "/" + rel.removesuffix("index.html")
        html = page.read_text(encoding="utf-8", errors="replace")
        ctx.html_by_route[route] = html
        ctx.path_by_route[route] = page
        family = _match_family(route, families, service_routes)
        if family is not None:
            ctx.route_family[route] = family
            ctx.family_routes.setdefault(str(family.get("id")), []).append(route)
        title = _normalized_title(html)
        if title:
            ctx.title_owners.setdefault(title, []).append(route)
    for routes in ctx.family_routes.values():
        routes.sort()

    # #83's own gate, verdict per analysis slug.
    canary = _read_json(root / CONTRACT_ANALYSIS_STATUS_REL)
    for item in canary.get("items") or []:
        slug = str(item.get("slug") or "")
        if slug:
            ctx.contract_analysis[slug] = item

    editorial = _read_json(root / EDITORIAL_REGISTRY_REL)
    for page_row in editorial.get("pages") or []:
        url = str(page_row.get("url") or "")
        if url:
            ctx.editorial_registry[url] = str(page_row.get("status") or "")

    disposition = _read_json(root / CONTENT_DISPOSITION_REL)
    for item in disposition.get("items") or []:
        path_value = str(item.get("path") or "")
        if path_value:
            ctx.content_disposition[path_value] = item

    ctx.live_contract_status = str(
        _read_json(root / LIVE_INTELLIGENCE_CONTRACT_REL).get("status") or ""
    )

    ownership = _read_json(root / QUERY_OWNERSHIP_REL)
    for row in ownership.get("routes") or []:
        path_value = str(row.get("path") or "")
        if path_value:
            ctx.ownership_route_status[path_value] = str(row.get("status") or "")
    for conflict in ownership.get("conflicts") or []:
        owner = str(conflict.get("owner_path") or "")
        for competitor in conflict.get("competing_routes") or []:
            competitor = str(competitor)
            if competitor and competitor != owner:
                ctx.ownership_loser_routes[competitor] = (
                    f"{conflict.get('id')} owner={owner} state={conflict.get('state')}"
                )

    _INDEXATION_CONTEXT_CACHE[key] = ctx
    return ctx


# --- individual evidence questions -----------------------------------------


def page_dates(html: str) -> list[date]:
    """Dates the page itself publishes, structured markup preferred.

    Visible prose is only consulted when the page carries no machine-readable
    date at all, because a quoted statute date ("de 1º de abril de 2021") is
    not this page's own freshness claim.
    """
    found: list[date] = []
    for pattern in (_JSONLD_DATE_RE, _META_DATE_RE, _DATETIME_ATTR_RE):
        for raw in pattern.findall(html):
            try:
                found.append(date.fromisoformat(raw))
            except ValueError:
                continue
    if found:
        return found
    text = _strip_html_preserve_visibility(html)
    for raw in _VISIBLE_ISO_DATE_RE.findall(text):
        try:
            found.append(date.fromisoformat(raw))
        except ValueError:
            continue
    for day, month, year in _VISIBLE_PT_DATE_RE.findall(text):
        number = _PT_MONTHS.get(_fold(month))
        if number:
            try:
                found.append(date(int(year), number, int(day)))
            except ValueError:
                continue
    for day, month, year in _VISIBLE_BR_DATE_RE.findall(text):
        try:
            found.append(date(int(year), int(month), int(day)))
        except ValueError:
            continue
    return found


def _sub_official_live(
    route: str, html: str, family: dict[str, Any] | None, ctx: IndexationContext
) -> Subgate:
    """Is the record behind this page production data, or a fixture/preview?"""
    fid = str((family or {}).get("id") or "")
    if fid.startswith("live-intelligence") and not ctx.live_contract_status.startswith(
        "SHIPPED"
    ):
        return Subgate(
            "official_live",
            False,
            SUBGATE_REMEDIABLE,
            f"{LIVE_INTELLIGENCE_CONTRACT_REL} status={ctx.live_contract_status!r}: "
            "the producer contract behind this archetype is not shipped, so no "
            "instance of it is backed by official live data",
        )
    if fid == "analises-contratos-publicos" and route != "/analises-contratos-publicos/":
        slug = route.strip("/").split("/")[-1]
        item = ctx.contract_analysis.get(slug)
        if item is None:
            return Subgate(
                "official_live",
                False,
                SUBGATE_REMEDIABLE,
                f"slug={slug} has no recorded state in {CONTRACT_ANALYSIS_STATUS_REL}; "
                "the data state of this instance is unknown, not official_live",
            )
        if item.get("fixture") or str(item.get("source_kind")) != "official_live":
            return Subgate(
                "official_live",
                False,
                SUBGATE_REMEDIABLE,
                f"slug={slug} source_kind={item.get('source_kind')} "
                f"fixture={item.get('fixture')}",
            )
    marker = FIXTURE_MARKER_RE.search(visible_main_text(html))
    if marker:
        return Subgate(
            "official_live",
            False,
            SUBGATE_REMEDIABLE,
            f"visible copy declares a non-production record: {marker.group(0)!r}",
        )
    return Subgate("official_live", True, SUBGATE_REMEDIABLE, "no fixture/preview marker")


def _sub_freshness(html: str, ctx: IndexationContext) -> Subgate:
    dates = page_dates(html)
    if not dates:
        return Subgate(
            "freshness", False, SUBGATE_REMEDIABLE, "page publishes no date at all"
        )
    newest = max(dates)
    if newest > ctx.today:
        return Subgate(
            "freshness", False, SUBGATE_REMEDIABLE, f"future-dated: {newest.isoformat()}"
        )
    age = (ctx.today - newest).days
    if age > MAX_CONTENT_AGE_DAYS:
        return Subgate(
            "freshness",
            False,
            SUBGATE_REMEDIABLE,
            f"newest date {newest.isoformat()} is {age}d old (max {MAX_CONTENT_AGE_DAYS}d)",
        )
    return Subgate("freshness", True, SUBGATE_REMEDIABLE, f"as of {newest.isoformat()} ({age}d)")


def _sub_citable_source(html: str) -> Subgate:
    main = _main_html(html) or html
    if OFFICIAL_SOURCE_HREF_RE.search(main):
        return Subgate("citable_source", True, SUBGATE_REMEDIABLE, "links an official source")
    devices = set(LEGAL_DEVICE_RE.findall(visible_main_text(html)))
    if devices:
        return Subgate(
            "citable_source",
            True,
            SUBGATE_REMEDIABLE,
            f"cites {len(devices)} legal device(s)",
        )
    return Subgate(
        "citable_source",
        False,
        SUBGATE_REMEDIABLE,
        "no official source link and no legal-device citation for the core claim",
    )


def _sub_archetype_completeness(html: str, family: dict[str, Any] | None) -> Subgate:
    text = visible_main_text(html)
    words = len(re.findall(r"\w+", text))
    headings = len(re.findall(r"(?is)<h2\b", _main_html(html) or html))
    has_h1 = bool(re.search(r"(?is)<h1\b", html))
    job = str((family or {}).get("visitor_job") or "").strip()
    problems: list[str] = []
    if not has_h1:
        problems.append("no h1")
    if words < MIN_SUBSTANTIVE_WORDS:
        problems.append(f"{words} words < {MIN_SUBSTANTIVE_WORDS}")
    if headings < 2:
        problems.append(f"{headings} h2 sections < 2")
    if not job:
        problems.append("family declares no visitor_job to answer")
    if problems:
        return Subgate(
            "archetype_completeness", False, SUBGATE_REMEDIABLE, "; ".join(problems)
        )
    return Subgate(
        "archetype_completeness",
        True,
        SUBGATE_REMEDIABLE,
        f"{words} words, {headings} sections, answers: {job[:60]}",
    )


def _sub_distinct_grain(route: str, ctx: IndexationContext, family_id: str) -> Subgate:
    siblings = [r for r in ctx.family_routes.get(family_id, []) if r != route]
    if not siblings:
        return Subgate(
            "materially_distinct_grain",
            True,
            SUBGATE_MATERIAL,
            "single-instance family: nothing to be a clone of",
            applicable=False,
        )
    mine = ctx.shingles_by_route.get(route)
    if mine is None:
        mine = _shingle_set(visible_main_text(ctx.html_by_route.get(route, "")))
        ctx.shingles_by_route[route] = mine
    worst = 0.0
    worst_route = ""
    for sibling in _sampled(siblings, MAX_SIBLING_COMPARISONS):
        theirs = ctx.shingles_by_route.get(sibling)
        if theirs is None:
            theirs = _shingle_set(visible_main_text(ctx.html_by_route.get(sibling, "")))
            ctx.shingles_by_route[sibling] = theirs
        score = _jaccard(mine, theirs)
        if score > worst:
            worst, worst_route = score, sibling
    if worst >= FAMILY_CLONE_JACCARD:
        return Subgate(
            "materially_distinct_grain",
            False,
            SUBGATE_MATERIAL,
            f"jaccard{SHINGLE_N}={worst:.3f} vs {worst_route} "
            f"(>= {FAMILY_CLONE_JACCARD}): same template, different nouns",
        )
    return Subgate(
        "materially_distinct_grain",
        True,
        SUBGATE_MATERIAL,
        f"max sibling jaccard{SHINGLE_N}={worst:.3f}",
    )


def _sub_self_canonical(route: str, html: str) -> Subgate:
    hrefs = canonical_hrefs(html)
    if len(hrefs) != 1:
        return Subgate(
            "self_canonical",
            False,
            SUBGATE_REMEDIABLE,
            f"{len(hrefs)} canonical tags (exactly 1 required): {hrefs[:3]}",
        )
    target = urlparse(hrefs[0]).path or "/"
    if not target.endswith("/") and not target.endswith(".html"):
        target += "/"
    if target != route:
        return Subgate(
            "self_canonical",
            False,
            SUBGATE_REMEDIABLE,
            f"canonical points at {target}, not at {route}",
        )
    return Subgate("self_canonical", True, SUBGATE_REMEDIABLE, f"self-canonical {route}")


def _sub_no_cannibalization(route: str, ctx: IndexationContext) -> Subgate:
    conflict = ctx.ownership_loser_routes.get(route)
    if conflict:
        return Subgate(
            "no_cannibalization",
            False,
            SUBGATE_REMEDIABLE,
            f"{QUERY_OWNERSHIP_REL} declares another route the owner: {conflict}",
        )
    status = ctx.ownership_route_status.get(route)
    if status and status != "INDEXABLE":
        return Subgate(
            "no_cannibalization",
            False,
            SUBGATE_REMEDIABLE,
            f"{QUERY_OWNERSHIP_REL} classifies this route {status}",
        )
    title = _normalized_title(ctx.html_by_route.get(route, ""))
    twins = [r for r in ctx.title_owners.get(title, []) if r != route]
    if title and twins:
        return Subgate(
            "no_cannibalization",
            False,
            SUBGATE_REMEDIABLE,
            f"identical title also served by {twins[:3]}",
        )
    return Subgate("no_cannibalization", True, SUBGATE_REMEDIABLE, "no declared conflict")


def _sub_record_specific(route: str, html: str, ctx: IndexationContext, family_id: str) -> Subgate:
    """Does the body talk about THIS record, or only about the family's subject?"""
    siblings = [r for r in ctx.family_routes.get(family_id, []) if r != route]
    family = ctx.route_family.get(route) or {}
    prefix = str((family.get("match") or {}).get("prefix") or "")
    is_hub = route == "/" or (prefix and route == prefix)
    slug = route.strip("/").split("/")[-1].removesuffix(".html") if route != "/" else ""
    mine = {
        token
        for token in _fold(slug).split("-")
        if len(token) >= 4 and token not in _SLUG_STOPWORDS
    }
    if not siblings or is_hub or not mine:
        return Subgate(
            "record_specific_content",
            True,
            SUBGATE_REMEDIABLE,
            "hub route, single-instance family, or slug with no distinctive token: "
            "there is no per-record grain to prove here",
            applicable=False,
        )
    shared = Counter()
    for sibling in siblings:
        sibling_slug = sibling.strip("/").split("/")[-1]
        for token in set(_fold(sibling_slug).split("-")):
            shared[token] += 1
    limit = max(1, int(0.4 * len(siblings)))
    distinctive = {token for token in mine if shared[token] <= limit}
    if not distinctive:
        return Subgate(
            "record_specific_content",
            False,
            SUBGATE_REMEDIABLE,
            f"every slug token of {slug} is shared with its siblings",
        )
    body = _fold(visible_main_text(html))
    present = {token for token in distinctive if token in body}
    if len(present) * 2 < len(distinctive):
        return Subgate(
            "record_specific_content",
            False,
            SUBGATE_REMEDIABLE,
            f"only {sorted(present)} of {sorted(distinctive)} appear in the body: "
            "the copy is the family's, not this record's",
        )
    return Subgate(
        "record_specific_content",
        True,
        SUBGATE_REMEDIABLE,
        f"{len(present)}/{len(distinctive)} distinctive tokens present",
    )


def _sub_public_safe(route: str, html: str) -> Subgate:
    """Machine/doorway residue and abandoned-entity leaks. Same patterns as
    gate_naturalness and gate_legacy_entity_matrix, asked per instance."""
    text = strip_html(html)
    for name, pattern in MACHINE_PATTERNS:
        if pattern.search(html) or pattern.search(text):
            return Subgate(
                "public_safe", False, SUBGATE_REMEDIABLE, f"machine pattern {name}"
            )
    if not LEGACY_SCAN_SKIP.search(route):
        # A page that names an abandoned entity in order to disown it
        # ("Não somos: ... AVCB/CLCB", a GSC row labelled "entidade legada") is
        # doing the opposite of promoting it, so the disclaiming sentence is
        # dropped before the scan — same rule as PAGE_DISCLAIMER_RE.
        for sentence in re.split(
            r"(?<=[.;!?])\s+", _strip_html_preserve_visibility(html)
        ):
            if LEGACY_DISCLAIMER_RE.search(sentence):
                continue
            legacy = LEGACY_ENTITY_RE.search(sentence)
            if legacy:
                return Subgate(
                    "public_safe",
                    False,
                    SUBGATE_REMEDIABLE,
                    f"abandoned entity in visible copy: {legacy.group(0)!r}",
                )
    return Subgate("public_safe", True, SUBGATE_REMEDIABLE, "no machine/legacy residue")


def _sub_named_gate_verdict(
    route: str, family: dict[str, Any] | None, ctx: IndexationContext
) -> Subgate:
    """The family's own already-established editorial authority, where one exists."""
    fid = str((family or {}).get("id") or "")
    if fid == "analises-contratos-publicos" and route != "/analises-contratos-publicos/":
        slug = route.strip("/").split("/")[-1]
        item = ctx.contract_analysis.get(slug)
        if item is None:
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_REMEDIABLE,
                f"contract-analysis-publication-gate/1.0 has no verdict for {slug}",
            )
        state = str(item.get("state") or "")
        if state == "REJECT":
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_MATERIAL,
                f"contract-analysis-publication-gate/1.0 = REJECT "
                f"({','.join(item.get('reason_codes') or [])})",
            )
        if state != "PUBLISHABLE_INDEX":
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_REMEDIABLE,
                f"contract-analysis-publication-gate/1.0 = {state} "
                f"({','.join(item.get('reason_codes') or [])}); INDEX needs all 12 "
                "conditions plus the founder's hash-bound approval (#83)",
            )
        return Subgate(
            "named_gate_verdict", True, SUBGATE_REMEDIABLE, "PUBLISHABLE_INDEX"
        )

    status = ctx.editorial_registry.get(route)
    if status:
        if status == "REJECTED":
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_MATERIAL,
                f"{EDITORIAL_REGISTRY_REL} = REJECTED",
            )
        if status != "INDEXABLE":
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_REMEDIABLE,
                f"{EDITORIAL_REGISTRY_REL} = {status} (awaiting named human approval)",
            )
        return Subgate("named_gate_verdict", True, SUBGATE_REMEDIABLE, "INDEXABLE")

    item = ctx.content_disposition.get(route)
    if item:
        disposition = str(item.get("disposition") or "")
        if disposition != "manter":
            return Subgate(
                "named_gate_verdict",
                False,
                SUBGATE_REMEDIABLE,
                f"{CONTENT_DISPOSITION_REL} disposition={disposition} "
                f"classification={item.get('classification')} "
                f"reason={item.get('noindex_reason')}",
            )
        return Subgate(
            "named_gate_verdict", True, SUBGATE_REMEDIABLE, "content-disposition=manter"
        )

    return Subgate(
        "named_gate_verdict",
        True,
        SUBGATE_REMEDIABLE,
        "no named editorial authority claims this family",
        applicable=False,
    )


def _sub_reputational_safety(
    html: str, family: dict[str, Any] | None
) -> Subgate:
    """#83's own reputational rule, applied only where a real party is named."""
    fid = str((family or {}).get("id") or "")
    named_entity = fid in NAMED_ENTITY_FAMILY_IDS or bool(
        family and family.get("editorial_jargon_strict")
    )
    if not named_entity:
        return Subgate(
            "reputational_safety",
            True,
            SUBGATE_MATERIAL,
            "family names no identifiable counterparty",
            applicable=False,
        )
    from scripts.contract_analysis.reputation import check_reputational_safety

    asserted = " ".join(
        sentence
        for sentence in re.split(r"(?<=[.;!?])\s+", visible_main_text(html))
        if not PAGE_DISCLAIMER_RE.search(sentence)
    )
    codes = check_reputational_safety({}, rendered_html=asserted)
    if codes:
        return Subgate(
            "reputational_safety",
            False,
            SUBGATE_MATERIAL,
            f"accusatory language without documentary basis: {','.join(codes)}",
        )
    return Subgate("reputational_safety", True, SUBGATE_MATERIAL, "no unbacked accusation")


# --- public, per-route and per-family verdicts ------------------------------


def instance_index_ready_for_route(
    route: str,
    html: str,
    family: dict[str, Any] | None,
    context: IndexationContext | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Should THIS instance be indexed, on its own evidence?

    Deliberately blind to the page's current robots meta, its sitemap
    membership and its governance record: those describe the state we are
    auditing, not the evidence for it. The caller compares the two.

    Returns ``(ready, reasons)`` where ``reasons`` carries every subgate result,
    the blocking subgate names and the materially-failing subset (the ones that
    mean withdraw, not de-index).
    """
    ctx = context or build_indexation_context()
    fid = str((family or {}).get("id") or "")
    subgates = [
        _sub_public_safe(route, html),
        _sub_official_live(route, html, family, ctx),
        _sub_freshness(html, ctx),
        _sub_citable_source(html),
        _sub_archetype_completeness(html, family),
        _sub_distinct_grain(route, ctx, fid),
        _sub_self_canonical(route, html),
        _sub_no_cannibalization(route, ctx),
        _sub_record_specific(route, html, ctx, fid),
        _sub_named_gate_verdict(route, family, ctx),
        _sub_reputational_safety(html, family),
    ]
    if family is None:
        subgates.insert(
            0,
            Subgate(
                "declared_family",
                False,
                SUBGATE_REMEDIABLE,
                f"{route} belongs to no family declared in {FAMILY_REGISTRY_REL}",
            ),
        )
    blocking = [s.name for s in subgates if s.applicable and not s.passed]
    material = [
        s.name for s in subgates if s.applicable and not s.passed and s.severity == SUBGATE_MATERIAL
    ]
    return (
        not blocking,
        {
            "schema": INDEXATION_EVIDENCE_SCHEMA,
            "route": route,
            "family": fid or None,
            "subgates": {s.name: s.to_dict() for s in subgates},
            "blocking": blocking,
            "material": material,
        },
    )


def archetype_editorial_ready_for_family(
    family: dict[str, Any],
    sample_pages: list[tuple[str, str]] | None = None,
    context: IndexationContext | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Is this family's ARCHETYPE fit to be published, on a real sample?

    Composite, not a single token scan. ``sample_pages`` is a list of
    ``(route, html)``; when omitted a deterministic sample of the family's own
    shipped routes is used. Each subgate reports pass/fail, applicability and
    severity, so a caller can tell "fix the copy" from "withdraw the route".
    """
    ctx = context or build_indexation_context()
    fid = str(family.get("id") or "")
    if sample_pages is None:
        routes = _sampled(ctx.family_routes.get(fid, []), ARCHETYPE_SAMPLE_SIZE)
        sample_pages = [(r, ctx.html_by_route.get(r, "")) for r in routes]
    if not sample_pages:
        return True, {
            "schema": INDEXATION_EVIDENCE_SCHEMA,
            "family": fid,
            "sample": [],
            "subgates": {},
            "blocking": [],
            "material": [],
            "note": "family declares no shipped route to sample",
        }

    subgates: list[Subgate] = []

    def worst(name: str, results: list[Subgate], severity: str) -> Subgate:
        """Aggregate a per-page subgate over the sample.

        The archetype inherits materiality from its instances, it does not
        invent it: the aggregate is MATERIAL only when a failing page is itself
        MATERIAL (a named-gate REJECT). Copy defects stay remediable, which is
        what keeps REJECT_WITHDRAW distinct from NOT_PUBLIC_SAFE.
        """
        failed = [r for r in results if r.applicable and not r.passed]
        applicable = any(r.applicable for r in results)
        if not applicable:
            return Subgate(name, True, severity, "not applicable to this family", applicable=False)
        if failed:
            escalated = (
                SUBGATE_MATERIAL
                if any(r.severity == SUBGATE_MATERIAL for r in failed)
                else severity
            )
            return Subgate(
                name,
                False,
                escalated,
                f"{len(failed)}/{len(results)} sampled pages fail: "
                + "; ".join(f"{r.detail}" for r in failed[:2]),
            )
        return Subgate(name, True, severity, f"{len(results)} sampled pages pass")

    subgates.append(
        worst("public_safe", [_sub_public_safe(r, h) for r, h in sample_pages], SUBGATE_REMEDIABLE)
    )

    # Jargon: the pre-existing opt-in scan, now one subgate among many. It stays
    # opt-in because 16 already-approved families document CONFENGE's epistemic
    # vocabulary as explained editorial voice (politica-editorial), which is not
    # a leak. See data/organic/public-family-registry.json.
    if family.get("editorial_jargon_strict"):
        jargon_results = []
        for route, html in sample_pages:
            hits = [m.group(1) for m in EDITORIAL_JARGON_RE.finditer(_strip_html_preserve_visibility(html))]
            jargon_results.append(
                Subgate(
                    "jargon",
                    not hits,
                    SUBGATE_REMEDIABLE,
                    f"{route}: raw internal tokens in visible copy: {sorted(set(hits))[:5]}"
                    if hits
                    else f"{route}: clean",
                )
            )
        subgates.append(worst("jargon_free", jargon_results, SUBGATE_REMEDIABLE))
    else:
        subgates.append(
            Subgate(
                "jargon_free",
                True,
                SUBGATE_REMEDIABLE,
                "family not opted into editorial_jargon_strict; its epistemic "
                "vocabulary is documented editorial voice, not a leak",
                applicable=False,
            )
        )

    answer_first: list[Subgate] = []
    substantive: list[Subgate] = []
    specific: list[Subgate] = []
    caveats: list[Subgate] = []
    cta: list[Subgate] = []
    verdicts: list[Subgate] = []
    for route, html in sample_pages:
        answer_first.append(_answer_first(route, html))
        text = visible_main_text(html)
        words = len(re.findall(r"\w+", text))
        substantive.append(
            Subgate(
                "substantive",
                words >= MIN_SUBSTANTIVE_WORDS,
                SUBGATE_REMEDIABLE,
                f"{route}: {words} words",
            )
        )
        concrete = len(set(m.group(0) for m in _CONCRETE_SPECIFIC_RE.finditer(text)))
        specific.append(
            Subgate(
                "specific_value",
                concrete >= MIN_CONCRETE_SPECIFICS,
                SUBGATE_REMEDIABLE,
                f"{route}: {concrete} concrete specifics (min {MIN_CONCRETE_SPECIFICS})",
                # A compliance or policy document earns its place by being
                # complete and current, not by carrying figures. Demanding
                # concrete specifics there is a category error, not a standard.
                applicable=str(family.get("profile")) != "trust_or_legal",
            )
        )
        caveats.append(_caveats_preserved(route, text))
        cta.append(_cta_subordinate(route, html, text))
        verdicts.append(_sub_named_gate_verdict(route, family, ctx))

    subgates.append(worst("answer_first", answer_first, SUBGATE_REMEDIABLE))
    subgates.append(worst("substantive", substantive, SUBGATE_REMEDIABLE))
    subgates.append(worst("specific_value", specific, SUBGATE_REMEDIABLE))
    subgates.append(worst("caveats_preserved", caveats, SUBGATE_REMEDIABLE))
    subgates.append(worst("cta_subordinate", cta, SUBGATE_REMEDIABLE))
    subgates.append(worst("named_gate_verdict", verdicts, SUBGATE_REMEDIABLE))

    # Doorway test across the archetype itself: if the sample's own pages are
    # near-identical, the archetype is a template, whatever any single page says.
    if len(sample_pages) >= 2:
        shingles = [(r, _shingle_set(visible_main_text(h))) for r, h in sample_pages]
        worst_score, pair = 0.0, ("", "")
        for i in range(len(shingles)):
            for j in range(i + 1, len(shingles)):
                score = _jaccard(shingles[i][1], shingles[j][1])
                if score > worst_score:
                    worst_score, pair = score, (shingles[i][0], shingles[j][0])
        subgates.append(
            Subgate(
                "not_doorway",
                worst_score < FAMILY_CLONE_JACCARD,
                SUBGATE_MATERIAL,
                f"max intra-archetype jaccard{SHINGLE_N}={worst_score:.3f} {pair}",
            )
        )
    else:
        subgates.append(
            Subgate(
                "not_doorway",
                True,
                SUBGATE_MATERIAL,
                "single sampled page",
                applicable=False,
            )
        )

    subgates.append(_regression_fixtures(family, sample_pages, ctx))

    blocking = [s.name for s in subgates if s.applicable and not s.passed]
    material = [
        s.name for s in subgates if s.applicable and not s.passed and s.severity == SUBGATE_MATERIAL
    ]
    return (
        not blocking,
        {
            "schema": INDEXATION_EVIDENCE_SCHEMA,
            "family": fid,
            "sample": [r for r, _ in sample_pages],
            "subgates": {s.name: s.to_dict() for s in subgates},
            "blocking": blocking,
            "material": material,
        },
    )


def _answer_first(route: str, html: str) -> Subgate:
    main = _main_html(html) or html
    paragraphs = [
        _strip_html_preserve_visibility(m.group(1))
        for m in re.finditer(r"(?is)<p\b[^>]*>(.*?)</p>", main)
    ][:3]
    for paragraph in paragraphs:
        if len(paragraph) >= MIN_ANSWER_FIRST_CHARS and not CTA_PHRASE_RE.match(paragraph):
            return Subgate("answer_first", True, SUBGATE_REMEDIABLE, f"{route}: opens with an answer")
    if paragraphs:
        return Subgate(
            "answer_first",
            False,
            SUBGATE_REMEDIABLE,
            f"{route}: first 3 paragraphs are shorter than "
            f"{MIN_ANSWER_FIRST_CHARS} chars or open with a CTA",
        )
    opening = visible_main_text(html)[:ANSWER_FIRST_WINDOW_CHARS]
    return Subgate(
        "answer_first",
        len(opening) >= MIN_ANSWER_FIRST_CHARS,
        SUBGATE_REMEDIABLE,
        f"{route}: no <p> in <main>; opening is {len(opening)} chars",
    )


def _caveats_preserved(route: str, text: str) -> Subgate:
    if not CLAIM_NEEDING_CAVEAT_RE.search(text):
        return Subgate(
            "caveats_preserved",
            True,
            SUBGATE_REMEDIABLE,
            f"{route}: asserts no figure or epistemic label",
            applicable=False,
        )
    if CAVEAT_MARKER_RE.search(text):
        return Subgate("caveats_preserved", True, SUBGATE_REMEDIABLE, f"{route}: discloses a limit")
    return Subgate(
        "caveats_preserved",
        False,
        SUBGATE_REMEDIABLE,
        f"{route}: shows a figure or epistemic label with no limitation disclosed — "
        "removing raw jargon must not remove the uncertainty it carried",
    )


def _cta_subordinate(route: str, html: str, text: str) -> Subgate:
    """The terminal action must close the page, not be the page.

    Counts the attributed CTAs the conversion gate itself recognises
    (``data-cta-id`` anchors and lead forms inside ``<main>``) and the share of
    visible text they occupy. A family whose declared terminal_action is
    ``none`` owes no CTA and cannot fail here for having one CTA too few.
    """
    main = _main_html(html) or html
    anchors = re.findall(r"(?is)<a\b[^>]*\bdata-cta-id=[^>]*>.*?</a>", main)
    forms = re.findall(
        r'(?is)<form\b[^>]*action=["\']/\.netlify/functions/lead["\'][^>]*>.*?</form>', main
    )
    cta_count = len(anchors) + len(forms)
    words = max(1, len(re.findall(r"\w+", text)))
    allowed = max(3, words // 400)
    cta_chars = sum(len(_strip_html_preserve_visibility(block)) for block in anchors + forms)
    share = cta_chars / max(1, len(text))
    if cta_count > allowed:
        return Subgate(
            "cta_subordinate",
            False,
            SUBGATE_REMEDIABLE,
            f"{route}: {cta_count} CTAs in <main> for {words} words (max {allowed})",
        )
    if share > 0.35:
        return Subgate(
            "cta_subordinate",
            False,
            SUBGATE_REMEDIABLE,
            f"{route}: CTA blocks are {share:.0%} of the visible text",
        )
    return Subgate(
        "cta_subordinate",
        True,
        SUBGATE_REMEDIABLE,
        f"{route}: {cta_count} CTAs, {share:.0%} of the text",
    )


def _regression_fixtures(
    family: dict[str, Any],
    sample_pages: list[tuple[str, str]],
    ctx: IndexationContext,
) -> Subgate:
    """Where a golden fixture recorded findings, they must actually be gone.

    The Live Intelligence surfaces have a captured fixture set
    (scripts/contract_analysis/fixtures/live-intelligence-regression) taken at a
    known SHA. A fixture that still reproduces its recorded jargon on the live
    page means the archetype has not moved, whatever the current copy claims.
    """
    fid = str(family.get("id") or "")
    manifest_path = (
        ctx.base
        / "scripts/contract_analysis/fixtures/live-intelligence-regression/MANIFEST.json"
    )
    if not fid.startswith("live-intelligence") or not manifest_path.is_file():
        return Subgate(
            "regression_fixtures",
            True,
            SUBGATE_REMEDIABLE,
            "no golden fixture set declared for this family",
            applicable=False,
        )
    manifest = _read_json(manifest_path)
    captured = {
        str(entry.get("source_path")): str(entry.get("file"))
        for entry in manifest.get("fixtures") or []
        if entry.get("source_path")
    }
    still_failing: list[str] = []
    checked = 0
    for route, html in sample_pages:
        source = route.strip("/") + "/index.html" if route != "/" else "index.html"
        if source not in captured:
            continue
        checked += 1
        if EDITORIAL_JARGON_RE.search(_strip_html_preserve_visibility(html)):
            still_failing.append(source)
    if not checked:
        return Subgate(
            "regression_fixtures",
            True,
            SUBGATE_REMEDIABLE,
            f"sample matches no captured fixture (manifest sha "
            f"{manifest.get('captured_from_git_sha', '')[:8]})",
            applicable=False,
        )
    if still_failing:
        return Subgate(
            "regression_fixtures",
            False,
            SUBGATE_REMEDIABLE,
            f"{len(still_failing)}/{checked} captured pages still reproduce their "
            f"recorded jargon findings: {still_failing[:2]}",
        )
    return Subgate(
        "regression_fixtures",
        True,
        SUBGATE_REMEDIABLE,
        f"{checked} captured pages no longer reproduce their recorded findings",
    )


# --- gate drivers -----------------------------------------------------------


def gate_archetype_editorial_ready(root: Path | None = None) -> GateReport:
    """Composite archetype verdict per declared family.

    Runs :func:`archetype_editorial_ready_for_family` over every declared
    family's own deterministic sample. A material failure (unsafe copy, an
    explicit named-gate REJECT, or a doorway archetype) is an error and means
    withdraw; every other failing subgate is a warning and means remediate.
    """
    ctx = build_indexation_context(root)
    findings: list[Finding] = []
    verdicts: dict[str, Any] = {}
    ready = 0
    for family in ctx.families:
        fid = str(family.get("id") or "")
        if not fid:
            continue
        ok, detail = archetype_editorial_ready_for_family(family, context=ctx)
        verdicts[fid] = {
            "ready": ok,
            "sample": detail.get("sample"),
            "blocking": detail.get("blocking"),
            "material": detail.get("material"),
        }
        if ok:
            ready += 1
            continue
        sample = detail.get("sample") or []
        path = (
            str((ctx.path_by_route[sample[0]]).relative_to(ctx.base))
            if sample and sample[0] in ctx.path_by_route
            else FAMILY_REGISTRY_REL
        )
        for name in detail.get("blocking") or []:
            subgate = (detail.get("subgates") or {}).get(name) or {}
            material = name in (detail.get("material") or [])
            findings.append(
                Finding(
                    gate="archetype_editorial_ready",
                    path=path,
                    reason=f"archetype_{name}_failed",
                    excerpt=f"family={fid} {subgate.get('detail', '')}"[:400],
                    severity="error" if material else "warn",
                )
            )
    errors = [f for f in findings if f.severity == "error"]
    return GateReport(
        ok=len(errors) == 0,
        findings=findings,
        stats={
            "schema": INDEXATION_EVIDENCE_SCHEMA,
            "families": len(verdicts),
            "archetype_ready": ready,
            "archetype_not_ready": len(verdicts) - ready,
            "materially_rejected": sorted(
                fid for fid, v in verdicts.items() if v["material"]
            ),
            "verdicts": verdicts,
        },
    )


def gate_instance_index_ready(root: Path | None = None) -> GateReport:
    """Per-instance index readiness, then a comparison with the public state.

    The verdict is computed first, from evidence only. Only afterwards is it
    compared with the robots meta and the governance record, which is what makes
    the two violations below meaningful:

    * ``noindex_suppresses_index_ready_instance`` — the instance independently
      earned an index slot and is still suppressed.
    * ``noindex_without_reason`` — the instance did not earn one and nobody
      recorded why it is out.

    An indexable route that did not earn its slot is reported as a warning
    (``indexable_without_evidence``): the remedy is evidence, and flipping it to
    noindex is a downstream editorial decision, not this gate's to take.
    """
    ctx = build_indexation_context(root)
    findings: list[Finding] = []

    governance = _read_json(ctx.base / NOINDEX_GOVERNANCE_REL)
    governance_by_family = {
        str(entry.get("family_id")): entry
        for entry in (governance.get("families") or [])
        if entry.get("family_id")
    }

    scanned = 0
    ready_count = 0
    noindex_count = 0
    index_ready_but_noindex: list[str] = []
    indexable_without_evidence: list[str] = []
    noindex_without_reason: list[str] = []
    blocking_histogram: Counter[str] = Counter()

    for route in sorted(ctx.html_by_route):
        html = ctx.html_by_route[route]
        family = ctx.route_family.get(route)
        scanned += 1
        ready, detail = instance_index_ready_for_route(route, html, family, ctx)
        for name in detail["blocking"]:
            blocking_histogram[name] += 1
        rel = str(ctx.path_by_route[route].relative_to(ctx.base))
        noindex = is_noindex(html)
        if noindex:
            noindex_count += 1
        if ready:
            ready_count += 1
            if noindex:
                index_ready_but_noindex.append(route)
                findings.append(
                    Finding(
                        gate="instance_index_ready",
                        path=rel,
                        reason="noindex_suppresses_index_ready_instance",
                        excerpt=(
                            f"{route} passed every instance subgate on its own evidence "
                            "and is still noindex"
                        ),
                    )
                )
            continue
        if not noindex:
            indexable_without_evidence.append(route)
            findings.append(
                Finding(
                    gate="instance_index_ready",
                    path=rel,
                    reason="indexable_without_evidence",
                    excerpt=f"{route} blocking={','.join(detail['blocking'])}",
                    severity="warn",
                )
            )
            continue
        fid = str((family or {}).get("id") or "")
        entry = governance_by_family.get(fid)
        if not (entry and entry.get("reason_code")):
            noindex_without_reason.append(route)
            findings.append(
                Finding(
                    gate="instance_index_ready",
                    path=rel,
                    reason="noindex_without_reason",
                    excerpt=(
                        f"{route} family={fid or '<undeclared>'} is noindex with no "
                        f"reason_code in {NOINDEX_GOVERNANCE_REL} "
                        f"(blocking={','.join(detail['blocking'])})"
                    ),
                )
            )

    errors = [f for f in findings if f.severity == "error"]
    return GateReport(
        ok=len(errors) == 0,
        findings=findings,
        stats={
            "schema": INDEXATION_EVIDENCE_SCHEMA,
            "scanned": scanned,
            "noindex": noindex_count,
            "instance_index_ready": ready_count,
            "index_ready_but_noindex": index_ready_but_noindex,
            "indexable_without_evidence": len(indexable_without_evidence),
            "noindex_without_reason": noindex_without_reason,
            "blocking_subgates": dict(blocking_histogram.most_common()),
        },
    )


def run_all_gates() -> dict[str, Any]:
    reports = {
        "naturalness": gate_naturalness(only_indexable=True),
        "index_surface": gate_index_surface(),
        "brand_shell": gate_brand_shell(),
        "conversion": gate_conversion(),
        "legacy_entity": gate_legacy_entity_matrix(),
        "similarity": gate_similarity_indexable(),
        "semantic_query_ownership": gate_semantic_query_ownership(),
        "bofu_buyer_decision_map": gate_bofu_buyer_decision_map(),
        "archetype_editorial_ready": gate_archetype_editorial_ready(),
        "instance_index_ready": gate_instance_index_ready(),
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
