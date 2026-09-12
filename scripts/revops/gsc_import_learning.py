#!/usr/bin/env python3
"""Exclusive GSC import, dimension isolation, cohorts and commercial learning.

Owned by INB-20260911/10. Does not replace auth, history, Netcup store or the
publisher. Historical/fixture imports never become CURRENT. Dimensions are
never crossed. Omitted queries stay UNKNOWN.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]

SEARCH_ANALYTICS_CALENDAR_TZ = ZoneInfo("America/Los_Angeles")
EXECUTIVE_REPORT_TZ = ZoneInfo("America/Sao_Paulo")
IMPORT_SCHEMA = "confenge.gsc-import/1.0"
LEARNING_SCHEMA = "confenge.gsc-operational-learning/1.0"
NEED_CLASS_VERSION = "need-class/v1"
COHORT_VERSION = "publication-cohort/v1"
LEARNING_MIN_IMPRESSIONS = 10
QUEUE_MAX = 3
SUPPRESSED_QUERY_MARKERS = (
    "(consultas ocultas)",
    "(consultas ocultas / hidden queries)",
    "(anonymized query)",
    "(other queries)",
    "(other)",
    "consultas ocultas",
    "hidden queries",
    "anonymized query",
)
# Strip identifiers and raw query text. Do not treat commercial stage keys
# (received_contact, contact) as personal fields — those are UNKNOWN/observed counts.
PERSONAL_FIELD_KEYS = frozenset(
    {
        "email",
        "e-mail",
        "phone",
        "telefone",
        "whatsapp",
        "cpf",
        "lead_id",
        "nome",
        "name",
        "session_id",
        "user_id",
        "query",
        "raw_query",
    }
)
COUNTRY_LABELS_BRAZIL = frozenset({"brasil", "brazil", "bra", "br"})

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "query": ("top consultas", "consultas", "query", "queries", "consulta", "top queries"),
    "page": (
        "páginas principais",
        "paginas principais",
        "páginas",
        "paginas",
        "pages",
        "page",
        "url",
        "top pages",
        "páginas principais da pesquisa",
    ),
    "date": ("data", "date"),
    "clicks": ("cliques", "clicks"),
    "impressions": ("impressões", "impressoes", "impressions"),
    "ctr": ("ctr",),
    "position": ("posição", "posicao", "position"),
    "country": ("país", "pais", "country", "countries"),
    "device": ("dispositivo", "dispositivos", "device", "devices"),
    "filter": ("filtro", "filter"),
    "filter_value": ("valor", "value"),
}

PUBLIC_DOMAINS = frozenset({"public_works_b2g"})
MIXED_SERVICE_FAMILIES = frozenset({"cost_planning_feasibility"})
MIXED_INTENT_FAMILIES = frozenset({"orcar_planejar_decidir"})
BUDGET_FAMILY_IDS = frozenset(
    {
        "private-engineering-quantities-budget",
        "cost_planning_feasibility",
    }
)


class UnsafeZipError(ValueError):
    """ZIP member would escape the destination or is not a permitted file."""


class DimensionIsolationError(ValueError):
    """Attempted to treat separate GSC tables as joint observations."""


def search_analytics_today(*, now: datetime | None = None) -> date:
    """Search Analytics daily dates use the PT calendar, never UTC-shifted."""
    clock = now or datetime.now(SEARCH_ANALYTICS_CALENDAR_TZ)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)
    return clock.astimezone(SEARCH_ANALYTICS_CALENDAR_TZ).date()


def search_analytics_last_complete_day(*, today: date | None = None) -> date:
    """Last complete Search Analytics calendar day in PT. Today is never complete."""
    day = today or search_analytics_today()
    return day - timedelta(days=1)


def incomplete_current_day_status(
    row_date: date | None,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Flag the current Search Analytics day as incomplete. Never fill it with zero."""
    today = today or search_analytics_today()
    if row_date is None:
        return {
            "status": "UNKNOWN",
            "incomplete": None,
            "zero_filled": False,
            "note": "missing_date_is_not_zero",
        }
    if row_date > today:
        return {
            "status": "FUTURE",
            "incomplete": True,
            "zero_filled": False,
            "date": row_date.isoformat(),
            "search_analytics_today": today.isoformat(),
            "note": "future_day_is_not_complete",
        }
    if row_date == today:
        return {
            "status": "INCOMPLETE",
            "incomplete": True,
            "zero_filled": False,
            "date": row_date.isoformat(),
            "search_analytics_today": today.isoformat(),
            "note": "current_search_analytics_day_is_not_complete",
        }
    return {
        "status": "complete",
        "incomplete": False,
        "zero_filled": False,
        "date": row_date.isoformat(),
        "search_analytics_today": today.isoformat(),
    }


def resolve_import_source_kind(meta: Mapping[str, Any] | None, *, origin: str | None = None) -> dict[str, Any]:
    """Distinguish live API, fixture, provided aggregate and absence. Never invent live."""
    meta = meta or {}
    origin_value = origin or meta.get("origin")
    provided = (
        origin_value == "founder_provided_baseline"
        or meta.get("provided_aggregate") is True
        or meta.get("source_kind") == "provided_aggregate"
    )
    if provided:
        return {
            "source_kind": "provided_aggregate",
            "origin": origin_value or "founder_provided_baseline",
            "synthetic": False,
            "fixture": False,
            "provided_aggregate": True,
            "historical": True,
            "ready_for_product_decisions": False,
        }
    if meta.get("fixture") is True or meta.get("synthetic") is True or origin_value == "fixture":
        return {
            "source_kind": "fixture",
            "origin": origin_value or "fixture",
            "synthetic": True,
            "fixture": True,
            "provided_aggregate": False,
            "historical": True,
            "ready_for_product_decisions": False,
        }
    return {
        "source_kind": "historical_csv_export",
        "origin": origin_value or "csv_export",
        "synthetic": True,
        "fixture": True,
        "provided_aggregate": False,
        "historical": True,
        "ready_for_product_decisions": False,
    }


def executive_today(*, now: datetime | None = None) -> date:
    clock = now or datetime.now(EXECUTIVE_REPORT_TZ)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)
    return clock.astimezone(EXECUTIVE_REPORT_TZ).date()


