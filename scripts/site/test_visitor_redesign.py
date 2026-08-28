"""Visitor experience redesign gates — shipped HTML/CSS/generators + functional behavior."""
from __future__ import annotations

import json
import re
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.checklist_ui import ITEM_STEP, STEP_DEFS  # noqa: E402
from scripts.site.brand import load_brand  # noqa: E402
from scripts.site.inbound_first_remediate import (  # noqa: E402
    ALLOWED_STAGES,
    load_stage_classification,
    resolve_content_stage,
)
from scripts.site.public_ia import header_items  # noqa: E402
from scripts.site.public_navigation import (  # noqa: E402
    FROZEN_NAV_HTML_PATHS,
    audit_public_navigation_tree,
)

ALLOWED = frozenset(ALLOWED_STAGES)
EXPECTED_NAV = [item["label"] for item in header_items()]
LEGACY_NAV = [
    "Serviços",
    "Problemas que resolvemos",
    "Conteúdos",
    "Ferramentas",
    "Especialista",
]
EXPECTED_CTA = "Analisar meu caso"
BANNED_ZERO = (
    "0 guias",
    "1 guias",
    "Ver os 0 guias",
    "0 guias públicos neste tema",
    "0 guia público neste tema",
)
TECH_FALLBACK = "Sem JavaScript, as etapas aparecem em sequência abaixo"
INTERNAL_TAXONOMY = (
    "taxonomia interna",
    "guias indexáveis",
    "conteúdos indexáveis",
    "página-pilar",
    "frentes de decisão",
    "eixos integrados",
)


class _DirectoryItems(HTMLParser):
    """Parse hub directory items with data-stage / data-search / hidden."""

    def __init__(self) -> None:
        super().__init__()
        self.items: list[dict[str, str]] = []
        self._in_item = False
        self._cur: dict[str, str] | None = None
        self._capture_text = False
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if tag == "article" and "data-content-item" in ad:
            self._in_item = True
            self._cur = {
                "stage": ad.get("data-stage", ""),
                "search": ad.get("data-search", ""),
                "hidden": "1" if "hidden" in ad else "0",
                "href": "",
                "title": "",
            }
        if self._in_item and tag == "a" and self._cur is not None and not self._cur["href"]:
            self._cur["href"] = ad.get("href", "")
            self._capture_text = True
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if self._capture_text and tag == "a" and self._cur is not None:
            self._cur["title"] = "".join(self._buf).strip()
            self._capture_text = False
        if tag == "article" and self._in_item and self._cur is not None:
            self.items.append(self._cur)
            self._cur = None
            self._in_item = False

    def handle_data(self, data: str) -> None:
        if self._capture_text:
            self._buf.append(data)


