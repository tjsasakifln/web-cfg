"""Contextual links from editorial articles to the tool that does the reader's next step.

One route-exact map. Each article gets at most one short section, placed before
its FAQ (or its closing decision/aside), and only tools that perform the task the
article explains. Re-running is idempotent: the section is rebuilt from the map.

Generated articles (scripts/organic/apply_orcamento_cluster_rewrite.py) call
``apply`` from their handlers, so regeneration keeps the same bytes.

    python3 -m scripts.site.article_tool_links          # check
    python3 -m scripts.site.article_tool_links --write  # apply
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SECTION_ID = "ferramentas-do-caso"
STYLESHEET = '<link href="/assets/article-tools.css" rel="stylesheet"/>'
SECTION_RE = re.compile(r'<section class="article-tools" id="ferramentas-do-caso"[^>]*>.*?</section>\n?', re.S)
ANCHORS = (
    '<section class="article-faq"',
    '<section class="article-decision"',
    '<section class="sources-section"',
    '<aside class="article-aside"',
    '<section id="triagem-quantitativos"',
    '<aside class="editorial-bridge',
)

ADITIVO = ("/ferramentas/limite-acrescimos-supressoes/", "calculadora de limite de aditivo")
ATRASO = ("/ferramentas/matriz-atraso-obra/", "matriz de atraso de obra")
CRITICO = ("/ferramentas/caminho-critico-obra/", "calculadora de caminho crítico")
CRONOS = ("/ferramentas/comparador-cronogramas/", "comparador de cronogramas")
REEQ = ("/ferramentas/checklist-reequilibrio/", "checklist de reequilíbrio")
ORC = ("/ferramentas/orcamento-de-obras/", "orçamento de obras com SINAPI")
BDI = ("/ferramentas/calculadora-bdi/", "calculadora de BDI")
REAJ = ("/ferramentas/planilhas/obra-reajuste-indice/", "planilha de reajuste por índice")
PDF = ("/ferramentas/medir-planta-pdf/", "medição de planta em PDF")
DXF = ("/ferramentas/quantitativos-dxf/", "quantitativos em DXF")
IFCQ = ("/bim/guias/quantitativos-ifc-para-excel/", "guia de quantitativos do IFC para Excel")
IFC = ("/bim/", "visualizador de IFC")
BCF = ("/ferramentas/federacao-bcf/", "federação IFC com apontamentos BCF")
DWG = ("/cad/", "editor de DWG")
FOTO = ("/ferramentas/relatorio-fotografico-vistoria/", "relatório fotográfico de vistoria")

# route -> (sentence with {0}, {1}... placeholders, tools in placeholder order)
MAP: dict[str, tuple[str, tuple[tuple[str, str], ...]]] = {
    "/conteudos/aditivo-empreitada-por-preco-global/": (
        "Antes de pedir o aditivo, confira na {0} quanto do teto de acréscimos o contrato ainda comporta.", (ADITIVO,)),
    "/guias-contratos-obras/checklist-pedido-aditivo/": (
        "Com o checklist em ordem, confira na {0} se o valor do pedido cabe no saldo do contrato.", (ADITIVO,)),
    "/lei-14133-obras/preco-item-novo-desconto-proposta/": (
        "Monte a composição do item novo no {0} e confira o efeito no teto legal com a {1}.", (ORC, ADITIVO)),
    "/conteudos/demolicao-nao-prevista-obra-publica/": (
        "Levante a área demolida com a {0} e confira o saldo do contrato na {1}.", (PDF, ADITIVO)),
    "/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/": (
        "Para organizar fato, nexo e impacto do pedido, siga o {0}.", (REEQ,)),
    "/conteudos/data-base-orcamento-reajuste-obra-publica/": (
        "Calcule o reajuste dos meses em aberto na {0} e, se o índice não cobrir o impacto, siga o {1}.", (REAJ, REEQ)),
    "/conteudos/atraso-obra-culpa-administracao/": (
        "Registre cada evento com prova e responsável na {0} e compare o planejado com o executado no {1}.", (ATRASO, CRONOS)),
    "/conteudos/prorrogacao-prazo-obra-publica-documentos/": (
        "Monte a cronologia do pedido na {0} e calcule os dias que afetam o término na {1}.", (ATRASO, CRITICO)),
    "/conteudos/resposta-notificacao-atraso-obra-publica/": (
        "Antes de responder, organize eventos, provas e responsáveis na {0}.", (ATRASO,)),
    "/conteudos/caminho-critico-cronograma-exemplo/": (
        "Aplique o método ao seu cronograma na {0} e compare versões no {1}.", (CRITICO, CRONOS)),
    "/conteudos/administracao-local-orcamento-obra-publica/": (
        "Monte o item de administração local no {0} e confira o efeito no preço na {1}.", (ORC, BDI)),
    "/conteudos/mobilizacao-desmobilizacao-orcamento-obra/": (
        "Lance mobilização e desmobilização como itens no {0} e confira o preço final na {1}.", (ORC, BDI)),
    "/conteudos/bdi-diferenciado-obra-publica/": (
        "Compare o BDI cheio e o diferenciado com as mesmas parcelas na {0}.", (BDI,)),
    "/conteudos/comprovacao-exequibilidade-proposta-obra/": (
        "Reúna composições e custos no {0} e mostre a formação do preço na {1}.", (ORC, BDI)),
    "/conteudos/revisar-ou-refazer-orcamento-obra/": (
        "Para revisar item a item com a referência atual, use o {0}; para conferir a taxa, a {1}.", (ORC, BDI)),
    "/conteudos/sinapi-ou-sicro-obra-publica/": (
        "Monte a planilha com a referência de cada serviço no {0}.", (ORC,)),
    "/conteudos/comparar-propostas-execucao-obra/": (
        "Para comparar propostas na mesma base, lance os itens no {0} e confira as taxas na {1}.", (ORC, BDI)),
    "/conteudos/planilha-orcamento-reforma-passo-a-passo/": (
        "Meça os ambientes com a {0} e lance os serviços no {1}.", (PDF, ORC)),
    "/conteudos/documentos-para-levantamento-quantitativos/": (
        "Com os arquivos em mãos, meça plantas com a {0}, some blocos e áreas com os {1} e extraia modelos com o {2}.", (PDF, DXF, IFCQ)),
    "/conteudos/empreitada-preco-global-preco-unitario/": (
        "Para conferir o quantitativo do projeto antes da proposta, meça a planta com a {0} e monte os itens no {1}.", (PDF, ORC)),
    "/conteudos/quando-compatibilizar-projetos/": (
        "Para comparar os modelos lado a lado, abra os IFC no {0} e registre interferências com a {1}.", (IFC, BCF)),
    "/conteudos/como-contratar-compatibilizacao-projetos/": (
        "Para uma primeira leitura dos arquivos, abra os modelos no {0} e as plantas no {1}.", (IFC, DWG)),
    "/conteudos/revisao-compatibilizacao-ou-elaboracao-projetos/": (
        "Para conferir os arquivos antes da proposta, abra plantas no {0} e modelos no {1}.", (DWG, IFC)),
    "/conteudos/como-contratar-revisao-tecnica-projeto/": (
        "Para separar o que vai à revisão, abra as plantas no {0} e os modelos no {1}.", (DWG, IFC)),
    "/conteudos/laudo-de-reforma/": (
        "Para registrar o estado do apartamento antes da obra, gere um {0}.", (FOTO,)),
}


def _count(html: str) -> str:
    """The section is visible article text, so Article.wordCount must include it."""
    from scripts.site.sync_article_word_counts import sync_word_count

    return sync_word_count(html)


def render(route: str) -> str:
    sentence, tools = MAP[route]
    links = [
        f'<a href="{href}" data-cta-position="article_tools" data-tool-link="{href.strip("/").split("/")[-1]}">{label}</a>'
        for href, label in tools
    ]
    return (
        f'<section class="article-tools" id="{SECTION_ID}" data-article-tools="1">'
        f'<h2>Ferramenta para este caso</h2><p>{sentence.format(*links)}</p></section>'
    )


def apply(html: str, route: str) -> str:
    """Insert or rebuild the route's tool section. Routes outside the map are untouched."""
    if route not in MAP:
        return html
    html = SECTION_RE.sub("", html)
    if STYLESHEET not in html:
        head_end = html.find("</head>")
        if head_end < 0:
            raise ValueError(f"article_tool_links_head_missing:{route}")
        html = html[:head_end] + STYLESHEET + "\n" + html[head_end:]
    main_start = html.find("<main")
    for anchor in ANCHORS:
        at = html.find(anchor, main_start)
        if at > 0:
            return _count(html[:at] + render(route) + "\n" + html[at:])
    main_end = html.find("</main>", main_start)
    at = html.rfind("</article>", main_start, main_end if main_end > 0 else len(html))
    if at > 0:
        return _count(html[:at] + render(route) + "\n" + html[at:])
    raise ValueError(f"article_tool_links_anchor_missing:{route}")


def check(root: Path = ROOT, write: bool = False) -> dict:
    changed, errors = [], []
    for route in MAP:
        path = root / route.strip("/") / "index.html"
        for href, _ in MAP[route][1]:
            if not (root / href.strip("/") / "index.html").is_file():
                errors.append(f"missing_tool:{route}->{href}")
        if not path.is_file():
            errors.append(f"missing_article:{route}")
            continue
        text = path.read_text(encoding="utf-8")
        updated = apply(text, route)
        if updated != text:
            changed.append(route)
            if write:
                path.write_text(updated, encoding="utf-8")
    return {"ok": not errors and (write or not changed), "routes": len(MAP), "changed": changed, "errors": errors}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    result = check(write=args.write)
    print(result)
    return 0 if result["ok"] or args.write and not result["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
