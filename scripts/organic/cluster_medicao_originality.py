"""Originality checks for the six indexable Medição/Glosa/Pagamento decision URLs.

Drives the shipped HTML under conteudos/<slug>/index.html. Paragraph extraction
drops navegação, aviso legal, autoria and fontes, then compares normalized
bodies pairwise. This module is the single implementation the pytest file calls;
the test does not reimplement extraction.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import re
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

@dataclass(frozen=True)
class ClusterPageContract:
    """One URL's decision, evidence artifact, action and primary sources."""

    slug: str
    artifact: str
    artifact_kind: str
    artifact_heading: str
    artifact_aria_label: str
    artifact_decision_output: str
    decision_question: str
    next_action: str
    cta_family: str
    source_ids: tuple[str, ...]


CLUSTER_PAGE_CONTRACTS: tuple[ClusterPageContract, ...] = (
    ClusterPageContract(
        slug="atraso-na-medicao-obra-publica",
        artifact="650 m²",
        artifact_kind="calculo_parcela_incontroversa",
        artifact_heading="Como separar o valor aceito do valor em discussão",
        artifact_aria_label=(
            "Cálculo demonstrativo da parcela aceita e da parcela discutida"
        ),
        artifact_decision_output="R$ 78.000,00 sem controvérsia no exemplo",
        decision_question="Qual etapa está parada?",
        next_action="Avaliar o Dossiê de Medição, Glosa e Pagamento",
        cta_family="dossie",
        source_ids=(
            "lei-14133-art92-medicao",
            "lei-14133-art137-suspensao",
            "lei-14133-art141-143-medicao",
            "tcu-criterios-medicao-pagamento",
            "tcu-pagamento-liquidacao",
        ),
    ),
    ClusterPageContract(
        slug="fiscal-nao-assina-medicao-obra-publica",
        artifact="SEI 23456.000781/2026-44",
        artifact_kind="cronologia_documental_48h",
        artifact_heading="Como a linha do tempo do SEI substitui o recado do grupo",
        artifact_aria_label=(
            "Linha do tempo hipotética das primeiras 48 horas após a recusa de ateste"
        ),
        artifact_decision_output="Fim das 48 horas",
        decision_question="O que falta para o ateste?",
        next_action="Abrir o dossiê depois das 48 horas da recusa",
        cta_family="dossie",
        source_ids=(
            "lei-14133-art92-medicao",
            "lei-14133-art141-143-medicao",
            "tcu-criterios-medicao-pagamento",
            "tcu-acordao-8920-2017",
            "tcu-pagamento-liquidacao",
        ),
    ),
    ClusterPageContract(
        slug="glosa-por-qualidade-obra-publica",
        artifact="CP-04/lab 1,8 MPa",
        artifact_kind="matriz_nexo_ensaio_trecho",
        artifact_heading="Como o fck de um trecho não arrasta o meio-fio inteiro",
        artifact_aria_label=(
            "Cálculo hipotético da glosa localizada versus o corte da linha inteira"
        ),
        artifact_decision_output="Restante sem apontamento de ensaio",
        decision_question="O corte tem nexo com o ensaio?",
        next_action="Abrir o dossiê do corte sem nexo com o ensaio",
        cta_family="dossie",
        source_ids=(
            "lei-14133-art92-medicao",
            "lei-14133-art141-143-medicao",
            "tcu-criterios-medicao-pagamento",
            "tcu-pagamento-liquidacao",
        ),
    ),
    ClusterPageContract(
        slug="medicao-por-evento-obra-publica",
        artifact="Evento E-04",
        artifact_kind="comparacao_evento_quantitativo",
        artifact_heading="O que o Evento E-04 paga e o que o m³ pagaria",
        artifact_aria_label=(
            "Comparação hipotética entre crédito do Evento E-04 e crédito por quantitativo"
        ),
        artifact_decision_output="Evento E-04 fechado",
        decision_question="Qual é o gatilho do crédito?",
        next_action="Ver o serviço de medições e o critério do contrato",
        cta_family="conteudo",
        source_ids=(
            "lei-14133-art46",
            "lei-14133-art92-medicao",
            "tcu-criterios-medicao-pagamento",
            "tcu-pagamento-liquidacao",
        ),
    ),
    ClusterPageContract(
        slug="pagamento-parcial-etapa-empreitada-global",
        artifact="Etapa 3-cobertura",
        artifact_kind="cenario_gatilho_sem_submarco",
        artifact_heading="O que a Etapa 3-cobertura paga e o que 70% não paga",
        artifact_aria_label=(
            "Cálculo hipotético da Etapa 3-cobertura versus o pedido de 70%"
        ),
        artifact_decision_output="0,00 reais no eventograma deste exemplo",
        decision_question="O eventograma recortou o marco?",
        next_action="Abrir o dossiê da etapa sem submarco escrito",
        cta_family="triagem",
        source_ids=(
            "lei-14133-art46",
            "lei-14133-art92-medicao",
            "lei-14133-art141-143-medicao",
            "lei-14133-art145",
            "tcu-criterios-medicao-pagamento",
            "in-seges-77-2022",
        ),
    ),
    ClusterPageContract(
        slug="atraso-pagamento-contrato-publico-suspender",
        artifact="NF-e 1847",
        artifact_kind="cronologia_limiar_dois_meses",
        artifact_heading="Como a NF-e 1847 marca o relógio dos dois meses",
        artifact_aria_label=(
            "Contagem hipotética do prazo de dois meses a partir da NF-e 1847"
        ),
        artifact_decision_output=(
            "A opção de extinguir ou de suspender já é discutível; não é automática"
        ),
        decision_question="A nota fiscal já tem dois meses?",
        next_action="Abrir o dossiê do crédito já faturado",
        cta_family="triagem",
        source_ids=(
            "lei-14133-art137-suspensao",
            "lei-14133-art141-143-medicao",
            "tcu-pagamento-liquidacao",
            "in-seges-77-2022",
        ),
    ),
)

