"""Public contract for the indexable R$ 599 report model."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from html import unescape
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
ROUTE = "/casos/modelo-relatorio-inteligencia-licitacoes/"
CANONICAL = f"https://confenge.com.br{ROUTE}"
PAGE = ROOT / ROUTE.strip("/") / "index.html"
CSS = PAGE.with_name("styles.css")
ACTION_MATRIX = ROOT / "docs/contracts/intent-action/intent-action-matrix.v1.json"
CATALOG = ROOT / "data/offers/catalog.snapshot.json"
DELIVERABLES_STORY = ROOT / "docs/stories/story-deliverables-hub-navigation.md"
ACTION_ID = "contratar_relatorio_inteligencia_599"
HANDRAISE_ID = "handraise-report-intelligence-599-v1"


def _html() -> str:
    return PAGE.read_text(encoding="utf-8")


def _visible_text(markup: str) -> str:
    without_hidden_blocks = re.sub(
        r"<(script|style|template|noscript)\b[^>]*>.*?</\1>",
        " ",
        markup,
        flags=re.IGNORECASE | re.DOTALL,
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_hidden_blocks)
    return " ".join(unescape(without_tags).casefold().split())


def _assert_no_scope_contradictions(text: str) -> None:
    normalized = text.casefold().replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[^\S\n]+", " ", normalized)
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])(?:[ \t]+|\n+)|[;\n]+", normalized)
        if sentence.strip()
    ]
    opportunity_terms = re.compile(
        r"\b(?:oportunidades?|licita(?:ção|ções)|editais?)\b"
    )
    customer_terms = re.compile(
        r"\b(?:cliente|empresa|visitante|usuári[oa]|você|contratante|construtora|"
        r"sua\s+equipe|seu\s+time)\b"
    )
    supply_verbs = re.compile(
        r"\b(?:envi\w*|compartilh\w*|forne(?:c|ç)\w*|mand\w*|selecion\w*|"
        r"indi(?:c|qu)\w*|tr(?:ag|az|oux)\w*|anex\w*|encaminh\w*|list\w*|"
        r"localiz\w*|identifi(?:c|qu)\w*|entreg\w*|apresent\w*|"
        r"levant\w*|apont\w*|busc\w*|inform\w*|di(?:g|z)\w*)\b"
    )
    imperative_supply = re.compile(
        r"\b(?:envie|compartilhe|forneça|mande|selecione|indique|traga|anexe|"
        r"encaminhe|liste|localize|identifique|entregue|apresente|"
        r"levante|aponte|busque|informe|diga)\b"
    )
    passive_supply_participle = re.compile(
        r"\b(?:enviad\w*|compartilhad\w*|fornecid\w*|mandad\w*|selecionad\w*|"
        r"indicad\w*|trazid\w*|anexad\w*|encaminhad\w*|listad\w*|"
        r"localizad\w*|identificad\w*|apresentad\w*)\b"
    )
    count_terms = re.compile(
        r"\b(?:quantidade|número|volume|cota|tamanho\s+(?:da\s+)?carteira)\b"
    )
    depth_terms = re.compile(
        r"\b(?:profundidade|detalhamento|nível\s+(?:da\s+análise|de\s+detalhe)|"
        r"alcance\s+da\s+análise|extensão\s+da\s+análise|"
        r"grau\s+(?:(?:da|de)\s+)?análise)\b"
    )
    analysis_terms = re.compile(
        r"\b(?:profundidade|análise|leitura|nível\s+(?:da\s+)?análise|"
        r"alcance(?:\s+da\s+análise)?|grau\s+(?:(?:da|de)\s+)?análise)\b"
    )
    negotiation_terms = re.compile(
        r"\b(?:combinad\w*|acertad\w*|acordad\w*|definid\w*|negociad\w*|"
        r"fixad\w*|limitad\w*|restrit\w*)\b"
    )
    number_terms = re.compile(
        r"\b(?:\d+|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quinze|vinte|trinta|quarenta|cinquenta|cem)\b"
    )
    shallow_terms = re.compile(
        r"\b(?:superficial|ras[ao]|básic[ao]|baix[ao]|sumári[ao]|resumid[ao]|"
        r"parcial|limitad[ao]|restrit[ao]|reduzid[ao]|incomplet[ao])\b"
    )
    quota_patterns = (
        re.compile(
            rf"\b(?:cobr\w*|analis\w*|avali\w*|inclu\w*|cont[ée]\w*|"
            rf"abrang\w*|traz\w*|consider\w*|trabalh\w*|receb\w*|prev\w*|"
            rf"comport\w*|re[uú]n\w*|entreg\w*)\b"
            rf"[^.!?;]{{0,40}}{number_terms.pattern}[^.!?;]{{0,12}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"\b(?:até|exatamente|no\s+máximo|pelo\s+menos)\b[^.!?;]{{0,12}}"
            rf"{number_terms.pattern}[^.!?;]{{0,20}}{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
            r"[^.!?;]{0,40}\b(?:por|em\s+cada)\s+(?:relatório|unidade|pacote)\b"
        ),
        re.compile(
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
            r"[^.!?;]{0,35}\b(?:será|serão|fica\w*)\b[^.!?;]{0,20}"
            r"\b(?:analisad\w*|avaliad\w*|incluíd\w*|cobert\w*)\b"
        ),
        re.compile(
            r"\b(?:cada\s+)?relatório\b[^.!?;]{0,30}"
            r"\b(?:terá|terão|tem|têm|inclu\w*|cont[ée]\w*)\b"
            rf"[^.!?;]{{0,20}}{number_terms.pattern}[^.!?;]{{0,15}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{count_terms.pattern}[^.!?;]{{0,20}}\b(?:é|será|fica\w*)\b"
            rf"[^.!?;]{{0,12}}{number_terms.pattern}[^.!?;]{{0,15}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
            r"[^.!?;]{0,25}\b(?:entr\w*|cab\w*)\b[^.!?;]{0,20}"
            r"\b(?:relatório|unidade|pacote)\b"
        ),
        re.compile(
            r"\bentr\w*\b[^.!?;]{0,20}\b(?:no|em\s+cada)\s+relatório\b"
            rf"[^.!?;]{{0,20}}{number_terms.pattern}[^.!?;]{{0,12}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            r"\b(?:carteira|amostra|lote|universo)\b[^.!?;]{0,25}"
            r"\b(?:formad\w*|compost\w*|montad\w*|terá|tem|têm|cont[ée]\w*|"
            r"inclu\w*|limitad\w*|fixad\w*|restrit\w*)\b"
            rf"[^.!?;]{{0,15}}{number_terms.pattern}[^.!?;]{{0,12}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
            r"[^.!?;]{0,25}\b(?:compõ\w*|form\w*|integr\w*)\b"
            r"[^.!?;]{0,15}\b(?:carteira|amostra|lote|universo)\b"
        ),
        re.compile(
            r"\b(?:será|serão|haverá|existir\w*)\b"
            rf"[^.!?;]{{0,15}}{number_terms.pattern}[^.!?;]{{0,12}}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            r"\b(?:total|número|quantidade|volume)\b[^.!?;]{0,20}"
            r"\b(?:previst\w*|estimad\w*|fixad\w*)?\b[^.!?;]{0,12}"
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{opportunity_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:limitad\w*|fixad\w*|restrit\w*)\b[^.!?;]{0,12}"
            rf"{number_terms.pattern}"
        ),
        re.compile(
            r"\b(?:relatório|pacote|entrega|escopo)\b[^.!?;]{0,25}"
            r"\b(?:dimensionad\w*|prev\w*|planejad\w*)\b[^.!?;]{0,20}"
            rf"{number_terms.pattern}[^.!?;]{{0,12}}{opportunity_terms.pattern}"
        ),
    )
    responsibility_patterns = (
        re.compile(
            rf"{opportunity_terms.pattern}[^.!?;]{{0,40}}"
            r"\b(?:a\s+cargo|sob\s+responsabilidade)\b[^.!?;]{0,35}"
            rf"{customer_terms.pattern}"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,40}}"
            r"\b(?:responsável|encarregad\w*)\b[^.!?;]{0,20}\b(?:por|de)\b"
            rf"[^.!?;]{{0,20}}{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,35}}\bescolh\w*\b"
            rf"[^.!?;]{{0,25}}{opportunity_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:entr\w*|inclu\w*|compar\w*|analis\w*|avali\w*)\b"
        ),
        re.compile(
            r"\bescolh\w*\b[^.!?;]{0,25}"
            rf"{opportunity_terms.pattern}[^.!?;]{{0,25}}\b(?:entr\w*|inclu\w*)\b"
        ),
        re.compile(
            r"\b(?:seleção|escolha|busca|localização|identificação|indicação|"
            r"levantamento|triagem|mapeamento)\b"
            rf"[^.!?;]{{0,20}}{opportunity_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:é\s+responsabilidade|fica\s+(?:a\s+cargo|por\s+conta)|"
            r"compet\w*|cab\w*)\b"
            rf"[^.!?;]{{0,20}}{customer_terms.pattern}"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:defin\w*|determin\w*|mont\w*|form\w*|escolh\w*)\b"
            r"[^.!?;]{0,20}\b(?:carteira|lista|relação|conjunto|universo)\b"
            r"[^.!?;]{0,20}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            r"\b(?:compet\w*|cab\w*)\b[^.!?;]{0,20}"
            rf"{customer_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:seleção|escolha|busca|localização|identificação|levantamento|"
            r"triagem|mapeamento|selecionar|escolher|buscar|indicar|levantar|"
            r"triar)\b[^.!?;]{0,20}"
            rf"{opportunity_terms.pattern}"
        ),
        re.compile(
            rf"{opportunity_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:escolhid\w*|selecionad\w*|indicad\w*)\b[^.!?;]{0,20}"
            rf"{customer_terms.pattern}"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:respond\w*|decid\w*)\b[^.!?;]{0,25}"
            r"\b(?:seleção|escolha|busca|indicação|levantamento|triagem)\b"
            rf"[^.!?;]{{0,20}}{opportunity_terms.pattern}"
        ),
        re.compile(
            r"\b(?:selecionar|escolher|buscar|indicar|levantar|triar)\b"
            rf"[^.!?;]{{0,20}}{opportunity_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:atribuição|responsabilidade|tarefa|dever)\b[^.!?;]{0,20}"
            rf"{customer_terms.pattern}"
        ),
        re.compile(
            r"\b(?:seleção|escolha|busca|indicação|levantamento|triagem|lista|"
            r"relação|carteira)\b[^.!?;]{0,20}"
            rf"{opportunity_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:feit\w*|produzid\w*|fornecid\w*|apresentad\w*|vind\w*|vem)\b"
            rf"[^.!?;]{{0,20}}{customer_terms.pattern}"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,25}}\bdecid\w*\b"
            rf"[^.!?;]{{0,20}}{opportunity_terms.pattern}[^.!?;]{{0,20}}"
            r"\b(?:analisad\w*|avaliad\w*|incluíd\w*|cobert\w*)\b"
        ),
        re.compile(
            r"\breceb\w*\b\s+\b(?:d[ao]s?|pel[ao]s?)\b"
            rf"[^.!?;]{{0,10}}{customer_terms.pattern}[^.!?;]{{0,25}}"
            rf"{opportunity_terms.pattern}"
        ),
    )
    depth_discretion_patterns = (
        re.compile(
            rf"{depth_terms.pattern}[^.!?;]{{0,40}}"
            r"\b(?:a\s+critério|ao\s+critério|sob\s+decisão|a\s+escolha)\b"
            rf"[^.!?;]{{0,30}}{customer_terms.pattern}"
        ),
        re.compile(
            rf"{depth_terms.pattern}[^.!?;]{{0,35}}"
            r"\b(?:solicitad\w*|autorizad\w*)\b[^.!?;]{0,20}"
            rf"{customer_terms.pattern}"
        ),
        re.compile(
            rf"{analysis_terms.pattern}[^.!?;]{{0,25}}\b(?:vai|irá|chega\w*)\b"
            r"[^.!?;]{0,15}\baté\s+onde\b[^.!?;]{0,20}"
            rf"{customer_terms.pattern}[^.!?;]{{0,15}}\bsolicit\w*\b"
        ),
        re.compile(
            rf"{depth_terms.pattern}[^.!?;]{{0,25}}\bdepend\w*\b"
            r"[^.!?;]{0,20}\b(?:pacote|plano|modalidade)\b"
            r"(?:[^.!?;]{0,15}\bcontratad\w*\b)?"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:solicit\w*|ped\w*|defin\w*|escolh\w*)\b[^.!?;]{0,20}"
            rf"{depth_terms.pattern}"
        ),
        re.compile(
            rf"{depth_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:vari\w*|mud\w*|ajust\w*|acompanh\w*)\b[^.!?;]{0,20}"
            r"\b(?:pacote|plano|modalidade|investimento)\b"
        ),
        re.compile(
            rf"{depth_terms.pattern}[^.!?;]{{0,25}}\b(?:é|será|fica\w*)\b"
            r"[^.!?;]{0,10}\b(?:função|proporcional)\b[^.!?;]{0,20}"
            r"\b(?:pacote|plano|modalidade)\b"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,30}}"
            r"\b(?:determin\w*|dir\w*|control\w*|autoriz\w*)\b[^.!?;]{0,25}"
            r"\b(?:quão\s+detalhad\w*|até\s+que\s+ponto|grau\s+(?:da\s+)?análise|"
            r"alcance\s+da\s+análise|análise)\b"
        ),
        re.compile(
            rf"{customer_terms.pattern}[^.!?;]{{0,25}}\bescolh\w*\b"
            r"[^.!?;]{0,20}\b(?:quanto|quão)\b[^.!?;]{0,12}"
            r"\b(?:aprofund\w*|detalh\w*)\b"
        ),
        re.compile(
            r"\b(?:detalhamento|limite\s+da\s+análise)\b[^.!?;]{0,30}"
            r"\b(?:proporcional|estabelecid\w*|definid\w*|fixad\w*)\b"
            r"[^.!?;]{0,25}\b(?:pacote|plano|modalidade)\b"
        ),
        re.compile(
            r"\b(?:pacote|plano|modalidade)\b[^.!?;]{0,25}"
            r"\b(?:estabelec\w*|defin\w*|fix\w*|permit\w*)\b[^.!?;]{0,25}"
            r"\b(?:limite|profundidade|detalhamento|grau|alcance)\b"
        ),
        re.compile(
            rf"{analysis_terms.pattern}[^.!?;]{{0,25}}"
            r"\b(?:tão\s+profund\w*|até\s+o\s+limite)\b[^.!?;]{0,25}"
            r"\b(?:pacote|plano|modalidade)\b[^.!?;]{0,15}\bpermit\w*\b"
        ),
        re.compile(
            r"\bquanto\s+maior\b[^.!?;]{0,20}"
            r"\b(?:pacote|plano|modalidade|investimento)\b[^.!?;]{0,25}"
            r"\bmais\s+(?:profund\w*|detalhad\w*)\b"
            rf"[^.!?;]{{0,15}}{analysis_terms.pattern}"
        ),
        re.compile(
            r"\b(?:versão|pacote|plano|modalidade)\b[^.!?;]{0,25}"
            r"\b(?:determin\w*|defin\w*|estabelec\w*)\b[^.!?;]{0,25}"
            r"\b(?:detalhamento|até\s+onde)\b[^.!?;]{0,20}"
            rf"{analysis_terms.pattern}"
        ),
    )
    partial_analysis = re.compile(
        rf"{analysis_terms.pattern}[^.!?;]{{0,35}}"
        r"\b(?:apenas|somente|só)\b[^.!?;]{0,15}\bparte\b[^.!?;]{0,20}"
        rf"{opportunity_terms.pattern}"
    )

    negative_lead = (
        r"(?:não|nunca|jamais|em\s+nenhuma\s+hipótese|"
        r"de\s+maneira\s+alguma|de\s+modo\s+algum|longe\s+de)"
    )

    def explicitly_negated_before(sentence: str, start: int) -> bool:
        prefix = sentence[max(0, start - 90) : start]
        subject_terms = (
            r"(?:cota|quantidade|número|volume|análise|leitura|profundidade|"
            r"relatório|oportunidades?|licita(?:ção|ções)|editais?)"
        )
        return bool(
            re.search(
                rf"\b{negative_lead}\s+"
                rf"(?:(?:é|são|era|eram|ser|será|serão|foi|foram|"
                rf"estar|está|fica\w*|deve\w*|precis\w*|necessit\w*|tem|têm)\s+){{0,2}}"
                rf"(?:tão\s+)?"
                rf"(?:de\s+)?(?:(?:um|uma|o|a|os|as)\s+)?"
                rf"(?:{subject_terms}\s+){{0,3}}$",
                prefix,
            )
            or re.search(
                rf"\b{negative_lead}\s+"
                rf"(?:(?:um|uma|o|a|os|as)\s+)?(?:{subject_terms}\s+){{1,3}}"
                rf"(?:(?:é|são|era|eram|ser|será|serão|foi|foram|"
                rf"estar|está|fica\w*|deve\w*)\s+){{0,2}}(?:tão\s+)?$",
                prefix,
            )
            or re.search(
                rf"\bnenhum[ao]?\s+(?:{subject_terms}\s+){{1,3}}"
                rf"(?:(?:é|são|será|serão|fica\w*)\s+){{0,2}}$",
                prefix,
            )
            or re.search(
                rf"\bsem\s+(?:(?:precis\w*|necessit\w*)\s+)?"
                rf"(?:(?:um|uma|o|a|os|as)\s+)?(?:{subject_terms}\s+){{0,2}}$",
                prefix,
            )
        )

    def supply_is_negated(sentence: str, verb_start: int) -> bool:
        prefix = sentence[max(0, verb_start - 100) : verb_start]
        return bool(
            explicitly_negated_before(sentence, verb_start)
            or re.search(
                rf"\b{negative_lead}\s+(?:precis\w*|dev\w*|necessit\w*|tem\s+de)\b"
                r"(?:\s+\w+){0,5}\s*$",
                prefix,
            )
            or re.search(
                r"\bsem\s+(?:(?:precis\w*|dev\w*|necessit\w*)\s+)?$",
                prefix,
            )
        )

    def quota_is_negated(sentence: str, match: re.Match[str]) -> bool:
        if explicitly_negated_before(sentence, match.start()):
            return True
        return bool(
            re.search(
                rf"\b{negative_lead}\s+(?:(?:vamos|iremos|serão?)\s+)?"
                r"(?:analis\w*|avali\w*|inclu\w*|cobr\w*|abrang\w*|"
                r"ter\w*|cont[ée]\w*|entr\w*)\b[^.!?;]{0,35}"
                rf"{number_terms.pattern}[^.!?;]{{0,20}}{opportunity_terms.pattern}",
                sentence,
            )
            or re.search(
                rf"\b(?:relatório|{count_terms.pattern})\b[^.!?;]{{0,20}}"
                rf"\b{negative_lead}\b[^.!?;]{{0,15}}"
                r"\b(?:é|será|fica\w*|terá|tem|inclu\w*|cobr\w*)\b"
                rf"[^.!?;]{{0,20}}{number_terms.pattern}[^.!?;]{{0,20}}"
                rf"{opportunity_terms.pattern}",
                sentence,
            )
        )

    def quota_number_targets_opportunity(match: re.Match[str]) -> bool:
        fragment = match.group(0)
        numbers = list(number_terms.finditer(fragment))
        opportunities = list(opportunity_terms.finditer(fragment))
        intervening_dimensions = re.compile(
            r"\b(?:campos?|critérios?|fatores?|documentos?|fontes?|itens?|"
            r"atributos?|colunas?|linhas?)\b"
        )
        return any(
            not intervening_dimensions.search(
                fragment[
                    min(number.end(), opportunity.end()) :
                    max(number.start(), opportunity.start())
                ]
            )
            for number in numbers
            for opportunity in opportunities
        )

    def restriction_applies_to_subject(
        sentence: str,
        restriction: re.Match[str],
        subjects: list[re.Match[str]],
        *,
        kind: str,
    ) -> bool:
        if not subjects:
            return False
        subject = min(
            subjects,
            key=lambda candidate: min(
                abs(restriction.start() - candidate.end()),
                abs(candidate.start() - restriction.end()),
            ),
        )
        if kind == "depth" and re.search(
            r"\b(?:acesso|fontes?|documentos?|dados|informações?)\b[^.!?;]{0,20}"
            r"\b(?:limitad\w*|restrit\w*|parcial)\b|"
            r"\b(?:limitad\w*|restrit\w*|parcial)\b[^.!?;]{0,20}"
            r"\b(?:acesso|fontes?|documentos?|dados|informações?)\b",
            sentence[max(0, restriction.start() - 35) : restriction.end() + 45],
        ):
            return False
        if kind == "depth" and re.fullmatch(r"definid\w*", restriction.group(0)):
            suffix = sentence[restriction.end() : restriction.end() + 70]
            if re.search(
                r"\b(?:pel[ao]s?|conforme|segundo)\b[^.!?;]{0,20}"
                r"\b(?:informações?|dados|contexto)\b",
                suffix,
            ):
                return False
        if subject.end() <= restriction.start():
            bridge = sentence[subject.end() : restriction.start()]
            if kind == "depth" and re.search(
                r"\b(?:fontes?|documentos?|síntese|dados|informações?|critérios?|"
                r"fatores?|itens?)\b",
                bridge,
            ):
                return False
            if kind == "count" and re.search(
                r"\b(?:depend\w*|decorr\w*|result\w*|segu\w*)\b[^.!?;]{0,80}"
                r"\b(?:prazo|aceite)\b[^.!?;]{0,20}"
                r"\b(?:é|são|será|serão|fica\w*)\b\s*$",
                bridge,
            ):
                return False
            if kind == "depth" and re.search(
                r"\bmáxim\w*\b[^.!?;]{0,80}\b(?:prazo|aceite)\b"
                r"[^.!?;]{0,20}\b(?:é|são|será|serão|fica\w*)\b\s*$",
                bridge,
            ):
                return False
        else:
            prefix = sentence[max(0, restriction.start() - 45) : restriction.start()]
            bridge = sentence[restriction.end() : subject.start()]
            if re.search(r"\b(?:prazo|aceite)\b[^.!?;]{0,20}$", prefix) and re.search(
                r"\be\b", bridge
            ):
                return False
        return min(
            abs(restriction.start() - subject.end()),
            abs(subject.start() - restriction.end()),
        ) <= 120

    def shallow_applies_to_analysis(
        sentence: str,
        restriction: re.Match[str],
        analyses: list[re.Match[str]],
    ) -> bool:
        if not analyses:
            return False
        subject = min(
            analyses,
            key=lambda candidate: min(
                abs(restriction.start() - candidate.end()),
                abs(candidate.start() - restriction.end()),
            ),
        )
        if subject.end() <= restriction.start():
            bridge = sentence[subject.end() : restriction.start()]
            if re.search(
                r"\b(?:fontes?|documentos?|síntese|dados|informações?|critérios?|"
                r"fatores?|itens?)\b",
                bridge,
            ):
                return False
            return bool(
                not bridge.strip()
                or re.fullmatch(
                    r"[^.!?;]{0,20}\b(?:é|era|será|foi|fica\w*|"
                    r"terá|tem|têm)\b[^.!?;]{0,16}",
                    bridge,
                )
            )
        bridge = sentence[restriction.end() : subject.start()]
        return len(bridge) <= 16 and not re.search(r"\b\w+\b", bridge)

    def all_matches_are_negated(
        sentence: str, matches: list[re.Match[str]]
    ) -> bool:
        previous: re.Match[str] | None = None
        previous_denied = False
        for match in matches:
            denied = explicitly_negated_before(sentence, match.start())
            if not denied and previous is not None and previous_denied:
                connector = sentence[previous.end() : match.start()]
                denied = bool(re.fullmatch(r"\s*,?\s*nem\s+", connector))
            if not denied:
                return False
            previous = match
            previous_denied = denied
        return True

    for sentence in sentences:
        opportunities = list(opportunity_terms.finditer(sentence))
        customers = list(customer_terms.finditer(sentence))
        for responsibility_pattern in responsibility_patterns:
            for responsibility in responsibility_pattern.finditer(sentence):
                marker = re.search(
                    r"\b(?:a\s+cargo|sob\s+responsabilidade|responsável|"
                    r"responsabilidade|atribuição|tarefa|dever|encarregad\w*|"
                    r"escolh\w*|selecion\w*|indic\w*|respond\w*|decid\w*|"
                    r"receb\w*|"
                    r"compet\w*|cab\w*|feit\w*|produzid\w*|fornecid\w*|vind\w*|"
                    r"vem|defin\w*|determin\w*|mont\w*|form\w*)\b",
                    responsibility.group(0),
                )
                marker_start = responsibility.start() + (marker.start() if marker else 0)
                if not explicitly_negated_before(sentence, marker_start):
                    raise AssertionError(
                        "visitor must not be tasked with opportunity sourcing: "
                        f"{sentence!r}"
                    )
        for depth_discretion in depth_discretion_patterns:
            for discretion in depth_discretion.finditer(sentence):
                if re.search(
                    rf"{customer_terms.pattern}[^.!?;]{{0,20}}"
                    r"\b(?:solicit\w*|ped\w*|defin\w*|escolh\w*)\b"
                    r"[^.!?;]{0,12}\b(?:prazo|aceite|formato|canal|data)\b"
                    r"[^.!?;]{0,25}"
                    rf"{depth_terms.pattern}",
                    discretion.group(0),
                ):
                    continue
                marker = re.search(
                    r"\b(?:a\s+critério|ao\s+critério|sob\s+decisão|a\s+escolha|"
                    r"solicit\w*|ped\w*|defin\w*|escolh\w*|até\s+onde|"
                    r"autoriz\w*|depend\w*|vari\w*|mud\w*|ajust\w*|função|"
                    r"acompanh\w*|proporcional|determin\w*|dir\w*|control\w*|"
                    r"estabelec\w*|"
                    r"fix\w*|permit\w*)\b",
                    discretion.group(0),
                )
                marker_start = discretion.start() + (marker.start() if marker else 0)
                if not explicitly_negated_before(sentence, marker_start):
                    raise AssertionError(
                        "analysis depth must not be negotiated or capped: "
                        f"{sentence!r}"
                    )
        for partial in partial_analysis.finditer(sentence):
            marker = re.search(
                r"\b(?:apenas|somente|só)\b", partial.group(0)
            )
            marker_start = partial.start() + (marker.start() if marker else 0)
            denied = explicitly_negated_before(sentence, marker_start) or bool(
                re.search(
                    rf"\b{negative_lead}\s+(?:cobr\w*|analis\w*|avali\w*)\b"
                    r"[^.!?;]{0,25}$",
                    sentence[max(0, marker_start - 70) : marker_start],
                )
            )
            if not denied:
                raise AssertionError(
                    "analysis must not be promised as shallow or partial: "
                    f"{sentence!r}"
                )
        if opportunities:
            for verb in supply_verbs.finditer(sentence):
                forward = next(
                    (
                        opportunity
                        for opportunity in opportunities
                        if 0 <= opportunity.start() - verb.end() <= 60
                        and not re.search(
                            r"\b(?:confenge|informações?|dados|contexto|raio)\b",
                            sentence[verb.end() : opportunity.start()],
                        )
                    ),
                    None,
                )
                backward = next(
                    (
                        opportunity
                        for opportunity in reversed(opportunities)
                        if 0 <= verb.start() - opportunity.end() <= 60
                    ),
                    None,
                )
                customer_before = any(
                    0 <= verb.start() - customer.end() <= 80
                    and "confenge" not in sentence[customer.end() : verb.start()]
                    and not re.search(
                        r"\b(?:d[ao]s?|pel[ao]s?|com\s+[ao])\s*$",
                        sentence[max(0, customer.start() - 12) : customer.start()],
                    )
                    for customer in customers
                )
                command = bool(imperative_supply.fullmatch(verb.group(0)))
                passive = bool(
                    passive_supply_participle.fullmatch(verb.group(0))
                    and re.search(
                        r"\b(?:é|são|era|eram|será|serão|foi|foram|deve\w*\s+ser)\b"
                        r"[^.!?;]{0,30}$",
                        sentence[max(0, verb.start() - 45) : verb.start()],
                    )
                )
                prohibited_supply = bool(
                    (forward and (customer_before or command))
                    or (backward and passive and customers)
                    or (
                        backward
                        and customer_before
                        and not re.search(
                            r"\b(?:informações?|dados|contexto|raio)\b",
                            sentence[backward.end() : verb.start()],
                        )
                        and re.search(
                            rf"{opportunity_terms.pattern}[^.!?;]{{0,20}}"
                            rf"\bque\b[^.!?;]{{0,20}}{customer_terms.pattern}",
                            sentence[backward.start() : verb.start()],
                        )
                    )
                )
                if prohibited_supply and not supply_is_negated(
                    sentence, verb.start()
                ):
                    raise AssertionError(
                        "visitor must not be tasked with opportunity sourcing: "
                        f"{sentence!r}"
                    )

        negotiation_matches = list(negotiation_terms.finditer(sentence))
        count_matches = list(count_terms.finditer(sentence))
        count_restrictions = [
            restriction
            for restriction in negotiation_matches
            if restriction_applies_to_subject(
                sentence, restriction, count_matches, kind="count"
            )
        ]
        if count_restrictions:
            if not all_matches_are_negated(sentence, count_restrictions):
                raise AssertionError(
                    "opportunity count must not be negotiated or fixed: "
                    f"{sentence!r}"
                )

        if not re.search(
            r"\b(?:exemplo|demonstrativ\w*|sintétic\w*)\b", sentence
        ):
            for quota_pattern in quota_patterns:
                for match in quota_pattern.finditer(sentence):
                    if not quota_number_targets_opportunity(match):
                        continue
                    if not quota_is_negated(sentence, match):
                        raise AssertionError(
                            "report must not promise a numeric opportunity quota: "
                            f"{sentence!r}"
                        )

        shallow_matches = list(shallow_terms.finditer(sentence))
        depth_matches = list(depth_terms.finditer(sentence))
        if depth_matches:
            depth_restrictions = sorted(
                {
                    (match.start(), match.end()): match
                    for match in negotiation_matches + shallow_matches
                    if restriction_applies_to_subject(
                        sentence, match, depth_matches, kind="depth"
                    )
                }.values(),
                key=lambda match: match.start(),
            )
            if depth_restrictions and not all_matches_are_negated(
                sentence, depth_restrictions
            ):
                raise AssertionError(
                    "analysis depth must not be negotiated or capped: "
                    f"{sentence!r}"
                )

        if not depth_terms.search(sentence) and shallow_matches:
            analysis_matches = list(analysis_terms.finditer(sentence))
            analysis_restrictions = [
                restriction
                for restriction in shallow_matches
                if shallow_applies_to_analysis(
                    sentence, restriction, analysis_matches
                )
            ]
            if analysis_restrictions and not all_matches_are_negated(
                sentence, analysis_restrictions
            ):
                raise AssertionError(
                    "analysis must not be promised as shallow or partial: "
                    f"{sentence!r}"
                )


def _assert_no_price_only_authority(text: str) -> None:
    normalized = " ".join(text.casefold().split())
    assert not re.search(
        r"\b(?:apenas|somente|só)\b[^.!?;]{0,60}\bpreço(?:\s+unitário)?\b",
        normalized,
    ), "delivery invariants must not be reduced to price-only authority"
    assert not re.search(
        r"\bpreço(?:\s+unitário)?\b[^.!?;]{0,60}\b(?:únic\w*|exclusiv\w*)\b[^.!?;]{0,30}\bautorizad\w*\b",
        normalized,
    ), "delivery invariants must not be reduced to price-only authority"
    assert not re.search(
        r"\b(?:only|solely)\b[^.!?;]{0,60}\b(?:unit\s+)?price\b",
        normalized,
    ), "delivery invariants must not be reduced to price-only authority"


def _brl_millions(raw: str) -> Decimal:
    value = raw.removeprefix("R$").strip().casefold()
    if value.endswith("mi"):
        return Decimal(value.removesuffix("mi").strip().replace(".", "").replace(",", "."))
    if value.endswith("mil"):
        thousands = Decimal(
            value.removesuffix("mil").strip().replace(".", "").replace(",", ".")
        )
        return thousands / Decimal(1000)
    raise AssertionError(f"unsupported BRL display amount: {raw!r}")


def test_page_is_direct_public_html_without_friction() -> None:
    html = _html()
    lowered = html.lower()
    assert PAGE.is_file()
    assert CSS.is_file()
    assert '<main id="conteudo">' in html
    assert '<meta content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" name="robots"/>' in html
    assert f'<link href="{CANONICAL}" rel="canonical"/>' in html
    assert not any(token in lowered for token in ("<dialog", "<details", ".pdf", "download"))
    # The report is never gated. The single form is the persisted capture of the
    # published price (#289) and it sits after the document, not in front of it.
    assert lowered.count("<form") == 1
    assert lowered.index("<form") > lowered.index("<article")


def test_price_leaves_a_persisted_inline_record() -> None:
    """#289: the cheapest rung also offers an on-page persisted handraise."""
    html = _html()
    match = re.search(r"<form\b[^>]*>.*?</form>", html, re.S)
    assert match
    form = match.group(0)
    open_tag = form.split(">", 1)[0]
    for attr, value in (
        ("method", "post"),
        ("action", "/.netlify/functions/lead"),
        ("id", "captura-modelo"),
        ("data-offer-id", HANDRAISE_ID),
        ("data-cta-id", "report-599-capture"),
        ("data-asset-id", "relatorio-inteligencia-licitacoes-demonstrativo"),
        ("data-cta-position", "offer_capture"),
    ):
        assert f'{attr}="{value}"' in open_tag, attr

    hidden = dict(re.findall(r'<input\b[^>]*name="([^"]+)"[^>]*value="([^"]*)"', form))
    assert hidden["origem"] == ROUTE
    assert hidden["landing_page"] == CANONICAL
    assert hidden["asset_id"] == "relatorio-inteligencia-licitacoes-demonstrativo"
    assert hidden["cta_id"] == "report-599-capture"
    assert hidden["estagio"] == ROUTE.strip("/").split("/")[-1]
    # Handraise only: #88 keeps the Asaas catalog frozen and checkout disabled.
    assert hidden["offer_id"] == ""
    assert hidden["terms_id"] == ""
    assert "amount_cents" not in hidden
    assert 'name="consentimento"' in form and "required" in form
    anchor = html.find('href="#captura-modelo"')
    assert 0 < anchor < match.start()
    band = re.search(r'<section class="report-capture".*?</section>', html, re.S)
    assert band and set(re.findall(r"R\$ [\d.]*\d", band.group(0))) == {"R$ 599"}
    # #304 remains authoritative: five CTAs use the canonical persisted order
    # intake, while this form is the visitor's inline alternative.
    assert html.count('href="/comercial/radar-decisorio/"') == 5
    assert "wa.me/5548988344559" not in html