class _DesktopNav(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_nav = False
        self.depth = 0
        self.labels: list[str] = []
        self.cta: str | None = None
        self._capture = False
        self._buf: list[str] = []
        self._is_cta = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        cls = ad.get("class", "")
        if tag == "nav" and "desktop-nav" in cls.split():
            self.in_nav = True
            self.depth = 1
            return
        if self.in_nav:
            if tag == "nav":
                self.depth += 1
            if tag == "a":
                self._capture = True
                self._buf = []
                self._is_cta = False
        if tag == "a" and "header-cta" in cls.split():
            self._capture = True
            self._buf = []
            self._is_cta = True

    def handle_endtag(self, tag: str) -> None:
        if self._capture and tag == "a":
            text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if self._is_cta:
                self.cta = text
            elif self.in_nav and text:
                self.labels.append(text)
            self._capture = False
            self._is_cta = False
        if self.in_nav and tag == "nav":
            self.depth -= 1
            if self.depth <= 0:
                self.in_nav = False

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buf.append(data)


class _LeadInlineHierarchyParser(HTMLParser):
    """Track actual elements with a ``lead-inline`` class in document order."""

    def __init__(self) -> None:
        super().__init__()
        self.has_main = False
        self.has_h1 = False
        self.has_lead_inline = False
        self.lead_before_main = False
        self.lead_before_h1 = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "main":
            self.has_main = True
        if tag == "h1":
            self.has_h1 = True

        classes = next((value or "" for key, value in attrs if key.lower() == "class"), "")
        if "lead-inline" not in classes.split():
            return
        self.has_lead_inline = True
        self.lead_before_main = self.lead_before_main or not self.has_main
        self.lead_before_h1 = self.lead_before_h1 or not self.has_h1


def _hub_html() -> str:
    return (ROOT / "conteudos" / "index.html").read_text(encoding="utf-8")


def _parse_hub_items() -> list[dict[str, str]]:
    p = _DirectoryItems()
    p.feed(_hub_html())
    return p.items


def _filter_items(
    items: list[dict[str, str]],
    *,
    stage: str = "all",
    query: str = "",
) -> list[dict[str, str]]:
    """Mirror shipped hub filter JS: stage ∩ text search."""
    q = query.strip().lower()
    out = []
    for it in items:
        st = it.get("stage") or ""
        hay = it.get("search") or ""
        stage_ok = stage == "all" or st == stage
        text_ok = not q or q in hay
        if stage_ok and text_ok:
            out.append(it)
    return out


def _public_html_files() -> list[Path]:
    """All public HTML under repo root (skip build mirrors, tooling, evidence)."""
    skip_parts = {
        "node_modules",
        ".git",
        "docs",
        "scripts",
        "data",
        "seo",
        "netlify",
        "__pycache__",
        ".well-known",
        "tmp",
        "coverage",
        "_site",  # build mirror; regenerated by assemble_public_artifact
        "public",
        ".grok",
        ".claude",  # local agent worktrees, never shipped
        ".worktrees",
    }
    out: list[Path] = []
    for p in ROOT.rglob("*.html"):
        rel = p.relative_to(ROOT)
        if any(part in skip_parts for part in rel.parts):
            continue
        # skip private ops-ish
        if rel.parts and rel.parts[0] in {"ops", "private"}:
            continue
        out.append(p)
    return out


def _nav_from(path: Path) -> tuple[list[str], str | None]:
    html = path.read_text(encoding="utf-8", errors="replace")
    parser = _DesktopNav()
    parser.feed(html)
    return parser.labels, parser.cta


# ---------------------------------------------------------------------------
# Stage classification (versioned, deterministic)
# ---------------------------------------------------------------------------


def test_stage_classification_versioned_and_complete():
    data = load_stage_classification()
    assert data.get("schema_version") == 1
    assert data.get("classification_version")
    assert set(data.get("allowed_stages") or []) == ALLOWED
    pillars = data.get("pillar_to_stage") or {}
    for pillar, stage in pillars.items():
        assert stage in ALLOWED, (pillar, stage)
    # Every public indexable guide resolves (count comes from the remediator owner)
    from scripts.site.inbound_first_remediate import indexable_map

    expected = sum(1 for v in indexable_map().values() if v)
    items = _parse_hub_items()
    assert len(items) == expected, f"expected {expected} public hub items, got {len(items)}"
    for it in items:
        slug = (it.get("href") or "").rstrip("/").split("/")[-1]
        assert it["stage"] in ALLOWED
        # generator must not leave empty
        assert it["stage"], f"empty stage for {slug}"


def test_hub_all_items_nonempty_allowed_stages():
    items = _parse_hub_items()
    assert items, "hub directory empty"
    bad = [it for it in items if not it["stage"] or it["stage"] not in ALLOWED]
    assert not bad, f"invalid stages: {bad[:5]}"
    assert 'data-stage=""' not in _hub_html()


def test_hub_filters_expected_sets():
    from scripts.site.inbound_first_remediate import indexable_map

    items = _parse_hub_items()
    all_items = _filter_items(items, stage="all")
    expected = sum(1 for v in indexable_map().values() if v)
    assert len(all_items) == expected
    for stage in ("antes", "durante", "conflito"):
        subset = _filter_items(items, stage=stage)
        assert len(subset) >= 1, f"stage {stage} empty"
        for it in subset:
            assert it["stage"] == stage
        # no leakage: items of other stages excluded
        others = [it for it in items if it["stage"] != stage]
        leaked = [it for it in others if it in subset]
        assert not leaked


def test_hub_search_and_filter_intersection():
    items = _parse_hub_items()
    # Pick a word unique-ish from a durante item
    durante = _filter_items(items, stage="durante")
    assert durante
    # Use a token from first durante search haystack
    hay = durante[0]["search"]
    token = next((t for t in re.split(r"\W+", hay) if len(t) >= 5), "aditivo")
    combo = _filter_items(items, stage="durante", query=token)
    # Intersection correctness: every result matches both constraints
    for it in combo:
        assert it["stage"] == "durante"
        assert token in it["search"]
    # Clearing query with stage preserved returns full stage set
    restored = _filter_items(items, stage="durante", query="")
    assert len(restored) == len(durante)
    # Empty combo possible without crashing (hard query)
    empty = _filter_items(items, stage="antes", query="zzzz-nao-existe-xyz")
    assert empty == []


def test_hub_filter_markup_and_a11y():
    hub = _hub_html()
    assert 'data-dir-filter="antes"' in hub
    assert 'data-dir-filter="durante"' in hub
    assert 'data-dir-filter="conflito"' in hub
    assert 'data-results-count' in hub
    assert 'aria-live="polite"' in hub
    assert "data-directory-empty" in hub
    # Filter JS must combine stage + search (not search alone)
    assert "data-dir-filter" in hub
    assert "stageOk" in hub or "data-stage" in hub
    assert "Nenhuma análise encontrada" in hub


def test_resolve_content_stage_deterministic():
    a = resolve_content_stage(slug="bdi-obra-publica", pillar="auditoria-orcamento-licitacao")
    b = resolve_content_stage(slug="bdi-obra-publica", pillar="auditoria-orcamento-licitacao")
    assert a == b == "antes"
    assert (
        resolve_content_stage(
            slug="resposta-notificacao-atraso-obra-publica",
            pillar="defesa-tecnica-contratos-publicos",
        )
        == "conflito"
    )


# ---------------------------------------------------------------------------
# Zero guides — global public HTML scan
# ---------------------------------------------------------------------------


def test_global_no_zero_or_one_guias_plural_bugs():
    failures: list[str] = []
    for path in _public_html_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        lower = text.lower()
        n_items = len(re.findall(r'class="[^"]*library-item', text))
        for phrase in BANNED_ZERO:
            if phrase.lower() in lower:
                failures.append(f"{path.relative_to(ROOT)}: {phrase}")
        if re.search(r"ver os\s+0\s+guias", lower):
            failures.append(f"{path.relative_to(ROOT)}: Ver os 0 guias (regex)")
        # When the page has no public library cards, ban #guias / "Ver os" CTAs entirely
        if n_items == 0:
            if re.search(r'href=["\']#guias["\']', text, re.I):
                failures.append(f"{path.relative_to(ROOT)}: href=#guias with zero library-item")
            if re.search(r"\bver os\b", lower):
                failures.append(f"{path.relative_to(ROOT)}: Ver os CTA with zero library-item")
            # Residue after "0" strip: "Ver os" then icon/end
            if re.search(r">\s*ver os\s*<", lower):
                failures.append(f"{path.relative_to(ROOT)}: orphan Ver os fragment")
    assert not failures, failures[:30]


def test_global_no_empty_library_sections():
    """Any library-section in public HTML must contain ≥1 library-item."""
    failures: list[str] = []
    for path in _public_html_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r'<section\b[^>]*\blibrary-section\b[^>]*>.*?</section>',
            text,
            flags=re.S | re.I,
        ):
            block = m.group(0)
            if not re.search(r'class="[^"]*library-item', block):
                failures.append(f"{path.relative_to(ROOT)}: empty library-section")
        # empty-state copy for libraries is also banned
        if re.search(r"nenhum conteúdo indexável", text, re.I):
            failures.append(f"{path.relative_to(ROOT)}: empty library copy")
    assert not failures, failures[:30]