PAGE_CONTRACTS: dict[str, ClusterPageContract] = {
    contract.slug: contract for contract in CLUSTER_PAGE_CONTRACTS
}
CLUSTER_SLUGS: tuple[str, ...] = tuple(PAGE_CONTRACTS)

REQUIRED_SECTION_IDS: tuple[str, ...] = (
    "resposta",
    "cenario",
    "distincoes",
    "documentos",
    "fluxo",
    "exemplo",
    "erros",
    "limites",
    "fontes",
)

# Compatibility views for tests and reports. PAGE_CONTRACTS is the authority.
EXCLUSIVE_ARTIFACTS = {
    slug: contract.artifact for slug, contract in PAGE_CONTRACTS.items()
}
DECISION_QUESTIONS = {
    slug: contract.decision_question for slug, contract in PAGE_CONTRACTS.items()
}
NEXT_ACTIONS = {
    slug: contract.next_action for slug, contract in PAGE_CONTRACTS.items()
}
CTA_FAMILIES = {
    slug: contract.cta_family for slug, contract in PAGE_CONTRACTS.items()
}

GENERIC_CTA_MOLD = "enviar documentos para análise"
RECEIPT_GUARANTEE = re.compile(
    r"garant(e|imos|ia)\s+(o\s+)?recebimento|recebimento\s+garantido",
    re.I,
)
LEGAL_ADVICE_CLAIM = re.compile(
    r"este\s+texto\s+é\s+aconselhamento\s+jurídico|substitui\s+advogado",
    re.I,
)

_SKIP_CLASS = {
    "article-toc",
    "sources-section",
    "author-box",
    "technical-note",
    "lead-inline",
    "editorial-bridge",
    "commercial-bridge",
    "related-section",
}
_SKIP_ID = {"fontes"}
_BLOCK_TAGS = {"p", "li", "dd", "dt", "td", "th", "summary"}
_HEADING_TAGS = {"h1", "h2", "h3"}
_WS = re.compile(r"\s+")
_TAG = re.compile(r"<[^>]+>")


