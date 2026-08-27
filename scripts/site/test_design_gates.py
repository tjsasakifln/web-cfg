"""Design, copy and visual-structure gates for CONFENGE premium remediation.

These tests drive the real shipped HTML/CSS/JSON — not re-implementations.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.brand import load_brand  # noqa: E402

DS_PATH = ROOT / "data" / "site" / "design-system.json"
HOME = ROOT / "index.html"
OFFERS = [
    ROOT / "diretoria-b2g" / "index.html",
    ROOT / "diagnostico-b2g-360" / "index.html",
    ROOT / "bid-room-licitacoes-obras" / "index.html",
    ROOT / "defesa-margem-contratos-publicos" / "index.html",
]
COMMERCIAL = [HOME, *OFFERS, ROOT / "llms.txt"]


def load_ds() -> dict:
    assert DS_PATH.exists(), "design-system.json missing"
    return json.loads(DS_PATH.read_text(encoding="utf-8"))


def test_design_system_complete():
    ds = load_ds()
    for key in (
        "design_principles",
        "colors",
        "typography",
        "spacing",
        "section_archetypes",
        "component_usage_rules",
        "forbidden_patterns",
        "motion",
        "breakpoints",
    ):
        assert key in ds, f"missing {key}"
    assert ds.get("concept") == "engenharia editorial premium"
    assert (ROOT / "docs" / "DESIGN-SYSTEM.md").exists()
    assert len(ds["section_archetypes"]) >= 8
    assert ds["component_usage_rules"]["max_card_grids_per_page"] <= 2


def test_css_tokens_mirror_system():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    for token in ("--navy-950", "--green-700", "--ink", "--serif", "--mono", "section--tight", "section--loose"):
        assert token in css, f"CSS missing {token}"
    # green-100 must not be the only soft surface story
    assert "var(--soft)" in css or "--soft" in css


def test_home_archetypes_diverse():
    html = HOME.read_text(encoding="utf-8")
    archetypes = re.findall(r'data-section-archetype="([^"]+)"', html)
    # Home narrative architecture: ≤7 large blocks (excluding header/footer)
    assert 5 <= len(archetypes) <= 7, f"expected 5–7 narrative archetypes, got {archetypes}"
    assert len(set(archetypes)) >= 5, f"need ≥5 distinct archetypes, got {set(archetypes)}"
    assert "journey_paths" in archetypes, "three buyer journeys must be a first-class home section"
    # no three consecutive identical archetypes
    for i in range(len(archetypes) - 2):
        window = archetypes[i : i + 3]
        if len(set(window)) == 1:
            raise AssertionError(f"three consecutive identical archetypes: {window}")


VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
NARRATIVE_TAGS = {"section", "aside", "header", "article"}


class _NarrativeBlockScanner(HTMLParser):
    """Top-level narrative blocks inside <main>, with archetype and skeleton.

    The skeleton is the ordered tag/class signature of the block's first two
    levels. It is what a reader perceives as "another one of those", so the
    gate can catch a repeated section even when the archetype label is not.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.main_depth = 0
        self.block: dict | None = None
        self.block_depth = 0
        self.blocks: list[dict] = []

    def _signature(self, tag: str, attrs: dict) -> tuple[str, str]:
        classes = " ".join(sorted((attrs.get("class") or "").split()))
        return (tag, classes)

    def handle_starttag(self, tag, attrs):
        ad = {k: (v or "") for k, v in attrs}
        if tag == "main":
            self.in_main = True
            self.main_depth = 0
            return
        if not self.in_main:
            return
        if tag in VOID_TAGS:
            if self.block is not None and self.block_depth <= 2:
                self.block["skeleton"].append(self._signature(tag, ad))
            return
        if self.block is None:
            if self.main_depth == 0 and tag in NARRATIVE_TAGS:
                self.block = {
                    "tag": tag,
                    "archetype": ad.get("data-section-archetype", ""),
                    "id": ad.get("id", ""),
                    "skeleton": [self._signature(tag, ad)],
                }
                self.block_depth = 0
            else:
                self.main_depth += 1
            return
        self.block_depth += 1
        if self.block_depth <= 2:
            self.block["skeleton"].append(self._signature(tag, ad))

    def handle_startendtag(self, tag, attrs):
        if self.in_main and self.block is not None and self.block_depth <= 2:
            ad = {k: (v or "") for k, v in attrs}
            self.block["skeleton"].append(self._signature(tag, ad))

    def handle_endtag(self, tag):
        if not self.in_main:
            return
        if tag == "main":
            self.in_main = False
            return
        if tag in VOID_TAGS:
            return
        if self.block is None:
            self.main_depth = max(0, self.main_depth - 1)
            return
        if self.block_depth == 0:
            self.block["skeleton"] = tuple(self.block["skeleton"])
            self.blocks.append(self.block)
            self.block = None
        else:
            self.block_depth -= 1


def narrative_blocks(html: str) -> list[dict]:
    scanner = _NarrativeBlockScanner()
    scanner.feed(html)
    return scanner.blocks


def _longest_run(values: list) -> tuple[int, object]:
    best, best_value, run, previous = 0, None, 0, object()
    for value in values:
        run = run + 1 if value == previous else 1
        previous = value
        if run > best:
            best, best_value = run, value
    return best, best_value


