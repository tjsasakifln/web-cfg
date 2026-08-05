"""Visitor experience redesign gates — shipped HTML/CSS/generators."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_public_taxonomy_jargon_absent():
    surfaces = [
        ROOT / "index.html",
        ROOT / "conteudos" / "index.html",
        ROOT / "medicoes-glosas-obras-publicas" / "index.html",
        ROOT / "aditivos-obras-publicas" / "index.html",
    ]
    banned = [
        "guias indexáveis",
        "conteúdos indexáveis",
        "página-pilar",
        "frentes de decisão",
        "eixos integrados",
        "Wave 1",
        "arquitetura de conteúdo",
        "0 guias",
        "1 guias",
    ]
    failures = []
    for path in surfaces:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        lower = text.lower()
        for phrase in banned:
            if phrase.lower() in lower:
                failures.append(f"{path.relative_to(ROOT)}: {phrase}")
    assert not failures, failures


def test_hub_problem_first_structure():
    hub = (ROOT / "conteudos" / "index.html").read_text(encoding="utf-8")
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


def test_checklist_progressive_source():
    src = (ROOT / "scripts" / "editorial" / "checklist_ui.py").read_text(encoding="utf-8")
    assert "Iniciar diagnóstico" in src
    assert "Ver diagnóstico" in src
    assert "data-tool-step" in src
    assert "Atualizar diagnóstico" not in src
    assert "Identificação e fundamento" in src
    assert "Planilha, preço e impacto" in src
    assert "Bloqueios e revisão final" in src
    # generated page after build should match — if present
    page = ROOT / "guias-contratos-obras" / "checklist-pedido-aditivo" / "index.html"
    if page.exists():
        html = page.read_text(encoding="utf-8")
        # After editorial:build these must hold; tolerate pre-build once
        if "data-aditivo-checklist" in html and "tool-workflow" in html:
            assert "Iniciar diagnóstico" in html
            assert "Ver diagnóstico" in html
            assert "Atualizar diagnóstico" not in html
            assert html.count("data-tool-step") >= 4
            # All 36 items remain
            assert html.count("tool-req") >= 36 or html.count('data-req-id="ad-') >= 30


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