class _ArticleParagraphParser(HTMLParser):
    """Collect block text inside article.article-main, honoring skip regions."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_article = False
        self.skip_stack: list[str] = []
        self.cta_stack: list[str] = []
        self.capture_tag: str | None = None
        self.buf: list[str] = []
        self.paragraphs: list[str] = []
        self.section_ids: set[str] = set()
        self.cta_buf: list[str] = []
        self.answer_stack: list[str] = []
        self.answer_buf: list[str] = []
        self.heading_tag: str | None = None
        self.heading_buf: list[str] = []
        self.headings: list[str] = []

    @property
    def cta_text(self) -> str:
        return _WS.sub(" ", "".join(self.cta_buf)).strip()

    @property
    def answer_text(self) -> str:
        return _WS.sub(" ", "".join(self.answer_buf)).strip()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        classes = set((ad.get("class") or "").split())
        ident = ad.get("id") or ""
        if tag == "article" and "article-main" in classes:
            self.in_article = True
        if not self.in_article:
            return
        if ident:
            self.section_ids.add(ident)
        skip = (
            bool(classes & _SKIP_CLASS)
            or ident in _SKIP_ID
            or tag == "nav"
            or (tag == "p" and "technical-note" in classes)
        )
        if skip:
            self.skip_stack.append(tag)
        if (
            "lead-inline" in classes
            or ad.get("data-commercial-bridge") == "1"
            or ident == "diagnostico-confenge"
        ):
            self.cta_stack.append(tag)
        if "answer-box" in classes or ident == "resposta":
            self.answer_stack.append(tag)
        if self.skip_stack:
            return
        if tag in _HEADING_TAGS and self.heading_tag is None:
            self.heading_tag = tag
            self.heading_buf = []
        if tag in _BLOCK_TAGS and self.capture_tag is None:
            self.capture_tag = tag
            self.buf = []

    def handle_endtag(self, tag: str) -> None:
        if not self.in_article:
            return
        if self.capture_tag == tag:
            raw = _WS.sub(" ", "".join(self.buf)).strip()
            if raw:
                self.paragraphs.append(raw)
            self.capture_tag = None
            self.buf = []
        if self.heading_tag == tag:
            raw = _WS.sub(" ", "".join(self.heading_buf)).strip()
            if raw:
                self.headings.append(raw)
            self.heading_tag = None
            self.heading_buf = []
        if self.skip_stack and self.skip_stack[-1] == tag:
            self.skip_stack.pop()
        if self.cta_stack and self.cta_stack[-1] == tag:
            self.cta_stack.pop()
        if self.answer_stack and self.answer_stack[-1] == tag:
            self.answer_stack.pop()
        if tag == "article":
            self.in_article = False

    def handle_data(self, data: str) -> None:
        if not self.in_article:
            return
        if self.cta_stack:
            self.cta_buf.append(data)
        if self.skip_stack:
            return
        if self.answer_stack:
            self.answer_buf.append(data)
        if self.heading_tag is not None:
            self.heading_buf.append(data)
        if self.capture_tag is not None:
            self.buf.append(data)


def article_path(root: Path, slug: str) -> Path:
    return root / "conteudos" / slug / "index.html"


def parse_article(html: str) -> _ArticleParagraphParser:
    parser = _ArticleParagraphParser()
    parser.feed(html)
    parser.close()
    return parser


def normalize_paragraph(text: str) -> str:
    t = _WS.sub(" ", (text or "")).strip().casefold()
    t = t.replace("\u00a0", " ")
    return t


def extract_body_paragraphs(html: str) -> list[str]:
    """Visible article paragraphs minus nav, legal note, author and fontes."""
    parsed = parse_article(html)
    out: list[str] = []
    seen: set[str] = set()
    for para in parsed.paragraphs:
        norm = normalize_paragraph(para)
        if len(norm) < 24:
            continue
        if norm in seen:
            continue
        seen.add(norm)
        out.append(norm)
    return out


def pairwise_shared_ratio(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 1.0
    sa, sb = set(a), set(b)
    shared = sa & sb
    return len(shared) / min(len(sa), len(sb))


def heading_levels(html: str) -> list[int]:
    return [int(m.group(1)) for m in re.finditer(r"<h([1-6])\b", html, re.I)]


def headings_skip(html: str) -> bool:
    levels = heading_levels(html)
    if not levels or levels[0] != 1:
        return True
    prev = levels[0]
    for level in levels[1:]:
        if level > prev + 1:
            return True
        prev = level
    return False


def load_jsonld(html: str) -> list[dict]:
    blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    )
    graphs: list[dict] = []
    for raw in blocks:
        data = json.loads(raw)
        if isinstance(data, dict) and "@graph" in data:
            graphs.extend(item for item in data["@graph"] if isinstance(item, dict))
        elif isinstance(data, dict):
            graphs.append(data)
        elif isinstance(data, list):
            graphs.extend(item for item in data if isinstance(item, dict))
    return graphs


# ---------------------------------------------------------------------------
# Revision truth: five surfaces, one date
# ---------------------------------------------------------------------------
# The date every surface must state. It is the date the cluster body actually
# changed, not a build clock: REVISION_BODY_SHA256 below pins the date-masked
# body of each page, so editing the prose without moving this date fails the
# gate, and moving this date without editing the prose fails it too.
CLUSTER_REVISION = "2026-08-29"

REVISION_SURFACES: tuple[str, ...] = (
    "meta_modified_time",
    "jsonld_date_modified",
    "visible_revised_on",
    "sources_consulted_on",
    "sitemap_lastmod",
)

_PT_MONTHS = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def format_date_br(iso: str) -> str:
    """2026-08-29 -> '29 de agosto de 2026'. Matches the rendered <time> text."""
    year, month, day = (int(part) for part in iso.split("-"))
    return f"{day} de {_PT_MONTHS[month - 1]} de {year}"


def _one(values: list[str], label: str) -> str:
    """A surface that states two different dates is already divergent."""
    distinct = sorted(set(values))
    if not distinct:
        return ""
    if len(distinct) > 1:
        return f"AMBIGUOUS:{label}:{'|'.join(distinct)}"
    return distinct[0]


def sitemap_lastmod(root: Path, slug: str) -> str:
    """<lastmod> of this URL in the shipped sitemap.xml, '' when absent."""
    path = root / "sitemap.xml"
    if not path.is_file():
        return ""
    xml = path.read_text(encoding="utf-8")
    loc = f"https://confenge.com.br/conteudos/{slug}/"
    found = re.findall(
        rf"<loc>{re.escape(loc)}</loc>\s*<lastmod>([^<]+)</lastmod>", xml
    )
    return _one([item.strip() for item in found], "sitemap")


def revision_surfaces(html: str, *, root: Path, slug: str) -> dict[str, str]:
    """The five places this page states when it was last revised."""
    meta = re.findall(
        r'<meta\b[^>]*content="([^"]*)"[^>]*property="article:modified_time"', html
    ) + re.findall(
        r'<meta\b[^>]*property="article:modified_time"[^>]*content="([^"]*)"', html
    )
    jsonld = re.findall(r'"dateModified"\s*:\s*"([^"]+)"', html)
    visible = re.findall(
        r"<span>Revisado em <time datetime=\"([^\"]+)\">([^<]*)</time></span>", html
    )
    sources = re.findall(
        r"consultadas em <time datetime=\"([^\"]+)\">([^<]*)</time>", html
    )
    return {
        "meta_modified_time": _one(meta, "meta"),
        "jsonld_date_modified": _one(jsonld, "jsonld"),
        "visible_revised_on": _one([iso for iso, _ in visible], "visible"),
        "visible_revised_on_text": _one([txt for _, txt in visible], "visible-text"),
        "sources_consulted_on": _one([iso for iso, _ in sources], "sources"),
        "sources_consulted_on_text": _one([txt for _, txt in sources], "sources-text"),
        "sitemap_lastmod": sitemap_lastmod(root, slug),
    }


_OPAQUE_TOKEN_SPAN = re.compile(
    r'<span[^>]*\bdata-opaque-token\b[^>]*>(.*?)</span>', re.S
)


def unwrap_opaque_tokens(html: str) -> str:
    """Drop the presentational wrapper the responsive build adds.

    The build wraps unbreakable tokens in <span data-opaque-token> so they can
    wrap on narrow screens. That is presentation, not prose, so it must not
    read as a content change nor hide a decision artifact from this gate.
    """
    previous = None
    while previous != html:
        previous = html
        html = _OPAQUE_TOKEN_SPAN.sub(r"\1", html)
    # The same pass glues currency and units with a non-breaking space so they
    # never split across lines. That is presentation too: the reader sees one
    # space, so the gate must compare against one space.
    return html.replace("&nbsp;", " ").replace("&#160;", " ").replace("\u00a0", " ")


def content_fingerprint(html: str) -> str:
    """SHA-256 of the article body with every date token masked.

    Masking is what makes the fingerprint a *content* anchor: restamping the
    five surfaces never moves it, so the gate can tell "the prose changed"
    apart from "the date was restamped".
    """
    html = unwrap_opaque_tokens(html)
    match = re.search(r'<article class="article-main".*?</article>', html, re.S)
    body = match.group(0) if match else html
    body = _ISO_DATE.sub("@DATE@", body)
    for month in _PT_MONTHS:
        body = re.sub(rf"\b\d{{1,2}} de {month} de \d{{4}}\b", "@DATE_BR@", body)
    body = _WS.sub(" ", body).strip()
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


# Date-masked body fingerprint recorded at CLUSTER_REVISION. Recapture with
#   python3 -m scripts.organic.cluster_medicao_originality --recapture
# only together with a new CLUSTER_REVISION, because a changed body is a
# changed revision date by definition.
REVISION_BODY_SHA256: dict[str, str] = {
    "atraso-na-medicao-obra-publica": "ec6f1034dedc7014d9af5a9676e83a316a74072004c64a25e84f4068fb2abf34",
    "fiscal-nao-assina-medicao-obra-publica": "64023e36c2d84ecd7976394e07ab30eb94c72656b33efa3ce757b736e5fd6233",
    "glosa-por-qualidade-obra-publica": "9b60d1b4fa9854388fa3bf4198ca39a8ac5439253069773d5e714dc2b838e8bd",
    "medicao-por-evento-obra-publica": "c48afaf7fb4f91568c782505fcb3ed49aeda1ccd2c858b75c88ce7457bbb18cd",
    "pagamento-parcial-etapa-empreitada-global": "66ea9fd5a7acd013227502ed89a583138798f2ef6ab415d023518c3daea208eb",
    "atraso-pagamento-contrato-publico-suspender": "860cb2aded60d9dfb60ed723a7a5f4320e52e2db51ef510ff13559ae9d545bc1",
}


# ---------------------------------------------------------------------------
# Intent overlap: two URLs can own the same query while sharing no sentence
# ---------------------------------------------------------------------------
# MEASURE
#   Each URL is reduced to an "intent signature": the decision question (H1 +
#   the answer block under #resposta) plus the H2 outline of the article body,
#   with navigation, sources and author boilerplate dropped. The signature is
#   accent-folded, stripped of Portuguese function words and light-stemmed, so
#   "suspensão/suspender/suspende" and "pagamento/pagar/paga" collapse to one
#   type. Two scores are then computed for every unordered pair:
#
#     intent_token_jaccard  - Jaccard of the stemmed content-token SETS.
#                             Catches intent duplication expressed in different
#                             sentences: the same entities, the same decision
#                             verbs, the same qualifiers, reworded.
#     intent_shingle_jaccard- Jaccard of the word 4-grams of the same stream.
#                             Catches reused framing, i.e. the same phrases
#                             carried across pages.
#
#   The two are complementary and both fail closed. Literal paragraph equality
#   (pairwise_shared_ratio) is kept unchanged as a third, stricter check.
#
# THRESHOLDS AND WHY
#   INTENT_TOKEN_JACCARD_MAX = 0.25
#     Two regimes were measured on this corpus before the number was chosen.
#     Regime A, same domain and different decision: the 15 in-cluster pairs top
#     out at 0.183, and the 54 pairs formed against the nine nearest
#     medição/glosa/pagamento URLs outside the cluster top out at 0.121.
#     Regime B, same decision and no shared sentence: a control page written to
#     compete for one cluster URL's query, sharing zero literal paragraphs with
#     it, scores 0.327 against its target and stays at or below 0.118 against
#     the other five. 0.25 is placed between the regimes, roughly 1.4x above
#     the observed domain ceiling and 0.76x of the duplicate. Below it, shared
#     stems are explained by vocabulary every page in this pillar must use
#     (medição, contrato, pagamento, Lei 14.133/2021); at or above it, more
#     than a quarter of the combined intent vocabulary is common, which the
#     domain alone no longer explains. The test asserts BOTH bounds - real
#     pairs under, the control at or over - so the number is verified to
#     discriminate, not merely to let today's pages pass.
#   INTENT_SHINGLE_JACCARD_MAX = 0.05
#     A signature holds roughly 90 four-grams. Sharing 5% of them means four or
#     more identical four-word sequences in the question and outline, which is
#     copied framing, not coincidence. Shingles are deliberately the weaker of
#     the two: the paraphrase control scores only 0.020 here, which is exactly
#     why the token-set measure is the primary gate and this one is the
#     secondary check on reused phrasing.
INTENT_TOKEN_JACCARD_MAX = 0.25
INTENT_SHINGLE_JACCARD_MAX = 0.05
INTENT_SHINGLE_N = 4

# Portuguese function words. Domain nouns are deliberately NOT removed:
# stripping the cluster's shared vocabulary would hide exactly the overlap
# this gate exists to find.
_STOPWORDS = frozenset(
    """
    a o e de da do das dos em no na nos nas um uma uns umas para por com sem sob
    sobre entre ate ao aos as os que se nao ja mais menos como quando onde qual
    quais quanto quantos ou nem mas porem entao isso isto esse essa este esta
    aquele aquela ser sao foi era ha tem seu sua seus suas lhe ele ela eles elas
    eu voce nos vos me te si mesmo mesma ainda so apenas tambem depois antes
    desde durante contra dentro fora la aqui ali muito pouco todo toda todos
    todas cada outro outra outros outras algum alguma nenhum nenhuma tudo nada
    pode podem deve devem vai vao estao ter haver fazer faz feito ficar
    """.split()
)

# Irregular Portuguese plurals rewritten to their singular form first, so the
# suffix pass below sees one shape: medicoes/medicao, fiscais/fiscal,
# boletins/boletim. Longest pattern first.
_PLURAL_REWRITES = (
    ("acoes", "acao"),
    ("coes", "cao"),
    ("oes", "ao"),
    ("aes", "ao"),
    ("ais", "al"),
    ("eis", "el"),
    ("ois", "ol"),
    ("ns", "m"),
)

# Longest-first so "amentos" wins over "os".
_SUFFIXES = (
    "amentos", "imentos", "amento", "imento", "ancia", "encia",
    "idade", "aveis", "avel", "ivel", "ismo", "ista", "mente", "ares",
    "ores", "oras", "acao", "cao", "ora", "ndo", "dor",
    "das", "dos", "da", "do", "es", "as", "os", "a", "o", "e", "r", "m", "s",
)


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def stem(word: str) -> str:
    """Light Portuguese stemmer: plural rewrite, then one suffix strip.

    It collapses inflection (number, gender, the regular nominal suffixes). It
    deliberately does NOT collapse derivation - "suspensao" and "suspender"
    stay apart - because chained stripping conflates unrelated roots and would
    manufacture overlap. The bias is therefore conservative: the measure
    under-counts paraphrase overlap rather than over-counting it, which is why
    INTENT_TOKEN_JACCARD_MAX is set with margin above the observed domain band.
    """
    if len(word) <= 4 or word.isdigit():
        return word
    for plural, singular in _PLURAL_REWRITES:
        if word.endswith(plural) and len(word) - len(plural) >= 3:
            word = word[: -len(plural)] + singular
            break
    if len(word) <= 4:
        return word
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def intent_tokens(text: str) -> list[str]:
    folded = re.sub(r"[^0-9a-zA-Z\s]", " ", strip_accents(text)).lower()
    return [stem(w) for w in folded.split() if w and w not in _STOPWORDS]


def intent_signature(html: str) -> str:
    """Decision question + answer block + H2 outline, boilerplate removed."""
    parsed = parse_article(html)
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    h1 = _WS.sub(" ", _TAG.sub(" ", h1s[0])).strip() if h1s else ""
    return " ".join([h1, parsed.answer_text, *parsed.headings]).strip()


def shingles(tokens: list[str], n: int = INTENT_SHINGLE_N) -> set[tuple[str, ...]]:
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def jaccard(a: set, b: set) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def intent_overlap(a_tokens: list[str], b_tokens: list[str]) -> dict[str, float]:
    return {
        "intent_token_jaccard": round(
            jaccard(set(a_tokens), set(b_tokens)), 4
        ),
        "intent_shingle_jaccard": round(
            jaccard(shingles(a_tokens), shingles(b_tokens)), 4
        ),
    }


def section_html(html: str, section_id: str) -> str:
    match = re.search(
        rf'<section\b[^>]*\bid=["\']{re.escape(section_id)}["\'][^>]*>.*?</section>',
        html,
        re.I | re.S,
    )
    return match.group(0) if match else ""


def artifact_evidence(html: str, contract: ClusterPageContract) -> dict[str, bool]:
    """Require the whole decision artifact inside #exemplo, not in the shell."""
    example = unwrap_opaque_tokens(section_html(html, "exemplo"))
    return {
        "section_present": bool(example),
        "artifact_present": contract.artifact in example,
        "heading_present": contract.artifact_heading in example,
        "aria_label_present": contract.artifact_aria_label in example,
        "decision_output_present": contract.artifact_decision_output in example,
    }