def test_empty_pillar_no_library_or_counter():
    pillar = ROOT / "acompanhamento-contratos-obras" / "index.html"
    assert pillar.exists()
    html = pillar.read_text(encoding="utf-8")
    assert "0 guias" not in html.lower()
    assert not re.search(r"\b0\s+guias?\b", html, re.I)
    # no library section at all when empty
    assert "library-section" not in html
    assert "library-item" not in html
    # no CTA to empty list — SVG-tolerant
    assert not re.search(r'href=["\']#guias["\']', html, re.I)
    assert not re.search(r"Ver os\b", html, re.I)
    # still presents technical theme + case action
    assert "Gestão contratual" in html or "gestão contratual" in html.lower()
    assert "Analisar meu caso" in html or "wa.me" in html or "/#contato" in html


def test_strip_empty_library_generator_unit():
    """Drive the shipped strip helper (not a reimplementation)."""
    from scripts.site.inbound_first_remediate import strip_empty_library_surface

    sample = (
        '<div class="hero-actions">'
        '<a class="button button-primary" href="/#contato">Analisar</a>'
        '<a class="text-link" href="#guias">Ver os <svg class="icon"></svg></a>'
        "</div>"
        '<section class="section library-section" id="guias">'
        "<div class=\"container\"><p>Nenhum conteúdo indexável neste hub ainda</p></div>"
        "</section>"
        '<p class="pillar-evidence-count"><strong>0</strong> guias públicos neste tema</p>'
    )
    out = strip_empty_library_surface(sample)
    assert "#guias" not in out
    assert "Ver os" not in out
    assert "library-section" not in out
    assert "0 guias" not in out.lower()
    assert "Nenhum conteúdo" not in out
    assert "Analisar" in out


def test_public_taxonomy_jargon_absent():
    surfaces = list(_public_html_files())
    failures = []
    for path in surfaces:
        text = path.read_text(encoding="utf-8", errors="replace")
        lower = text.lower()
        for phrase in INTERNAL_TAXONOMY:
            if phrase.lower() in lower:
                # allow "taxonomia" only if negating in hub lead is intentional —
                # objective bans "taxonomia interna" in public UI
                failures.append(f"{path.relative_to(ROOT)}: {phrase}")
        for phrase in ("0 guias", "1 guias", "Wave 1", "arquitetura de conteúdo"):
            if phrase.lower() in lower:
                failures.append(f"{path.relative_to(ROOT)}: {phrase}")
    assert not failures, failures[:40]


# ---------------------------------------------------------------------------
# Global shell consistency
# ---------------------------------------------------------------------------


def test_global_shell_nav_contracts_are_explicit_during_frozen_window():
    brand = load_brand()
    brand_labels = [n["label"] for n in (brand.get("navigation") or {}).get("desktop") or []]
    assert brand_labels == EXPECTED_NAV
    cta_meta = (brand.get("navigation") or {}).get("cta") or {}
    assert cta_meta.get("label") == EXPECTED_CTA
    assert "#formulario-contato" in (cta_meta.get("href") or ""), (
        f"brand CTA must target the form, got {cta_meta.get('href')!r}"
    )

    surfaces = [
        ROOT / "index.html",
        ROOT / "entregas" / "index.html",
        ROOT / "conteudos" / "index.html",
        ROOT / "medicoes-glosas-obras-publicas" / "index.html",
        ROOT / "aditivos-obras-publicas" / "index.html",
        ROOT / "acompanhamento-contratos-obras" / "index.html",
        ROOT / "ferramentas" / "index.html",
        ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
        ROOT / "ferramentas" / "checklist-reequilibrio" / "index.html",
        ROOT / "ferramentas" / "matriz-atraso-obra" / "index.html",
        ROOT / "diagnostico-b2g-360" / "index.html",
        ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
    ]
    # one editorial article if present
    sample_article = next(
        (p for p in sorted((ROOT / "conteudos").glob("*/index.html")) if p.is_file()),
        None,
    )
    if sample_article:
        surfaces.append(sample_article)
    # editorial checklist page
    checklist = ROOT / "guias-contratos-obras" / "checklist-pedido-aditivo" / "index.html"
    if checklist.exists():
        surfaces.append(checklist)

    failures = []
    nav_runtime = (ROOT / "js" / "modules" / "nav.js").read_text(encoding="utf-8")
    if "toolsLink.textContent = 'Entregas'" in nav_runtime:
        failures.append("global runtime must not mutate frozen navigation")
    direct_deliverables = {
        ROOT / "index.html",
        ROOT / "entregas" / "index.html",
    }
    for path in surfaces:
        if not path.exists():
            failures.append(f"missing {path.relative_to(ROOT)}")
            continue
        labels, cta = _nav_from(path)
        if not labels:
            failures.append(f"{path.relative_to(ROOT)}: no desktop-nav labels")
            continue
        relative_path = path.relative_to(ROOT).as_posix()
        if relative_path in FROZEN_NAV_HTML_PATHS:
            expected = LEGACY_NAV
        elif path in direct_deliverables:
            expected = EXPECTED_NAV
        else:
            expected = None
        if expected is not None and labels != expected:
            failures.append(
                f"{path.relative_to(ROOT)}: expected source nav {expected}, got {labels}"
            )
        if cta and cta != EXPECTED_CTA:
            failures.append(f"{path.relative_to(ROOT)}: cta {cta!r}")
        html = path.read_text(encoding="utf-8", errors="replace")
        header_cta = re.search(
            r'<a\b[^>]*\bheader-cta\b[^>]*href="([^"]+)"|'
            r'<a\b[^>]*href="([^"]+)"[^>]*\bheader-cta\b',
            html,
        )
        if header_cta:
            href = header_cta.group(1) or header_cta.group(2)
            if "#formulario-contato" not in href:
                failures.append(
                    f"{path.relative_to(ROOT)}: header-cta href {href!r} not form"
                )
        mobile = re.search(
            r'<nav\b[^>]*\bmobile-nav\b[^>]*>(.*?)</nav>', html, re.S | re.I
        )
        if mobile:
            mcta = re.search(
                r'<a\b[^>]*href="([^"]+)"[^>]*>\s*Analisar meu caso\s*</a>',
                mobile.group(1),
            )
            if mcta and "#formulario-contato" not in mcta.group(1):
                failures.append(
                    f"{path.relative_to(ROOT)}: mobile Analisar href {mcta.group(1)!r}"
                )
        for banned in (
            "Analisar licitação",
            "Proteger contrato",
            "Operação B2G",
            "Falar com a CONFENGE",
        ):
            # CTA label must not be old "Falar com a CONFENGE" in header
            if banned == "Falar com a CONFENGE":
                if re.search(
                    r'header-cta[^>]*>\s*Falar com a CONFENGE\s*<', html
                ) or re.search(
                    r'class="button button-primary header-cta"[^>]*>Falar com a CONFENGE',
                    html,
                ):
                    failures.append(f"{path.relative_to(ROOT)}: old header CTA")
            elif banned in html and "desktop-nav" in html:
                # old commercial labels must not appear in nav region
                nav_m = re.search(
                    r'class="desktop-nav"[^>]*>(.*?)</nav>', html, re.S
                )
                if nav_m and banned in nav_m.group(1):
                    failures.append(f"{path.relative_to(ROOT)}: old nav {banned}")

    artifact_root = ROOT / "_site"
    if artifact_root.exists():
        try:
            audit_public_navigation_tree(artifact_root)
        except ValueError as error:
            failures.append(f"public artifact navigation: {error}")
    assert not failures, failures


