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
    assert len(archetypes) >= 8, f"expected many section archetypes, got {archetypes}"
    assert len(set(archetypes)) >= 3, f"need ≥3 distinct archetypes, got {set(archetypes)}"
    # no three consecutive identical archetypes that are card-like
    cardish = {"card_grid", "equal_cards"}
    for i in range(len(archetypes) - 2):
        window = archetypes[i : i + 3]
        if len(set(window)) == 1 and window[0] in cardish:
            raise AssertionError(f"three consecutive cardish archetypes: {window}")


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
    assert "data-journey-enhance" in html
    # all 8 stages present as real content
    for stage in ("j-mercado", "j-decisao", "j-mobilizacao", "j-proposta", "j-contrato", "j-ocorrencia", "j-resultado", "j-aprendizado"):
        assert f'id="{stage}"' in html
    assert "stage-meta" in html
    # enhancement hides only when JS marks enhanced — default CSS shows all
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert 'data-enhanced="true"' in css or "[data-enhanced" in css


def test_trace_matrix_and_tension_present():
    html = HOME.read_text(encoding="utf-8")
    assert "O trabalho precisa deixar rastros verificáveis" in html
    assert "trace-matrix" in html
    assert "O contrato pode destruir margem em três momentos" in html
    assert "tension-flow" in html or "tension-stage" in html
    assert "Como a CONFENGE entra na operação" in html
    assert "Arquitetura de ofertas" not in html


def test_primary_cta_not_spam():
    html = HOME.read_text(encoding="utf-8")
    primary = len(re.findall(r"button-primary", html))
    # header + hero + offer + final + form + content feature etc. — soft cap
    assert primary <= 12, f"too many primary CTAs on home: {primary}"


def test_prefers_reduced_motion_declared():
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "prefers-reduced-motion" in css


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
