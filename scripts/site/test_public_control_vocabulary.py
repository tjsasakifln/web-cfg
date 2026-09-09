#!/usr/bin/env python3
"""O vocabulário de controle interno não aparece para o visitante.

Complementa scripts/site/test_public_plain_language.py, que já cobre os termos
ingleses de classe epistêmica. Aqui entram os equivalentes burocráticos em
português -- enquadramento, aderência, artefato, acervo, vertical, núcleo -- e
os termos de operação -- gate, handoff, readback, PII.

Duas diferenças em relação ao gate irmão, ambas deliberadas:

0. COBERTURA ALÉM DAS PALAVRAS SOLTAS. Três leaks não eram vistos por nenhum
   gate: o rótulo de uma opção idêntico ao valor interno que ela envia
   (`<option value="UNKNOWN">UNKNOWN</option>`), um código interno concatenado
   em texto por JavaScript, e os rótulos de máquina de estados (`PUBLISHED`,
   `PAYMENT_RECEIVED`, `Timeline`, `Job do visitante`). Os três entram aqui, com
   contra-exemplos executados no mesmo caminho do gate.

1. COBERTURA ALÉM DO CORPO. A apresentação humana não é só o texto visível: a
   descrição que aparece na busca e no compartilhamento, o nome acessível de um
   controle e o rótulo de uma opção também são lidos por uma pessoa. Um leitor
   de tela lê aria-label; o Google lê meta description. Os dois entram.

2. CLASSIFICAÇÃO CONTEXTUAL, NÃO BANIMENTO DE PALAVRA. ``Acervo técnico`` e
   ``enquadramento legal`` pertencem ao vocabulário do comprador. A decisão do
   fundador de 2026-09-09 exige que cada ocorrência seja classificada: usos
   técnicos recebem fundamento verificável; linguagem de bastidor reprova sem
   herdar a antiga linha de base. Os classificadores são testados com uma forma
   legítima e uma forma operacional para cada palavra ambígua.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    MANIFEST_ROUTE_EXEMPT,
    artifact_html_files,
    relpath,
    route_for,
    select_options,
    visible_markup,
    visible_text,
    visitor_facing_html_files,
)
from scripts.site.test_self_deprecating_copy import (  # noqa: E402
    dynamic_text_states,
    jsonld_prose,
)

# Palavra inteira. "fatorial" não é "FACT"; "delegate" não é "gate"; e o
# acento de "aderência" não pode ser a forma de escapar da regra.
FORBIDDEN = {
    "enquadramento": r"\benquadramentos?\b",
    "enquadrar": r"\benquadr(?:ar|a|amos|ada|ado)\b",
    "registrar-para-triagem": r"\bregistrar\b[^.]{0,40}\b(?:triagem|revis[ãa]o de encaixe|enquadramento)\b",
    "revisao-de-encaixe": r"\brevis[ãa]o de encaixe\b",
    "aderencia": r"\bader[êe]ncias?\b",
    "artefato": r"\bartefatos?\b",
    "acervo": r"\bacervos?\b",
    "vertical": r"\bvertica(?:l|is)\b",
    "nucleo": r"\bn[úu]cleos?\b",
    "gate": r"\bgates?\b",
    "handoff": r"\bhandoffs?\b",
    "readback": r"\breadbacks?\b",
    "pii": r"\bPII\b",
    # Dispensable visitor-facing English and internal commercial shorthand.
    # URL slugs, JSON keys and source code identifiers are outside human_surface;
    # only text a person or search engine reads reaches these patterns.
    "backlog": r"\bbacklogs?\b",
    "feeling": r"\bfeelings?\b",
    "hub": r"\bhubs?\b",
    "sla": r"\bSLAs?\b",
    "input": r"\binputs?\b",
    "check": r"\bchecks?\b",
    "card": r"\bcards?\b",
    "ready": r"\bREADY\b",
    "briefing": r"\bbriefings?\b",
    "b2g": r"\bB2G\b",
    "score-honesto": r"\bscore\s+honesto\b",
}

# State-machine, registry and wire-protocol labels. These are matched
# CASE-SENSITIVELY and are NOT part of the ratchet's tolerated debt: every one
# of them was at zero when the class was added, so any reappearance is a new
# regression, not inherited debt.
#
# They are separated from FORBIDDEN above because that dict is scanned
# case-insensitively, which is right for Portuguese words and wrong here:
# `PUBLISHED` is the offer state machine's token, while "published" inside an
# ordinary English quotation is not the defect this class describes.
FORBIDDEN_EXACT_CASE = {
    # `<span class="offer-state">Oferta publicada · PUBLISHED</span>` shipped the
    # catalog's internal state next to its own Portuguese translation, 8x.
    "estado-de-publicacao": r"\bPUBLISHED\b",
    # The payment provider's webhook vocabulary, shown to the buyer in the
    # commercial terms and on the return page.
    "estado-de-pagamento": r"\bPAYMENT_[A-Z_]+\b|\bCHECKOUT_[A-Z_]+\b",
    # English heading generated onto a Portuguese tool page.
    "timeline": r"\b[Tt]imeline\b",
    # The name of a field in the editorial registry, printed as body copy.
    "campo-do-registro-editorial": r"\bJob do visitante\b",
    # Internal offer code rendered next to a Portuguese label.
    "codigo-de-oferta": r"\bOferta candidata\b",
}

# An option value is the wire value the form submits; it is allowed to be an
# internal token. The LABEL is what a person reads, so a label byte-identical to
# an internal-shaped value is not a label at all -- it is the wire value leaking
# through. The check runs on the (value, label) PAIR, which no text-scanning
# gate can see: `<option value="UNKNOWN">UNKNOWN</option>` shipped for months
# because the word "UNKNOWN" is legitimate elsewhere on that same page, and one
# path-level copy exception granted for those legitimate occurrences silenced
# this one too.
#
# The shape is deliberately narrow. A short acronym a Brazilian reads on sight
# -- the UF codes SC, RS, MG -- is a perfectly good label for its own value, so
# an internal-shaped value is either snake_case/SCREAMING_SNAKE, or a bare
# ALL-CAPS word long enough that it cannot be an acronym the visitor already
# knows (UNKNOWN, 7 characters).
INTERNAL_SHAPED_VALUE = re.compile(
    r"^(?:[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+|[A-Z][A-Z0-9]{4,})$"
)

# JavaScript that writes visitor copy at runtime never reaches the HTML this
# gate parses, so `"Oferta candidata: " + domain.candidate_offer` shipped an
# internal offer code to the screen with every gate green. The pattern is
# specific: an internal identifier concatenated straight after a human label.
VISITOR_JS_DIRS = ("ferramentas", "assets/js", "js")
RENDERED_INTERNAL_CODE = re.compile(
    r"""["'][^"'\n]*[:\u00b7]\s*["']\s*\+\s*[A-Za-z_$][\w.$]*"""
    r"""(?:candidate_offer|offer_candidate|offer_id|offer_code"""
    r"""|public_state|publication_state|canonical_status|state_token)\b"""
)

# O registro histórico é preservado como foi publicado. Reescrevê-lo para
# satisfazer um gate de linguagem seria falsificar o passado -- e a política
# vigente não usa esse vocabulário.
# Rotas exatas, nao prefixo de pasta: uma isencao por pasta cobriria qualquer
# arquivo futuro sob v/ sem ninguem decidir nada. Estas duas sao o registro
# historico, preservado como foi publicado.
ARCHIVE_ROUTES = (
    "politica-editorial/v/1.0.0/index.html",
    "politica-editorial/historico/index.html",
)

# The old 487-occurrence ratchet is historical evidence only.  It cannot be
# recorded or consulted as publication authorization after 2026-09-09.


class _HumanNames(HTMLParser):
    """Texto lido por uma pessoa que não é o corpo visível da página."""

    WANTED_ATTRS = ("aria-label", "alt", "title", "placeholder", "aria-placeholder")
    WANTED_META = ("description", "og:description", "twitter:description",
                   "og:title", "twitter:title")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        got = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = (got.get("name") or got.get("property") or "").lower()
            if key in self.WANTED_META and got.get("content"):
                self.parts.append(got["content"])
        for name in self.WANTED_ATTRS:
            if got.get(name):
                self.parts.append(got[name])

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.parts.append(data)


def human_name_parts(html: str) -> list[str]:
    """Cada nome acessível, metadado ou título é um trecho isolado."""
    parser = _HumanNames()
    parser.feed(html)
    return [" ".join(part.split()) for part in parser.parts if part.strip()]


def human_names(html: str) -> str:
    return " ".join(human_name_parts(html))


def human_surface(html: str) -> str:
    """Corpo, nomes acessíveis, busca, dados estruturados e estados literais."""
    return (
        f"{visible_text(html)} \n {human_names(html)} \n {jsonld_prose(html)}"
        f" \n {dynamic_text_states(html)}"
    )


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\s*[·|]\s*")


# UNIDADE DE CLASSIFICAÇÃO: o TRECHO com papel semântico.
#
# ``visible_text`` junta o texto de blocos vizinhos com um espaço. Isso produz
# os dois erros que esta classificação não pode cometer:
#
# 1. FALSO POSITIVO / FALSO NEGATIVO POR CONCATENAÇÃO. Uma citação fiel da fonte
#    e uma frase autoral que só existe no site viravam a mesma "sentença" quando
#    o título não terminava em pontuação. O fundamento técnico de um trecho
#    passava a valer para o outro -- e o objeto transcrito passava a carregar o
#    jargão do botão ao lado. Um trecho é um parágrafo, um título, um item, uma
#    célula/campo, um botão, um metadado ou um nome acessível.
# 2. TERMO PARTIDO POR MARCAÇÃO INLINE. ``<strong>ader</strong>ência`` virava
#    "ader ência" e escapava de qualquer padrão de palavra inteira. Marcação
#    inline não separa trechos e não insere espaço.
_INLINE_MARK = "\u200b"
_INLINE_TAGS = {
    "a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "data", "del", "dfn",
    "em", "font", "i", "ins", "kbd", "mark", "nobr", "output", "q", "rp", "rt",
    "ruby", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u",
    "var", "wbr",
}


# Blocos em que um link é parte da frase: dentro deles o texto tem um único
# papel semântico e uma preposição pode separar o termo do seu operando. Fora
# deles -- nav, div, section, ul -- cada link é um trecho próprio: um item de
# menu ao lado de outro item de menu não é contexto técnico de coisa nenhuma.
_PROSE_BLOCKS = {
    "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "dd", "dt",
    "figcaption", "caption", "blockquote", "summary", "label", "legend",
    "option", "button", "address", "pre",
}
# Rótulo e valor do MESMO campo são um trecho só: `<th>Aderência 30%</th>` com
# os `<td>` da sua linha, `<dt>` com o seu `<dd>`. Separá-los transformaria o
# rótulo de um campo em um trecho sem operando e devolveria "pendente" para uma
# ficha que declara o operando na célula ao lado. A fronteira do registro
# continua sendo a linha (`tr`) ou o próximo termo (`dt`), não a célula.
_FIELD_TAGS = {"td", "th", "dd"}
_SELF_CLOSING = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "param", "source", "track", "wbr",
}


class _Trechos(HTMLParser):
    """Segmenta a marcação perceptível em trechos com papel semântico."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.segments: list[str] = []
        self._buffer: list[str] = []
        self._blocks: list[str] = []
        self._standalone_links: list[bool] = []

    def _flush(self) -> None:
        # O espaço original é preservado aqui: quem colapsa é ``trecho_views``,
        # e só depois de decidir o que a fronteira inline significa.
        raw = "".join(self._buffer)
        if raw.replace(_INLINE_MARK, "").strip():
            self.segments.append(raw)
        self._buffer = []

    def _in_prose(self) -> bool:
        return bool(self._blocks) and self._blocks[-1] in _PROSE_BLOCKS

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        tag = tag.lower()
        if tag == "a":
            # Um link dentro de uma frase é parte da frase. Um link solto em
            # nav/div/lista é um trecho com papel próprio: a citação técnica do
            # bloco vizinho não pode fundamentá-lo, nem ele condenar a citação.
            standalone = not self._in_prose()
            self._standalone_links.append(standalone)
            if standalone:
                self._flush()
            else:
                self._buffer.append(_INLINE_MARK)
            return
        if tag == "br":
            self._buffer.append(" ")
            return
        if tag in _INLINE_TAGS:
            self._buffer.append(_INLINE_MARK)
            return
        if tag in _FIELD_TAGS:
            self._buffer.append(" ")
        else:
            self._flush()
        if tag not in _SELF_CLOSING:
            self._blocks.append(tag)

    def handle_startendtag(self, tag: str, attrs) -> None:  # noqa: ANN001
        tag = tag.lower()
        if tag == "br":
            self._buffer.append(" ")
        elif tag in _INLINE_TAGS or tag == "a":
            self._buffer.append(_INLINE_MARK)
        else:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        # Fechar o `<dt>` não fecha o campo: o valor vem no `<dd>` seguinte.
        if tag == "dt":
            self._buffer.append(" ")
            if tag in self._blocks:
                index = len(self._blocks) - 1 - self._blocks[::-1].index(tag)
                del self._blocks[index:]
            return
        if tag == "a":
            standalone = self._standalone_links.pop() if self._standalone_links else False
            if standalone:
                self._flush()
            else:
                self._buffer.append(_INLINE_MARK)
            return
        if tag in _INLINE_TAGS or tag == "br":
            self._buffer.append(_INLINE_MARK)
            return
        if tag in _FIELD_TAGS:
            self._buffer.append(" ")
        else:
            self._flush()
        if tag in self._blocks:
            index = len(self._blocks) - 1 - self._blocks[::-1].index(tag)
            del self._blocks[index:]

    def handle_data(self, data: str) -> None:
        self._buffer.append(data)

    def close(self) -> None:  # noqa: D102
        super().close()
        self._flush()


