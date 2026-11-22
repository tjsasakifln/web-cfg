"""Pure validation and rendering. Acquisition remains exclusively in extra-cli."""

from __future__ import annotations

import hashlib
import copy
import json
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from zoneinfo import ZoneInfo

FACTS_SCHEMA = "confenge.contract-news-facts/v1"
EDITORIAL_VERSION = "2026-11-20.1"
PUBLICATION_SCHEMA = "confenge.contract-news-publication/v1"
POINTER_SCHEMA = "confenge.contract-news-pointer/v1"
CATEGORIES = ("obras", "saneamento", "infraestrutura", "projetos", "manutencao")
EDITORIAL_LOOKBACK_DAYS = 14
EDITORIAL_TIMEZONE = ZoneInfo("America/Sao_Paulo")
EDITORIAL_EXCLUSIONS = r"\b(medicamentos?|merenda|alimenticios|software|licencas? de uso|eventos? artisticos?|combustiveis|infraestrutura virtualizada|mainframe)\b"
EDITORIAL_RULES = (
    ("saneamento", r"\b(saneamento|esgotamento|adutoras?|reservatorios?|tratamento de agua|tratamento de esgoto|abastecimento de agua)\b"),
    ("projetos", r"\b(projetos? (?:executivos?|basicos?|estruturais?|arquitetonicos?|de engenharia)|levantamento topografico|sondagem|compatibilizacao)\b"),
    ("manutencao", r"\b(manutencao (?:predial|de edificios|de edificacoes|de iluminacao publica)|conservacao rodoviaria|recuperacao estrutural)\b"),
    ("infraestrutura", r"\b(pavimentacao|rodovias?|pontes?|viadutos?|drenagem|terraplenagem|ferrovias?|infraestrutura urbana|instalacao de iluminacao publica)\b"),
    ("obras", r"\b(obras?|construcao|reforma|ampliacao|engenharia civil|edificacoes|instalacoes eletricas|instalacoes hidraulicas)\b"),
)
MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
MAX_INPUT_BYTES = 10 * 1024 * 1024
MAX_RECORDS = 200
ID_RE = re.compile(r"^(\d{14})-2-(\d{6})/(\d{4})$")
INSTANT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$")
TOKEN_RE = re.compile(r"\{\{([A-Z_]+)\}\}")
STATES = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
FACT_KEYS = {
    "id", "buyer", "supplier", "supplier_type", "object", "value", "source_url",
    "source_published_at", "signed_at", "starts_at", "ends_at", "source_checked_at",
    "source_updated_at", "source_sha256", "administrative_location",
}
# An updated poll is not a new story and may not reset an exhausted API budget.
MATERIAL_KEYS = FACT_KEYS - {"source_checked_at", "source_updated_at", "source_sha256"}


class NewsError(ValueError):
    """Stable, non-sensitive error code. Never include API bodies or credentials."""


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(json_bytes(value)).hexdigest()


def fold(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))


def timestamp(value: Any, name: str = "timestamp") -> datetime:
    if not isinstance(value, str) or len(value) > 40 or not INSTANT_RE.fullmatch(value):
        raise NewsError(f"invalid_{name}")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise NewsError(f"invalid_{name}") from exc
    if parsed.tzinfo is None or "T" not in value:
        raise NewsError(f"timezone_required_{name}")
    return parsed.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def clean_text(value: Any, name: str, minimum: int = 1, maximum: int = 5120) -> str:
    if not isinstance(value, str) or not minimum <= len(value) <= maximum:
        raise NewsError(f"invalid_{name}")
    if any(unicodedata.category(c) in {"Cc", "Cf", "Cs"} for c in value):
        raise NewsError(f"unsafe_{name}")
    if "<" in value or ">" in value or "{{" in value or "}}" in value:
        raise NewsError(f"unsafe_{name}")
    return value


def day(value: Any, name: str) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise NewsError(f"invalid_{name}")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise NewsError(f"invalid_{name}") from exc