def parse_search_analytics_date(value: Any) -> date | None:
    """YYYY-MM-DD as a PT calendar date. Not a UTC instant."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def parse_gsc_number(val: Any) -> float | None:
    """Parse a GSC absolute number. Empty is None, never numeric zero."""
    if val is None:
        return None
    s = str(val).strip().replace("\xa0", "").replace(" ", "")
    if s == "" or s in {".", "-", "—", "–", "n/a", "na", "null"}:
        return None
    s = s.replace("%", "")
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", s):
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    elif "," in s and "." not in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_gsc_rate(val: Any) -> float | None:
    """Parse CTR. Percent sign always means divide by 100. Empty is None."""
    if val is None:
        return None
    raw = str(val).strip()
    if raw == "":
        return None
    numbered = parse_gsc_number(raw)
    if numbered is None:
        return None
    if "%" in raw:
        return numbered / 100.0
    if numbered > 1.0:
        return numbered / 100.0
    return numbered


def ctr_from_sums(clicks: float | None, impressions: float | None) -> dict[str, Any]:
    """CTR is clicks/impressions from sums. Zero denominator is not a rate."""
    if impressions is None or clicks is None:
        return {
            "ctr": None,
            "status": "UNKNOWN",
            "formula": "clicks/impressions",
            "zero_denominator": False,
        }
    if impressions == 0:
        return {
            "ctr": None,
            "status": "UNDEFINED",
            "formula": "clicks/impressions",
            "zero_denominator": True,
        }
    return {
        "ctr": clicks / impressions,
        "status": "observed",
        "formula": "clicks/impressions",
        "zero_denominator": False,
    }


def weighted_position(
    rows: Iterable[Mapping[str, Any]],
    *,
    impressions_key: str = "impressions",
    position_key: str = "position",
    approximate: bool = False,
) -> dict[str, Any]:
    """Impression-weighted position on one grain. Missing weight is not zero."""
    weighted = 0.0
    weight = 0.0
    any_pos = False
    for row in rows:
        imps = parse_gsc_number(row.get(impressions_key))
        pos = parse_gsc_number(row.get(position_key))
        if imps is None or pos is None or imps <= 0:
            continue
        weighted += imps * pos
        weight += imps
        any_pos = True
    if not any_pos or weight == 0:
        return {
            "position": None,
            "status": "UNKNOWN",
            "approximate": approximate,
            "weight_impressions": None,
            "formula": "sum(impressions*position)/sum(impressions)",
        }
    return {
        "position": weighted / weight,
        "status": "observed",
        "approximate": True if approximate else False,
        "weight_impressions": weight,
        "formula": "sum(impressions*position)/sum(impressions)",
    }


def detect_csv_dialect(text: str) -> csv.Dialect:
    sample = text[:4096]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
        return dialect


def decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    text = decode_bytes(path.read_bytes())
    dialect = detect_csv_dialect(text)
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows: list[dict[str, str]] = []
    for row in reader:
        norm = {(k or "").strip(): (v if v is None else str(v).strip()) for k, v in row.items() if k is not None}
        if not any(v for v in norm.values()):
            continue
        rows.append(norm)
    return rows


def _fold(name: str) -> str:
    return (name or "").strip().lower().replace("ã", "a").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ç", "c")


def col(row: Mapping[str, str], field: str) -> str:
    aliases = COLUMN_ALIASES.get(field, (field,))
    keys = {_fold(k): k for k in row}
    for alias in aliases:
        folded = _fold(alias)
        if folded in keys:
            return str(row.get(keys[folded]) or "")
    return ""


def classify_csv_kind(path: Path, rows: list[dict[str, str]] | None = None) -> str:
    name = _fold(path.name)
    if "filtro" in name or name.startswith("filter"):
        return "filters"
    if "grafico" in name or name.startswith("chart") or "dates" in name:
        return "property"
    if "consulta" in name or "quer" in name:
        return "query"
    if "pais" in name or "countr" in name:
        return "country"
    if "dispositivo" in name or "device" in name:
        if "pagina" in name or "page" in name:
            return "page_by_device"
        return "device"
    if "pagina" in name or name.startswith("page"):
        return "page"
    headers = [_fold(k) for k in (rows[0] if rows else {})]
    header_blob = " ".join(headers)
    if any(h in {"filtro", "filter"} for h in headers):
        return "filters"
    if any(h in {"data", "date"} for h in headers) and not any("consulta" in h or "pagina" in h or "page" in h for h in headers):
        return "property"
    if "top consultas" in header_blob or any(h in {"query", "consulta", "consultas"} for h in headers):
        return "query"
    if any(h in {"pais", "country"} for h in headers):
        return "country"
    if any(h in {"dispositivo", "device"} for h in headers):
        return "device"
    if any("pagina" in h or h in {"page", "pages", "url"} for h in headers):
        return "page"
    return "unknown"


def is_suppressed_query(text: str) -> bool:
    folded = _fold(text)
    if not folded:
        return True
    return folded in {_fold(m) for m in SUPPRESSED_QUERY_MARKERS} or folded.startswith("(consulta")


def safe_unzip(zip_path: Path, dest: Path) -> list[Path]:
    """Extract only regular CSV/JSON/TXT files. Reject traversal and absolute paths."""
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or name.startswith("\\") or ":" in Path(name).parts[0]:
                raise UnsafeZipError(f"absolute_member:{name}")
            parts = [p for p in name.split("/") if p not in ("", ".")]
            if any(p == ".." for p in parts):
                raise UnsafeZipError(f"path_traversal:{name}")
            suffix = Path(name).suffix.lower()
            if suffix not in {".csv", ".txt", ".json", ".md"}:
                continue
            target = dest.joinpath(*parts).resolve()
            if not str(target).startswith(str(dest) + "/") and target != dest:
                raise UnsafeZipError(f"escaped_member:{name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as src, target.open("wb") as out:
                out.write(src.read())
            extracted.append(target)
    return extracted


def zip_filename_date(zip_path: Path) -> str | None:
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", zip_path.name)
    return match.group(1) if match else None


def empty_dimension(grain: str) -> dict[str, Any]:
    return {
        "available": False,
        "grain": grain,
        "clicks": None,
        "impressions": None,
        "ctr": None,
        "position": None,
        "row_count": 0,
        "status": "ABSENT",
    }


def _metric_totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    clicks = 0.0
    imps = 0.0
    saw_clicks = False
    saw_imps = False
    for row in rows:
        c = parse_gsc_number(row.get("clicks"))
        i = parse_gsc_number(row.get("impressions"))
        if c is not None:
            clicks += c
            saw_clicks = True
        if i is not None:
            imps += i
            saw_imps = True
    ctr = ctr_from_sums(clicks if saw_clicks else None, imps if saw_imps else None)
    pos = weighted_position(rows, approximate=True)
    return {
        "clicks": clicks if saw_clicks else None,
        "impressions": imps if saw_imps else None,
        "ctr": ctr["ctr"],
        "ctr_status": ctr["status"],
        "position": pos["position"],
        "position_status": pos["status"],
        "position_approximate": pos["approximate"],
        "row_count": len(rows),
    }


def isolate_dimension_totals(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Return per-dimension totals. Never a combined property+page+query sum."""
    dims = payload.get("dimensions") or {}
    isolated = {
        "property": dict(dims.get("property") or empty_dimension("date")),
        "page": dict(dims.get("page") or empty_dimension("page")),
        "query": dict(dims.get("query") or empty_dimension("query")),
        "country": dict(dims.get("country") or empty_dimension("country")),
        "device": dict(dims.get("device") or empty_dimension("device")),
        "cross_dimension_join_forbidden": True,
        "combined_sum_forbidden": True,
    }
    return isolated


def validate_dimension_isolation(totals: Mapping[str, Any]) -> bool:
    if totals.get("combined") is not None or totals.get("property_plus_page") is not None:
        return False
    if totals.get("cross_dimension_join_forbidden") is not True:
        return False
    prop = (totals.get("property") or {}).get("impressions")
    page = (totals.get("page") or {}).get("impressions")
    if prop is not None and page is not None and totals.get("summed_impressions") == (prop + page):
        return False
    return True