def visible_trechos(html: str) -> list[str]:
    """Trechos do corpo visível, com a mesma noção de nó perceptível dos demais gates."""
    parser = _Trechos()
    parser.feed(visible_markup(html))
    parser.close()
    return parser.segments


def human_trechos(html: str) -> list[str]:
    """Todo trecho lido por uma pessoa ou por um buscador, sem juntar trechos distintos."""
    parts = visible_trechos(html)
    parts.extend(human_name_parts(html))
    for extra in (jsonld_prose(html), dynamic_text_states(html)):
        normalized = " ".join(extra.split())
        if normalized:
            parts.append(normalized)
    return parts


def trecho_views(trecho: str) -> tuple[str, str]:
    """Duas leituras do mesmo trecho, separadas por um motivo material.

    ``detect`` cola as fronteiras inline: é nele que ``<strong>ader</strong>ência``
    volta a ser uma palavra inteira, e nenhuma marcação esconde um termo.
    ``context`` trata a mesma fronteira como espaço: é nele que
    ``<span>Aderência de tipologia</span><strong>30%</strong>`` volta a ter a
    palavra "tipologia" inteira, para que o fundamento técnico do trecho possa
    ser lido. Nenhuma das duas inventa texto que a página não tem.
    """
    detect = " ".join(trecho.replace(_INLINE_MARK, "").split())
    context = " ".join(trecho.replace(_INLINE_MARK, " ").split())
    return detect, context