def test_section_archetype_gate_covers_more_than_the_home():
    """Hierarchy is verified by gate on every declared surface, not by eye."""
    ds = load_ds()
    surfaces = ds.get("archetype_gated_surfaces") or []
    assert "index.html" in surfaces, "home must stay inside the archetype gate"
    assert "entregas/index.html" in surfaces, (
        "the deliverables library must stay inside the archetype gate"
    )
    declared = set(ds["section_archetypes"])
    for pattern in (
        "more_than_two_consecutive_identical_section_archetypes",
        "more_than_two_consecutive_identical_section_skeletons",
    ):
        assert pattern in ds["forbidden_patterns"], pattern

    for relative in surfaces:
        path = ROOT / relative
        assert path.is_file(), relative
        html = path.read_text(encoding="utf-8")
        blocks = narrative_blocks(html)
        assert len(blocks) >= 5, f"{relative}: only {len(blocks)} narrative blocks"

        missing = [b["id"] or b["tag"] for b in blocks if not b["archetype"]]
        assert not missing, f"{relative}: narrative blocks without archetype: {missing}"

        unknown = sorted({b["archetype"] for b in blocks} - declared)
        assert not unknown, f"{relative}: archetypes absent from design-system.json: {unknown}"

        run, value = _longest_run([b["archetype"] for b in blocks])
        assert run <= 2, f"{relative}: {run} consecutive '{value}' sections"

        run, _ = _longest_run([b["skeleton"] for b in blocks])
        assert run <= 2, (
            f"{relative}: {run} consecutive sections with an identical skeleton; "
            "vary the composition instead of relabelling it"
        )

        primaries = len(re.findall(r"button-primary", html))
        assert primaries <= 4, f"{relative}: {primaries} primary CTAs"


def test_deliverables_library_declares_its_hierarchy_in_copy():
    """The most promoted item must be explained, not merely enlarged."""
    path = ROOT / "entregas" / "index.html"
    html = path.read_text(encoding="utf-8")
    blocks = narrative_blocks(html)
    by_archetype = Counter(b["archetype"] for b in blocks)
    assert by_archetype["ladder_entry"] == 1, by_archetype
    assert by_archetype["compare_ladder"] == 1, by_archetype

    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    assert "Por que abre a biblioteca" in text, "entry step must declare why it opens the page"

    # No section may dominate by sheer length: the entry example used to be 59%
    # longer than its peers, which is emphasis by accident instead of by choice.
    lengths = {}
    for block in blocks:
        if not block["id"].startswith(("primeiro-exemplo", "exemplo-")):
            continue
        raw = re.search(
            rf'<section[^>]+id="{re.escape(block["id"])}".*?</section>', html, flags=re.DOTALL
        )
        assert raw, block["id"]
        visible = re.sub(r"<[^>]+>", " ", raw.group(0))
        lengths[block["id"]] = len(re.sub(r"\s+", " ", visible).strip())
    assert len(lengths) == 8, lengths
    assert max(lengths.values()) <= int(min(lengths.values()) * 1.35), (
        f"one example dominates by length: {lengths}"
    )


def test_home_card_grid_limit():
    html = HOME.read_text(encoding="utf-8")
    # Explicit card-grid markers from legacy patterns should be rare/absent
    legacy_grids = 0
    for cls in ("problem-grid", "operates-grid", "offers-grid", "metrics-grid", "journey-grid"):
        if re.search(rf'class="[^"]*{cls}', html):
            legacy_grids += 1
    assert legacy_grids <= 2, f"too many legacy card grids on home: {legacy_grids}"
    # Dominant offer hierarchy
    assert "offer-dominant" in html
    assert "offer-paths" in html
    assert html.find("offer-dominant") < html.find("offer-paths") or "Diretoria Fracionada" in html
    assert "Diretoria Fracionada para o Mercado Público" in html
    assert "Licitação vencida não paga a conta" in html
    assert "Contrato rentável, sim" in html
    # Seven-block narrative: hero risk offers method authority fit conversion
    sections = re.findall(r"<main[\s\S]*?</main>", html)
    assert sections, "main missing"
    main_sections = len(re.findall(r"<section\b", sections[0]))
    assert main_sections <= 7, f"home must have ≤7 narrative sections, got {main_sections}"


def test_home_no_uniform_section_padding_only():
    """Home should declare varied section spacing classes."""
    html = HOME.read_text(encoding="utf-8")
    variants = sum(1 for c in ("section--tight", "section--default", "section--loose") if c in html)
    assert variants >= 2, "home must vary section vertical rhythm"


def test_copy_leaks_absent_on_commercial_pages():
    brand = load_brand()
    ds = load_ds()
    leaks = list(brand.get("copy_leaks") or []) + list(ds.get("public_copy_leaks") or [])
    # unique
    leaks = sorted(set(leaks))
    # word-boundary only leaks
    wb = list(brand.get("copy_leak_word_boundaries") or ["owners"])
    failures = []
    for path in COMMERCIAL:
        if not path.exists():
            failures.append(f"missing {path}")
            continue
        text = path.read_text(encoding="utf-8")
        lower = text.lower()
        for phrase in leaks:
            if phrase.lower() in lower:
                # allow design-system docs? not in commercial
                failures.append(f"{path.relative_to(ROOT)}: leak {phrase!r}")
        for word in wb:
            if re.search(rf"\b{re.escape(word)}\b", text, re.I):
                failures.append(f"{path.relative_to(ROOT)}: word leak {word!r}")
    assert not failures, failures


