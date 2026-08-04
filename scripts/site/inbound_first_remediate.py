#!/usr/bin/env python3
"""Inbound-first remediation for CONFENGE public surface (P0).

Does NOT auto-approve editorial pages (HUMAN_APPROVED / INDEXABLE).
Coordinates with PR #10 human packet: Wave 1 approval remains human-only.

Actions:
  1. Build URL disposition matrix (CSV/JSON) under docs/seo/
  2. Filter /conteudos/ hub + feed to indexable-only
  3. Unify brand shell (nav/footer/org schema) on public content pages
  4. Rewrite machine FAQ / "Converta a discussão" on indexable pages
  5. Filter related links to indexable peers
  6. Fix radar empty-state CTA + noindex when no publish items
"""

from __future__ import annotations

import csv
import html as html_lib
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.brand import (  # noqa: E402
    footer_blurb,
    load_brand,
    org_description,
    wa_url,
)
from scripts.site.inbound_gates import (  # noqa: E402
    is_indexable_html,
    is_noindex,
    path_to_url,
    robots_of,
    strip_html,
)

SITE = "https://confenge.com.br"
TODAY = date.today().isoformat()

# Single-hop 301 targets live in `_redirects`. These URLs must never re-enter
# indexable public surfaces (feed, hubs, related, sitemaps) after remediation.
SUPERSEDED_URLS = frozenset(
    {
        "/conteudos/limite-aditivo-25-50-obra-publica/",
        "/conteudos/desconto-da-proposta-em-item-novo-aditivo/",
    }
)

OLD_ORG = (
    "Diretoria B2G fracionada para construtoras e empresas de engenharia: "
    "inteligência de mercado, decisão de participação, proposta, proteção de "
    "margem e riscos em contratos públicos."
)
OLD_FOOTER = (
    "Diretoria B2G fracionada para construtoras: decisão de participação, "
    "proposta, proteção de margem e gestão de riscos em contratos públicos."
)

CLUSTER_JOURNEY = {
    "medicoes-glosas-obras-publicas": "contrato",
    "aditivos-obras-publicas": "contrato",
    "reequilibrio-obras-publicas": "contrato",
    "atrasos-prorrogacao-obras-publicas": "contrato",
    "defesa-tecnica-contratos-publicos": "contrato",
    "acompanhamento-contratos-obras": "contrato",
    "diagnostico-pre-licitacao": "edital",
    "auditoria-orcamento-licitacao": "edital",
}

CLUSTER_OFFER = {
    "contrato": "contract-defense",
    "edital": "bid-room",
    "operacao": "diretoria-b2g",
}


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _write(p: Path, text: str) -> None:
    p.write_text(text, encoding="utf-8")


def _normalize_conteudos_url(path: str) -> str:
    path = path.strip()
    if path.startswith("http"):
        path = re.sub(r"^https?://[^/]+", "", path)
    if not path.startswith("/"):
        path = "/" + path
    if path.startswith("/conteudos/") and path.rstrip("/") != "/conteudos" and not path.endswith("/"):
        path = path + "/"
    return path


def indexable_map() -> dict[str, bool]:
    """url path -> indexable for conteudos children (superseded always false)."""
    out: dict[str, bool] = {}
    for p in (ROOT / "conteudos").glob("*/index.html"):
        url = f"/conteudos/{p.parent.name}/"
        if url in SUPERSEDED_URLS:
            out[url] = False
            continue
        out[url] = is_indexable_html(_read(p))
    return out


def force_noindex_superseded_pages() -> dict[str, Any]:
    """Superseded HTML keeps a file for history, but must not compete for indexation."""
    touched = 0
    for url in SUPERSEDED_URLS:
        p = ROOT / url.strip("/") / "index.html"
        if not p.exists():
            continue
        html = _read(p)
        new = html
        new = re.sub(
            r'name="robots" content="[^"]+"',
            'name="robots" content="noindex,follow"',
            new,
            count=1,
        )
        new = re.sub(
            r'content="[^"]+" name="robots"',
            'content="noindex,follow" name="robots"',
            new,
            count=1,
        )
        if new != html:
            _write(p, new)
            touched += 1
    return {"pages_noindexed": touched}


def build_nav_html(brand: dict[str, Any], current: str | None = None) -> tuple[str, str, str]:
    nav = (brand.get("navigation") or {}).get("desktop") or []
    cta = (brand.get("navigation") or {}).get("cta") or {
        "label": "Falar com a CONFENGE",
        "href": "/#contato",
    }
    desktop_parts = []
    mobile_parts = []
    for n in nav:
        href = n["href"]
        label = n["label"]
        cur = ' aria-current="page"' if current and href.rstrip("/") == current.rstrip("/") else ""
        desktop_parts.append(f'<a href="{href}"{cur}>{label}</a>')
        mobile_parts.append(f'<a href="{href}"{cur}>{label}</a>')
    desktop = "\n".join(desktop_parts)
    mobile = "".join(mobile_parts)
    cta_html = (
        f'<a class="button button-primary header-cta" href="{cta["href"]}">{cta["label"]}</a>'
    )
    mobile_cta = f'<a class="button button-primary" href="{cta["href"]}">{cta["label"]}</a>'
    header = f"""<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, página inicial" class="brand" href="/"><img alt="CONFENGE Inteligência Técnica" height="208" src="/assets/logo-confenge.png" width="800"/></a>
<nav aria-label="Navegação principal" class="desktop-nav">
{desktop}
</nav>
{cta_html}
<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" class="menu-toggle" type="button">
<svg class="icon menu-open"><use href="#i-menu"></use></svg><svg class="icon menu-close"><use href="#i-close"></use></svg>
</button>
</div>
<nav aria-label="Navegação móvel" class="mobile-nav" id="mobile-menu">
{mobile}
{mobile_cta}
</nav>
</header>"""
    return header, desktop, cta["label"]


def _footer_nav_html(brand: dict[str, Any]) -> str:
    """Build footer navigation links from brand.json — never legacy /#atuacao anchors."""
    nav = (brand.get("navigation") or {}).get("desktop") or []
    parts = ['<a href="/">Início</a>']
    seen = {"/"}
    for n in nav:
        href = (n.get("href") or "").strip()
        label = (n.get("label") or "").strip()
        if not href or href in seen:
            continue
        # Drop legacy home-fragment anchors that no longer exist as public sections
        if href in {"/#atuacao", "/#diferenciais", "/#metodo", "/#servicos"}:
            continue
        seen.add(href)
        parts.append(f'<a href="{html_lib.escape(href)}">{html_lib.escape(label)}</a>')
    if "/conteudos/" not in seen:
        parts.append('<a href="/conteudos/">Biblioteca técnica</a>')
    if not any("especialista" in p for p in parts):
        parts.append('<a href="/especialista/tiago-jun-sasaki/">Especialista</a>')
    if "/#contato" not in seen and not any("contato" in p.lower() for p in parts):
        parts.append('<a href="/#contato">Contato</a>')
    return "".join(parts)


