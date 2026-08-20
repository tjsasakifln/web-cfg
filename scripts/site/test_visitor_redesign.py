"""Visitor experience redesign gates — shipped HTML/CSS/generators + functional behavior."""
from __future__ import annotations

import json
import re
import sys
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

ALLOWED = frozenset(ALLOWED_STAGES)
EXPECTED_NAV = [
    "Serviços",
    "Problemas que resolvemos",
    "Conteúdos e ferramentas",
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


def test_global_shell_nav_uniform():
    brand = load_brand()
    brand_labels = [n["label"] for n in (brand.get("navigation") or {}).get("desktop") or []]
    assert brand_labels == EXPECTED_NAV
    assert (brand.get("navigation") or {}).get("cta", {}).get("label") == EXPECTED_CTA

    surfaces = [
        ROOT / "index.html",
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

    ref: list[str] | None = None
    failures = []
    for path in surfaces:
        if not path.exists():
            failures.append(f"missing {path.relative_to(ROOT)}")
            continue
        labels, cta = _nav_from(path)
        if not labels:
            failures.append(f"{path.relative_to(ROOT)}: no desktop-nav labels")
            continue
        if ref is None:
            ref = labels
        # only aria-current may differ — not names or counts
        if labels != ref:
            failures.append(
                f"{path.relative_to(ROOT)}: nav labels {labels} != ref {ref}"
            )
        if labels != EXPECTED_NAV:
            failures.append(
                f"{path.relative_to(ROOT)}: expected {EXPECTED_NAV}, got {labels}"
            )
        if cta and cta != EXPECTED_CTA:
            failures.append(f"{path.relative_to(ROOT)}: cta {cta!r}")
        html = path.read_text(encoding="utf-8", errors="replace")
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


LEAD_INLINE_HIERARCHY_ROUTES = [
    ROOT / "aditivos-obras-publicas" / "index.html",
    ROOT / "atrasos-prorrogacao-obras-publicas" / "index.html",
    ROOT / "auditoria-orcamento-licitacao" / "index.html",
    ROOT / "medicoes-glosas-obras-publicas" / "index.html",
    ROOT / "reequilibrio-obras-publicas" / "index.html",
    ROOT / "conteudos" / "limite-aditivo-25-50-obra-publica" / "index.html",
]


def test_lead_inline_not_before_main_or_h1():
    """Promotional lead-inline must not sit between site header and main/H1."""
    for path in LEAD_INLINE_HIERARCHY_ROUTES:
        assert path.exists(), f"missing {path.relative_to(ROOT)}"
        html = path.read_text(encoding="utf-8")
        main = re.search(r"<main\b", html, re.I)
        assert main, f"{path.relative_to(ROOT)}: missing <main"
        h1 = re.search(r"<h1\b", html, re.I)
        assert h1, f"{path.relative_to(ROOT)}: missing <h1"
        for m in re.finditer(r"\blead-inline\b", html):
            assert m.start() > main.start(), (
                f"{path.relative_to(ROOT)}: lead-inline appears before <main"
            )
            assert m.start() > h1.start(), (
                f"{path.relative_to(ROOT)}: lead-inline appears before first <h1"
            )


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
    assert "Serviços" in home
    assert "Problemas que resolvemos" in home
    assert "Conteúdos e ferramentas" in home
    assert home.count("button-primary") <= 4
    hero = re.search(r'class="hero[\s\S]*?</section>', home)
    assert hero and hero.group(0).count("button-primary") == 1
    assert "journey-row--dominant" in home or "journey-path--core" in home
    assert "evidence-matrix" in home or "hero-evidence" in home


def test_form_no_contingency_copy():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "Se o botão Continuar não aparecer" not in home


def test_css_visitor_tokens():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    tools = (ROOT / "styles-tools.css").read_text(encoding="utf-8")
    assert "--read-measure" in css
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