def test_job_title_valid():
    ds = load_ds()
    forbidden = ds.get("job_title_forbidden") or []
    allowed = ds.get("job_title_allowed") or []
    brand = load_brand()
    jt = (brand.get("person") or {}).get("jobTitle")
    assert jt in allowed, f"brand jobTitle not allowed: {jt}"
    for path in [HOME, *OFFERS, ROOT / "scripts" / "pseo" / "html_shell.py"]:
        text = path.read_text(encoding="utf-8")
        for bad in forbidden:
            assert bad not in text, f"{path}: still has forbidden jobTitle"
        if path.suffix == ".html" and "jobTitle" in text:
            assert any(a in text for a in allowed), f"{path}: no allowed jobTitle in JSON-LD"


def test_offer_depth_and_distinct_layouts():
    required_markers = [
        "data-offer-section",
        "Responsabilidades",
        "button-primary",
    ]
    structures = []
    for path in OFFERS:
        html = path.read_text(encoding="utf-8")
        for m in required_markers:
            assert m in html, f"{path.relative_to(ROOT)} missing {m}"
        # depth: multiple offer sections
        sections = re.findall(r'data-offer-section="([^"]+)"', html)
        assert len(sections) >= 4, f"{path.name} shallow: {sections}"
        # signature of section order
        structures.append(tuple(sections))
        # headlines from brand
    # at least 3 distinct section-order signatures
    assert len(set(structures)) >= 3, f"offer layouts too similar: {structures}"
    bid = (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    assert "revisão crítica independente" in bid.lower()
    assert "red team" not in bid.lower()
    defesa = (ROOT / "defesa-margem-contratos-publicos" / "index.html").read_text(encoding="utf-8")
    assert "Defesa de margem" in defesa
    assert "Contract Defense" not in defesa
    assert "proteção de margem" in defesa.lower() or "Defesa técnica" in defesa


def test_journey_accessible_without_js():
    html = HOME.read_text(encoding="utf-8")
    assert "data-journey-enhance" in html or "macro-phases" in html
    # Four macro-phases present as real content (consolidated from 8-stage journey)
    for stage in ("j-mercado", "j-decisao", "j-contrato", "j-aprendizado"):
        assert f'id="{stage}"' in html
    assert "macro-phase" in html or "stage-meta" in html
    # Progressive disclosure via native details — works without JS
    assert "<details" in html
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "macro-phase" in css or "journey-stage" in css


def test_trace_matrix_and_tension_present():
    """Home must show three buyer journeys; legacy tension/trace optional if fused."""
    html = HOME.read_text(encoding="utf-8")
    assert "Diretoria Fracionada para o Mercado Público" in html
    assert "Arquitetura de ofertas" not in html
    # Three differentiated conversion paths (required by conversion architecture)
    assert "Avaliar o Dossiê de Medição, Glosa e Pagamento" in html
    assert "Enviar edital para triagem" in html
    assert "Solicitar diagnóstico da operação" in html
    assert 'data-journey="contrato"' in html
    assert 'data-journey="edital"' in html
    assert 'data-journey="operacao"' in html
    # Client-facing journey section — no briefing metalinguage
    assert "Como podemos ajudar" in html
    assert "Qual situação sua empresa precisa resolver agora" in html
    assert "Uma medição ou glosa travou meu caixa" in html
    assert ("journey-list" in html or "journey-paths" in html)
    assert "Sem CTA genérico" not in html
    assert not re.search(r">\s*Jornada\s+[ABC]\s*<", html)
    assert "Risco de não agir" not in html
    # Positive proof language — no defensive public copy
    lower = html.lower()
    for leak in (
        "sem inventar case",
        "sem métrica fictícia",
        "sem metrica ficticia",
        "sem javascript",
        "legível sem javascript",
        "cta genérico",
        "prova próxima ao cta",
    ):
        assert leak not in lower, f"defensive leak on home: {leak}"


def test_primary_cta_not_spam():
    html = HOME.read_text(encoding="utf-8")
    primary = len(re.findall(r"button-primary", html))
    # header (+ mobile nav), hero, form submit — ≤4 semantic primaries
    assert primary <= 4, f"too many primary CTAs on home: {primary}"
    # Dominant CTA family (article optional)
    assert "Analisar meu caso" in html
    assert "Solicitar diagnóstico da operação" in html
    # Secondary path must not share primary button class in hero
    hero = re.search(r'class="hero[\s\S]*?</section>', html)
    assert hero, "hero missing"
    hero_html = hero.group(0)
    assert hero_html.count("button-primary") == 1, "hero must have exactly one primary CTA"
    # Urgent secondary path present (WhatsApp or critical decision)
    assert "jornadas" in hero_html or "caminhos" in hero_html.lower()
    assert "evidence-matrix" in html or "hero-evidence" in html or "EESC-USP" in html


def test_home_five_second_clarity():
    """Buyer can answer what / who / problem / trust / next from home copy."""
    html = HOME.read_text(encoding="utf-8")
    lower = html.lower()
    assert "consultoria para licitações" in lower or "licitações e contratos" in lower
    assert "diretoria fracionada para o mercado público" in lower
    assert "construtor" in lower
    assert "margem" in lower
    assert "eesc-usp" in lower or "usp" in lower
    assert "#contato" in html or 'id="contato"' in html
    assert "analisar meu caso" in lower or "solicitar diagnóstico da operação" in lower


def test_form_qualification_minimal():
    html = HOME.read_text(encoding="utf-8")
    for field in ("nome", "empresa", "email", "telefone", "estagio", "urgencia", "consentimento"):
        assert f'name="{field}"' in html, f"missing form field {field}"
    # email and whatsapp are alternative contact paths (not both hard-required in markup)
    assert 'id="email"' in html and "required" not in re.search(r'id="email"[^>]*>', html).group(0)
    # Corporate lead pipeline: AJAX to Netlify Function (not Netlify Forms)
    assert "data-form-multistep" in html
    assert 'name="empresa-site"' in html  # honeypot secondary layer
    assert "data-netlify" not in html and " netlify" not in html


def test_prefers_reduced_motion_declared():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "prefers-reduced-motion" in css
    assert "prefers-reduced-data" in css
    # Functional text floor: hero proof and mono labels ≥14px (.875rem)
    assert "font-size:.875rem" in css or "font-size: .875rem" in css or "font-size:0.875rem" in css


def test_operating_flow_has_sitewide_fallback():
    """The visitor flow must not regress to raw browser bullets on stale offer CSS."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    offers_css = (ROOT / "styles-offers.css").read_text(encoding="utf-8")
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    assert ".operating-flow{" in css
    assert ".operating-flow{display:grid;gap:0;margin:0;padding:0;list-style:none}" in css
    assert "#operating-system-title{scroll-margin-top:" in css
    assert ".operating-flow" not in offers_css
    assert '<ol class="operating-flow"' in html


def test_mobile_matrix_composition():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "display:none" in css  # responsive hide rules remain
    html = HOME.read_text(encoding="utf-8")
    # Journey paths stack on narrow viewports (replacement for legacy trace-cards matrix)
    assert "journey-path" in html or "journey-paths" in html or "journey-list" in html or "journey-row" in html
    assert "journey-paths" in css or ".journey-path" in css or "journey-list" in css or "journey-row" in css
    # Hero visual suppressed on narrow viewports
    assert "hero-visual{display:none}" in css.replace(" ", "") or ".hero-visual{display:none}" in css.replace(" ", "")


def test_functional_type_floor_in_css():
    """Shipped CSS must not set commercial functional type below 14px (.875rem)."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    # Selectors that must stay ≥.875rem on commercial surfaces
    for pattern in (
        r"\.field label\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.consent\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.offer-label\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.offer-dominant \.offer-label\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.footer-links\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.footer-links strong\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.footer-bottom\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.breadcrumbs ol\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.profile-list li\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.related-card span\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.related-card small\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.service-number\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
        r"\.deliverables-list span\{[^}]*font-size:\.(?:[0-7][0-9]?|8[0-6])rem",
    ):
        assert not re.search(pattern, css), f"sub-14px functional type: {pattern}"
    assert re.search(r"\.field label\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.consent\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.footer-links\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.breadcrumbs ol\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.profile-list li\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.related-card span\{[^}]*font-size:\.875rem", css)


def _css_rule_bodies(css: str, selector: str) -> list[str]:
    """Extract declaration blocks for a minified/plain CSS selector from live styles.css."""
    sel = r"\s+".join(re.escape(part) for part in selector.split())
    return re.findall(
        rf"(?<![A-Za-z0-9_.*#:>+\s\[\]=\"'-]){sel}\s*\{{([^}}]*)\}}",
        css,
    )


def _declares_height_auto(body: str) -> bool:
    return bool(re.search(r"(?<![\w-])height\s*:\s*auto\b", body, re.I))


def test_img_rules_declare_height_auto():
    """width:100% + HTML height=630 squashes 1200x630 covers unless height:auto is set."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    global_img = _css_rule_bodies(css, "img")
    assert global_img, "global img { ... } rule missing in styles.css"
    assert any(_declares_height_auto(body) for body in global_img), (
        "global img rule must set height:auto so intrinsic aspect ratio is preserved"
    )
    cover_img = _css_rule_bodies(css, ".article-cover img")
    assert cover_img, ".article-cover img { ... } rule missing in styles.css"
    for i, body in enumerate(cover_img):
        assert _declares_height_auto(body), (
            f".article-cover img rule #{i} must set height:auto; got {body!r}"
        )


def _meta_properties(html: str) -> dict[str, str]:
    properties: dict[str, str] = {}
    for tag in re.findall(r"<meta\b[^>]*>", html, re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", tag, re.I | re.S
            )
        }
        prop = attrs.get("property", "").lower()
        if prop:
            properties[prop] = attrs.get("content", "")
    return properties


def test_raster_title_covers_are_og_only_outside_frozen_bofu_routes():
    """Remove redundant inline cards without bypassing the #128/#226 freeze."""
    frozen_bofu = {
        "aditivos-obras-publicas/index.html",
        "auditoria-orcamento-licitacao/index.html",
        "diagnostico-b2g-360/index.html",
        "diagnostico-pre-licitacao/index.html",
        "medicoes-glosas-obras-publicas/index.html",
        "reequilibrio-obras-publicas/index.html",
    }
    candidates: list[Path] = []
    frozen_candidates: set[str] = set()
    for path in ROOT.rglob("index.html"):
        relative_parts = path.relative_to(ROOT).parts
        if any(
            part in {".git", ".claude", ".worktrees", "_site", "node_modules"}
            for part in relative_parts
        ):
            continue
        html = path.read_text(encoding="utf-8")
        meta = _meta_properties(html)
        og_image = meta.get("og:image", "")
        if not og_image.startswith(
            (
                "https://confenge.com.br/assets/conteudos/",
                "https://confenge.com.br/assets/clusters/",
            )
        ):
            continue
        candidates.append(path)
        relative_asset = og_image.removeprefix("https://confenge.com.br/")
        assert (ROOT / relative_asset).exists(), f"{path.relative_to(ROOT)}: missing OG asset"
        assert meta.get("og:image:width") == "1200", path.relative_to(ROOT)
        assert meta.get("og:image:height") == "630", path.relative_to(ROOT)
        relative = path.relative_to(ROOT).as_posix()
        figures = re.findall(
            r"<figure\b[^>]*class=[\"'][^\"']*\barticle-cover\b[^\"']*[\"'][^>]*>"
            r"[\s\S]*?</figure>",
            html,
            re.I,
        )
        if relative in frozen_bofu:
            frozen_candidates.add(relative)
            assert len(figures) == 1, f"{relative}: frozen cover changed"
            image = re.search(r"<img\b[^>]*>", figures[0], re.I)
            assert image, f"{relative}: frozen cover image missing"
            attrs = {
                key.lower(): value
                for key, _quote, value in re.findall(
                    r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", image.group(0), re.I | re.S
                )
            }
            assert attrs.get("src") == "/" + relative_asset, relative
            assert attrs.get("width") == "1200", relative
            assert attrs.get("height") == "630", relative
        else:
            assert not figures, f"{relative}: redundant raster title card must be OG-only"
            hero = re.search(
                r"<header\b[^>]*class=[\"'][^\"']*\bcontent-hero\b[^\"']*[\"']",
                html,
                re.I,
            )
            assert hero and "article-hero" in hero.group(0), (
                f"{relative}: coverless route must reuse the one-column article hero"
            )

    representative = {
        ROOT / "conteudos" / "documentos-reequilibrio-obra-publica" / "index.html",
        ROOT / "acompanhamento-contratos-obras" / "index.html",
    }
    assert representative <= set(candidates)
    assert len(candidates) == 128, f"expected the 128 audited routes, got {len(candidates)}"
    assert frozen_candidates == frozen_bofu - {"diagnostico-b2g-360/index.html"}


def _img_attributes(tag: str) -> dict[str, str]:
    return {
        key.lower(): value
        for key, _quote, value in re.findall(
            r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", tag, re.I | re.S
        )
    }


def _ratio_drift(width: int, height: int, reference_width: int, reference_height: int) -> float:
    ratio = width / height
    reference = reference_width / reference_height
    return abs(ratio - reference) / reference


def test_home_header_footer_asset_budget():
    """Home must not declare 800px logos for a ~190–224px box; footer logo is lazy."""
    html = HOME.read_text(encoding="utf-8")
    header = re.search(
        r'<a\b[^>]*class="[^"]*\bbrand\b[^"]*"[^>]*>\s*<img\b([^>]+)>',
        html,
        re.I,
    )
    assert header, "home header .brand img missing"
    attrs = header.group(1)
    header_attrs = _img_attributes(attrs)
    assert header_attrs.get("src") == "/assets/logo-confenge-500-f8a83f6d.png"
    assert (header_attrs.get("width"), header_attrs.get("height")) == ("224", "58")
    footer = re.search(
        r'<div\b[^>]*class="[^"]*\bfooter-brand\b[^"]*"[^>]*>\s*<img\b([^>]+)>',
        html,
        re.I,
    )
    assert footer, "home footer-brand img missing"
    fattrs = footer.group(1)
    footer_attrs = _img_attributes(fattrs)
    assert footer_attrs.get("src") == "/assets/logo-confenge-white-500-1677038e.png"
    assert (footer_attrs.get("width"), footer_attrs.get("height")) == ("224", "58")
    assert re.search(r'\bloading="lazy"', fattrs, re.I), "footer logo must be loading=lazy"
    assert re.search(r'\bdecoding="async"', fattrs, re.I), "footer logo should decode async"
    script = re.search(r"<script\b[^>]*src=\"[^\"]*script\.js[^\"]*\"[^>]*>", html, re.I)
    assert script, "home script.js tag missing"
    assert re.search(r"\bdefer\b", script.group(0), re.I), "home script.js must use defer"
    js = (ROOT / "script.js").read_text(encoding="utf-8")
    analytics_js = (ROOT / "js" / "modules" / "analytics.js").read_text(encoding="utf-8")
    nav_js = (ROOT / "js" / "modules" / "nav.js").read_text(encoding="utf-8")
    assert "requestIdleCallback" in js, "non-critical init must use requestIdleCallback"
    delay = re.search(r"ANALYTICS_FLUSH_DELAY_MS\s*=\s*(\d+)", analytics_js)
    assert delay and int(delay.group(1)) >= 5000, (
        "background analytics flush must stay outside the critical loading window"
    )
    assert "if (reveals.length) scheduleIdle" in nav_js, (
        "do not schedule decorative reveal work on pages without reveal elements"
    )


class _MainScriptCollector(HTMLParser):
    """Collect the real /script.js tag and its boolean defer attribute."""

    def __init__(self) -> None:
        super().__init__()
        self.tags: list[tuple[str, bool]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        normalized = {key.lower(): value for key, value in attrs}
        src = (normalized.get("src") or "").split("?", 1)[0].split("#", 1)[0]
        if src != "/script.js":
            return
        self.tags.append((self.get_starttag_text() or "<script>", "defer" in normalized))


def _main_script_tags(html: str) -> list[tuple[str, bool]]:
    parser = _MainScriptCollector()
    parser.feed(html)
    return parser.tags


def test_shipped_pages_defer_the_main_script():
    """#299: the render-blocking half of the home asset budget, checked sitewide.

    test_home_header_footer_asset_budget only looks at index.html. The logo half of
    that budget is already sitewide (test_shipped_pages_use_versioned_proportional_logos),
    but nothing checked that every other shipped page also loads script.js with defer.
    Scope is derived from the pages that reference the script, so a new page is covered
    without editing this list.
    """
    skip = {
        ".claude",
        ".git",
        ".worktrees",
        "node_modules",
        "_site",
        "docs",
        "scripts",
        "tests",
        "netlify",
        "seo",
        "data",
        "supabase",
    }
    offenders: list[str] = []
    tags = 0

    assert _main_script_tags('<script defer src="/script.js?v=1"></script>')
    assert _main_script_tags('<script data-defer src="/script.js"></script>') == [
        ('<script data-defer src="/script.js">', False)
    ]
    assert not _main_script_tags('<script defer src="/foo-script.js"></script>')

    for path in sorted(ROOT.rglob("*.html")):
        relative = path.relative_to(ROOT)
        if any(part in skip for part in relative.parts):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        for tag, has_defer in _main_script_tags(html):
            tags += 1
            if not has_defer:
                offenders.append(f"{relative}: script.js without defer: {tag}")
    assert tags > 100, f"expected the whole shipped chrome, scanned only {tags} script tags"
    assert not offenders, "render-blocking script.js:\n" + "\n".join(offenders[:20])


def _png_size(path: Path) -> tuple[int, int]:
    """Intrinsic size straight from IHDR, no image library needed."""
    raw = path.read_bytes()
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name} is not a PNG"
    assert raw[12:16] == b"IHDR", f"{path.name} has no leading IHDR"
    width = int.from_bytes(raw[16:20], "big")
    height = int.from_bytes(raw[20:24], "big")
    return width, height


def test_brand_logo_assets_fit_their_render_box():
    """#185: shipping 800px logos for a 224/236px box wasted ~78% of the bytes.

    The widest render is the footer at 236 CSS px, so 500 px still covers a 2x
    device pixel ratio. Both files must also stay small enough that the header
    logo never competes with the LCP element for bandwidth.
    """
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    boxes = [int(m) for m in re.findall(r"\.(?:footer-)?brand(?:\s*,\s*\.brand)?\s*img\s*\{[^}]*?width:\s*(\d+)px", css)]
    boxes += [int(m) for m in re.findall(r"\.brand\s*\{[^}]*?width:\s*(\d+)px", css)]
    assert boxes, "no CSS render box found for the brand logo"
    widest = max(boxes)
    assert widest <= 236, f"brand logo render box grew to {widest}px; revisit the asset budget"
    from scripts.site.optimize_brand_logos import optimize, versioned_asset_path

    masters = {
        "assets/logo-confenge.png": "e6af0125c73edd476cff82ab4ea1de3e459fbdbde63b886f6c55f8a93531505b",
        "assets/logo-confenge-white.png": "e6bb135d070993411cb46adce88747187f3decd2f85f23e9899a9c89e97e7586",
    }
    for relative, expected_sha256 in masters.items():
        source = ROOT / relative
        source_bytes = source.read_bytes()
        assert hashlib.sha256(source_bytes).hexdigest() == expected_sha256, (
            f"{relative} backs frozen immutable URLs and must remain byte-identical"
        )
        source_width, source_height = _png_size(source)
        assert (source_width, source_height) == (800, 208), relative

        payload = optimize(source)
        versioned_relative = versioned_asset_path(relative, payload)
        versioned = ROOT / versioned_relative
        assert versioned.exists(), f"missing generated asset {versioned_relative}"
        assert versioned.read_bytes() == payload, (
            f"{versioned_relative} is stale; rerun optimize_brand_logos.py --write"
        )
        width, height = _png_size(versioned)
        assert (width, height) == (500, 130), versioned_relative
        assert width >= widest * 2, f"{versioned_relative} no longer covers 2x DPR"
        assert width <= round(widest * 2.2), (
            f"{versioned_relative} is {width}px wide for a {widest}px box"
        )
        assert versioned.stat().st_size <= 16 * 1024, (
            f"{versioned_relative} exceeds the 16KiB budget"
        )
        assert width * source_height == height * source_width, (
            f"{versioned_relative} changed the master aspect ratio"
        )
        assert _ratio_drift(width, height, 224, 58) < 0.02, (
            f"{versioned_relative} drifted from the declared 224x58 render box"
        )


def test_shipped_pages_use_versioned_proportional_logos():
    """Every mutable page uses the content-addressed payload; frozen pages stay exact."""
    from scripts.bofu_dominance.frozen_specs.constants import FORBIDDEN_RELATIVE_PATHS

    frozen = {rel for rel in FORBIDDEN_RELATIVE_PATHS if rel.endswith(".html")}
    skip = {
        ".claude",
        ".git",
        ".worktrees",
        "node_modules",
        "_site",
        "docs",
        "scripts",
        "tests",
        "netlify",
        "seo",
        "data",
        "supabase",
    }
    offenders: list[str] = []
    frozen_seen: set[str] = set()
    pages = 0
    for path in sorted(ROOT.rglob("*.html")):
        relative = path.relative_to(ROOT)
        relative_string = relative.as_posix()
        if any(part in skip for part in relative.parts):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        if "logo-confenge" not in html:
            continue
        pages += 1
        for tag in re.findall(r"<img\b[^>]*>", html, re.I):
            if "logo-confenge" not in tag:
                continue
            attrs = _img_attributes(tag)
            src = attrs.get("src", "")
            white = "logo-confenge-white" in src
            if relative_string in frozen:
                frozen_seen.add(relative_string)
                expected = (
                    "/assets/logo-confenge-white.png"
                    if white
                    else "/assets/logo-confenge.png"
                )
                if src != expected or (attrs.get("width"), attrs.get("height")) != ("800", "208"):
                    offenders.append(f"{relative}: frozen logo changed: {tag}")
                continue

            expected = (
                "/assets/logo-confenge-white-500-1677038e.png"
                if white
                else "/assets/logo-confenge-500-f8a83f6d.png"
            )
            if src != expected:
                offenders.append(f"{relative}: non-versioned logo URL: {tag}")
                continue
            if (attrs.get("width"), attrs.get("height")) != ("224", "58"):
                offenders.append(f"{relative}: logo must declare 224x58: {tag}")
                continue
            if _ratio_drift(224, 58, 500, 130) >= 0.02:
                offenders.append(f"{relative}: logo declaration is not proportional: {tag}")
            if white and attrs.get("loading", "").lower() != "lazy":
                offenders.append(f"{relative}: footer logo is not lazy")
            if white and attrs.get("decoding", "").lower() != "async":
                offenders.append(f"{relative}: footer logo does not decode async")
    assert pages > 100, f"expected the whole shipped chrome, scanned only {pages} pages"
    assert frozen_seen == frozen, f"frozen logo pages missing from scan: {frozen - frozen_seen}"
    assert not offenders, "invalid brand logos:\n" + "\n".join(offenders[:20])


def test_logo_templates_match_the_shipped_markup():
    """Generated chrome must keep the content-addressed, proportional markup."""
    for relative in (
        "scripts/pseo/html_shell.py",
        "scripts/market_answers/render.py",
        "scripts/offers/render.cjs",
        "scripts/site/inbound_first_remediate.py",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        tags = [
            tag
            for tag in re.findall(r"<img\b[^>]*>", source, re.I)
            if "logo-confenge" in tag
        ]
        assert tags, f"{relative} has no brand image template"
        for tag in tags:
            if "logo-confenge" not in tag:
                continue
            attrs = _img_attributes(tag)
            white = "logo-confenge-white" in attrs.get("src", "")
            expected = (
                "/assets/logo-confenge-white-500-1677038e.png"
                if white
                else "/assets/logo-confenge-500-f8a83f6d.png"
            )
            assert attrs.get("src") == expected, f"{relative} emits {tag}"
            assert (attrs.get("width"), attrs.get("height")) == ("224", "58"), (
                f"{relative} emits non-proportional dimensions: {tag}"
            )
            assert _ratio_drift(224, 58, 500, 130) < 0.02
            if white:
                assert attrs.get("loading", "").lower() == "lazy", relative
                assert attrs.get("decoding", "").lower() == "async", relative


def test_home_defers_below_fold_layout_work():
    """#185: the long home must not fully lay out every section at startup."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    compact = re.sub(r"\s+", "", css)
    selector = 'body[data-content-cluster="home"]main>section:not(.hero)'
    assert selector in compact, "home below-fold containment selector missing"
    rule = compact.split(selector, 1)[1].split("}", 1)[0]
    assert "content-visibility:auto" in rule
    assert "contain-intrinsic-size:auto900px" in rule


def test_accessibility_label_gate_rejects_id_only_fields():
    """An id makes a field addressable; it does not give it an accessible name."""
    from scripts.site.audit_accessibility import has_accessible_label

    assert not has_accessible_label("<form></form>", "email")
    assert not has_accessible_label('<input id="email" type="email">', "email")
    assert has_accessible_label(
        '<label for="email">E-mail</label><input id="email" type="email">',
        "email",
    )
    assert has_accessible_label('<input id="email" aria-label="E-mail" type="email">', "email")
    assert has_accessible_label('<label>E-mail <input name="email" type="email"></label>', "email")


def _srgb_channel(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _hex_to_rgb(color: str) -> tuple[float, float, float]:
    raw = color.strip().lstrip("#")
    assert len(raw) == 6, color
    return tuple(int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def _relative_luminance(color: str) -> float:
    r, g, b = _hex_to_rgb(color)
    return 0.2126 * _srgb_channel(r) + 0.7152 * _srgb_channel(g) + 0.0722 * _srgb_channel(b)


def _contrast_ratio(fg: str, bg: str) -> float:
    l1, l2 = _relative_luminance(fg), _relative_luminance(bg)
    lighter, darker = (l1, l2) if l1 >= l2 else (l2, l1)
    return (lighter + 0.05) / (darker + 0.05)


def test_pillar_evidence_contrast_on_navy():
    """Count/note must beat .pillar-overview p{color:muted} and stay ≥4.5:1 on #071a31."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    bg = "#071a31"
    selectors = (
        r"\.pillar-evidence\s+(?:p\.)?pillar-evidence-count",
        r"\.pillar-evidence\s+p\.pillar-evidence-count",
        r"\.pillar-evidence\s+(?:p\.)?pillar-evidence-note",
        r"\.pillar-evidence\s+p\.pillar-evidence-note",
    )
    found_count = False
    found_note = False
    for sel in selectors:
        for body in re.findall(rf"{sel}\s*\{{([^}}]*)\}}", css):
            color_m = re.search(r"(?<![\w-])color\s*:\s*(#[0-9a-fA-F]{3,8}|#fff)\b", body)
            assert color_m, f"{sel} missing color in {body!r}"
            color = color_m.group(1)
            if color.lower() == "#fff":
                color = "#ffffff"
            elif len(color) == 4:
                color = "#" + "".join(ch * 2 for ch in color[1:])
            ratio = _contrast_ratio(color, bg)
            assert ratio >= 4.5, f"{sel} {color} on {bg} contrast {ratio:.2f} < 4.5"
            if "count" in sel:
                found_count = True
            if "note" in sel:
                found_note = True
    assert found_count and found_note, "need descendant count and note color rules"
    pillars = [
        ROOT / "acompanhamento-contratos-obras" / "index.html",
        ROOT / "aditivos-obras-publicas" / "index.html",
        ROOT / "atrasos-prorrogacao-obras-publicas" / "index.html",
        ROOT / "auditoria-orcamento-licitacao" / "index.html",
        ROOT / "defesa-tecnica-contratos-publicos" / "index.html",
        ROOT / "diagnostico-pre-licitacao" / "index.html",
        ROOT / "medicoes-glosas-obras-publicas" / "index.html",
        ROOT / "reequilibrio-obras-publicas" / "index.html",
    ]
    assert len(pillars) == 8
    for path in pillars:
        html = path.read_text(encoding="utf-8")
        assert 'class="pillar-evidence"' in html, f"{path.relative_to(ROOT)} missing pillar-evidence"


def test_offer_context_component_css():
    """Offer framing is its own component; .hero-proof stays a credential list."""
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    compact = re.sub(r"\s+", "", css)
    assert ".offer-context{" in compact
    assert ".offer-context-item{" in compact
    assert ".offer-contextdt{" in compact
    assert ".offer-contextdd{" in compact
    assert "repeat(3,minmax(0,1fr))" in compact
    # dt is .875rem (14px), not .75rem, to keep functional text ≥ 14px.
    assert re.search(r"\.offer-context dt\{[^}]*font-size:\.875rem", css)
    assert re.search(r"\.offer-context dd\{[^}]*font-size:1rem", css)
    assert re.search(r"\.offer-context dd\{[^}]*margin-inline-start:0", css)
    assert "decimal-leading-zero" in css
    assert "counter-reset:offer-ctx" in compact
    # Four items stay a 3-column band + conclusion strip — not an automatic 2×2.
    assert not re.search(
        r"\.offer-context:has\(>\s*\.offer-context-item:nth-child\(4\)\)\{[^}]*repeat\(2,",
        css,
    )
    assert ".hero-proofli{" in compact or re.search(r"\.hero-proof li\{", css)
    for path in (
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "diagnostico-b2g-expansao" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "acompanhamento-contratos-obras" / "index.html",
        ROOT / "defesa-margem-contratos-publicos" / "index.html",
        ROOT / "defesa-tecnica-contratos-publicos" / "index.html",
        ROOT / "atrasos-prorrogacao-obras-publicas" / "index.html",
    ):
        html = path.read_text(encoding="utf-8")
        assert 'class="offer-context"' in html, f"{path.relative_to(ROOT)} missing offer-context"
        assert not re.search(r"<dl\b[^>]*\bhero-proof\b", html), f"{path.relative_to(ROOT)} still has dl.hero-proof"
        assert "<dt>O que resolvemos</dt>" in html, f"{path.relative_to(ROOT)} missing visitor label"
        assert "<dt>Para quem é</dt>" in html, f"{path.relative_to(ROOT)} missing visitor label"
        assert "<dt>Quando faz sentido</dt>" in html, f"{path.relative_to(ROOT)} missing visitor label"


def test_thankyou_specialist_cta_family():
    for name in ("obrigado.html", "obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        path = ROOT / name
        assert path.exists(), name
        text = path.read_text(encoding="utf-8")
        assert "data-lead-success" in text
        assert "wa.me" in text
        assert "Prazo" in text or "prazo" in text
    specialist = (ROOT / "especialista" / "tiago-jun-sasaki" / "index.html").read_text(encoding="utf-8")
    assert "Solicitar diagnóstico" in specialist
    lower = specialist.lower()
    assert "analisar meu cenário" not in lower
    assert "apresentar uma demanda" not in lower

def run_all() -> int:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_all())