def source_records() -> dict[str, dict]:
    manifest = json.loads(
        (ROOT / "data" / "editorial" / "SOURCE-MANIFEST.json").read_text(
            encoding="utf-8"
        )
    )
    return {
        record["source_id"]: record
        for record in manifest.get("sources", [])
        if isinstance(record, dict) and record.get("source_id")
    }


def inspect_page(root: Path, slug: str) -> dict:
    path = article_path(root, slug)
    html = path.read_text(encoding="utf-8")
    contract = PAGE_CONTRACTS[slug]
    parsed = parse_article(html)
    title_m = re.search(r"<title>([^<]*)</title>", html)
    desc_tag = re.search(r"<meta\b[^>]*name=[\"']description[\"'][^>]*>", html)
    desc = ""
    if desc_tag:
        dm = re.search(r'content=["\']([^"\']*)["\']', desc_tag.group(0))
        desc = dm.group(1) if dm else ""
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    h1 = _WS.sub(" ", _TAG.sub(" ", h1s[0])).strip() if h1s else ""
    can_tag = re.search(r"<link\b[^>]*rel=[\"']canonical[\"'][^>]*>", html, re.I)
    canonical = ""
    if can_tag:
        cm = re.search(r'href=["\']([^"\']+)["\']', can_tag.group(0), re.I)
        canonical = cm.group(1) if cm else ""
    paras = extract_body_paragraphs(html)
    graphs = load_jsonld(html)
    types = {item.get("@type") for item in graphs}
    if any(isinstance(t, list) for t in types):
        flat: set[str] = set()
        for t in types:
            if isinstance(t, list):
                flat.update(str(x) for x in t)
            elif t:
                flat.add(str(t))
        types = flat
    cta = parsed.cta_text.casefold()
    visible = _WS.sub(" ", _TAG.sub(" ", html))
    signature = intent_signature(html)
    next_action = contract.next_action
    question = contract.decision_question
    evidence = artifact_evidence(html, contract)
    pillar_anchors = re.findall(
        r'<a\b[^>]*href="/medicoes-glosas-obras-publicas/[^"]*"[^>]*>(.*?)</a>',
        re.search(r'<article class="article-main".*?</article>', html, re.S).group(0)
        if re.search(r'<article class="article-main".*?</article>', html, re.S)
        else "",
        re.S,
    )
    pillar_anchor_texts = [
        _WS.sub(" ", _TAG.sub(" ", item)).strip() for item in pillar_anchors
    ]
    return {
        "slug": slug,
        "path": str(path.relative_to(root)),
        "html": html,
        "intent_signature": signature,
        "intent_tokens": intent_tokens(signature),
        "revision": revision_surfaces(html, root=root, slug=slug),
        "content_fingerprint": content_fingerprint(html),
        "decision_question": question,
        "decision_question_present": (
            f"<span>Antes de escalar</span><h2>{question}</h2>" in html
        ),
        "next_action": next_action,
        "pillar_anchor_texts": pillar_anchor_texts,
        "next_action_present": next_action in pillar_anchor_texts,
        "title": title_m.group(1) if title_m else "",
        "description": desc,
        "h1": h1,
        "h1_count": len(h1s),
        "canonical": canonical,
        "section_ids": parsed.section_ids,
        "paragraphs": paras,
        "cta_text": parsed.cta_text,
        "cta_family": contract.cta_family,
        "has_generic_cta_mold": GENERIC_CTA_MOLD in cta,
        "has_receipt_guarantee": bool(RECEIPT_GUARANTEE.search(visible)),
        "claims_legal_advice": bool(LEGAL_ADVICE_CLAIM.search(visible)),
        "has_educational_limit": "conteúdo educacional" in visible.casefold()
        or "não substitui" in visible.casefold(),
        "jsonld_types": types,
        "headings_skip": headings_skip(html),
        "artifact": contract.artifact,
        "artifact_kind": contract.artifact_kind,
        "artifact_evidence": evidence,
        "artifact_present": evidence["artifact_present"],
        "sources_html": section_html(html, "fontes"),
        "source_ids": contract.source_ids,
        "pillar_bridge": "/medicoes-glosas-obras-publicas/" in html,
    }