def patch_shell(html: str, brand: dict[str, Any], *, current: str | None = None) -> str:
    org = org_description(brand)
    foot = footer_blurb(brand)
    header, _, _ = build_nav_html(brand, current=current)

    # Replace entire header block
    html2, n = re.subn(
        r"<header class=\"site-header\"[^>]*>.*?</header>",
        header,
        html,
        count=1,
        flags=re.S,
    )
    if n:
        html = html2

    # Footer blurb
    if OLD_FOOTER in html:
        html = html.replace(OLD_FOOTER, foot)
    html = re.sub(
        r'(<div class="footer-brand"><img[^>]*/>)<p>[^<]*</p>',
        rf"\1<p>{html_lib.escape(foot)}</p>",
        html,
        count=1,
    )

    # Footer navigation: replace whole link block under Navegação
    footer_links = _footer_nav_html(brand)
    html2, n = re.subn(
        r'(<div class="footer-links"><strong>Navegação</strong>)(.*?)(</div>)',
        rf"\1{footer_links}\3",
        html,
        count=1,
        flags=re.S,
    )
    if n:
        html = html2
    # Safety: strip any residual legacy anchors anywhere in public HTML
    for bad in ("/#atuacao", "/#diferenciais", "/#metodo"):
        if bad in html:
            html = html.replace(f'href="{bad}"', 'href="/#contato"')

    # Org description in JSON-LD (Organization description field)
    if OLD_ORG in html:
        html = html.replace(OLD_ORG, org)
    # Also catch compact JSON without spaces variants already covered by OLD_ORG

    return html


# Natural FAQ bank keyed by slug for indexable pages with machine residue
NATURAL_FAQ: dict[str, list[tuple[str, str]]] = {
    "atraso-na-medicao-obra-publica": [
        (
            "A medição atrasada autoriza cobrar juros ou reter serviço?",
            "Depende do contrato e da prova do atraso. Isole o valor executado, a data de envio do boletim e a obrigação da fiscalização de apreciar. Juros e medidas de preservação exigem cronologia e comunicação formal — não basta reclamação oral.",
        ),
        (
            "Quais documentos montar primeiro quando a medição não anda?",
            "Contrato e critério de medição, boletim assinado ou protocolado, diário de obra, fotos e comprovante de entrega. Em seguida, notificação pedindo apreciação em prazo razoável.",
        ),
        (
            "O maior risco prático é qual?",
            "Continuar executando sem registro do impasse e misturar glosa com atraso de apreciação. Isso enfraquece cobrança e confunde o que é direito líquido com o que ainda está em controvérsia.",
        ),
    ],
    "atraso-obra-culpa-administracao": [
        (
            "Como provar que o atraso é da Administração?",
            "Ligue o evento (projeto, desapropriação, frente não liberada, pagamento etc.) ao caminho crítico com cronograma, diário, comunicações e impacto de prazo. Sem nexo, a tese não sustenta prorrogação nem custo.",
        ),
        (
            "O que reunir antes de pedir prazo ou custo?",
            "Cronograma contratual e atualizado, registros contemporâneos do evento, notificações, medições afetadas e memória de cálculo do impacto. Formalize o pedido antes do vencimento cego do prazo.",
        ),
        (
            "Qual o erro mais caro neste cenário?",
            "Aceitar multa ou absorver atraso sem protestar a causa. Depois a narrativa da Administração fica unilateral e a empresa perde margem e prazo.",
        ),
    ],
    "aditivo-empreitada-por-preco-global": [
        (
            "Empreitada global impede aditivo?",
            "Não automaticamente. O regime define como se mede o objeto, mas alterações de projeto, quantitativos ou condições supervenientes ainda precisam de enquadramento nos arts. 124 e 125 da Lei 14.133 e no contrato.",
        ),
        (
            "O que provar antes de protocolar o aditivo?",
            "Descrição técnica da mudança, nexo com o projeto ou ordem da Administração, planilha do impacto e saldo percentual de alterações. Sem isso o pedido vira diligência eterna.",
        ),
        (
            "Qual o risco de executar sem termo?",
            "Serviço fora do papel vira disputa de preço e de legitimidade. Registre ordem, execute só o indispensável à segurança quando couber, e formalize o termo sem demora.",
        ),
    ],
    "administracao-local-orcamento-obra-publica": [
        (
            "Administração local vai no BDI ou em item próprio?",
            "Depende da metodologia do edital e da natureza do custo. O erro é duplicar ou omitir. Compare planilha, composições e regras de BDI do órgão antes de fechar a proposta.",
        ),
        (
            "O que validar primeiro na planilha?",
            "Critério do edital para custos indiretos, composições de canteiro/equipe local e coerência com o prazo. Só então discuta se o valor está no BDI ou em item discriminado.",
        ),
        (
            "Qual o risco prático?",
            "Proposta com administração local incoerente vira glosa na execução ou rejeição na análise de preços. Documente a premissa usada na oferta.",
        ),
    ],
    "comprovacao-exequibilidade-proposta-obra": [
        (
            "Quando a Administração pode exigir prova de exequibilidade?",
            "Quando o preço aparenta inexequível perante o edital e a legislação aplicável. A resposta deve mostrar composições, produtividade, BDI e premissas — sem fragilizar a planilha com improviso.",
        ),
        (
            "O que enviar na comprovação?",
            "Memórias de cálculo, cotações relevantes, premissas de produtividade e regime tributário coerente com a proposta. Evite anexos genéricos que não conversam com os itens questionados.",
        ),
        (
            "Qual o risco de uma resposta frágil?",
            "Desclassificação ou, pior, adjudicação de preço que a empresa não executa. Trate a comprovação como decisão de margem, não como formulário.",
        ),
    ],
    "data-base-orcamento-reajuste-obra-publica": [
        (
            "Por que a data-base importa tanto?",
            "Ela ancora reajuste e leitura de preços. Data-base errada distorce unitários e a margem ao longo do contrato.",
        ),
        (
            "O que checar no edital e na proposta?",
            "Data-base do orçamento de referência, índices de reajuste, periodicidade e se a proposta preserva a mesma lógica. Divergence vira glosa ou reajuste indevido.",
        ),
        (
            "Qual o erro mais comum?",
            "Assumir reajuste automático sem conferir índice, periodicidade e limites do contrato. Formalize a memória a cada ciclo.",
        ),
    ],
    "demolicao-nao-prevista-obra-publica": [
        (
            "Demolição fora da planilha é paga como?",
            "Como serviço não previsto ou alteração de escopo, se houver nexo com o projeto ou determinação da Administração. Sem registro, vira custo absorvido.",
        ),
        (
            "Quais provas reunir?",
            "Projeto, ordem ou interferência que gerou a demolição, medição do volume, fotos e comunicação tempestiva pedindo aditivo ou autorização.",
        ),
        (
            "Qual o risco de demolir e medir depois?",
            "Perder o nexo causal e o preço de referência. Avise antes, meça com fiscal e amarre ao termo aditivo quando couber.",
        ),
    ],
    "desconto-da-proposta-em-item-novo-aditivo": [
        (
            "O desconto da licitação se aplica a item novo?",
            "Em regra a Administração exige coerência com o desconto global da proposta, mas a formação do preço do item novo deve considerar composição real e o regime legal. Não há atalho automático sem base no edital/contrato.",
        ),
        (
            "Como montar o preço do item novo?",
            "Composição unitária, produtividade, BDI coerente e memória que explique desvios em relação à referência. Documente o desconto aplicado ou a justificativa técnica de não aplicar cegamente.",
        ),
        (
            "Qual o risco?",
            "Aceitar preço defasado para 'passar' o aditivo e destruir margem, ou inflar item e gerar glosa. Trate como formação de preço, não como barganha informal.",
        ),
    ],
    "empreitada-preco-global-preco-unitario": [
        (
            "Global ou unitária: o que muda na gestão?",
            "No global, o objeto e o risco de quantitativo pesam mais; no unitário, a medição item a item. A escolha do edital define como se prova e se altera o contrato.",
        ),
        (
            "O que a construtora deve ler no edital?",
            "Regime de execução, critério de medição, limites de alteração e matriz de riscos. Isso define se um desvio vira aditivo, reequilíbrio ou risco absorvido.",
        ),
        (
            "Qual o erro prático?",
            "Gerir um contrato global como se fosse unitário (ou o contrário) e perder prova de medição. Adapte diário, boletim e controle ao regime.",
        ),
    ],
    "fiscal-nao-assina-medicao-obra-publica": [
        (
            "Sem assinatura do fiscal a medição nunca pode ser cobrada?",
            "A falta de assinatura não apaga o serviço executado, mas enfraquece o recebimento se não houver registro contemporâneo, medições parciais, diário e notificação do impasse.",
        ),
        (
            "O que fazer nas primeiras 48 horas?",
            "Protocolar o boletim, registrar no diário a recusa ou o silêncio, notificar pedindo apreciação e preservar fotos/quantitativos. Não deixe o impasse só no WhatsApp.",
        ),
        (
            "Quando escalar?",
            "Quando o silêncio compromete caixa ou prazo e já há prova mínima de execução e de tentativa de regularizar a medição.",
        ),
    ],
    "glosa-por-qualidade-obra-publica": [
        (
            "A Administração pode glosar a medição inteira por qualidade?",
            "Glosa deve ser proporcional ao defeito demonstrado e ao critério contratual. Glosa total sem laudo ou sem oportunidade de saneamento costuma ser frágil — mas contestar exige prova técnica, não só indignação.",
        ),
        (
            "O que anexar na contestação?",
            "Critério de aceite do contrato, laudos/ensaios, diário, fotos e memória do trecho glosado versus o executado. Peça liberação da parcela incontroversa se houver.",
        ),
        (
            "Qual o risco de aceitar glosa calado?",
            "Criar precedente e corroer margem em medições futuras. Conteste no prazo e separe o que é retrabalho legítimo do que é glosa indevida.",
        ),
    ],
    "matriz-de-riscos-reequilibrio-economico-financeiro": [
        (
            "A matriz de riscos impede todo reequilíbrio?",
            "Não. Ela aloca riscos, mas não apaga eventos fora da alocação, onerosidade excessiva ou fatos da Administração. Leia a matriz junto com o contrato e a prova do evento.",
        ),
        (
            "O que provar no pedido?",
            "Evento, nexo com a execução, quantificação e por que o risco não era da contratada segundo a matriz e a lei. Sem isso o pedido vira narrativa genérica.",
        ),
        (
            "Qual o erro comum?",
            "Pedir reequilíbrio sem confrontar a cláusula de matriz. A Administração responde com a alocação e o processo morre na origem.",
        ),
    ],
    "medicao-por-evento-obra-publica": [
        (
            "Medição por evento muda a prova?",
            "Sim. Em vez de quantitativo contínuo, o gatilho é o marco/evento contratado. Sem evidência do evento e do aceite, o pagamento trava.",
        ),
        (
            "O que controlar no canteiro?",
            "Definição clara do evento, registro de conclusão, aceite da fiscalização e impacto em cronograma. Evite ambiguidade de 'quase pronto'.",
        ),
        (
            "Qual o risco?",
            "Executar além do evento sem formalizar e não conseguir medir. Trave escopo e aceite por escrito.",
        ),
    ],
    "pagamento-parcial-etapa-empreitada-global": [
        (
            "Dá para receber parcial em empreitada global?",
            "Quando o contrato e o critério de medição permitem etapas ou percentuais de avanço. Sem base contratual, o 'parcial' vira favor informal e frágil.",
        ),
        (
            "Como documentar o avanço?",
            "Critério de medição, memorial de cálculo do percentual, boletim e evidências de campo. Separe o que é incontroverso do que ainda está em disputa.",
        ),
        (
            "Qual o risco de aceitar parcial sem ressalva?",
            "Abrir mão de diferenças e de juros sobre o restante. Reserve direitos por escrito ao receber.",
        ),
    ],
    "prorrogacao-prazo-obra-publica-documentos": [
        (
            "Quais documentos não podem faltar no pedido de prazo?",
            "Cronograma, nexo causal do evento, diário, comunicações e impacto no caminho crítico. Pedido genérico de 'mais prazo' costuma ser indeferido.",
        ),
        (
            "Quando protocolar?",
            "Antes do vencimento do prazo e assim que o evento impactante estiver caracterizado. Demora da empresa enfraquece a tese.",
        ),
        (
            "Prazo e custo andam juntos?",
            "Muitas vezes sim, mas são pedidos com provas distintas. Organize a memória de custo à parte se houver ociosidade ou prolongamento de indiretos.",
        ),
    ],
    "resposta-notificacao-atraso-obra-publica": [
        (
            "Como estruturar a resposta à notificação de atraso?",
            "Admita fatos corretos, conteste incorretos, apresente cronologia, causas e pedidos objetivos (prazo, exclusão de multa, etc.). Tom agressivo sem prova piora a posição.",
        ),
        (
            "O que anexar?",
            "Cronograma, diário, comunicações à Administração, evidências de fatos externos e memória de impacto. Respeite o prazo da notificação.",
        ),
        (
            "Posso ignorar notificação informal?",
            "Não trate como irrelevante. Formalize o recebimento e responda no canal adequado. Silêncio vira confissão prática.",
        ),
    ],
    "sinapi-ou-sicro-obra-publica": [
        (
            "SINAPI ou SICRO: qual vale?",
            "A que o edital e a natureza do serviço indicarem. Rodovia e infraestrutura pesada costumam puxar SICRO; edificações, SINAPI — mas a regra do certame manda.",
        ),
        (
            "O que confrontar na proposta?",
            "Referência do edital, composições, BDI e ajustes locais. Misturar bases sem critério gera inexequibilidade aparente ou glosa.",
        ),
        (
            "Qual o risco de copiar composição genérica?",
            "Preço de referência incompatível com o serviço real. Ajuste produtividade e logística ao canteiro.",
        ),
    ],
}