def test_product_promise_value_and_scope_are_explicit_before_the_example() -> None:
    html = _html()
    offer_end = html.index('<article class="report-document"')
    offer = html[:offer_end]

    for phrase in (
        "Relatório Executivo de Priorização de Licitações",
        "Escolha quais licitações disputar e quais recusar.",
        "12 analisadas",
        "3 priorizadas",
        "7 recusadas",
        "O que você recebe",
        "R$ 599 = 1 relatório adaptado",
        "A CONFENGE busca os editais abertos nesse recorte",
        "a quantidade decorre das licitações publicadas",
        "a profundidade máxima permitida pelas informações da empresa",
        "O prazo é de até 48 horas úteis",
        "começa no envio dos parâmetros",
        "antes da cobrança",
    ):
        assert phrase in offer

    for deliverable in (
        "Decisão executiva",
        "Carteira priorizada",
        "Impedimentos e condições",
        "Aderência à sua empresa",
        "Exposição financeira preliminar",
        "Ficha por oportunidade",
        "Próximas ações",
        "Fontes e rastreabilidade",
    ):
        assert deliverable in offer

    assert offer.index("O que você recebe") < offer.index("CONSULTE O EXEMPLO")
    assert "garante vitória" not in offer.casefold()
    assert "entrega em" not in offer.casefold()