# ---------------------------------------------------------------------------
# Tools hub redesign
# ---------------------------------------------------------------------------


def test_tools_hub_situation_first():
    hub = (ROOT / "ferramentas" / "index.html").read_text(encoding="utf-8")
    assert "Preciso conferir um aditivo" in hub
    assert "Preciso organizar um pedido de reequilíbrio" in hub
    assert "Preciso registrar e analisar atrasos" in hub
    assert "Usar ferramenta" in hub
    assert hub.count("Usar ferramenta") >= 3
    assert "tool-situation--recommended" in hub or "Recomendada" in hub
    # no seven-metadata inventory list
    assert "tool-card-meta" not in hub
    assert hub.count("Estado só no navegador") <= 1  # at most in single disclaimer
    # first-read fields present
    assert "Problema resolvido" in hub
    assert "Resultado entregue" in hub
    assert "Tempo aproximado" in hub
    # single end disclaimer
    assert hub.count("tool-disclaimer") == 1


def test_limit_tool_staged_structure():
    page = (
        ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html"
    ).read_text(encoding="utf-8")
    assert 'data-limite-step="1"' in page
    assert 'data-limite-step="2"' in page
    assert 'data-limite-step="3"' in page
    assert "Base do contrato" in page
    assert "Histórico formalizado" in page
    assert "Alteração em análise" in page
    assert "data-axis-visual" in page or "tool-axis-visual" in page
    assert "data-precalc-summary" in page
    assert "tool-result-dominant" in page or "tool-result-highlights" in page
    # low-emphasis reset
    assert "tool-text-action" in page
    assert "Apagar respostas" in page
    # copy/download/print after result container
    assert 'id="ra"' in page and "hidden" in page
    # compute still wired
    assert "computeLimiteAditivo" in page
    # no competing primary reset button class on reset
    assert re.search(
        r'id="btn-reset"[^>]*class="tool-text-action"|class="tool-text-action"[^>]*id="btn-reset"',
        page,
    )


# ---------------------------------------------------------------------------
# Checklist semantic map + progressive UX
# ---------------------------------------------------------------------------


def test_checklist_item_step_map_complete():
    assert len(ITEM_STEP) == 36
    assert len(set(ITEM_STEP)) == 36
    assert set(ITEM_STEP.keys()) == {f"ad-{i:02d}" for i in range(1, 37)}
    assert set(ITEM_STEP.values()) == {1, 2, 3, 4}
    # balanced-ish: each step has ≥4 and ≤15
    from collections import Counter

    c = Counter(ITEM_STEP.values())
    for step, n in c.items():
        assert 4 <= n <= 15, f"step {step} has {n} items"
    titles = {s["num"]: s["title"] for s in STEP_DEFS}
    assert titles[1] == "Identificação e fundamento"
    assert titles[2] == "Planilha, preço e impacto"
    assert titles[3] == "Provas e comunicações"
    assert "Exceções" in titles[4] or "bloqueios" in titles[4].lower()