def validate_fact(record: Any, now: datetime | None = None, *, fresh: bool = False) -> dict:
    if not isinstance(record, dict):
        raise NewsError("invalid_record")
    facts = {key: record.get(key) for key in FACT_KEYS}
    match = ID_RE.fullmatch(str(facts["id"]))
    if not match:
        raise NewsError("invalid_pncp_id")
    cnpj, seq, year = match.groups()
    if int(seq) < 1 or not 2000 <= int(year) <= 2100:
        raise NewsError("invalid_pncp_id")
    expected_url = f"https://pncp.gov.br/app/contratos/{cnpj}/{year}/{int(seq)}"
    if facts["source_url"] != expected_url:
        raise NewsError("unbound_source_url")
    clean_text(facts["buyer"], "buyer", 3, 500)
    clean_text(facts["supplier"], "supplier", 3, 500)
    clean_text(facts["object"], "object", 30, 5120)
    if any(INJECTION.search(fold(facts[name])) for name in ("buyer", "supplier", "object")):
        raise NewsError("source_contains_prompt_instructions")
    if facts["supplier_type"] != "PJ":
        raise NewsError("supplier_must_be_pj")
    val = facts["value"]
    if not isinstance(val, dict) or set(val) != {"amount", "kind", "currency"}:
        raise NewsError("invalid_value")
    if val["currency"] != "BRL" or val["kind"] not in {"valorGlobal", "valorInicial"}:
        raise NewsError("invalid_value_kind")
    if not isinstance(val["amount"], str) or not re.fullmatch(r"(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?", val["amount"]):
        raise NewsError("invalid_amount")
    try:
        amount = Decimal(val["amount"])
    except InvalidOperation as exc:
        raise NewsError("invalid_amount") from exc
    if not amount.is_finite() or amount <= 0:
        raise NewsError("invalid_amount")
    published = timestamp(facts["source_published_at"], "source_published_at")
    checked = timestamp(facts["source_checked_at"], "source_checked_at")
    updated = timestamp(facts["source_updated_at"], "source_updated_at") if facts["source_updated_at"] is not None else None
    if checked < published or (updated is not None and updated > checked):
        raise NewsError("inconsistent_source_times")
    for name in ("signed_at", "starts_at", "ends_at"):
        day(facts[name], name)
    if facts["starts_at"] and facts["ends_at"] and facts["ends_at"] < facts["starts_at"]:
        raise NewsError("reversed_contract_dates")
    if facts["signed_at"] and facts["signed_at"] > checked.date().isoformat():
        raise NewsError("future_signature")
    location = facts["administrative_location"]
    if not isinstance(location, dict) or set(location) != {"city", "state"}:
        raise NewsError("invalid_administrative_location")
    if location["city"] is not None:
        clean_text(location["city"], "administrative_city", 2, 150)
    if location["state"] is not None and location["state"] not in STATES:
        raise NewsError("invalid_administrative_state")
    if facts["source_sha256"] is not None and not re.fullmatch(r"[a-f0-9]{64}", str(facts["source_sha256"])):
        raise NewsError("invalid_source_sha256")
    if now is not None:
        if published > now or checked > now + timedelta(minutes=5):
            raise NewsError("future_source")
        if fresh and now - checked > timedelta(hours=26):
            raise NewsError("stale_source_check")
    if record.get("editorial_context") is not None:
        from .editorial import validate_context
        facts["editorial_context"] = validate_context(record["editorial_context"], facts, now)
    return facts