def natural_converta_replacement(topic_phrase: str) -> str:
    """Replace machine 'Converta a discussão sobre X' with natural Portuguese."""
    topic = topic_phrase.strip()
    # Light cleanup: ensure readable
    return (
        f"Delimite o problema — valor, período, serviço afetado, decisão necessária e "
        f"responsável — antes de discutir {topic}. Objeto vago gera resposta vaga."
    )


def rewrite_machine_copy(html: str, slug: str, h1: str) -> str:
    """Rewrite machine FAQ blocks and Converta phrases for one page."""
    # Converta a discussão...
    def repl_converta(m: re.Match[str]) -> str:
        topic = m.group(1).strip()
        return natural_converta_replacement(topic)

    html = re.sub(
        r"Converta a discuss[aã]o sobre\s+(.+?)\s+em um objeto delimitado, com valor, período, serviço, decisão e responsável identificados\.",
        repl_converta,
        html,
        flags=re.I,
    )
    # "O caso de {slug tokens} só se sustenta..." (allow inline tags)
    html = re.sub(
        r"O caso de\s+(?:<[^>]+>)?[a-záàâãéêíóôõúç0-9\s\-]{8,80}(?:</[^>]+>)?\s+s[oó] se sustenta[^.]*\.",
        "O desfecho depende de prova contemporânea, enquadramento contratual e quantificação do impacto — não de narrativa genérica.",
        html,
        flags=re.I,
    )
    # "absorver custo ou risco de {slug} sem prova"
    html = re.sub(
        r"absorver custo ou risco de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,60}\s+sem prova",
        "absorver custo ou risco sem prova documental suficiente",
        html,
        flags=re.I,
    )

    faqs = NATURAL_FAQ.get(slug)
    if not faqs:
        # Generic natural FAQ from H1 — only if machine FAQ present
        if not re.search(r"Qual documento deve ser lido primeiro em um caso de", html, re.I):
            return html
        title = h1.split("|")[0].strip()
        faqs = [
            (
                f"O que decide o desfecho em {title.lower()}?",
                "A prova contemporânea, o enquadramento contratual e a quantificação do impacto. Sem nexo entre fato, cláusula e valor, o pedido não se sustenta — qualquer que seja o tema.",
            ),
            (
                "Quais documentos reunir primeiro?",
                "Contrato e anexos, registros de campo (diário, fotos, medições), comunicações oficiais e memória de cálculo do impacto. Depois, enquadre o pedido (aditivo, prazo, pagamento, defesa).",
            ),
            (
                "Quando buscar apoio especializado?",
                "Quando o valor, o prazo ou o risco de sanção já supera o improviso interno, ou quando a Administração já formalizou glosa, notificação ou indeferimento.",
            ),
        ]

    faq_items = []
    ld_entities = []
    for q, a in faqs:
        faq_items.append(
            f"<details><summary>{html_lib.escape(q)}</summary><p>{html_lib.escape(a)}</p></details>"
        )
        ld_entities.append(
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
        )
    new_faq_html = (
        '<section class="article-faq"><p class="eyebrow">Perguntas frequentes</p>'
        "<h2>Dúvidas objetivas</h2>"
        f'<div class="faq-list">{"".join(faq_items)}</div></section>'
    )
    html2, n = re.subn(
        r'<section class="article-faq">.*?</section>',
        new_faq_html,
        html,
        count=1,
        flags=re.S,
    )
    if n:
        html = html2

    # Patch FAQPage nodes inside any JSON-LD script blocks
    def patch_script(m: re.Match[str]) -> str:
        raw = m.group(1)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return m.group(0)
        graph = data.get("@graph") if isinstance(data, dict) else None
        if isinstance(graph, list):
            for node in graph:
                if isinstance(node, dict) and node.get("@type") == "FAQPage":
                    node["mainEntity"] = ld_entities
            return (
                '<script type="application/ld+json">'
                + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                + "</script>"
            )
        return m.group(0)

    html = re.sub(
        r'<script type="application/ld\+json">(\{.*?\})</script>',
        patch_script,
        html,
        flags=re.S,
    )
    return html


