"""Render intelligence pages from scored candidates + snapshot data."""

from __future__ import annotations

import re

from typing import Any

from scripts.pseo.html_shell import (
    ORG_JSONLD,
    PERSON_JSONLD,
    SITE,
    author_box,
    breadcrumb_jsonld,
    breadcrumbs_html,
    confenge_help,
    cta_block,
    e,
    indicators_html,
    money,
    methodology_block,
    page_shell,
    table_html,
)
from scripts.pseo.score import Candidate

def br_date(iso: str | None) -> str:
    """Visible Brazilian date; empty if missing."""
    if not iso:
        return "n/d"
    s = str(iso).strip()
    d = s[:10]
    if len(d) == 10 and d[4] == "-" and d[7] == "-":
        return f"{d[8:10]}/{d[5:7]}/{d[0:4]}"
    return s


def br_datetime(iso: str | None) -> str:
    if not iso:
        return "n/d"
    s = str(iso).strip()
    date_part = br_date(s)
    if "T" in s:
        time = s.split("T", 1)[1][:5]
        if time and time != "23:59":
            return f"{date_part} {time}"
    return date_part



def _scrub_criteria(items: list | None) -> list[str]:
    """Visitor-facing inclusion/exclusion lines, no pipeline / datalake jargon."""
    out = []
    for raw in items or []:
        s = str(raw)
        if re.search(r"datalake|extra-cli|Fonte pública no", s, re.I):
            s = "Fonte pública de contratos (PNCP e portais de transparência)"
            out.append(s)
            continue
        if "archetype=" in s or re.search(r"\b[a-z]+(?:-[a-z]+)+\b", s) and "http" not in s and " " not in s.split("=")[0]:
            # drop pure internal keys
            if s.startswith("archetype="):
                continue
            s = re.sub(
                r"\b(pavimentacao-infraestrutura-viaria|edificacoes-publicas|manutencao-predial-engenharia|climatizacao-instalacoes|saneamento-hidraulica)\b",
                "segmento de engenharia",
                s,
            )
        s = s.replace("typology=", "tipologia: ").replace("scope=", "escopo: ").replace("nature=", "natureza: ")
        s = s.replace("manutencao", "manutenção").replace("paralelepipedo", "paralelepípedo")
        s = s.replace("somente aec_confirmed", "somente objetos AEC confirmados")
        s = s.replace("comparison_confidence>=", "confiança ≥ ")
        s = re.sub(r"^n>=(\d+)", r"mínimo de \1 observações", s)
        s = re.sub(r"\barquétipo\b", "segmento", s, flags=re.I)
        out.append(s)
    return out

def _scrub_limitations(items: list | None) -> list[str]:
    """Never show internal archetype IDs in visitor-facing limitations."""
    out = []
    for raw in items or []:
        s = str(raw)
        s = re.sub(
            r"\b(pavimentacao-infraestrutura-viaria|edificacoes-publicas|"
            r"manutencao-predial-engenharia|climatizacao-instalacoes|saneamento-hidraulica)\b",
            "deste segmento",
            s,
        )
        s = re.sub(r"arquétipo primário\s+deste segmento", "segmento primário", s, flags=re.I)
        s = re.sub(r"\barquétipo\b", "segmento", s, flags=re.I)
        s = re.sub(r"\bdatalake\b", "base pública de contratos", s, flags=re.I)
        s = re.sub(r"\bextra-cli\b", "exportação pública", s, flags=re.I)
        out.append(s)
    return out



def humanize_agency(name: str | None) -> str:
    if not name:
        return ""
    n = re.sub(r"^(MRS|TCE|TCM|PNCP|SIASG|COMPRASNET)\s*[-–:|/]\s*", "", str(name), flags=re.I)
    if n == n.upper() and len(n) > 4:
        small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os"}
        parts = []
        for i, w in enumerate(n.split()):
            wl = w.lower()
            parts.append(wl if i > 0 and wl in small else wl.capitalize())
        n = " ".join(parts)
    return n


def safe_http_url(url: str | None) -> str | None:
    """Normalize public hrefs; reject/fix malformed schemes like https:///host."""
    if not url:
        return None
    s = str(url).strip()
    if not s:
        return None
    # Collapse https:///host → https://host (common PNCP/state portal corruption)
    s = re.sub(r"^(https?:)/{3,}", r"\1//", s, flags=re.I)
    s = re.sub(r"^(https?:)///*", r"\1//", s, flags=re.I)
    low = s.lower()
    if low.startswith(("javascript:", "data:", "file:", "vbscript:")):
        return None
    if not low.startswith("https://") and not low.startswith("http://"):
        return None
    # Still broken if host empty after scheme
    try:
        from urllib.parse import urlparse

        p = urlparse(s)
        if not p.netloc or p.netloc.startswith("."):
            return None
    except Exception:  # noqa: BLE001
        return None
    return s


def guide_path_label(path: str | None) -> str:
    """Human PT-BR label for /conteudos/… and service paths (no crude Title Case)."""
    from scripts.pseo.html_shell import _service_label

    raw = (path or "").strip()
    if not raw:
        return "Conteúdo relacionado"
    # Prefer known service map
    slug = raw.strip("/").split("/")[-1]
    known = {
        "aditivo-qualitativo-quantitativo": "Aditivo qualitativo ou quantitativo",
        "servico-nao-previsto-na-planilha-obra-publica": "Serviço não previsto na planilha",
        "limite-aditivo-25-50-obra-publica": "Limite de 25% e 50% nos aditivos",
        "sinapi-ou-sicro-obra-publica": "SINAPI ou SICRO: qual referência usar",
        "produtividade-sinapi-obra-publica": "Produtividade SINAPI na proposta",
        "bdi-obra-publica": "BDI em obras públicas",
        "orcamento-incompleto-edital-obra-publica": "Edital com orçamento incompleto",
        "analise-edital-obra-publica-construtora": "Análise de edital para a construtora",
        "glosa-de-medicao-obra-publica": "Glosa de medição em obra pública",
        "medicao-de-obra-publica-rejeitada": "Medição de obra pública rejeitada",
        "parcela-incontroversa-medicao-contrato-publico": "Parcela incontroversa na medição",
    }
    if slug in known:
        return known[slug]
    # Service pages
    if raw.strip("/").count("/") == 0 or not raw.startswith("/conteudos/"):
        return _service_label(raw)
    # Generic humanize with accents for common stems
    s = slug.replace("-", " ")
    repl = (
        ("publica", "pública"),
        ("publico", "público"),
        ("servico", "serviço"),
        ("nao ", "não "),
        ("medicao", "medição"),
        ("orcamento", "orçamento"),
        ("licitacao", "licitação"),
        ("aditivo", "aditivo"),
        ("obra", "obra"),
        ("planilha", "planilha"),
    )
    for a, b in repl:
        s = re.sub(rf"\b{a}\b", b, s, flags=re.I)
    small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os", "na", "no"}
    parts = []
    for i, w in enumerate(s.split()):
        wl = w.lower()
        parts.append(wl if i > 0 and wl in small else wl.capitalize())
    return " ".join(parts) or "Conteúdo relacionado"


def _service_label_public(slug: str | None) -> str:
    from scripts.pseo.html_shell import _service_label

    return _service_label(slug or "")


def _problem_decision_copy(p: dict) -> str:
    """Theme-specific decision the visitor is trying to make (unique per page)."""
    theme = (p.get("theme") or p.get("id") or "").lower()
    label = p.get("problem_label") or "este cenário"
    if "aditiv" in theme:
        return (
            f"Em {label}, a decisão é se a empresa documenta alteração de projeto/quantitativo "
            "em tempo real (diário, comunicação formal, medições) ou absorve custo sem cobertura. "
            "O recorte público ajuda a enxergar onde a exposição é maior; "
            "não estima taxa de aditivo por órgão."
        )
    if "sinapi" in theme or "sicro" in theme:
        return (
            f"Em {label}, a decisão é qual referência de custo (e produtividade) usar na proposta "
            "e como justificar desvios. SINAPI e SICRO cobrem naturezas distintas; erro de base "
            "vira deságio real após a assinatura."
        )
    if "orcamento" in theme or "edital" in theme:
        return (
            f"Em {label}, a decisão é participar, pedir esclarecimento/impugnação ou recusar o edital "
            "quando planilha e texto não batem. A massa de contratos no recorte indica mercados "
            "onde o problema aparece com frequência, não prova inconsistência no edital X."
        )
    if "medicao" in theme or "glosa" in theme:
        return (
            f"Em {label}, a decisão é como reagir a glosa ou medição rejeitada nas primeiras 48h: "
            "critério, diário de obra, parcela incontroversa e trilha de comunicação."
        )
    if "reequilibr" in theme:
        return (
            f"Em {label}, a decisão é se cabe reajuste, repactuação ou reequilíbrio e qual memória "
            "de cálculo sustenta a equação econômico-financeira."
        )
    return (
        f"Em {label}, a decisão é qual ação comercial/técnica tomar com base em evidência "
        "documental específica, não em volume de mercado sem vínculo ao caso."
    )