def _occurrences(pattern: str, detect: str, context: str, *, ignore_case: bool = True) -> int:
    """Ocorrências do termo nas duas leituras do trecho.

    Marcação inline não pode esconder um termo em NENHUMA das direções:
    ``<strong>ader</strong>ência`` só aparece na leitura colada, e
    ``...enquadramento</a><a>Quando...`` só aparece na leitura espaçada.
    O censo fica com a leitura que enxerga mais, nunca com a que enxerga menos.
    """
    flags = re.IGNORECASE if ignore_case else 0
    return max(
        len(re.findall(pattern, detect, flags=flags)),
        len(re.findall(pattern, context, flags=flags)),
    )


def classified_sentences(html: str) -> list[tuple[str, str]]:
    """Cada trecho, ainda dividido por sentença: um trecho nunca vaza no outro."""
    out: list[tuple[str, str]] = []
    for trecho in human_trechos(html):
        for sentence in _SENTENCE_SPLIT.split(trecho):
            detect, context = trecho_views(sentence)
            if detect:
                out.append((detect, context))
    return out


_INTERNAL_ENQUADRAMENTO = re.compile(
    r"\bpedido de enquadramento\b"
    r"|\bdura[çc][ãa]o t[íi]pica da conversa\b[^.!?]{0,55}\benquadramento\b"
    r"|\bconversa de enquadramento\b"
    r"|\btriagem aplica\b[^.!?]{0,55}\benquadramentos?\b"
    r"|\benquadramentos?\b[^.!?]{0,55}\b(?:valores publicados|proposta comercial)\b"
    r"|\b(?:pedir|solicitar)\b[^.!?]{0,35}\benquadramento\b"
    r"|\benquadramento (?:do diagn[óo]stico|e termos)\b"
    r"|\buso destes dados\b[^.!?]{0,60}\benquadramento\b"
    r"|\b1 enquadramento\b[^.!?]{0,80}\bCNPJ\b"
    r"|\bos enquadramentos?\b[^.!?]{0,80}\b(?:essencial|complexa|especial)\b"
    r"|\bo que voc[êe] recebe\b[^.!?]{0,30}\benquadramento do formato\b"
    r"|\benquadrar (?:a oportunidade cr[íi]tica|esta demanda|a necessidade)\b"
    r"|\benquadramos a necessidade\b"
    r"|\ban[áa]lise pode ser enquadrada\b",
    re.I,
)
_INTERNAL_ACERVO = re.compile(
    r"\bacervo\b[^.!?]{0,35}\b(?:editorial|interno|do site|de conte[úu]do|de provas?)\b"
    r"|\b(?:editorial|interno)\b[^.!?]{0,35}\bacervo\b",
    re.I,
)
_LEGITIMATE_ACERVO = re.compile(
    r"\bacervo(?:s)?\s+t[ée]cnic[oa]s?\b"
    r"|\bacervo(?:s)?\b[^.!?]{0,130}\b(?:edital|licita[çc][ãa]o|habilita[çc][ãa]o|"
    r"atestados?|CATs?|parcelas? relevantes?|capacidade|equipe|caixa|tipologias?|"
    r"objeto|proposta|contrato|documentos?|concorrente|CNPJ|segmentos?|raio|"
    r"quantitativos?|compradores?|[óo]rg[ãa]os?|cons[óo]rcio|san[çc][õo]es|pagamento|"
    r"registro de pre[çc]os|faixa de R\$\s*\d|ader[êe]ncia)\b"
    r"|\b(?:edital|licita[çc][ãa]o|habilita[çc][ãa]o|atestados?|CATs?|"
    r"parcelas? relevantes?|capacidade|equipe|caixa|tipologias?|objeto|proposta|"
    r"contrato|documentos?|concorrente|CNPJ|segmentos?|raio|quantitativos?|"
    r"compradores?|[óo]rg[ãa]os?|cons[óo]rcio|san[çc][õo]es|pagamento|registro de pre[çc]os|"
    r"faixa de R\$\s*\d|ader[êe]ncia)\b[^.!?]{0,130}\bacervo(?:s)?\b"
    r"|\bacervo\b[^.!?]{0,90}\b(?:faixa de R\$\s*\d|pr[óo]ximo ciclo|compat[íi]vel|"
    r"comprador|objetos? recorrentes?|campo de texto)\b",
    re.I,
)
_INTERNAL_ADERENCIA = re.compile(
    r"\bader[êe]ncia\b[^.!?]{0,45}\b(?:editorial|ao gate|à taxonomia|ao funil|ao workflow)\b"
    r"|\b(?:gate|taxonomia|workflow)\b[^.!?]{0,45}\bader[êe]ncia\b"
    # Triagem de encaixe comercial antes de falar de preço é linguagem de funil,
    # não classificação técnica: nomeia o processo interno de qualificar quem pede.
    r"|\bader[êe]ncia\s+comercial\b"
    r"|\btriagem\b[^.!?]{0,40}\bader[êe]ncia\b"
    r"|\bader[êe]ncia\b[^.!?]{0,40}\b(?:triagem|funil|or[çc]amento|proposta comercial)\b",
    re.I,
)
# FUNDAMENTO POSITIVO da aderência. Não coincidir com a lista de expressões
# internas acima NUNCA foi prova de legitimidade: era aprovação por omissão, e
# qualquer frase nova -- inclusive jargão comercial que ninguém tinha listado
# ainda -- passava. Só é linguagem do comprador a aderência que diz ADERÊNCIA
# DE QUÊ A QUÊ: objeto, escopo, tipologia, capacidade, habilitação, acervo,
# território, histórico público ou outro operando técnico verificável no
# próprio trecho. Sem esse operando a ocorrência fica PENDENTE DE REVISÃO.
_LEGITIMATE_ADERENCIA = re.compile(
    r"\b(?:objetos?|escopos?|tipologias?|capacidade|capacidades|habilita[çc][ãa]o|"
    r"qualifica[çc][ãa]o|acervos?|atestados?|CATs?|parcelas? relevantes?|edital|"
    r"editais|licita[çc][õo]es|licita[çc][ãa]o|contratos?|contrata[çc][ãa]o|"
    r"[óo]rg[ãa]os?|comprador(?:es)?|fornecedor(?:es)?|concorrentes?|equipe|"
    r"geografia|territ[óo]rio|raio|recorte|regi[ãa]o|munic[íi]pio|estado|"
    r"hist[óo]ric[oa]s?|porte|perfil|perfis|obras?|servi[çc]os?|t[ée]cnica|"
    r"t[ée]cnico|t[ée]cnicos|t[ée]cnicas|sem[âa]ntica|documental|CNPJ|"
    r"quantitativos?|pre[çc]os?|vig[êe]ncia|carteira|segmentos?|"
    r"recomenda[çc][ãa]o|risco contratual|raio operacional|"
    r"capacidade operacional|estrat[ée]gia|dados?|fontes?)\b",
    re.I,
)
# Marcador autoral/comercial: o trecho não descreve um fato técnico, ele vende,
# opina ou fala do bastidor. Uma ocorrência sem fundamento positivo que carrega
# um destes marcadores é defeito, não ambiguidade.
# Só entram expressões que não têm leitura técnica possível. Possessivo comum
# ("o meu descompasso de custo", "nossa equipe") NÃO é marcador: reprovaria
# português corrente e pularia justamente o estado de revisão. As construções
# comerciais de cada termo já são tratadas na sua própria regra
# (_VERTICAL_COMMERCIAL, _INTERNAL_ADERENCIA, _INTERNAL_ENQUADRAMENTO).
_AUTHORIAL_MARKER = re.compile(
    r"\bmelhor do mercado\b|\bl[íi]der de mercado\b|\bbastidor(?:es)?\b"
    r"|\brevis[ãa]o interna\b|\buso interno\b|\btime interno\b|\bpipeline\b",
    re.I,
)
_DELIVERABLE_CONTEXT = re.compile(
    r"\benquadramento e regras\b[^.!?]{0,80}\bm[ée]todo\b"
    r"|\bdo enquadramento at[ée] as decis[õo]es\b"
    r"|\babertura e enquadramento\b[^.!?]{0,80}\b(?:slide|contexto)\b",
    re.I,
)
_LEGITIMATE_ENQUADRAMENTO = re.compile(
    r"\benquadr(?:amentos?|ar|a|amos|ada|ado)\b[^.!?]{0,120}\b(?:legal|jur[íi]dic[oa]|"
    r"t[ée]cnic[oa]|contratual|tribut[áa]ri[oa]|trabalhista|aditivo|art\.?|lei|edital|"
    r"matriz de riscos?|regime|fato|evento|obriga[çc][ãa]o|causa|escopo|responsabilidade|"
    r"instrumento|projeto|formaliza[çc][ãa]o|c[áa]lculo|limite|medi[çc][ãa]o|vig[êe]ncia|"
    r"execu[çc][ãa]o|altera[çc][ãa]o|reequil[íi]brio|risco|prova|atraso|"
    r"indeferimento|documentos?|custos?|prazo|margem|BDI|SINAPI|CPRB|encargos?|"
    r"desonera[çc][ãa]o|AGU|PGF|contrato|engenharia|obra|quantifica[çc][ãa]o|[íi]ndice|objetos?|reformas?|edif[íi]cios?|equipamentos?|recapeamento|redes?|"
    r"pre[çc]o|planilha|§)\b"
    r"|\b(?:legal|jur[íi]dic[oa]|t[ée]cnic[oa]|contratual|tribut[áa]ri[oa]|trabalhista|"
    r"aditivo|art\.?|lei|edital|matriz de riscos?|regime|fato|evento|obriga[çc][ãa]o|"
    r"causa|escopo|responsabilidade|instrumento|projeto|formaliza[çc][ãa]o|c[áa]lculo|"
    r"limite|medi[çc][ãa]o|vig[êe]ncia|execu[çc][ãa]o|altera[çc][ãa]o|"
    r"reequil[íi]brio|risco|prova|atraso|indeferimento|documentos?|custos?|prazo|"
    r"margem|BDI|SINAPI|CPRB|encargos?|desonera[çc][ãa]o|AGU|PGF|contrato|"
    r"engenharia|obra|quantifica[çc][ãa]o|[íi]ndice|objetos?|reformas?|edif[íi]cios?|equipamentos?|recapeamento|redes?|pre[çc]o|planilha|§)\b"
    r"[^.!?]{0,120}\benquadr(?:amentos?|ar|a|amos|ada|ado)\b"
    r"|\benquadramento\s+(?:do caso|pr[áa]tico|federal|da empresa|se aplica)\b"
    r"|\b(?:exemplos?|erros?|hip[óo]teses?)\s+de\s+enquadramento\b",
    re.I,
)