def filter_related_links(html: str, indexable: dict[str, bool]) -> str:
    """Remove related cards pointing to noindex URLs; keep indexable only."""

    def filter_section(m: re.Match[str]) -> str:
        block = m.group(0)
        cards = re.findall(r'<a class="related-card"[^>]*>.*?</a>', block, re.S)
        kept = []
        for card in cards:
            hrefs = re.findall(r'href="(/conteudos/[^"]+)"', card)
            if not hrefs:
                kept.append(card)
                continue
            href = hrefs[0]
            if not href.endswith("/"):
                href = href + "/"
            if indexable.get(href, False):
                kept.append(card)
            # drop noindex
        if not kept:
            # keep section but empty grid with note? Better remove section
            return ""
        grid = f'<div class="related-grid">{"".join(kept)}</div>'
        # replace grid inside block
        block2 = re.sub(r'<div class="related-grid">.*?</div>', grid, block, count=1, flags=re.S)
        return block2

    return re.sub(
        r'<section class="related-section">.*?</section>',
        filter_section,
        html,
        flags=re.S,
    )


def inject_journey_cta(html: str, brand: dict[str, Any], journey_id: str, topic: str, origem: str) -> str:
    """Ensure primary CTA language matches journey; soft patch of lead-inline titles."""
    journeys = {j["id"]: j for j in brand.get("journeys") or []}
    j = journeys.get(journey_id) or journeys.get("contrato")
    if not j:
        return html
    # Add data-journey on body if missing
    if "data-journey=" not in html:
        html = re.sub(
            r"<body([^>]*)>",
            rf'<body\1 data-journey="{journey_id}" data-content-cluster="{html_lib.escape(topic[:40])}">',
            html,
            count=1,
        )
    # Soft-replace generic "Quer validar este cenário" lead with journey-aware next step
    cta = j.get("cta") or "Enviar documentos para análise"
    next_step = j.get("next_step") or ""
    wa = wa_url(j.get("wa_message") or "Olá, Tiago. Preciso de apoio em contrato público.")
    form = f"/?{j.get('href_params') or 'jornada='+journey_id}&tema={quote(topic)}&origem={quote(origem)}#contato"

    new_lead = (
        f'<section class="lead-inline" id="diagnostico-confenge" aria-label="Próximo passo" '
        f'data-journey="{journey_id}">'
        f'<div class="lead-inline-copy"><span>Próximo passo</span>'
        f"<strong>{html_lib.escape(cta)}</strong>"
        f"<p>{html_lib.escape(next_step or 'Envie os documentos essenciais. Retorno com enquadramento técnico — sem promessa de resultado.')}</p>"
        f"</div>"
        f'<div class="lead-inline-actions">'
        f'<a class="button button-primary" data-cta-position="inline" data-journey="{journey_id}" '
        f'href="{wa}" rel="noopener" target="_blank">{html_lib.escape(cta)} no WhatsApp</a>'
        f'<a class="button button-secondary" data-cta-position="form" data-journey="{journey_id}" '
        f'href="{form}">Continuar pelo formulário</a>'
        f"</div></section>"
    )
    html2, n = re.subn(
        r'<section class="lead-inline"[^>]*>.*?</section>',
        new_lead,
        html,
        count=1,
        flags=re.S,
    )
    if n:
        html = html2
    return html