def _problem_action_copy(p: dict) -> str:
    theme = (p.get("theme") or p.get("id") or "").lower()
    if "aditiv" in theme:
        return (
            "Organize o dossiê de alteração (projeto, quantitativos, comunicações e medições) "
            "antes de executar o serviço extra. Se o volume for material, acione a trilha de "
            "aditivos e serviços extras da CONFENGE."
        )
    if "sinapi" in theme or "sicro" in theme:
        return (
            "Confronte a referência do edital com a natureza do serviço, a data-base e a "
            "produtividade local. Monte memória de BDI e itens críticos antes de fechar deságio."
        )
    if "orcamento" in theme or "edital" in theme:
        return (
            "Liste divergências planilha×memorial×caderno, quantifique materialidade e defina "
            "se o caminho é esclarecimento, impugnação ou proposta com ressalvas documentadas."
        )
    if "medicao" in theme or "glosa" in theme:
        return (
            "Registre o critério da glosa, separe o incontroverso e reúna diário/fotos/medição "
            "parcial nas primeiras 48 horas."
        )
    if "reequilibr" in theme:
        return (
            "Separe o que é reajuste contratual do que é revisão por fato extraordinário e "
            "prepare memória de impacto com índices e cronograma."
        )
    return (
        "Reúna o edital/contrato, a planilha e a trilha de comunicações; defina a decisão "
        "e o prazo antes de precificar ou executar."
    )


def _problem_help_copy(p: dict) -> str:
    theme = (p.get("theme") or p.get("id") or "").lower()
    svc = _service_label_public(p.get("confenge_service_slug"))
    if "aditiv" in theme:
        return (
            f"A CONFENGE estrutura o dossiê de alteração e a narrativa técnica para {svc.lower()}, "
            "sem substituir o jurídico da empresa."
        )
    if "sinapi" in theme or "sicro" in theme:
        return (
            f"A CONFENGE revisa planilha, BDI e referências ({svc}) para reduzir risco de margem "
            "na proposta."
        )
    if "orcamento" in theme or "edital" in theme:
        return (
            f"A CONFENGE faz o diagnóstico de inconsistência edital×orçamento e o caminho "
            f"documental via {svc.lower()}."
        )
    return (
        f"A CONFENGE conecta o problema observado à trilha documental e ao serviço {svc.lower()}."
    )


def _normalize_evidence_kind(p: dict) -> str:
    """Canonical evidence_kind for scenario pages."""
    raw = (p.get("evidence_kind") or "").strip()
    allowed = {
        "direct_problem_evidence",
        "contextual_market_evidence",
        "normative_editorial",
    }
    if raw in allowed:
        return raw
    # Legacy export labels → canonical
    if raw in {"framework_with_market_density", "claim_evidence_package", "typed_signals"}:
        # Decorative market density is not direct problem evidence
        if raw == "framework_with_market_density":
            return "normative_editorial"
        if raw == "typed_signals":
            return "direct_problem_evidence"
        return "normative_editorial"
    if p.get("amendment_count") or p.get("document_divergence_count") or p.get("reference_mentions"):
        return "direct_problem_evidence"
    return "normative_editorial"


def _problem_mass_copy(p: dict) -> str:
    """Theme-specific context. Never present generic contract counts as causal proof."""
    kind = _normalize_evidence_kind(p)
    n = int(p.get("evidence_count") or 0)
    theme = (p.get("theme") or p.get("id") or "").lower()
    _ARCH_LABEL = {
        "edificacoes-publicas": "edificações públicas",
        "pavimentacao-infraestrutura-viaria": "pavimentação e infraestrutura viária",
        "manutencao-predial-engenharia": "manutenção predial e engenharia",
        "climatizacao-instalacoes": "climatização e instalações",
        "saneamento-hidraulica": "saneamento e hidráulica",
    }
    arches = ", ".join(
        _ARCH_LABEL.get(str(a), str(a).replace("-", " "))
        for a in (p.get("related_archetypes") or [])[:3]
    ) or "engenharia pública"

    # Direct evidence may cite observed counts tied to the problem
    if kind == "direct_problem_evidence" and n > 0:
        if "aditiv" in theme:
            return (
                f"Foram observados {n} registros documentais de alteração/aditivo "
                f"em {arches} no recorte analisado."
            )
        if "sinapi" in theme or "sicro" in theme:
            return (
                f"Foram identificados {n} sinais documentais de referência de custo "
                f"(SINAPI/SICRO ou correlatos) em {arches}."
            )
        if "orcamento" in theme or "edital" in theme:
            return (
                f"Foram identificadas {n} divergências documentais entre orçamento e edital "
                f"em {arches}."
            )
        return f"Evidência direta: {n} ocorrências ligadas ao problema em {arches}."

    # Contextual market evidence may show market size with explicit non-causal framing
    if kind == "contextual_market_evidence" and n > 0:
        return (
            f"O mercado relacionado em {arches} concentra atividade contratual relevante "
            f"({n} contratos no recorte). Esse número contextualiza exposição de mercado e "
            f"não mede a frequência do problema nesta página."
        )

    # normative_editorial, no decorative contract counts
    if "aditiv" in theme:
        return (
            f"Em {arches}, alterações de projeto e quantitativo são o ponto em que a margem "
            "se perde quando o registro contemporâneo falha, a orientação abaixo é "
            "normativa e documental, não uma taxa de aditivo."
        )
    if "sinapi" in theme or "sicro" in theme:
        return (
            f"Em {arches}, a escolha da referência de custo (e da produtividade) define "
            "deságio real após a assinatura; a página orienta o critério, não o preço unitário "
            "da sua planilha."
        )
    if "orcamento" in theme or "edital" in theme:
        return (
            f"Em {arches}, inconsistência entre planilha de referência e edital costuma "
            "aparecer antes da proposta; a orientação é documental e legal, sem extrapolar "
            "frequência estatística do problema."
        )
    if "medicao" in theme or "glosa" in theme:
        return (
            f"Em contratos de {arches} com execução recorrente, disputas de critério de "
            "medição e glosa se resolvem com diário, memória de cálculo e parcela "
            "incontroversa, não com volume de mercado sem vínculo ao caso."
        )
    return (
        f"Orientação técnica para {arches} com base em legislação, guias e prática "
        "profissional, sem usar volume de mercado como prova do problema concreto."
    )


def money_or_ni(v, value_status: str | None = None) -> str:
    """Format money; never show R$ 0,00 for unknown values."""
    if value_status in {"not_informed", "confidential"}:
        return "não informado" if value_status == "not_informed" else "sigiloso"
    if v is None:
        return "não informado"
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "não informado"
    if f == 0 and value_status != "zero_valid":
        return "não informado"
    return money(v)


def accent_region(label: str | None) -> str:
    if not label:
        return ""
    fixes = {
        "Piaui": "Piauí", "Sao Paulo": "São Paulo", "Parana": "Paraná",
        "Goias": "Goiás", "Ceara": "Ceará", "Para": "Pará",
        "Espirito Santo": "Espírito Santo", "Rondonia": "Rondônia",
        "Amapa": "Amapá",
    }
    s = str(label)
    for a, b in fixes.items():
        s = s.replace(a, b)
    s = s.replace("paralelepipedo", "paralelepípedo").replace("Paralelepipedo", "Paralelepípedo")
    s = s.replace("manutencao", "manutenção").replace("Manutencao", "Manutenção")
    s = s.replace("pavimentacao", "pavimentação").replace("Pavimentacao", "Pavimentação")
    # strip archetype slug in parentheses e.g. "foo (manutencao-predial-engenharia)"
    s = re.sub(r"\s*\([a-z0-9]+(?:-[a-z0-9]+)+\)", "", s)
    return s