def test_checklist_rendered_page_semantics():
    src = (ROOT / "scripts" / "editorial" / "checklist_ui.py").read_text(encoding="utf-8")
    assert "ITEM_STEP" in src
    assert TECH_FALLBACK not in src
    assert "habilite o JavaScript" in src
    assert "<noscript>" in src

    page = ROOT / "guias-contratos-obras" / "checklist-pedido-aditivo" / "index.html"
    if not page.exists():
        return
    html = page.read_text(encoding="utf-8")
    if "data-aditivo-checklist" not in html:
        return
    assert TECH_FALLBACK not in html
    assert html.count("data-tool-step") >= 4
    ids = re.findall(r'data-req-id="(ad-\d+)"', html)
    assert len(ids) == 36, f"expected 36 req ids, got {len(ids)}"
    assert len(set(ids)) == 36
    assert "Iniciar diagnóstico" in html
    assert "Ver diagnóstico" in html
    assert "Atualizar diagnóstico" not in html
    # progressive: script hides non-active after start
    assert "is-started" in html or "showStep" in html
    assert "data-step-prev" in html and "data-step-next" in html


def test_checklist_progressive_source():
    src = (ROOT / "scripts" / "editorial" / "checklist_ui.py").read_text(encoding="utf-8")
    assert "Iniciar diagnóstico" in src
    assert "Ver diagnóstico" in src
    assert "data-tool-step" in src
    assert "Atualizar diagnóstico" not in src
    assert "Identificação e fundamento" in src
    assert "Planilha, preço e impacto" in src
    assert "Exceções, bloqueios e revisão" in src or "Bloqueios" in src
    assert TECH_FALLBACK not in src


def test_no_visible_technical_js_fallback():
    surfaces = [
        ROOT / "guias-contratos-obras" / "checklist-pedido-aditivo" / "index.html",
        ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
        ROOT / "ferramentas" / "checklist-reequilibrio" / "index.html",
    ]
    for path in surfaces:
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        assert TECH_FALLBACK not in html, path
        # noscript ok with plain language
        if "<noscript>" in html:
            assert "habilite o JavaScript" in html or "JavaScript" in html


# ---------------------------------------------------------------------------
# Home / hub structure (existing)
# ---------------------------------------------------------------------------


def test_hub_problem_first_structure():
    hub = _hub_html()
    assert "Qual problema de licitação ou contrato você precisa resolver?" in hub
    assert "data-hub-search" in hub or "hub-search" in hub
    assert "Antes de contratar" in hub
    assert "Durante a execução" in hub
    assert "Quando há conflito" in hub
    assert "featured-lead" in hub or "featured-decision" in hub
    assert 'class="hub-metrics"' not in hub
    assert "cluster-card" not in hub or hub.count("cluster-card") == 0


def test_home_nav_and_hierarchy():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Analisar meu caso" in home
    assert "Edital e proposta" in home
    assert "Contrato sob pressão" in home
    assert "Operação recorrente" in home
    assert "Conteúdos" in home
    assert "Ferramentas" in home
    assert "Conteúdos e ferramentas" not in home
    labels, _ = _nav_from(ROOT / "index.html")
    assert labels == EXPECTED_NAV
    assert 'href="/entregas/"' in home
    assert "Conheça nossas entregas" in home
    assert home.count("button-primary") <= 4
    hero = re.search(r'class="hero[\s\S]*?</section>', home)
    assert hero and hero.group(0).count("button-primary") == 1
    assert "journey-row" in home or "journey-path" in home
    assert "Edital ou proposta crítica" in home
    assert "Contrato sob pressão" in home
    assert "Operação recorrente" in home
    assert "data-evidence-selector" in home
    assert "data-evidence-selector" not in hero.group(0)


# ---------------------------------------------------------------------------
# Promotional lead-inline hierarchy (#181 measured it, #299 made the guard sitewide)
# ---------------------------------------------------------------------------

# #181 measured the cost on these routes at 390x844: the <aside class="lead-inline">
# band took about 260 px and pushed <main> to y ~= 386, so the visitor met an offer
# before the breadcrumb, the H1 and the page's explanation. They stay named only as
# regression anchors. The guard itself derives its scope from the shipped HTML (#299),
# so a page published tomorrow is covered without anyone editing this file.
LEAD_INLINE_MEASURED_ROUTES = (
    "aditivos-obras-publicas/index.html",
    "atrasos-prorrogacao-obras-publicas/index.html",
    "auditoria-orcamento-licitacao/index.html",
    "medicoes-glosas-obras-publicas/index.html",
    "reequilibrio-obras-publicas/index.html",
    "conteudos/limite-aditivo-25-50-obra-publica/index.html",
)

# Public pages allowed to ship lead-inline above <main>/<h1>, each with a written
# reason. Empty on purpose: the scope of this guard is never narrowed to hide a page.
LEAD_INLINE_HIERARCHY_EXCEPTIONS: dict[str, str] = {}

# #306 repaired every page registered by #299. The expected set is deliberately
# empty: any future page that loses its closing main tag fails closed.
TRUNCATED_BEFORE_MAIN_CLOSE = frozenset()


def _lead_inline_pages() -> list[Path]:
    """Every shipped public page that carries the promotional lead-inline class."""
    pages: list[Path] = []
    for path in _public_html_files():
        parser = _LeadInlineHierarchyParser()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        if parser.has_lead_inline:
            pages.append(path)
    return sorted(pages)


def _lead_inline_hierarchy_failures(rel: str, html: str) -> list[str]:
    """Hierarchy violations for one page.

    Pure on (rel, html) so the same assertion drives both the shipped pages and the
    synthetic page in test_lead_inline_guard_catches_a_newly_published_page.
    """
    parser = _LeadInlineHierarchyParser()
    parser.feed(html)
    if not parser.has_lead_inline:
        return []
    if not parser.has_main:
        return [f"{rel}: page has lead-inline but no <main"]
    if not parser.has_h1:
        return [f"{rel}: page has lead-inline but no <h1"]
    failures: list[str] = []
    if parser.lead_before_main:
        failures.append(f"{rel}: lead-inline appears before <main")
    if parser.lead_before_h1:
        failures.append(f"{rel}: lead-inline appears before first <h1")
    return failures


