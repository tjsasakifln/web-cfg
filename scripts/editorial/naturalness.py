"""Observable naturalness / AI-residue gates (no external AI detector).

These functions are the single source of truth used by build and tests.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

# Phrases and patterns that signal generic AI / pipeline residue in public HTML.
PROHIBITED_PHRASES: tuple[str, ...] = (
    "além disso",
    "nesse contexto",
    "neste contexto",
    "é importante destacar",
    "vale ressaltar",
    "em suma",
    "por fim",
    "em um cenário cada vez mais",
    "desempenha um papel fundamental",
    "é essencial para garantir",
    "abordagem estratégica",
    "soluções personalizadas",
    "otimizar processos",
    "maximizar resultados",
    "navegar pelas complexidades",
    "não apenas",  # often part of "não apenas X, mas também Y" series — flagged if overused
    "potencializar sua empresa",
    "transforme seus resultados",
    "saiba mais",
    "clique aqui",
)

INTERNAL_TERMS: tuple[str, ...] = (
    "datalake",
    "pipeline",
    "evidence_kind",
    "publishable",
    "registry",
    "mrs-",
    "wave 0",
    "wave 1",
    "wave0",
    "wave1",
    "seed_url",
    "page_material_hash",
    "todo:",
    "placeholder",
    "lorem ipsum",
    "como modelo de linguagem",
    "como ia",
    "gerado por ia",
    "escrito por ia",
    "prompt:",
    "template_id",
)

# Soft AI openers that should not dominate openings
GENERIC_OPENERS: tuple[str, ...] = (
    "no mundo atual",
    "na era digital",
    "é inegável que",
    "não se pode negar",
    "cada vez mais as empresas",
)



# Machine pSEO residue (keyword stuffed as if natural Portuguese)
MACHINE_RESIDUE_RES: tuple[tuple[str, str], ...] = (
    ("converta_discussao", r"Converta a discuss[aã]o sobre"),
    ("faq_doc_caso_de", r"Qual documento deve ser lido primeiro em um caso de"),
    ("faq_risco_caso_de", r"Qual o primeiro risco pr[aá]tico em um caso de"),
    ("caso_de_slug", r"O caso de\s+[a-z0-9][a-z0-9\s]{12,70}\s+s[oó] se sustenta"),
    ("absorver_keyword", r"absorver custo ou risco de\s+[a-záàâãéêíóôõúç0-9\s\-]{8,50}\s+sem prova"),
)


def find_machine_residue(text: str) -> list[str]:
    hits = []
    for name, pat in MACHINE_RESIDUE_RES:
        if re.search(pat, text, re.I):
            hits.append(name)
    return hits

def _normalize(text: str) -> str:
    t = text.lower()
    t = re.sub(r"\s+", " ", t)
    return t


def strip_html(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = re.sub(r"&\w+;", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def find_prohibited(text: str) -> list[str]:
    n = _normalize(text)
    hits = []
    for p in PROHIBITED_PHRASES:
        if p == "não apenas":
            # only fail if the classic pair appears more than once
            if n.count("não apenas") >= 2 and "mas também" in n:
                hits.append(p)
            continue
        if p in n:
            hits.append(p)
    return hits


def find_internal_terms(text: str) -> list[str]:
    n = _normalize(text)
    return [t for t in INTERNAL_TERMS if t in n]


def sentence_lengths(text: str) -> list[int]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [len(s.split()) for s in parts if s.strip()]


def paragraph_openings(text: str, max_paras: int = 40) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    openings = []
    for p in paras[:max_paras]:
        words = p.split()
        openings.append(" ".join(words[:4]).lower() if words else "")
    return openings


def opening_diversity_ratio(openings: list[str]) -> float:
    if not openings:
        return 0.0
    return len(set(openings)) / len(openings)


def sentence_length_variance(lengths: list[int]) -> float:
    if len(lengths) < 3:
        return 0.0
    mean = sum(lengths) / len(lengths)
    return sum((x - mean) ** 2 for x in lengths) / len(lengths)


def jaccard_similarity(a: str, b: str, n: int = 5) -> float:
    def shingles(s: str) -> set[str]:
        toks = re.findall(r"\w+", s.lower())
        if len(toks) < n:
            return {" ".join(toks)} if toks else set()
        return {" ".join(toks[i : i + n]) for i in range(len(toks) - n + 1)}

    sa, sb = shingles(a), shingles(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def keyword_stuffing_score(text: str, keyword: str | None) -> float:
    """Fraction of paragraphs that force-repeat a target keyword (0–1)."""
    if not keyword:
        return 0.0
    kw = keyword.lower().strip()
    if len(kw) < 4:
        return 0.0
    paras = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paras:
        body = text
        return min(1.0, body.lower().count(kw) / max(1, len(body.split()) / 40))
    stuffed = sum(1 for p in paras if p.lower().count(kw) >= 2)
    return stuffed / len(paras)


def evaluate_body(
    body_text: str,
    *,
    keyword: str | None = None,
    min_words: int = 400,
    max_similarity_bodies: list[str] | None = None,
    max_similarity: float = 0.35,
    min_opening_diversity: float = 0.55,
    min_sentence_var: float = 8.0,
) -> dict[str, Any]:
    """Return gate result for a single page body (plain text)."""
    issues: list[str] = []
    words = body_text.split()
    word_count = len(words)

    if word_count < min_words:
        issues.append(f"word_count<{min_words}")

    prohib = find_prohibited(body_text)
    if prohib:
        issues.append("prohibited_phrases:" + ",".join(prohib[:8]))

    internal = find_internal_terms(body_text)
    if internal:
        issues.append("internal_terms:" + ",".join(internal[:8]))

    machine = find_machine_residue(body_text)
    if machine:
        issues.append("machine_residue:" + ",".join(machine[:8]))

    for g in GENERIC_OPENERS:
        if _normalize(body_text).startswith(g) or f" {g}" in _normalize(body_text)[:200]:
            issues.append(f"generic_opener:{g}")

    openings = paragraph_openings(body_text)
    div = opening_diversity_ratio(openings)
    if openings and div < min_opening_diversity:
        issues.append(f"opening_diversity<{min_opening_diversity}")

    lengths = sentence_lengths(body_text)
    var = sentence_length_variance(lengths)
    if lengths and len(lengths) >= 5 and var < min_sentence_var:
        issues.append(f"sentence_variance<{min_sentence_var}")

    stuff = keyword_stuffing_score(body_text, keyword)
    if stuff > 0.35:
        issues.append(f"keyword_stuffing>{stuff:.2f}")

    sim_max = 0.0
    if max_similarity_bodies:
        for other in max_similarity_bodies:
            sim_max = max(sim_max, jaccard_similarity(body_text, other))
        if sim_max > max_similarity:
            issues.append(f"similarity_max>{max_similarity}")

    # Required contribution signals
    has_doc = bool(
        re.search(
            r"\b(documento|diário de obra|memória de cálculo|termo aditivo|planilha|medição|notificação)\b",
            body_text,
            re.I,
        )
    )
    has_legal = bool(
        re.search(
            r"\b(art\.?\s*\d+|lei\s*n[ºo°]?\s*14\.?133|planalto|tcu|s[uú]mula)\b",
            body_text,
            re.I,
        )
    )
    has_caveat = bool(
        re.search(
            r"\b(depende|caso concreto|n[aã]o substitui|ressalva|limita[çc][aã]o|hip[oó]tese)\b",
            body_text,
            re.I,
        )
    )
    if not has_doc:
        issues.append("missing_document_signal")
    if not has_legal:
        issues.append("missing_legal_signal")
    if not has_caveat:
        issues.append("missing_caveat")

    return {
        "ok": not issues,
        "issues": issues,
        "word_count": word_count,
        "opening_diversity": round(div, 3),
        "sentence_variance": round(var, 2),
        "similarity_max": round(sim_max, 3),
        "keyword_stuffing": round(stuff, 3),
        "prohibited": prohib,
        "internal": internal,
    }