def _meta(c: Candidate, manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "pseo_page_id": c.page_id,
        "page_type": c.page_type,
        "archetype": c.archetype or "",
        "segment": c.segment or "",
        "region": c.region or "",
        "agency_id": c.agency_id or "",
        "intent": c.intent,
        "source_run_id": manifest.get("source_run_id", ""),
        "snapshot": (manifest.get("dataset_hash") or "")[:16],
        "origem": c.url,
        "url": c.url,
    }


def _robots(status: str) -> str:
    if status == "publish":
        return "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    return "noindex,follow"


def _exec_summary(text: str, max_words: int = 80) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "…"


def render_candidate(c: Candidate, manifest: dict[str, Any]) -> str:
    if c.page_type == "market":
        return _render_market(c, manifest)
    if c.page_type == "agency":
        return _render_agency(c, manifest)
    if c.page_type == "price":
        return _render_price(c, manifest)
    if c.page_type == "competition":
        return _render_competition(c, manifest)
    if c.page_type == "radar":
        return _render_radar(c, manifest)
    if c.page_type == "problem_service":
        return _render_problem(c, manifest)
    raise ValueError(f"unknown page_type {c.page_type}")


def _render_market(c: Candidate, manifest: dict[str, Any]) -> str:
    m = c.data_ref
    meta = _meta(c, manifest)
    summary = _exec_summary(
        f"No recorte público analisado, {m.get('segment')} em {m.get('region_label')} "
        f"reúne {m.get('contract_count')} contratos de engenharia/obras junto a "
        f"{m.get('buyer_count')} órgãos, com valor total de {money(m.get('total_value'))}. "
        f"A mediana contratual é {money(m.get('median_value'))} (P25 {money(m.get('p25_value'))}, "
        f"P75 {money(m.get('p75_value'))}). Para uma empresa do ICP, o dado serve para "
        f"priorizar órgãos, calibrar ticket e preparar proposta, não como preço unitário."
    )
    inds = indicators_html(
        [
            ("Contratos", str(m.get("contract_count")), "classificados no segmento"),
            ("Órgãos", str(m.get("buyer_count")), "compradores distintos"),
            ("Mediana", money(m.get("median_value")), "valor contratual"),
            ("P25–P75", f"{money(m.get('p25_value'))} – {money(m.get('p75_value'))}", "dispersão"),
            ("Fornecedores", str(m.get("supplier_count")), "observados"),
            ("Oportunidades", str(m.get("open_opportunity_count")), "no radar (mesmo recorte)"),
        ]
    )
    buyer_rows = [
        [
            b.get("name") or "n/d",
            b.get("municipio") or "n/d",
            b.get("contract_count"),
            money(b.get("total_value")),
        ]
        for b in (m.get("top_buyers") or [])[:8]
    ]
    buyer_table = table_html(
        ["Órgão", "Município", "Contratos", "Valor total"],
        buyer_rows,
        caption="Principais órgãos compradores no recorte",
    )
    obj_rows = [
        [o.get("label"), o.get("count"), (o.get("example_objeto") or "")[:80]]
        for o in (m.get("top_objects") or [])[:6]
    ]
    obj_table = table_html(
        ["Objeto (rótulo)", "N", "Exemplo público"],
        obj_rows,
        caption="Objetos mais recorrentes",
    )
    year_rows = [
        [y.get("year"), y.get("contract_count"), money(y.get("total_value"))]
        for y in (m.get("value_by_year") or [])
    ]
    year_table = table_html(["Ano", "Contratos", "Valor"], year_rows, caption="Evolução temporal") if year_rows else ""

    top_buyer = (m.get("top_buyers") or [{}])[0]
    top_obj = (m.get("top_objects") or [{}])[0]
    years = m.get("value_by_year") or []
    year_note = (
        f"A série anual cobre {years[0].get('year')}–{years[-1].get('year')} "
        f"({len(years)} anos com registro)."
        if len(years) >= 2
        else "A série anual é curta no recorte exportado."
    )
    p25, p75 = m.get("p25_value"), m.get("p75_value")
    ratio = None
    try:
        if p25 and p75 and float(p25) > 0:
            ratio = float(p75) / float(p25)
    except (TypeError, ValueError):
        ratio = None
    disp = (
        f"P75/P25 ≈ {ratio:.1f}×, dispersão alta; misturar portes distorce qualquer 'preço médio'."
        if ratio and ratio >= 3
        else "Dispersão moderada no recorte; ainda assim objetos não são unitariamente comparáveis."
    )
    interpretation = (
        f"Em {m.get('region_label')}, o segmento {m.get('segment')} concentra "
        f"{m.get('contract_count')} contratos e {m.get('buyer_count')} órgãos. "
        f"O comprador mais frequente no recorte é {top_buyer.get('name') or 'não identificado'} "
        f"({top_buyer.get('contract_count') or 0} contratos, {money(top_buyer.get('total_value'))}). "
        f"Objeto recorrente de referência: «{top_obj.get('label') or 'n/d'}» "
        f"({top_obj.get('count') or 0} ocorrências). {year_note} {disp}"
    )
    implications = (
        f"Para atuar em {m.get('region')}: (1) priorize órgãos com frequência ≥3 no recorte; "
        f"(2) ancore porte pela mediana {money(m.get('median_value'))}, nunca por média; "
        f"(3) cruze {m.get('open_opportunity_count')} oportunidades do radar com capacidade "
        f"técnica e de documentação; (4) rode auditoria de planilha antes de deságio agressivo."
    )
    related = _related_section(c.related_urls)
    crumbs = [
        ("Início", "/"),
        ("Inteligência", "/inteligencia/"),
        ("Mercados", "/inteligencia/mercados/"),
        (f"{m.get('segment')}, {m.get('region')}", None),
    ]
    wa = (
        f"Olá, Tiago. Vi a página de inteligência de mercado de {m.get('segment')} "
        f"em {m.get('region_label')} e gostaria de um mapa aplicado à minha empresa."
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Inteligência de mercado</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">Decisão: onde há demanda pública recorrente e como priorizar esforços comerciais com evidência.</p>
<div class="article-meta"><a href="/especialista/tiago-jun-sasaki/" rel="author">Engº Tiago Sasaki</a>
<span>Dados: <time datetime="{e(m.get('period_start'))}">{e(br_date(m.get('period_start')))}</time> – <time datetime="{e(m.get('period_end'))}">{e(br_date(m.get('period_end')))}</time></span>
<span>Escopo: {e(m.get('region_label'))}</span></div>
</div></div></header>
<div class="container article-layout">
<article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section id="indicadores"><p class="eyebrow">Indicadores</p><h2>Números do recorte</h2>{inds}</section>
<section id="compradores"><p class="eyebrow">Demanda</p><h2>Órgãos que concentram contratação</h2>{buyer_table}</section>
<section id="objetos"><p class="eyebrow">Objetos</p><h2>O que mais se contrata</h2>{obj_table}</section>
<section id="evolucao"><p class="eyebrow">Temporal</p><h2>Evolução no período</h2>{year_table or '<p>Série anual insuficiente no recorte.</p>'}</section>
<section id="interpretacao"><p class="eyebrow">Leitura</p><h2>O que os dados indicam</h2><p>{e(interpretation)}</p>
<p>{e(implications)}</p></section>
{confenge_help(
    ["/diagnostico-pre-licitacao/", "/auditoria-orcamento-licitacao/", "/acompanhamento-contratos-obras/"],
    "A CONFENGE transforma este recorte em mapa aplicado à sua carteira: órgãos prioritários, "
    "objetos compatíveis, riscos de planilha e roteiro de abordagem, sem ranking proprietário público.",
)}
{cta_block(meta, c.cta_label, wa, f"Mercado {m.get('segment')} {m.get('region')}")}
{methodology_block(m.get("period_start"), m.get("period_end"), m.get("sources") or [], _scrub_limitations(m.get("limitations")))}
{author_box()}
{related}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Próximo passo</span><h2>{e(c.cta_label)}</h2>
<p>Leve o recorte de {e(m.get('region'))} para uma conversa objetiva.</p>
<a class="button button-primary" data-cta-position="aside" data-pseo-event="pseo_whatsapp_click" href="https://wa.me/5548988344559" rel="noopener" target="_blank">Conversar</a></div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="/inteligencia/mercados/">Todos os mercados</a></div>
</aside>
</div>
"""
    dataset = {
        "@type": "Dataset",
        "@id": f"{SITE}{c.url}#dataset",
        "name": c.h1,
        "description": c.description,
        "creator": {"@id": f"{SITE}/#organization"},
        "identifier": c.page_id,
        "isBasedOn": "https://pncp.gov.br/",
        "temporalCoverage": f"{m.get('period_start') or ''}/{m.get('period_end') or ''}".strip("/"),
        "spatialCoverage": m.get("region_label") or m.get("region") or "BR",
        "variableMeasured": ["contract_count", "median_value", "buyer_count", "primary_contract_count"],
        "license": "https://opendefinition.org/od/2.1/pt/",
        "dateModified": (manifest.get("data_as_of") or manifest.get("generated_at") or "")[:10],
    }
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "isPartOf": {"@id": f"{SITE}/#website"},
            "about": dataset,
            "author": {"@id": f"{SITE}/#tiago"},
        },
        dataset,
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={
            "pseo-page-id": c.page_id,
            "pseo-page-type": c.page_type,
            "content-cluster": "pseo",
        },
    )


def _render_agency(c: Candidate, manifest: dict[str, Any]) -> str:
    a = c.data_ref
    agency_display = humanize_agency(a.get('agency_name')) or a.get('agency_name') or ''
    meta = _meta(c, manifest)
    summary = _exec_summary(
        f"{agency_display} ({a.get('municipio') or 'n/d'}, {a.get('uf') or 'n/d'}) "
        f"aparece com {a.get('contract_count')} contratos classificados em engenharia/obras "
        f"no recorte público, totalizando {money(a.get('total_value'))}. Mediana {money(a.get('median_value'))}. "
        f"{a.get('supplier_count')} fornecedores distintos foram observados. "
        f"Use o histórico para preparar estratégia de disputa, não como garantia de demanda futura."
    )
    inds = indicators_html(
        [
            ("Contratos", str(a.get("contract_count")), "no histórico classificado"),
            ("Valor total", money(a.get("total_value")), "nominal"),
            ("Mediana", money(a.get("median_value")), None),
            ("Fornecedores", str(a.get("supplier_count")), "distintos"),
            ("UF", str(a.get("uf") or "n/d"), a.get("municipio")),
            ("Oportunidades abertas", str(len(a.get("open_opportunities") or [])), "no snapshot"),
        ]
    )
    def _arch_label(aid: str | None) -> str:
        if not aid:
            return "n/d"
        s = str(aid).replace("-", " ").strip().lower()
        s = (
            s.replace("manutencao predial engenharia", "manutenção predial e engenharia")
            .replace("manutencao predial", "manutenção predial")
            .replace("pavimentacao infraestrutura viaria", "pavimentação e infraestrutura viária")
            .replace("edificacoes publicas", "edificações públicas")
            .replace("climatizacao instalacoes", "climatização e instalações")
            .replace("saneamento hidraulica", "saneamento e hidráulica")
            .replace("manutencao", "manutenção")
            .replace("pavimentacao", "pavimentação")
            .replace("edificacoes", "edificações")
        )
        small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o"}
        parts = []
        for i, w in enumerate(s.split()):
            parts.append(w if i > 0 and w in small else w.capitalize())
        return " ".join(parts)

    mix_rows = [[_arch_label(x.get("archetype_id")), x.get("contract_count")] for x in (a.get("archetype_mix") or [])]
    mix_table = table_html(["Segmento", "Contratos"], mix_rows, "Mix de segmentos")
    obj_rows = [[o.get("label"), o.get("count")] for o in (a.get("top_objects") or [])[:8]]
    obj_table = table_html(["Objeto", "N"], obj_rows, "Objetos frequentes")
    season_rows = [[s.get("period"), s.get("contract_count")] for s in (a.get("seasonality") or [])[-12:]]
    season_table = table_html(["Mês", "Contratos"], season_rows, "Sazonalidade (publicação)") if season_rows else ""
    open_rows = [
        [
            (o.get("objeto") or "")[:60],
            money(o.get("valor_estimado")),
            o.get("modalidade") or "n/d",
            br_date(o.get("data_encerramento") or o.get("closing_at")),
        ]
        for o in (a.get("open_opportunities") or [])[:6]
    ]
    open_table = (
        table_html(["Objeto", "Valor est.", "Modalidade", "Encerramento"], open_rows, "Oportunidades abertas")
        if open_rows
        else "<p>Sem oportunidades abertas vinculadas a este órgão no snapshot.</p>"
    )
    notes = "".join(f"<li>{e(n)}</li>" for n in (a.get("practical_notes") or []))
    # Portal homes are navigation aids, not per-contract deep-links
    channel_items = []
    for ch in a.get("official_channels") or []:
        url = ch.get("url") or ""
        name = ch.get("name") or "Portal"
        if url.startswith("http"):
            channel_items.append(
                f'<li><a href="{e(url)}" rel="nofollow noopener noreferrer" target="_blank" '
                f'data-pseo-event="pseo_source_open">{e(name)}</a> '
                f"<small>(portal de consulta, não é ficha de contrato individual)</small></li>"
            )
        else:
            channel_items.append(
                f"<li><span>{e(name)}</span> "
                f"<small>(fonte oficial indisponível no snapshot, não inventamos URL)</small></li>"
            )
    if not channel_items:
        channel_items.append(
            "<li><small>Fonte oficial indisponível no snapshot, não inventamos URL de órgão.</small></li>"
        )
    channels = "".join(channel_items)
    # Open opportunities: deep-link when present, else explicit unavailable
    open_link_items = []
    for o in (a.get("open_opportunities") or [])[:6]:
        href = o.get("link_oficial") or o.get("link_pncp")
        label = (o.get("objeto") or "")[:80]
        oid = o.get("pncp_id") or o.get("contrato_id") or ""
        if href and str(href).startswith("http"):
            open_link_items.append(
                f'<li><a href="{e(href)}" rel="nofollow noopener noreferrer" target="_blank" '
                f'data-pseo-event="pseo_source_open">{e(label)}</a>'
                f'{" <small>ID " + e(oid) + "</small>" if oid else ""}</li>'
            )
        else:
            open_link_items.append(
                f'<li><span>{e(label) or "Oportunidade"}</span> '
                f'<small>(fonte oficial indisponível, ID {e(oid) or "n/d"})</small></li>'
            )
    open_links_html = (
        f'<ul class="document-list">{"".join(open_link_items)}</ul>' if open_link_items else ""
    )
    crumbs = [
        ("Início", "/"),
        ("Inteligência", "/inteligencia/"),
        ("Órgãos", "/inteligencia/orgaos/"),
        (agency_display or c.page_id, None),
    ]
    wa = (
        f"Olá, Tiago. Quero avaliar estratégia para disputar contratos de "
        f"{agency_display} (página de inteligência CONFENGE)."
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Dossiê de comprador público</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">Histórico de contratação em engenharia, evidência pública, sem score comercial.</p>
<div class="article-meta"><a href="/especialista/tiago-jun-sasaki/" rel="author">Engº Tiago Sasaki</a>
<span>{e(a.get('municipio'))} / {e(a.get('uf'))}</span>
<span><time datetime="{e(a.get('period_start'))}">{e(br_date(a.get('period_start')))}</time> – <time datetime="{e(a.get('period_end'))}">{e(br_date(a.get('period_end')))}</time></span>
</div></div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section id="indicadores"><p class="eyebrow">Indicadores</p><h2>Retrato do órgão no recorte</h2>{inds}</section>
<section id="segmentos"><p class="eyebrow">Segmentos</p><h2>Mix de segmentos</h2>{mix_table}</section>
<section id="objetos"><p class="eyebrow">Objetos</p><h2>Objetos mais frequentes</h2>{obj_table}</section>
<section id="sazonalidade"><p class="eyebrow">Temporal</p><h2>Sazonalidade</h2>{season_table or '<p>Sem série mensal suficiente.</p>'}</section>
<section id="oportunidades"><p class="eyebrow">Agora</p><h2>Oportunidades abertas (quando houver)</h2>{open_table}
{open_links_html}
<p><small>Links de oportunidade são deep-links de portal quando o snapshot traz URL; caso contrário registramos indisponibilidade sem inventar endereço.</small></p>
</section>
<section id="cuidados"><p class="eyebrow">Prática</p><h2>Cuidados para empresas interessadas</h2><ul>{notes}</ul>
<p>Portais de consulta (não substituem ficha de contrato):</p><ul>{channels}</ul></section>
{confenge_help(
    ["/diagnostico-pre-licitacao/", "/auditoria-orcamento-licitacao/", "/acompanhamento-contratos-obras/"],
    "Ajudamos a montar a estratégia por órgão: leitura de histórico, enquadramento de objeto, "
    "riscos de edital e preparação documental da proposta.",
)}
{cta_block(meta, c.cta_label, wa, f"Órgão {agency_display}")}
{methodology_block(a.get("period_start"), a.get("period_end"), a.get("sources") or [], _scrub_limitations(a.get("limitations")))}
{author_box()}
{_related_section(c.related_urls)}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Próximo passo</span><h2>{e(c.cta_label)}</h2>
<a class="button button-primary" data-cta-position="aside" href="{e('https://wa.me/5548988344559')}" rel="noopener" target="_blank">Conversar</a></div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="/inteligencia/orgaos/">Todos os órgãos</a></div>
</aside></div>
"""
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "author": {"@id": f"{SITE}/#tiago"},
        },
        {
            "@type": "Dataset",
            "@id": f"{SITE}{c.url}#dataset",
            "name": f"Histórico de contratos, {agency_display}",
            "description": c.description,
            "creator": {"@id": f"{SITE}/#organization"},
            "identifier": c.page_id,
            "temporalCoverage": f"{a.get('period_start') or ''}/{a.get('period_end') or ''}".strip("/"),
            "spatialCoverage": f"{a.get('municipio') or ''}, {a.get('uf') or 'BR'}".strip(", "),
            "variableMeasured": [
                "primary_contract_count",
                "median_value",
                "supplier_count",
                "total_value",
            ],
            "isBasedOn": "https://pncp.gov.br/",
            "license": "https://opendefinition.org/od/2.1/pt/",
            "dateModified": (manifest.get("data_as_of") or manifest.get("generated_at") or "")[:10],
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={"pseo-page-id": c.page_id, "pseo-page-type": "agency", "content-cluster": "pseo"},
    )


