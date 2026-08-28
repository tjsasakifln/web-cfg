#!/usr/bin/env python3
"""Rewrite the nine orçamento-cluster library pages in place (CFG10X-08)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DATE = "2026-08-28"
DATE_LABEL = "28 de agosto de 2026"
FILE = '<svg class="icon"><use href="#i-file"></use></svg>'
ARROW = '<svg class="icon"><use href="#i-arrow"></use></svg>'
CHECK = '<svg class="icon"><use href="#i-check"></use></svg>'
SHIELD = '<svg class="icon"><use href="#i-shield"></use></svg>'
LEI = "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm"
CAIXA_PDF = "https://www.caixa.gov.br/Downloads/sinapi-metodologia/Livro_SINAPI_Metodologias_Conceitos.pdf"
CAIXA = "https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx"
SICRO = "https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-e-pagamentos/custos-e-pagamentos-dnit/sistemas-de-custos/sicro"
TCU_EPG = "https://licitacoesecontratos.tcu.gov.br/4-4-1-2-empreitada-por-preco-global-epg/"
TCU_REQ = "https://licitacoesecontratos.tcu.gov.br/6-2-2-1-1-reequilibrio-economico-financeiro-recomposicao-ou-revisao-2/"

AUTHOR = """<section class="author-box"><div class="author-photo"><img src="/assets/tiago-sasaki-avatar-v11-sem-fundo.png" width="512" height="512" alt="Engº Tiago Sasaki" loading="lazy" decoding="async"/></div><div><span>Autor e responsável técnico pelo conteúdo</span><h2><a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a></h2><p>Engenheiro Civil formado pela EESC-USP, com experiência na iniciativa privada e na Administração Pública, atuando em fiscalização, gestão de contratos, orçamentação e decisões técnicas em obras públicas.</p><a class="text-link" href="/especialista/tiago-jun-sasaki/">Conhecer a experiência """ + ARROW + """</a></div></section>"""


def example_section(
    *,
    example_id: str,
    formula: str,
    result: str,
    unit: str,
    fonte_url: str,
    fonte_date: str,
    title: str,
    intro: str,
    inputs: list[tuple[str, str, str, str]],
    result_label: str,
    limit: str,
) -> str:
    rows = []
    for name, label, value, in_unit in inputs:
        rows.append(
            "<tr>"
            f"<th scope='row'>{label}</th>"
            f"<td><code>{name}</code></td>"
            f"<td data-input='{name}' data-value='{value}'>{value}</td>"
            f"<td>{in_unit}</td>"
            "</tr>"
        )
    rows.append(
        "<tr>"
        f"<th scope='row'>{result_label}</th>"
        f"<td><code>{formula}</code></td>"
        f"<td>{result}</td>"
        f"<td>{unit}</td>"
        "</tr>"
    )
    body = "".join(rows)
    return f"""<section id="exemplo-calculo" class="worked-example" data-example-id="{example_id}" data-formula="{formula}" data-result="{result}" data-unit="{unit}" data-fonte-url="{fonte_url}" data-fonte-date="{fonte_date}">