def validate_input(document: Any, now: datetime) -> tuple[list[dict], list[str]]:
    if not isinstance(document, dict) or document.get("schema") != FACTS_SCHEMA or document.get("producer") != "extra-cli":
        raise NewsError("invalid_facts_contract")
    for name in ("generated_at", "source_as_of"):
        at = timestamp(document.get(name), name)
        if at > now + timedelta(minutes=5) or now - at > timedelta(hours=26):
            raise NewsError(f"stale_or_future_{name}")
    records = document.get("records")
    if not isinstance(records, list) or len(records) > MAX_RECORDS:
        raise NewsError("invalid_records_count")
    rechecks = document.get("recheck_results", [])
    if not isinstance(rechecks, list) or len(rechecks) > MAX_RECORDS:
        raise NewsError("invalid_recheck_results")
    for row in rechecks:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not ID_RE.fullmatch(row["id"]) or row.get("status") not in {"verified", "ineligible", "unavailable"}:
            raise NewsError("invalid_recheck_result")
    accepted, rejected, seen = [], [], set()
    for item in records:
        try:
            facts = validate_fact(item, now, fresh=True)
            if facts["id"] in seen:
                raise NewsError("duplicate_source_id")
            seen.add(facts["id"])
            accepted.append(facts)
        except NewsError as exc:
            rejected.append(str(exc))
    # Conflicting duplicate source identities are never resolved by input order.
    duplicates = {r.get("id") for r in records if isinstance(r, dict) and sum(isinstance(x, dict) and x.get("id") == r.get("id") for x in records) > 1}
    return [f for f in accepted if f["id"] not in duplicates], rejected


def classify(facts: dict) -> str | None:
    text = fold(facts["object"])
    if re.search(EDITORIAL_EXCLUSIONS, text):
        return None
    return next((category for category, pattern in EDITORIAL_RULES if re.search(pattern, text)), None)


def editorial_scope() -> dict:
    return {"schema": "confenge.contract-news-editorial-scope/v1", "lookback_days": EDITORIAL_LOOKBACK_DAYS,
            "exclude": EDITORIAL_EXCLUSIONS, "include": [pattern for _, pattern in EDITORIAL_RULES]}


def editorial_day(instant: datetime) -> date:
    return instant.astimezone(EDITORIAL_TIMEZONE).date()


def within_editorial_window(facts: dict, now: datetime) -> bool:
    return 0 <= (editorial_day(now) - editorial_day(timestamp(facts["source_published_at"]))).days < EDITORIAL_LOOKBACK_DAYS


def fingerprint(facts: dict) -> str:
    material = {key: facts[key] for key in sorted(MATERIAL_KEYS)}
    if facts.get("editorial_context"):
        context = copy.deepcopy(facts["editorial_context"])
        context.pop("documents_checked_at", None)
        procurement = context.get("procurement")
        if isinstance(procurement, dict):
            # The upstream JSON digest includes formatting and fields outside
            # this editorial projection. Compare the projected facts instead.
            procurement.pop("source_sha256", None)
        for row in [context.get("procurement"), *context.get("documents", [])]:
            if isinstance(row, dict):
                for key in ("text", "source_checked_at", "checked_at"):
                    row.pop(key, None)
        material["editorial_context"] = context
    return digest(material)


def public_facts(facts: dict) -> dict:
    """Public references retain provenance, never attachment text or signatures."""
    public = copy.deepcopy(facts)
    context = public.get("editorial_context")
    if context:
        allowed_context = {"schema", "contract", "procurement", "documents", "documents_status", "documents_total", "documents_checked_at"}
        public["editorial_context"] = {key: value for key, value in context.items() if key in allowed_context}
        public["editorial_context"]["documents"] = [
            {key: value for key, value in document.items() if key in {
                "id", "title", "url", "sha256", "checked_at", "pages", "text_pages", "pages_without_text", "extraction_note",
            }} for document in context.get("documents", [])
        ]
    return public


def validate_research(research: Any, facts: dict) -> dict:
    from .editorial import validate_research as check
    return check(research, facts)


def validate_analysis(analysis: Any, research: dict) -> dict:
    from .editorial import validate_analysis as check
    return check(analysis, research)


def validate_review(review: Any) -> dict:
    from .editorial import validate_review as check
    return check(review)


