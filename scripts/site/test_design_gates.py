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
    assert "Contract Defense" in defesa
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
    html = HOME.read_text(encoding="utf-8")
    assert "trace-matrix" in html
    assert "trace-cards" in html  # mobile stacked composition
    assert "O contrato pode destruir margem em três momentos" in html
    assert "tension-flow" in html or "tension-stage" in html
    assert "Diretoria B2G" in html
    assert "Arquitetura de ofertas" not in html
    # Positive proof language — no defensive public copy
    lower = html.lower()
    for leak in (
        "sem inventar case",
        "sem métrica fictícia",
        "sem metrica ficticia",
        "sem javascript",
        "legível sem javascript",
    ):
        assert leak not in lower, f"defensive leak on home: {leak}"


def test_primary_cta_not_spam():
    html = HOME.read_text(encoding="utf-8")
    primary = len(re.findall(r"button-primary", html))
    # header (+ mobile nav), hero, form submit — ≤4 semantic primaries
    assert primary <= 4, f"too many primary CTAs on home: {primary}"
    # Dominant CTA family
    assert "Diagnosticar operação B2G" in html
    # WhatsApp secondary must not share primary button class in hero
    hero = re.search(r'class="hero[\s\S]*?</section>', html)
    assert hero, "hero missing"
    hero_html = hero.group(0)
    assert hero_html.count("button-primary") == 1, "hero must have exactly one primary CTA"
    assert "Enviar decisão crítica" in hero_html or "decisão crítica" in hero_html.lower()


def test_home_five_second_clarity():
    """Buyer can answer what / who / problem / trust / next from home copy."""
    html = HOME.read_text(encoding="utf-8")
    lower = html.lower()
    assert "diretoria b2g" in lower
    assert "construtor" in lower
    assert "margem" in lower
    assert "eesc-usp" in lower or "usp" in lower
    assert "#contato" in html or 'id="contato"' in html
    assert "diagnosticar operação b2g" in lower


def test_form_qualification_minimal():
    html = HOME.read_text(encoding="utf-8")
    for field in ("nome", "empresa", "email", "telefone", "estagio", "urgencia", "consentimento"):
        assert f'name="{field}"' in html, f"missing form field {field}"
    # email and whatsapp are alternative contact paths (not both hard-required in markup)
    assert 'id="email"' in html and "required" not in re.search(r'id="email"[^>]*>', html).group(0)
    assert "data-netlify" in html or 'netlify' in html


def test_prefers_reduced_motion_declared():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "prefers-reduced-motion" in css
    assert "prefers-reduced-data" in css
    # Functional text floor: hero proof and mono labels ≥14px (.875rem)
    assert "font-size:.875rem" in css or "font-size: .875rem" in css or "font-size:0.875rem" in css


def test_mobile_matrix_composition():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert ".trace-cards" in css
    assert "display:none" in css  # one of table/cards hidden per breakpoint
    html = HOME.read_text(encoding="utf-8")
    assert "trace-card" in html
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


def test_thankyou_specialist_cta_family():
    obrigado = (ROOT / "obrigado.html").read_text(encoding="utf-8")
    assert "Diagnosticar operação B2G" in obrigado
    assert re.search(r">Diagnosticar operação<", obrigado) is None
    specialist = (ROOT / "especialista" / "tiago-jun-sasaki" / "index.html").read_text(encoding="utf-8")
    assert "Diagnosticar operação B2G" in specialist
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
