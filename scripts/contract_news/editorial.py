"""Document-grounded editorial contracts, distinct from immutable PNCP facts."""
from __future__ import annotations

import copy
import json
import re
import unicodedata
from datetime import datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from .core import EDITORIAL_VERSION, NewsError, clean_text, fold, money, public_facts, timestamp

CONTEXT_SCHEMA = "confenge.contract-news-context/v1"
MAX_CONTEXT_CHARS = 210_000
MAX_DOCUMENT_CHARS = 64_000
_ID = re.compile(r"[a-z][a-z0-9-]{0,60}")
_SHA = re.compile(r"[a-f0-9]{64}")
# Technical prose often joins units to quantities (200W, 6m). Word boundaries
# would let unsupported quantities disappear from this check altogether.
_NUMBER = re.compile(r"(?<!\d)\d+(?:[.,:/-]\d+)*(?!\d)")
_CIVIL_DATE = re.compile(r"(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})")


def _object(value, keys, error):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise NewsError(error)


def _texts(value, minimum, maximum, length=1800):
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise NewsError("invalid_editorial_list")
    for item in value:
        clean_text(item, "editorial_text", 10, length)
    return value


def _normal(value):
    return " ".join(unicodedata.normalize("NFKC", value).split())


def _pncp_url(value, path):
    if not isinstance(value, str) or len(value) > 500:
        raise NewsError("invalid_context_source")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.netloc != "pncp.gov.br"
            or parsed.query or parsed.fragment or not re.fullmatch(path, parsed.path)):
        raise NewsError("unbound_context_source")


def validate_context(value, facts, now=None):
    """Validate identity and provenance while retaining the producer's text privately."""
    if not isinstance(value, dict) or value.get("schema") != CONTEXT_SCHEMA:
        raise NewsError("invalid_editorial_context")
    if set(value) - {"schema", "contract", "procurement", "documents", "documents_status", "documents_total", "documents_checked_at"}:
        raise NewsError("unexpected_context_field")
    if len(json.dumps(value, ensure_ascii=False)) > MAX_CONTEXT_CHARS:
        raise NewsError("editorial_context_too_large")
    cnpj, _, sequence, year = re.split(r"[-/]", facts["id"])
    contract = value.get("contract")
    if not isinstance(contract, dict) or set(contract) != {"number", "type", "category"}:
        raise NewsError("invalid_context_contract")
    for item in contract.values():
        if item is not None:
            clean_text(item, "context_label", 1, 500)
    procurement = value.get("procurement")
    if procurement is not None:
        if not isinstance(procurement, dict):
            raise NewsError("invalid_context_procurement")
        if set(procurement) - {"id", "source_url", "source_api_url", "source_checked_at", "source_sha256", "number", "process", "modality", "dispute_mode", "instrument", "legal_basis", "legal_basis_description", "object", "estimated_value", "awarded_value", "published_at", "proposal_opens_at", "proposal_closes_at"}:
            raise NewsError("unexpected_procurement_field")
        match = re.fullmatch(r"(\d{14})-1-(\d{6})/(\d{4})", str(procurement.get("id", "")))
        if not match or match[1] != cnpj:
            raise NewsError("unbound_context_procurement")
        _pncp_url(procurement.get("source_url"), rf"/app/editais/{cnpj}/{match[3]}/{int(match[2])}/?")
        _pncp_url(procurement.get("source_api_url"), rf"/api/consulta/v1/orgaos/{cnpj}/compras/{match[3]}/{int(match[2])}/?")
        if not _SHA.fullmatch(str(procurement.get("source_sha256", ""))):
            raise NewsError("invalid_context_digest")
        checked = timestamp(procurement.get("source_checked_at"))
        if now is not None and checked > now:
            raise NewsError("future_context_source")
        for key in ("number", "process", "modality", "dispute_mode", "instrument", "legal_basis", "legal_basis_description", "object"):
            if procurement.get(key) is not None:
                clean_text(procurement[key], "procurement_text", 1, 8000)
        for key in ("estimated_value", "awarded_value"):
            amount = procurement.get(key)
            if amount is not None and (not isinstance(amount, dict) or set(amount) != {"amount", "currency"}
                    or amount["currency"] != "BRL" or not re.fullmatch(r"\d{1,15}(?:\.\d{1,4})?", str(amount["amount"]))):
                raise NewsError("invalid_context_amount")
    documents = value.get("documents", [])
    if not isinstance(documents, list) or len(documents) > 3:
        raise NewsError("invalid_context_documents")
    seen = set()
    for document in documents:
        if not isinstance(document, dict):
            raise NewsError("invalid_context_document")
        if set(document) - {"id", "title", "url", "sha256", "checked_at", "text", "pages", "text_pages", "pages_without_text", "extraction_note"}:
            raise NewsError("unexpected_document_field")
        identity = str(document.get("id", ""))
        if not re.fullmatch(r"[1-9]\d{0,8}", identity) or identity in seen:
            raise NewsError("invalid_document_identity")
        seen.add(identity)
        _pncp_url(document.get("url"), rf"/pncp-api/v1/orgaos/{cnpj}/contratos/{year}/{int(sequence)}/arquivos/{identity}")
        clean_text(document.get("title"), "document_title", 1, 500)
        if not _SHA.fullmatch(str(document.get("sha256", ""))):
            raise NewsError("invalid_document_digest")
        timestamp(document.get("checked_at"))
        if type(document.get("pages")) is not int or not 1 <= document["pages"] <= 20:
            raise NewsError("invalid_document_pages")
        if "text" in document:
            text = document["text"]
            if not isinstance(text, str) or not 80 <= len(text) <= MAX_DOCUMENT_CHARS or "\x00" in text:
                raise NewsError("invalid_document_text")
        if "text_pages" in document and (type(document["text_pages"]) is not int or not 0 <= document["text_pages"] <= document["pages"]):
            raise NewsError("invalid_document_text_pages")
        if "pages_without_text" in document and (not isinstance(document["pages_without_text"], list) or any(type(page) is not int or not 1 <= page <= document["pages"] for page in document["pages_without_text"])):
            raise NewsError("invalid_document_text_pages")
        if document.get("extraction_note") is not None:
            clean_text(document["extraction_note"], "extraction_note", 10, 500)
    if value.get("documents_status", "not_collected") not in {"complete", "partial", "unavailable", "not_collected", "empty"}:
        raise NewsError("invalid_documents_status")
    if value.get("documents_total") is not None and (type(value["documents_total"]) is not int or not 0 <= value["documents_total"] <= 10000):
        raise NewsError("invalid_documents_count")
    return copy.deepcopy(value)