def test_lead_inline_not_before_main_or_h1():
    """Promotional lead-inline must not sit between site header and main/H1.

    #299: the scope comes from the shipped HTML, not from a hand-written route list,
    so every page that contains the class is checked and a seventh route cannot
    reintroduce the #181 defect with CI green.
    """
    pages = _lead_inline_pages()
    assert len(pages) >= 150, (
        f"lead-inline scan collapsed to {len(pages)} pages; the guard must stay sitewide"
    )
    relatives = {path.relative_to(ROOT).as_posix() for path in pages}
    dropped = [route for route in LEAD_INLINE_MEASURED_ROUTES if route not in relatives]
    assert not dropped, f"#181 routes fell out of the derived scope: {dropped}"

    failures: list[str] = []
    for path in pages:
        rel = path.relative_to(ROOT).as_posix()
        page_failures = _lead_inline_hierarchy_failures(
            rel, path.read_text(encoding="utf-8", errors="replace")
        )
        if page_failures and rel in LEAD_INLINE_HIERARCHY_EXCEPTIONS:
            continue
        failures.extend(page_failures)
    assert not failures, (
        f"lead-inline hoisted above the page hierarchy in {len(failures)} place(s):\n"
        + "\n".join(failures[:20])
    )

    invalid_reasons = [
        rel
        for rel, reason in LEAD_INLINE_HIERARCHY_EXCEPTIONS.items()
        if not reason.strip()
    ]
    assert not invalid_reasons, (
        f"lead-inline exceptions require a written reason: {invalid_reasons}"
    )
    stale = [
        rel
        for rel in LEAD_INLINE_HIERARCHY_EXCEPTIONS
        if rel not in relatives
        or not _lead_inline_hierarchy_failures(
            rel, (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        )
    ]
    assert not stale, f"registered lead-inline exceptions no longer apply: {stale}"


def test_lead_inline_guard_catches_a_newly_published_page():
    """A page published after this test still fails CI without editing the test.

    Two halves: the assertion itself rejects the #181 shape, and the scope is read
    from disk, so simply shipping the file is enough to be caught.
    """
    offending = (
        '<header class="site-header"></header>'
        '<aside class="lead-inline">Oferta</aside>'
        '<main id="conteudo"><h1>Titulo</h1><p>Resposta</p></main>'
    )
    assert _lead_inline_hierarchy_failures("novo/index.html", offending) == [
        "novo/index.html: lead-inline appears before <main",
        "novo/index.html: lead-inline appears before first <h1",
    ]
    compliant = (
        '<header class="site-header"></header>'
        '<main id="conteudo"><h1>Titulo</h1><p>Resposta</p>'
        '<aside class="lead-inline">Oferta</aside></main>'
    )
    assert not _lead_inline_hierarchy_failures("novo/index.html", compliant)

    incidental_text = (
        '<style>.lead-inline{display:block}</style><!-- lead-inline -->'
        '<aside class="lead-inline-note">Nota</aside>'
        '<main id="conteudo"><h1>Titulo</h1><p>Resposta</p>'
        '<aside class="lead-inline">Oferta</aside></main>'
    )
    assert not _lead_inline_hierarchy_failures("novo/index.html", incidental_text), (
        "CSS, comments and partial class names must not look like lead-inline elements"
    )

    with tempfile.TemporaryDirectory(prefix="_lead_inline_guard_probe_", dir=ROOT) as raw_dir:
        probe_dir = Path(raw_dir)
        probe = probe_dir / "index.html"
        probe.write_text(offending, encoding="utf-8")
        discovered = {path.relative_to(ROOT).as_posix() for path in _lead_inline_pages()}
        assert probe.relative_to(ROOT).as_posix() in discovered, (
            "a newly published page with lead-inline is outside the derived scope"
        )


def test_no_public_page_truncated_before_main_close():
    """#299/#306: no shipped public page may stop before </main>."""
    observed: set[str] = set()
    for path in _public_html_files():
        html = path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"<main\b", html, re.I) and not re.search(r"</main\s*>", html, re.I):
            observed.add(path.relative_to(ROOT).as_posix())
    assert observed == set(TRUNCATED_BEFORE_MAIN_CLOSE), (
        "truncated public pages changed; repair the page or update the register.\n"
        f"new: {sorted(observed - set(TRUNCATED_BEFORE_MAIN_CLOSE))}\n"
        f"repaired: {sorted(set(TRUNCATED_BEFORE_MAIN_CLOSE) - observed)}"
    )


_ANCHOR = re.compile(r"<a\b[^>]*>[\s\S]*?</a>", re.I)


def _cta_anchors(fragment: str) -> list[tuple[str, str]]:
    """(href, visible label) for CTA-looking anchors, in document order."""
    out: list[tuple[str, str]] = []
    for m in _ANCHOR.finditer(fragment):
        tag = m.group(0)
        head = tag[: tag.index(">") + 1]
        if "button" not in head and "text-link" not in head:
            continue
        href = re.search(r'href="([^"]*)"', head)
        label = " ".join(re.sub(r"<[^>]+>", " ", tag[len(head) : -4]).split())
        out.append((href.group(1) if href else "", label))
    return out


def _main_fragment(html: str) -> str:
    """Return the <main> contents; the truncation gate separately requires closure."""
    start = re.search(r"<main\b", html, re.I)
    assert start, "page has no <main"
    end = re.search(r"</main\s*>", html, re.I)
    return html[start.start() : end.start() if end else len(html)]