# "vertical" é, ao mesmo tempo, uma direção física do mundo real e o jargão
# comercial de segmento. A regra anterior só reconhecia o par de eixos
# ("horizontal e vertical") e a sinalização viária, e por isso reprovava
# transcrição fiel do objeto do PNCP -- "SERVIÇOS DE SINALIZAÇÃO VERTICAL" --
# e qualquer outro uso geométrico ou material legítimo (armadura vertical,
# junta vertical, eixo vertical). A decisão passou a ser POR OCORRÊNCIA: cada
# "vertical" do trecho precisa do seu próprio operando físico, e nenhuma delas
# pode estar em construção comercial. Uma citação técnica não legitima o jargão
# ao lado, e o jargão ao lado não condena a citação de outro trecho.
_VERTICAL_TERM = re.compile(r"\bvertica(?:l|is)\b", re.I)
_VERTICAL_AXES = re.compile(r"\bhorizontal\s+e\s+vertica(?:l|is)\b", re.I)
_VERTICAL_SIGNAGE = re.compile(
    r"\bsinaliza[çc][ãa]o\s+(?:vi[áa]ria\s+)?vertica(?:l|is)\b", re.I
)
_PHYSICAL_NOUN = (
    r"eixos?|prumo|alinhamentos?|juntas?|armaduras?|pilar(?:es)?|vigas?|placas?|"
    r"pain[ée]is|painel|tubula[çc][õo]es|tubula[çc][ãa]o|tubos?|dutos?|postes?|"
    r"furos?|cortes?|se[çc][õo]es|se[çc][ãa]o|escadas?|fachadas?|taludes?|"
    r"drenagens?|drenagem|deslocamentos?|cargas?|recalques?|desn[íi]ve(?:l|is)|"
    r"lajes?|paredes?|alvenarias?|guarda-corpos?|barras?|circula[çc][ãa]o|"
    r"transportes?|eleva[çc][ãa]o|proje[çc][ãa]o|dist[âa]ncias?|dimens[õo]es|"
    r"geometria|sinaliza[çc][ãa]o|sinaliza[çc][õo]es|regu[al]s?|superf[íi]cies?|"
    r"horizontal|horizontais|inclinad[oa]s?|plac[ao]s|selagem|impermeabiliza[çc][ãa]o"
)
_VERTICAL_PHYSICAL_BEFORE = re.compile(
    rf"\b(?:{_PHYSICAL_NOUN})\b(?:\s+(?:e|ou|d[eoa]s?|do|da|em|no|na)?\s*\w+){{0,2}}\s+$",
    re.I,
)
_VERTICAL_PHYSICAL_AFTER = re.compile(
    rf"^\s*(?:(?:e|ou|,|;)\s+)?(?:(?:d[eoa]s?|do|da|em|no|na|entre)\s+)?"
    rf"(?:\w+\s+){{0,1}}\b(?:{_PHYSICAL_NOUN})\b",
    re.I,
)
# "vertical" como SUBSTANTIVO ("a vertical de sinalização", "as verticais de
# drenagem") é recorte de segmento, não descrição física: o papel gramatical é o
# discriminador. "sinalização vertical" é substantivo + adjetivo e permanece
# legítima; determinante + "vertical" + complemento é o núcleo do sintagma e não
# pode ser aprovado pela mera vizinhança de um substantivo físico -- era assim que
# "A vertical de sinalização é nossa aposta de mercado." recebia fundamento físico.
# Não vira defeito automático: uso geométrico do substantivo existe ("a vertical do
# prumo"), então a ocorrência cai em PENDENTE DE REVISÃO, sem aprovação nem banimento.
_VERTICAL_NOUN_USE = re.compile(
    r"\b(?:[ao]s?|um(?:a|as|ns)?|noss[ao]s?|minha|meu|est[ae]s?|aquel[ae]s?|"
    r"cada|outr[ao]s?|nova|segunda|primeira)\s+vertica(?:l|is)\s+"
    r"(?:d[eoa]s?|do|da)\b",
    re.I,
)
_VERTICAL_COMMERCIAL = re.compile(
    r"\b(?:noss[ao]s?|minha|meu|est[ae]|nova|segunda|primeira|cada|outra)\s+"
    r"vertica(?:l|is)\b"
    r"|\bvertica(?:l|is)\s+(?:comercia(?:l|is)|de neg[óo]cios?|do neg[óo]cio|"
    r"de servi[çc]os?|de mercado|de oferta|de atua[çc][ãa]o|de produto|"
    r"estrat[ée]gicas?|B2G|B2B|B2C)\b",
    re.I,
)