def test_search_volume_and_depth_match_the_commercial_scope() -> None:
    html = _html()
    visible = _visible_text(html)

    for phrase in (
        "A CONFENGE busca os editais abertos dentro do raio de atuação da empresa.",
        "A quantidade não é combinada",
        "depende das licitações publicadas e disponíveis no recorte",
        "A análise alcança a profundidade máxima permitida pelas informações apresentadas pela empresa.",
        "Você não precisa localizar nem enviar as oportunidades",
        "essa busca faz parte do relatório",
        "A CONFENGE busca os editais abertos, monta a carteira",
    ):
        assert phrase.casefold() in visible

    for false_promise in (
        "As oportunidades que deseja comparar",
        "Envie as oportunidades",
        "quantidade de oportunidades e documentos, o escopo e o prazo são confirmados",
        "quantidade, documentos e prazo também ficam definidos",
        "carteira acordadas com a sua empresa",
    ):
        assert false_promise.casefold() not in visible

    _assert_no_scope_contradictions(visible)


@pytest.mark.parametrize(
    "contradiction",
    (
        "Compartilhe as licitações que quer avaliar.",
        "Traga os editais que deseja avaliar.",
        "Forneça as oportunidades para o relatório.",
        "O cliente fornece as oportunidades para o relatório.",
        "O cliente busca os editais para o relatório.",
        "A empresa entrega a relação de oportunidades.",
        "O visitante escolhe quais editais entram.",
        "A seleção dos editais é responsabilidade da empresa.",
        "A busca das oportunidades compete ao cliente.",
        "Compete ao cliente a triagem dos editais.",
        "Os editais serão escolhidos pelo cliente.",
        "A empresa responde pela seleção das oportunidades.",
        "Selecionar as licitações é atribuição do visitante.",
        "O levantamento das oportunidades será feito pela empresa.",
        "A empresa decide quais editais serão analisados.",
        "A indicação dos editais caberá à empresa.",
        "A lista de oportunidades vem do cliente.",
        "Informe quais editais deseja incluir.",
        "A seleção de oportunidades fica por conta da sua empresa.",
        "Cabe à sua equipe escolher os editais.",
        "Os editais serão selecionados pelo contratante.",
        "A carteira parte das oportunidades apresentadas pela construtora.",
        "Você nos diz quais licitações analisar.",
        "Recebemos do cliente os editais que serão priorizados.",
        "O cliente define a carteira de editais.",
        "A empresa escolhe o conjunto de licitações.",
        "As oportunidades ficam a cargo do cliente.",
        "O cliente não hesita e fornece as oportunidades para o relatório.",
        "Os editais são enviados pela empresa.",
        "A quantidade de oportunidades será acertada no WhatsApp.",
        "Cada relatório inclui exatamente dez oportunidades.",
        "O relatório cobre dez licitações.",
        "Dez oportunidades serão analisadas no relatório.",
        "Até dez licitações por relatório.",
        "Cada relatório terá dez oportunidades.",
        "A quantidade é de dez oportunidades.",
        "Dez oportunidades entram no relatório.",
        "O pacote traz dez editais.",
        "A análise considera dez licitações.",
        "O relatório trabalha com dez oportunidades.",
        "Entram no relatório dez oportunidades.",
        "A carteira será formada por dez oportunidades.",
        "A amostra contém dez editais.",
        "O relatório receberá dez oportunidades.",
        "Serão dez as oportunidades do relatório.",
        "Dez editais compõem a carteira.",
        "O total previsto é dez licitações.",
        "Haverá dez oportunidades na carteira.",
        "As oportunidades ficam limitadas a dez.",
        "O escopo padrão prevê dez editais.",
        "O pacote comporta dez editais.",
        "O relatório é dimensionado para dez oportunidades.",
        "A carteira é limitada a dez oportunidades.",
        "O tamanho da carteira será combinado com o cliente.",
        "A carteira padrão reúne dez editais.",
        "Entregamos uma carteira com dez oportunidades.",
        "A profundidade será definida em conjunto com a empresa.",
        "A profundidade será acordada com a empresa.",
        "O nível da análise será negociado.",
        "O alcance da análise será reduzido.",
        "A profundidade fica a critério do cliente.",
        "A análise vai até onde o cliente solicitar.",
        "O nível de detalhe é combinado com a empresa.",
        "A profundidade será a solicitada pelo cliente.",
        "A profundidade depende do pacote contratado.",
        "O cliente define o nível de detalhe.",
        "A profundidade varia conforme o plano.",
        "A profundidade é função do plano contratado.",
        "O cliente determina quão detalhada será a análise.",
        "O cliente dirá até que ponto a análise deve avançar.",
        "O detalhamento será proporcional ao pacote escolhido.",
        "O plano contratado estabelece o limite da análise.",
        "O cliente controla o grau de análise.",
        "O alcance da análise será o autorizado pela empresa.",
        "A análise será tão profunda quanto o pacote permitir.",
        "A profundidade acompanha o plano escolhido.",
        "O detalhamento varia conforme a modalidade.",
        "Você escolhe o quanto aprofundar.",
        "O grau de análise acompanha o investimento.",
        "A extensão da análise depende da modalidade.",
        "Quanto maior o pacote, mais profunda será a análise.",
        "A versão escolhida determina o detalhamento da análise.",
        "O plano define até onde a leitura será aprofundada.",
        "A análise cobre apenas parte das oportunidades.",
        "A leitura entregue será incompleta.",
        "A análise terá baixa profundidade.",
        "A leitura entregue será apenas superficial.",
    ),
)
def test_scope_semantic_guard_rejects_contradictory_mutants(
    contradiction: str,
) -> None:
    with pytest.raises(AssertionError):
        _assert_no_scope_contradictions(contradiction)


