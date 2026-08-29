#!/usr/bin/env python3
"""Bulk SEO + conversion upgrades for CONFENGE static articles."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
ARTICLES = ROOT / "conteudos"
TODAY = "2026-07-30"
GENERIC_META_TAIL = (
    "— veja os critérios técnicos, documentos e riscos antes de decidir. Diagnóstico"
)
GENERIC_WA = (
    "https://wa.me/5548988344559?text="
    "Ol%C3%A1%2C%20Tiago.%20Gostaria%20de%20analisar%20uma%20demanda%20relacionada"
    "%20a%20licita%C3%A7%C3%A3o%2C%20contrato%20ou%20obra%20p%C3%BAblica."
)
OFICIO_FAQ_Q = "Um ofício isolado é suficiente para preservar o direito da construtora?"
OFICIO_FAQ_HTML = (
    "<details><summary>Um ofício isolado é suficiente para preservar o direito da construtora?</summary>"
    "<p>Normalmente, não. O ofício deve ser a síntese de uma base documental organizada: fato, obrigação, "
    "evidência, impacto, pedido e anexos. Sem essa estrutura, a comunicação pode existir formalmente e "
    "continuar fraca para decisão.</p></details>"
)
OFICIO_FAQ_JSON = (
    r'\{\s*"@type"\s*:\s*"Question"\s*,\s*"name"\s*:\s*"Um ofício isolado é suficiente para preservar o direito da construtora\?"\s*,'
    r'\s*"acceptedAnswer"\s*:\s*\{\s*"@type"\s*:\s*"Answer"\s*,\s*"text"\s*:\s*"[^"]*"\s*\}\s*\}'
)

# Hand-crafted titles for high-priority GSC pages (without brand suffix)
TITLE_OVERRIDES = {
    "sinapi-desonerado-nao-desonerado": "SINAPI desonerado ou não: qual tabela usar no edital?",
    "bdi-diferenciado-obra-publica": "BDI diferenciado em materiais e equipamentos: quando usar",
    "limite-aditivo-25-50-obra-publica": "Limite de aditivo 25% e 50%: o que conta na Lei 14.133",
    "fiscal-nao-assina-medicao-obra-publica": "Fiscal não assina medição: o que fazer nas primeiras 48h",
    "demolicao-nao-prevista-obra-publica": "Demolição não prevista em obra pública: como cobrar",
    "atraso-pagamento-contrato-publico-suspender": "Atraso de pagamento: pode suspender a obra pública?",
    "administracao-local-orcamento-obra-publica": "Administração local: custo direto, BDI ou planilha?",
    "mobilizacao-desmobilizacao-orcamento-obra": "Como calcular mobilização e desmobilização na proposta",
    "atraso-obra-culpa-administracao": "Atraso por culpa da Administração: como provar e proteger",
    "aditivo-empreitada-por-preco-global": "Aditivo em empreitada global: quando a construtora tem direito",
    "resposta-notificacao-atraso-obra-publica": "Notificação por atraso: como montar a resposta técnica",
    "data-base-orcamento-reajuste-obra-publica": "Data-base e reajuste: onde a construtora perde dinheiro",
    "glosa-por-qualidade-obra-publica": "Glosa por qualidade: a fiscalização pode glosar tudo?",
    "atraso-na-medicao-obra-publica": "Atraso na medição: como proteger o fluxo de caixa",
    "pagamento-parcial-etapa-empreitada-global": "Pagamento parcial em empreitada global: quando vale",
    "prorrogacao-prazo-obra-publica-documentos": "Prorrogação de prazo: documentos que não podem faltar",
    "sinapi-ou-sicro-obra-publica": "SINAPI ou SICRO: qual referência vale em cada serviço?",
    "desconto-da-proposta-em-item-novo-aditivo": "Item novo no aditivo: aplica o desconto da licitação?",
    "comprovacao-exequibilidade-proposta-obra": "Comprovar exequibilidade sem fragilizar a planilha",
    "empreitada-preco-global-preco-unitario": "Empreitada global ou unitária: qual regime é mais arriscado?",
}

# Specific meta descriptions (140-155 chars ideal)
META_OVERRIDES = {
    "sinapi-desonerado-nao-desonerado": (
        "Desonerado ou não desonerado no SINAPI? Veja como o edital, o regime da empresa e os encargos "
        "definem a tabela certa — e o erro que distorce o orçamento."
    ),
    "bdi-diferenciado-obra-publica": (
        "BDI diferenciado para materiais e equipamentos: critérios técnicos, riscos de rejeição e quando "
        "a planilha exige decomposição — guia CONFENGE."
    ),
    "limite-aditivo-25-50-obra-publica": (
        "Limite de 25% e 50% em aditivos de obra pública: o que entra na conta, exceções e como não estourar "
        "o teto na Lei 14.133."
    ),
    "fiscal-nao-assina-medicao-obra-publica": (
        "Fiscal recusa assinar a medição? Checklist das primeiras 48h, documentos e como preservar "
        "recebimento sem admitir culpa indevida."
    ),
    "atraso-pagamento-contrato-publico-suspender": (
        "Atraso de pagamento no contrato público autoriza suspender a obra? Condições, riscos e como "
        "formalizar a posição da construtora."
    ),
    "mobilizacao-desmobilizacao-orcamento-obra": (
        "Como calcular mobilização e desmobilização na proposta de obra pública: frete, canteiro, prazos "
        "e erros que corroem a margem."
    ),
    "demolicao-nao-prevista-obra-publica": (
        "Demolição não prevista no orçamento: como documentar, medir e cobrar sem transformar serviço "
        "extra em prejuízo silencioso."
    ),
    "administracao-local-orcamento-obra-publica": (
        "Administração local é custo direto, BDI ou item de planilha? Critérios para precificar sem "
        "duplicar nem omitir encargos."
    ),
}


def load_index() -> dict:
    items = json.loads((ROOT / "content-index.json").read_text(encoding="utf-8"))
    return {item["url"].rstrip("/").split("/")[-1]: item for item in items}


def strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s).strip()


def brand_title(core: str) -> str:
    core = core.strip()
    if core.endswith("| CONFENGE"):
        return core
    # keep under ~70 with brand
    if len(core) > 62:
        return core  # already long, skip brand
    return f"{core} | CONFENGE"


def make_meta(slug: str, title_core: str, keyword: str, cluster: str) -> str:
    if slug in META_OVERRIDES:
        return META_OVERRIDES[slug][:158]
    # Build unique meta from title + cluster angle
    short = title_core.rstrip("?").rstrip(".")
    # avoid repeating full title twice
    variants = [
        f"{short}: critérios técnicos, documentos e riscos para a construtora. Análise CONFENGE.",
        f"{short}. Como decidir com base em contrato, planilha e prova — sem atalho genérico.",
        f"Guia prático: {short.lower() if short[0].isupper() else short}. Documentos, erros e próximo passo.",
        f"{short} em obras públicas: o que verificar antes de pleitear, aceitar ou escalar o conflito.",
        f"{keyword.capitalize() if keyword else short}: impactos em prazo, margem e posição contratual. CONFENGE.",
    ]
    # pick by hash of slug for stability
    meta = variants[sum(ord(c) for c in slug) % len(variants)]
    if len(meta) > 158:
        meta = meta[:155].rsplit(" ", 1)[0] + "…"
    if len(meta) < 110:
        meta = f"{meta.rstrip('.')} — cluster {cluster}."[:158]
    return meta


def make_wa_url(topic: str) -> str:
    msg = (
        f"Olá, Tiago. Gostaria de analisar um caso de {topic} "
        f"(licitação, contrato ou obra pública)."
    )
    return f"https://wa.me/5548988344559?text={quote(msg)}"


def make_faq3(slug: str, title_core: str, keyword: str) -> tuple[str, str, str]:
    """Return (question, answer_html, answer_plain)."""
    # Topic-specific FAQs for priority; pattern for rest
    special = {
        "sinapi-desonerado-nao-desonerado": (
            "O edital pode impor SINAPI desonerado se a empresa não for desonerada?",
            "O edital define a referência de preço e a regra de composição. A coerência entre encargos "
            "sociais da tabela e o regime da empresa (e da proposta) precisa ser testada: tabela errada "
            "distorce unitários, BDI e a análise de exequibilidade. A decisão não é só contábil — é de "
            "aderência ao edital e à planilha.",
        ),
        "bdi-diferenciado-obra-publica": (
            "BDI diferenciado em equipamento evita glosa ou rejeição da planilha?",
            "Ajuda quando a decomposição reflete fornecimento, logística e risco reais. Não resolve "
            "sozinho se a composição unitária, a data-base ou o desconto global forem inconsistentes. "
            "O fiscal e o orçamentista avaliam o conjunto.",
        ),
        "limite-aditivo-25-50-obra-publica": (
            "Supressões compensam acréscimos no limite de 25% ou 50%?",
            "A compensação depende do regime legal e da interpretação do caso. Na prática, a construtora "
            "deve medir o saldo acumulado de alterações, o tipo de serviço e se a mudança altera o objeto. "
            "Não assuma compensação automática sem base documental.",
        ),
        "atraso-pagamento-contrato-publico-suspender": (
            "Posso suspender a obra no primeiro atraso de pagamento?",
            "Em geral, a suspensão exige enquadramento contratual e legal, prova do atraso, notificação "
            "prévia e análise do risco de sanção. Suspender sem formalização costuma piorar a posição. "
            "O primeiro passo é isolar valores, prazos e comunicações.",
        ),
        "mobilizacao-desmobilizacao-orcamento-obra": (
            "Mobilização pode ficar embutida no BDI?",
            "Às vezes o edital ou a prática local tratam parte dos custos indiretos no BDI; em outros "
            "casos há item específico. O erro é duplicar ou omitir frete, canteiro e desmobilização. "
            "A planilha e as premissas do edital mandam.",
        ),
        "fiscal-nao-assina-medicao-obra-publica": (
            "Sem assinatura do fiscal a medição nunca pode ser cobrada?",
            "A falta de assinatura não apaga o serviço executado, mas enfraquece o recebimento se não "
            "houver registro contemporâneo, medições parciais, diário e notificação do impasse. "
            "Organize prova e peça decisão formal.",
        ),
    }
    if slug in special:
        q, a = special[slug]
        return q, a, a

    # Cluster-aware generic but unique
    q = f"Qual o primeiro risco prático em um caso de {keyword or title_core.lower()}?"
    a = (
        f"O primeiro risco é decidir por intuição: aceitar, executar ou contestar sem amarrar fato, "
        f"cláusula, documento e impacto. Em {keyword or 'obras públicas'}, isso vira renúncia silenciosa "
        f"de prazo, margem ou direito. Organize cronologia e prova antes de escalar."
    )
    # uniqueness tweak by slug
    a = a + f" O guia de {title_core.split(':')[0][:40]} detalha a trilha mínima de análise."
    return q, a, a


def lead_inline_html(wa_url: str, topic: str, form_path: str) -> str:
    return (
        f'<section class="lead-inline" id="diagnostico-confenge" aria-label="Diagnóstico CONFENGE">'
        f'<div class="lead-inline-copy">'
        f"<span>Próximo passo</span>"
        f"<strong>Quer validar este cenário com a CONFENGE?</strong>"
        f"<p>Envie o edital, a planilha ou a notificação. Retornamos com enquadramento técnico "
        f"e próximos passos — sem cadastro em lista.</p>"
        f"</div>"
        f'<div class="lead-inline-actions">'
        f'<a class="button button-primary" href="{wa_url}" rel="noopener" target="_blank">'
        f"WhatsApp sobre {topic[:42]}</a>"
        f'<a class="button button-secondary" href="/#contato" data-tema="{topic}" data-origem="{form_path}">'
        f"Preferir formulário</a>"
        f"</div></section>"
    )


def replace_attr_content(html: str, attr_name: str, new_value: str) -> str:
    """Replace content="..." for meta/property tags matching attr patterns carefully."""
    # name="description" content="..."
    patterns = [
        (
            rf'(name="{attr_name}"\s+content=")([^"]*)(")',
            rf"\g<1>{new_value}\g<3>",
        ),
        (
            rf'(content=")([^"]*)("\s+name="{attr_name}")',
            rf"\g<1>{new_value}\g<3>",
        ),
        (
            rf'(property="{attr_name}"\s+content=")([^"]*)(")',
            rf"\g<1>{new_value}\g<3>",
        ),
        (
            rf'(content=")([^"]*)("\s+property="{attr_name}")',
            rf"\g<1>{new_value}\g<3>",
        ),
    ]
    for pat, repl in patterns:
        html2, n = re.subn(pat, repl, html, count=1)
        if n:
            html = html2
    return html


def update_json_ld_fields(html: str, *, description: str, headline: str | None, faq_q: str, faq_a: str) -> str:
    # dateModified
    html = re.sub(
        r'"dateModified"\s*:\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}"',
        f'"dateModified":"{TODAY}"',
        html,
    )
    html = re.sub(
        r'property="article:modified_time"\s+content="[0-9]{4}-[0-9]{2}-[0-9]{2}"',
        f'property="article:modified_time" content="{TODAY}"',
        html,
    )
    html = re.sub(
        r'content="[0-9]{4}-[0-9]{2}-[0-9]{2}"\s+property="article:modified_time"',
        f'content="{TODAY}" property="article:modified_time"',
        html,
    )

    # Article description in JSON-LD (first description after Article or headline block)
    # Safer: replace description that still has generic tail or matches old meta
    def fix_desc(m):
        return f'"description":"{description}"'

    # Replace Article description near headline
    html = re.sub(
        r'("headline"\s*:\s*"[^"]*"\s*,\s*"description"\s*:\s*")([^"]*)(")',
        lambda m: m.group(1) + description.replace("\\", "\\\\").replace('"', '\\"') + m.group(3),
        html,
        count=1,
    )

    if headline:
        html = re.sub(
            r'("headline"\s*:\s*")([^"]*)(")',
            lambda m: m.group(1) + headline.replace('"', '\\"') + m.group(3),
            html,
            count=1,
        )

    # Replace oficio FAQ in JSON-LD
    faq_json = (
        '{"@type":"Question","name":"'
        + faq_q.replace('"', '\\"')
        + '","acceptedAnswer":{"@type":"Answer","text":"'
        + faq_a.replace("\\", "\\\\").replace('"', '\\"')
        + '"}}'
    )
    html2, n = re.subn(OFICIO_FAQ_JSON, faq_json, html, count=1)
    if n:
        html = html2
    return html


def process_article(path: Path, idx: dict) -> dict:
    slug = path.parent.name
    html = path.read_text(encoding="utf-8")
    original = html
    meta_info = idx.get(slug, {})
    keyword = meta_info.get("keyword") or slug.replace("-", " ")
    cluster = meta_info.get("cluster") or ""
    title_core = TITLE_OVERRIDES.get(slug)
    if not title_core:
        m = re.search(r"<title>([^<]+)</title>", html)
        raw = m.group(1) if m else keyword
        title_core = raw.replace(" | CONFENGE", "").strip()

    full_title = brand_title(title_core)
    meta = make_meta(slug, title_core, keyword, cluster)
    wa = make_wa_url(keyword if keyword else title_core)
    faq_q, faq_a, faq_plain = make_faq3(slug, title_core, keyword)
    form_path = f"/conteudos/{slug}/"

    # Title
    html = re.sub(r"<title>[^<]+</title>", f"<title>{full_title}</title>", html, count=1)

    # H1 if override
    if slug in TITLE_OVERRIDES:
        html = re.sub(
            r"(<h1[^>]*>)(.*?)(</h1>)",
            lambda m: m.group(1) + title_core + m.group(3),
            html,
            count=1,
            flags=re.S,
        )

    # Meta description + OG
    html = replace_attr_content(html, "description", meta)
    html = replace_attr_content(html, "og:title", full_title)
    html = replace_attr_content(html, "og:description", meta)
    html = replace_attr_content(html, "og:image:alt", full_title)

    # WhatsApp links
    html = html.replace(GENERIC_WA, wa)
    # also any wa.me with generic encoded message remnants
    html = re.sub(
        r'https://wa\.me/5548988344559\?text=[^"\']+',
        wa,
        html,
    )

    # FAQ HTML third details - replace oficio block
    if OFICIO_FAQ_HTML in html:
        new_faq = (
            f"<details><summary>{faq_q}</summary><p>{faq_a}</p></details>"
        )
        html = html.replace(OFICIO_FAQ_HTML, new_faq)
    else:
        # try flexible match
        html2, n = re.subn(
            r"<details><summary>Um ofício isolado[^<]*</summary><p>[^<]*</p></details>",
            f"<details><summary>{faq_q}</summary><p>{faq_a}</p></details>",
            html,
            count=1,
        )
        if n:
            html = html2

    html = update_json_ld_fields(
        html,
        description=meta,
        headline=title_core if slug in TITLE_OVERRIDES else None,
        faq_q=faq_q,
        faq_a=faq_plain,
    )

    # Insert lead-inline before article-decision if not present
    if 'class="lead-inline"' not in html:
        lead = lead_inline_html(wa, keyword, form_path)
        if 'class="article-decision"' in html:
            html = html.replace(
                '<section class="article-decision">',
                lead + '<section class="article-decision">',
                1,
            )
        elif 'class="article-faq"' in html:
            html = html.replace(
                '<section class="article-faq">',
                lead + '<section class="article-faq">',
                1,
            )

    # Aside button text slightly more specific - optional skip

    changed = html != original
    if changed:
        path.write_text(html, encoding="utf-8")
    return {
        "slug": slug,
        "changed": changed,
        "title": full_title,
        "meta_len": len(meta),
        "has_oficio": "Um ofício isolado" in html,
        "has_generic_meta": GENERIC_META_TAIL in html,
        "has_lead": 'class="lead-inline"' in html,
    }


def main():
    idx = load_index()
    results = []
    for path in sorted(ARTICLES.glob("*/index.html")):
        results.append(process_article(path, idx))

    # Update content-index titles for overrides
    items = json.loads((ROOT / "content-index.json").read_text(encoding="utf-8"))
    for item in items:
        slug = item["url"].rstrip("/").split("/")[-1]
        if slug in TITLE_OVERRIDES:
            item["title"] = TITLE_OVERRIDES[slug]
    (ROOT / "content-index.json").write_text(
        json.dumps(items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    changed = sum(1 for r in results if r["changed"])
    oficio = sum(1 for r in results if r["has_oficio"])
    generic = sum(1 for r in results if r["has_generic_meta"])
    lead = sum(1 for r in results if r["has_lead"])
    print(f"Processed: {len(results)}")
    print(f"Changed: {changed}")
    print(f"Still oficio FAQ: {oficio}")
    print(f"Still generic meta tail: {generic}")
    print(f"With lead-inline: {lead}")
    (ROOT / "seo" / "bulk-report.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