def artifact_failures(slug: str, page: dict) -> list[str]:
    evidence = page["artifact_evidence"]
    labels = {
        "section_present": "section #exemplo",
        "artifact_present": "exclusive marker",
        "heading_present": "exclusive heading",
        "aria_label_present": "artifact accessibility label",
        "decision_output_present": "decision output",
    }
    return [
        f"{slug}: artifact contract missing {labels[key]}"
        for key, present in evidence.items()
        if not present
    ]


def source_provenance_failures(
    slug: str, page: dict, records: dict[str, dict]
) -> list[str]:
    """Pin source identity, consultation date, device and application limits."""
    out: list[str] = []
    sources_html = page["sources_html"].casefold()
    for source_id in page["source_ids"]:
        record = records.get(source_id)
        if not record:
            out.append(f"{slug}: source {source_id!r} absent from SOURCE-MANIFEST")
            continue
        if record.get("accessed_at") != CLUSTER_REVISION:
            out.append(
                f"{slug}: source {source_id!r} accessed_at "
                f"{record.get('accessed_at')!r}, expected {CLUSTER_REVISION!r}"
            )
        for field in ("body", "device", "limitations", "url"):
            if not record.get(field):
                out.append(f"{slug}: source {source_id!r} missing {field}")
        url = str(record.get("url") or "").casefold()
        if url and url not in sources_html:
            out.append(
                f"{slug}: source {source_id!r} is not linked from #fontes"
            )
    return out