def remediate_conteudos_pages(brand: dict[str, Any]) -> dict[str, Any]:
    idx_map = indexable_map()
    stats = {"shell": 0, "machine": 0, "related": 0, "journey": 0, "indexable": 0, "noindex": 0}
    for p in sorted((ROOT / "conteudos").glob("*/index.html")):
        html = _read(p)
        slug = p.parent.name
        url = f"/conteudos/{slug}/"
        indexable = idx_map.get(url, False)
        if indexable:
            stats["indexable"] += 1
        else:
            stats["noindex"] += 1

        # cluster from article:section or breadcrumb
        section_m = re.search(
            r'property="article:section"\s+content="([^"]+)"',
            html,
        ) or re.search(
            r'content="([^"]+)"\s+property="article:section"',
            html,
        )
        # infer cluster from related pillar link
        pillar = re.search(r'href="/(medicoes-glosas-obras-publicas|aditivos-obras-publicas|reequilibrio-obras-publicas|atrasos-prorrogacao-obras-publicas|defesa-tecnica-contratos-publicos|acompanhamento-contratos-obras|diagnostico-pre-licitacao|auditoria-orcamento-licitacao)/"', html)
        cluster = pillar.group(1) if pillar else "acompanhamento-contratos-obras"
        journey = CLUSTER_JOURNEY.get(cluster, "contrato")

        h1_m = re.search(r"<h1>([^<]+)</h1>", html)
        h1 = h1_m.group(1).strip() if h1_m else slug

        before = html
        html = patch_shell(html, brand, current="/conteudos/")
        if indexable:
            machine_re = re.compile(
                r"Converta a discuss|Qual documento deve ser lido primeiro em um caso de|"
                r"primeiro risco pr[aá]tico em um caso de|O caso de\s+.{8,80}?\s+s[oó] se sustenta|"
                r"absorver custo ou risco de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,60}\s+sem prova",
                re.I,
            )
            if machine_re.search(html):
                html = rewrite_machine_copy(html, slug, h1)
            # JSON-LD about.name often dumps raw slug tokens — naturalize for indexable pages
            natural_about = h1.split("|")[0].strip()
            html = re.sub(
                r'("about"\s*:\s*\[\s*\{\s*"@type"\s*:\s*"Thing"\s*,\s*"name"\s*:\s*")([^"]+)(")',
                lambda m: m.group(1) + natural_about + m.group(3),
                html,
                count=1,
            )
            # Delimite/Converta soft replacements may still leave raw slug token runs in body
            slug_tokens = [t for t in slug.split("-") if len(t) > 2]
            if len(slug_tokens) >= 5:
                raw_seq = " ".join(slug_tokens)
                if raw_seq in html.lower():
                    # Replace case-insensitively with a natural phrase from H1
                    html = re.sub(
                        re.escape(raw_seq),
                        natural_about.lower(),
                        html,
                        flags=re.I,
                    )
                stats["machine"] += 1
            html = filter_related_links(html, idx_map)
            html = inject_journey_cta(html, brand, journey, h1, url)
            stats["journey"] += 1
        else:
            # noindex: still patch shell + related so we don't promote more noindex
            html = filter_related_links(html, idx_map)
            # Soft fix worst machine openers without full rewrite campaign
            html = re.sub(
                r"Converta a discuss[aã]o sobre\s+(.+?)\s+em um objeto delimitado, com valor, período, serviço, decisão e responsável identificados\.",
                lambda m: natural_converta_replacement(m.group(1)),
                html,
                flags=re.I,
            )

        if html != before:
            stats["shell"] += 1
            _write(p, html)
            stats["related"] += 1
    return stats


def remediate_hub(brand: dict[str, Any]) -> dict[str, Any]:
    hub_path = ROOT / "conteudos" / "index.html"
    html = _read(hub_path)
    idx_map = indexable_map()
    idx_n = sum(1 for v in idx_map.values() if v)

    # Remove directory items for noindex
    removed = 0

    def keep_item(m: re.Match[str]) -> str:
        nonlocal removed
        block = m.group(0)
        hrefs = re.findall(r'href="(/conteudos/[^"]+/)"', block)
        if not hrefs:
            return block
        href = hrefs[0]
        if idx_map.get(href, False):
            return block
        removed += 1
        return ""

    html = re.sub(
        r'<article class="content-directory-item"[^>]*>.*?</article>',
        keep_item,
        html,
        flags=re.S,
    )

    # Featured: rebuild from indexable only
    # Collect metadata from remaining items
    items_meta = []
    for p in (ROOT / "conteudos").glob("*/index.html"):
        url = f"/conteudos/{p.parent.name}/"
        if not idx_map.get(url):
            continue
        t = _read(p)
        h1 = re.search(r"<h1>([^<]+)</h1>", t)
        section = re.search(
            r'property="article:section"\s+content="([^"]+)"', t
        ) or re.search(r'content="([^"]+)"\s+property="article:section"', t)
        lead = re.search(r'class="content-lead">([^<]+)', t)
        items_meta.append(
            {
                "url": url,
                "h1": h1.group(1).strip() if h1 else p.parent.name,
                "section": section.group(1).strip() if section else "Guia técnico",
                "lead": (lead.group(1).strip() if lead else "")[:120],
            }
        )

    # Prefer known high-intent indexable first (never superseded redirects).
    priority = [
        "/conteudos/atraso-pagamento-contrato-publico-suspender/",
        "/conteudos/glosa-por-qualidade-obra-publica/",
        "/conteudos/resposta-notificacao-atraso-obra-publica/",
        "/conteudos/sinapi-desonerado-nao-desonerado/",
        "/conteudos/comprovacao-exequibilidade-proposta-obra/",
        "/conteudos/medicao-de-obra-publica-rejeitada/",
    ]
    by_url = {i["url"]: i for i in items_meta}
    featured = []
    for u in priority:
        if u in by_url:
            featured.append(by_url[u])
        if len(featured) >= 6:
            break
    for i in items_meta:
        if i not in featured:
            featured.append(i)
        if len(featured) >= 6:
            break

    feat_html = []
    for f in featured:
        feat_html.append(
            f'<a class="featured-content" href="{f["url"]}">'
            f'<span>{html_lib.escape(f["section"][:60])}</span>'
            f'<h2>{html_lib.escape(f["h1"])}</h2>'
            f'<p>{html_lib.escape(f["lead"] or "Leitura técnica para decisão em contrato ou licitação.")}</p>'
            f'<small>Ler guia <svg class="icon"><use href="#i-arrow"></use></svg></small></a>'
        )
    html = re.sub(
        r'<div class="featured-grid">.*?</div>',
        f'<div class="featured-grid">{"".join(feat_html)}</div>',
        html,
        count=1,
        flags=re.S,
    )

    # Replace count claims (any stale N, not only the historic 120)
    html = re.sub(r"\b\d+\s+guias\b", f"{idx_n} guias", html)
    html = re.sub(r"\bTodos os \d+\s+guias\b", f"Todos os {idx_n} guias", html)
    html = re.sub(r"\b\d+\s+conteúdos encontrados\b", f"{idx_n} conteúdos encontrados", html)
    html = re.sub(
        r"\d+\s+guias organizados por problema e estágio",
        f"{idx_n} guias indexáveis organizados por problema e estágio (demais em revisão editorial)",
        html,
    )
    html = re.sub(
        r"<strong>\d+</strong><span>perguntas técnicas</span>",
        f"<strong>{idx_n}</strong><span>guias indexáveis</span>",
        html,
    )
    html = re.sub(
        r"<strong>\d+</strong><span>guias indexáveis</span>",
        f"<strong>{idx_n}</strong><span>guias indexáveis</span>",
        html,
    )
    # JSON-LD ItemList numberOfItems
    html = re.sub(
        r'"numberOfItems"\s*:\s*\d+',
        f'"numberOfItems":{idx_n}',
        html,
    )
    # Rebuild ItemList elements only for indexable (simple approach: replace whole ItemList if present)
    # Drop any remaining noindex URLs from ItemList by filtering list items with noindex paths
    def filter_list_item(m: re.Match[str]) -> str:
        block = m.group(0)
        url_m = re.search(r'"url"\s*:\s*"(https://confenge\.com\.br)?(/conteudos/[^"]+)"', block)
        if not url_m:
            return block
        path = url_m.group(2)
        if not path.endswith("/"):
            path = path + "/"
        if path == "/conteudos/":
            return block
        if idx_map.get(path, False):
            return block
        return ""

    html = re.sub(
        r'\{\s*"@type"\s*:\s*"ListItem"[^}]*\}',
        filter_list_item,
        html,
    )
    # clean double commas in json
    html = re.sub(r",\s*,+", ",", html)
    html = re.sub(r"\[\s*,", "[", html)
    html = re.sub(r",\s*\]", "]", html)

    # Cluster card counts: recount indexable per data-cluster
    cluster_counts: dict[str, int] = defaultdict(int)
    for m in re.finditer(
        r'data-cluster="([^"]+)"[^>]*data-search="[^"]*"[^>]*>.*?</article>',
        html,
        re.S,
    ):
        # only remaining items are indexable
        cluster_counts[m.group(1)] += 1
    # Also count from files
    cluster_counts = defaultdict(int)
    for p in (ROOT / "conteudos").glob("*/index.html"):
        url = f"/conteudos/{p.parent.name}/"
        if not idx_map.get(url):
            continue
        t = _read(p)
        pillar = re.search(
            r'href="/(medicoes-glosas-obras-publicas|aditivos-obras-publicas|reequilibrio-obras-publicas|atrasos-prorrogacao-obras-publicas|defesa-tecnica-contratos-publicos|acompanhamento-contratos-obras|diagnostico-pre-licitacao|auditoria-orcamento-licitacao)/"',
            t,
        )
        if pillar:
            cluster_counts[pillar.group(1)] += 1

    def fix_cluster_card(m: re.Match[str]) -> str:
        block = m.group(0)
        href_m = re.search(r'href="(/[^"]+)/?"', block)
        if not href_m:
            return block
        slug = href_m.group(1).strip("/").split("/")[-1]
        n = cluster_counts.get(slug, 0)
        block = re.sub(r"<strong>\d+\s*guias?</strong>", f"<strong>{n} guias</strong>", block)
        return block

    html = re.sub(r'<a class="cluster-card"[^>]*>.*?</a>', fix_cluster_card, html, flags=re.S)

    html = patch_shell(html, brand, current="/conteudos/")
    # Hub intro honesty — whole <p class="content-lead"> only (never partial attrs)
    lead = (
        f'<p class="content-lead">{idx_n} guias indexáveis e publicamente recomendados. '
        f'Outros materiais permanecem em revisão editorial (noindex) e não entram nesta lista.</p>'
    )
    if re.search(r'<p class="content-lead">', html):
        html = re.sub(r'<p class="content-lead">[^<]*</p>', lead, html, count=1)
    elif re.search(r'<p R guias indexáveis', html) or re.search(
        r'<p[^>]*>\s*R?\s*guias indexáveis', html
    ):
        html = re.sub(
            r'<p[^>]*>\s*R?\s*guias indexáveis e publicamente recomendados\.[^<]*</p>',
            lead,
            html,
            count=1,
        )
    elif "demais em revisão" not in html:
        def _insert_lead(m: re.Match[str]) -> str:
            return m.group(1) + lead

        html = re.sub(
            r'(<header class="content-hero hub-hero"[^>]*>.*?<h1>[^<]*</h1>)',
            _insert_lead,
            html,
            count=1,
            flags=re.S,
        )
    # Strip forbidden internal language / false inteligencia inventory claims
    html = re.sub(r'\bdatalake\b', 'base pública de contratos', html, flags=re.I)
    if 'agregados sanitizados' in html or 'publica páginas evergreen' in html:
        html = re.sub(
            r'<section class="section section-soft" id="inteligencia-pseo">.*?</section>',
            (
                '<section class="section section-soft" id="inteligencia-pseo">'
                '<div class="container">'
                '<p class="eyebrow">Ferramentas e pesquisa</p>'
                '<h2>Do guia à decisão com evidência</h2>'
                '<p>Use as ferramentas gratuitas e o Radar aberto (metodologia e demanda verificável). '
                'Páginas de inteligência de mercado só entram na navegação pública depois de revisão técnica '
                'e critérios de singularidade.</p>'
                '<p><a class="button button-secondary" href="/ferramentas/">Abrir ferramentas</a> '
                '<a class="button button-secondary" href="/radar/nacional-obras-publicas/">Radar Nacional</a></p>'
                '</div></section>'
            ),
            html,
            count=1,
            flags=re.S,
        )

    _write(hub_path, html)
    return {"removed_directory_items": removed, "indexable_count": idx_n, "featured": len(featured)}


