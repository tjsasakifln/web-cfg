"""Render public authority policy pages from the shared site chrome."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.html_shell import (  # noqa: E402
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    breadcrumb_jsonld,
    page_shell,
)

UPDATED = "2026-08-15"
UPDATED_BR = "15 de agosto de 2026"


def _byline() -> str:
    return (
        '<p class="authority-byline">'
        'Responsável técnico: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a>'
        ' · Atualizado em '
        f'<time datetime="{UPDATED}">{UPDATED_BR}</time>'
        ' · <a href="/correcoes/">Como corrigir</a>'
        "</p>"
    )


def _nav() -> str:
    return (
        '<nav class="authority-policy-nav" aria-label="Políticas de autoridade">'
        '<a href="/politica-editorial/">Editorial</a>'
        '<a href="/correcoes/">Correções</a>'
        '<a href="/uso-de-ia/">Uso de IA</a>'
        '<a href="/conflitos/">Conflitos</a>'
        '<a href="/metodologia-inteligencia/">Metodologia</a>'
        "</nav>"
    )


def _page(
    *,
    slug: str,
    title: str,
    description: str,
    h1: str,
    eyebrow: str,
    crumbs: list[tuple[str, str | None]],
    body: str,
) -> str:
    path = f"/{slug}/"
    webpage = {
        "@type": "WebPage",
        "@id": f"{SITE}{path}#webpage",
        "url": f"{SITE}{path}",
        "name": title,
        "description": description,
        "dateModified": UPDATED,
        "inLanguage": "pt-BR",
        "isPartOf": {"@id": f"{SITE}/#organization"},
        "author": {"@id": f"{SITE}/#tiago"},
        "publisher": {"@id": f"{SITE}/#organization"},
    }
    main = f"""
<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol>
<li><a href="/">Início</a><span aria-hidden="true">/</span></li>
<li aria-current="page">{h1}</li>
</ol></nav>
<header class="content-hero"><div class="container">
<p class="eyebrow">{eyebrow}</p>
<h1>{h1}</h1>
<p class="content-lead">{description}</p>
{_byline()}
{_nav()}
</div></header>
<section class="section"><div class="container article-layout">
<article class="article-main simple-card privacy-card">
{body}
</article>
</div></section>
"""
    return page_shell(
        title=f"{title} | CONFENGE",
        description=description,
        canonical_path=path,
        robots="index,follow,max-snippet:-1",
        jsonld_graph=[ORG_JSONLD, PERSON_JSONLD, breadcrumb_jsonld(crumbs), webpage],
        body_main=main,
        wa_message="Olá, Tiago. Quero pedir uma correção ou esclarecer a governança editorial da CONFENGE.",
        author_name="Engº Tiago Sasaki",
        data_attrs={"surface-type": "policy"},
    )


PAGES = {
    "politica-editorial": {
        "title": "Política editorial",
        "h1": "Política editorial",
        "eyebrow": "Governança",
        "description": "Quem afirma, com qual competência, com qual método, quando atualiza e como corrigir o conteúdo público da CONFENGE.",
        "body": """
<h2 id="escopo">O que esta política cobre</h2>
<p>Aplica-se a páginas de serviço, conteúdos técnicos, ferramentas, pesquisas/datasets e casos/provas publicados em confenge.com.br. Não cria diretório de especialistas, selo, ranking nem avaliação de clientes.</p>
<p>Cada claim relevante deve poder ser auditado na cadeia: quem afirma → competência → método/dado → revisão → atualização → limitações → como corrigir.</p>
<h2 id="identidade">Identidade canônica</h2>
<p>A organização pública é a CONFENGE (CNPJ 52.407.089/0001-09). O responsável técnico nomeado é <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a>. Não há segunda marca pública nem handoff de visitante para outro runtime.</p>
<h2 id="autoria">Autoria</h2>
<p>Toda superfície coberta pela matriz de autoridade deve exibir autor visível (pessoa ou Biblioteca técnica CONFENGE). Structured data de autor só entra quando o nome correspondente aparece no HTML visível.</p>
<h2 id="revisao">Revisão técnica</h2>
<p>Revisor independente é exigido quando o texto faz afirmação normativa material (lei, jurisprudência ou enquadramento prescritivo) e não declara a ausência de segundo revisor. A CONFENGE é prática individual: quando não há segundo revisor nomeado, a página deve dizer isso de forma explícita. Não se inventa revisor.</p>
<h2 id="fontes">Fontes e evidência</h2>
<p>Afirmações legais rastreiam a <a href="/metodologia-inteligencia/">metodologia de inteligência</a> e a política interna de fontes jurídicas. Ferramentas e datasets mostram método, fonte, data de referência e limitações. UNKNOWN permanece UNKNOWN.</p>
<h2 id="ia">Uso de IA</h2>
<p>O uso de sistemas de assistência à redação e à operação está descrito em <a href="/uso-de-ia/">Uso de IA</a>. A responsabilidade editorial permanece humana.</p>
<h2 id="conflitos">Conflitos</h2>
<p>A CONFENGE é consultoria comercial. A política de conflitos está em <a href="/conflitos/">Conflitos</a>.</p>
<h2 id="correcoes">Correções e atualização</h2>
<p>Pedido de correção, dono e prazos: <a href="/correcoes/">Correções</a>. Owner de correção e de refresh: Engº Tiago Sasaki, <a href="mailto:tiago.sasaki@confenge.com.br">tiago.sasaki@confenge.com.br</a>. Acuse de recebimento em até 2 dias úteis; correção material publicada em até 10 dias úteis após a confirmação do erro.</p>
<h2 id="o-que-nao-fazemos">O que esta política não autoriza</h2>
<ul>
<li>Review, nota, selo ou diretório inventados</li>
<li>Case de cliente sem classe de permissão e consentimento</li>
<li>Credencial pública fora do registro de prova permitido</li>
<li>Schema.org que contradiga o texto visível</li>
</ul>
""",
    },
    "correcoes": {
        "title": "Política de correções",
        "h1": "Como pedir e publicar uma correção",
        "eyebrow": "Correções",
        "description": "Canal, dono e prazos para corrigir erro material no site da CONFENGE. Sem silêncio editorial.",
        "body": """