def _vertical_reason(sentence: str) -> str | None:
    """Fundamento físico de CADA ocorrência de 'vertical' no trecho."""
    axes = [m.span() for m in _VERTICAL_AXES.finditer(sentence)]
    signage = [m.span() for m in _VERTICAL_SIGNAGE.finditer(sentence)]
    commercial = [m.span() for m in _VERTICAL_COMMERCIAL.finditer(sentence)]
    noun_spans = [m.span() for m in _VERTICAL_NOUN_USE.finditer(sentence)]
    occurrences = list(_VERTICAL_TERM.finditer(sentence))
    if not occurrences:
        return None
    kinds: set[str] = set()
    for match in occurrences:
        start, end = match.span()
        inside = lambda spans: any(a <= start and end <= b for a, b in spans)  # noqa: E731
        if inside(commercial):
            return None
        if inside(signage):
            kinds.add("sinalizacao")
            continue
        if inside(axes):
            kinds.add("eixos")
            continue
        noun_use = any(
            a <= start and end <= b for a, b in noun_spans
        )
        if not noun_use and (
            _VERTICAL_PHYSICAL_BEFORE.search(sentence[max(0, start - 60):start])
            or _VERTICAL_PHYSICAL_AFTER.match(sentence[end:end + 60])
        ):
            kinds.add("fisico")
            continue
        return None
    if "sinalizacao" in kinds:
        return "orientacao_fisica_em_sinalizacao_viaria"
    if "eixos" in kinds:
        return "orientacao_fisica_no_objeto_transcrito"
    return "orientacao_fisica_ou_material_no_objeto"


def legitimate_reason(term: str, sentence: str) -> str | None:
    """Return the material reason an ambiguous occurrence is visitor language."""
    if term == "acervo" and not _INTERNAL_ACERVO.search(sentence) and _LEGITIMATE_ACERVO.search(sentence):
        return "qualificacao_tecnica_da_empresa_em_licitacao"
    if (term == "aderencia"
            and not _INTERNAL_ADERENCIA.search(sentence)
            and _LEGITIMATE_ADERENCIA.search(sentence)):
        return "compatibilidade_tecnica_entre_objeto_escopo_capacidade_ou_referencia"
    if term in {"enquadramento", "enquadrar"} and _DELIVERABLE_CONTEXT.search(sentence):
        return "contextualizacao_do_problema_e_premissas_na_entrega"
    if (term in {"enquadramento", "enquadrar"}
            and not _INTERNAL_ENQUADRAMENTO.search(sentence)
            and _LEGITIMATE_ENQUADRAMENTO.search(sentence)):
        return "classificacao_tecnica_legal_do_fato_obrigacao_ou_instrumento"
    if term == "vertical":
        return _vertical_reason(sentence)
    if term == "nucleo" and re.search(r"\bn[úu]cleo da prote[çc][ãa]o\b", sentence, re.I):
        return "substantivo_comum_centro_da_protecao"
    if term == "b2g" and re.search(
        r"\bB2G\b[^.!?]{0,100}\b(?:business-to-government|rela[çc][ãa]o entre empresas? e (?:o )?poder p[úu]blico)\b"
        r"|\btranscri[çc][ãa]o fiel\b[^.!?]{0,100}\bB2G\b",
        sentence,
        re.I,
    ):
        return "sigla_definida_ou_transcricao_externa_identificada"
    if term == "sla" and re.search(
        r"\bSLA\b\s*\([^)]*acordo de n[íi]vel de servi[çc]o[^)]*\)"
        r"|\bacordo de n[íi]vel de servi[çc]o\b[^.!?]{0,60}\bSLA\b",
        sentence,
        re.I,
    ):
        return "sigla_tecnica_definida_em_portugues"
    if term == "hub" and re.search(
        r"\bContrata[çc][ãa]o da empresa Igua[çc]u HUB\b",
        sentence,
        re.I,
    ):
        return "nome_empresarial_transcrito_do_objeto_publico"
    return None


# Palavras que o comprador também usa. Para elas existe um terceiro estado além
# de "legítima" e "defeito": PENDENTE DE REVISÃO. Ausência de fundamento
# positivo não é prova de bastidor, e ausência de marcador de bastidor não é
# prova de legitimidade -- o gate diz que não sabe, e a decisão fica com uma
# pessoa. Nenhum dos dois estados não-legítimos publica: pendente também
# bloqueia, para que "não sei" nunca vire aprovação silenciosa.
AMBIGUOUS_TERMS = {"acervo", "aderencia", "enquadramento", "enquadrar", "vertical", "nucleo"}
PENDING = "pending_review"
DEFECT = "defect"
LEGITIMATE = "legitimate"


def classify_occurrence(term: str, sentence: str) -> tuple[str, str | None]:
    """Estado da ocorrência: legítima com fundamento, defeito, ou pendente."""
    # Para os termos ambiguos, bastidor e jargao autoral decidem PRIMEIRO.
    # Enquanto a legitimidade vinha antes, qualquer ancora tecnica no mesmo
    # trecho absolvia o jargao comercial vizinho e _AUTHORIAL_MARKER ficava
    # inerte. Termos NAO ambiguos continuam podendo ser legitimados por
    # transcricao fiel (B2G, nucleo da protecao): a ordem so muda para os
    # ambiguos, senao a correcao viraria banimento de vocabulario tecnico.
    if term in AMBIGUOUS_TERMS:
        if _AUTHORIAL_MARKER.search(sentence):
            return DEFECT, None
        if term == "acervo" and _INTERNAL_ACERVO.search(sentence):
            return DEFECT, None
        if term == "aderencia" and _INTERNAL_ADERENCIA.search(sentence):
            return DEFECT, None
        if term in {"enquadramento", "enquadrar"} and _INTERNAL_ENQUADRAMENTO.search(sentence):
            return DEFECT, None
        if term == "vertical" and _VERTICAL_COMMERCIAL.search(sentence):
            return DEFECT, None
    reason = legitimate_reason(term, sentence)
    if reason:
        return LEGITIMATE, reason
    if term not in AMBIGUOUS_TERMS:
        return DEFECT, None
    return PENDING, None


def classify_occurrence_views(
    term: str, detect: str, context: str
) -> tuple[str, str | None]:
    """Classifica nas DUAS leituras do trecho e conserva a mais severa.

    O censo já contava o termo pela leitura que enxerga mais (``_occurrences``),
    mas a classificação olhava só a leitura espaçada. Como
    ``_INTERNAL_ADERENCIA`` exige o termo inteiro e ``_LEGITIMATE_ADERENCIA``
    não, ``Triagem de <b>ader</b>ência comercial`` ficava invisível para a
    regra de bastidor e visível para a de fundamento: era classificado como
    legítimo e PUBLICAVA. Marcação inline não pode decidir o veredito.
    """
    verdicts = [classify_occurrence(term, view) for view in dict.fromkeys((context, detect))]
    # DEFEITO vence: marcacao inline nao pode esconder bastidor de nenhuma das
    # leituras. LEGITIMIDADE tambem vence PENDENTE: basta UMA leitura fiel exibir
    # o operando tecnico. A leitura colada funde celulas vizinhas
    # ("tipologia30%") e destroi a fronteira de palavra, entao exigir fundamento
    # nas DUAS leituras reprovava conteudo legitimo -- falso positivo, nao protecao.
    for verdict in verdicts:
        if verdict[0] == DEFECT:
            return verdict
    for verdict in verdicts:
        if verdict[0] == LEGITIMATE:
            return verdict
    return verdicts[0]


def _surface_files(base: Path, *, require_artifact: bool) -> list[Path]:
    files = artifact_html_files(base) if require_artifact else visitor_facing_html_files(base)
    if require_artifact and not files:
        raise ValueError(f"public artifact has no HTML: {base}")
    return files