def source_catalog(facts):
    base = {key: value for key, value in facts.items() if key != "editorial_context"}
    base["valor_formatado"] = money(facts)
    for key in ("source_published_at", "signed_at", "starts_at", "ends_at"):
        if facts.get(key):
            base[key + "_date"] = (timestamp(facts[key]).astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat()
                                    if key == "source_published_at" else facts[key][:10])
    sources = [{"id": "contract", "title": "Cadastro do contrato no PNCP", "url": facts["source_url"],
                "checked_at": facts["source_checked_at"], "sha256": facts.get("source_sha256"),
                "kind": "registry", "text": json.dumps(base, ensure_ascii=False, indent=2)}]
    context = facts.get("editorial_context", {})
    procurement = context.get("procurement")
    if procurement:
        sources.append({"id": "procurement", "title": "Contratação de origem no PNCP",
                        "url": procurement["source_url"], "checked_at": procurement["source_checked_at"],
                        "sha256": procurement["source_sha256"], "kind": "procurement",
                        "text": json.dumps(procurement, ensure_ascii=False, indent=2)})
    for document in context.get("documents", []):
        extraction = document.get("extraction_note", "")
        sources.append({"id": "document-" + str(document["id"]), "title": "Documento " + str(document["id"]) + " vinculado ao contrato",
                        "url": document["url"], "checked_at": document["checked_at"],
                        "sha256": document["sha256"], "kind": "document", "text": (extraction + "\n" if extraction and document.get("text") else "") + document.get("text", "")})
    return sources


def agent_input(stage, facts, context=None):
    return {"editorial_version": EDITORIAL_VERSION, "stage": stage,
            "facts": public_facts(facts), "sources": source_catalog(facts),
            "context": context}


def editorial_ready(facts):
    """Known absence of evidence never needs a paid inference to be discovered."""
    context = facts.get("editorial_context", {})
    status = context.get("documents_status")
    total = context.get("documents_total")
    documents = context.get("documents", [])
    if type(total) is not int or not all(document.get("text") for document in documents):
        return False
    if status == "partial":
        return 0 < len(documents) < total
    return status == "complete" and len(documents) == total and bool(context.get("procurement") or documents)