def _render_price(c: Candidate, manifest: dict[str, Any]) -> str:
    p = c.data_ref
    obj_label = accent_region(p.get('object_label'))
    region_label = accent_region(p.get('region_label') or p.get('region'))
    meta = _meta(c, manifest)
    summary = _exec_summary(
        f"Para {obj_label} em {region_label}, com {p.get('observation_count')} "
        f"contratos primários comparáveis (ticket integral, não preço unitário), a mediana contratual é "
        f"{money(p.get('median_value'))}, com P25 {money(p.get('p25_value'))} e P75 "
        f"{money(p.get('p75_value'))}. IQR = {money(p.get('dispersion_iqr'))}. "
        f"Estes números descrevem contratos integrais, não preços unitários de serviço."
    )
    inds = indicators_html(
        [
            ("Observações", str(p.get("observation_count")), "após filtros"),
            ("Mediana", money(p.get("median_value")), "não é preço unitário"),
            ("P25", money(p.get("p25_value")), None),
            ("P75", money(p.get("p75_value")), None),
            ("IQR", money(p.get("dispersion_iqr")), "dispersão"),
            ("Máximo", money(p.get("max_value")), "no recorte"),
        ]
    )
    ex_rows = [
        [
            x.get("contrato_id") or "n/d",
            (x.get("objeto") or "")[:60],
            money(x.get("valor")),
            x.get("municipio") or "n/d",
            x.get("orgao_nome") or "n/d",
            br_date(x.get("data_publicacao")),
            x.get("source") or "n/d",
        ]
        for x in (p.get("public_examples") or [])[:5]
    ]
    ex_table = table_html(
        ["ID", "Objeto", "Valor", "Município", "Órgão", "Data", "Fonte"],
        ex_rows,
        "Exemplos públicos auditáveis (maior valor no recorte)",
    )
    conf = p.get("comparison_confidence")
    conf_note = (
        f"<p><strong>Comparabilidade:</strong> recorte semântico de contratos integrais "
        f"· confiança {e(conf) if conf is not None else 'não informada'} · "
        f"outliers IQR: {e(p.get('outlier_count') if p.get('outlier_count') is not None else 'n/d')}. "
        f"Denominador: ticket contratual (não preço unitário).</p>"
        if conf is not None or p.get("denominator_type")
        else ""
    )
    example_link_items = []
    for x in (p.get("public_examples") or [])[:5]:
        href = x.get("link_oficial") or x.get("link_pncp")
        label = (x.get("objeto") or x.get("contrato_id") or "exemplo")[:60]
        cid = x.get("contrato_id") or ""
        if href and str(href).startswith("http"):
            example_link_items.append(
                f'<li><a href="{e(href)}" rel="nofollow noopener noreferrer" target="_blank" '
                f'data-pseo-event="pseo_source_open">Fonte oficial · {e(label)}</a>'
                f'{" <small>ID " + e(cid) + "</small>" if cid else ""}</li>'
            )
        else:
            example_link_items.append(
                f'<li><span>Fonte oficial indisponível no snapshot</span> '
                f'<small>, ID {e(cid) or "n/d"} · órgão {e((x.get("orgao_nome") or "n/d")[:40])} '
                f'· não inventamos URL</small></li>'
            )
    example_links = "".join(example_link_items)
    inc = "".join(f"<li>{e(x)}</li>" for x in _scrub_criteria(p.get("inclusion_criteria")))
    exc = "".join(f"<li>{e(x)}</li>" for x in _scrub_criteria(p.get("exclusion_criteria")))
    crumbs = [
        ("Início", "/"),
        ("Inteligência", "/inteligencia/"),
        ("Preços", "/inteligencia/precos/"),
        (f"{p.get('object_label')}, {p.get('region')}", None),
    ]
    wa = (
        f"Olá, Tiago. Quero validar preço, risco e margem com base no benchmark de "
        f"{p.get('object_label')} em {p.get('region_label')}."
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Benchmark de contratação</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">Mediana, quartis e dispersão, com advertência explícita contra comparação cega.</p>
<div class="article-meta"><a href="/especialista/tiago-jun-sasaki/" rel="author">Engº Tiago Sasaki</a>
<span>{e(p.get('period_start'))} – {e(p.get('period_end'))}</span></div>
</div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section class="article-callout"><svg class="icon"><use href="#i-shield"></use></svg>
<div><strong>Advertência</strong><p>{e(p.get('warning'))}</p></div></section>
<section id="indicadores"><p class="eyebrow">Indicadores</p><h2>Estatísticas do recorte</h2>{inds}{conf_note}</section>
<section id="exemplos"><p class="eyebrow">Evidência</p><h2>Exemplos públicos verificáveis</h2>{ex_table}
<ul class="document-list">{example_links}</ul>
<p><small>Links apontam para a ficha pública do contrato no PNCP quando o ID permite deep-link; caso contrário registramos indisponibilidade sem inventar URL.</small></p>
<p><strong>Este benchmark não substitui orçamento técnico.</strong></p></section>
<section id="criterios"><p class="eyebrow">Critérios</p><h2>Inclusão e exclusão</h2>
<p><strong>Inclusão</strong></p><ul>{inc}</ul>
<p><strong>Exclusão</strong></p><ul>{exc}</ul></section>
<section id="interpretacao"><p class="eyebrow">Leitura</p><h2>Implicações para margem</h2>
<p>Dispersão elevada (IQR) costuma refletir mistura de portes e escopos. Antes da proposta,
decomponha quantitativos, produtividade, BDI e logística. A CONFENGE apoia auditoria de planilha
e teste de exequibilidade quando o deságio implícito ameaça a margem.</p></section>
{confenge_help(
    ["/auditoria-orcamento-licitacao/", "/conteudos/sinapi-ou-sicro-obra-publica/", "/conteudos/bdi-obra-publica/"],
    "Validamos se o preço de referência, a planilha e o deságio cabem no seu regime tributário e na obra real.",
)}
{cta_block(meta, c.cta_label, wa, f"Preço {p.get('object_label')} {p.get('region')}")}
{methodology_block(p.get("period_start"), p.get("period_end"), p.get("sources") or [], _scrub_limitations(p.get("limitations")))}
{author_box()}
{_related_section(c.related_urls)}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Próximo passo</span><h2>{e(c.cta_label)}</h2>
<a class="button button-primary" data-cta-position="aside" href="https://wa.me/5548988344559" rel="noopener" target="_blank">Conversar</a></div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="/inteligencia/precos/">Todos os benchmarks</a></div>
</aside></div>
"""
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "author": {"@id": f"{SITE}/#tiago"},
        },
        {
            "@type": "Dataset",
            "@id": f"{SITE}{c.url}#dataset",
            "name": c.h1,
            "description": c.description,
            "identifier": c.page_id,
            "temporalCoverage": f"{p.get('period_start') or ''}/{p.get('period_end') or ''}".strip("/"),
            "spatialCoverage": region_label or p.get("region") or "BR",
            "variableMeasured": [
                "median_value",
                "p25_value",
                "p75_value",
                "observation_count",
                "primary_contract_count",
            ],
            "creator": {"@id": f"{SITE}/#organization"},
            "isBasedOn": "https://pncp.gov.br/",
            "license": "https://opendefinition.org/od/2.1/pt/",
            "dateModified": (manifest.get("data_as_of") or manifest.get("generated_at") or "")[:10],
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={"pseo-page-id": c.page_id, "pseo-page-type": "price", "content-cluster": "pseo"},
    )


def _render_competition(c: Candidate, manifest: dict[str, Any]) -> str:
    d = c.data_ref
    meta = _meta(c, manifest)
    summary = _exec_summary(
        f"Em {d.get('segment')} ({d.get('region_label')}), {d.get('supplier_count')} fornecedores "
        f"foram observados em {d.get('contract_count')} contratos públicos classificados. "
        f"Os três mais frequentes concentram {float(d.get('concentration_top3_share') or 0)*100:.1f}% "
        f"dos contratos do recorte. Linguagem neutra: frequência observada, não qualidade."
    )
    inds = indicators_html(
        [
            ("Fornecedores", str(d.get("supplier_count")), "observados"),
            ("Contratos", str(d.get("contract_count")), None),
            ("Top-3 share", f"{float(d.get('concentration_top3_share') or 0)*100:.1f}%", "contratos"),
            ("Órgãos", str(d.get("agencies_with_activity")), "com atividade"),
        ]
    )
    sup_rows = [
        [
            s.get("display_name"),
            s.get("contract_count"),
            money(s.get("total_value")),
            s.get("agencies_count"),
            s.get("value_band"),
        ]
        for s in (d.get("observed_suppliers") or [])[:12]
    ]
    sup_table = table_html(
        ["Fornecedor (público)", "Contratos", "Valor", "Órgãos", "Faixa"],
        sup_rows,
        "Fornecedores observados",
    )
    bands = table_html(
        ["Faixa", "Contratos"],
        [[b.get("band"), b.get("contract_count")] for b in (d.get("value_bands") or [])],
        "Faixas de valor contratual",
    )
    changes = "".join(f"<li>{e(x)}</li>" for x in (d.get("recent_changes") or []))
    crumbs = [
        ("Início", "/"),
        ("Inteligência", "/inteligencia/"),
        ("Concorrência", "/inteligencia/concorrencia/"),
        (f"{d.get('segment')}, {d.get('region')}", None),
    ]
    wa = (
        f"Olá, Tiago. Vi a página de concorrência observada em {d.get('segment')} "
        f"({d.get('region_label')}) e quero um mapa aplicado à minha empresa."
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Concorrência observada</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">{e(d.get('language_note'))}</p>
<div class="article-meta"><a href="/especialista/tiago-jun-sasaki/" rel="author">Engº Tiago Sasaki</a>
<span>{e(d.get('period_start'))} – {e(d.get('period_end'))}</span></div>
</div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section id="indicadores"><p class="eyebrow">Indicadores</p><h2>Concentração e escala</h2>{inds}</section>
<section id="fornecedores"><p class="eyebrow">Observado</p><h2>Fornecedores no recorte</h2>{sup_table}</section>
<section id="faixas"><p class="eyebrow">Valores</p><h2>Faixas de contratos</h2>{bands}</section>
<section id="mudancas"><p class="eyebrow">Dinâmica</p><h2>Mudanças recentes</h2><ul>{changes}</ul></section>
<section id="interpretacao"><p class="eyebrow">Leitura</p><h2>Uso legítimo desta página</h2>
<p>Serve para mapear quem já aparece em contratos públicos do segmento/UF e em quantos órgãos.
Não autoriza inferir capacidade técnica, intenção de disputa futura ou risco reputacional.</p></section>
{confenge_help(
    ["/diagnostico-pre-licitacao/", "/inteligencia/mercados/"],
    "Ajudamos a posicionar sua empresa em relação ao recorte público, com estratégia de objeto e órgão, não com lista fria de cold call.",
)}
{cta_block(meta, c.cta_label, wa, f"Concorrência {d.get('segment')} {d.get('region')}")}
{methodology_block(d.get("period_start"), d.get("period_end"), d.get("sources") or [], d.get("limitations") or [])}
{author_box()}
{_related_section(c.related_urls)}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Próximo passo</span><h2>{e(c.cta_label)}</h2>
<a class="button button-primary" data-cta-position="aside" href="https://wa.me/5548988344559" rel="noopener" target="_blank">Conversar</a></div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="/inteligencia/concorrencia/">Concorrência</a></div>
</aside></div>
"""
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "author": {"@id": f"{SITE}/#tiago"},
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={"pseo-page-id": c.page_id, "pseo-page-type": "competition", "content-cluster": "pseo"},
    )