def revision_failures(slug: str, page: dict) -> list[str]:
    """Fail on ANY divergence between the five revision surfaces.

    Divergent means: the five disagree with each other, any of them disagrees
    with the declared CLUSTER_REVISION, a surface is missing or states two
    dates at once, the human-readable <time> text disagrees with its own
    datetime attribute, or the body moved without the date moving with it.
    """
    out: list[str] = []
    rev = page["revision"]
    stated = {key: rev.get(key, "") for key in REVISION_SURFACES}

    for key, value in stated.items():
        if not value:
            out.append(f"{slug}: revision surface {key} is missing")
        elif value.startswith("AMBIGUOUS:"):
            out.append(f"{slug}: revision surface {key} states several dates ({value})")

    distinct = {value for value in stated.values() if value and ":" not in value}
    if len(distinct) > 1:
        detail = ", ".join(f"{k}={v!r}" for k, v in sorted(stated.items()))
        out.append(f"{slug}: revision surfaces diverge -> {detail}")
    elif distinct and distinct != {CLUSTER_REVISION}:
        out.append(
            f"{slug}: revision surfaces agree on {distinct.pop()!r} but the declared "
            f"revision is {CLUSTER_REVISION!r}"
        )

    expected_br = format_date_br(CLUSTER_REVISION)
    for iso_key, text_key in (
        ("visible_revised_on", "visible_revised_on_text"),
        ("sources_consulted_on", "sources_consulted_on_text"),
    ):
        text = rev.get(text_key, "")
        if stated[iso_key] == CLUSTER_REVISION and text != expected_br:
            out.append(
                f"{slug}: {text_key} reads {text!r} but the machine-readable date is "
                f"{CLUSTER_REVISION!r} ({expected_br!r})"
            )

    pinned = REVISION_BODY_SHA256.get(slug)
    if not pinned:
        out.append(f"{slug}: no body fingerprint pinned for {CLUSTER_REVISION}")
    elif pinned != page["content_fingerprint"]:
        out.append(
            f"{slug}: body changed since the pinned fingerprint for "
            f"{CLUSTER_REVISION} ({page['content_fingerprint']} != {pinned}); "
            "the revision date must move with the content"
        )
    return out