def classify_scan(
    root: Path | None = None, *, require_artifact: bool = False
) -> dict[str, object]:
    """Classify every matched occurrence as legitimate, pending review or a defect."""
    base = (root or ROOT).resolve()
    all_found: dict[str, dict[str, int]] = {}
    legitimate: dict[str, dict[str, int]] = {}
    defects: dict[str, dict[str, int]] = {}
    confirmed: dict[str, dict[str, int]] = {}
    pending: dict[str, dict[str, int]] = {}
    reasons: dict[str, int] = {}
    classifications: list[dict[str, object]] = []
    defect_examples: list[dict[str, object]] = []
    for path in _surface_files(base, require_artifact=require_artifact):
        rel = relpath(path, base)
        if rel in ARCHIVE_ROUTES or (
            require_artifact and route_for(rel) in MANIFEST_ROUTE_EXEMPT
        ):
            continue
        for normalized, context in classified_sentences(path.read_text(encoding="utf-8")):
            for term, pattern in FORBIDDEN.items():
                n = _occurrences(pattern, normalized, context)
                if not n:
                    continue
                all_found.setdefault(rel, {})[term] = all_found.setdefault(rel, {}).get(term, 0) + n
                status, reason = classify_occurrence_views(term, normalized, context)
                if status == LEGITIMATE:
                    target = legitimate
                    reasons[reason] = reasons.get(reason, 0) + n  # type: ignore[index]
                else:
                    target = pending if status == PENDING else confirmed
                    # Pendente e defeito bloqueiam igual: "não sei" não publica.
                    defects.setdefault(rel, {})[term] = (
                        defects.setdefault(rel, {}).get(term, 0) + n
                    )
                target.setdefault(rel, {})[term] = target.setdefault(rel, {}).get(term, 0) + n
                item = {
                    "path": rel,
                    "term": term,
                    "count": n,
                    "status": status,
                    "reason": reason,
                    "context": context[:500],
                }
                classifications.append(item)
                if status != LEGITIMATE:
                    defect_examples.append(item)
            for term, pattern in FORBIDDEN_EXACT_CASE.items():
                n = _occurrences(pattern, normalized, context, ignore_case=False)
                if not n:
                    continue
                all_found.setdefault(rel, {})[term] = all_found.setdefault(rel, {}).get(term, 0) + n
                defects.setdefault(rel, {})[term] = defects.setdefault(rel, {}).get(term, 0) + n
                confirmed.setdefault(rel, {})[term] = confirmed.setdefault(rel, {}).get(term, 0) + n
                item = {
                    "path": rel,
                    "term": term,
                    "count": n,
                    "status": DEFECT,
                    "reason": None,
                    "context": normalized[:500],
                }
                classifications.append(item)
                defect_examples.append(item)
    return {
        "all": all_found,
        "legitimate": legitimate,
        # ``defects`` is the BLOCKING set: confirmed backstage language plus
        # every occurrence still pending an explicit editorial decision. The
        # outer coverage gate reads this key, so an unresolved classification
        # can never pass one layer up as if it had been approved.
        "defects": defects,
        "confirmed_defects": confirmed,
        "pending_review": pending,
        "legitimate_reasons": reasons,
        "classifications": classifications,
        "defect_examples": defect_examples,
    }


def scan() -> dict[str, dict[str, int]]:
    """Backward-compatible full census; publication uses classify_scan()."""
    return classify_scan()["all"]  # type: ignore[return-value]


def option_label_failures(root: Path | None = None) -> list[str]:
    """A `<select>` option must offer a label, not repeat its own wire value."""
    base = root or ROOT
    out: list[str] = []
    for path in visitor_facing_html_files(base):
        rel = relpath(path, base)
        if rel in ARCHIVE_ROUTES:
            continue
        for value, label in select_options(path.read_text(encoding="utf-8")):
            if not value or not INTERNAL_SHAPED_VALUE.match(value):
                continue
            if label.strip() == value:
                out.append(
                    f"{rel}: <option value=\"{value}\"> repete o valor interno como rótulo; "
                    "o visitante precisa de um rótulo em português"
                )
    return out


def rendered_internal_code_failures(root: Path | None = None) -> list[str]:
    """Visitor-facing JS must not concatenate an internal code into visible copy."""
    base = root or ROOT
    out: list[str] = []
    for folder in VISITOR_JS_DIRS:
        root_dir = base / folder
        if not root_dir.is_dir():
            continue
        for path in sorted(root_dir.rglob("*.js")):
            text = path.read_text(encoding="utf-8", errors="replace")
            for hit in RENDERED_INTERNAL_CODE.findall(text):
                out.append(f"{relpath(path, base)}: código interno concatenado em texto visível")
    return out


def _surface_statuses(html: str) -> dict[str, set[str]]:
    """Run the same trecho/term/status decision used by the site scan on one fixture."""
    out: dict[str, set[str]] = {}
    for normalized, context in classified_sentences(html):
        for term, pattern in FORBIDDEN.items():
            if not _occurrences(pattern, normalized, context):
                continue
            status, _reason = classify_occurrence(term, context)
            out.setdefault(term, set()).add(status)
    return out


def _surface_defect_terms(html: str) -> set[str]:
    """Terms that did NOT earn publication: confirmed defect or pending review."""
    return {
        term
        for term, statuses in _surface_statuses(html).items()
        if statuses - {LEGITIMATE}
    }


def _surface_pending_terms(html: str) -> set[str]:
    return {
        term
        for term, statuses in _surface_statuses(html).items()
        if PENDING in statuses
    }