def remediate_feed() -> dict[str, Any]:
    feed_path = ROOT / "feed.xml"
    if not feed_path.exists():
        return {"ok": False, "reason": "missing"}
    text = _read(feed_path)
    idx_map = indexable_map()
    # RSS items
    removed = 0

    def keep_item(m: re.Match[str]) -> str:
        nonlocal removed
        block = m.group(0)
        links = re.findall(r"<link>([^<]+)</link>", block)
        for loc in links:
            path = _normalize_conteudos_url(loc)
            if path in SUPERSEDED_URLS:
                removed += 1
                return ""
            if path.startswith("/conteudos/") and path.rstrip("/") != "/conteudos":
                if not idx_map.get(path, False):
                    removed += 1
                    return ""
        return block

    text2 = re.sub(r"<item>.*?</item>", keep_item, text, flags=re.S)
    # Collapse blank lines left by removed items without rewriting channel metadata.
    text2 = re.sub(r"\n{3,}", "\n\n", text2)
    _write(feed_path, text2)
    return {"removed_items": removed}


PILLARS = (
    "medicoes-glosas-obras-publicas",
    "aditivos-obras-publicas",
    "reequilibrio-obras-publicas",
    "atrasos-prorrogacao-obras-publicas",
    "defesa-tecnica-contratos-publicos",
    "acompanhamento-contratos-obras",
    "diagnostico-pre-licitacao",
    "auditoria-orcamento-licitacao",
)


def remediate_pillars(brand: dict[str, Any]) -> dict[str, Any]:
    """Filter commercial pillar libraries to indexable guides only; align counts."""
    idx_map = indexable_map()
    stats: dict[str, Any] = {"pillars": {}, "total_removed": 0}
    for pillar in PILLARS:
        p = ROOT / pillar / "index.html"
        if not p.exists():
            continue
        html = _read(p)
        removed = 0

        def keep_library_item(m: re.Match[str]) -> str:
            nonlocal removed
            block = m.group(0)
            hrefs = re.findall(r'href="(/conteudos/[^"]+/)"', block)
            if not hrefs:
                return block
            href = hrefs[0]
            if idx_map.get(href, False):
                return block
            removed += 1
            return ""

        html2 = re.sub(
            r'<article class="library-item"[^>]*>.*?</article>',
            keep_library_item,
            html,
            flags=re.S,
        )
        html = html2

        # Renumber ranks and recount
        kept = list(
            re.finditer(r'<article class="library-item"[^>]*>.*?</article>', html, re.S)
        )
        n_kept = len(kept)
        # rewrite ranks 01..n
        rank = 0

        def renumber(m: re.Match[str]) -> str:
            nonlocal rank
            rank += 1
            block = m.group(0)
            return re.sub(
                r'<div class="library-rank">\d+</div>',
                f'<div class="library-rank">{rank:02d}</div>',
                block,
                count=1,
            )

        html = re.sub(
            r'<article class="library-item"[^>]*>.*?</article>',
            renumber,
            html,
            flags=re.S,
        )

        # pillar-stat / hero guide counts
        html = re.sub(
            r"(Ver os )\d+( guias)",
            rf"\g<1>{n_kept}\2",
            html,
        )
        # Replace first guide-count strong in pillar-stat
        html = re.sub(
            r'(class="pillar-stat">\s*<strong>)\d+(</strong>\s*<span>[^<]*guia[^<]*</span>)',
            rf"\g<1>{n_kept}\2",
            html,
            count=1,
            flags=re.I | re.S,
        )
        # Also plain "N guias" claims inside hero/stat when overstated
        def fix_count_claim(m: re.Match[str]) -> str:
            try:
                val = int(m.group(1))
            except ValueError:
                return m.group(0)
            if val > n_kept:
                return f"{n_kept}{m.group(2)}"
            return m.group(0)

        html = re.sub(r"\b(\d{1,3})(\s+guias?\b)", fix_count_claim, html, flags=re.I)

        # ItemList numberOfItems in pillar JSON-LD
        html = re.sub(
            r'"numberOfItems"\s*:\s*\d+',
            f'"numberOfItems":{n_kept}',
            html,
        )

        # Drop noindex ListItems from JSON-LD
        def filter_list_item(m: re.Match[str]) -> str:
            block = m.group(0)
            url_m = re.search(
                r'"url"\s*:\s*"(https://confenge\.com\.br)?(/conteudos/[^"]+)"', block
            )
            if not url_m:
                return block
            path = url_m.group(2)
            if not path.endswith("/"):
                path = path + "/"
            if idx_map.get(path, False):
                return block
            return ""

        html = re.sub(
            r'\{\s*"@type"\s*:\s*"ListItem"[^}]*\}',
            filter_list_item,
            html,
        )
        html = re.sub(r",\s*,+", ",", html)
        html = re.sub(r"\[\s*,", "[", html)
        html = re.sub(r",\s*\]", "]", html)

        html = patch_shell(html, brand, current=f"/{pillar}/")
        _write(p, html)
        stats["pillars"][pillar] = {"kept": n_kept, "removed": removed}
        stats["total_removed"] += removed
    return stats