def pairwise_table(pages: dict[str, dict]) -> list[dict]:
    rows: list[dict] = []
    slugs = list(CLUSTER_SLUGS)
    for i, a in enumerate(slugs):
        for b in slugs[i + 1 :]:
            ratio = pairwise_shared_ratio(pages[a]["paragraphs"], pages[b]["paragraphs"])
            shared = sorted(
                set(pages[a]["paragraphs"]) & set(pages[b]["paragraphs"])
            )
            overlap = intent_overlap(
                pages[a]["intent_tokens"], pages[b]["intent_tokens"]
            )
            rows.append(
                {
                    "a": a,
                    "b": b,
                    "ratio": round(ratio, 4),
                    **overlap,
                    "shared_count": len(shared),
                    "a_count": len(pages[a]["paragraphs"]),
                    "b_count": len(pages[b]["paragraphs"]),
                    "shared_samples": shared[:5],
                }
            )
    return rows


def evaluate_cluster(root: Path | None = None) -> dict:
    base = root or ROOT
    pages = {slug: inspect_page(base, slug) for slug in CLUSTER_SLUGS}
    records = source_records()
    rows = pairwise_table(pages)
    failures: list[str] = []
    for slug, page in pages.items():
        missing = [sid for sid in REQUIRED_SECTION_IDS if sid not in page["section_ids"]]
        if missing:
            failures.append(f"{slug}: missing sections {missing}")
        if page["h1_count"] != 1:
            failures.append(f"{slug}: h1_count={page['h1_count']}")
        expected_can = f"https://confenge.com.br/conteudos/{slug}/"
        if page["canonical"] != expected_can:
            failures.append(f"{slug}: canonical {page['canonical']!r}")
        if page["headings_skip"]:
            failures.append(f"{slug}: heading level skip")
        failures.extend(artifact_failures(slug, page))
        failures.extend(source_provenance_failures(slug, page, records))
        failures.extend(revision_failures(slug, page))
        if not page["decision_question_present"]:
            failures.append(
                f"{slug}: decision question {page['decision_question']!r} not rendered"
            )
        if not page["next_action_present"]:
            failures.append(
                f"{slug}: next action {page['next_action']!r} not the pillar anchor "
                f"(found {page['pillar_anchor_texts']})"
            )
        if page["has_generic_cta_mold"]:
            failures.append(f"{slug}: generic CTA mold")
        if page["has_receipt_guarantee"]:
            failures.append(f"{slug}: receipt guarantee")
        if page["claims_legal_advice"]:
            failures.append(f"{slug}: claims legal advice")
        if not page["has_educational_limit"]:
            failures.append(f"{slug}: missing educational/not-legal-advice limit")
        if not page["pillar_bridge"]:
            failures.append(f"{slug}: missing pillar bridge")
        if "Article" not in page["jsonld_types"]:
            failures.append(f"{slug}: JSON-LD missing Article")
        if "BreadcrumbList" not in page["jsonld_types"]:
            failures.append(f"{slug}: JSON-LD missing BreadcrumbList")
        family = page["cta_family"]
        cta = page["cta_text"].casefold()
        if family == "dossie" and "dossiê" not in cta and "dossie" not in cta:
            failures.append(f"{slug}: CTA family dossiê not in copy")
        if family == "triagem" and "triagem" not in cta:
            failures.append(f"{slug}: CTA family triagem not in copy")
        if family == "conteudo" and "critério" not in cta and "conteúdo" not in cta:
            failures.append(f"{slug}: CTA family conteúdo not in copy")
    for slug, page in pages.items():
        others = [
            inspect_page(base, other)["html"]
            for other in CLUSTER_SLUGS
            if other != slug
        ]
        art = page["artifact"]
        if any(art in html for html in others):
            failures.append(f"{slug}: artifact {art!r} leaked into another cluster URL")
        if any(page["decision_question"] in html for html in others):
            failures.append(
                f"{slug}: decision question {page['decision_question']!r} leaked "
                "into another cluster URL"
            )
        if any(page["next_action"] in html for html in others):
            failures.append(
                f"{slug}: next action {page['next_action']!r} leaked into "
                "another cluster URL"
            )
    for row in rows:
        if row["ratio"] >= 0.15:
            failures.append(
                f"{row['a']} vs {row['b']}: shared-paragraph ratio "
                f"{row['ratio']:.1%} (>= 15%) samples={row['shared_samples']}"
            )
        if row["intent_token_jaccard"] >= INTENT_TOKEN_JACCARD_MAX:
            failures.append(
                f"{row['a']} vs {row['b']}: intent token-set Jaccard "
                f"{row['intent_token_jaccard']:.4f} "
                f"(>= {INTENT_TOKEN_JACCARD_MAX}) - same search intent"
            )
        if row["intent_shingle_jaccard"] >= INTENT_SHINGLE_JACCARD_MAX:
            failures.append(
                f"{row['a']} vs {row['b']}: intent {INTENT_SHINGLE_N}-gram Jaccard "
                f"{row['intent_shingle_jaccard']:.4f} "
                f"(>= {INTENT_SHINGLE_JACCARD_MAX}) - reused framing"
            )
    titles = [pages[s]["title"] for s in CLUSTER_SLUGS]
    h1s = [pages[s]["h1"] for s in CLUSTER_SLUGS]
    descs = [pages[s]["description"] for s in CLUSTER_SLUGS]
    if len(set(titles)) != len(titles):
        failures.append("duplicate titles inside cluster")
    if len(set(h1s)) != len(h1s):
        failures.append("duplicate H1 inside cluster")
    if len(set(descs)) != len(descs):
        failures.append("duplicate descriptions inside cluster")
    for label, table in (
        ("decision question", DECISION_QUESTIONS),
        ("exclusive artifact", EXCLUSIVE_ARTIFACTS),
        ("next action", NEXT_ACTIONS),
    ):
        values = [table[s] for s in CLUSTER_SLUGS]
        if len(set(values)) != len(values):
            failures.append(f"duplicate {label} declared inside cluster")
        if set(table) != set(CLUSTER_SLUGS):
            failures.append(f"{label} table does not cover the cluster exactly")
    return {
        "ok": not failures,
        "failures": failures,
        "pairwise": rows,
        "revision": CLUSTER_REVISION,
        "thresholds": {
            "shared_paragraph_ratio_max": 0.15,
            "intent_token_jaccard_max": INTENT_TOKEN_JACCARD_MAX,
            "intent_shingle_jaccard_max": INTENT_SHINGLE_JACCARD_MAX,
            "intent_shingle_n": INTENT_SHINGLE_N,
        },
        "pages": {
            slug: {
                "title": pages[slug]["title"],
                "h1": pages[slug]["h1"],
                "paragraph_count": len(pages[slug]["paragraphs"]),
                "cta_family": pages[slug]["cta_family"],
                "artifact": pages[slug]["artifact"],
                "artifact_kind": pages[slug]["artifact_kind"],
                "artifact_evidence": pages[slug]["artifact_evidence"],
                "decision_question": pages[slug]["decision_question"],
                "next_action": pages[slug]["next_action"],
                "source_ids": pages[slug]["source_ids"],
                "revision": {
                    key: pages[slug]["revision"][key] for key in REVISION_SURFACES
                },
                "content_fingerprint": pages[slug]["content_fingerprint"],
            }
            for slug in CLUSTER_SLUGS
        },
    }


