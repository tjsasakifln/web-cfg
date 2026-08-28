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


def run_all_gates() -> dict[str, Any]:
    reports = {
        "naturalness": gate_naturalness(only_indexable=True),
        "index_surface": gate_index_surface(),
        "brand_shell": gate_brand_shell(),
        "conversion": gate_conversion(),
        "legacy_entity": gate_legacy_entity_matrix(),
        "similarity": gate_similarity_indexable(),
        "semantic_query_ownership": gate_semantic_query_ownership(),
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