def reject_cross_dimension_sum(property_impressions: float | None, page_impressions: float | None) -> None:
    if property_impressions is None or page_impressions is None:
        return
    raise DimensionIsolationError(
        "page_and_property_are_not_joint_observations:"
        f"{property_impressions}+{page_impressions}"
    )


def _path_of(url_or_path: str) -> str:
    raw = (url_or_path or "").strip()
    if raw.startswith("http"):
        path = urlparse(raw).path or "/"
    else:
        path = raw or "/"
    if not path.startswith("/"):
        path = "/" + path
    if path != "/" and not path.endswith("/"):
        # Keep file-like paths; add slash for site routes.
        if "." not in path.rsplit("/", 1)[-1]:
            path = path + "/"
    return path


def load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_intent_contracts(*, root: Path | None = None) -> dict[str, Any]:
    root = root or ROOT
    matrix = load_json(root / "data" / "corporate" / "intent-family-matrix.v1.json") or {}
    registry = load_json(root / "data" / "organic" / "public-family-registry.json") or {}
    bofu = load_json(root / "data" / "organic" / "bofu-intent-matrix.json") or {}
    inb01 = load_json(root / "docs" / "campaigns" / "inb-20260911" / "01" / "handoff.json")
    families = list(registry.get("families") or [])
    routes: dict[str, dict[str, Any]] = {}
    for fam in families:
        match = fam.get("match") or {}
        for route in match.get("routes") or []:
            routes[_path_of(route)] = {
                "family_id": fam.get("id"),
                "visitor_job": fam.get("visitor_job"),
                "terminal_action": fam.get("terminal_action"),
                "source": "public-family-registry",
            }
    bofu_routes: dict[str, dict[str, Any]] = {}
    for row in bofu.get("rows") or []:
        route = _path_of(str(row.get("canonical_service_route") or ""))
        if route and route != "/":
            bofu_routes[route] = {
                "family_id": "service-pillars",
                "intent_cluster": row.get("intent_cluster"),
                "offer_id": row.get("offer_id"),
                "source": "bofu-intent-matrix",
            }
        for extra in row.get("supporting_indexable_routes") or []:
            extra_path = _path_of(str(extra))
            bofu_routes.setdefault(
                extra_path,
                {
                    "family_id": "service-pillars",
                    "intent_cluster": row.get("intent_cluster"),
                    "offer_id": None,
                    "source": "bofu-intent-matrix-supporting",
                    "canonical_service_route": route,
                },
            )
    intent_by_id = {
        item.get("intent_family"): item for item in (matrix.get("intent_families") or []) if item.get("intent_family")
    }
    service_by_id = {
        item.get("id"): item for item in (matrix.get("service_families") or []) if item.get("id")
    }
    return {
        "matrix": matrix,
        "registry": registry,
        "bofu": bofu,
        "inb01": inb01,
        "inb01_present": inb01 is not None,
        "routes": routes,
        "bofu_routes": bofu_routes,
        "intent_by_id": intent_by_id,
        "service_by_id": service_by_id,
        "fallback": None if inb01 is not None else "current_intent_matrix_and_public_family_registry",
    }


