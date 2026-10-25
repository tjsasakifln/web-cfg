from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_aditivo_surfaces_one_contextual_next_step_after_the_answer():
    html = read("conteudos/aditivo-empreitada-por-preco-global/index.html")

    assert html.count('id="diagnostico-confenge"') == 1
    assert html.index('id="diagnostico-confenge"') > html.index('id="resposta"')
    assert "Peça uma análise técnica do aditivo" in html
    assert "Dossiê de Aditivo e Serviço Extra" in html
    assert "Não é necessário reunir o dossiê completo" in html
    assert 'href="/aditivos-obras-publicas/#captura-pilar"' in html
    assert 'data-origem="/conteudos/aditivo-empreitada-por-preco-global/"' in html


def test_budget_articles_keep_their_matching_audit_context():
    for path, origin, subject in (
        (
            "conteudos/mobilizacao-desmobilizacao-orcamento-obra/index.html",
            "/conteudos/mobilizacao-desmobilizacao-orcamento-obra/",
            "mobilização, desmobilização e canteiro",
        ),
        (
            "conteudos/bdi-diferenciado-obra-publica/index.html",
            "/conteudos/bdi-diferenciado-obra-publica/",
            "famílias de custo, as incidências, a memória e o modelo do edital",
        ),
    ):
        html = read(path)
        assert "Pedir proposta de revisão do orçamento" in html
        assert subject in html
        assert "não são obrigatórias para iniciar a conversa" in html or "não é exigido para abrir a conversa" in html
        assert 'href="/auditoria-orcamento-licitacao/#captura-pilar"' in html
        assert f'data-origem="{origin}"' in html


def test_medicoes_form_keeps_scope_and_does_not_require_complete_documents():
    html = read("medicoes-glosas-obras-publicas/index.html")

    assert 'id="captura-pilar"' in html
    assert 'name="diagnostico-confenge"' in html
    assert 'name="origem" value="medicoes-glosas-obras-publicas"' in html
    assert 'name="landing_page" value="https://confenge.com.br/medicoes-glosas-obras-publicas/"' in html
    assert "contrato completo, diário, fotos e notas podem ser enviados depois" in html
    assert "Não inclui petição jurídica, representação nem promessa de recebimento." in html


def test_sinapi_search_presentation_and_budget_offer_are_precise():
    html = read("conteudos/sinapi-desonerado-nao-desonerado/index.html")

    assert "Desonerado e não desonerado no SINAPI: o que o edital fixa" in html
    assert "Use a tabela que o edital e a planilha modelo fixam na data-base" in html
    assert "Pedir proposta de revisão do orçamento" in html
    assert 'href="/auditoria-orcamento-licitacao/#captura-pilar"' in html
    assert 'data-origem="/conteudos/sinapi-desonerado-nao-desonerado/"' in html