<p class="eyebrow">Exemplo reproduzível</p>
<h2>{title}</h2>
<p>{intro}</p>
<div class="table-wrap" role="group" tabindex="0" aria-label="{title}"><table class="compare-table">
<thead><tr><th scope="col">Premissa</th><th scope="col">Símbolo</th><th scope="col">Valor</th><th scope="col">Unidade</th></tr></thead>
<tbody>{body}</tbody>
</table></div>
<p><strong>Fórmula.</strong> <code>{formula}</code>. Os números acima são premissas do exemplo, não tabela oficial do mês.</p>
<p class="example-limit"><strong>Limite.</strong> {limit}</p>
<p>Fonte primária: <a href="{fonte_url}" rel="noopener noreferrer" target="_blank">documento oficial (data {fonte_date}){ARROW}</a>.</p>
</section>"""


def docs(items: list[str]) -> str:
    lis = "".join(f"<li>{FILE}<span>{item}</span></li>" for item in items)
    return f'<ul class="document-list">{lis}</ul>'


def cards(items: list[tuple[str, str, str]]) -> str:
    blocks = []
    for num, title, body in items:
        blocks.append(
            f'<div class="criterion-card"><span>{num}</span><div><h3>{title}</h3><p>{body}</p></div></div>'
        )
    return '<div class="criteria-grid">' + "".join(blocks) + "</div>"


def actions(items: list[tuple[str, str, str]]) -> str:
    lis = []
    for num, title, body in items:
        lis.append(
            f"<li><span>{num}</span><div><strong>{title}</strong><p>{body}</p></div></li>"
        )
    return '<ol class="action-list">' + "".join(lis) + "</ol>"


def faq(pairs: list[tuple[str, str]]) -> str:
    bits = []
    for q, a in pairs:
        bits.append(f"<details><summary>{q}</summary><p>{a}</p></details>")
    return (
        '<section class="article-faq"><p class="eyebrow">Perguntas frequentes</p>'
        "<h2>Dúvidas objetivas</h2>"
        f'<div class="faq-list">{"".join(bits)}</div></section>'
    )


def sources(links: list[tuple[str, str]], note: str) -> str:
    lis = "".join(
        f'<li><a href="{href}" rel="noopener noreferrer" target="_blank">{label}{ARROW}</a></li>'
        for href, label in links
    )
    return (
        '<section class="sources-section" id="fontes"><p class="eyebrow">Referências oficiais</p>'
        "<h2>Fontes primárias deste guia</h2>"
        f"<p>{note}</p><ul>{lis}</ul>"
        f'<p class="sources-reviewed">Fontes oficiais verificadas em <time datetime="{DATE}">{DATE_LABEL}</time>. Confirme o texto vigente do edital e do contrato.</p>'
        '<p class="technical-note">Conteúdo educacional. Não substitui análise dos documentos do certame nem manifestação jurídica quando necessária.</p></section>'
    )


def related(items: list[tuple[str, str, str]], hub: tuple[str, str]) -> str:
    cards_html = "".join(
        f'<a class="related-card" href="{href}"><span>{kicker}</span><strong>{title}</strong><small>Guia técnico</small></a>'
        for href, kicker, title in items
    )
    return (
        '<section class="related-section"><p class="eyebrow">Continue o diagnóstico</p>'
        f"<h2>Conteúdos relacionados</h2><div class=\"related-grid\">{cards_html}</div>"
        f'<a class="text-link" href="{hub[0]}">{hub[1]} {ARROW}</a></section>'
    )


def cta(slug: str, journey: str, theme: str, wa: str, heading: str, body: str, wa_label: str) -> str:
    from urllib.parse import quote

    wa_url = "https://wa.me/5548988344559?text=" + quote(wa)
    form = (
        f"/?jornada={journey}&amp;tema={quote(theme)}&amp;origem=/conteudos/{slug}/#contato"
    )
    return f"""<section class="lead-inline" id="diagnostico-confenge" aria-label="Próximo passo" data-journey="{journey}"><div class="lead-inline-copy"><span>Próximo passo</span><strong>{heading}</strong><p>{body}</p></div><div class="lead-inline-actions"><a class="button button-primary" data-cta-position="inline" data-journey="{journey}" href="{wa_url}" rel="noopener" target="_blank">{wa_label}</a><a class="button button-secondary" data-cta-position="form" data-journey="{journey}" href="{form}">Continuar pelo formulário</a></div></section>"""


def decision(wa: str, body: str) -> str:
    from urllib.parse import quote

    url = "https://wa.me/5548988344559?text=" + quote(wa)
    return (
        '<section class="article-decision"><p class="eyebrow">Decisão empresarial</p>'
        "<h2>Quando vale uma leitura externa</h2>"
        f"<p>{body}</p>"
        f'<a class="button button-primary button-lg" href="{url}" rel="noopener" target="_blank">Analisar este cenário {ARROW}</a></section>'
    )


def toc(links: list[tuple[str, str]]) -> str:
    anchors = "".join(f'<a href="{href}">{label}</a>' for href, label in links)
    return f'<nav aria-label="Nesta página" class="article-toc"><strong>Nesta página</strong>{anchors}</nav>'


def callout(title: str, body: str) -> str:
    return (
        f'<section class="article-callout">{SHIELD}<div><strong>{title}</strong><p>{body}</p></div></section>'
    )


def extract_bridge(html: str) -> str:
    m = re.search(
        r'<aside class="editorial-bridge commercial-bridge".*?</aside>',
        html,
        flags=re.S,
    )
    if not m:
        raise SystemExit("commercial bridge missing")
    return m.group(0)


def extract_chassis(html: str) -> str:
    m = re.search(
        r"<!-- organic-breakout-chassis:.*?<!-- /organic-breakout-chassis -->",
        html,
        flags=re.S,
    )
    return m.group(0) if m else ""


def replace_article(html: str, inner: str) -> str:
    start = re.search(r'<article class="article-main"[^>]*>', html)
    end = html.rfind("</article>")
    if not start or end < 0:
        raise SystemExit("article bounds missing")
    return html[: start.end()] + inner + html[end:]


def _replace_attr_tag(html: str, attr: str, name: str, value: str) -> str:
    pattern = re.compile(
        rf"<meta\b[^>]*(?:{attr}=[\"']{re.escape(name)}[\"'][^>]*content=[\"'][^\"']*[\"']|content=[\"'][^\"']*[\"'][^>]*{attr}=[\"']{re.escape(name)}[\"'])[^>]*>",
        flags=re.I,
    )

    def repl(match: re.Match[str]) -> str:
        return re.sub(r'content="[^"]*"', f'content="{value}"', match.group(0), count=1)

    return pattern.sub(repl, html, count=1)


def set_head(
    html: str,
    *,
    title: str,
    description: str,
    h1: str,
    lead: str,
    faqs: list[tuple[str, str]],
    citations: list[str],
    headline: str,
) -> str:
    html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.S)
    html = _replace_attr_tag(html, "name", "description", description)
    html = _replace_attr_tag(html, "property", "og:title", title)
    html = _replace_attr_tag(html, "property", "og:description", description)
    html = re.sub(
        r'(property="article:modified_time" content=")[^"]*',
        rf"\1{DATE}",
        html,
        count=1,
    )
    html = re.sub(r"(<h1>)(.*?)(</h1>)", rf"\1{h1}\3", html, count=1, flags=re.S)
    html = re.sub(
        r'(<p class="content-lead">)(.*?)(</p>)',
        rf"\1{lead}\3",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r"<time datetime=\"[^\"]+\">[^<]+</time>",
        f'<time datetime="{DATE}">{DATE_LABEL}</time>',
        html,
        count=1,
    )

    def _ld(match: re.Match[str]) -> str:
        data = json.loads(match.group(1))
        nodes = data.get("@graph", [data])
        for node in nodes:
            kind = node.get("@type")
            if kind == "Article":
                node["headline"] = headline
                node["description"] = description
                node["dateModified"] = DATE
                node["citation"] = citations
                node["keywords"] = [headline, "obras públicas", "contratos públicos"]
                text_len = len(re.sub(r"\s+", " ", description + " " + headline))
                node["wordCount"] = max(int(node.get("wordCount") or 0), text_len)
            if kind == "FAQPage":
                node["mainEntity"] = [
                    {
                        "@type": "Question",
                        "name": question,
                        "acceptedAnswer": {"@type": "Answer", "text": answer},
                    }
                    for question, answer in faqs
                ]
        dumped = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return f'<script type="application/ld+json">{dumped}</script>'

    html = re.sub(
        r'<script type="application/ld\+json">(\{"@context":"https://schema.org","@graph":.*?)</script>',
        _ld,
        html,
        count=1,
        flags=re.S,
    )
    return html


def page_admin(html: str) -> str:
    slug = "administracao-local-orcamento-obra-publica"
    faqs = [
        (
            "Administração local vai no BDI ou em item próprio?",
            "Vale o modelo do orçamento de referência do edital. Se a equipe de canteiro já está no BDI, lançar o mesmo posto como item duplica custo. Se o órgão discriminou item, omitir no BDI e no item deixa a proposta sem cobertura na execução.",
        ),
        (
            "O que não se mistura com reajuste ou reequilíbrio?",
            "Administração local é classificação de custo no orçamento de referência e na proposta. Reajuste corrige índice. Reequilíbrio trata evento extraordinário. Exequibilidade testa se o preço fecha. Cada um tem prova própria.",
        ),
        (
            "Como provar que não houve duplicidade?",
            "Compare a memória de BDI do órgão, as composições de canteiro e a planilha da proposta posto a posto. Um terceiro precisa ver uma única casa para engenheiro residente, encarregado e apoio.",
        ),
    ]
    example = example_section(
        example_id="al-item-11x19800",
        formula="n_months * monthly_team_brl",
        result="217800",
        unit="BRL",
        fonte_url=CAIXA_PDF,
        fonte_date="2026-08-02",
        title="Equipe de canteiro lançada duas vezes",
        intro="Premissa ilustrativa de um posto de engenheiro residente mais encarregado, 11 meses de canteiro. Não é custo SINAPI do mês. Serve para ver o efeito de classificar administração local como item enquanto o BDI do orçamento de referência já carrega a mesma equipe.",
        inputs=[
            ("n_months", "Prazo de canteiro", "11", "mês"),
            ("monthly_team_brl", "Custo mensal do posto (premissa)", "19800", "BRL/mês"),
        ],
        result_label="Valor do item de administração local",
        limit="O produto 11 × 19.800 = 217.800 não autoriza copiar esse valor para outro edital. Se o BDI de referência já remunerar o mesmo posto, o item extra é duplicidade na proposta, não custo novo de execução.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>Administração local é <strong>classificação de custo no orçamento de referência</strong>: item de planilha, parcela de BDI ou modelo misto. O que vale é o memorial do órgão, não o hábito interno da empresa. Erro clássico da proposta: precificar engenheiro residente no BDI e de novo como item, ou omitir nos dois e descobrir o rombo na execução.</p></div>
<p class="article-intro">Quem fecha planilha precisa saber onde o edital alojou a equipe de canteiro antes de copiar percentual de BDI ou inventar um item. Esta página trata só dessa classificação. Não calcula reajuste, não pede reequilíbrio e não prova exequibilidade.</p>
{toc([("#resposta", "Resposta"), ("#casas", "Três casas"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Documentos"), ("#plano", "Sequência"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="casas"><p class="eyebrow">Onde o custo mora</p>
<h2>Item, BDI ou os dois, o memorial manda</h2>
<p>No orçamento de referência, administração local descreve postos permanentes de canteiro (residente, encarregado, apontador, veículo de apoio) enquanto o serviço acontece. Não é mobilização (ida e volta do canteiro), não é BDI de material e não é reajuste de índice.</p>
{cards([
    ("01", "Item discriminado", "O órgão listou postos, unidades e prazo. A proposta replica o item e tira o mesmo custo do BDI. Medição na execução segue o critério do item (mês, percentual de avanço ou verba)."),
    ("02", "Somente BDI", "Não há linha de administração local. A taxa de BDI do modelo precisa comportar a equipe real. Inventar item além do modelo é recusa típica na análise de preço."),
    ("03", "Modelo misto", "Parte em item (residente) e parte no BDI (apoio). A memória tem de mostrar a fronteira. Sem fronteira, a diligência lê duplicidade."),
])}
<p>Proposta e execução herdam essa casa. Mudar a classificação depois de assinar não é reajuste e só vira reequilíbrio se um evento da matriz ou um fato da Administração alterar o encargo, o que esta página não calcula.</p>
</section>
{callout("Uma casa por posto.", "Se o engenheiro residente já está no BDI de referência, o item de planilha com o mesmo posto não é 'criterio conservador': é preço inflado no orçamento aparente e alvo de glosa ou desclassificação.")}
{example}
<section id="documentos"><p class="eyebrow">O que confrontar</p>
<h2>Peças que mostram a casa do custo</h2>
{docs([
    "Memorial de BDI do orçamento de referência (componentes e o que entra em custo direto)",
    "Planilha do órgão com linhas de administração local, canteiro e instalações",
    "Composições dos postos (encargo, salário-base, produtividade de apoio)",
    "Cronograma com prazo de canteiro, não só prazo de serviço",
    "Regra de medição do item, se existir (mês, avanço, verba)",
    "Proposta da empresa com a mesma fronteira item versus BDI",
])}
</section>
<section id="plano"><p class="eyebrow">Antes de fechar unitários</p>
<h2>Sequência para não duplicar equipe</h2>
{actions([
    ("01", "Ler o memorial de BDI do órgão", "Marque se administração local, canteiro e equipamentos de apoio estão no BDI, no custo direto ou mistos."),
    ("02", "Listar postos e prazo de canteiro", "Residente, encarregado, apontador, veículo. Amarre ao cronograma, não a um percentual genérico."),
    ("03", "Cruzar item a item com o BDI", "Cada posto aparece em uma casa só. Se aparecer nas duas, a proposta está inflada em 217.800 no exemplo desta página."),
    ("04", "Ajustar a proposta, não o índice", "Correção de classificação é memória de cálculo da proposta. Não use reajuste nem reequilíbrio para consertar omissão de equipe."),
])}
</section>
<section id="erros"><p class="eyebrow">Falhas de classificação</p>
<h2>O que a diligência derruba</h2>
<ul class="error-list">
<li>Copiar BDI interno da empresa por cima do modelo do orçamento de referência.</li>
<li>Lançar administração local como item e manter o mesmo componente no BDI.</li>
<li>Zerar o item porque o concorrente zerou, sem ver se o BDI cobre o posto.</li>
<li>Tratar prorrogação de prazo como reajuste de índice em vez de medir o item mensal, se o contrato medir por mês.</li>
<li>Usar esta classificação para discutir exequibilidade global sem olhar a curva ABC.</li>
</ul>
</section>
{cta(slug, "edital", "Administração local no orçamento: direto, BDI ou planilha?", "Olá, Tiago. Preciso conferir se a administração local do edital está no BDI, no item ou nos dois.", "Enviar planilha e memorial de BDI", "Indicamos se há duplicidade de posto, omissão de equipe ou só ajuste de memória antes do envio.", "Enviar planilha no WhatsApp")}
{decision("Olá, Tiago. Preciso conferir se a administração local do orçamento está como custo direto, BDI ou item.", "Vale quando o memorial de BDI é ambíguo, a planilha mistura canteiro com serviço, ou a equipe real não cabe na taxa do órgão.")}
{faq(faqs)}
{sources(
    [
        (CAIXA_PDF, "CAIXA: metodologia SINAPI (custo direto versus BDI)"),
        (LEI, "Lei 14.133/2021, art. 23 (orçamento de referência da Administração)"),
        (TCU_EPG, "TCU: leitura de preço global e planilha"),
    ],
    "A metodologia SINAPI da CAIXA separa custo direto de BDI. A Lei 14.133, art. 23, disciplina o orçamento de referência, não a classificação interna da proposta. O edital prevalece.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/mobilizacao-desmobilizacao-orcamento-obra/", "Orçamento e BDI", "Mobilização e desmobilização na planilha"),
        ("/conteudos/bdi-diferenciado-obra-publica/", "Orçamento e BDI", "BDI diferenciado em materiais e equipamentos"),
    ],
    ("/auditoria-orcamento-licitacao/", "Ver todos em Orçamento e BDI"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Administração local no orçamento: direto, BDI ou planilha? | CONFENGE",
        description="Onde alojar equipe de canteiro no orçamento de referência: item, BDI ou os dois, com cálculo de duplicidade.",
        h1="Administração local no orçamento: direto, BDI ou planilha?",
        lead="Equipe de canteiro mora em uma casa só. O memorial do orçamento de referência diz se é item, BDI ou modelo misto. Duplicar posto infla a proposta; omitir estoura a execução.",
        faqs=faqs,
        citations=[CAIXA_PDF, LEI, TCU_EPG],
        headline="Administração local: item, BDI ou planilha?",
    )


def page_exequib(html: str) -> str:
    slug = "comprovacao-exequibilidade-proposta-obra"
    faqs = [
        (
            "Quando a proposta de obra é presumida inexequível?",
            "Na Lei 14.133/2021, art. 59, § 4º, propostas de obras e serviços de engenharia inferiores a 75% do valor orçado pela Administração são consideradas inexequíveis. O § 2º ainda autoriza diligência. O edital pode detalhar unitários.",
        ),
        (
            "O que a garantia adicional de 85% não substitui?",
            "O art. 59, § 5º, exige garantia extra se a proposta ficar abaixo de 85% do orçado. Isso não prova que o preço executa. Composição, produtividade e BDI da proposta continuam no dossiê da diligência.",
        ),
        (
            "Exequibilidade é a mesma coisa que reajuste?",
            "Não. Exequibilidade testa a proposta contra o orçamento de referência no certame. Reajuste aplica índice na execução. Reequilíbrio trata evento extraordinário. Misturar os três no mesmo ofício enfraquece a prova.",
        ),
    ]
    example = example_section(
        example_id="exeq-3480-4800-075",
        formula="proposta_brl / orcamento_referencia_brl",
        result="0.725",
        unit="ratio",
        fonte_url=LEI,
        fonte_date="2021-04-01",
        title="Proposta a 72,5% do orçamento de referência",
        intro="Números redondos só para aplicar o art. 59, § 4º, da Lei 14.133/2021 (texto compilado no Planalto, acesso em 2026-08-28). Não são preços de um certame real.",
        inputs=[
            ("proposta_brl", "Valor global da proposta", "3480000", "BRL"),
            ("orcamento_referencia_brl", "Valor orçado pela Administração", "4800000", "BRL"),
        ],
        result_label="Relação proposta / orçamento",
        limit="0,725 está abaixo de 0,75. A presunção legal de inexequibilidade incide neste recorte de obras e serviços de engenharia. O edital pode exigir prova de unitários relevantes (art. 59, § 3º). A página não calcula reajuste nem reequilíbrio.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>Exequibilidade é teste da <strong>proposta</strong> contra o <strong>orçamento de referência</strong>. Em obras e serviços de engenharia, a Lei 14.133/2021, art. 59, § 4º, presume inexequível o valor global inferior a 75% do orçado. A diligência (art. 59, § 2º e IV) pede memória da proposta, não narrativa. Reajuste e reequilíbrio não entram nesse ofício.</p></div>
<p class="article-intro">A construtora que responde diligência precisa mostrar que o desconto cabe em composição, produtividade e BDI sem abrir jogo de planilha. Esta página não ensina a escolher SINAPI ou SICRO e não mede índice de reajuste.</p>
{toc([("#resposta", "Resposta"), ("#limiares", "Limiares legais"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Dossiê"), ("#plano", "Resposta"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="limiares"><p class="eyebrow">Lei 14.133/2021, art. 59</p>
<h2>75% presume, 85% pede garantia extra</h2>
<p>O orçamento de referência é o valor orçado pela Administração. A proposta é o valor ofertado. A execução só começa depois da assinatura. Confundir os três faz a empresa protocolar reajuste no lugar de composição.</p>
{cards([
    ("01", "Presunção de 75%", "Art. 59, § 4º: em obras e serviços de engenharia, proposta inferior a 75% do orçado é considerada inexequível. Ainda cabe o que o edital disser sobre unitários relevantes (§ 3º)."),
    ("02", "Garantia adicional de 85%", "Art. 59, § 5º: vencedor abaixo de 85% do orçado presta garantia extra igual à diferença até o orçado, sem prejuízo das demais garantias. Isso não fecha a diligência de composição."),
    ("03", "Diligência da proposta", "Art. 59, IV e § 2º: a Administração pode exigir que a exequibilidade seja demonstrada. O dossiê fala da proposta (composições, cotações, BDI), não de índice futuro nem de evento de matriz."),
])}
</section>
{callout("Não envie a planilha interna inteira sem filtro.", "A diligência pede os itens questionados, com memória que um terceiro reproduz. Anexar custo confidencial irrelevante ou esconder premissa de produtividade são dois modos de perder o certame.")}
{example}
<section id="documentos"><p class="eyebrow">Dossiê da diligência</p>
<h2>O que comprova a proposta, não o contrato futuro</h2>
{docs([
    "Planilha da proposta com os itens apontados na diligência",
    "Composições próprias ou referenciais na mesma base do edital",
    "Cotações nominais dos insumos críticos, com prazo e frete",
    "Memória de BDI coerente com a família de cada item",
    "Premissa de produtividade e regime de encargos da empresa",
    "Cálculo da relação proposta / orçamento de referência (global e unitários relevantes)",
])}
</section>
<section id="plano"><p class="eyebrow">Resposta no prazo do edital</p>
<h2>Como demonstrar sem fragilizar a planilha</h2>
{actions([
    ("01", "Calcular a relação global", "Divida a proposta pelo orçamento de referência. No exemplo, 3.480.000 / 4.800.000 = 0,725. Abaixo de 0,75 a presunção legal já pesa."),
    ("02", "Separar unitários relevantes", "O art. 59, § 3º, olha global e unitários. Responda o que a diligência apontou, não um romance de BDI."),
    ("03", "Mostrar uma premissa por insumo crítico", "Cotação, coeficiente e encargo. Se a premissa for agressiva, escreva por que executa, não por que 'sempre foi assim'."),
    ("04", "Não misturar reajuste nem reequilíbrio", "Índice contratual e evento de matriz são da execução. Nesta fase o objeto é a proposta."),
])}
</section>
<section id="erros"><p class="eyebrow">O que desclassifica</p>
<h2>Respostas que não demonstram preço</h2>
<ul class="error-list">
<li>Ofício jurídico sem composição dos itens apontados.</li>
<li>Planilha genérica que não conversa com a diligência.</li>
<li>Invocar reajuste futuro para justificar desconto presente.</li>
<li>Abrir custo confidencial irrelevante e esconder o coeficiente que realmente move o unitário.</li>
<li>Tratar a garantia adicional de 85% como prova de que o preço executa.</li>
</ul>
</section>
{cta(slug, "edital", "Exequibilidade da proposta: o que comprovar", "Olá, Tiago. Recebi diligência de exequibilidade e quero enviar a planilha e o orçamento de referência.", "Enviar diligência e planilha", "Organizamos o que a presunção de 75% exige e o que a memória da proposta ainda não mostra.", "Enviar diligência no WhatsApp")}
{decision("Olá, Tiago. Preciso comprovar exequibilidade da proposta sem fragilizar a planilha.", "Útil quando a relação global encosta ou fura 75%, a diligência aponta unitários da curva ABC, ou a equipe quer enviar a planilha interna inteira.")}
{faq(faqs)}
{sources(
    [
        (LEI, "Lei 14.133/2021, art. 59 (desclassificação e exequibilidade)"),
        (TCU_EPG, "TCU: preço global e análise de planilha"),
        (CAIXA_PDF, "CAIXA: metodologia SINAPI (composição e BDI)"),
    ],
    "O art. 59 da Lei 14.133/2021 (Planalto, 1º de abril de 2021; acesso em 28 de agosto de 2026) é a fonte dos limiares de 75% e 85%. O edital pode particularizar unitários. Não há índice de reajuste nesta página.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/empreitada-preco-global-preco-unitario/", "Edital e proposta", "Preço global ou unitário: o risco de quantidade"),
        ("/conteudos/sinapi-desonerado-nao-desonerado/", "Orçamento e BDI", "Desonerado e não desonerado no SINAPI"),
    ],
    ("/diagnostico-pre-licitacao/", "Ver todos em Edital e proposta"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Exequibilidade da proposta: o que comprovar | CONFENGE",
        description="Como aplicar os 75% do art. 59 da Lei 14.133 na proposta, o que enviar na diligência e o que não misturar com reajuste.",
        h1="Exequibilidade da proposta: o que comprovar",
        lead="Abaixo de 75% do orçamento de referência a lei presume inexequível a proposta de obra. A diligência pede composição da proposta, não índice de reajuste nem evento de matriz.",
        faqs=faqs,
        citations=[LEI, TCU_EPG, CAIXA_PDF],
        headline="Exequibilidade da proposta: o que comprovar",
    )


def page_database(html: str) -> str:
    slug = "data-base-orcamento-reajuste-obra-publica"
    faqs = [
        (
            "A data-base do orçamento é a da proposta?",
            "Não necessariamente. O art. 25, § 7º, da Lei 14.133/2021 obriga o edital a prever índice de reajustamento com data-base vinculada à data do orçamento estimado. A proposta precisa conversar com essa âncora. Trocar o mês da tabela sem esclarecimento gera unitário deslocado.",
        ),
        (
            "Reajuste recupera atraso de ordem de serviço?",
            "Reajuste, no art. 6º, LVIII, aplica o índice contratual. Atraso imputável à Administração, se alterar encargo, caminha por reequilíbrio (art. 124, II, d, e art. 103), não por apostila de índice. O exemplo desta página mede só meses descobertos de índice.",
        ),
        (
            "Apostila substitui termo aditivo no reajuste?",
            "O art. 136, I, permite registrar reajuste ou repactuação previstos no contrato por apostila. Isso não cria índice novo nem cobre evento de matriz.",
        ),
    ]
    example = example_section(
        example_id="reajuste-2730k-72bp-6m",
        formula="principal_brl * monthly_index * uncovered_months",
        result="117936",
        unit="BRL",
        fonte_url=LEI,
        fonte_date="2021-04-01",
        title="Seis meses sem cobertura de índice",
        intro="Aproximação linear para mostrar o efeito de meses entre a data-base do orçamento estimado e o primeiro reajuste efetivo. O índice 0,0072 a.m. é premissa do exemplo, não o INCC nem qualquer série vigente.",
        inputs=[
            ("principal_brl", "Saldo sujeito a reajuste (premissa)", "2730000", "BRL"),
            ("monthly_index", "Variação mensal ilustrativa", "0.0072", "1/mês"),
            ("uncovered_months", "Meses sem aplicação de índice", "6", "mês"),
        ],
        result_label="Variação não recuperada (aproximação linear)",
        limit="A fórmula do contrato (índice, periodicidade, defasagem) prevalece. Esta conta não é reequilíbrio, não usa tabela oficial do mês e não autoriza apostilar 117.936 em nenhum contrato.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>Reajuste é aplicação do <strong>índice contratual</strong> com data-base amarrada ao <strong>orçamento estimado</strong> (Lei 14.133/2021, art. 25, § 7º, e art. 6º, LVIII). Não substitui reequilíbrio por evento extraordinário e não corrige erro de classificação de BDI na proposta. Meses entre a data-base e o primeiro índice efetivo são margem que a empresa financia, se o contrato não cobrir.</p></div>
<p class="article-intro">Quem lê edital precisa marcar três datas: data-base do orçamento de referência, data da proposta e aniversário de reajuste. Esta página mede o vão entre elas. Não classifica administração local e não prova exequibilidade.</p>
{toc([("#resposta", "Resposta"), ("#datas", "Três datas"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Cláusulas"), ("#plano", "Calendário"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="datas"><p class="eyebrow">Orçamento, proposta, execução</p>
<h2>Data-base não é aniversário de reajuste</h2>
<p>O orçamento de referência nasce numa data-base. A proposta copia essa âncora. A execução só recebe reajuste quando o contrato dispara o índice. O vão entre a âncora e o primeiro índice é risco de caixa, não evento de matriz.</p>
{cards([
    ("01", "Data-base do orçamento estimado", "Art. 25, § 7º: o edital prevê índice com data-base vinculada ao orçamento estimado. Tabelas SINAPI ou SICRO do mês errado deslocam o orçamento de referência."),
    ("02", "Periodicidade e índice", "Art. 92, V: o contrato traz critérios, data-base e periodicidade do reajustamento. Sem série e sem fórmula, a apostila do art. 136 não tem o que registrar."),
    ("03", "O que o reajuste não cobre", "Fato do príncipe, atraso da Administração ou álea extraordinária caminham por reequilíbrio (art. 124, II, d). Classificação de BDI e exequibilidade da proposta são de outro ofício."),
])}
</section>
{callout("Índice ilustrativo não é série oficial.", "O 0,72% a.m. do exemplo é premissa. Publicar 'INCC do mês' sem a série primária e a data da coleta seria regra sem fonte. Use a cláusula e a série que o contrato nomeia.")}
{example}
<section id="documentos"><p class="eyebrow">Cláusulas e séries</p>
<h2>O que precisa estar no dossiê de reajuste</h2>
{docs([
    "Edital: data-base do orçamento estimado e índice (art. 25, § 7º)",
    "Contrato: cláusula de reajustamento, periodicidade e fórmula (art. 92, V)",
    "Série oficial do índice nomeado, com data de publicação",
    "Cronograma e datas de ordem de serviço e de medições",
    "Memória do primeiro aniversário e dos meses descobertos",
    "Distinção escrita entre reajuste, repactuação e reequilíbrio",
])}
</section>
<section id="plano"><p class="eyebrow">Antes da primeira medição</p>
<h2>Calendário que um terceiro reproduz</h2>
{actions([
    ("01", "Fixar a âncora", "Copie a data-base do orçamento estimado. Se a proposta usou outra competência de tabela, trate como esclarecimento, não como reajuste."),
    ("02", "Marcar o primeiro índice", "Leia periodicidade e defasagem. Conte os meses descobertos. No exemplo, 6 × 0,0072 × 2.730.000 = 117.936 em aproximação linear."),
    ("03", "Aplicar a fórmula do contrato", "Troque a aproximação linear pela fórmula real (pro rata, índice de coluna, defasagem). A apostila (art. 136, I) registra o resultado previsto, não inventa índice."),
    ("04", "Separar reequilíbrio", "Se o dano veio de evento da matriz ou de fato da Administração, o ofício é outro. Reajuste não tapa esse buraco."),
])}
</section>
<section id="erros"><p class="eyebrow">Perda silenciosa</p>
<h2>Modos de financiar o contrato sem perceber</h2>
<ul class="error-list">
<li>Usar tabela SINAPI de mês diferente da data-base do orçamento estimado.</li>
<li>Assumir reajuste automático no aniversário da assinatura, ignorando a cláusula.</li>
<li>Pedir reequilíbrio só com variação de índice, sem evento nem nexo.</li>
<li>Tratar atraso de pagamento como reajuste (é atualização/mora, outro regime).</li>
<li>Aplicar o mesmo índice a família de insumo que o contrato setorizou de outro modo.</li>
</ul>
</section>
{cta(slug, "edital", "Data-base e reajuste: meses sem cobertura", "Olá, Tiago. Preciso conferir data-base e cláusula de reajuste do edital e do contrato.", "Enviar cláusula de reajuste", "Marcamos data-base, série e meses descobertos, sem misturar com reequilíbrio.", "Enviar cláusula no WhatsApp")}
{decision("Olá, Tiago. Preciso revisar data-base e reajuste do contrato de obra pública.", "Vale quando a ordem de serviço atrasou meses após a data-base, o índice do edital é omisso, ou a equipe está usando reequilíbrio para cobrar inflação ordinária.")}
{faq(faqs)}
{sources(
    [
        (LEI, "Lei 14.133/2021, arts. 6º LVIII, 25 § 7º, 92 V e 136 I"),
        (CAIXA, "CAIXA: publicação SINAPI (competência da tabela)"),
        (TCU_REQ, "TCU: reequilíbrio distinto de reajuste"),
    ],
    "A data-base e o índice são do edital e do contrato. A Lei 14.133/2021 (Planalto, 1º de abril de 2021) obriga a previsão; não publica a série do mês. O exemplo usa premissa explícita, não INCC vigente.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/", "Reequilíbrio", "Matriz de riscos e reequilíbrio"),
        ("/conteudos/sinapi-desonerado-nao-desonerado/", "Orçamento e BDI", "Desonerado e não desonerado no SINAPI"),
    ],
    ("/auditoria-orcamento-licitacao/", "Ver todos em Orçamento e BDI"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Data-base e reajuste: meses sem cobertura | CONFENGE",
        description="Como a data-base do orçamento estimado e o índice contratual definem meses descobertos, sem confundir reajuste com reequilíbrio.",
        h1="Data-base e reajuste: meses sem cobertura",
        lead="Reajuste aplica o índice do contrato com âncora no orçamento estimado. Os meses até o primeiro índice são caixa da empresa, não evento de matriz e não diligência de exequibilidade.",
        faqs=faqs,
        citations=[LEI, CAIXA, TCU_REQ],
        headline="Data-base e reajuste: meses sem cobertura",
    )


def page_empreitada(html: str) -> str:
    slug = "empreitada-preco-global-preco-unitario"
    faqs = [
        (
            "O que a lei chama de preço unitário e de preço global?",
            "Art. 6º, XXVIII: empreitada por preço unitário é contratação por preço certo de unidades determinadas. Art. 6º, XXIX: preço global é preço certo e total. Art. 46 lista os regimes de execução indireta.",
        ),
        (
            "Quantitativo a maior no projeto original some no preço global?",
            "O risco de quantidade do projeto original pesa na contratada no global. Mudança de escopo, omissão de projeto ou interferência da Administração não somem porque o regime é global. A prova é outra: aditivo ou reequilíbrio, conforme o fato.",
        ),
        (
            "O regime altera a exequibilidade da proposta?",
            "A presunção de 75% (art. 59, § 4º) olha o global. O critério de aceitabilidade de unitários (art. 59, § 3º) pesa mais no preço unitário. São testes da proposta, não da execução.",
        ),
    ]
    example = example_section(
        example_id="epg-128un-31250-qty",
        formula="(qty_executed - qty_contract) * unit_price_brl",
        result="40000",
        unit="BRL",
        fonte_url=LEI,
        fonte_date="2021-04-01",
        title="128 unidades a mais no item original",
        intro="Serviço de pavimento com 640 m² no contrato e 768 m² medidos no campo, sem mudança de projeto. Preço unitário ilustrativo de 312,50 BRL/m². Não é SINAPI nem SICRO do mês.",
        inputs=[
            ("qty_executed", "Quantidade executada", "768", "m2"),
            ("qty_contract", "Quantidade contratada", "640", "m2"),
            ("unit_price_brl", "Preço unitário contratado", "312.5", "BRL/m2"),
        ],
        result_label="Diferença paga no regime unitário",
        limit="No preço unitário, 40.000 entram na medição do item original. No preço global, essa diferença de quantidade do projeto original permanece com a contratada, salvo se o fato for alteração de escopo, omissão de projeto ou interferência da Administração. O exemplo não calcula aditivo nem reequilíbrio.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>No <strong>preço unitário</strong> a execução paga a quantidade medida do item. No <strong>preço global</strong> o risco de quantidade do projeto original fica com a contratada. Nenhum dos dois apaga aditivo por mudança de escopo nem reequilíbrio por fato da Administração. A proposta precisa precificar o regime que o edital escolheu (Lei 14.133/2021, arts. 6º, XXVIII e XXIX, e 46).</p></div>
<p class="article-intro">A pergunta útil não é 'qual regime é pior'. É: neste projeto, o quantitativo do item original está confiável? Se não estiver, o global transfere o vão para a margem. Esta página não escolhe SINAPI ou SICRO e não aplica índice de reajuste.</p>
{toc([("#resposta", "Resposta"), ("#regimes", "Regimes"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Peças"), ("#plano", "Leitura"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="regimes"><p class="eyebrow">Execução, não só nome do edital</p>
<h2>O que muda na medição e no risco de quantidade</h2>
{cards([
    ("01", "Preço unitário", "Crédito acompanha o boletim. Erro de quantitativo do projeto original, para mais ou para menos, aparece na medição. Jogo de planilha na proposta fica mais visível nos unitários relevantes (art. 59, § 3º)."),
    ("02", "Preço global", "Preço certo e total do objeto descrito. Variação de quantidade do projeto original não gera crédito automático. Alteração de projeto, serviço não previsto ou interferência da Administração continuam com prova própria."),
    ("03", "O que o regime não decide", "Reajuste segue o índice. Reequilíbrio segue a matriz e o art. 124, II, d. Exequibilidade testa a proposta. Administração local continua sendo classificação de custo."),
])}
</section>
{callout("Global mal lido vira desconto involuntário.", "Gerir boletim de preço global como se cada metro extra do projeto original fosse aditivo é o caminho inverso: a fiscalização recusa, e a empresa já executou.")}
{example}
<section id="documentos"><p class="eyebrow">Projeto e medição</p>
<h2>Peças que mostram o regime real</h2>
{docs([
    "Edital e minuta: regime de execução (art. 46) e critério de medição (art. 92, VI)",
    "Projeto básico, quantitativos e memória de cálculo do orçamento de referência",
    "Planilha: se há preços unitários mesmo no global, para aditivo futuro (art. 127)",
    "Matriz de riscos: quem arca com erro de quantitativo e com interferência de campo",
    "Critério de medição por evento, percentual ou unidade",
    "Proposta com margem explícita para o risco de quantidade, se o regime for global",
])}
</section>
<section id="plano"><p class="eyebrow">Antes de dar desconto</p>
<h2>Leitura de regime que cabe na margem</h2>
{actions([
    ("01", "Nomear o regime com o artigo", "Unitário (art. 6º, XXVIII) ou global (XXIX). Não use o nome comercial do órgão se a minuta disser outra coisa."),
    ("02", "Amostrar os itens de maior valor", "No exemplo, 128 m² a 312,50 = 40.000. No unitário isso é medição. No global isso é margem, salvo mudança de escopo."),
    ("03", "Separar quantidade de escopo", "Quantidade do projeto original versus serviço novo ou interferência. Só o segundo caminha bem por aditivo nos dois regimes."),
    ("04", "Não usar exequibilidade para tapar quantitativo", "A presunção de 75% olha o global da proposta. Não corrige projeto frouxo."),
])}
</section>
<section id="erros"><p class="eyebrow">Precificação cega</p>
<h2>Erros de regime que a margem não perdoa</h2>
<ul class="error-list">
<li>Dar desconto de preço unitário em edital de preço global, ou o inverso, sem reler a medição.</li>
<li>Assumir que todo metro extra vira aditivo no global.</li>
<li>Ignorar que o art. 127 usa a relação proposta / orçamento-base em item novo sem preço.</li>
<li>Tratar erro de quantitativo como reajuste de índice.</li>
<li>Não deixar memória do risco de quantidade na proposta global.</li>
</ul>
</section>
{cta(slug, "edital", "Preço global ou unitário: o risco de quantidade", "Olá, Tiago. Quero conferir o regime de execução e o risco de quantitativo do edital.", "Enviar minuta e planilha", "Comparamos medição, quantitativo do projeto original e o que realmente vira aditivo.", "Enviar minuta no WhatsApp")}
{decision("Olá, Tiago. Preciso analisar o regime de empreitada (preço global ou unitário) deste edital.", "Vale quando o projeto tem quantitativo frouxo, o edital mistura linguagem de global com planilha unitária, ou a equipe está precificando o regime errado.")}
{faq(faqs)}
{sources(
    [
        (LEI, "Lei 14.133/2021, arts. 6º XXVIII-XXIX, 46, 59 § 3º e 127"),
        (TCU_EPG, "TCU: empreitada por preço global"),
        (CAIXA_PDF, "CAIXA: metodologia de composição (quantitativo e custo direto)"),
    ],
    "As definições de regime estão no art. 6º da Lei 14.133/2021 (Planalto, 1º de abril de 2021). O exemplo de 40.000 BRL é aritmética de premissas, não preço de referência do mês.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/comprovacao-exequibilidade-proposta-obra/", "Edital e proposta", "Exequibilidade da proposta: o que comprovar"),
        ("/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/", "Reequilíbrio", "Matriz de riscos e reequilíbrio"),
    ],
    ("/diagnostico-pre-licitacao/", "Ver todos em Edital e proposta"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Preço global ou unitário: o risco de quantidade | CONFENGE",
        description="O que muda na medição quando o quantitativo do projeto original estoura: crédito no unitário, margem no global, com conta reproduzível.",
        h1="Preço global ou unitário: o risco de quantidade",
        lead="No unitário, o metro a mais do projeto original entra na medição. No global, esse vão come margem, salvo mudança de escopo. O nome do regime no edital precisa bater com o critério de medição.",
        faqs=faqs,
        citations=[LEI, TCU_EPG, CAIXA_PDF],
        headline="Preço global ou unitário: o risco de quantidade",
    )


def page_matriz(html: str) -> str:
    slug = "matriz-de-riscos-reequilibrio-economico-financeiro"
    faqs = [
        (
            "A matriz impede todo reequilíbrio?",
            "Não. O art. 103, § 4º, diz que a matriz define o equilíbrio inicial quanto a eventos supervenientes e deve ser observada nos pleitos. O § 5º considera mantido o equilíbrio quando as condições da matriz são atendidas, com duas reservas: alteração unilateral (art. 124, I) e tributo superveniente. Evento fora da alocação continua com prova.",
        ),
        (
            "Franquia é a mesma coisa que risco da contratada?",
            "Não. Franquia é o trecho do dano que a cláusula manda absorver mesmo quando o evento é da Administração. Risco alocado à contratada zera o pleito daquele evento. São linhas diferentes da matriz.",
        ),
        (
            "Reajuste entra na matriz?",
            "Reajuste é índice do contrato (art. 6º, LVIII, e art. 136, I). A matriz trata eventos supervenientes. Usar variação de índice como se fosse álea extraordinária é o ofício errado.",
        ),
    ]
    example = example_section(
        example_id="matriz-312k-75k-franchise",
        formula="max(0, event_cost_brl - franchise_brl)",
        result="237000",
        unit="BRL",
        fonte_url=LEI,
        fonte_date="2021-04-01",
        title="Evento da Administração com franquia de 75 mil",
        intro="Interferência de desapropriação atrasada, alocada à Administração na matriz, com franquia contratual de 75.000 BRL. Custo contemporâneo de 312.000 BRL (mão de obra parada e canteiro extra). Premissas do exemplo, não um processo real.",
        inputs=[
            ("event_cost_brl", "Custo contemporâneo do evento", "312000", "BRL"),
            ("franchise_brl", "Franquia da cláusula", "75000", "BRL"),
        ],
        result_label="Valor potencialmente pleiteável",
        limit="Se a matriz alocar o mesmo evento à contratada, o resultado cai para zero mesmo com custo de 312.000. A fórmula não substitui nexo, cronologia nem o art. 124, II, d. Não é reajuste de índice e não é teste de exequibilidade da proposta.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>A matriz de riscos <strong>define o equilíbrio inicial</strong> quanto a eventos supervenientes (Lei 14.133/2021, art. 103, § 4º). Não apaga alteração unilateral nem tributo novo (§ 5º). O pedido de reequilíbrio começa por evento, alocação e franquia. Variação ordinária de índice é reajuste, não reequilíbrio.</p></div>
<p class="article-intro">Quem protocola reequilíbrio sem ler a matriz entrega à fiscalização o primeiro fundamento de indeferimento. Esta página lê a cláusula. Não monta proposta e não escolhe tabela SINAPI.</p>
{toc([("#resposta", "Resposta"), ("#alocacao", "Alocação"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Peças"), ("#plano", "Pleito"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="alocacao"><p class="eyebrow">Art. 103 da Lei 14.133/2021</p>
<h2>Evento, dono do risco, franquia</h2>
<p>O orçamento de referência e a proposta já deveriam ter precificado os riscos alocados à contratada (art. 103, § 3º). Na execução, o pleito só nasce se o evento não era dela, ou se cabe a reserva do § 5º. Reajuste continua no índice.</p>
{cards([
    ("01", "Evento identificado", "Data, local, nexo com a execução e prova contemporânea. Sem evento, a matriz não tem o que aplicar."),
    ("02", "Alocação", "Administração, contratada ou compartilhado. Se a linha diz contratada, o custo contemporâneo não vira crédito, ainda que doa na margem."),
    ("03", "Franquia e mitigação", "Mesmo evento da Administração pode ter franquia, carência ou dever de mitigar. O exemplo desconta 75.000 antes de falar em 237.000."),
])}
</section>
{callout("Matriz lida só na disputa é margem já perdida.", "Se o risco era da contratada, o preço da proposta deveria tê-lo carregado. Descobrir isso no meio da obra não converte o evento em reequilíbrio.")}
{example}
<section id="documentos"><p class="eyebrow">Dossiê do pleito</p>
<h2>O que um fiscal consegue verificar</h2>
{docs([
    "Matriz de alocação anexa ao edital e ao contrato (art. 92, IX, e art. 103)",
    "Linha do evento: dono do risco, franquia, seguro, mitigação",
    "Diário, ordem de serviço e comunicação contemporânea do fato",
    "Memória de custo por item e período, com canteiro e mão de obra parada separados",
    "Prova de que o fato não é reajuste de índice nem erro de quantitativo do regime",
    "Enquadramento no art. 124, II, d, ou na reserva do art. 103, § 5º, quando couber",
])}
</section>
<section id="plano"><p class="eyebrow">Antes do ofício</p>
<h2>Ordem que evita indeferimento na origem</h2>
{actions([
    ("01", "Abrir a linha da matriz", "Se o evento está na contratada, pare. O número 237.000 do exemplo não existe nesse caso."),
    ("02", "Aplicar franquia e mitigação", "max(0, 312.000 − 75.000) = 237.000 só depois da alocação à Administração."),
    ("03", "Separar reajuste", "Variação da série contratual vai para apostila (art. 136, I). Não misture no mesmo pedido."),
    ("04", "Pedir o instituto certo", "Reequilíbrio restaura equilíbrio inicial. Aditivo quantitativo é art. 125. Exequibilidade já ficou no certame."),
])}
</section>
<section id="erros"><p class="eyebrow">Pedidos que morrem na cláusula</p>
<h2>O que a matriz derruba na primeira leitura</h2>
<ul class="error-list">
<li>Ofício de reequilíbrio sem citar a linha da matriz.</li>
<li>Usar inflação ordinária como álea extraordinária.</li>
<li>Ignorar franquia e pedir o custo cheio.</li>
<li>Somar mão de obra parada sem prova de caminho crítico.</li>
<li>Tratar alteração unilateral (art. 124, I) como se a matriz a tivesse apagado.</li>
</ul>
</section>
{cta(slug, "contrato", "Matriz de riscos pode impedir o reequilíbrio econômico-financeiro?", "Olá, Tiago. Tenho um evento na execução e quero confrontar a matriz de riscos antes de protocolar reequilíbrio.", "Enviar matriz e cronologia", "Lemos evento, alocação e franquia e dizemos se o instituto é reequilíbrio, reajuste ou risco já precificado.", "Enviar matriz no WhatsApp")}
{decision("Olá, Tiago. Preciso analisar se a matriz de riscos deste contrato impede o reequilíbrio.", "Vale quando o órgão já respondeu com a alocação, a franquia é opaca, ou a equipe está protocolando reajuste com nome de reequilíbrio.")}
{faq(faqs)}
{sources(
    [
        (LEI, "Lei 14.133/2021, arts. 6º XXVII, 92 IX, 103, 124 e 130"),
        (TCU_REQ, "TCU: reequilíbrio econômico-financeiro"),
        (CAIXA_PDF, "CAIXA: metodologia de custo (quando o dano é de canteiro ou composição)"),
    ],
    "A matriz está definida no art. 6º, XXVII, e operacionalizada no art. 103 da Lei 14.133/2021 (Planalto, 1º de abril de 2021; acesso em 28 de agosto de 2026). O exemplo desconta franquia; não publica valor de acórdão.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/data-base-orcamento-reajuste-obra-publica/", "Orçamento e BDI", "Data-base e reajuste: meses sem cobertura"),
        ("/conteudos/empreitada-preco-global-preco-unitario/", "Edital e proposta", "Preço global ou unitário: o risco de quantidade"),
    ],
    ("/reequilibrio-obras-publicas/", "Ver todos em Reequilíbrio contratual"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Matriz de riscos pode impedir o reequilíbrio econômico-financeiro? | CONFENGE",
        description="Como ler evento, alocação e franquia da matriz antes de protocolar reequilíbrio, com conta de dano após a franquia.",
        h1="Matriz de riscos pode impedir o reequilíbrio econômico-financeiro?",
        lead="A matriz define o equilíbrio inicial. Se o evento é da contratada, o custo contemporâneo não vira crédito. Se é da Administração, ainda resta descontar franquia. Reajuste de índice é outro ofício.",
        faqs=faqs,
        citations=[LEI, TCU_REQ, CAIXA_PDF],
        headline="Matriz de riscos pode impedir o reequilíbrio econômico-financeiro?",
    )


def page_mobilizacao(html: str) -> str:
    slug = "mobilizacao-desmobilizacao-orcamento-obra"
    faqs = [
        (
            "Mobilização pode ficar só no BDI?",
            "Somente se o modelo do orçamento de referência tratar assim e a taxa comportar frete, canteiro e retirada reais. Em obra remota, item próprio costuma ser a casa visível. Duplicar com administração local é o outro extremo.",
        ),
        (
            "Desmobilização entra na proposta ou só no fim da execução?",
            "Se há custo real de retirada, limpeza e frete de retorno, a proposta precisa carregá-lo. Deixar para a execução sem item, sem BDI e sem memória é desconto involuntário.",
        ),
        (
            "Zerar porque o concorrente zerou prova exequibilidade?",
            "Não. Exequibilidade olha se o preço executa. Omissão de mobilização pode até parecer competitiva e falhar na diligência ou no canteiro. São testes diferentes.",
        ),
    ]
    example = example_section(
        example_id="mob-6viagens-5400-canteiro",
        formula="trips * cost_per_trip_brl + canteiro_setup_brl + demob_brl",
        result="103800",
        unit="BRL",
        fonte_url=CAIXA_PDF,
        fonte_date="2026-08-02",
        title="Seis viagens, canteiro e retirada",
        intro="Premissas de uma frente única: seis viagens de carreta, montagem de canteiro e desmobilização ao fim. Não é composição SINAPI do mês e não inclui administração local mensal.",
        inputs=[
            ("trips", "Viagens de ida de equipamento", "6", "viagem"),
            ("cost_per_trip_brl", "Custo por viagem (premissa)", "5400", "BRL/viagem"),
            ("canteiro_setup_brl", "Montagem de canteiro", "41800", "BRL"),
            ("demob_brl", "Retirada e frete de retorno", "29600", "BRL"),
        ],
        result_label="Mobilização + desmobilização",
        limit="6 × 5.400 + 41.800 + 29.600 = 103.800. Se o orçamento de referência já remunerar frete no unitário do serviço ou no BDI, somar este total de novo é duplicidade. A conta não cobre equipe mensal de administração local nem reajuste.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>Mobilização e desmobilização são <strong>custo de implantar e retirar o canteiro</strong> na proposta: viagens, montagem, instalações provisórias e retorno. Não são administração local mensal, não são reajuste e não se zeraram só porque o concorrente zerou. O edital diz se o valor é item, rateio ou BDI.</p></div>
<p class="article-intro">Quem visita o sítio e volta com distância real consegue montar memória. Quem copia omissão alheia descobre o frete na ordem de serviço. Esta página calcula ida e volta. Não classifica BDI de equipamento e não discute SICRO versus SINAPI.</p>
{toc([("#resposta", "Resposta"), ("#escopo", "Escopo"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Campo"), ("#plano", "Montagem"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="escopo"><p class="eyebrow">Proposta, não execução tardia</p>
<h2>O que entra na memória de ida e volta</h2>
{cards([
    ("01", "Viagens e acesso", "Número de carretas, restrição de via, escolta e descarga. Distância genérica sem memória cai na diligência de exequibilidade, mas o objeto da conta ainda é a proposta."),
    ("02", "Canteiro inicial", "Módulos, energia provisória, cercamento, platô. Não confundir com administração local, que é posto mensal enquanto a obra roda."),
    ("03", "Desmobilização", "Retirada, limpeza, recuperação de área e frete de retorno. Omitir o fim da obra é o clássico de margem negativa na última medição, não de reequilíbrio."),
])}
</section>
{callout("Omissão alheia não é referência de preço.", "Se o concorrente zerou mobilização, confira se o custo está no BDI, no unitário de serviço ou simplesmente não existe. Copiar zero não prova que a execução cabe.")}
{example}
<section id="documentos"><p class="eyebrow">Campo e edital</p>
<h2>Peças que sustentam o 103.800 do exemplo</h2>
{docs([
    "Edital: item de mobilização, canteiro, instalações provisórias e BDI",
    "Croqui de acesso, restrição de via e local de canteiro da visita técnica",
    "Lista de equipamentos a transportar (ida e volta)",
    "Cotações de carreta, guindaste de descarga e módulos",
    "Cronograma de implantação e de retirada",
    "Checagem de duplicidade com administração local e com frete embutido no serviço",
])}
</section>
<section id="plano"><p class="eyebrow">Antes de zerar a linha</p>
<h2>Montagem que não duplica canteiro</h2>
{actions([
    ("01", "Ver onde o orçamento de referência remunera o canteiro", "Item, BDI ou silêncio. Silêncio não autoriza zero se o custo é real."),
    ("02", "Contar viagens", "No exemplo, 6 × 5.400 = 32.400 só de ida de equipamento."),
    ("03", "Somar montagem e retirada", "41.800 + 29.600. A desmobilização não espera a última medição para ser precificada."),
    ("04", "Cortar duplicidade", "Se o unitário de terraplenagem já carrega o caminhão de ida, não some de novo. Administração local mensal continua em outra página."),
])}
</section>
<section id="erros"><p class="eyebrow">Desconto involuntário</p>
<h2>Falhas de mobilização que a ordem de serviço cobra</h2>
<ul class="error-list">
<li>Zerar a linha porque o menor preço zerou.</li>
<li>Esquecer desmobilização e demolição de canteiro.</li>
<li>Embutir frete remoto num BDI que o modelo do órgão não comporta.</li>
<li>Somar administração local mensal nesta verba de ida e volta.</li>
<li>Tratar atraso de liberação de frente como reajuste de índice em vez de custo de equipe parada (reequilíbrio ou aditivo, conforme o fato).</li>
</ul>
</section>
{cta(slug, "edital", "Mobilização e desmobilização na planilha", "Olá, Tiago. Quero conferir se mobilização e desmobilização deste edital estão no item, no BDI ou omitidas.", "Enviar planilha de canteiro", "Comparamos item, BDI e o custo real de ida e volta, sem copiar omissão alheia.", "Enviar planilha no WhatsApp")}
{decision("Olá, Tiago. Preciso calcular mobilização e desmobilização desta proposta.", "Vale quando a obra é remota, o edital omite canteiro, ou a concorrência zerou a linha e a equipe hesita em precificar.")}
{faq(faqs)}
{sources(
    [
        (CAIXA_PDF, "CAIXA: metodologia SINAPI (canteiro, instalações e custo direto)"),
        (LEI, "Lei 14.133/2021, art. 23 (orçamento de referência) e art. 59 (diligência de proposta)"),
        (TCU_EPG, "TCU: planilha e preço global"),
    ],
    "A metodologia SINAPI da CAIXA (acesso em 2 de agosto de 2026) trata canteiro e instalações como custo a discriminar. Os 103.800 BRL do exemplo são premissas de viagem e canteiro, não tabela do mês.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/administracao-local-orcamento-obra-publica/", "Orçamento e BDI", "Administração local: item, BDI ou planilha"),
        ("/conteudos/bdi-diferenciado-obra-publica/", "Orçamento e BDI", "BDI diferenciado em materiais e equipamentos"),
    ],
    ("/auditoria-orcamento-licitacao/", "Ver todos em Orçamento e BDI"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="Mobilização e desmobilização na planilha | CONFENGE",
        description="Como montar memória de viagens, canteiro e retirada na proposta, sem zerar a linha nem duplicar administração local.",
        h1="Mobilização e desmobilização na planilha",
        lead="Ida, canteiro e volta têm memória própria. Administração local é posto mensal. Zerar porque o concorrente zerou não prova que a execução cabe.",
        faqs=faqs,
        citations=[CAIXA_PDF, LEI, TCU_EPG],
        headline="Mobilização e desmobilização na planilha",
    )


def page_sicro(html: str) -> str:
    slug = "sinapi-ou-sicro-obra-publica"
    faqs = [
        (
            "Qual sistema o art. 23 manda usar primeiro?",
            "No art. 23, § 2º, I, da Lei 14.133/2021, o orçamento estimado de obras e serviços de engenharia usa SICRO para infraestrutura de transportes e SINAPI para as demais obras e serviços de engenharia, na mediana do item, acrescido de BDI e encargos. Município sem recurso da União pode usar outro sistema (§ 3º), se o edital o adotar.",
        ),
        (
            "Posso misturar SINAPI e SICRO no mesmo item?",
            "A ordem legal é por natureza do serviço, não por conveniência de preço. Misturar bases no mesmo item sem memória e sem previsão do edital gera planilha ilegível na análise de preço e na diligência de exequibilidade.",
        ),
        (
            "A escolha da tabela substitui o reajuste?",
            "Não. SINAPI ou SICRO ancoram o orçamento de referência na data-base. Reajuste aplica o índice contratual na execução. São operações diferentes.",
        ),
    ]
    example = example_section(
        example_id="sicro-sinapi-420un-1450",
        formula="qty * (sicro_unit_brl - sinapi_unit_brl)",
        result="6090",
        unit="BRL",
        fonte_url=LEI,
        fonte_date="2021-04-01",
        title="Mesma quantidade, duas referências",
        intro="420 unidades de um serviço de terraplenagem com unitário ilustrativo SICRO de 63,40 BRL e SINAPI de 48,90 BRL. Os unitários são premissas, não publicação DNIT nem CAIXA do mês. A conta mostra o vão, não autoriza escolher a tabela mais barata.",
        inputs=[
            ("qty", "Quantidade do serviço", "420", "un"),
            ("sicro_unit_brl", "Unitário ilustrativo SICRO", "63.40", "BRL/un"),
            ("sinapi_unit_brl", "Unitário ilustrativo SINAPI", "48.90", "BRL/un"),
        ],
        result_label="Espalhamento SICRO − SINAPI",
        limit="420 × (63,40 − 48,90) = 6.090. Se o serviço é infraestrutura de transportes, o art. 23, § 2º, I, puxa SICRO no orçamento de referência. Usar SINAPI 'porque fica menor' desalinha a proposta do orçamento do órgão. Não é fator oficial de conversão.",
    )
    inner = f"""
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>No orçamento de referência de obras, a Lei 14.133/2021, art. 23, § 2º, I, usa <strong>SICRO para infraestrutura de transportes</strong> e <strong>SINAPI para as demais obras e serviços de engenharia</strong>, na mediana do item, com BDI e encargos. O edital e a natureza do serviço mandam. Escolher a tabela mais barata não é método.</p></div>
<p class="article-intro">Esta página decide sistema de custos do orçamento de referência. Não escolhe desonerado versus não desonerado (outra base do mesmo SINAPI), não calcula reajuste e não prova exequibilidade.</p>
{toc([("#resposta", "Resposta"), ("#ordem", "Ordem legal"), ("#exemplo-calculo", "Cálculo"), ("#documentos", "Peças"), ("#plano", "Decisão"), ("#erros", "Erros"), ("#fontes", "Fontes")])}
<section id="ordem"><p class="eyebrow">Art. 23, § 2º, I</p>
<h2>Natureza do serviço, não conveniência de preço</h2>
{cards([
    ("01", "SICRO primeiro em transporte", "Rodovia, ferrovias e correlatos de infraestrutura de transportes puxam o sistema DNIT no orçamento de referência, quando o art. 23 se aplica."),
    ("02", "SINAPI no restante da engenharia", "Edificações e demais serviços de engenharia puxam CAIXA/IBGE. Desonerado ou não desonerado é recorte interno do SINAPI, tratado em outro guia."),
    ("03", "Edital e ente sem recurso da União", "Art. 23, § 3º: Estado, Distrito Federal e Município sem recurso da União podem adotar outro sistema. A minuta do certame prevalece sobre o hábito da orçamentista."),
])}
<p>A proposta deve falar a mesma língua do orçamento de referência. A execução mede o que foi contratado. Reajuste não troca SINAPI por SICRO no meio do contrato.</p>
</section>
{callout("Não existe fator único de conversão.", "O vão de 6.090 BRL do exemplo é aritmética de duas premissas. Publicar 'SICRO = SINAPI vezes 1,3' seria regra sem fonte. Baixe a competência exigida no edital.")}
{example}
<section id="documentos"><p class="eyebrow">Sistemas e edital</p>
<h2>O que mostra qual referência vale</h2>
{docs([
    "Edital: sistema de custos, data-base e se há tabela própria do ente",
    "Natureza do objeto (transporte versus demais engenharias)",
    "Publicação SICRO/DNIT da competência exigida",
    "Publicação SINAPI/CAIXA da mesma data-base, se o confronto for necessário",
    "Itens sem correspondência: cotação ou composição própria com memória",
    "BDI de referência do órgão, aplicado depois da escolha da base de custo direto",
])}
</section>
<section id="plano"><p class="eyebrow">Antes de montar a planilha</p>
<h2>Decisão de sistema, item a item</h2>
{actions([
    ("01", "Ler a ordem do art. 23 no edital", "Se o certame é de rodovia com recurso federal, SICRO não é opcional no orçamento de referência."),
    ("02", "Classificar o serviço, não o canteiro inteiro", "Um edital misto pode ter pavimento em SICRO e edificação de apoio em SINAPI. A memória registra a fronteira."),
    ("03", "Não converter pelo vão do exemplo", "6.090 BRL ilustram espalhamento. Não são coeficiente. Use a publicação da data-base."),
    ("04", "Alinhar proposta e BDI", "Trocou a base de custo direto, recalcule BDI e teste exequibilidade. São passos seguintes, não esta escolha."),
])}
</section>
<section id="erros"><p class="eyebrow">Base errada</p>
<h2>Trocas que a análise de preço vê na hora</h2>
<ul class="error-list">
<li>Usar SINAPI em serviço de rodovia porque o unitário ficou menor.</li>
<li>Misturar SICRO e SINAPI no mesmo item sem memória.</li>
<li>Aplicar competência diferente da data-base do orçamento estimado.</li>
<li>Tratar desonerado/não desonerado como se fosse SICRO versus SINAPI.</li>
<li>Inventar fator de conversão nacional sem publicação DNIT ou CAIXA.</li>
</ul>
</section>
{cta(slug, "edital", "SINAPI ou SICRO: a referência de cada serviço", "Olá, Tiago. Quero conferir se o orçamento deste edital deveria estar em SINAPI ou SICRO em cada serviço.", "Enviar planilha e objeto", "Classificamos o serviço na ordem do art. 23 e marcamos mistura de bases.", "Enviar planilha no WhatsApp")}
{decision("Olá, Tiago. Preciso decidir SINAPI ou SICRO nos serviços deste edital.", "Vale quando o objeto mistura rodovia e edificação, o ente usou tabela própria, ou a planilha do órgão troca de sistema sem memória.")}
{faq(faqs)}
{sources(
    [
        (LEI, "Lei 14.133/2021, art. 23, § 2º, I e § 3º"),
        (SICRO, "DNIT: SICRO (sistemas de custos rodoviários)"),
        (CAIXA, "CAIXA: SINAPI (sistema nacional de custos da construção)"),
    ],
    "A ordem SICRO/SINAPI está no art. 23, § 2º, I, da Lei 14.133/2021 (Planalto, 1º de abril de 2021; acesso em 28 de agosto de 2026). Portais DNIT e CAIXA publicam as tabelas. Esta página não reproduz unitário oficial do mês.",
)}
{AUTHOR}
{related(
    [
        ("/conteudos/sinapi-desonerado-nao-desonerado/", "Orçamento e BDI", "Desonerado e não desonerado no SINAPI"),
        ("/conteudos/administracao-local-orcamento-obra-publica/", "Orçamento e BDI", "Administração local: item, BDI ou planilha"),
    ],
    ("/auditoria-orcamento-licitacao/", "Ver todos em Orçamento e BDI"),
)}
{extract_bridge(html)}
"""
    html = replace_article(html, inner)
    return set_head(
        html,
        title="SINAPI ou SICRO: a referência de cada serviço | CONFENGE",
        description="A ordem do art. 23: SICRO em transporte, SINAPI nas demais engenharias, com o vão entre unitários ilustrativos tornado explícito.",
        h1="SINAPI ou SICRO: a referência de cada serviço",
        lead="Infraestrutura de transportes puxa SICRO. As demais engenharias puxam SINAPI. A tabela mais barata não é método, e desonerado versus não desonerado é outro recorte.",
        faqs=faqs,
        citations=[LEI, SICRO, CAIXA],
        headline="SINAPI ou SICRO: a referência de cada serviço",
    )


BDI_EXAMPLE = example_section(
    example_id="bdi-640k-271-1180k-109",
    formula="cd_mo * bdi_mo + cd_eq * bdi_eq",
    result="302060",
    unit="BRL",
    fonte_url=LEI,
    fonte_date="2021-04-01",
    title="Dois BDI sobre duas famílias de custo direto",
    intro="Custo direto de mão de obra 640.000 BRL com BDI 27,1% e custo direto de equipamento 1.180.000 BRL com BDI 10,9%. Percentuais são premissas do modelo deste exemplo, não teto TCU nem tabela nacional.",
    inputs=[
        ("cd_mo", "Custo direto de mão de obra", "640000", "BRL"),
        ("bdi_mo", "BDI da família mão de obra", "0.271", "ratio"),
        ("cd_eq", "Custo direto de equipamento", "1180000", "BRL"),
        ("bdi_eq", "BDI da família equipamento", "0.109", "ratio"),
    ],
    result_label="BDI total diferenciado",
    limit="640.000 × 0,271 + 1.180.000 × 0,109 = 302.060. Um BDI único de 27,1% sobre os dois custos diretos daria 493.220 e inflaria equipamento. Os percentuais não são oficiais. O modelo do edital prevalece. Não é reajuste nem prova de exequibilidade.",
)

SINAPI_EXAMPLE = example_section(
    example_id="sinapi-185h-3480-2760",
    formula="labor_hours * (rate_nao_deson - rate_deson)",
    result="1332",
    unit="BRL",
    fonte_url=CAIXA,
    fonte_date="2026-08-02",
    title="185 horas na mesma composição, duas bases de encargo",
    intro="Taxas horárias ilustrativas de mão de obra: R$ 34,80 na base não desonerada e R$ 27,60 na desonerada. Não são valores SINAPI de um mês publicado. Mostram o vão de encargo, não um fator nacional de conversão.",
    inputs=[
        ("labor_hours", "Horas de mão de obra da composição", "185", "h"),
        ("rate_nao_deson", "Taxa horária ilustrativa não desonerada", "34.80", "BRL/h"),
        ("rate_deson", "Taxa horária ilustrativa desonerada", "27.60", "BRL/h"),
    ],
    result_label="Vão de encargo na composição",
    limit="185 × (34,80 − 27,60) = 1.332. A tabela que vale é a do edital na data-base, com CPRB só se o enquadramento da empresa se aplicar. Não publique este vão como coeficiente oficial e não use a troca de base para maquiar reajuste.",
)


def patch_bdi(html: str) -> str:
    if 'id="exemplo-calculo"' not in html:
        html = re.sub(
            r'(<section id="diagnostico">.*?</section>)',
            r"\1" + BDI_EXAMPLE,
            html,
            count=1,
            flags=re.S,
        )
    if 'id="limites-conceito"' not in html:
        box = (
            '<section id="limites-conceito"><p class="eyebrow">O que esta página não calcula</p>'
            "<h2>BDI diferenciado não é reajuste nem exequibilidade</h2>"
            "<p>Orçamento de referência traz o modelo de BDI do órgão. A proposta aplica taxas por família se o modelo permitir. "
            "Reajuste na execução usa índice. Reequilíbrio usa evento da matriz. Exequibilidade testa o global da proposta. "
            "Administração local e mobilização são casas de custo direto, não atalho para reduzir BDI de equipamento.</p></section>"
        )
        html = html.replace(BDI_EXAMPLE, BDI_EXAMPLE + box, 1)
    if 'href="#exemplo-calculo"' not in html:
        html = html.replace(
            '<a href="#diagnostico">O que decide</a>',
            '<a href="#diagnostico">O que decide</a><a href="#exemplo-calculo">Cálculo</a>',
            1,
        )
    html = re.sub(
        r'(property="article:modified_time" content=")[^"]*',
        rf"\1{DATE}",
        html,
        count=1,
    )
    html = re.sub(
        r"<time datetime=\"[^\"]+\">[^<]+</time>",
        f'<time datetime="{DATE}">{DATE_LABEL}</time>',
        html,
        count=1,
    )
    desc = "Quando o modelo do edital autoriza BDI distinto em equipamento, com conta de duas famílias e o risco de maquiar margem."
    html = _replace_attr_tag(html, "name", "description", desc)
    html = _replace_attr_tag(html, "property", "og:description", desc)
    return html


def patch_sinapi(html: str) -> str:
    html = re.sub(
        r'<section id="exemplo">.*?</section>',
        SINAPI_EXAMPLE,
        html,
        count=1,
        flags=re.S,
    )
    html = html.replace('href="#exemplo"', 'href="#exemplo-calculo"')
    if 'id="limites-conceito"' not in html:
        box = (
            '<section id="limites-conceito"><p class="eyebrow">Recortes vizinhos</p>'
            "<h2>Desonerado não é SICRO e não é reajuste</h2>"
            "<p>SINAPI desonerado versus não desonerado é recorte de encargos da mesma família de composições no orçamento de referência. "
            "SICRO versus SINAPI é escolha de sistema pelo art. 23. Reajuste aplica índice na execução. "
            "Exequibilidade testa a proposta. Administração local continua sendo classificação de custo direto ou BDI.</p></section>"
        )
        html = html.replace(SINAPI_EXAMPLE, SINAPI_EXAMPLE + box, 1)
    html = re.sub(
        r'(property="article:modified_time" content=")[^"]*',
        rf"\1{DATE}",
        html,
        count=1,
    )
    html = re.sub(
        r"<time datetime=\"[^\"]+\">[^<]+</time>",
        f'<time datetime="{DATE}">{DATE_LABEL}</time>',
        html,
        count=1,
    )
    return html


HANDLERS = {
    "administracao-local-orcamento-obra-publica": page_admin,
    "bdi-diferenciado-obra-publica": patch_bdi,
    "comprovacao-exequibilidade-proposta-obra": page_exequib,
    "data-base-orcamento-reajuste-obra-publica": page_database,
    "empreitada-preco-global-preco-unitario": page_empreitada,
    "matriz-de-riscos-reequilibrio-economico-financeiro": page_matriz,
    "mobilizacao-desmobilizacao-orcamento-obra": page_mobilizacao,
    "sinapi-desonerado-nao-desonerado": patch_sinapi,
    "sinapi-ou-sicro-obra-publica": page_sicro,
}


def main() -> int:
    for slug, handler in HANDLERS.items():
        path = ROOT / "conteudos" / slug / "index.html"
        original = path.read_text(encoding="utf-8")
        updated = handler(original)
        if 'id="exemplo-calculo"' not in updated:
            raise SystemExit(f"{slug}: missing worked example")
        if "wa.me/5548988344559" not in updated:
            raise SystemExit(f"{slug}: missing WhatsApp")
        path.write_text(updated, encoding="utf-8")
        print(f"updated {slug} ({len(updated)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