def classify_need_class(url_or_path: str, contracts: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Need class from purchase need / contracts, not from URL keywords.

    Home is unknown. Budget/orçar family is mixed. B2G service pillars are public.
    A home click never infers a branded query.
    """
    contracts = contracts or load_intent_contracts()
    path = _path_of(url_or_path)
    if path in {"/", ""}:
        return {
            "need_class": "unknown",
            "intent_family": None,
            "offer_id": None,
            "family_id": "home" if path == "/" else None,
            "reason": "home_is_not_a_purchase_need",
            "home_click_does_not_infer_brand": True,
            "version": NEED_CLASS_VERSION,
            "url_keyword_classifier": False,
        }
    route = (contracts.get("routes") or {}).get(path)
    bofu = (contracts.get("bofu_routes") or {}).get(path)
    family_id = (route or {}).get("family_id") or (bofu or {}).get("family_id")
    offer_id = (bofu or {}).get("offer_id") or (route or {}).get("offer_id")
    intent_family = None
    service_family = None
    operational_domain = None

    if family_id in BUDGET_FAMILY_IDS or family_id == "private-engineering-quantities-budget":
        intent_family = "orcar_planejar_decidir"
    elif family_id == "service-pillars" or bofu:
        if (bofu or {}).get("intent_cluster") in {
            "aditivos",
            "medicoes-pagamentos",
            "reequilibrio",
            "atrasos-prorrogacao",
            "defesa-tecnica",
            "acompanhamento",
            "defesa-margem",
        }:
            intent_family = "executar_proteger_contrato_publico"
        elif (bofu or {}).get("intent_cluster") in {
            "auditoria-orcamento",
            "diagnostico-pre-licitacao",
            "bid-room",
            "diretoria-b2g",
            "diagnostico-b2g",
            "diagnostico-b2g-360",
            "diagnostico-b2g-expansao",
        }:
            intent_family = "decidir_disputar_licitacao"
        else:
            intent_family = "executar_proteger_contrato_publico"

    if intent_family:
        intent = (contracts.get("intent_by_id") or {}).get(intent_family) or {}
        service_family = intent.get("canonical_service_family")
        service = (contracts.get("service_by_id") or {}).get(service_family) or {}
        operational_domain = service.get("operational_domain")
        if offer_id is None:
            ids = list(intent.get("offer_ids") or [])
            offer_id = ids[0] if len(ids) == 1 else None

    if family_id in BUDGET_FAMILY_IDS or intent_family in MIXED_INTENT_FAMILIES or service_family in MIXED_SERVICE_FAMILIES:
        need = "mixed"
        reason = "budget_family_serves_public_and_private"
    elif operational_domain in PUBLIC_DOMAINS or family_id == "service-pillars" or bofu:
        need = "public"
        reason = "public_works_purchase_need"
    elif family_id or intent_family:
        need = "private"
        reason = "non_b2g_service_family"
    else:
        need = "unknown"
        reason = "no_contract_join"

    return {
        "need_class": need,
        "intent_family": intent_family,
        "offer_id": offer_id,
        "family_id": family_id,
        "service_family": service_family,
        "operational_domain": operational_domain,
        "canonical_path": path,
        "reason": reason,
        "home_click_does_not_infer_brand": True,
        "url_keyword_classifier": False,
        "version": NEED_CLASS_VERSION,
        "inb01_present": bool(contracts.get("inb01_present")),
    }


def load_release_evidence(*, root: Path | None = None) -> dict[str, Any]:
    """first_verified_deploy_at comes only from release evidence, never git/PR."""
    root = root or ROOT
    candidates = [
        root / "data" / "ops" / "first-verified-deploy.json",
        root / "docs" / "ops" / "release-evidence.json",
        root / "data" / "revops" / "release-evidence.json",
    ]
    for path in candidates:
        payload = load_json(path)
        if isinstance(payload, dict):
            return {"available": True, "path": str(path.relative_to(root)), "records": payload}
    return {
        "available": False,
        "path": None,
        "records": {},
        "status": "UNKNOWN",
        "note": "file_creation_commit_pr_are_not_publication",
    }


def publication_cohort(
    url_or_path: str,
    release_evidence: Mapping[str, Any] | None = None,
    *,
    editorial_changed_at: str | None = None,
) -> dict[str, Any]:
    evidence = release_evidence if release_evidence is not None else load_release_evidence()
    path = _path_of(url_or_path)
    records = evidence.get("records") or {}
    entry = None
    if isinstance(records, dict):
        entry = records.get(path)
        nested_routes = records.get("routes")
        if entry is None and isinstance(nested_routes, dict):
            entry = nested_routes.get(path)
    first = None
    if isinstance(entry, dict):
        first = entry.get("first_verified_deploy_at")
        editorial_changed_at = editorial_changed_at or entry.get("editorial_changed_at")
    elif isinstance(entry, str):
        first = entry
    return {
        "canonical_path": path,
        "first_verified_deploy_at": first,
        "editorial_changed_at": editorial_changed_at,
        "cohort": first[:10] if isinstance(first, str) and len(first) >= 10 else None,
        "status": "observed" if first else "UNKNOWN",
        "file_creation_is_not_publication": True,
        "commit_is_not_publication": True,
        "pr_is_not_publication": True,
        "version": COHORT_VERSION,
    }


CAPTURE_STAGE_KEYS = (
    "visita",
    "clique",
    "solicitacao_persistida",
    "encaminhamento_aceito",
    "oportunidade_qualificada",
)
FUNNEL_TO_CAPTURE = {
    "visitor": "visita",
    "cta_triggered": None,
    "form_started": None,
    "lead_persisted": "solicitacao_persistida",
    "contacted": "encaminhamento_aceito",
    "qualified": "oportunidade_qualificada",
    "proposal": None,
    "meeting": None,
    "won": None,
    "lost": None,
}


def _stage_cell(value: Any, *, authority: str, present: bool) -> dict[str, Any]:
    if not present:
        return {"status": "UNKNOWN", "value": None, "authority": authority}
    return {"status": "observed", "value": value, "authority": authority}


def join_capture_stages(
    *,
    visitor: float | None = None,
    clicks: float | None = None,
    lead_persisted: float | None = None,
    contacted: float | None = None,
    qualified: float | None = None,
    warmbly: Mapping[str, Any] | None = None,
    funnel: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Map POS-INB 01 / FUNNEL_KEYS onto visita→qualificada without PII or lead_id."""
    funnel = funnel or {}
    visitor_value = visitor if visitor is not None else funnel.get("visitor")
    persisted = lead_persisted if lead_persisted is not None else funnel.get("lead_persisted")
    accepted = contacted if contacted is not None else funnel.get("contacted")
    qualified_value = qualified if qualified is not None else funnel.get("qualified")
    authorized = bool(warmbly) and warmbly.get("authorized") is True
    return {
        "visita": _stage_cell(
            visitor_value, authority="host_funnel", present=visitor_value is not None
        ),
        "clique": _stage_cell(
            clicks, authority="gsc_search_analytics", present=clicks is not None
        ),
        "solicitacao_persistida": _stage_cell(
            persisted, authority="host_lead_store", present=persisted is not None
        ),
        "encaminhamento_aceito": _stage_cell(
            accepted, authority="host_lead_store", present=accepted is not None
        ),
        "oportunidade_qualificada": _stage_cell(
            qualified_value,
            authority="warmbly" if authorized else "warmbly_absent",
            present=authorized and qualified_value is not None,
        ),
        "qualification_proposal_sale_unknown_without_warmbly": not authorized,
        "anonymous_query_not_joined_to_person": True,
        "lead_id_excluded": True,
        "funnel_keys_not_copied_as_pii": True,
        "keys": list(CAPTURE_STAGE_KEYS),
    }


def commercial_stages(
    *,
    impressions: float | None,
    clicks: float | None,
    contacts: float | None = None,
    warmbly: Mapping[str, Any] | None = None,
    visitor: float | None = None,
    lead_persisted: float | None = None,
    funnel: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Qualification/proposal/hire only from warmbly or authorized commercial source."""
    discovery = {
        "status": "observed" if impressions is not None else "UNKNOWN",
        "value": impressions,
        "authority": "gsc_search_analytics",
    }
    click = {
        "status": "observed" if clicks is not None else "UNKNOWN",
        "value": clicks,
        "authority": "gsc_search_analytics",
    }
    authorized = bool(warmbly) and warmbly.get("authorized") is True
    if contacts is not None:
        received_contact = {
            "status": "observed",
            "value": contacts,
            "authority": "host_lead_store",
        }
    else:
        received_contact = {
            "status": "UNKNOWN",
            "value": None,
            "authority": "warmbly" if authorized else "warmbly_absent",
        }

    def _stage(name: str) -> dict[str, Any]:
        if not authorized:
            return {"status": "UNKNOWN", "value": None, "authority": "warmbly_absent"}
        value = (warmbly or {}).get(name)
        if value is None:
            return {"status": "UNKNOWN", "value": None, "authority": "warmbly"}
        return {"status": "observed", "value": value, "authority": "warmbly"}

    capture = join_capture_stages(
        visitor=visitor,
        clicks=clicks,
        lead_persisted=lead_persisted if lead_persisted is not None else contacts,
        contacted=contacts,
        qualified=(warmbly or {}).get("qualification") if authorized else None,
        warmbly=warmbly,
        funnel=funnel,
    )
    return {
        "discovery": discovery,
        "click": click,
        "received_contact": received_contact,
        "contact": received_contact,
        "qualification": _stage("qualification"),
        "proposal": _stage("proposal"),
        "hire": _stage("hire"),
        "capture_stages": capture,
        "anonymous_query_not_joined_to_person": True,
        "zero_not_inferred": True,
        "lead_id_excluded": True,
    }


def is_failure_alert_forbidden(impressions: float | None, clicks: float | None) -> bool:
    """A single impression with zero clicks is not a commercial-failure alert."""
    if impressions is None:
        return True
    if impressions < LEARNING_MIN_IMPRESSIONS:
        return True
    if clicks == 0 and impressions <= 1:
        return True
    return False


def _queue_item(
    *,
    rank: int,
    diagnosis: str,
    hypothesis: str,
    path: str,
    evidence: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "rank": rank,
        "diagnosis": diagnosis,
        "hypothesis": hypothesis,
        "path": path,
        "evidence": dict(evidence),
        "kind": "prioritized_hypothesis",
        "authorizes_publish": False,
        "authorizes_unpublish": False,
        "authorizes_ab_test": False,
        "authorizes_traffic_split": False,
        "proven_lift": False,
        "commercial_failure_alert": False,
    }


def build_learning_queue(
    payload: Mapping[str, Any],
    *,
    contracts: Mapping[str, Any] | None = None,
    warmbly: Mapping[str, Any] | None = None,
    max_items: int = QUEUE_MAX,
) -> dict[str, Any]:
    """Small explainable improvement queue. Hypotheses, not auto-publish."""
    contracts = contracts or load_intent_contracts()
    pages = list(payload.get("pages") or [])
    queries = list(payload.get("queries") or [])
    known_paths = {_path_of(str(p.get("page") or p.get("path") or "")) for p in pages if p.get("page") or p.get("path")}
    candidates: list[dict[str, Any]] = []

    for q in queries:
        if q.get("omitted") or q.get("suppressed"):
            continue
        imps = parse_gsc_number(q.get("impressions"))
        clicks = parse_gsc_number(q.get("clicks"))
        if imps is None or imps < LEARNING_MIN_IMPRESSIONS:
            continue
        if is_failure_alert_forbidden(imps, clicks):
            continue
        text = str(q.get("query") or "")
        if is_suppressed_query(text):
            continue
        page = q.get("page")
        if not page:
            candidates.append(
                {
                    "diagnosis": "missing_commercial_page",
                    "hypothesis": "Página comercial ausente para demanda divulgada — construir destino canônico.",
                    "path": "",
                    "evidence": {
                        "impressions": imps,
                        "clicks": clicks,
                        "query_disclosed": True,
                        "query_text_in_queue": False,
                    },
                }
            )

    for p in pages:
        path = _path_of(str(p.get("page") or p.get("path") or ""))
        imps = parse_gsc_number(p.get("impressions"))
        clicks = parse_gsc_number(p.get("clicks"))
        if imps is None or imps < LEARNING_MIN_IMPRESSIONS:
            continue
        if clicks == 0 or clicks is None:
            if is_failure_alert_forbidden(imps, clicks or 0):
                continue
            candidates.append(
                {
                    "diagnosis": "pertinent_impression_without_click",
                    "hypothesis": "Impressão pertinente sem clique — avaliar snippet e intenção da consulta divulgada.",
                    "path": path,
                    "evidence": {"impressions": imps, "clicks": clicks, "denominator": imps},
                }
            )
        stages = p.get("commercial_stages") or commercial_stages(
            impressions=imps, clicks=clicks, contacts=p.get("contacts"), warmbly=warmbly
        )
        contact = stages.get("received_contact") or stages.get("contact") or {}
        if clicks and clicks > 0 and contact.get("status") == "observed" and (contact.get("value") or 0) == 0:
            candidates.append(
                {
                    "diagnosis": "visit_without_contact",
                    "hypothesis": "Visita sem contato recebido — revisar adequação e continuidade da página.",
                    "path": path,
                    "evidence": {"clicks": clicks, "contacts": 0, "denominator": clicks},
                }
            )
        elif clicks and clicks > 0 and contact.get("status") == "UNKNOWN":
            candidates.append(
                {
                    "diagnosis": "visit_without_contact",
                    "hypothesis": "Clique observado; contato ausente na fonte autorizada — campo desconhecido, não zero.",
                    "path": path,
                    "evidence": {"clicks": clicks, "contacts": None, "denominator": clicks},
                }
            )
        proposal = stages.get("proposal") or {}
        if contact.get("status") == "observed" and (contact.get("value") or 0) > 0 and proposal.get("status") == "UNKNOWN":
            candidates.append(
                {
                    "diagnosis": "contact_without_proposal",
                    "hypothesis": "Contato sem proposta na fonte comercial autorizada — investigar oferta e qualificação.",
                    "path": path,
                    "evidence": {"contacts": contact.get("value"), "proposal": None},
                }
            )

    # Prefer missing page, then snippet, then visit, then proposal. Cap at 3.
    order = {
        "missing_commercial_page": 0,
        "pertinent_impression_without_click": 1,
        "visit_without_contact": 2,
        "contact_without_proposal": 3,
    }
    candidates.sort(key=lambda c: (order.get(c["diagnosis"], 9), -(c.get("evidence", {}).get("impressions") or 0)))
    selected = []
    for i, spec in enumerate(candidates[:max_items], start=1):
        selected.append(_queue_item(rank=i, **spec))

    return {
        "schema": "confenge.gsc-learning-queue/1.0",
        "max_items": max_items,
        "count": len(selected),
        "candidates": selected,
        "authorizes_html_edit": False,
        "authorizes_publish": False,
        "authorizes_ab_test": False,
        "min_impressions_for_hypothesis": LEARNING_MIN_IMPRESSIONS,
        "one_impression_is_not_failure": True,
        "known_paths": sorted(p for p in known_paths if p),
        "inb01_fallback": contracts.get("fallback"),
    }


def redact_personal_fields(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if _fold(str(key)) in PERSONAL_FIELD_KEYS:
                continue
            out[key] = redact_personal_fields(item)
        return out
    if isinstance(value, list):
        return [redact_personal_fields(item) for item in value]
    return value


def artifact_contains_personal_field(value: Any) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            if _fold(str(key)) in PERSONAL_FIELD_KEYS:
                return True
            if artifact_contains_personal_field(item):
                return True
        return False
    if isinstance(value, list):
        return any(artifact_contains_personal_field(item) for item in value)
    return False


def parse_filters(rows: list[dict[str, str]]) -> dict[str, Any]:
    filters: dict[str, Any] = {
        "search_type": None,
        "country": None,
        "device": None,
        "date_label": None,
        "raw": [],
    }
    for row in rows:
        name = col(row, "filter") or next(iter(row.values()), "")
        value = col(row, "filter_value")
        if not value:
            keys = list(row.keys())
            if len(keys) >= 2:
                value = row.get(keys[1]) or ""
        folded = _fold(name)
        entry = {"filter": name, "value": value}
        filters["raw"].append(entry)
        if "tipo de pesquisa" in folded or folded in {"search type", "type"}:
            filters["search_type"] = (value or "").strip().lower() or None
        elif folded in {"pais", "país", "country"}:
            filters["country"] = value or None
        elif "dispositivo" in folded or folded == "device":
            filters["device"] = value or None
        elif folded in {"data", "date"}:
            filters["date_label"] = value or None
    return filters


def _row_metrics(row: Mapping[str, str], kind: str) -> dict[str, Any]:
    clicks = parse_gsc_number(col(row, "clicks"))
    imps = parse_gsc_number(col(row, "impressions"))
    pos = parse_gsc_number(col(row, "position"))
    csv_ctr = parse_gsc_rate(col(row, "ctr"))
    computed = ctr_from_sums(clicks, imps)
    out: dict[str, Any] = {
        "clicks": clicks,
        "impressions": imps,
        "ctr": computed["ctr"],
        "ctr_status": computed["status"],
        "ctr_csv": csv_ctr,
        "position": pos,
        "source": "csv_export",
        "dimension": kind,
    }
    if kind == "query":
        q = col(row, "query")
        out["query"] = q or None
        out["suppressed"] = is_suppressed_query(q)
        out["omitted"] = out["suppressed"]
        if out["suppressed"]:
            out["impressions"] = None if imps is None else imps
            out["clicks"] = None if clicks is None else clicks
            out["reconstructed"] = False
            out["status"] = "UNKNOWN"
    elif kind == "page":
        page = col(row, "page")
        out["page"] = page if page.startswith("http") or page.startswith("/") else (f"https://confenge.com.br{page}" if page else None)
        out["path"] = _path_of(out["page"] or "")
    elif kind == "property":
        out["date"] = col(row, "date") or None
    elif kind == "country":
        out["country_label"] = col(row, "country") or None
        label = _fold(out["country_label"] or "")
        out["country"] = "bra" if label in COUNTRY_LABELS_BRAZIL else (out["country_label"] or None)
        out["is_brazil"] = label in COUNTRY_LABELS_BRAZIL
    elif kind == "device":
        out["device"] = col(row, "device") or None
    return out


def _digest(payload: Mapping[str, Any]) -> str:
    material = {
        "site": payload.get("site"),
        "search_type": payload.get("search_type"),
        "effective_interval": payload.get("effective_interval"),
        "property_days": payload.get("property_days"),
        "pages": [
            {k: r.get(k) for k in ("page", "clicks", "impressions", "position")}
            for r in (payload.get("pages") or [])
        ],
        "queries": [
            {k: r.get(k) for k in ("query", "clicks", "impressions", "position", "suppressed")}
            for r in (payload.get("queries") or [])
        ],
        "countries": payload.get("countries"),
        "devices": payload.get("devices"),
    }
    blob = json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def complete_window_assessment(
    *,
    days: list[str],
    available_dates: set[str] | None,
    exploratory: bool,
) -> dict[str, Any]:
    if available_dates is None:
        return {
            "complete": False,
            "observed_complete": None,
            "completeness": "UNKNOWN",
            "comparable": False,
            "exploratory": exploratory,
            "missing_days": None,
            "note": "available_dates_absent_is_not_complete",
        }
    missing = sorted(set(days) - available_dates)
    observed_complete = not missing
    return {
        "complete": observed_complete,
        "observed_complete": observed_complete,
        "completeness": "observed" if observed_complete else "partial",
        "comparable": observed_complete and not exploratory,
        "exploratory": exploratory,
        "missing_days": missing,
        "note": None if observed_complete else "incomplete_window_is_not_zero",
    }


def compare_equivalent_windows(
    current_days: list[str],
    prior_days: list[str],
    available_dates: set[str] | None,
) -> dict[str, Any]:
    current = complete_window_assessment(days=current_days, available_dates=available_dates, exploratory=False)
    prior = complete_window_assessment(days=prior_days, available_dates=available_dates, exploratory=False)
    comparable = bool(current["comparable"] and prior["comparable"])
    return {
        "comparable": comparable,
        "status": "observed" if comparable else "INSUFFICIENT_EVIDENCE",
        "proven_lift": False,
        "current": current,
        "prior": prior,
        "note": None if comparable else "28_day_comparison_requires_two_complete_windows",
    }


def provider_failure_record(
    error: str,
    *,
    history_state: Mapping[str, Any] | None = None,
    site: str | None = None,
) -> dict[str, Any]:
    """Timeout / missing secret / API failure: null metrics, last good kept."""
    lkg = (history_state or {}).get("last_known_good") if history_state else None
    return {
        "ok": False,
        "blocked": True,
        "error": error,
        "source_kind": "credential_failure" if error in {"missing_credentials", "invalid_credentials"} else "absence",
        "source": error,
        "synthetic": False,
        "fixture": False,
        "historical": False,
        "ready_for_product_decisions": False,
        "freshness": "BLOCKED" if error == "missing_credentials" else "NOT_CURRENT",
        "external_evidence": True,
        "live_baseline_invented": False,
        "rows": None,
        "impressions": None,
        "clicks": None,
        "query_count": None,
        "site": site,
        "last_known_good": dict(lkg) if isinstance(lkg, dict) else None,
        "last_known_good_preserved": bool(lkg),
        "metrics_zeroed": False,
        "search_analytics_calendar_timezone": "America/Los_Angeles",
        "executive_report_timezone": "America/Sao_Paulo",
    }


def delayed_data_status(last_data_date: date | None, *, expected_end: date | None) -> dict[str, Any]:
    if last_data_date is None or expected_end is None:
        return {"status": "UNKNOWN", "delayed": None, "zero_filled": False}
    if last_data_date < expected_end:
        return {
            "status": "DELAYED",
            "delayed": True,
            "last_data_date": last_data_date.isoformat(),
            "expected_end": expected_end.isoformat(),
            "zero_filled": False,
        }
    return {
        "status": "observed",
        "delayed": False,
        "last_data_date": last_data_date.isoformat(),
        "expected_end": expected_end.isoformat(),
        "zero_filled": False,
    }


def import_gsc_export(
    src: Path,
    *,
    as_of: str | None = None,
    extracted_at: str | None = None,
    site: str | None = None,
    search_type: str | None = None,
    zip_path: Path | None = None,
    origin: str | None = None,
    persist: bool = True,
    data_dir: Path | None = None,
    private_dir: Path | None = None,
    contracts: Mapping[str, Any] | None = None,
    root: Path | None = None,
) -> dict[str, Any]:
    """Import a GSC UI directory or a previously extracted ZIP. Never CURRENT."""
    from scripts.revops import search_demand_observatory as sdo

    root = root or ROOT
    src = src if src.is_absolute() else (root / src)
    contracts = contracts or load_intent_contracts(root=root)
    meta = load_json(src / "meta.json") if src.is_dir() else None
    meta = meta if isinstance(meta, dict) else {}

    zip_date = zip_filename_date(zip_path) if zip_path else zip_filename_date(src) if src.suffix.lower() == ".zip" else None
    extracted_at = extracted_at or meta.get("extracted_at")
    site = site or meta.get("site") or "sc-domain:confenge.com.br"
    search_type = (search_type or meta.get("search_type") or "web").lower()
    origin = origin or meta.get("origin") or ("zip_export" if zip_path else "csv_export")
    source_flags = resolve_import_source_kind(meta, origin=origin)
    labels_not_observed = bool(meta.get("query_labels_are_not_observed_search_terms"))
    sa_today = search_analytics_today()

    csv_files = sorted(src.glob("*.csv")) if src.is_dir() else []
    grouped: dict[str, list[dict[str, Any]]] = {
        "property": [],
        "page": [],
        "query": [],
        "country": [],
        "device": [],
        "filters": [],
    }
    skipped: list[str] = []
    for csv_path in csv_files:
        rows = read_csv_rows(csv_path)
        kind = classify_csv_kind(csv_path, rows)
        if kind == "filters":
            grouped["filters"] = rows
            continue
        if kind in {"unknown", "page_by_device"}:
            skipped.append(f"{csv_path.name}:{kind}")
            continue
        parsed = [_row_metrics(row, kind) for row in rows]
        grouped[kind] = parsed

    filters = parse_filters(grouped["filters"]) if grouped["filters"] else {
        "search_type": search_type,
        "country": None,
        "device": None,
        "date_label": None,
        "raw": [],
    }
    if filters.get("search_type"):
        search_type = str(filters["search_type"]).lower()

    if labels_not_observed:
        for row in grouped["query"]:
            if row.get("suppressed"):
                continue
            row["query"] = None
            row["query_text_observed"] = False
            row["query_label_status"] = "UNKNOWN"
            row["disclosed_metrics_only"] = True
            row["page_grain_promoted_to_query"] = False
            row["reconstructed"] = False
    disclosed_queries = [r for r in grouped["query"] if not r.get("suppressed")]
    suppressed_queries = [r for r in grouped["query"] if r.get("suppressed")]
    omitted = {
        "status": "UNKNOWN" if suppressed_queries or grouped["query"] else ("ABSENT" if not grouped["query"] else "UNKNOWN"),
        "reconstructed": False,
        "suppressed_row_count": len(suppressed_queries),
        "disclosed_row_count": len(disclosed_queries),
        "note": "omitted_query_is_not_zero_and_cannot_be_reconstructed",
        "unknown_click_terms": True,
    }

    property_totals = _metric_totals(grouped["property"])
    page_totals = _metric_totals(grouped["page"])
    query_totals = _metric_totals(disclosed_queries)
    country_totals = _metric_totals(grouped["country"])
    device_totals = _metric_totals(grouped["device"])

    brazil_row = next((r for r in grouped["country"] if r.get("is_brazil")), None)
    brazil = None
    if brazil_row:
        brazil = {
            "available": True,
            "label": brazil_row.get("country_label"),
            "country": brazil_row.get("country"),
            "clicks": brazil_row.get("clicks"),
            "impressions": brazil_row.get("impressions"),
            "filter_present": filters.get("country") is not None,
        }
    brazil_filter_present = filters.get("country") is not None

    dates = [parse_search_analytics_date(r.get("date")) for r in grouped["property"]]
    dates_ok = [d for d in dates if d is not None]
    last_data_date = max(dates_ok).isoformat() if dates_ok else None
    start_date = min(dates_ok).isoformat() if dates_ok else None
    # as_of is last complete data day of this export, never extraction or release.
    requested_as_of = as_of
    as_of = last_data_date or requested_as_of
    file_stamp = last_data_date or requested_as_of
    if extracted_at and as_of and str(extracted_at)[:10] != str(as_of)[:10]:
        extracted_at_is_not_as_of = True
    else:
        extracted_at_is_not_as_of = bool(extracted_at) and bool(as_of)
    for row in grouped["property"]:
        row_day = parse_search_analytics_date(row.get("date"))
        row["current_day"] = incomplete_current_day_status(row_day, today=sa_today)
    if zip_date and zip_date != last_data_date:
        zip_date_note = "zip_filename_date_is_not_last_data_date"
    else:
        zip_date_note = "zip_filename_date_unused" if zip_date else None

    for page in grouped["page"]:
        page["need"] = classify_need_class(str(page.get("page") or page.get("path") or ""), contracts)
        page["cohort"] = publication_cohort(str(page.get("page") or page.get("path") or ""))
        page["commercial_stages"] = commercial_stages(
            impressions=page.get("impressions"),
            clicks=page.get("clicks"),
            contacts=None,
            warmbly=None,
        )
        page["country"] = None
        page["branded"] = False

    for query in disclosed_queries:
        query["country"] = None
        query["page"] = query.get("page")
        query["need"] = classify_need_class(str(query.get("page") or ""), contracts) if query.get("page") else {
            "need_class": "unknown",
            "reason": "query_without_page_join",
            "home_click_does_not_infer_brand": True,
            "url_keyword_classifier": False,
            "version": NEED_CLASS_VERSION,
        }

    incomplete_days = [
        r.get("current_day")
        for r in grouped["property"]
        if (r.get("current_day") or {}).get("incomplete")
    ]
    payload: dict[str, Any] = {
        "schema": IMPORT_SCHEMA,
        "ok": True,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "as_of": as_of,
        "extracted_at": extracted_at,
        "last_data_date": last_data_date,
        "effective_interval": {"start": start_date, "end": last_data_date},
        "site": site,
        "search_type": search_type,
        "origin": source_flags["origin"],
        "source": "csv_export",
        "source_kind": source_flags["source_kind"],
        "source_dir": str(src.relative_to(root)) if src.is_relative_to(root) else str(src),
        "synthetic": source_flags["synthetic"],
        "fixture": source_flags["fixture"],
        "provided_aggregate": source_flags["provided_aggregate"],
        "historical": source_flags["historical"],
        "ready_for_product_decisions": False,
        "live_baseline_invented": False,
        "freshness": "NOT_CURRENT",
        "ingest_does_not_reset_freshness": True,
        "as_of_not_rewritten_as_release": True,
        "extracted_at_is_not_as_of": extracted_at_is_not_as_of,
        "query_labels_are_not_observed_search_terms": labels_not_observed,
        "page_grain_is_not_query": True,
        "unknown_click_terms": True,
        "current_day_incomplete": bool(incomplete_days),
        "incomplete_current_days": incomplete_days,
        "incomplete_current_day_zero_filled": False,
        "search_analytics_calendar_timezone": "America/Los_Angeles",
        "executive_report_timezone": "America/Sao_Paulo",
        "aggregate_date_not_shifted_as_utc": True,
        "zip_filename_date": zip_date,
        "zip_filename_date_note": zip_date_note,
        "filters": {
            **filters,
            "brazil_filter_present": brazil_filter_present,
            "brazil_not_invented": (not brazil_filter_present),
        },
        "dimensions": {
            "property": {
                "available": bool(grouped["property"]),
                "grain": "date",
                "status": "observed" if grouped["property"] else "ABSENT",
                **property_totals,
            },
            "page": {
                "available": bool(grouped["page"]),
                "grain": "page",
                "status": "observed" if grouped["page"] else "ABSENT",
                **page_totals,
            },
            "query": {
                "available": bool(disclosed_queries),
                "grain": "query",
                "status": "observed" if disclosed_queries else "ABSENT",
                "omitted": omitted,
                **query_totals,
            },
            "country": {
                "available": bool(grouped["country"]),
                "grain": "country",
                "status": "observed" if grouped["country"] else "ABSENT",
                "brazil": brazil,
                "brazil_filter_present": brazil_filter_present,
                **country_totals,
            },
            "device": {
                "available": bool(grouped["device"]),
                "grain": "device",
                "status": "observed" if grouped["device"] else "ABSENT",
                **device_totals,
            },
        },
        "cross_dimension_join_forbidden": True,
        "property_days": grouped["property"],
        "pages": grouped["page"],
        "queries": disclosed_queries,
        "suppressed_queries": [{"status": "UNKNOWN", "reconstructed": False} for _ in suppressed_queries],
        "countries": grouped["country"],
        "devices": grouped["device"],
        "query_count": len(disclosed_queries),
        "page_count": len(grouped["page"]),
        "omitted_queries": omitted,
        "skipped_files": skipped,
        "completeness": {
            "status": "partial",
            "api_guarantees_all_rows": False,
            "truncated": False,
            "preliminary": False,
            "note": "Search Analytics may return top rows only; disclosed query table is not the property universe.",
        },
        "search_analytics_limitation": (
            "Search Analytics may return top rows only and is not an exhaustive total. "
            "Row counts describe the returned set, not the property universe. "
            "Page, query and country tables are separate aggregations."
        ),
        "inb01": {
            "present": bool(contracts.get("inb01_present")),
            "fallback": contracts.get("fallback"),
            "level": "HARD_AT_RELEASE",
        },
    }
    payload["idempotency_key"] = _digest(payload)
    payload["learning_queue"] = build_learning_queue(payload, contracts=contracts)

    if persist:
        data = data_dir or sdo.DATA
        private = private_dir or sdo.PRIVATE_DIR
        data.mkdir(parents=True, exist_ok=True)
        (data / "imports").mkdir(parents=True, exist_ok=True)
        private.mkdir(parents=True, exist_ok=True)
        public = redact_personal_fields(sdo.git_safe_live_payload(payload) if hasattr(sdo, "git_safe_live_payload") else payload)
        public["ready_for_product_decisions"] = False
        public["freshness"] = "NOT_CURRENT"
        public["source_kind"] = source_flags["source_kind"]
        public["provided_aggregate"] = source_flags["provided_aggregate"]
        public["fixture"] = source_flags["fixture"]
        public["synthetic"] = source_flags["synthetic"]
        dest_name = f"import-{file_stamp or 'undated'}.json"
        dest = data / "imports" / dest_name
        existing = None
        if dest.is_file():
            try:
                existing = json.loads(dest.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing = None
        if existing and existing.get("idempotency_key") == payload["idempotency_key"]:
            payload["idempotent_replay"] = True
            payload["duplicate_rows_written"] = False
            return payload
        (private / "latest_import.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        dest.write_text(json.dumps(public, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        latest = data / "latest_import.json"
        overwrite_latest = True
        if latest.is_file():
            try:
                existing_latest = json.loads(latest.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing_latest = None
            if existing_latest and sdo.is_live_gsc_payload(existing_latest):
                overwrite_latest = False
        if overwrite_latest:
            latest.write_text(
                json.dumps(public, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        payload["idempotent_replay"] = False
        payload["duplicate_rows_written"] = False
        payload["overwrote_live_latest"] = False
        payload["persisted_public"] = str(dest.relative_to(root)) if dest.is_relative_to(root) else str(dest)
        payload["persisted_private"] = str((private / "latest_import.json"))
    return payload


def import_gsc_zip(
    zip_path: Path,
    *,
    dest: Path | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    zip_path = zip_path if zip_path.is_absolute() else ROOT / zip_path
    dest = dest or Path(kwargs.pop("extract_dir", zip_path.with_suffix("")))
    extracted = safe_unzip(zip_path, dest)
    if not extracted:
        return {"ok": False, "error": "zip_had_no_permitted_members", "zip": str(zip_path)}
    # Prefer a directory that actually contains CSVs (handles a single top folder).
    csv_parent = dest
    csvs = list(dest.glob("*.csv"))
    if not csvs:
        nested = [p.parent for p in dest.rglob("*.csv")]
        if nested:
            csv_parent = nested[0]
    return import_gsc_export(csv_parent, zip_path=zip_path, **kwargs)


def build_operational_learning(
    payload: Mapping[str, Any],
    *,
    contracts: Mapping[str, Any] | None = None,
    warmbly: Mapping[str, Any] | None = None,
    today: date | None = None,
    search_analytics_today_date: date | None = None,
) -> dict[str, Any]:
    contracts = contracts or load_intent_contracts()
    today = today or executive_today()
    sa_today = search_analytics_today_date or search_analytics_today()
    dims = isolate_dimension_totals(payload)
    available_dates = {
        str(r.get("date"))
        for r in (payload.get("property_days") or [])
        if r.get("date")
    }
    last = parse_search_analytics_date(payload.get("last_data_date") or payload.get("as_of"))
    pulse_days = []
    trend_days = []
    prior_days = []
    if last:
        pulse_end = last
        pulse_start = pulse_end - timedelta(days=6)
        trend_start = pulse_end - timedelta(days=27)
        prior_end = trend_start - timedelta(days=1)
        prior_start = prior_end - timedelta(days=27)
        cur = pulse_start
        while cur <= pulse_end:
            pulse_days.append(cur.isoformat())
            cur += timedelta(days=1)
        cur = trend_start
        while cur <= pulse_end:
            trend_days.append(cur.isoformat())
            cur += timedelta(days=1)
        cur = prior_start
        while cur <= prior_end:
            prior_days.append(cur.isoformat())
            cur += timedelta(days=1)
    pulse = complete_window_assessment(days=pulse_days, available_dates=available_dates or None, exploratory=True)
    trend = compare_equivalent_windows(trend_days, prior_days, available_dates or None)
    expected_end = search_analytics_last_complete_day(today=sa_today)
    delayed = delayed_data_status(last, expected_end=expected_end)
    queue = build_learning_queue(payload, contracts=contracts, warmbly=warmbly)
    pages = []
    for page in payload.get("pages") or []:
        pages.append(
            {
                "path": page.get("path"),
                "need": page.get("need") or classify_need_class(str(page.get("page") or ""), contracts),
                "cohort": page.get("cohort") or publication_cohort(str(page.get("page") or "")),
                "commercial_stages": page.get("commercial_stages")
                or commercial_stages(
                    impressions=page.get("impressions"),
                    clicks=page.get("clicks"),
                    warmbly=warmbly,
                ),
                "impressions": page.get("impressions"),
                "clicks": page.get("clicks"),
            }
        )
    reading = {
        "schema": LEARNING_SCHEMA,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "executive_report_timezone": "America/Sao_Paulo",
        "search_analytics_calendar_timezone": "America/Los_Angeles",
        "as_of": payload.get("as_of"),
        "last_data_date": payload.get("last_data_date"),
        "extracted_at": payload.get("extracted_at"),
        "site": payload.get("site"),
        "search_type": payload.get("search_type"),
        "origin": payload.get("origin"),
        "source_kind": payload.get("source_kind") or "historical_csv_export",
        "freshness": "NOT_CURRENT",
        "ready_for_product_decisions": False,
        "fixture": bool(payload.get("fixture")) and payload.get("source_kind") != "provided_aggregate",
        "provided_aggregate": payload.get("source_kind") == "provided_aggregate" or bool(payload.get("provided_aggregate")),
        "historical": True,
        "synthetic": bool(payload.get("synthetic")) and payload.get("source_kind") != "provided_aggregate",
        "external_evidence": payload.get("source_kind") not in {"search_analytics_api", "search_analytics_top_row_truncation"},
        "page_grain_is_not_query": True,
        "query_labels_are_not_observed_search_terms": bool(payload.get("query_labels_are_not_observed_search_terms")),
        "as_of_not_rewritten_as_release": True,
        "dimensions": dims,
        "omitted_queries": payload.get("omitted_queries"),
        "windows": {
            "pulse_7": {"days": pulse_days, "exploratory": True, **pulse},
            "trend_28": {"days": trend_days, **(trend.get("current") or {})},
            "prior_28": {"days": prior_days, **(trend.get("prior") or {})},
            "comparison_28": trend,
        },
        "delayed": delayed,
        "pages": pages,
        "queue": queue,
        "brazil_filter_present": (payload.get("filters") or {}).get("brazil_filter_present"),
        "inb01": payload.get("inb01") or {
            "present": bool(contracts.get("inb01_present")),
            "fallback": contracts.get("fallback"),
            "level": "HARD_AT_RELEASE",
        },
        "anonymous_query_not_joined_to_person": True,
        "observatory_readiness_not_required_for_private_page": True,
    }
    safe = redact_personal_fields(reading)
    if artifact_contains_personal_field(safe):
        raise ValueError("personal_field_in_learning_artifact")
    return safe