# The exact shapes that shipped. A detector that stops recognising them has
# stopped working, so they are checked on the same code path the gate runs.
COUNTER_CASES = (
    (
        "jargao-comercial-em-corpo-metadado-noindex-e-estado-dinamico",
        lambda: {
            "backlog", "feeling", "hub", "sla", "input", "check", "card",
            "ready", "briefing", "b2g", "score-honesto",
        }.issubset(
            _surface_defect_terms(
                '<meta name="robots" content="noindex"><meta name="description" '
                'content="Backlog, feeling e Hub"><main>SLA, input, check, card e briefing. '
                'Consultoria B2G com score honesto.</main><template>READY</template>'
                '<script>status.textContent = "backlog";</script>'
            )
        ),
    ),
    (
        "siglas-definidas-em-portugues-passam",
        lambda: not _surface_defect_terms(
            "<main><p>B2G (business-to-government, relação entre empresas e o poder público).</p>"
            "<p>Acordo de nível de serviço (SLA).</p></main>"
        ).intersection({"b2g", "sla"}),
    ),
    (
        "b2g-em-jobtitle-jsonld-reprova",
        lambda: "b2g" in _surface_defect_terms(
            '<script type="application/ld+json">'
            '{"@context":"https://schema.org","@type":"Person",'
            '"name":"Responsável técnico","jobTitle":"Engenheiro e consultor B2G"}'
            '</script>'
        ),
    ),
    (
        "nome-externo-em-objeto-publico-passa",
        lambda: "hub" not in _surface_defect_terms(
            "<p>Objeto da fonte oficial: Contratação da empresa Iguaçu HUB para prestação de serviços técnicos.</p>"
        ),
    ),
    (
        "chaves-e-url-internas-nao-sao-traduzidas",
        lambda: not _surface_defect_terms(
            '<a href="/diagnostico-b2g-360/">Diagnóstico de obras públicas</a>'
            '<script type="application/json">{"proof_state":"READY","input":"ok"}</script>'
        ),
    ),
    (
        "option-label-igual-ao-valor",
        lambda: _option_pairs_rejected(
            '<select><option value="UNKNOWN">UNKNOWN</option></select>'
        ),
    ),
    (
        "option-label-em-portugues-passa",
        lambda: not _option_pairs_rejected(
            '<select><option value="UNKNOWN">Ainda não definido</option>'
            '<option value="SC">SC</option></select>'
        ),
    ),
    (
        "codigo-interno-concatenado",
        lambda: bool(
            RENDERED_INTERNAL_CODE.search(
                'add(wrap, "p", "", "Oferta candidata: " + domain.candidate_offer);'
            )
        ),
    ),
    (
        "frase-em-portugues-passa",
        lambda: not RENDERED_INTERNAL_CODE.search(
            'add(wrap, "p", "", "Este ponto pede uma leitura técnica antes da decisão.");'
        ),
    ),
    (
        "estado-de-publicacao-detectado",
        lambda: bool(
            re.search(FORBIDDEN_EXACT_CASE["estado-de-publicacao"], "Oferta publicada · PUBLISHED")
        ),
    ),
    (
        "portugues-corrente-nao-e-estado",
        lambda: not re.search(
            FORBIDDEN_EXACT_CASE["estado-de-publicacao"], "Oferta publicada em agosto"
        ),
    ),
    (
        "acervo-tecnico-e-legitimo",
        lambda: legitimate_reason(
            "acervo", "O edital exige acervo técnico compatível com a parcela relevante."
        )
        == "qualificacao_tecnica_da_empresa_em_licitacao",
    ),
    (
        "acervo-editorial-e-bastidor",
        lambda: legitimate_reason("acervo", "Consulte nosso acervo editorial interno.")
        is None,
    ),
    (
        "acervo-pendente-nao-e-legitimado-por-fallback",
        lambda: legitimate_reason("acervo", "Acervo pendente de revisão interna.") is None,
    ),
    (
        "empresa-sozinha-nao-prova-contexto-do-acervo",
        lambda: legitimate_reason("acervo", "O acervo da empresa segue pendente.") is None,
    ),
    (
        "valorizacao-fabricada-do-acervo-nao-e-legitima",
        lambda: legitimate_reason("acervo", "Nosso acervo é o melhor do mercado.") is None,
    ),
    (
        "aderencia-tecnica-e-legitima",
        lambda: legitimate_reason(
            "aderencia", "A aderência do objeto ao escopo e à capacidade será conferida."
        )
        == "compatibilidade_tecnica_entre_objeto_escopo_capacidade_ou_referencia",
    ),
    (
        "aderencia-ao-gate-e-bastidor",
        lambda: legitimate_reason(
            "aderencia", "A aderência ao gate editorial será conferida."
        )
        is None,
    ),
    (
        "enquadramento-legal-e-legitimo",
        lambda: legitimate_reason(
            "enquadramento", "O enquadramento legal do aditivo muda a memória de cálculo."
        )
        == "classificacao_tecnica_legal_do_fato_obrigacao_ou_instrumento",
    ),
    (
        "enquadramento-contextual-da-entrega-e-legitimo",
        lambda: legitimate_reason(
            "enquadramento",
            "A narrativa vai do enquadramento até as decisões documentadas.",
        )
        == "contextualizacao_do_problema_e_premissas_na_entrega",
    ),
    (
        "pedido-de-enquadramento-e-bastidor",
        lambda: legitimate_reason(
            "enquadramento", "Envie um pedido de enquadramento pelo formulário."
        )
        is None,
    ),
    (
        "enquadramento-comercial-nao-e-tecnico",
        lambda: legitimate_reason(
            "enquadramento", "Peça um enquadramento comercial para ver se atendemos."
        ) is None,
    ),
    (
        "vertical-fisica-e-legitima",
        lambda: legitimate_reason(
            "vertical", "Sinalização viária horizontal e vertical."
        )
        == "orientacao_fisica_no_objeto_transcrito",
    ),
    (
        "sinalizacao-vertical-em-objeto-publico-e-legitima",
        lambda: legitimate_reason(
            "vertical",
            "Objeto: contratação de serviços de sinalização vertical e fornecimento de dispositivos de sinalização viária.",
        )
        == "orientacao_fisica_em_sinalizacao_viaria",
    ),
    (
        "vertical-comercial-e-bastidor",
        lambda: legitimate_reason("vertical", "Esta é nossa vertical comercial.") is None,
    ),
    (
        "vertical-b2g-de-marketing-continua-reprovada",
        lambda: "vertical" in _surface_defect_terms(
            "<main><p>Nossa vertical B2G organiza a oferta comercial.</p></main>"
        ),
    ),
    (
        "sinalizacao-nao-excusa-vertical-comercial-na-mesma-sentenca",
        lambda: "vertical" in _surface_defect_terms(
            "<main><p>Objeto: sinalização viária vertical, apresentado pela nossa vertical comercial.</p></main>"
        ),
    ),
    (
        "orientacao-fisica-nao-excusa-vertical-comercial-na-mesma-sentenca",
        lambda: legitimate_reason(
            "vertical", "Objeto horizontal e vertical, apresentado pela vertical comercial."
        ) is None,
    ),
    # --- FALSO POSITIVO: objeto transcrito do PNCP -------------------------
    # Texto literal do objeto publicado em
    # data/live_intelligence/official/opportunities/23773012000154-1-000109/2026.json
    # e /...-000111/2026.json, reproduzido em 8 superfícies humanas por página.
    # A regra antiga só conhecia "horizontal e vertical" e reprovava a fonte.
    (
        "objeto-pncp-com-sinalizacao-vertical-e-legitimo",
        lambda: legitimate_reason(
            "vertical",
            "REGISTRO DE PREÇOS PARA FUTURA E EVENTUAL CONTRATAÇÃO DE EMPRESA "
            "ESPECIALIZADA NA PRESTAÇÃO DE SERVIÇOS DE SINALIZAÇÃO VERTICAL E NO "
            "FORNECIMENTO DE MATERIAIS E DISPOSITIVOS DE SINALIZAÇÃO VIÁRIA",
        )
        == "orientacao_fisica_em_sinalizacao_viaria",
    ),
    (
        "uso-geometrico-ou-material-e-legitimo",
        lambda: all(
            legitimate_reason("vertical", frase)
            for frase in (
                "Armadura vertical do pilar conforme projeto estrutural.",
                "A junta vertical entre painéis recebe selagem elástica.",
                "Deslocamento vertical medido no eixo da viga.",
            )
        ),
    ),
    (
        "vertical-de-servicos-nao-recebe-aprovacao-automatica",
        lambda: legitimate_reason("vertical", "Conheça nossa vertical de serviços.") is None
        and classify_occurrence(
            "vertical", "Conheça nossa vertical de serviços."
        )[0] == DEFECT,
    ),
    (
        # BYPASS MEDIDO: a vizinhança de um substantivo físico aprovava
        # "A vertical de sinalização é nossa aposta de mercado." como
        # orientação física. O papel gramatical é o discriminador: determinante
        # + "vertical" + complemento é recorte de segmento, não direção.
        "vertical-substantivo-de-segmento-nao-e-orientacao-fisica",
        lambda: all(
            legitimate_reason("vertical", frase) is None
            for frase in (
                "A vertical de sinalização é nossa aposta de mercado.",
                "Atendemos a vertical de drenagem e a vertical de pavimentação.",
            )
        )
        and legitimate_reason("vertical", "Serviços de sinalização vertical em rodovia.")
        == "orientacao_fisica_em_sinalizacao_viaria",
    ),
    (
        # BYPASS MEDIDO: a classificação lia só a versão espaçada do trecho, e
        # "<b>ader</b>ência comercial" ficava invisível para a regra de bastidor
        # e visível para a de fundamento — era classificado legítimo e PUBLICAVA.
        "marcacao-inline-nao-muda-o-veredito",
        lambda: [
            classify_occurrence_views("aderencia", detect, context)[0]
            for html in (
                "<main><p>Triagem de <b>ader</b>ência comercial do objeto.</p></main>",
                "<main><p>Triagem de aderência comercial do objeto.</p></main>",
            )
            for detect, context in classified_sentences(html)
        ]
        == [DEFECT, DEFECT],
    ),
    # --- FALSO NEGATIVO: aprovação por omissão em legitimate_reason -------
    # Antes bastava não coincidir com a lista curta de expressões internas
    # para a ocorrência ser declarada legítima. Qualquer frase nova passava.
    (
        "aderencia-sem-fundamento-positivo-fica-pendente",
        lambda: legitimate_reason("aderencia", "A aderência será conferida depois.") is None
        and classify_occurrence(
            "aderencia", "A aderência será conferida depois."
        )[0] == PENDING,
    ),
    (
        "triagem-de-aderencia-comercial-nao-recebe-aprovacao-automatica",
        lambda: legitimate_reason(
            "aderencia",
            "Faça a triagem de aderência comercial antes de solicitar orçamento.",
        ) is None
        and classify_occurrence(
            "aderencia",
            "Faça a triagem de aderência comercial antes de solicitar orçamento.",
        )[0] == DEFECT,
    ),
    (
        "criterios-de-habilitacao-permanecem-legitimos",
        lambda: legitimate_reason(
            "aderencia",
            "Critérios de habilitação: acervo técnico e aderência de objeto.",
        )
        == "compatibilidade_tecnica_entre_objeto_escopo_capacidade_ou_referencia"
        and legitimate_reason(
            "acervo",
            "Critérios de habilitação: acervo técnico e aderência de objeto.",
        )
        == "qualificacao_tecnica_da_empresa_em_licitacao",
    ),
    (
        "acento-nao-muda-o-resultado-da-aderencia",
        lambda: classify_occurrence("aderencia", "A aderencia sera conferida depois.")[0]
        == classify_occurrence("aderencia", "A aderência será conferida depois.")[0],
    ),
    # --- UNIDADE DE CLASSIFICAÇÃO: o trecho ------------------------------
    (
        "marcacao-inline-nao-parte-o-termo",
        lambda: "aderencia" in _surface_defect_terms(
            "<main><p>Faça a triagem de <strong>ader</strong>ência comercial "
            "antes de solicitar orçamento.</p></main>"
        ),
    ),
    (
        "titulo-vizinho-nao-fundamenta-o-trecho-ao-lado",
        lambda: "aderencia" in _surface_pending_terms(
            "<main><h2>Aderência</h2><p>Habilitação e acervo técnico exigidos "
            "no edital.</p></main>"
        ),
    ),
    (
        "metadado-nao-herda-fundamento-do-corpo",
        lambda: "aderencia" in _surface_pending_terms(
            '<meta name="description" content="Aderência"><main><p>Habilitação e '
            "acervo técnico exigidos no edital.</p></main>"
        ),
    ),
    (
        "citacao-tecnica-nao-legitima-o-botao-comercial-ao-lado",
        lambda: "vertical" in _surface_defect_terms(
            "<main><p>Objeto: serviços de sinalização vertical</p>"
            '<a class="btn" href="/contato/">Fale com nossa vertical comercial</a></main>'
        ),
    ),
    (
        "rotulo-e-valor-do-mesmo-campo-sao-um-trecho",
        lambda: _surface_statuses(
            "<main><table><tr><th>Aderência 30%</th><td>Mix de tipologia</td>"
            "<td>Quanto do histórico do órgão cai nas tipologias que a empresa "
            "executa.</td></tr></table></main>"
        ).get("aderencia") == {LEGITIMATE},
    ),
    (
        "linhas-diferentes-nao-fundamentam-uma-a-outra",
        lambda: "aderencia" in _surface_pending_terms(
            "<main><table><tr><th>Tipologia</th><td>Habilitação e objeto do "
            "edital.</td></tr><tr><th>Aderência</th><td>86,0</td></tr></table></main>"
        ),
    ),
    (
        "fonte-fiel-passa-e-jargao-autoral-reprova-na-mesma-pagina",
        lambda: _surface_statuses(
            "<main><p>Objeto declarado na fonte: PRESTAÇÃO DE SERVIÇOS DE "
            "SINALIZAÇÃO VERTICAL E FORNECIMENTO DE DISPOSITIVOS DE SINALIZAÇÃO "
            "VIÁRIA</p><p>Esta é nossa vertical comercial.</p></main>"
        ).get("vertical") == {LEGITIMATE, DEFECT},
    ),
)


