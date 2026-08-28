#!/usr/bin/env python3
"""Indexable boilerplate / slug-mold findings used by validate_seo.

Extracted so adversarial fixtures drive the same fingerprints as CI.
Noindex pages are fail-closed for indexability (they must not be counted
as an indexable pass) but mold on a noindex URL is not an indexable error.
"""
from __future__ import annotations

import html as html_lib
import re
import unicodedata

from scripts.site.public_copy_scope import is_indexable_html, visible_markup

BOILERPLATE_FINGERPRINTS = (
    "A resposta não é automática",
    "O tema exige uma leitura conjunta",
    "a análise deve analisar",
    "causa, responsabilidade, impacto e valor",
    "a decisão correta depende",
    "Antes de aceitar, executar ou contestar, amarre fato",
    "Esse elemento altera o enquadramento porque define a obrigação",
    "A verificação deve partir de documentos contemporâneos, não de uma reconstrução",
    "O efeito técnico precisa ser conectado a prazo, quantidade, produtividade",
    "A comunicação deve registrar fato, impacto provável, providência solicitada",
    "A conclusão só se sustenta quando um terceiro consegue repetir",
    "permita auditoria por terceiro",
    "Garanta que",
    "como fazer ",
    "?.",
    "Organize a linha do.",
    "Pedido ligado a",
    "Posicione edital fixa",
    "Monte edital fixa",
    "Documente edital omisso",
    "Sem efeito no caminho crítico, o pedido sobre",
    "retórica sem anexo não substitui prova",
    "prova contemporânea vale mais que relato posterior",
    "vira glosa ou impasse de caixa",
    "Struture ",
    "só se sustenta com prova feita na hora dos fatos",
    "Trate revisar ",
    "Converta separar ",
    "Converta quantificar ",
    "Lance revisar ",
    "Comece por aqui na montagem do dossiê",
    "Valide este bloco antes de fechar números",
    "Cruze com o diário e a planilha no mesmo dia",
    "Deixe rastreável para um terceiro repetir o raciocínio",
    "Não deixe este item só na memória da equipe",
    "Se estiver frágil, priorize reforço documental",
    "amarre o efeito a prazo",
    "Ignore esse ponto e o restante da análise",
    "É um dos primeiros itens que o órgão",
    "Quando falha, o custo aparece tarde",
    "Feche este item antes de precificar",
    "A qualidade da prova aqui costuma separar",
    "Sem isso, qualquer conclusão sobre",
    "Foque em «",
    "antes de escalar o próximo passo",
    "costuma decidir se o pedido avança ou trava",
    "Analise distinguir",
    "Analise estruturar",
    "Quantifique examinar",
    "Decomponha conectar",
    "Decomponha distinguir",
    "Conecte caminho crítico às atividades do caminho crítico",
    "como regra do edital está definido",
    "Critério em foco:",
    "Para conduzir ",
    "Valide examinar",
    "prazo, quantidade, custo ou responsabilidade mensurável",
    "costuma ser o ponto que o órgão questiona primeiro",
    "só avança se estiver amarrado a prova",
    "Quantifique a quantificação",
    "Analise a análise",
    "Decomponha a decomposição",
    "Trate a análise de",
    "Ligue o exame de",
)

SLUG_ANSWER_RE = re.compile(
    r"Para conduzir [a-z0-9][a-z0-9 \-]{10,80},\s*separe obrigação contratual",
    re.I,
)


def editorial_mold_findings(html: str, slug: str, *, indexable: bool | None = None) -> dict:
    """Return indexable errors and the indexability decision for one page."""
    if indexable is None:
        indexable = is_indexable_html(html)
    public_copy = visible_markup(html)
    errors: list[str] = []
    if not indexable:
        return {
            "indexable": False,
            "errors": [],
            "noindex_with_mold": any(bp in public_copy for bp in BOILERPLATE_FINGERPRINTS)
            or bool(SLUG_ANSWER_RE.search(public_copy)),
        }
    for fingerprint in BOILERPLATE_FINGERPRINTS:
        if fingerprint in public_copy:
            errors.append(f"boilerplate residual {slug}: {fingerprint!r}")
    if SLUG_ANSWER_RE.search(public_copy):
        errors.append(f"slug-stuffed answer mold {slug}")
    return {"indexable": True, "errors": errors, "noindex_with_mold": False}


ANSWER_RE = re.compile(
    r'<div\b[^>]*class=["\'][^"\']*\banswer-box\b[^"\']*["\'][^>]*>.*?<p\b[^>]*>(.*?)</p>.*?</div>',
    re.I | re.S,
)
CRITERION_RE = re.compile(
    r'<div\b[^>]*class=["\'][^"\']*\bcriterion-card\b[^"\']*["\'][^>]*>.*?'
    r'<h3\b[^>]*>(.*?)</h3>\s*<p\b[^>]*>(.*?)</p>',
    re.I | re.S,
)


def _plain_text(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html_lib.unescape(text)).strip()