def money(facts: dict) -> str:
    value = Decimal(facts["value"]["amount"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return "R$ " + f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def tokens(facts: dict, subject: str) -> dict[str, str]:
    result = {
        "BUYER": facts["buyer"], "SUPPLIER": facts["supplier"], "OBJECT": facts["object"],
        "SUBJECT": subject, "VALUE": money(facts),
        "VALUE_KIND": "valor global" if facts["value"]["kind"] == "valorGlobal" else "valor inicial",
        "SOURCE_DATE": timestamp(facts["source_published_at"]).astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y"),
    }
    for key, name in (("SIGNED_DATE", "signed_at"), ("START_DATE", "starts_at"), ("END_DATE", "ends_at")):
        if facts[name]:
            result[key] = date.fromisoformat(facts[name]).strftime("%d/%m/%Y")
    return result


# These are assertions about execution/outcomes absent from a contract registry.
FORBIDDEN = re.compile(
    r"\b(inaugur\w*|entregou|entregara|finalizou|finalizara|concluiu|concluira|concluid[ao]s?|"
    r"pagou|pagara|pago|pagos|desembols\w*|quitad\w*|economiz\w*|"
    r"beneficiar\w*|beneficiou|empregos|moradores|superfatur\w*|irregularidad\w*|"
    r"corrup\w*|vencedor\w*|venceu|maior|recorde|exclusiv\w*)\b|"
    r"\b(?:obra|obras|execucao|servicos)\b.{0,35}\b(?:iniciad\w*|comec\w*|em andamento)\b|"
    r"\b(?:licitacao|inscricoes|propostas|oportunidade)\b.{0,25}\b(?:abert\w*|disponiv\w*)\b|"
    r"\b(?:prazo de execucao|previsao de entrega|termino da obra|licitacao aberta)\b",
    re.IGNORECASE,
)
SPELLED_NUMBERS = re.compile(r"\b(dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milhao|milhoes|bilhao|bilhoes|milhares|centenas|dezenas)\b")
INJECTION = re.compile(r"ignore.{0,40}(?:instrucoes|instructions|regras|previous|prior)|disregard.{0,40}(?:instructions|previous)|system\s*prompt|api[_ -]?key|openai|chatgpt", re.IGNORECASE)


def validate_draft(draft: Any, facts: dict) -> dict:
    if isinstance(draft, dict) and "editorial" in draft:
        from .editorial import validate_editorial_draft
        return validate_editorial_draft(draft, facts)
    keys = {"subject", "title", "description", "lead", "paragraphs"}
    if not isinstance(draft, dict) or set(draft) != keys:
        raise NewsError("invalid_draft_schema")
    subject = clean_text(draft["subject"], "subject", 10, 120)
    normalized = lambda value: " ".join(value.casefold().split())
    if normalized(subject) not in normalized(facts["object"]):
        raise NewsError("subject_not_from_source")
    replacements = tokens(facts, subject)
    if not isinstance(draft["paragraphs"], list) or not 2 <= len(draft["paragraphs"]) <= 4:
        raise NewsError("invalid_paragraph_count")
    fields = [draft["title"], draft["description"], draft["lead"], *draft["paragraphs"]]
    for value in fields:
        if not isinstance(value, str) or not 20 <= len(value) <= 1800:
            raise NewsError("invalid_draft_text")
        stripped = TOKEN_RE.sub("", value)
        if any(token not in replacements for token in TOKEN_RE.findall(value)):
            raise NewsError("unknown_or_missing_fact_token")
        # Apply the editorial style only to authored prose, never official facts.
        if "\u2013" in stripped or "\u2014" in stripped:
            raise NewsError("unsupported_editorial_punctuation")
        if re.search(r"[0-9{}<>@]|https?://", stripped) or any(unicodedata.category(c) in {"Cc", "Cf", "Cs"} for c in value):
            raise NewsError("uncontrolled_numeric_or_markup_claim")
        if FORBIDDEN.search(fold(stripped)) or SPELLED_NUMBERS.search(fold(stripped)) or INJECTION.search(fold(stripped)):
            raise NewsError("unsupported_editorial_claim")
    if "{{VALUE}}" not in draft["lead"] or "{{VALUE_KIND}}" not in draft["lead"] or "{{BUYER}}" not in draft["lead"]:
        raise NewsError("lead_missing_bound_facts")
    combined = " ".join(fields)
    if "{{SUPPLIER}}" not in combined or "{{SOURCE_DATE}}" not in combined:
        raise NewsError("missing_supplier_or_publication_date")
    if "{{SUBJECT}}" not in draft["title"] or "pncp" not in fold(combined):
        raise NewsError("missing_subject_or_source_attribution")
    rendered = {key: TOKEN_RE.sub(lambda match: replacements[match.group(1)], draft[key]) for key in ("title", "description", "lead")}
    rendered["paragraphs"] = [TOKEN_RE.sub(lambda match: replacements[match.group(1)], value) for value in draft["paragraphs"]]
    # Structural facts stay immutable; generated prose can never modify them.
    for name, lo, hi in (("title", 25, 200), ("description", 50, 400), ("lead", 80, 2000)):
        clean_text(rendered[name], name, lo, hi)
    for paragraph in rendered["paragraphs"]:
        clean_text(paragraph, "paragraph", 30, 6500)
    if len(" ".join([rendered["lead"], *rendered["paragraphs"]])) > 10000:
        raise NewsError("article_too_long")
    return rendered


def slug_for(facts: dict, subject: str) -> str:
    # Never leak corporate identity numbers into URL-derived analytics.
    words = re.sub(r"[^a-z\s]", " ", fold(subject))
    prefix = re.sub(r"\s+", "-", words.strip())[:90].strip("-") or "contrato-publico"
    return prefix + "-" + hashlib.sha256(facts["id"].encode()).hexdigest()[:16]


def validate_publication(snapshot: Any) -> dict:
    if not isinstance(snapshot, dict) or set(snapshot) != {"schema", "generated_at", "articles"} or snapshot["schema"] != PUBLICATION_SCHEMA:
        raise NewsError("invalid_publication_schema")
    generated = timestamp(snapshot["generated_at"], "generated_at")
    articles = snapshot["articles"]
    if not isinstance(articles, list):
        raise NewsError("invalid_publication_articles")
    ids, slugs = set(), set()
    for article in articles:
        expected = {"id", "slug", "title", "description", "lead", "paragraphs", "category", "published_at", "modified_at", "facts"}
        optional = {"editorial", "editorial_version"}
        if not isinstance(article, dict) or set(article) - optional != expected:
            raise NewsError("invalid_article_schema")
        if "editorial_version" in article and (not isinstance(article["editorial_version"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d{1,3}", article["editorial_version"])):
            raise NewsError("invalid_editorial_version")
        facts = validate_fact(article["facts"])
        if article["id"] != facts["id"] or article["id"] in ids or article["slug"] in slugs:
            raise NewsError("duplicate_or_unbound_article")
        if not isinstance(article["slug"], str) or not re.fullmatch(r"[a-z][a-z-]{0,90}[a-f0-9]{16}", article["slug"]):
            raise NewsError("invalid_article_slug")
        if article["category"] not in CATEGORIES:
            raise NewsError("invalid_article_category")
        published = timestamp(article["published_at"], "published_at")
        modified = timestamp(article["modified_at"], "modified_at")
        if published > modified or modified > generated or timestamp(facts["source_published_at"]) > published:
            raise NewsError("invalid_article_times")
        for name, lo, hi in (("title", 25, 200), ("description", 50, 400), ("lead", 80, 2000)):
            clean_text(article[name], name, lo, hi)
        if not isinstance(article["paragraphs"], list) or not 2 <= len(article["paragraphs"]) <= 4:
            raise NewsError("invalid_paragraph_count")
        for paragraph in article["paragraphs"]:
            clean_text(paragraph, "paragraph", 30, 6500)
        if article.get("editorial") is not None:
            from .editorial import validate_published_editorial
            validate_published_editorial(article["editorial"], facts)
        ids.add(article["id"])
        slugs.add(article["slug"])
    if len(json_bytes(snapshot)) > MAX_SNAPSHOT_BYTES:
        raise NewsError("publication_exceeds_32mib")
    return snapshot