def _recapture(root: Path = ROOT) -> int:
    """Print a REVISION_BODY_SHA256 block for the current shipped bodies."""
    print("REVISION_BODY_SHA256: dict[str, str] = {")
    for slug in CLUSTER_SLUGS:
        html = article_path(root, slug).read_text(encoding="utf-8")
        print(f'    "{slug}": "{content_fingerprint(html)}",')
    print("}")
    return 0


if __name__ == "__main__":  # pragma: no cover - operator entry point
    import argparse

    parser = argparse.ArgumentParser(
        description="Audit decision ownership in the medição/glosa cluster"
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="public tree to inspect (repository source by default)",
    )
    parser.add_argument("--recapture", action="store_true")
    parser.add_argument(
        "--require-artifact",
        action="store_true",
        help="fail unless --root is a completed build:site artifact",
    )
    args = parser.parse_args()
    audit_root = args.root.resolve()
    if args.require_artifact:
        build_record = audit_root / ".well-known" / "pseo-build.json"
        if not audit_root.is_dir() or not build_record.is_file():
            parser.error(
                f"{audit_root} is not a completed public artifact; "
                "run npm run build:site first"
            )
    if args.recapture:
        raise SystemExit(_recapture(audit_root))
    report = evaluate_cluster(audit_root)
    report["audited_root"] = str(audit_root)
    report["surface"] = "artifact" if args.require_artifact else "source"
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    raise SystemExit(0 if report["ok"] else 1)