def remediate_editorial_and_commercial(brand: dict[str, Any]) -> int:
    n = 0
    paths: list[Path] = [ROOT / "index.html"]
    for o in brand.get("offers") or []:
        url = (o.get("url") or "").strip("/")
        if url:
            paths.append(ROOT / url / "index.html")
    for base in (
        "guias-contratos-obras",
        "lei-14133-obras",
        "jurisprudencia-contratos-obras",
        *PILLARS,
        "especialista",
        "metodologia-inteligencia",
        # Note: do NOT walk inteligencia/* bulk org pages — only hub if present
    ):
        b = ROOT / base
        if not b.exists():
            continue
        if (b / "index.html").exists():
            paths.append(b / "index.html")
        # only one level for editorial clusters; never bulk inteligencia children
        if base != "inteligencia":
            for p in b.glob("*/index.html"):
                paths.append(p)

    # inteligencia hub only
    intel_hub = ROOT / "inteligencia" / "index.html"
    if intel_hub.exists():
        paths.append(intel_hub)

    seen = set()
    for p in paths:
        if p in seen or not p.exists():
            continue
        seen.add(p)
        html = _read(p)
        # only patch public shells (skip huge unchanged if already good)
        new = patch_shell(html, brand)
        if new != html:
            _write(p, new)
            n += 1
    return n


def fix_radar(brand: dict[str, Any]) -> None:
    """Ensure radar hub is honest: noindex if not a real public product feed; CTA present."""
    p = ROOT / "radar" / "index.html"
    if not p.exists():
        return
    html = _read(p)
    # Force noindex until calibrated product is published (matches brand contract test)
    html = re.sub(
        r'content="index,follow"',
        'content="noindex,follow"',
        html,
        count=1,
    )
    html = re.sub(
        r'name="robots" content="[^"]+"',
        'name="robots" content="noindex,follow"',
        html,
        count=1,
    )
    html = re.sub(
        r'content="[^"]+" name="robots"',
        'content="noindex,follow" name="robots"',
        html,
        count=1,
    )
    if "Configurar meu radar" not in html:
        wa = wa_url(
            "Olá, Tiago. Quero configurar o radar de oportunidades com o perfil da minha construtora."
        )
        cta = (
            '<section class="lead-inline" id="radar-cta">'
            '<div class="lead-inline-copy"><span>Próximo passo</span>'
            "<strong>Sem perfil da empresa, o radar vira ruído.</strong>"
            "<p>Calibre o recorte à capacidade, acervo e órgãos-alvo — não assine mais um alerta genérico.</p>"
            "</div><div class=\"lead-inline-actions\">"
            f'<a class="button button-primary" href="{wa}" rel="noopener" target="_blank">'
            "Configurar meu radar de oportunidades</a>"
            '<a class="button button-secondary" href="/diagnostico-b2g-360/">Começar pelo diagnóstico B2G</a>'
            "</div></section>"
        )
        if "</main>" in html:
            html = html.replace("</main>", cta + "</main>", 1)
        else:
            html += cta
    html = patch_shell(html, brand)
    _write(p, html)