def validate_research(value, facts):
    if not editorial_ready(facts):
        raise NewsError("incomplete_document_research")
    _object(value, ["publishable", "angle", "findings", "value_scope", "uncertainties"], "invalid_research_schema")
    if value["publishable"] is not True:
        raise NewsError("insufficient_editorial_evidence")
    clean_text(value["angle"], "research_angle", 30, 900)
    clean_text(value["value_scope"], "value_scope", 30, 1800)
    _texts(value["uncertainties"], 0, 4, 800)
    findings = value["findings"]
    if not isinstance(findings, list) or not 4 <= len(findings) <= 12:
        raise NewsError("insufficient_research_findings")
    sources = {source["id"]: source for source in source_catalog(facts)}
    seen, used = set(), set()
    for finding in findings:
        _object(finding, ["id", "statement", "source_id", "evidence"], "invalid_research_finding")
        if not isinstance(finding["id"], str) or not re.fullmatch(r"f\d{1,2}", finding["id"]) or finding["id"] in seen:
            raise NewsError("invalid_finding_identity")
        seen.add(finding["id"])
        clean_text(finding["statement"], "research_statement", 20, 1400)
        evidence = finding["evidence"]
        if not isinstance(evidence, str) or not 15 <= len(evidence) <= 700:
            raise NewsError("invalid_source_excerpt")
        source = sources.get(finding["source_id"]) if isinstance(finding["source_id"], str) else None
        if source is None or _normal(evidence) not in _normal(source["text"]):
            raise NewsError("research_excerpt_not_in_source")
        used.add(source["id"])
    if not used - {"contract"}:
        raise NewsError("research_only_repeats_registry")
    context = facts.get("editorial_context", {})
    if context.get("documents") and not any(identity.startswith("document-") for identity in used):
        raise NewsError("research_ignored_contract_documents")
    return value


def validate_analysis(value, research):
    _object(value, ["thesis", "points", "watch_points"], "invalid_analysis_schema")
    clean_text(value["thesis"], "technical_thesis", 40, 1400)
    _texts(value["watch_points"], 2, 4, 800)
    if not isinstance(value["points"], list) or not 2 <= len(value["points"]) <= 4:
        raise NewsError("insufficient_technical_analysis")
    finding_ids = {finding["id"] for finding in research["findings"]}
    for point in value["points"]:
        _object(point, ["heading", "explanation", "finding_ids"], "invalid_analysis_point")
        clean_text(point["heading"], "analysis_heading", 10, 130)
        clean_text(point["explanation"], "analysis_explanation", 160, 1800)
        if not isinstance(point["finding_ids"], list) or not point["finding_ids"] or any(identity not in finding_ids for identity in point["finding_ids"]):
            raise NewsError("unbound_technical_analysis")
    return value


def validate_review(value):
    keys = ["supported", "issues", "factual_accuracy", "editorial_quality", "technical_value", "source_traceability", "publication_ready"]
    if not isinstance(value, dict) or set(value) != set(keys) or value["issues"] != [] or any(value[key] is not True for key in keys if key != "issues"):
        raise NewsError("editorial_review_rejected")
    return value


