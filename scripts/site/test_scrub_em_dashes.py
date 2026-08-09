"""Unit tests for public em-dash scrub rules."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.scrub_em_dashes import (  # noqa: E402
    EM,
    is_official_source_title,
    residual_em_dashes,
    scrub_html,
    scrub_prose,
)


def test_contrast_clause():
    s = "Radar para a sua operação — não para o mercado inteiro."
    out = scrub_prose(s)
    assert EM not in out
    assert "operação, não para" in out


def test_parenthetical_pair():
    s = (
        "Ele precisa do perfil da empresa — capacidade, acervo, órgãos-alvo — "
        "para filtrar o que merece atenção."
    )
    out = scrub_prose(s)
    assert EM not in out
    assert "(capacidade, acervo, órgãos-alvo)" in out


def test_uf_and_region():
    assert "(PR)" in scrub_prose("Edificações públicas — PR")
    assert "Santa Catarina" in scrub_prose("Edificações públicas — Santa Catarina")
    assert EM not in scrub_prose("Edificações públicas — Santa Catarina")


def test_templates():
    s = (
        "Delimite o problema — valor, período, serviço afetado, decisão necessária e "
        "responsável — antes de discutir glosa."
    )
    out = scrub_prose(s)
    assert EM not in out
    assert out.startswith("Delimite o problema (valor")
    assert "próximos passos, sem cadastro" in scrub_prose(
        f"Retornamos com enquadramento técnico e próximos passos — sem cadastro em lista."
    )


def test_chrome_rss():
    out = scrub_prose(f"title=\"CONFENGE {EM} Conteúdos\"")
    assert EM not in out
    assert "CONFENGE · Conteúdos" in out


def test_official_source_preserved():
    s = "Planalto — Lei nº 14.133/2021"
    assert is_official_source_title(s)
    assert scrub_prose(s) == s
    assert scrub_prose(f"Veja TCU — pagamento e o guia.") == f"Veja TCU — pagamento e o guia."


def test_html_protects_source_anchors():
    html = (
        '<p>O desfecho depende de prova — não de narrativa.</p>'
        '<a href="https://www.planalto.gov.br/x">Planalto — Lei nº 14.133/2021</a>'
    )
    out = scrub_html(html)
    assert "prova, não de narrativa" in out
    assert f"Planalto {EM} Lei" in out
    assert residual_em_dashes(out) == []


def test_placeholder_nd():
    assert scrub_prose(f"<td>{EM}</td>") == "<td>n/d</td>"