@pytest.mark.parametrize(
    "allowed",
    (
        "O cliente não fornece oportunidades.",
        "Você contrata sem enviar oportunidades.",
        "Você não precisa localizar nem enviar as oportunidades.",
        "A empresa fornece informações técnicas para que a CONFENGE busque oportunidades.",
        "O relatório não cobre dez licitações fixas.",
        "Não analisamos exatamente dez oportunidades por relatório.",
        "A quantidade não é combinada nem limitada.",
        "A profundidade não é acordada nem restrita.",
        "A análise não é superficial nem parcial.",
        "A quantidade depende das licitações publicadas e o prazo é definido pelo responsável.",
        "A quantidade segue a disponibilidade publicada e o prazo é definido pelo responsável.",
        "A profundidade é máxima e o prazo é definido pelo responsável.",
        "A CONFENGE busca oportunidades e a empresa fornece o contexto.",
        "A CONFENGE busca oportunidades com informações que a empresa apresenta.",
        "O relatório traz dez critérios para avaliar oportunidades.",
        "A análise considera dez fatores para cada oportunidade.",
        "A análise completa inclui uma síntese parcial dos documentos.",
        "A profundidade é máxima, embora algumas fontes tenham alcance restrito.",
        "O cliente define o prazo, e a profundidade permanece máxima.",
        "A carteira tem dez campos por oportunidade, sem quantidade fixa.",
        "O alcance da análise é máximo apesar do acesso limitado a certas fontes.",
        "A análise não será tão superficial quanto uma simples triagem.",
        "A profundidade máxima é definida pelas informações da empresa.",
        "O cliente escolhe o formato, e a profundidade é máxima.",
        "A CONFENGE recebe o raio da empresa e busca os editais.",
        "A quantidade jamais é fixada.",
        "Em nenhuma hipótese a profundidade é limitada.",
        "A análise de maneira alguma é superficial.",
        "A leitura está longe de ser incompleta.",
    ),
)
def test_scope_semantic_guard_accepts_explicit_denials(allowed: str) -> None:
    _assert_no_scope_contradictions(allowed)