<h2 id="canal">Canal</h2>
<p>Escreva para <a href="mailto:tiago.sasaki@confenge.com.br?subject=Correcao%20editorial%20CONFENGE">tiago.sasaki@confenge.com.br</a> com a URL, o trecho contestado e a correção proposta. WhatsApp operacional também aceita o pedido, desde que identifique a página.</p>
<h2 id="dono">Dono</h2>
<p>Owner de correção e de refresh: <strong>Engº Tiago Sasaki</strong>, responsável técnico da CONFENGE.</p>
<h2 id="sla">Prazos (SLA)</h2>
<ul>
<li><strong>Acuse de recebimento:</strong> até 2 dias úteis após o pedido identificável.</li>
<li><strong>Publicação da correção material:</strong> até 10 dias úteis após a confirmação do erro.</li>
<li>Se a verificação exigir fonte pública ainda indisponível, o trecho permanece limitado ou é retirado. Não se preenche lacuna com chute.</li>
</ul>
<h2 id="o-que-corrige">O que conta como correção material</h2>
<ul>
<li>Erro de autoria, data, método, cobertura ou limitação</li>
<li>Credencial ou case publicado sem base no registro de prova/permissão</li>
<li>Schema.org que afirme autor, data, avaliação ou organização diferentes do visível</li>
<li>Texto legal que atribua à lei ou à jurisprudência o que elas não dizem</li>
</ul>
<h2 id="o-que-nao-e">O que não é correção</h2>
<p>Pedido de remover limitação verdadeira, de inventar resultado comercial ou de transformar demonstrativo em case de cliente.</p>
<p>Política editorial: <a href="/politica-editorial/">governança completa</a>.</p>
""",
    },
    "uso-de-ia": {
        "title": "Uso de IA",
        "h1": "Como a CONFENGE usa inteligência artificial",
        "eyebrow": "Uso de IA",
        "description": "Assistência de redação e operação não substitui responsável técnico, fonte nem consentimento.",
        "body": """
<h2 id="principio">Princípio</h2>
<p>Sistemas de IA podem ajudar a redigir, classificar, revisar consistência ou operar infraestrutura. Não assinam o conteúdo. Não geram case, avaliação, credencial, volume de mercado ou resultado financeiro.</p>
<h2 id="responsavel">Responsável</h2>
<p>O responsável técnico pelo que está publicado é <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a>. Se a página não puder nomear autor humano ou biblioteca técnica, ela não deve ir ao ar.</p>
<h2 id="proibicoes">Proibições</h2>
<ul>
<li>Inventar cliente, depoimento, nota, selo ou jurisprudência</li>
<li>Preencher UNKNOWN com estimativa sem fonte</li>
<li>Publicar schema de Review ou AggregateRating sem o mesmo conteúdo visível</li>
<li>Tratar texto gerado como parecer jurídico</li>
</ul>
<h2 id="transparencia">Transparência</h2>
<p>Esta página é a declaração pública de uso de IA. Não há “IA que vence licitação” nem ranking proprietário apresentado como verdade. Correções: <a href="/correcoes/">como corrigir</a>.</p>
""",
    },
    "conflitos": {
        "title": "Conflitos de interesse",
        "h1": "Conflitos e interesses comerciais",
        "eyebrow": "Conflitos",
        "description": "A CONFENGE é consultoria comercial. Conteúdo técnico pode apoiar ofertas, sem comprar review nem inventar cliente.",
        "body": """
<h2 id="natureza">Natureza comercial</h2>
<p>A CONFENGE vende diagnóstico, rotina B2G, sala de decisão de proposta e defesa de margem. Páginas técnicas, ferramentas e pesquisas existem para decidir melhor e, quando fizer sentido, conversar com a empresa. Isso é declarado, não oculto.</p>
<h2 id="o-que-nao-ha">O que não há</h2>
<ul>
<li>Review paga, nota de cliente ou selo de terceiro inventado</li>
<li>Patrocínio não declarado de página técnica</li>
<li>Case com nome de cliente sem classe de permissão e autorização</li>
<li>Independência editorial fingida em relação às ofertas da própria CONFENGE</li>
</ul>
<h2 id="casos">Casos e prova</h2>
<p>As páginas em <a href="/casos/">/casos/</a> são demonstrativos hipotéticos até existir registro de consentimento. Classes possíveis: demonstrativo, consented, confidential, redacted. Sem classe, não publica.</p>
<h2 id="correcoes">Como contestar</h2>
<p>Se um conflito não declarado aparecer no site, use <a href="/correcoes/">Correções</a>. Owner: Engº Tiago Sasaki, <a href="mailto:tiago.sasaki@confenge.com.br">tiago.sasaki@confenge.com.br</a>.</p>
""",
    },
}


def render_all() -> list[Path]:
    written: list[Path] = []
    for slug, spec in PAGES.items():
        html = _page(
            slug=slug,
            title=spec["title"],
            description=spec["description"],
            h1=spec["h1"],
            eyebrow=spec["eyebrow"],
            crumbs=[("Início", "/"), (spec["h1"], None)],
            body=spec["body"],
        )
        dest = ROOT / slug / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html, encoding="utf-8")
        written.append(dest)
    return written


if __name__ == "__main__":
    for p in render_all():
        print("wrote", p.relative_to(ROOT))