def _option_pairs_rejected(html: str) -> bool:
    return any(
        value and INTERNAL_SHAPED_VALUE.match(value) and label.strip() == value
        for value, label in select_options(html)
    )


def selftest_failures() -> list[str]:
    return [
        f"contra-exemplo '{name}' deixou de reprovar: o detector parou de funcionar"
        for name, check in COUNTER_CASES
        if not check()
    ]


def failures(
    root: Path | None = None, *, require_artifact: bool = False
) -> list[str]:
    classified = classify_scan(root, require_artifact=require_artifact)
    found = classified["defects"]
    out: list[str] = []
    out.extend(selftest_failures())
    out.extend(option_label_failures(root))
    out.extend(rendered_internal_code_failures(root))
    pending = classified["pending_review"]
    for rel, counts in sorted(classified["confirmed_defects"].items()):
        for term, n in sorted(counts.items()):
            out.append(
                f"{rel}: '{term}' x{n} — uso de controle/bastidor sem fundamento técnico"
            )
    for rel, counts in sorted(pending.items()):
        for term, n in sorted(counts.items()):
            out.append(
                f"{rel}: '{term}' x{n} — PENDENTE DE REVISÃO: sem fundamento técnico "
                "positivo no próprio trecho e sem marcador de bastidor; exige decisão "
                "editorial explícita, não aprovação automática"
            )
    assert sum(sum(c.values()) for c in found.values()) == (
        sum(sum(c.values()) for c in classified["confirmed_defects"].values())
        + sum(sum(c.values()) for c in pending.values())
    ), "o conjunto bloqueante precisa ser exatamente defeitos + pendentes"
    return out


def test_control_vocabulary_does_not_reach_the_visitor() -> None:
    bad = failures()
    assert not bad, "vocabulário interno na superfície pública:\n  " + "\n  ".join(bad)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--require-artifact", action="store_true")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--record", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.record:
        print("REFUSED: the 2026-09-09 classified gate cannot record open debt", file=sys.stderr)
        return 2
    try:
        bad = failures(args.root, require_artifact=args.require_artifact)
        classified = classify_scan(args.root, require_artifact=args.require_artifact)
    except ValueError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    found = classified["all"]
    defects = classified["defects"]
    legitimate = classified["legitimate"]
    pending = classified["pending_review"]
    confirmed = classified["confirmed_defects"]
    total = sum(sum(c.values()) for c in found.values())
    defect_total = sum(sum(c.values()) for c in defects.values())
    confirmed_total = sum(sum(c.values()) for c in confirmed.values())
    pending_total = sum(sum(c.values()) for c in pending.values())
    legitimate_total = sum(sum(c.values()) for c in legitimate.values())
    by_term: dict[str, int] = {}
    for counts in found.values():
        for t, n in counts.items():
            by_term[t] = by_term.get(t, 0) + n
    report = {
        "schema": "confenge.control-vocabulary-classification/v1",
        "ok": not bad,
        "root": str(args.root.resolve()),
        "matched_routes": len(found),
        "matched_occurrences": total,
        "legitimate_occurrences": legitimate_total,
        "defect_routes": len(defects),
        "defect_occurrences": defect_total,
        "confirmed_defect_routes": len(confirmed),
        "confirmed_defect_occurrences": confirmed_total,
        "pending_review_routes": len(pending),
        "pending_review_occurrences": pending_total,
        "legitimate_reasons": classified["legitimate_reasons"],
        "classifications": classified["classifications"],
        "defect_examples": classified["defect_examples"],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(
        f"CLASSIFIED: {len(found)} routes, {total} occurrences; "
        f"legitimate={legitimate_total}; blocking={defect_total} on {len(defects)} routes "
        f"(defects={confirmed_total}, pendentes de revisão={pending_total})"
    )
    for t, n in sorted(by_term.items(), key=lambda kv: -kv[1]):
        print(f"  {t:16} {n:5}")
    if bad:
        print(f"\nFAIL ({len(bad)}):")
        for line in bad:
            print("  " + line)
        return 1
    print("\nPASS: every occurrence classified and no visitor-facing control vocabulary defect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