def test_scope_authority_guard_rejects_price_only_regressions() -> None:
    for contradiction in (
        "O usuário autorizou apenas o preço unitário de R$ 599.",
        "O preço unitário foi o único elemento autorizado.",
        "The owner authorized only the unit price of BRL 599.",
    ):
        with pytest.raises(AssertionError):
            _assert_no_price_only_authority(contradiction)


def test_synthetic_disclosure_and_private_identity_denylist() -> None:
    html = _html()
    lowered = html.casefold()
    for phrase in (
        "dados sintéticos",
        "integralmente sintéticos",
        "não representa cliente, licitação ou resultado real",
        "perfil fictício",
    ):
        assert phrase in lowered
    for forbidden in (
        "extra construtora",
        "extra empreiteira",
        "cat/crea",
        "c:\\users\\",
        "onedrive",
    ):
        assert forbidden not in lowered
    cnpjs = set(re.findall(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", html))
    assert cnpjs == {"52.407.089/0001-09"}, "only CONFENGE's public CNPJ may appear"


def test_portfolio_total_reconciles_with_all_twelve_synthetic_rows() -> None:
    html = _html()
    row_amounts = re.findall(
        r'<tr[^>]*><td>A-\d{2}</td><th[^>]*>.*?</th><td>(R\$\s*[\d.,]+\s*(?:mi|mil))</td>',
        html,
        flags=re.DOTALL,
    )
    assert len(row_amounts) == 12
    summary = re.search(r"<dt>Carteira lida</dt><dd>(R\$[^<]+)</dd>", html)
    assert summary
    assert sum(map(_brl_millions, row_amounts), Decimal(0)) == _brl_millions(
        summary.group(1)
    )

    mobile_items = re.findall(
        r'<li class="report-mobile-opportunity[^>]*"[^>]*data-decision="([^"]+)"',
        html,
    )
    assert len(mobile_items) == 12
    assert mobile_items.count("PARTICIPAR") == 1
    assert mobile_items.count("COM CONDIÇÕES") == 2
    assert mobile_items.count("INVESTIGAR") == 2
    assert mobile_items.count("NÃO PARTICIPAR") == 7


def test_decision_sheet_preserves_evidence_topology_without_fake_sources() -> None:
    html = _html()
    evidence = re.search(
        r'<section[^>]+id="evidencias".*?</section>', html, flags=re.DOTALL
    )
    assert evidence
    block = evidence.group(0)
    for field in (
        "Fonte oficial",
        "Requisito do edital",
        "Evidência da empresa",
        "Confiança da leitura",
        "Ponto a revalidar",
        "Validade da decisão",
    ):
        assert field in block
    assert "referência sintética" in block.casefold()
    assert "links diretos para as fontes oficiais" in block.casefold()
    assert 'href="http' not in block


def test_value_ladder_price_and_persisted_order_entry_contract() -> None:
    html = _html()
    positions = set(re.findall(r'data-cta-position="(report_[^"]+)"', html))
    assert {
        "report_header",
        "report_hero",
        "report_after_proof",
        "report_final",
        "report_mobile_sticky",
    } == positions
    assert html.count("Configurar meu relatório por R$ 599") >= 3
    assert "R$ 599 = 1 relatório adaptado" in html
    for marker in (
        "Conclusão executiva",
        "Carteira priorizada",
        "Critérios e gates",
        "Capacidade da empresa",
        "Ficha decisória",
        "Comparação decisória",
        "Plano de 72 horas",
        "Método e limites",
    ):
        assert marker in html

    commercial_tags = re.findall(
        r'<a\b[^>]*href="/comercial/radar-decisorio/"[^>]*>', html
    )
    assert len(commercial_tags) == 5
    for tag in commercial_tags:
        assert f'data-next-action-id="{ACTION_ID}"' in tag
        assert f'data-offer-id="{HANDRAISE_ID}"' in tag
        assert 'data-cta-kind="offer"' in tag
        assert 'data-event-name="cta_click"' in tag
        assert 'data-terminal-action="capture-route"' in tag
        assert re.search(r'data-cta-id="report-599-[^"]+"', tag)
        assert re.search(r'data-cta-position="report_[^"]+"', tag)
    assert "https://wa.me/5548988344559" not in html
    assert 'data-event-name="offer_cta_click"' not in html


def test_price_has_versioned_non_catalog_action_authority() -> None:
    html = _html()
    matrix = json.loads(ACTION_MATRIX.read_text(encoding="utf-8"))
    route = next(row for row in matrix["routes"] if row["id"] == ACTION_ID)
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_ids = {offer["offer_id"] for offer in catalog["offers"]}

    assert matrix["version"] == "1.4.0"
    assert route["offer_id"] == HANDRAISE_ID
    assert route["service_id"] is None
    assert route["asset_id"] == "relatorio-inteligencia-licitacoes-demonstrativo"
    assert HANDRAISE_ID not in catalog_ids
    assert route["commercial_action_type"] == "owner_approved_non_catalog_persisted_order_intake"
    assert route["authority_source"].startswith("docs/stories/story-radar-decisorio-purchase-params.md")
    assert route["authorized_amount_cents"] == 59900
    assert route["currency"] == "BRL"
    assert route["unit"] == "one_adapted_report"
    _assert_no_price_only_authority(json.dumps(route, ensure_ascii=False))
    assert route["authorized_scope_invariants"] == {
        "client_supplies_opportunities": False,
        "opportunity_sourcing_owner": "CONFENGE",
        "opportunity_sourcing_rule": "open_tenders_within_company_operating_radius",
        "opportunity_count_rule": "published_availability_in_scope_at_search_time",
        "opportunity_count_negotiated": False,
        "analysis_depth_rule": "maximum_supported_by_company_provided_information",
    }
    assert route["scope_state"] == "PARAMETERS_PERSISTED_PENDING_HUMAN_PAYMENT_HANDOFF"
    assert route["terms_state"] == "UNKNOWN_UNTIL_HUMAN_ACCEPTANCE"
    assert route["checkout_enabled"] is False
    assert route["auto_send"] is False
    assert route["sla"] == "delivery_within_48_business_hours_from_persisted_form_submission"
    assert route["channel"] == "persisted_web_form_then_owner_payment_handoff"
    assert route["minimum_fields"] == [
        "nome",
        "cnpj",
        "radar_recorte",
        "radar_uf",
        "radar_segmentos",
        "radar_acervo_tecnico",
        "radar_email_entrega",
        "consentimento",
    ]
    assert f'data-next-action-id="{ACTION_ID}"' in html
    assert f'data-offer-id="{HANDRAISE_ID}"' in html
    body_tag = re.search(r"<body\b[^>]*>", html)
    assert body_tag and "data-offer-id" not in body_tag.group(0), (
        "non-catalog order intake must not emit catalog offer_view on page load"
    )
    assert "O prazo é de até 48 horas úteis" in html

    matrix_md = (ACTION_MATRIX.with_suffix(".md")).read_text(encoding="utf-8")
    public_story = (ROOT / "docs/stories/story-public-report-model-599.md").read_text(
        encoding="utf-8"
    )
    clarity_story = (ROOT / "docs/stories/story-report-model-clarity-10.md").read_text(
        encoding="utf-8"
    )
    deliverables_story = DELIVERABLES_STORY.read_text(encoding="utf-8")
    for authority in (matrix_md, public_story, clarity_story, deliverables_story):
        normalized_authority = " ".join(authority.casefold().split())
        _assert_no_price_only_authority(normalized_authority)
        assert "confenge busca os editais abertos" in normalized_authority
        assert "quantidade" in normalized_authority
        assert (
            "disponibilidade" in normalized_authority
            or "licitações publicadas" in normalized_authority
        )
        assert "profundidade máxima" in normalized_authority

    for story in (public_story, clarity_story, deliverables_story):
        _assert_no_scope_contradictions(story)

    assert 'window.confengeTrack("offer_cta_click"' not in html
    assert "data-next-action-id" not in html.split("<script>")[-1]


def test_schema_attribution_and_internal_discovery() -> None:
    html = _html()
    scripts = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.DOTALL
    )
    schemas = [json.loads(payload) for payload in scripts]
    types = {
        item.get("@type")
        for schema in schemas
        for item in schema.get("@graph", [])
        if isinstance(item, dict)
    }
    assert {"WebPage", "Report", "BreadcrumbList"} <= types
    assert 'data-source="CONFENGE_WEB"' in html
    assert 'data-asset-id="relatorio-inteligencia-licitacoes-demonstrativo"' in html
    assert 'window.confengeTrack("asset_view"' in html

    for source in (
        ROOT / "casos/index.html",
        ROOT / "bid-room-licitacoes-obras/index.html",
        ROOT / "diretoria-b2g/index.html",
    ):
        assert f'href="{ROUTE}"' in source.read_text(encoding="utf-8")
    assert CANONICAL in (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    assert CANONICAL in (ROOT / "sitemap.txt").read_text(encoding="utf-8")


def test_public_artifact_contains_page_after_build() -> None:
    site_page = ROOT / "_site" / ROUTE.strip("/") / "index.html"
    if (ROOT / "_site").is_dir():
        assert site_page.is_file()
        assert "R$ 599" in site_page.read_text(encoding="utf-8")