def _fold(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _semantic_frame(body: str, *, slug: str, heading: str = "") -> tuple[str, set[str]]:
    """Remove page-specific slots while retaining the reusable prose frame."""
    text = _fold(_plain_text(body))
    slots = set(re.findall(r"[a-z0-9]+", _fold(f"{slug} {heading}")))
    words = [word for word in re.findall(r"[a-z0-9]+", text) if word not in slots]
    normalized = " ".join(words)
    # Normalize common paraphrases that carry the same editorial instruction;
    # this prevents a verb swap from laundering a generated template.
    normalized = re.sub(r"\b(registre|documente)\b", "registrar", normalized)
    normalized = re.sub(r"\b(converta|transforme)\b", "converter", normalized)
    normalized = re.sub(
        r"(?:registro|prova) feit[oa] no dia (?:dos? )?fat(?:o|os)",
        "evidencia contemporanea",
        normalized,
    )
    normalized = re.sub(
        r"(?:pesa|vale) mais (?:do )?que (?:reconstituicao|relato) posterior",
        "supera reconstrucao posterior",
        normalized,
    )
    normalized = re.sub(r"sem memoria(?: de calculo)?", "sem memoria", normalized)
    normalized = re.sub(
        r"numero (?:conferivel|batido) com a planilha(?: contratual)?",
        "numero verificavel",
        normalized,
    )
    normalized = re.sub(r"sem memoria\b.*?\bvira\b", "sem memoria tema vira", normalized)
    tokens = normalized.split()
    shingles = {
        " ".join(tokens[index:index + 3])
        for index in range(max(0, len(tokens) - 2))
    }
    return normalized, shingles


def editorial_corpus_findings(
    pages: list[tuple[str, str]],
    *,
    minimum_pages: int = 3,
    similarity_threshold: float = 0.58,
) -> list[str]:
    """Find near-identical answer/card molds reused across indexable pages.

    Exact reuse and broad structural frames retain their existing 8/5-page
    thresholds in validate_seo. This detector is intentionally narrower: it
    compares only decision-bearing answer boxes and criterion cards, and a
    finding requires a near-duplicate cluster spanning at least three pages.
    """
    segments: list[dict] = []
    for slug, page_html in pages:
        if not is_indexable_html(page_html):
            continue
        for answer in ANSWER_RE.findall(page_html):
            frame, shingles = _semantic_frame(answer, slug=slug)
            if len(shingles) >= 5:
                segments.append({"slug": slug, "kind": "answer", "frame": frame, "shingles": shingles})
        for heading_html, body in CRITERION_RE.findall(page_html):
            heading = _plain_text(heading_html)
            frame, shingles = _semantic_frame(body, slug=slug, heading=heading)
            if len(shingles) >= 5:
                segments.append({"slug": slug, "kind": "criterion", "frame": frame, "shingles": shingles})

    edges: dict[int, set[int]] = {index: set() for index in range(len(segments))}
    for left in range(len(segments)):
        for right in range(left + 1, len(segments)):
            a, b = segments[left], segments[right]
            if a["slug"] == b["slug"] or a["kind"] != b["kind"]:
                continue
            union = a["shingles"] | b["shingles"]
            similarity = len(a["shingles"] & b["shingles"]) / len(union) if union else 0.0
            if similarity >= similarity_threshold:
                edges[left].add(right)
                edges[right].add(left)

    # A connected component is too permissive here: A≈B and B≈C does not imply
    # A≈C. Enumerate maximal cliques so every segment admitted to a cluster is
    # above the threshold against every other segment (complete-link semantics).
    cliques: list[set[int]] = []

    def maximal_cliques(chosen: set[int], candidates: set[int], excluded: set[int]) -> None:
        if len(chosen) + len(candidates) < minimum_pages:
            return
        if not candidates and not excluded:
            if len(chosen) >= minimum_pages:
                cliques.append(set(chosen))
            return
        pivot_pool = candidates | excluded
        pivot = max(pivot_pool, key=lambda node: len(candidates & edges[node])) if pivot_pool else None
        extension = candidates - (edges[pivot] if pivot is not None else set())
        for node in sorted(extension):
            neighbours = edges[node]
            maximal_cliques(
                chosen | {node},
                candidates & neighbours,
                excluded & neighbours,
            )
            candidates.remove(node)
            excluded.add(node)

    maximal_cliques(set(), set(range(len(segments))), set())

    clusters: dict[tuple[str, tuple[str, ...]], set[int]] = {}
    for clique in cliques:
        kind = segments[min(clique)]["kind"]
        slugs = tuple(sorted(segments[index]["slug"] for index in clique))
        clusters.setdefault((kind, slugs), set()).update(clique)

    findings: list[str] = []
    for (kind, slugs), clique in sorted(clusters.items()):
        sample = min((segments[index]["frame"] for index in clique), key=len)
        findings.append(
            f"near-duplicate editorial {kind} mold x{len(slugs)} pages "
            f"({', '.join(slugs)}): …{sample[:90]!r}"
        )
    return findings