def _render_radar(c: Candidate, manifest: dict[str, Any]) -> str:
    from scripts.pseo.html_shell import scrub_public_limitations

    o = c.data_ref
    meta = _meta(c, manifest)
    as_of = o.get("as_of") or o.get("verified_at") or ""
    as_of_br = br_date(as_of) if as_of else ", "
    open_n = o.get("open_count")
    hist_n = o.get("historical_count")
    summary = _exec_summary(
        f"Radar evergreen de {o.get('segment')} em {o.get('region_label')}: "
        f"{open_n} oportunidades classificadas no recorte de {as_of_br}. "
        f"Esta URL não representa um edital individual; editais entram e saem da lista. "
        f"Confirme sempre no portal de origem antes de precificar."
    )
    inds = indicators_html(
        [
            ("Abertas", str(open_n), f"referência {as_of_br}"),
            ("Segmento", str(o.get("segment")), None),
            ("UF", str(o.get("region")), o.get("region_label")),
            ("Itens listados", str(len(o.get("items") or [])), "nesta página"),
        ]
    )
    rows = [
        [
            (i.get("objeto") or "")[:70],
            money_or_ni(i.get("valor_estimado"), i.get("value_status")),
            i.get("modalidade") or "n/d",
            i.get("municipio") or "n/d",
            i.get("orgao_nome") or "n/d",
            br_date(i.get("closing_at") or i.get("data_encerramento")),
        ]
        for i in (o.get("items") or [])[:20]
    ]
    tbl = table_html(
        ["Objeto", "Valor est.", "Modalidade", "Município", "Órgão", "Encerramento"],
        rows,
        f"Oportunidades no recorte {as_of_br}",
    )
    # Official links only when present, never invent portal home URLs
    link_items = []
    unavailable = 0
    for i in (o.get("items") or [])[:8]:
        href = safe_http_url(i.get("link_oficial") or i.get("link_pncp"))
        label = (i.get("objeto") or "")[:80]
        item_meta = (
            f"{e(i.get('status_bucket') or 'aberta')} · encerra {e(br_date(i.get('closing_at') or i.get('data_encerramento')))}"
        )
        if href:
            link_items.append(
                f'<li><a href="{e(href)}" rel="nofollow noopener noreferrer" target="_blank" '
                f'data-pseo-event="pseo_source_open">{e(label)}</a>'
                f' <small>({item_meta})</small></li>'
            )
        else:
            unavailable += 1
            link_items.append(
                f'<li><span>{e(label) or "Oportunidade sem link no snapshot"}</span> '
                f'<small>({item_meta} · fonte oficial indisponível, não inventamos URL; confira no portal com o ID '
                f'{e(i.get("pncp_id") or "n/d")})</small></li>'
            )
    links = "".join(link_items)
    if unavailable:
        links += (
            f'<li class="muted"><small>{unavailable} item(ns) sem deep-link no snapshot; '
            f"listados com ID/órgão para verificação manual.</small></li>"
        )
    crumbs = [
        ("Início", "/"),
        ("Radar", "/radar/"),
        (f"{o.get('segment')}, {o.get('region')}", None),
    ]
    wa = (
        f"Olá, Tiago. Quero analisar um edital do radar de {o.get('segment')} "
        f"em {o.get('region_label')} antes da proposta."
    )
    market_link = o.get("related_market_slug")
    # Only link to market pages that exist on disk (reject/no-build siblings omitted)
    market_html = ""
    if market_link:
        from pathlib import Path as _Path

        _root = _Path(__file__).resolve().parents[2]
        _idx = _root / "inteligencia" / "mercados" / str(market_link) / "index.html"
        if _idx.exists():
            market_html = (
                f'<p>Mercado correspondente: <a href="/inteligencia/mercados/{e(market_link)}/" '
                f'data-pseo-event="pseo_related_page_click">ver inteligência de mercado</a>.</p>'
            )
    verified = o.get("verified_at") or as_of
    verified_br = br_date(verified) if verified else ", "
    # Historical count is contextual market mass, never as causal field-name dump
    hist_sentence = (
        f"No recorte há registro de {e(hist_n)} oportunidades históricas no mesmo "
        f"segmento/UF; essa massa contextualiza o radar e não se confunde com as abertas listadas."
        if hist_n not in (None, "", 0, "0")
        else "Itens encerrados deixam de figurar na lista aberta na próxima atualização."
    )
    pub_limits = scrub_public_limitations(o.get("limitations") or [])
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Radar de oportunidades</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">Página rolante (evergreen). Verificado em <time datetime="{e(verified)}">{e(verified_br)}</time>
 (horário de Brasília). Somente status aberto com data limite igual ou posterior à data de verificação.</p>