def test_no_consecutive_duplicate_cta():
    """The same offer must not be repeated back to back before any content.

    #299: scope derived from the pages that actually ship lead-inline, not from a
    hand-written route list.
    """
    pages = _lead_inline_pages()
    assert len(pages) >= 150, f"duplicate-CTA scan collapsed to {len(pages)} pages"
    failures: list[str] = []
    for path in pages:
        html = path.read_text(encoding="utf-8", errors="replace")
        seq = _cta_anchors(_main_fragment(html))
        for before, after in zip(seq, seq[1:]):
            if before == after:
                failures.append(
                    f"{path.relative_to(ROOT).as_posix()}: duplicated consecutive CTA "
                    f"{before[0]} / {before[1]!r}"
                )
    assert not failures, (
        f"duplicated consecutive CTA in {len(failures)} place(s):\n"
        + "\n".join(failures[:20])
    )


def test_organic_tool_block_never_glued_to_hero():
    """The organic injector must land promotional blocks below the first
    content section, so the visitor gets the direct answer before any offer."""
    from scripts.organic.cohort import _insert_after_page_hero

    page = (
        "<header class=\"site-header\"></header>"
        "<main id=\"conteudo\">"
        "<nav class=\"breadcrumbs\"></nav>"
        "<header class=\"content-hero pillar-hero\"><h1>Titulo</h1>"
        "<a class=\"button button-primary\" href=\"/ferramentas/x/\">Abrir</a>"
        "</header>"
        "<section id=\"resposta\"><h2>Resposta direta</h2></section>"
        "<section id=\"depois\"></section>"
        "</main>"
    )
    block = '<aside class="lead-inline" data-organic-tool="1"></aside>'
    out = _insert_after_page_hero(page, block)
    assert block in out, "injector dropped the block"
    at = out.index(block)
    assert at > out.index("<main"), "block hoisted above <main"
    assert at > out.index("<h1"), "block hoisted above the H1"
    assert at > out.index('<section id="resposta">'), "block glued to the hero"
    assert at > out.index("</section>"), "block placed inside the first section"
    assert at < out.index("</main>"), "block escaped <main"


def test_organic_tool_block_skips_page_without_safe_section():
    """No closed content section means there is no proven-safe insertion point."""
    from scripts.organic.cohort import _insert_after_page_hero

    block = '<aside class="lead-inline" data-organic-tool="1"></aside>'
    no_section = (
        '<main id="conteudo"><header class="content-hero"><h1>Titulo</h1></header>'
        '<p id="resposta">Resposta sem section.</p></main>'
    )
    unclosed_section = (
        '<main id="conteudo"><header class="content-hero"><h1>Titulo</h1></header>'
        '<section id="resposta"><p>Resposta incompleta.</p></main>'
    )
    unclosed_main = (
        '<main id="conteudo"><header class="content-hero"><h1>Titulo</h1></header>'
        '<section id="resposta"><p>Resposta fora de uma main verificável.</p></section>'
    )
    assert _insert_after_page_hero(no_section, block) == no_section
    assert _insert_after_page_hero(unclosed_section, block) == unclosed_section
    assert _insert_after_page_hero(unclosed_main, block) == unclosed_main


def test_organic_tool_block_matches_section_case_insensitively():
    """HTML tag case must not send a valid content section down the unsafe fallback."""
    from scripts.organic.cohort import _insert_after_page_hero

    block = '<aside class="lead-inline" data-organic-tool="1"></aside>'
    page = (
        '<main id="conteudo"><header class="content-hero"><h1>Titulo</h1></header>'
        '<SeCtIoN id="resposta"><p>Resposta direta.</p></sEcTiOn>'
        '<section id="depois"></section></main>'
    )
    out = _insert_after_page_hero(page, block)
    assert block in out
    assert out.index(block) > out.index("</sEcTiOn>")
    assert out.index(block) < out.index('<section id="depois">')


def test_organic_tool_block_waits_for_outer_section_close():
    """A nested section must not be mistaken for the end of the direct answer."""
    from scripts.organic.cohort import _insert_after_page_hero

    block = '<aside class="lead-inline" data-organic-tool="1"></aside>'
    page = (
        '<main id="conteudo"><header class="content-hero"><h1>Titulo</h1></header>'
        '<section id="resposta"><section id="apoio"><p>Apoio.</p></section>'
        '<p id="fim-resposta">Resposta completa.</p></section>'
        '<section id="depois"></section></main>'
    )
    out = _insert_after_page_hero(page, block)
    assert block in out
    assert out.index(block) > out.index('<p id="fim-resposta">')
    assert out.index(block) > out.index('<p id="fim-resposta">Resposta completa.</p></section>')
    assert out.index(block) < out.index('<section id="depois">')


