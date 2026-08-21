"""Design, copy and visual-structure gates for CONFENGE premium remediation.

These tests drive the real shipped HTML/CSS/JSON — not re-implementations.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
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
    assert html.find("offer-dominant") < html.find("offer-paths") or "Diretoria B2G" in html
    assert "Diretoria B2G fracionada" in html
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
    assert "Diretoria B2G" in html
    assert "Arquitetura de ofertas" not in html
    # Three differentiated conversion paths (required by conversion architecture)
    assert "Enviar documentos para análise" in html
    assert "Enviar edital para triagem" in html
    assert "Diagnosticar operação B2G" in html or "Diagnosticar a operação B2G" in html
    assert 'data-journey="contrato"' in html
    assert 'data-journey="edital"' in html
    assert 'data-journey="operacao"' in html
    # Client-facing journey section — no briefing metalinguage
    assert "Como podemos ajudar" in html
    assert "Qual situação sua empresa precisa resolver agora" in html
    assert "Tenho um contrato sob pressão" in html
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
    assert "Diagnosticar a operação B2G" in html or "Diagnosticar operação B2G" in html
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
    assert "diretoria b2g" in lower
    assert "construtor" in lower
    assert "margem" in lower
    assert "eesc-usp" in lower or "usp" in lower
    assert "#contato" in html or 'id="contato"' in html
    assert "analisar meu caso" in lower or ("diagnosticar" in lower and "b2g" in lower)


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
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    assert ".operating-flow{" in css
    assert ".operating-flow{display:grid;gap:0;margin:0;padding:0;list-style:none}" in css
    assert "#operating-system-title{scroll-margin-top:" in css
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


def test_article_cover_html_keeps_intrinsic_1200x630():
    """CSS height:auto is the distortion fix; HTML still declares 1200x630 intrinsic size."""
    article = ROOT / "conteudos" / "documentos-reequilibrio-obra-publica" / "index.html"
    pillar = ROOT / "reequilibrio-obras-publicas" / "index.html"
    for path in (article, pillar):
        assert path.exists(), f"missing {path.relative_to(ROOT)}"
        html = path.read_text(encoding="utf-8")
        figures = re.findall(
            r"<figure\b[^>]*class=\"[^\"]*\barticle-cover\b[^\"]*\"[^>]*>[\s\S]*?</figure>",
            html,
            re.I,
        )
        assert figures, f"{path.relative_to(ROOT)}: missing <figure class=\"article-cover\">"
        matched = False
        for fig in figures:
            if re.search(r"<img\b[^>]*\bwidth=\"1200\"[^>]*\bheight=\"630\"", fig, re.I) or re.search(
                r"<img\b[^>]*\bheight=\"630\"[^>]*\bwidth=\"1200\"", fig, re.I
            ):
                matched = True
                break
        assert matched, (
            f"{path.relative_to(ROOT)}: article-cover img must keep width=\"1200\" height=\"630\""
        )


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
    width_m = re.search(r'\bwidth="(\d+)"', attrs, re.I)
    assert width_m, "header .brand img must declare width"
    assert int(width_m.group(1)) <= 224, (
        f"header logo width attribute {width_m.group(1)} exceeds display box 224"
    )
    assert re.search(r'\bheight="(\d+)"', attrs, re.I), "header .brand img must declare height"
    footer = re.search(
        r'<div\b[^>]*class="[^"]*\bfooter-brand\b[^"]*"[^>]*>\s*<img\b([^>]+)>',
        html,
        re.I,
    )
    assert footer, "home footer-brand img missing"
    fattrs = footer.group(1)
    assert re.search(r'\bloading="lazy"', fattrs, re.I), "footer logo must be loading=lazy"
    assert re.search(r'\bdecoding="async"', fattrs, re.I), "footer logo should decode async"
    script = re.search(r"<script\b[^>]*src=\"[^\"]*script\.js[^\"]*\"[^>]*>", html, re.I)
    assert script, "home script.js tag missing"
    assert re.search(r"\bdefer\b", script.group(0), re.I), "home script.js must use defer"
    js = (ROOT / "script.js").read_text(encoding="utf-8")
    assert "requestIdleCallback" in js, "non-critical init must use requestIdleCallback"


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
    assert "Diagnosticar" in specialist
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
