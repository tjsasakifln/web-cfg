from __future__ import annotations

import re
from pathlib import Path

from scripts.pseo import build as pseo_build


COMMERCIAL = {
    "/inteligencia/": "im-hub-v1",
    "/inteligencia/orgaos/": "im-clientes-v1",
    "/inteligencia/mercados/": "im-mercados-v1",
    "/inteligencia/concorrencia/": "im-concorrencia-v1",
    "/inteligencia/acompanhamento/": "im-acompanhamento-v1",
    "/inteligencia/precos/": "im-precos-v1",
    "/inteligencia/pesquisa-sob-encomenda/": "im-institucional-v1",
}
EXPECTED_H1 = {
    "/inteligencia/orgaos/": "Mapeamento de distribuidores e clientes para sua empresa",
    "/inteligencia/mercados/": "Estudo de mercado para expansão comercial",
    "/inteligencia/concorrencia/": "Análise de concorrentes e carteira pública de empresas",
    "/inteligencia/acompanhamento/": "Pesquisa de oportunidades entre fornecedores do governo",
    "/inteligencia/precos/": "Pesquisa de preços e condições de fornecimento",
    "/inteligencia/pesquisa-sob-encomenda/": "Pesquisa de mercado para consultorias e associações",
}


def _page(root: Path, route: str) -> str:
    return (root / route.strip("/") / "index.html").read_text(encoding="utf-8")


def test_commercial_hubs_survive_pseo_rebuild(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(pseo_build, "ROOT", tmp_path)
    written = {path.replace("\\", "/") for path in pseo_build.render_hubs([])}

    for route, asset_id in COMMERCIAL.items():
        rel = f"{route.strip('/')}/index.html"
        assert rel in written
        html = _page(tmp_path, route)
        assert 'content="index,follow"' in html
        assert html.count("<form") == 1
        assert html.count('id="captura-estudo"') == 1
        assert 'action="/.netlify/functions/lead"' in html
        assert 'data-runtime-profile="shared_lead_form_v1"' in html
        assert 'data-receipt-required="true"' in html
        assert 'data-route-family="inteligencia-mercado"' in html
        assert 'name="jornada" value="outro"' in html
        assert 'name="estagio" value="pesquisa de mercado"' in html
        assert 'id="jornada-hidden" type="hidden" name="jornada"' in html
        assert 'id="estagio" type="hidden" name="estagio"' in html
        assert 'name="intent" value="market_research_scope"' in html
        assert 'name="evidence_pack_version"' not in html
        assert "data-evidence-pack-version" not in html
        assert 'data-cta-position="hero-proof"' in html
        if route in EXPECTED_H1:
            assert f'<h1 class="t-service">{EXPECTED_H1[route]}</h1>' in html
        assert f'name="asset_id" value="{asset_id}"' in html
        assert 'name="offer_id" value=""' in html
        assert 'name="mensagem"' in html and 'name="nome"' in html
        assert 'name="email"' in html and 'name="telefone"' in html
        assert 'name="consentimento"' in html
        assert "SmartLic" not in html
        assert not re.search(r"relat[oó]rio personalizado instant[aâ]neo|alerta instant[aâ]neo disponível", html, re.I)

    root = _page(tmp_path, "/inteligencia/")
    for route in tuple(COMMERCIAL)[1:]:
        assert f'href="{route}"' in root
    assert 'data-cta-position="hero-proof"' in root
    assert 'href="/inteligencia/relacoes-compradores-fornecedores/"' in root
    assert "/diagnostico-b2g-360/" not in root
    assert "/diretoria-b2g/" not in root


def test_commercial_sitemap_is_finite_and_uses_material_date(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(pseo_build, "ROOT", tmp_path)
    sitemap = pseo_build.write_sitemap([], "2026-08-02").read_text(encoding="utf-8")

    public_routes = tuple(COMMERCIAL) + tuple(
        route for route, _title, _summary in pseo_build.MARKET_INTELLIGENCE_APPROVED_ANALYSES
    )
    assert sitemap.count("<url>") == len(public_routes)
    assert sitemap.count("<lastmod>2026-10-14</lastmod>") == len(public_routes)
    for route in public_routes:
        assert f"<loc>https://confenge.com.br{route}</loc>" in sitemap


def test_only_approved_analyses_render_in_the_public_proof_block():
    html = pseo_build._market_intelligence_root_content()
    assert 'id="analises-publicas-title"' in html
    for route, title, _summary in pseo_build.MARKET_INTELLIGENCE_APPROVED_ANALYSES:
        assert f'href="{route}"' in html
        assert title in html
    assert "/inteligencia/valor-tipico-contratos-pavimentacao/" not in html