def test_home_form_anchor_reveals_fields():
    """Hero/primary 'Analisar meu caso' must land on the form, not the long contact copy."""
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    form = re.search(
        r'<form\b[^>]*\bid="formulario-contato"[^>]*>[\s\S]*?</form>',
        html,
        re.I,
    )
    if not form:
        form = re.search(
            r'<form\b[^>]*class="[^"]*\bcontact-form\b[^"]*"[^>]*>[\s\S]*?</form>',
            html,
            re.I,
        )
        assert form and 'id="formulario-contato"' in html, 'home missing id="formulario-contato"'
    else:
        form_html = form.group(0)
        assert re.search(r"<input\b|<select\b|<textarea\b", form_html, re.I), (
            "first field must be a descendant of #formulario-contato"
        )
        assert re.search(r"<h2\b", form_html, re.I), "form card must include its title"
    hero = re.search(
        r'<a\b[^>]*data-cta-position="hero"[^>]*href="([^"]+)"[^>]*>[\s\S]*?Analisar meu caso',
        html,
        re.I,
    )
    if not hero:
        hero = re.search(
            r'<a\b[^>]*class="[^"]*\bbutton-primary\b[^"]*button-lg[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?Analisar meu caso',
            html,
            re.I,
        )
    assert hero, "hero/primary Analisar meu caso CTA missing"
    assert "#formulario-contato" in hero.group(1), (
        f"hero/primary CTA must target #formulario-contato, got {hero.group(1)!r}"
    )
    header_cta = re.search(
        r'<a\b[^>]*\bheader-cta\b[^>]*href="([^"]+)"|'
        r'<a\b[^>]*href="([^"]+)"[^>]*\bheader-cta\b',
        html,
    )
    assert header_cta, "home header-cta missing"
    header_href = header_cta.group(1) or header_cta.group(2)
    assert "#formulario-contato" in header_href, (
        f"home header-cta must target #formulario-contato, got {header_href!r}"
    )
    mobile = re.search(r'<nav\b[^>]*\bmobile-nav\b[^>]*>(.*?)</nav>', html, re.S | re.I)
    assert mobile, "home mobile-nav missing"
    mobile_cta = re.search(
        r'<a\b[^>]*href="([^"]+)"[^>]*>\s*Analisar meu caso\s*</a>',
        mobile.group(1),
    )
    assert mobile_cta, "home mobile Analisar meu caso missing"
    assert "#formulario-contato" in mobile_cta.group(1), (
        f"home mobile CTA must target #formulario-contato, got {mobile_cta.group(1)!r}"
    )
    assert 'id="contato"' in html, "keep #contato section id for back-compat"
    assert re.search(r"#formulario-contato\s*\{[^}]*scroll-margin-top", css), (
        "CSS must set scroll-margin-top on #formulario-contato"
    )
    assert re.search(
        r"#formulario-contato\{order:\s*-1\}|\.contact-form\{order:\s*-1",
        css.replace(" ", ""),
    ), "mobile rule must set form order so title + first field lead the 390px viewport"
    # Three doors: each primary door CTA lands on the single capture form.
    # The Medicoes/Glosas commercial route stays as a destination-named alt link.
    for match in re.finditer(
        r'<a\b[^>]*data-cta-position="(journey_[abc])"[^>]*>', html
    ):
        tag = match.group(0)
        href = re.search(r'href="([^"]+)"', tag)
        assert href and "#formulario-contato" in href.group(1), (
            f'{match.group(1)} CTA must target #formulario-contato, got {href and href.group(1)!r}'
        )
    assert 'href="/medicoes-glosas-obras-publicas/"' in html
    assert 'data-cta-id="home-medicoes-glosas-dossie"' in html
    # The shipped script must realign the landing: deferred section sizes (#185)
    # move the target while the jump runs.
    nav_js = (ROOT / "js" / "modules" / "nav.js").read_text(encoding="utf-8")
    assert "scrollMarginTop" in nav_js and "requestAnimationFrame" in nav_js, (
        "nav module must re-align fragment landings against the sticky header"
    )
    assert "cta_view" in nav_js, (
        "arrival at the form must emit its own event, distinct from the CTA click"
    )


def test_analisar_meu_caso_shell_targets_form():
    """Current-shell pages must not dump Analisar meu caso on #contato copy."""
    shell_src = (ROOT / "scripts" / "pseo" / "html_shell.py").read_text(encoding="utf-8")
    remediator = (ROOT / "scripts" / "site" / "inbound_first_remediate.py").read_text(
        encoding="utf-8"
    )
    assert 'href": "/#formulario-contato"' in shell_src or (
        '"/#formulario-contato"' in shell_src and "Analisar meu caso" in shell_src
    )
    assert 'href": "/#formulario-contato"' in remediator
    failures = []
    for path in _public_html_files():
        labels, cta = _nav_from(path)
        if labels not in (EXPECTED_NAV, LEGACY_NAV):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        header_cta = re.search(
            r'<a\b([^>]*)\bheader-cta\b([^>]*)>(.*?)</a>',
            html,
            re.S | re.I,
        )
        if header_cta:
            attrs = header_cta.group(1) + header_cta.group(2)
            label = re.sub(r"<[^>]+>", "", header_cta.group(3))
            label = re.sub(r"\s+", " ", label).strip()
            href_m = re.search(r'\bhref="([^"]+)"', attrs)
            href = href_m.group(1) if href_m else ""
            if label == EXPECTED_CTA and "#formulario-contato" not in href:
                failures.append(f"{path.relative_to(ROOT)}: header-cta {href!r}")
        mobile = re.search(
            r'<nav\b[^>]*\bmobile-nav\b[^>]*>(.*?)</nav>', html, re.S | re.I
        )
        if mobile:
            mcta = re.search(
                r'<a\b[^>]*href="([^"]+)"[^>]*>\s*Analisar meu caso\s*</a>',
                mobile.group(1),
            )
            if mcta and "#formulario-contato" not in mcta.group(1):
                failures.append(
                    f"{path.relative_to(ROOT)}: mobile {mcta.group(1)!r}"
                )
    assert not failures, failures[:20]


def test_form_no_contingency_copy():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Se o botão Continuar não aparecer" not in home


def test_css_visitor_tokens():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    tokens = (ROOT / "styles-tokens.css").read_text(encoding="utf-8")
    tools = (ROOT / "styles-tools.css").read_text(encoding="utf-8")
    assert "--read-measure" in css or "--read-measure" in tokens
    assert "journey-row" in css
    assert "problem-stage" in css
    assert "featured-lead" in css
    assert "tool-workflow" in tools
    assert "tool-req-option" in tools
    assert "tool-sticky-bar" in tools
    assert "tool-situation" in tools
    assert "tool-result-dominant" in tools or "tool-result-highlights" in tools


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    sys.exit(1 if failed else 0)