def build_inventory(brand: dict[str, Any]) -> list[dict[str, Any]]:
    """Full disposition inventory for known public URLs."""
    idx_map = indexable_map()
    rows: list[dict[str, Any]] = []

    def add(
        url: str,
        page_type: str,
        title: str,
        *,
        robots: str = "",
        disposition: str,
        cluster: str = "",
        journey: str = "",
        notes: str = "",
        path: str = "",
    ) -> None:
        rows.append(
            {
                "url": url,
                "page_type": page_type,
                "title": title,
                "search_intent": title,
                "cluster": cluster,
                "http_status_production": "UNVERIFIED",
                "canonical": f"{SITE}{url}" if url.startswith("/") else url,
                "robots": robots,
                "in_sitemap": False,  # filled later
                "in_hub": False,
                "in_feed": False,
                "internal_links_in": "",
                "editorial_status": "",
                "human_approval": "",
                "traffic": "NO_DATA",
                "backlinks": "NO_DATA",
                "cta": "",
                "commercial_service": CLUSTER_OFFER.get(journey, ""),
                "similarity_notes": "",
                "disposition": disposition,
                "journey": journey,
                "notes": notes,
                "path": path,
            }
        )

    # Home + commercial
    add("/", "home", "Homepage CONFENGE", robots="index,follow", disposition="KEEP_AND_IMPROVE", journey="operacao")
    for o in brand.get("offers") or []:
        add(
            o.get("url") or "",
            "offer",
            o.get("plain_name") or o.get("name") or "",
            robots="index,follow",
            disposition="KEEP_AND_IMPROVE",
            journey="operacao" if "diretoria" in (o.get("id") or "") or "diagnostico" in (o.get("id") or "") else (
                "edital" if "bid" in (o.get("id") or "") else "contrato"
            ),
            notes=f"offer_id={o.get('id')}",
        )

    # Pillars
    for slug, cluster in [
        ("medicoes-glosas-obras-publicas", "medicoes"),
        ("aditivos-obras-publicas", "aditivos"),
        ("reequilibrio-obras-publicas", "reequilibrio"),
        ("atrasos-prorrogacao-obras-publicas", "atrasos"),
        ("defesa-tecnica-contratos-publicos", "defesa"),
        ("acompanhamento-contratos-obras", "gestao"),
        ("diagnostico-pre-licitacao", "edital"),
        ("auditoria-orcamento-licitacao", "orcamento"),
    ]:
        p = ROOT / slug / "index.html"
        if p.exists():
            t = _read(p)
            title_m = re.search(r"<title>([^<]+)", t)
            add(
                f"/{slug}/",
                "pillar",
                title_m.group(1) if title_m else slug,
                robots=robots_of(t),
                disposition="KEEP_AND_IMPROVE",
                cluster=cluster,
                journey=CLUSTER_JOURNEY.get(slug, "contrato"),
                path=str(p.relative_to(ROOT)),
            )

    # Conteudos
    for p in sorted((ROOT / "conteudos").glob("*/index.html")):
        t = _read(p)
        url = f"/conteudos/{p.parent.name}/"
        title_m = re.search(r"<title>([^<]+)", t)
        h1 = re.search(r"<h1>([^<]+)", t)
        rob = robots_of(t)
        machine = bool(
            re.search(
                r"Converta a discuss|Qual documento deve ser lido primeiro em um caso de|primeiro risco pr[aá]tico em um caso de",
                t,
                re.I,
            )
        )
        if not is_indexable_html(t):
            disp = "RETAIN_NOINDEX"
            notes = "noindex; excluded from hub/sitemap/feed after remediation"
            if machine:
                notes += "; machine residue allowed offline until rewrite wave"
        else:
            disp = "REWRITE_BEFORE_INDEX" if machine else "KEEP_AND_IMPROVE"
            notes = "indexable library page" + ("; machine residue pending" if machine else "")
        pillar = re.search(
            r'href="/(medicoes-glosas-obras-publicas|aditivos-obras-publicas|reequilibrio-obras-publicas|atrasos-prorrogacao-obras-publicas|defesa-tecnica-contratos-publicos|acompanhamento-contratos-obras|diagnostico-pre-licitacao|auditoria-orcamento-licitacao)/"',
            t,
        )
        cluster = pillar.group(1) if pillar else ""
        add(
            url,
            "conteudo",
            (h1.group(1) if h1 else title_m.group(1) if title_m else p.parent.name),
            robots=rob,
            disposition=disp,
            cluster=cluster,
            journey=CLUSTER_JOURNEY.get(cluster, "contrato"),
            notes=notes,
            path=str(p.relative_to(ROOT)),
        )

    # Editorial wave1
    reg_path = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"
    if reg_path.exists():
        reg = json.loads(reg_path.read_text(encoding="utf-8"))
        for page in reg.get("pages") or []:
            url = page.get("url") or ""
            status = page.get("status") or ""
            if status == "INDEXABLE":
                disp = "KEEP_AND_IMPROVE"
                human = "HUMAN_APPROVED (registry on branch; do not auto-extend)"
            elif status == "REJECTED":
                disp = "BLOCKED_MISSING_EVIDENCE"
                human = "REJECTED"
            else:
                disp = "BLOCKED_HUMAN_REVIEW"
                human = status
            row = {
                "url": url,
                "page_type": "editorial",
                "title": page.get("title") or "",
                "search_intent": page.get("primary_keyword") or "",
                "cluster": page.get("theme") or "",
                "http_status_production": "UNVERIFIED",
                "canonical": f"{SITE}{url}",
                "robots": "index,follow" if status == "INDEXABLE" else "noindex,follow",
                "in_sitemap": status == "INDEXABLE",
                "in_hub": False,
                "in_feed": False,
                "internal_links_in": "",
                "editorial_status": status,
                "human_approval": human,
                "traffic": "NO_DATA",
                "backlinks": "NO_DATA",
                "cta": page.get("cta_offer") or "",
                "commercial_service": "",
                "similarity_notes": "",
                "disposition": disp,
                "journey": "contrato" if page.get("journey") == "execucao" else page.get("journey") or "contrato",
                "notes": "Wave 1 — approval path is Tiago-only (PR #10)",
                "path": "",
            }
            rows.append(row)

    # Legacy
    for url, code, disp in [
        ("/vision", "410", "RETIRE_410"),
        ("/nexgen", "410", "RETIRE_410"),
        ("/avcbclcb", "410", "RETIRE_410"),
        ("/avaliacoes", "410", "RETIRE_410"),
        ("/ia", "410", "RETIRE_410"),
        ("/automacao", "410", "RETIRE_410"),
        ("/blog", "301", "REDIRECT_301"),
        ("/servicos", "301", "REDIRECT_301"),
        ("/contato", "301", "REDIRECT_301"),
    ]:
        add(
            url,
            "legacy",
            f"Legacy {url}",
            robots="n/a",
            disposition=disp,
            notes=f"expected {code} per _redirects; production proof separate",
        )

    # Sitemap membership
    sm_urls = set()
    for sm in ["sitemap.xml", "sitemap-editorial.xml", "sitemap-jurisprudencia.xml", "sitemap-inteligencia.xml"]:
        sp = ROOT / sm
        if not sp.exists():
            continue
        for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", _read(sp)):
            path = re.sub(r"^https?://[^/]+", "", loc)
            sm_urls.add(path if path.endswith("/") or path == "/" or "." in path.split("/")[-1] else path + "/")

    hub_html = _read(ROOT / "conteudos" / "index.html") if (ROOT / "conteudos" / "index.html").exists() else ""
    feed_html = _read(ROOT / "feed.xml") if (ROOT / "feed.xml").exists() else ""

    for row in rows:
        u = row["url"]
        if not u.endswith("/") and u != "/" and not u.endswith((".html", ".xml")):
            u = u + "/"
            row["url"] = u
        row["in_sitemap"] = u in sm_urls or row["url"] in sm_urls
        row["in_hub"] = row["url"] in hub_html
        row["in_feed"] = row["url"] in feed_html or (SITE + row["url"]) in feed_html

    return rows


def write_inventory(rows: list[dict[str, Any]]) -> None:
    out_dir = ROOT / "docs" / "seo"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "URL-DISPOSITION-MATRIX.json"
    csv_path = out_dir / "URL-DISPOSITION-MATRIX.csv"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if rows:
        fields = list(rows[0].keys())
        with csv_path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)


def main() -> int:
    brand = load_brand()
    report: dict[str, Any] = {"date": TODAY}

    report["radar"] = "fixed"
    fix_radar(brand)

    # Superseded pages first so hub/feed/indexable_map never treat them as KEEP.
    report["superseded"] = force_noindex_superseded_pages()
    report["hub"] = remediate_hub(brand)
    report["feed"] = remediate_feed()
    report["conteudos"] = remediate_conteudos_pages(brand)
    report["pillars"] = remediate_pillars(brand)
    report["shell_other"] = remediate_editorial_and_commercial(brand)

    # Re-run hub + pillars after page rewrites so counts stay correct
    report["hub_pass2"] = remediate_hub(brand)
    report["pillars_pass2"] = remediate_pillars(brand)
    report["feed_pass2"] = remediate_feed()

    rows = build_inventory(brand)
    # After remediation, reclassify machine indexable as KEEP if clean
    for row in rows:
        if row.get("page_type") == "conteudo" and row.get("disposition") == "REWRITE_BEFORE_INDEX":
            path = ROOT / row["url"].strip("/") / "index.html"
            if path.exists():
                t = _read(path)
                if not re.search(
                    r"Converta a discuss|Qual documento deve ser lido primeiro em um caso de|primeiro risco pr[aá]tico em um caso de",
                    t,
                    re.I,
                ):
                    row["disposition"] = "KEEP_AND_IMPROVE"
                    row["notes"] = "indexable; machine FAQ/CTA residue remediated"
    write_inventory(rows)
    report["inventory_rows"] = len(rows)
    report["disposition_counts"] = {}
    for r in rows:
        d = r["disposition"]
        report["disposition_counts"][d] = report["disposition_counts"].get(d, 0) + 1

    out = ROOT / "docs" / "seo" / "REMEDIATION-RUN.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
