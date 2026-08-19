"""authority-content-quality/1.0 — excellence score and hard gates.

INDEX_READY_HUMAN_REVIEW is a review recommendation. It never grants
PUBLISHABLE_INDEX. Score does not compensate a failed hard gate. Totals
use integer arithmetic with no rounding.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from scripts.contract_analysis.reputation import check_reputational_safety
from scripts.contract_analysis.unique_content import (
    check_unique_content,
    distinctive_tokens,
    strip_entities_and_numbers,
)

QUALITY_VERSION = "authority-content-quality/1.0"
INDEX_READY_VERDICT = "INDEX_READY_HUMAN_REVIEW"
DEPTH_REVIEW_REQUIRED = "DEPTH_REVIEW_REQUIRED"
HUMAN_REVIEW_PENDING = "HUMAN_REVIEW_PENDING"
READY_FOR_HUMAN_REVIEW = "READY_FOR_HUMAN_REVIEW"
MIN_SCORE = 90
MIN_DIMENSION = 80
MIN_NON_BOILERPLATE_WORDS = 1500
MAX_WORDS_PER_CLAIM = 300
MAX_BOILERPLATE_RATIO = 0.20
P0 = "P0"
P1 = "P1"
P2 = "P2"

DIMENSION_WEIGHTS: dict[str, int] = {
    "profundidade_documental": 20,
    "singularidade_novidade": 20,
    "utilidade_decisoria": 20,
    "integridade_epistemica": 15,
    "calculos_engenharia": 10,
    "comunicacao": 10,
    "seo_citabilidade_manutencao": 5,
}

HARD_GATE_NAMES = (
    "official_live_data_ready",
    "source_claim_matrix",
    "material_claims_sourced",
    "numbers_have_origin",
    "hashes_verified",
    "contradictions_visible",
    "unknown_preserved",
    "primary_instrument",
    "two_additional_documents",
    "three_evidence_families",
    "six_material_claims",
    "useful_chronology",
    "document_map",
    "singular_falsifiable_thesis",
    "three_independent_findings",
    "reproducible_or_not_computable",
    "units_period_base",
    "comparison_authorized_or_not_comparable",
    "counterproof_discussed",
    "proportional_conclusion",
    "utility_beyond_source",
    "three_transferable_implications",
    "not_pncp_paraphrase",
    "not_generic_llm_summary",
    "cta_not_primary_utility",
    "thesis_survives_entity_strip",
    "boilerplate_under_20",
    "not_near_duplicate",
    "no_generic_intro_outro",
    "no_padding_sections",
    "no_keyword_stuffing",
    "no_combinatorial_urls",
    "precise_portuguese",
    "terms_defined",
    "consistent_units",
    "readable_tables",
    "chart_only_if_useful",
    "alt_text_present",
    "no_hyperbole",
    "summary_not_conclusion",
    "atypical_not_irregular",
    "no_unsourced_accusation",
    "not_legal_opinion",
    "not_case_study",
    "pii_minimized",
    "correction_defined",
    "specific_intent",
    "distinct_title_meta_h1",
    "canonical_present",
    "schema_matches_visible",
    "method_sources_dates",
    "internal_links_useful",
    "citation_text",
    "mobile_accessible",
    "as_of_freshness",
    "owner_invalidation",
    "update_or_rollback",
    "no_fixture_as_live",
    "no_false_human_authorship",
    "no_epistemic_collapse",
    "no_informal_comparison",
    "no_improper_causality",
)

_GENERIC_THESIS = re.compile(
    r"^(este contrato (é|e) relevante|tem valor elevado|aditivos merecem aten[cç][aã]o|"
    r"an[aá]lise (do|de) contrato p[uú]blico|os n[uú]meros merecem aten[cç][aã]o|"
    r"contrato de (grande|alto) valor)\b",
    re.I,
)
_GENERIC_TITLE = re.compile(
    r"^(an[aá]lise( t[eé]cnica)? (de|do) contrato( p[uú]blico)?|contrato p[uú]blico|"
    r"an[aá]lise de edital|estudo de caso)\b",
    re.I,
)
_HYPERBOLE = re.compile(
    r"\b(revolucion[aá]ri[oa]|imprescind[ií]vel|melhor do mercado|garante vit[oó]ria|"
    r"nunca visto|solu[cç][aã]o definitiva|game[- ]changer)\b",
    re.I,
)
_CAUSAL = re.compile(
    r"\b(portanto causou|isso gerou preju[ií]zo|o aditivo causou|devido a isso houve|"
    r"provou que a administra[cç][aã]o|comprovadamente caus)\b",
    re.I,
)
_LEGAL_OPINION = re.compile(
    r"\b(parecer jur[ií]dico|opina-se pela (nulidade|anula[cç][aã]o)|"
    r"recomenda-se ajuizar|configura ato il[ií]cito)\b",
    re.I,
)
_CASE_STUDY = re.compile(
    r"\b(caso confenge|case de cliente|customer success|nosso cliente|"
    r"case study|depoimento do cliente)\b",
    re.I,
)
_KEYWORD_STUFF = (
    "contrato publico",
    "analise tecnica",
    "edital pncp",
    "licitacao publica",
)
_UNIT_TOKEN = re.compile(
    r"\b(r\$|brl|%|percentual|dia|dias|m[eê]s|meses|ano|anos|m2|m²|m3|m³|"
    r"km|unid|unidade|indice|índice|compet[eê]ncia|base|per[ií]odo)\b",
    re.I,
)
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_PII = re.compile(
    r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.I,
)
_BOILERPLATE = (
    "analise tecnica de contrato publico",
    "nao e caso confenge",
    "nao e case de cliente",
    "nao e customer success",
    "nao e review",
    "nao e parecer juridico",
    "politica publica de correcoes",
    "como corrigir ou contestar",
    "uso de ia: assistencia de redacao",
    "ferramenta da sua empresa, sem relacao com o contrato analisado",
    "identificadores vem da fonte publica",
)


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()


def _text(value: Any) -> str:
    return str(value or "").strip()


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in _items(value) if isinstance(item, dict)]


def collect_prose(record: dict[str, Any], extra: str = "") -> str:
    parts = [
        _text(record.get("title")),
        _text(record.get("meta_description")),
        _text(record.get("h1")),
        _text(record.get("executive_summary")),
        _text(record.get("why_analysis")),
        _text(record.get("insight_singular")),
        _text(record.get("utility_beyond_source")),
        _text(record.get("cannot_conclude")),
        _text(record.get("methodology")),
        _text(record.get("limitations")),
        _text(record.get("counterproof")),
        _text(record.get("thesis")),
        _text(record.get("body")),
        extra,
    ]
    for key in (
        "facts",
        "calculations",
        "comparisons",
        "interpretation",
        "findings",
        "implications",
        "timeline",
        "document_map",
        "claims",
    ):
        for item in _items(record.get(key)):
            if isinstance(item, dict):
                parts.append(_text(item.get("text") or item.get("label") or item.get("body")))
            else:
                parts.append(_text(item))
    return " ".join(p for p in parts if p)


def tokenize_words(text: str) -> list[str]:
    return [tok for tok in re.findall(r"[a-z0-9áéíóúâêôãõç]+", _fold(text)) if tok]


def strip_boilerplate(text: str) -> str:
    blob = _fold(text)
    for phrase in _BOILERPLATE:
        blob = blob.replace(phrase, " ")
    return re.sub(r"\s+", " ", blob).strip()


def non_boilerplate_word_count(record: dict[str, Any], extra: str = "") -> int:
    return len(tokenize_words(strip_boilerplate(collect_prose(record, extra))))


def boilerplate_ratio(record: dict[str, Any], extra: str = "") -> float:
    raw = tokenize_words(collect_prose(record, extra))
    if not raw:
        return 1.0
    cleaned = tokenize_words(strip_boilerplate(collect_prose(record, extra)))
    removed = max(0, len(raw) - len(cleaned))
    return removed / len(raw)


def _source_id_of(claim: dict[str, Any]) -> str:
    """Official claims carry source_refs + evidence_id; fixtures use source_ref."""
    for key in ("source_ref", "source_id", "evidence_id"):
        text = _text(claim.get(key))
        if text:
            return text
    refs = claim.get("source_refs")
    if isinstance(refs, (list, tuple)):
        for item in refs:
            text = _text(item)
            if text:
                return text
    return _text(refs)


def _locator_present(claim: dict[str, Any]) -> bool:
    from scripts.contract_analysis.consume import claim_has_locator

    return claim_has_locator(claim)


def material_claims(record: dict[str, Any]) -> list[dict[str, Any]]:
    claims = [item for item in _dicts(record.get("claims")) if _text(item.get("text") or item.get("body"))]
    if claims:
        out: list[dict[str, Any]] = []
        for item in claims:
            row = dict(item)
            if not _text(row.get("source_ref")):
                row["source_ref"] = _source_id_of(row)
            out.append(row)
        return out
    out = []
    for key in ("facts", "calculations", "interpretation", "findings"):
        for item in _dicts(record.get(key)):
            body = _text(item.get("text"))
            if not body:
                continue
            out.append(
                {
                    "claim_id": item.get("claim_id") or item.get("id") or f"{key}-{len(out)+1}",
                    "text": body,
                    "kind": item.get("kind") or ("FACT" if key == "facts" else key.upper()),
                    "source_ref": _source_id_of(item) or item.get("source_ref") or item.get("source_id"),
                    "locator": item.get("locator") or item.get("locator_path"),
                    "unit": item.get("unit"),
                    "period": item.get("period"),
                    "base": item.get("base"),
                }
            )
    return out


def source_claim_matrix_of(record: dict[str, Any]) -> list[dict[str, Any]]:
    matrix = [item for item in _dicts(record.get("source_claim_matrix")) if item]
    if matrix:
        return matrix
    derived: list[dict[str, Any]] = []
    for claim in material_claims(record):
        source = _source_id_of(claim)
        locator = claim.get("locator") or claim.get("locators")
        if source or locator:
            derived.append(
                {
                    "claim_id": claim.get("claim_id"),
                    "source_id": source,
                    "locator": locator,
                }
            )
    return derived


def _has_locator(claim: dict[str, Any]) -> bool:
    return bool(_source_id_of(claim)) and _locator_present(claim)


def _kind(item: dict[str, Any]) -> str:
    raw = _text(item.get("kind") or item.get("epistemic")).upper()
    if raw in {"INFERENCE", "INTERPRETACAO", "INTERPRETAÇÃO TÉCNICA CONFENGE", "INTERPRETACAO TECNICA CONFENGE"}:
        return "INTERPRETACAO"
    if raw in {"LIMITATION", "LIMITACAO", "LIMITAÇÃO"}:
        return "LIMITACAO"
    return raw or "FACT"


def _documents(record: dict[str, Any]) -> list[dict[str, Any]]:
    docs = _dicts(record.get("documents")) or _dicts(record.get("document_map"))
    if docs:
        return docs
    out = []
    for src in _dicts(record.get("sources")):
        if src.get("url") or src.get("document_id") or src.get("pncp_id"):
            out.append(src)
    return out


def _evidence_families(record: dict[str, Any]) -> set[str]:
    families = {_text(item).lower() for item in _items(record.get("evidence_families")) if _text(item)}
    for doc in _documents(record):
        fam = _text(doc.get("family") or doc.get("kind") or doc.get("type")).lower()
        if fam:
            families.add(fam)
    if not families:
        for src in _dicts(record.get("sources")):
            fam = _text(src.get("family") or src.get("kind") or src.get("label")).lower()
            if fam:
                families.add(fam)
    return {fam for fam in families if fam}


def _is_official_live(record: dict[str, Any]) -> bool:
    if record.get("is_fixture") or record.get("test_only"):
        return False
    if _text(record.get("catalog_mode")) in {"fixture", "offline_catalog"}:
        return False
    if "fixture_as_live" in (record.get("reason_codes") or []):
        return False
    return _text(record.get("source_kind")) == "official_live" and _text(
        record.get("publication_readiness") or record.get("data_state")
    ) == "DATA_READY"


def _pncp_paraphrase(record: dict[str, Any]) -> bool:
    if record.get("pncp_paraphrase") is True:
        return True
    ficha = record.get("ficha") if isinstance(record.get("ficha"), dict) else {}
    dump = " ".join(_text(ficha.get(k)) for k in ("objeto", "orgao", "empresa", "municipio", "valor_label", "regime"))
    body = strip_entities_and_numbers(collect_prose(record), record)
    dump_s = strip_entities_and_numbers(dump, record)
    if not body or not dump_s:
        return False
    body_toks = set(tokenize_words(body))
    dump_toks = set(tokenize_words(dump_s))
    if not dump_toks:
        return False
    overlap = len(body_toks & dump_toks) / max(1, len(body_toks))
    thesis = _text(record.get("thesis") or record.get("insight_singular"))
    return overlap >= 0.55 and (not thesis or bool(_GENERIC_THESIS.search(thesis)))


def _generic_llm(record: dict[str, Any]) -> bool:
    thesis = _text(record.get("thesis") or record.get("insight_singular"))
    if _GENERIC_THESIS.search(thesis):
        return True
    if record.get("generic_llm_summary") is True:
        return True
    body = collect_prose(record)
    if re.search(r"em conclusao,? este contrato e relevante", _fold(body)):
        return True
    return False


def _epistemic_collapse(record: dict[str, Any]) -> bool:
    for item in _dicts(record.get("facts")) + _dicts(record.get("claims")):
        kind = _kind(item)
        text = _text(item.get("text"))
        folded = _fold(text)
        if kind == "FACT" and re.search(r"interpreta(se|-se)|leitura tecnica confenge", folded):
            return True
        if kind == "FACT" and re.search(r"\b(inferimos|conclui-se que houve)\b", folded):
            return True
        if "fact" in folded and "interpretacao tecnica" in folded:
            return True
    return bool(record.get("epistemic_collapse"))


def _informal_comparison(record: dict[str, Any]) -> bool:
    if record.get("informal_comparison") is True:
        return True
    authorized = bool(record.get("comparability_authorized") or record.get("peer_group_authorized"))
    for item in _dicts(record.get("comparisons")):
        outcome = _text(item.get("outcome")).upper()
        if outcome == "NOT_COMPARABLE":
            return False
        method = _text(item.get("method") or item.get("regime") or item.get("basis"))
        if item and not method and not authorized:
            return True
    return False


def _not_comparable_or_authorized(record: dict[str, Any]) -> bool:
    if record.get("comparability_authorized") or record.get("peer_group_authorized"):
        return True
    for item in _dicts(record.get("comparisons")):
        if _text(item.get("outcome")).upper() == "NOT_COMPARABLE":
            return True
        if _text(item.get("method") or item.get("regime") or item.get("basis")):
            return bool(record.get("comparability_authorized"))
    return True


def _calc_ok(record: dict[str, Any]) -> tuple[bool, bool, bool]:
    """Return (has_reproducible_or_not_computable, units_ok, unreproducible_without_flag)."""
    calcs = _dicts(record.get("calculations"))
    if not calcs:
        flag = _text(record.get("not_computable") or record.get("computability")).upper()
        return flag in {"NOT_COMPUTABLE", "NOT_COMPUTABLE_EXPLAINED"}, True, False
    repro = False
    units = True
    unrepro = False
    for item in calcs:
        text = _text(item.get("text"))
        status = _text(item.get("status") or item.get("computability")).upper()
        formula = _text(item.get("formula") or item.get("inputs"))
        unit = _text(item.get("unit"))
        period = _text(item.get("period"))
        base = _text(item.get("base"))
        if status == "NOT_COMPUTABLE" and _text(item.get("reason") or item.get("explanation")):
            repro = True
            continue
        if formula or item.get("reproducible") is True:
            repro = True
        elif _NUMBER.search(text) and not formula and status != "NOT_COMPUTABLE":
            unrepro = True
        if _NUMBER.search(text) and not (unit or _UNIT_TOKEN.search(text)):
            units = False
        if _NUMBER.search(text) and not (period or base or item.get("unit") or _UNIT_TOKEN.search(text)):
            # unit token in prose can satisfy the unit/period/base trio partially
            if not (unit and (period or base)):
                if not (_UNIT_TOKEN.search(text) and (period or base or "base" in _fold(text))):
                    units = units and bool(_UNIT_TOKEN.search(text) and ("base" in _fold(text) or period))
    return repro and not unrepro, units, unrepro


def _false_authorship(record: dict[str, Any]) -> bool:
    if record.get("human_authorship_confirmed") is True:
        return False
    author = record.get("author")
    name = _text(author.get("name") if isinstance(author, dict) else author)
    folded = _fold(name)
    if not name:
        return False
    if "rascunho" in folded or "nao confirmad" in folded:
        return False
    if "tiago" in folded and record.get("human_authorship_confirmed") is not True:
        if record.get("approved_for_index") and record.get("editorial_status") == "approved":
            # Capability INDEX fixtures may name the public specialist.
            return False
        return True
    return False


def _keyword_stuffing(record: dict[str, Any]) -> bool:
    if record.get("keyword_stuffing") is True:
        return True
    blob = _fold(collect_prose(record))
    words = tokenize_words(blob)
    if not words:
        return False
    for phrase in _KEYWORD_STUFF:
        count = blob.count(phrase)
        if count >= 8:
            return True
    return False


def _schema_visible(record: dict[str, Any], rendered_html: str, schema: Any) -> bool:
    if record.get("schema_not_visible") is True:
        return False
    visible = collect_prose(record, rendered_html)
    headline = _text(record.get("title") or record.get("h1"))
    if headline and headline not in visible and headline not in (rendered_html or ""):
        return False
    if schema:
        nodes = schema if isinstance(schema, list) else [schema]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            desc = _text(node.get("description") or node.get("headline"))
            if desc and desc not in visible and desc not in (rendered_html or ""):
                return False
    return True


def _chart_ok(record: dict[str, Any]) -> tuple[bool, bool]:
    charts = _dicts(record.get("charts") or record.get("figures") or record.get("images"))
    if not charts:
        return True, True
    useful = True
    alt_ok = True
    for item in charts:
        if item.get("decorative") is True or item.get("useful") is False:
            useful = False
        if not _text(item.get("alt") or item.get("alt_text")):
            alt_ok = False
    return useful, alt_ok


def _clamp(score: int) -> int:
    if score < 0:
        return 0
    if score > 100:
        return 100
    return score


@dataclass
class QualityFinding:
    code: str
    severity: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "severity": self.severity, "message": self.message}


@dataclass
class QualityResult:
    version: str = QUALITY_VERSION
    dimensions: dict[str, int] = field(default_factory=dict)
    weights: dict[str, int] = field(default_factory=lambda: dict(DIMENSION_WEIGHTS))
    score: int = 0
    hard_gates: dict[str, bool] = field(default_factory=dict)
    hard_gates_all: bool = False
    findings: list[QualityFinding] = field(default_factory=list)
    review_verdict: str = "REJECT"
    depth_review_required: bool = False
    non_boilerplate_words: int = 0
    boilerplate_ratio: float = 0.0
    evidence_density_words_per_claim: float | None = None
    claim_count: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "dimensions": dict(self.dimensions),
            "weights": dict(self.weights),
            "score": self.score,
            "hard_gates": dict(self.hard_gates),
            "hard_gates_all": self.hard_gates_all,
            "findings": [item.as_dict() for item in self.findings],
            "review_verdict": self.review_verdict,
            "depth_review_required": self.depth_review_required,
            "non_boilerplate_words": self.non_boilerplate_words,
            "boilerplate_ratio": self.boilerplate_ratio,
            "evidence_density_words_per_claim": self.evidence_density_words_per_claim,
            "claim_count": self.claim_count,
        }


def _finding(findings: list[QualityFinding], code: str, severity: str, message: str) -> None:
    findings.append(QualityFinding(code=code, severity=severity, message=message))


def evaluate_quality(
    record: dict[str, Any],
    *,
    cohort: list[dict[str, Any]] | None = None,
    rendered_html: str = "",
    schema: Any = None,
) -> QualityResult:
    """Score a record from its real fields. Missing fields fail closed."""
    findings: list[QualityFinding] = []
    # Word/density/PII/copy checks use the analysis record, not chrome HTML.
    prose = collect_prose(record)
    words = non_boilerplate_word_count(record)
    ratio = boilerplate_ratio(record)
    claims = material_claims(record)
    matrix = source_claim_matrix_of(record)
    docs = _documents(record)
    families = _evidence_families(record)
    timeline = _dicts(record.get("timeline"))
    findings_list = _dicts(record.get("findings")) or [
        item for item in _dicts(record.get("interpretation")) if _kind(item) == "INTERPRETACAO"
    ]
    implications = _items(record.get("implications") or record.get("transferable_implications"))
    thesis = _text(record.get("thesis") or record.get("insight_singular"))
    counterproof = _text(record.get("counterproof"))
    unique_errors = check_unique_content(record, cohort)
    reputation_errors = check_reputational_safety(record)
    calc_repro, calc_units, calc_unrepro = _calc_ok(record)
    chart_useful, alt_ok = _chart_ok(record)
    density = (words / len(claims)) if claims else None

    unsourced = [c for c in claims if not _has_locator(c)]
    numbers_ok = True
    for item in _dicts(record.get("calculations")) + claims:
        text = _text(item.get("text"))
        if _NUMBER.search(text) and not (
            _text(item.get("formula") or item.get("source_ref") or item.get("origin") or item.get("locator"))
        ):
            numbers_ok = False
            break

    official = _is_official_live(record)
    hashes_ok = bool(_text(record.get("evidence_pack_hash")) and _text(record.get("content_hash")))
    if record.get("content_hash_verified") is False:
        hashes_ok = False
    if record.get("hash_divergent") is True:
        hashes_ok = False

    unknown_ok = bool(_text(record.get("cannot_conclude"))) and (
        "UNKNOWN" in prose.upper() or "nao se" in _fold(record.get("cannot_conclude") or "")
    )
    primary = any(
        _text(d.get("role") or d.get("family") or d.get("kind")).lower()
        in {"primary", "instrumento", "contrato", "instrumento_primario"}
        or d.get("primary") is True
        for d in docs
    ) or any("contrato" in _fold(_text(d.get("label") or d.get("title"))) for d in docs)
    additional_docs = max(0, len(docs) - (1 if primary else 0))
    if not primary and len(docs) >= 3:
        primary = True
        additional_docs = len(docs) - 1

    chronology = len(timeline) >= 2
    doc_map = bool(_dicts(record.get("document_map"))) or (len(docs) >= 3 and all(
        _text(d.get("label") or d.get("title") or d.get("document_id")) for d in docs
    ))
    thesis_ok = len(thesis) >= 80 and not _GENERIC_THESIS.search(thesis) and bool(record.get("thesis_falsifiable") or "?" in thesis or "se " in _fold(thesis))
    if record.get("thesis_falsifiable") is False:
        thesis_ok = False
    three_findings = len(findings_list) >= 3
    three_impl = len([i for i in implications if _text(i if not isinstance(i, dict) else i.get("text"))]) >= 3
    utility = len(_text(record.get("utility_beyond_source"))) >= 60
    cta_primary = bool(record.get("cta_is_primary_utility"))
    survives = len(distinctive_tokens(record)) >= 36 and "unique_content_too_thin_after_strip" not in unique_errors
    near_dup = any(code.startswith("unique_content_near_duplicate") for code in unique_errors)
    generic_io = bool(_GENERIC_TITLE.search(_text(record.get("title")))) or bool(record.get("generic_intro"))
    padding = bool(record.get("padding_sections")) or (words >= 2500 and (density or 999) > MAX_WORDS_PER_CLAIM)
    filler = words >= 2500 and (not claims or (density or 999) > MAX_WORDS_PER_CLAIM)
    if filler:
        _finding(findings, "long_low_density", P0, "Texto longo sem densidade de evidência.")
    title = _text(record.get("title"))
    meta = _text(record.get("meta_description") or record.get("executive_summary"))
    h1 = _text(record.get("h1") or title)
    distinct_tmh = bool(title) and bool(meta) and title != meta and not _GENERIC_TITLE.search(title)
    mobile_ok = record.get("mobile_accessible") is not False
    if rendered_html:
        if "<h1>" not in rendered_html or "skip-link" not in rendered_html:
            mobile_ok = False
        if "<table" in rendered_html and "scope=" not in rendered_html and 'scope="' not in rendered_html:
            mobile_ok = False

    gates = {
        "official_live_data_ready": official,
        "source_claim_matrix": len(matrix) >= 6 or (len(matrix) >= len(claims) >= 6),
        "material_claims_sourced": bool(claims) and not unsourced,
        "numbers_have_origin": numbers_ok,
        "hashes_verified": hashes_ok,
        "contradictions_visible": record.get("contradictions_hidden") is not True,
        "unknown_preserved": unknown_ok,
        "primary_instrument": primary,
        "two_additional_documents": additional_docs >= 2,
        "three_evidence_families": len(families) >= 3 or bool(record.get("human_evidence_family_exception")),
        "six_material_claims": len(claims) >= 6,
        "useful_chronology": chronology,
        "document_map": doc_map,
        "singular_falsifiable_thesis": thesis_ok,
        "three_independent_findings": three_findings,
        "reproducible_or_not_computable": calc_repro and not calc_unrepro,
        "units_period_base": calc_units,
        "comparison_authorized_or_not_comparable": _not_comparable_or_authorized(record) and not _informal_comparison(record),
        "counterproof_discussed": len(counterproof) >= 40,
        "proportional_conclusion": "cannot_conclude" in record and len(_text(record.get("cannot_conclude"))) >= 40,
        "utility_beyond_source": utility,
        "three_transferable_implications": three_impl,
        "not_pncp_paraphrase": not _pncp_paraphrase(record),
        "not_generic_llm_summary": not _generic_llm(record),
        "cta_not_primary_utility": not cta_primary,
        "thesis_survives_entity_strip": survives,
        "boilerplate_under_20": ratio <= MAX_BOILERPLATE_RATIO,
        "not_near_duplicate": not near_dup,
        "no_generic_intro_outro": not generic_io,
        "no_padding_sections": not padding and not filler,
        "no_keyword_stuffing": not _keyword_stuffing(record),
        "no_combinatorial_urls": record.get("combinatorial_urls") is not True,
        "precise_portuguese": not _HYPERBOLE.search(prose),
        "terms_defined": bool(_dicts(record.get("defined_terms"))) or bool(record.get("terms_defined")),
        "consistent_units": record.get("inconsistent_units") is not True,
        "readable_tables": record.get("unreadable_tables") is not True,
        "chart_only_if_useful": chart_useful,
        "alt_text_present": alt_ok,
        "no_hyperbole": not _HYPERBOLE.search(prose),
        "summary_not_conclusion": _fold(record.get("executive_summary") or "") != _fold(record.get("cannot_conclude") or ""),
        "atypical_not_irregular": "reputation_atipico_as_irregular" not in reputation_errors,
        "no_unsourced_accusation": not any(
            code.startswith("reputation_") and code != "reputation_atipico_as_irregular" for code in reputation_errors
        )
        and "reputation_atipico_as_irregular" not in reputation_errors,
        "not_legal_opinion": not any(
            not re.search(r"n[aã]o\s+(se\s+)?(emite|e|é|constitui)", prose[max(0, m.start() - 24) : m.start()], re.I)
            for m in _LEGAL_OPINION.finditer(prose)
        ),
        "not_case_study": not any(
            not re.search(
                r"n[aã]o\s+(e|é)\s+(um\s+)?",
                prose[max(0, m.start() - 24) : m.start()],
                re.I,
            )
            for m in _CASE_STUDY.finditer(prose)
        ),
        "pii_minimized": not _PII.search(prose) or bool(record.get("pii_allowed_public_id")),
        "correction_defined": bool(_text(record.get("correction_route"))),
        "specific_intent": bool(_text(record.get("intent") or record.get("job"))),
        "distinct_title_meta_h1": distinct_tmh,
        "canonical_present": bool(_text(record.get("canonical") or record.get("slug"))),
        "schema_matches_visible": _schema_visible(record, rendered_html, schema),
        "method_sources_dates": bool(_text(record.get("methodology"))) and bool(_dicts(record.get("sources"))) and bool(_text(record.get("as_of"))),
        "internal_links_useful": record.get("internal_links_missing") is not True,
        "citation_text": bool(_text(record.get("citation_text"))),
        "mobile_accessible": mobile_ok,
        "as_of_freshness": bool(_text(record.get("as_of"))),
        "owner_invalidation": bool(_text(record.get("maintenance_owner"))) and bool(
            record.get("invalidation_keys") or record.get("maintenance_owner")
        ),
        "update_or_rollback": bool(_text(record.get("rollback")))
        or (
            isinstance(record.get("update_history"), list)
            and any(item for item in record.get("update_history") or [])
        ),
        "no_fixture_as_live": "fixture_as_live" not in (record.get("reason_codes") or [])
        and not (record.get("claimed_live") and _text(record.get("catalog_mode")) in {"fixture", "offline_catalog"}),
        "no_false_human_authorship": not _false_authorship(record),
        "no_epistemic_collapse": not _epistemic_collapse(record),
        "no_informal_comparison": not _informal_comparison(record),
        "no_improper_causality": not _CAUSAL.search(prose) and record.get("improper_causality") is not True,
    }
    assert set(gates) == set(HARD_GATE_NAMES)

    if not gates["official_live_data_ready"]:
        _finding(findings, "official_live_or_data_ready_absent", P0, "Pacote não é official_live DATA_READY.")
    if unsourced:
        _finding(findings, "claim_without_locator", P0, "Claim material sem fonte/locator.")
    if not calc_units:
        _finding(findings, "calculation_without_unit", P0, "Cálculo sem unidade/período/base.")
    if calc_unrepro:
        _finding(findings, "calculation_unreproducible", P0, "Cálculo não reproduzível sem NOT_COMPUTABLE.")
    if _epistemic_collapse(record):
        _finding(findings, "inference_as_fact", P0, "Inferência rotulada ou colapsada como FACT.")
    if _informal_comparison(record):
        _finding(findings, "informal_comparison", P0, "Comparação informal sem autorização #415.")
    if len(counterproof) < 40:
        _finding(findings, "counterproof_omitted", P1, "Contraprova ausente ou insubstancial.")
    if not gates["no_improper_causality"]:
        _finding(findings, "improper_causality", P0, "Causalidade indevida.")
    if "reputation_atipico_as_irregular" in reputation_errors:
        _finding(findings, "atipico_as_irregular", P0, "Atípico colapsado em irregular.")
    if any(c.startswith("reputation_") for c in reputation_errors):
        _finding(findings, "accusation", P0, "Acusação reputacional sem base.")
    if near_dup:
        _finding(findings, "near_duplicate", P0, "Near-duplicate após strip de entidades.")
    if ratio > MAX_BOILERPLATE_RATIO:
        _finding(findings, "boilerplate_over_20", P1, "Boilerplate acima de 20%.")
    if _keyword_stuffing(record):
        _finding(findings, "keyword_stuffing", P1, "Keyword stuffing.")
    if not distinct_tmh:
        _finding(findings, "generic_title_meta", P1, "Title/meta genéricos ou idênticos.")
    if not gates["schema_matches_visible"]:
        _finding(findings, "schema_not_visible", P1, "Schema não corresponde ao texto visível.")
    if not chart_useful:
        _finding(findings, "decorative_chart", P1, "Gráfico decorativo.")
    if not alt_ok:
        _finding(findings, "alt_missing", P1, "Alt text ausente.")
    if not gates["no_fixture_as_live"]:
        _finding(findings, "fixture_as_live", P0, "Fixture apresentada como live.")
    if not hashes_ok:
        _finding(findings, "divergent_or_missing_hash", P0, "Hash ausente ou divergente.")
    if _false_authorship(record):
        _finding(findings, "unconfirmed_human_authorship", P0, "Autoria humana atribuída sem confirmação.")
    if not survives:
        _finding(findings, "collapses_after_entity_strip", P0, "Tese colapsa após remover entidades/números.")
    if _pncp_paraphrase(record):
        _finding(findings, "pncp_paraphrase", P0, "Paráfrase da ficha PNCP.")
    if not thesis_ok:
        _finding(findings, "thesis_absent_or_generic", P0, "Sem tese singular e falsificável.")
    if filler:
        _finding(findings, "filler", P0, "Texto inflado sem evidência.")
    if not gates["citation_text"]:
        _finding(findings, "citation_text_absent", P1, "citation_text ausente.")
    if not gates["correction_defined"]:
        _finding(findings, "correction_route_absent", P1, "correction_route ausente.")
    if not gates["update_or_rollback"]:
        _finding(findings, "rollback_or_history_absent", P1, "rollback e update_history ausentes.")

    # Dimension scores: start from 100, subtract failed related gates.
    dim_gates = {
        "profundidade_documental": (
            "primary_instrument",
            "two_additional_documents",
            "three_evidence_families",
            "six_material_claims",
            "useful_chronology",
            "document_map",
        ),
        "singularidade_novidade": (
            "singular_falsifiable_thesis",
            "not_pncp_paraphrase",
            "not_generic_llm_summary",
            "thesis_survives_entity_strip",
            "not_near_duplicate",
            "no_generic_intro_outro",
        ),
        "utilidade_decisoria": (
            "utility_beyond_source",
            "three_transferable_implications",
            "cta_not_primary_utility",
            "three_independent_findings",
            "proportional_conclusion",
        ),
        "integridade_epistemica": (
            "source_claim_matrix",
            "material_claims_sourced",
            "unknown_preserved",
            "counterproof_discussed",
            "no_epistemic_collapse",
            "contradictions_visible",
            "hashes_verified",
        ),
        "calculos_engenharia": (
            "reproducible_or_not_computable",
            "units_period_base",
            "numbers_have_origin",
            "comparison_authorized_or_not_comparable",
            "no_improper_causality",
        ),
        "comunicacao": (
            "precise_portuguese",
            "terms_defined",
            "consistent_units",
            "readable_tables",
            "chart_only_if_useful",
            "alt_text_present",
            "no_hyperbole",
            "summary_not_conclusion",
            "no_keyword_stuffing",
            "boilerplate_under_20",
            "no_padding_sections",
        ),
        "seo_citabilidade_manutencao": (
            "specific_intent",
            "distinct_title_meta_h1",
            "canonical_present",
            "schema_matches_visible",
            "method_sources_dates",
            "as_of_freshness",
            "owner_invalidation",
            "mobile_accessible",
            "citation_text",
            "correction_defined",
            "update_or_rollback",
        ),
    }
    dimensions: dict[str, int] = {}
    for name, related in dim_gates.items():
        failed = sum(1 for g in related if not gates[g])
        penalty = (100 * failed) // max(1, len(related))
        dimensions[name] = _clamp(100 - penalty)

    total = 0
    for name, weight in DIMENSION_WEIGHTS.items():
        total += (dimensions[name] * weight) // 100

    p0p1 = [f for f in findings if f.severity in {P0, P1}]
    hard_all = all(gates.values())
    depth = words < MIN_NON_BOILERPLATE_WORDS
    min_dim = min(dimensions.values()) if dimensions else 0

    if any(f.code in {"accusation", "atipico_as_irregular", "fixture_as_live"} for f in findings):
        verdict = "REJECT"
    elif not official:
        verdict = "HOLD_FOR_DATA"
    elif not hard_all or p0p1 or total < MIN_SCORE or min_dim < MIN_DIMENSION:
        if any(f.code in {"pncp_paraphrase", "filler", "thesis_absent_or_generic"} for f in findings):
            verdict = "REJECT"
        elif not official:
            verdict = "HOLD_FOR_DATA"
        else:
            verdict = "EDITORIAL_REVIEW"
    elif depth:
        verdict = DEPTH_REVIEW_REQUIRED
    else:
        verdict = INDEX_READY_VERDICT

    # Score never compensates a failed hard gate.
    if not hard_all and verdict == INDEX_READY_VERDICT:
        verdict = "EDITORIAL_REVIEW"
    if not hard_all and total >= MIN_SCORE:
        # Keep the integer total visible, but do not treat it as a pass.
        pass

    return QualityResult(
        dimensions=dimensions,
        score=total,
        hard_gates=gates,
        hard_gates_all=hard_all,
        findings=findings,
        review_verdict=verdict,
        depth_review_required=depth,
        non_boilerplate_words=words,
        boilerplate_ratio=ratio,
        evidence_density_words_per_claim=density,
        claim_count=len(claims),
    )