def _civil_date(value):
    if not _CIVIL_DATE.fullmatch(value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d" if "-" in value else "%d/%m/%Y").date()
    except ValueError:
        return None


def _same_order_civil_date(value):
    # Preserve existing separator changes without allowing new date orders.
    match = re.fullmatch(r"(\d{4}|\d{2})([./-])(\d{2})\2(\d{4}|\d{2})", value)
    if match is None or len(match[1]) == len(match[4]):
        return None
    separator = "-" if len(match[1]) == 4 else "/"
    return _civil_date(separator.join((match[1], match[3], match[4])))


def _prose(text, name, minimum, maximum, corpus=None):
    clean_text(text, name, minimum, maximum)
    if "\u2013" in text or "\u2014" in text:
        raise NewsError("unsupported_editorial_punctuation")
    if re.search(r"https?://|www\.|[<>@]|\{\{|\}\}", text):
        raise NewsError("unsafe_editorial_markup")
    if re.search(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b", text):
        raise NewsError("personal_identifier_in_editorial")
    if re.search(r"\b[A-ZÀ-Ý]{4,}(?:\s+[A-ZÀ-Ý]{3,}){2,}\b", text):
        raise NewsError("raw_uppercase_editorial")
    if corpus is not None:
        normalize_number = lambda value: re.sub(r"\D", "", value).lstrip("0") or "0"
        source_numbers = _NUMBER.findall(corpus)
        allowed = {normalize_number(number) for number in source_numbers}
        allowed.update(re.findall(r"(?<!\d)\d+(?!\d)", corpus))
        source_dates = {parsed for number in source_numbers if (parsed := _civil_date(number)) is not None}
        same_order_dates = {
            (parsed, normalize_number(number)) for number in source_numbers
            if (parsed := _same_order_civil_date(number)) is not None
        }
        for number in _NUMBER.findall(text):
            # Dates may change notation, but integers and process identifiers
            # cannot authorize a date just because their digits coincide.
            if _CIVIL_DATE.fullmatch(number):
                parsed = _civil_date(number)
                if parsed is None or (parsed not in source_dates
                                      and (parsed, normalize_number(number)) not in same_order_dates):
                    raise NewsError("uncontrolled_numeric_or_markup_claim")
                continue
            if normalize_number(number) not in allowed:
                raise NewsError("uncontrolled_numeric_or_markup_claim")
    return text


def _references(value, sources, minimum=1):
    if not isinstance(value, list) or not minimum <= len(value) <= 5 or any(not isinstance(identity, str) for identity in value) or len(set(value)) != len(value) or any(identity not in sources for identity in value):
        raise NewsError("unbound_editorial_sources")


def _editorial(value, facts, corpus=None, published=False):
    expected = ["summary", "sections", "display", "source_ids"]
    if published:
        expected += ["sources"]
    _object(value, expected, "invalid_editorial_schema")
    sources = {source["id"]: source for source in source_catalog(facts)}
    _references(value["source_ids"], sources)
    if not isinstance(value["summary"], list) or len(value["summary"]) != 3:
        raise NewsError("invalid_editorial_summary")
    for item in value["summary"]:
        _prose(item, "summary", 30, 400, corpus)
    _object(value["display"], ["buyer", "supplier", "object"], "invalid_editorial_display")
    for key, text in value["display"].items():
        _prose(text, "display_" + key, 3 if key != "object" else 30, 700, corpus)
    sections = value["sections"]
    if not isinstance(sections, list) or not 3 <= len(sections) <= 5:
        raise NewsError("insufficient_editorial_sections")
    kinds, used, headings = set(), set(value["source_ids"]), set()
    for section in sections:
        _object(section, ["heading", "kind", "paragraphs", "source_ids"], "invalid_editorial_section")
        if section["kind"] not in {"context", "technical", "watch"}:
            raise NewsError("invalid_editorial_section_kind")
        _prose(section["heading"], "section_heading", 10, 130, corpus)
        if fold(section["heading"]) in headings:
            raise NewsError("repeated_editorial_heading")
        headings.add(fold(section["heading"]))
        _references(section["source_ids"], sources)
        used.update(section["source_ids"])
        kinds.add(section["kind"])
        if not isinstance(section["paragraphs"], list) or not 1 <= len(section["paragraphs"]) <= 3:
            raise NewsError("invalid_section_paragraphs")
        for paragraph in section["paragraphs"]:
            _prose(paragraph, "section_paragraph", 100, 2000, corpus)
    if not {"context", "technical"} <= kinds or "contract" not in used or not used - {"contract"}:
        raise NewsError("editorial_lacks_added_value")
    references = [{key: val for key, val in source.items() if key != "text"}
                  for identity, source in sources.items() if identity in used]
    if published and value["sources"] != references:
        raise NewsError("editorial_reference_mismatch")
    return {**copy.deepcopy(value), "sources": references}


def validate_editorial_draft(draft, facts):
    _object(draft, ["subject", "title", "description", "lead", "paragraphs", "editorial"], "invalid_draft_schema")
    corpus = "\n".join(source["text"] for source in source_catalog(facts))
    _prose(draft["subject"], "subject", 10, 100, corpus)
    rendered = {}
    for key, minimum, maximum in (("title", 30, 115), ("description", 100, 220), ("lead", 100, 850)):
        rendered[key] = _prose(draft[key], key, minimum, maximum, corpus)
    if not isinstance(draft["paragraphs"], list) or not 2 <= len(draft["paragraphs"]) <= 4:
        raise NewsError("invalid_paragraph_count")
    rendered["paragraphs"] = [_prose(text, "paragraph", 100, 2000, corpus) for text in draft["paragraphs"]]
    rendered["editorial"] = _editorial(draft["editorial"], facts, corpus)
    texts = [rendered["lead"], *rendered["paragraphs"], *[p for section in rendered["editorial"]["sections"] for p in section["paragraphs"]]]
    normalized = [_normal(text).casefold() for text in texts]
    if len(set(normalized)) != len(normalized):
        raise NewsError("repeated_editorial_paragraph")
    words = len(" ".join(texts).split())
    if not 320 <= words <= 1200:
        raise NewsError("editorial_depth_out_of_bounds")
    if "pncp" not in fold(" ".join(texts)):
        raise NewsError("missing_source_attribution")
    return rendered


def validate_published_editorial(editorial, facts):
    return _editorial(editorial, facts, published=True)