</div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section id="indicadores"><p class="eyebrow">Indicadores</p><h2>Recorte atual</h2>{inds}</section>
{market_html}
<section id="lista"><p class="eyebrow">Vigentes no recorte</p><h2>Oportunidades classificadas</h2>{tbl}
<ul class="document-list">{links}</ul></section>
<section id="historico"><p class="eyebrow">Histórico</p><h2>Separação histórico × vigente</h2>
<p>Itens encerrados saem desta lista na próxima atualização. Não mantemos URL indexável por edital.
{hist_sentence}</p></section>
{confenge_help(
    ["/diagnostico-pre-licitacao/", "/auditoria-orcamento-licitacao/", "/conteudos/analise-edital-obra-publica-construtora/"],
    "Antes de precificar: lemos edital, planilha, riscos e documentos mínimos para decidir se vale entrar.",
)}
{cta_block(meta, c.cta_label, wa, f"Radar {o.get('segment')} {o.get('region')}")}
{methodology_block(as_of, as_of, o.get("sources") or [], pub_limits)}
{author_box()}
{_related_section(c.related_urls)}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Próximo passo</span><h2>{e(c.cta_label)}</h2>
<a class="button button-primary" data-cta-position="aside" href="https://wa.me/5548988344559" rel="noopener" target="_blank">Conversar</a></div>
<div class="aside-card aside-compact"><strong>Hub</strong><a href="/radar/">Radar</a></div>
</aside></div>
"""
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "author": {"@id": f"{SITE}/#tiago"},
            "dateModified": o.get("as_of"),
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={"pseo-page-id": c.page_id, "pseo-page-type": "radar", "content-cluster": "pseo"},
    )


def _render_problem(c: Candidate, manifest: dict[str, Any]) -> str:
    p = c.data_ref
    meta = _meta(c, manifest)
    svc_label = _service_label_public(p.get("confenge_service_slug")) or "serviço técnico CONFENGE"
    kind = _normalize_evidence_kind(p)
    summary = _exec_summary(
        f"{p.get('problem_label')}: {p.get('observed_pattern')} "
        f"Trilha CONFENGE relacionada: {svc_label}."
    )
    guides = "".join(
        f'<li><a href="{e(g if str(g).startswith("/") else "/" + str(g).strip("/") + "/")}" '
        f'data-pseo-event="pseo_related_page_click">'
        f'{e(guide_path_label(str(g)))}</a></li>'
        for g in (p.get("technical_guide_paths") or [])
    )
    # Official normative/methodology references, auditável, not invented contract deep-links
    ref_items = []
    for ref in p.get("official_references") or []:
        href = safe_http_url(ref.get("url") if isinstance(ref, dict) else None)
        name = (ref.get("name") if isinstance(ref, dict) else None) or "Referência oficial"
        if href:
            ref_items.append(
                f'<li><a href="{e(href)}" rel="nofollow noopener noreferrer" target="_blank" '
                f'data-pseo-event="pseo_source_open">{e(name)}</a></li>'
            )
        else:
            ref_items.append(
                f"<li><span>{e(name)}</span> "
                f"<small>(fonte oficial indisponível no snapshot, não inventamos URL)</small></li>"
            )
    if not ref_items:
        ref_items.append(
            "<li><small>Referências normativas não listadas neste snapshot; "
            "consulte os guias técnicos internos e a legislação aplicável.</small></li>"
        )
    refs_html = "".join(ref_items)
    _ARCH_LABEL = {
        "edificacoes-publicas": "edificações públicas",
        "pavimentacao-infraestrutura-viaria": "pavimentação e infraestrutura viária",
        "manutencao-predial-engenharia": "manutenção predial e engenharia",
        "climatizacao-instalacoes": "climatização e instalações",
        "saneamento-hidraulica": "saneamento e hidráulica",
    }
    arches = ", ".join(
        _ARCH_LABEL.get(str(a), str(a).replace("-", " ").strip())
        for a in (p.get("related_archetypes") or [])
    )
    crumbs = [
        ("Início", "/"),
        ("Inteligência", "/inteligencia/"),
        ("Cenários", "/inteligencia/cenarios/"),
        (p.get("problem_label") or c.page_id, None),
    ]
    wa = (
        f"Olá, Tiago. Preciso enquadrar risco e decisão em um cenário de "
        f"{p.get('problem_label')} e proteger a margem da operação."
    )
    # Scrub limitations for public display, never ship pipeline template phrases
    pub_limits = []
    for lim in p.get("limitations") or ["Sem limitações declaradas."]:
        t = str(lim)
        t = re.sub(
            r"P[áa]gina de enquadramento problema\s*[→e]\s*servi[cç]o;?\s*",
            "Enquadramento técnico-público; ",
            t,
            flags=re.I,
        )
        t = t.replace("problema→serviço", "problema e decisão")
        t = t.replace("problema e serviço", "problema e decisão")
        t = re.sub(r"\bdatalake\b", "base pública de contratos", t, flags=re.I)
        t = re.sub(r"\boferta coerente\b", "atuação adequada", t, flags=re.I)
        pub_limits.append(t)
    limit0 = pub_limits[0] if pub_limits else "Sem limitações declaradas."

    # Evidence section: only show quantitative n when kind allows
    if kind == "direct_problem_evidence" and p.get("evidence_count"):
        mass_extra = (
            f"<p>Ocorrências documentais ligadas ao problema no recorte: "
            f"<strong>{e(p.get('evidence_count'))}</strong>.</p>"
        )
    elif kind == "contextual_market_evidence" and p.get("evidence_count"):
        mass_extra = (
            f"<p>Dimensão de mercado relacionada (contexto, não prova do problema): "
            f"<strong>{e(p.get('evidence_count'))}</strong> contratos no recorte.</p>"
        )
    else:
        mass_extra = ""

    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero article-hero"><div class="container content-hero-grid"><div>
<p class="eyebrow">Cenário técnico</p>
<h1>{e(c.h1)}</h1>
<p class="content-lead">Orientação para decidir com base em padrões de contratação pública e no serviço técnico da CONFENGE.</p>
<div class="article-meta"><a href="/especialista/tiago-jun-sasaki/" rel="author">Engº Tiago Sasaki</a>
<span>Segmentos: {e(arches)}</span></div>
</div></div></header>
<div class="container article-layout"><article class="article-main">
<div class="answer-box" id="resposta"><span>Resposta executiva</span><p>{e(summary)}</p></div>
<section id="padrao"><p class="eyebrow">Padrão</p><h2>O que se observa nos documentos e na prática</h2>
<p>{e(p.get('observed_pattern'))}</p>
{mass_extra}</section>
<section id="fontes"><p class="eyebrow">Fontes auditáveis</p><h2>Referências oficiais e normativos</h2>
<ul class="document-list">{refs_html}</ul>
<p><small>Links apontam para textos oficiais ou portais públicos; não são fichas de contrato individual.
Guias CONFENGE abaixo detalham o enquadramento prático.</small></p></section>
<section id="guias"><p class="eyebrow">Biblioteca</p><h2>Guias técnicos relacionados</h2>
<p>Estas páginas aprofundam o critério; esta página de inteligência organiza a decisão do cenário.</p>
<ul>{guides}</ul></section>
<section id="implicacoes"><p class="eyebrow">Decisão</p><h2>O que a empresa precisa decidir neste cenário</h2>
<p>{e(_problem_decision_copy(p))}</p>
<p>{e(_problem_mass_copy(p))}</p>
<p><strong>Limites da conclusão:</strong> {e(limit0)}</p>
</section>
<section id="acao"><p class="eyebrow">Ação</p><h2>Próximo passo prático</h2>
<p>{e(_problem_action_copy(p))}</p></section>
{confenge_help(
    [p.get('confenge_service_slug') or ''] + list(p.get("technical_guide_paths") or [])[:2],
    _problem_help_copy(p),
)}
{cta_block(meta, c.cta_label, wa, p.get("problem_label") or "Cenário técnico")}
{methodology_block(None, None, p.get("sources") or [], pub_limits)}
{author_box()}
{_related_section(c.related_urls)}
</article>
<aside class="article-aside">
<div class="aside-card"><span>Serviço</span><h2><a href="/{e((p.get('confenge_service_slug') or '').strip('/'))}/">{e(_service_label_public(p.get('confenge_service_slug')))}</a></h2></div>
</aside></div>
"""
    graph = [
        ORG_JSONLD,
        PERSON_JSONLD,
        {
            "@type": "WebPage",
            "@id": f"{SITE}{c.url}#webpage",
            "url": f"{SITE}{c.url}",
            "name": c.title,
            "description": c.description,
            "author": {"@id": f"{SITE}/#tiago"},
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=c.title,
        description=c.description,
        canonical_path=c.url,
        robots=_robots(c.status),
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa,
        data_attrs={"pseo-page-id": c.page_id, "pseo-page-type": "problem_service", "content-cluster": "pseo"},
    )


def _human_path_label(url: str) -> str:
    """Editorial label from path, never expose raw multi-hyphen taxonomy IDs."""
    parts = [p for p in (url or "").strip("/").split("/") if p]
    if not parts:
        return "Página relacionada"
    last = parts[-1]
    # Map known hubs
    hubs = {
        "inteligencia": "Inteligência",
        "mercados": "Mercados",
        "orgaos": "Órgãos",
        "precos": "Valores contratuais",
        "concorrencia": "Concorrência",
        "cenarios": "Cenários",
        "radar": "Radar",
        "conteudos": "Conteúdos",
    }
    if last in hubs:
        return hubs[last]
    # Conteúdos + service pages: shared PT-BR labeler (no crude Title Case)
    if parts[0] == "conteudos" or len(parts) == 1:
        return guide_path_label(url)
    # Humanize last segment for inteligencia/* leaves
    words = last.replace("-", " ").strip()
    words = (
        words.replace("pavimentacao infraestrutura viaria", "pavimentação e infraestrutura viária")
        .replace("edificacoes publicas", "edificações públicas")
        .replace("manutencao predial engenharia", "manutenção predial")
        .replace("manutencao predial", "manutenção predial")
        .replace("paralelepipedo", "paralelepípedo")
        .replace("climatizacao instalacoes", "climatização e instalações")
        .replace("saneamento hidraulica", "saneamento e hidráulica")
        .replace("inconsistencia orcamento edital", "inconsistência orçamento × edital")
        .replace("referencia sinapi sicro margem", "referência SINAPI/SICRO e margem")
        .replace("aditivos e risco de margem", "aditivos e risco de margem")
    )
    small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o", "na", "no"}
    out = []
    for i, w in enumerate(words.split()):
        wl = w.lower()
        parts_w = wl if i > 0 and wl in small else wl.capitalize()
        out.append(parts_w)
    label = " ".join(out)
    if len(parts) >= 2 and parts[0] in hubs:
        return f"{hubs[parts[0]]}: {label}"
    return label or "Página relacionada"


def _related_section(urls: list[str]) -> str:
    cards = []
    for u in (urls or [])[:8]:
        if not u:
            continue
        label = _human_path_label(u)
        cards.append(
            f'<a class="related-card" href="{e(u)}" data-pseo-event="pseo_related_page_click">'
            f"<span>Relacionado</span><strong>{e(label)}</strong><small>Link interno</small></a>"
        )
    if not cards:
        return ""
    return f"""<section class="related-section"><p class="eyebrow">Malha</p><h2>Páginas relacionadas</h2>
<div class="related-grid">{"".join(cards)}</div></section>"""


def render_hub(
    *,
    title: str,
    h1: str,
    description: str,
    path: str,
    intro: str,
    items: list[tuple[str, str, str]],
    crumbs: list[tuple[str, str | None]],
    robots: str = "index,follow",
    eyebrow: str = "Inteligência aplicada à decisão",
    wa_message: str | None = None,
    empty_cta: dict[str, str] | None = None,
) -> str:
    """Render a pSEO hub. Never ship pipeline empty-wave messages to the public."""
    cards = ""
    for it in items or []:
        url, kind, label = it[0], it[1], it[2]
        meta = it[3] if len(it) > 3 else ""
        cards += (
            f'<a class="related-card" href="{e(url)}"><span>{e(kind)}</span><strong>{e(label)}</strong>'
            f"<small>{e(meta)}</small></a>"
        )
    if cards:
        grid = f'<div class="related-grid" style="margin:2rem 0">{cards}</div>'
    elif empty_cta:
        primary_href = empty_cta.get("primary_href") or "/#contato"
        secondary = ""
        if empty_cta.get("secondary_label") and empty_cta.get("secondary_href"):
            secondary = (
                f'<a class="button button-secondary" href="{e(empty_cta["secondary_href"])}">'
                f'{e(empty_cta["secondary_label"])}</a>'
            )
        is_wa = "wa.me" in primary_href
        target = ' rel="noopener" target="_blank"' if is_wa else ""
        grid = f"""<div class="commercial-bridge" style="margin:2rem 0">
<h2>{e(empty_cta.get("title") or "Configure o recorte da sua operação")}</h2>
<p>{e(empty_cta.get("body") or "")}</p>
<div class="hero-actions">
<a class="button button-primary" href="{e(primary_href)}"{target}>{e(empty_cta.get("primary_label") or "Próximo passo")}</a>
{secondary}
</div>
</div>"""
    else:
        # Durable fallback, never "nenhum item publicado nesta onda"
        grid = (
            '<div class="commercial-bridge" style="margin:2rem 0">'
            "<h2>Evidência pública só vira valor com a capacidade da empresa.</h2>"
            "<p>Quando houver recortes publicáveis, eles aparecem aqui com data, fonte e limites. "
            "Até lá, o próximo passo é aplicar os dados à sua operação B2G.</p>"
            '<div class="hero-actions">'
            '<a class="button button-primary" href="/diretoria-b2g/">Conhecer a Diretoria B2G</a>'
            '<a class="button button-secondary" href="/diagnostico-b2g-360/">Solicitar diagnóstico B2G</a>'
            "</div></div>"
        )
    back = (
        '<p><a class="text-link" href="/">Voltar ao início</a></p>'
        if path.rstrip("/") == "/inteligencia"
        else '<p><a class="text-link" href="/inteligencia/">Voltar ao hub de inteligência</a></p>'
    )
    body = f"""
{breadcrumbs_html(crumbs)}
<header class="content-hero"><div class="container"><p class="eyebrow">{e(eyebrow)}</p>
<h1>{e(h1)}</h1><p class="content-lead">{e(intro)}</p></div></header>
<div class="container" style="padding-bottom:3rem">{grid}
{back}</div>
"""
    graph = [
        ORG_JSONLD,
        {
            "@type": "CollectionPage",
            "@id": f"{SITE}{path}#webpage",
            "url": f"{SITE}{path}",
            "name": title,
            "description": description,
        },
        breadcrumb_jsonld(crumbs),
    ]
    return page_shell(
        title=title,
        description=description,
        canonical_path=path,
        robots=robots or "index,follow",
        jsonld_graph=graph,
        body_main=body,
        wa_message=wa_message
        or "Olá, Tiago. Quero aplicar a inteligência de mercado da CONFENGE à decisão da minha empresa.",
        data_attrs={"content-cluster": "pseo", "pseo-page-type": "hub"},
    )


def _pad_items(items):
    return items
