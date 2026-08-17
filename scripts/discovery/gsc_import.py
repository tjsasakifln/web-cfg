"""Local Google Search Console export importer. No credentials."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

from scripts.discovery.observation import (
    REASON_AMBIGUOUS_FILE,
    REASON_PERIOD_FILTER_ABSENT,
    REASON_PROVEN_ZERO,
    REASON_ZERO_ROWS,
    ObservationError,
    build_observation,
    sha256_text,
)

INGEST_SOURCE = "gsc_export"
DATE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATE_DMY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")

QUERY_ALIASES = (
    "query",
    "consulta",
    "consultas",
    "top consultas",
    "top queries",
)
PAGE_ALIASES = ("page", "página", "pagina", "páginas", "paginas", "landing page", "url")
COUNTRY_ALIASES = ("country", "país", "pais")
DEVICE_ALIASES = ("device", "dispositivo")
DATE_ALIASES = ("date", "data", "day", "dia")
IMPRESSION_ALIASES = ("impressions", "impressões", "impressoes", "impr")
CLICK_ALIASES = ("clicks", "cliques")
CTR_ALIASES = ("ctr", "click through rate")
POSITION_ALIASES = ("position", "posição", "posicao", "avg. position", "average position")
PERIOD_START_ALIASES = ("period_start", "start_date", "startdate", "início", "inicio")
PERIOD_END_ALIASES = ("period_end", "end_date", "enddate", "fim")


class GscImportError(ObservationError):
    """Export could not be imported without inventing facts."""


def _norm_key(key: str | None) -> str:
    return re.sub(r"\s+", " ", (key or "").strip().lower())


def _lookup(row: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    mapped = {_norm_key(k): v for k, v in row.items()}
    for alias in aliases:
        if alias in mapped:
            return mapped[alias]
        for key, value in mapped.items():
            if alias == key or alias in key:
                return value
    return None


def detect_locale(headers: list[str], sample_values: list[str]) -> str:
    joined = " ".join(_norm_key(h) for h in headers)
    if any(token in joined for token in ("consulta", "página", "pagina", "cliques", "impressões", "impressoes", "posição", "posicao", "país", "pais")):
        return "pt-BR"
    if any(token in joined for token in ("query", "page", "clicks", "impressions", "position", "country")):
        return "en-US"
    for value in sample_values:
        text = str(value or "")
        if re.search(r"\d+\.\d{3},\d+", text) or (text.endswith("%") and "," in text):
            return "pt-BR"
    return "en-US"


def parse_number(value: Any, *, locale: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip()
    if text == "":
        return None
    text = text.replace("%", "").replace("\xa0", "").replace(" ", "")
    if locale == "pt-BR":
        if re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
            text = text.replace(".", "")
        elif "," in text and "." in text:
            text = text.replace(".", "").replace(",", ".")
        elif "," in text:
            text = text.replace(",", ".")
    else:
        if "," in text and "." in text:
            text = text.replace(",", "")
        elif "," in text and re.fullmatch(r"\d{1,3}(,\d{3})+", text):
            text = text.replace(",", "")
    try:
        return float(text)
    except ValueError as exc:
        raise GscImportError(f"unparseable_number:{value}") from exc


def parse_percent(value: Any, *, locale: str) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    raw = str(value)
    number = parse_number(value, locale=locale)
    if number is None:
        return None
    if "%" in raw or number > 1:
        return number / 100.0
    return number


def parse_date(value: Any, *, locale: str) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if DATE_ISO.match(text):
        return text
    match = DATE_DMY.match(text)
    if match:
        a, b, year = int(match.group(1)), int(match.group(2)), match.group(3)
        if locale == "pt-BR":
            day, month = a, b
        else:
            month, day = a, b
            # ISO-looking leftovers already handled; if month>12, treat as DMY.
            if month > 12 and day <= 12:
                month, day = day, month
        if not (1 <= month <= 12 and 1 <= day <= 31):
            raise GscImportError(f"unparseable_date:{value}")
        return f"{year}-{month:02d}-{day:02d}"
    raise GscImportError(f"unparseable_date:{value}")


def _decode(path: Path) -> tuple[str, bytes]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(enc), raw
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), raw


def _has_metric_headers(headers: list[str]) -> bool:
    mapped = {_norm_key(h) for h in headers}
    has_query_or_page = any(
        any(alias in key for alias in QUERY_ALIASES + PAGE_ALIASES) for key in mapped
    )
    has_metric = any(
        any(alias in key for alias in IMPRESSION_ALIASES + CLICK_ALIASES) for key in mapped
    )
    return has_query_or_page and has_metric


def _metadata_period(payload: dict[str, Any]) -> tuple[str | None, str | None, dict[str, Any]]:
    period = payload.get("period") if isinstance(payload.get("period"), dict) else {}
    start = (
        payload.get("startDate")
        or payload.get("start_date")
        or period.get("start")
        or period.get("startDate")
    )
    end = (
        payload.get("endDate")
        or payload.get("end_date")
        or period.get("end")
        or period.get("endDate")
    )
    filters = payload.get("filters") if isinstance(payload.get("filters"), dict) else {}
    return (
        str(start) if start else None,
        str(end) if end else None,
        filters,
    )


def _row_to_normalized(
    row: dict[str, Any],
    *,
    locale: str,
    default_period: tuple[str | None, str | None],
    filters: dict[str, Any],
    source_file_hash: str,
    source_name: str,
    timezone: str | None,
) -> dict[str, Any]:
    query = _lookup(row, QUERY_ALIASES)
    page = _lookup(row, PAGE_ALIASES)
    country = _lookup(row, COUNTRY_ALIASES)
    device = _lookup(row, DEVICE_ALIASES)
    raw_date = _lookup(row, DATE_ALIASES)
    date = parse_date(raw_date, locale=locale) if raw_date not in (None, "") else None
    impressions = parse_number(_lookup(row, IMPRESSION_ALIASES), locale=locale)
    clicks = parse_number(_lookup(row, CLICK_ALIASES), locale=locale)
    ctr = parse_percent(_lookup(row, CTR_ALIASES), locale=locale)
    position = parse_number(_lookup(row, POSITION_ALIASES), locale=locale)
    period_start = parse_date(_lookup(row, PERIOD_START_ALIASES), locale=locale) if _lookup(row, PERIOD_START_ALIASES) else default_period[0]
    period_end = parse_date(_lookup(row, PERIOD_END_ALIASES), locale=locale) if _lookup(row, PERIOD_END_ALIASES) else default_period[1]
    if date and not period_start:
        period_start = date
    if date and not period_end:
        period_end = date
    original_hash = sha256_text(
        json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
    )
    return {
        "date": date,
        "query": None if query in (None, "") else str(query),
        "page": None if page in (None, "") else str(page),
        "country": None if country in (None, "") else str(country),
        "device": None if device in (None, "") else str(device),
        "impressions": impressions,
        "clicks": clicks,
        "ctr": ctr,
        "position": position,
        "period_start": period_start,
        "period_end": period_end,
        "filters": filters,
        "timezone": timezone,
        "export_source": source_name,
        "source_file_hash": source_file_hash,
        "row_hash": original_hash,
        "original_row": row,
        "locale": locale,
    }


def _dedupe_key(row: dict[str, Any]) -> str:
    payload = {
        "date": row.get("date"),
        "query": row.get("query"),
        "page": row.get("page"),
        "country": row.get("country"),
        "device": row.get("device"),
        "period_start": row.get("period_start"),
        "period_end": row.get("period_end"),
        "source_file_hash": row.get("source_file_hash"),
    }
    return sha256_text(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def parse_gsc_csv(
    text: str,
    *,
    source_file_hash: str,
    source_name: str,
    timezone: str | None = None,
    default_period: tuple[str | None, str | None] = (None, None),
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    reader = csv.DictReader(text.splitlines())
    headers = list(reader.fieldnames or [])
    if not headers or not _has_metric_headers(headers):
        raise GscImportError(REASON_AMBIGUOUS_FILE)
    raw_rows = [{(k or "").strip(): (v if v is not None else "") for k, v in row.items()} for row in reader]
    sample = [str(v) for row in raw_rows[:5] for v in row.values()]
    locale = detect_locale(headers, sample)
    filters = filters or {}
    return [
        _row_to_normalized(
            row,
            locale=locale,
            default_period=default_period,
            filters=filters,
            source_file_hash=source_file_hash,
            source_name=source_name,
            timezone=timezone,
        )
        for row in raw_rows
    ]


def _api_row(row: dict[str, Any], dimensions: list[str]) -> dict[str, Any]:
    keys = row.get("keys")
    mapped = dict(row)
    if isinstance(keys, list):
        for index, dim in enumerate(dimensions):
            if index < len(keys):
                mapped[dim] = keys[index]
    return mapped


def parse_gsc_json(
    payload: Any,
    *,
    source_file_hash: str,
    source_name: str,
    timezone: str | None = None,
) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        payload = {"rows": payload}
    if not isinstance(payload, dict):
        raise GscImportError(REASON_AMBIGUOUS_FILE)
    period_start, period_end, filters = _metadata_period(payload)
    tz = timezone or payload.get("timezone") or payload.get("timeZone")
    rows = payload.get("rows")
    if rows is None and any(_norm_key(k) in QUERY_ALIASES + PAGE_ALIASES for k in payload):
        rows = [payload]
    if not isinstance(rows, list):
        raise GscImportError(REASON_AMBIGUOUS_FILE)
    dimensions = payload.get("dimensions") or payload.get("requestedDimensions") or []
    if not isinstance(dimensions, list):
        dimensions = []
    dimensions = [str(d).lower() for d in dimensions]
    if not dimensions and rows and isinstance(rows[0], dict) and isinstance(rows[0].get("keys"), list):
        # Infer only when keys are obviously query/page shaped and length<=2.
        first_keys = rows[0]["keys"]
        inferred: list[str] = []
        for key in first_keys:
            text = str(key)
            if text.startswith("http"):
                inferred.append("page")
            else:
                inferred.append("query")
        if inferred.count("page") > 1 or not inferred:
            raise GscImportError(REASON_AMBIGUOUS_FILE)
        dimensions = inferred
    normalized_source: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise GscImportError(REASON_AMBIGUOUS_FILE)
        normalized_source.append(_api_row(row, dimensions))
    if normalized_source:
        headers = list(normalized_source[0].keys())
        if not _has_metric_headers(headers) and not (
            any(h in {"impressions", "clicks"} for h in headers) and any(h in {"query", "page"} for h in headers)
        ):
            raise GscImportError(REASON_AMBIGUOUS_FILE)
    locale = detect_locale(
        list(normalized_source[0].keys()) if normalized_source else ["query", "impressions"],
        [str(v) for row in normalized_source[:5] for v in row.values()],
    )
    return [
        _row_to_normalized(
            row,
            locale=locale,
            default_period=(period_start, period_end),
            filters=filters,
            source_file_hash=source_file_hash,
            source_name=source_name,
            timezone=str(tz) if tz else None,
        )
        for row in normalized_source
    ]


def match_asset_id(page: str | None, cohort_assets: list[dict[str, Any]]) -> str | None:
    if not page:
        return None
    target = page.rstrip("/") + "/"
    for asset in cohort_assets:
        canonical = asset.get("canonical")
        if not canonical:
            continue
        if canonical.rstrip("/") + "/" == target or canonical.rstrip("/") == page.rstrip("/"):
            return str(asset["id"])
    return None


def rows_to_observations(
    rows: list[dict[str, Any]],
    *,
    asset_id: str,
    observed_at: str,
    default_asset_id: str | None = None,
) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        key = _dedupe_key(row)
        if key in seen:
            continue
        seen.add(key)
        period_missing = not row.get("period_start") and not row.get("date")
        reasons = []
        if period_missing and not row.get("filters"):
            reasons.append(REASON_PERIOD_FILTER_ABSENT)
        impressions = row.get("impressions")
        status = "observed"
        if impressions == 0:
            reasons.append(REASON_PROVEN_ZERO)
            status = "PROVEN_ZERO"
        target_asset = default_asset_id or asset_id
        observations.append(
            build_observation(
                asset_id=target_asset,
                observation_type="gsc",
                observed_at=observed_at,
                source=INGEST_SOURCE,
                status=status,
                reason_codes=reasons,
                period_start=row.get("period_start") or row.get("date"),
                period_end=row.get("period_end") or row.get("date"),
                source_file_hash=row.get("source_file_hash"),
                dimensions={
                    "query": row.get("query"),
                    "page": row.get("page"),
                    "country": row.get("country"),
                    "device": row.get("device"),
                    "date": row.get("date"),
                    "filters": row.get("filters") or {},
                    "timezone": row.get("timezone"),
                    "export_source": row.get("export_source"),
                    "row_hash": row.get("row_hash"),
                    "dedupe_key": key,
                },
                metrics={
                    "impressions": impressions,
                    "clicks": row.get("clicks"),
                    "ctr": row.get("ctr"),
                    "position": row.get("position"),
                },
            )
        )
    return observations


def empty_export_observation(
    *,
    asset_id: str,
    observed_at: str,
    source_file_hash: str,
    period_start: str | None,
    period_end: str | None,
    filters: dict[str, Any] | None,
    source_name: str,
) -> dict[str, Any]:
    if not period_start or not period_end:
        raise GscImportError(REASON_AMBIGUOUS_FILE)
    return build_observation(
        asset_id=asset_id,
        observation_type="gsc",
        observed_at=observed_at,
        source=INGEST_SOURCE,
        status="NO_ROWS",
        reason_codes=[REASON_ZERO_ROWS],
        period_start=period_start,
        period_end=period_end,
        source_file_hash=source_file_hash,
        dimensions={
            "filters": filters or {},
            "export_source": source_name,
            "row_count": 0,
        },
        metrics={
            "impressions": None,
            "clicks": None,
            "ctr": None,
            "position": None,
            "row_count": 0,
        },
    )


def import_gsc_file(
    path: Path,
    *,
    asset_id: str,
    observed_at: str,
    timezone: str | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    text, raw = _decode(path)
    digest = sha256_text(raw)
    suffix = path.suffix.lower()
    if suffix in {".json"}:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise GscImportError(REASON_AMBIGUOUS_FILE) from exc
        meta_start, meta_end, meta_filters = _metadata_period(payload) if isinstance(payload, dict) else (None, None, {})
        rows = parse_gsc_json(
            payload,
            source_file_hash=digest,
            source_name=path.name,
            timezone=timezone,
        )
        start = period_start or meta_start
        end = period_end or meta_end
        used_filters = filters or meta_filters
        if not rows:
            return [
                empty_export_observation(
                    asset_id=asset_id,
                    observed_at=observed_at,
                    source_file_hash=digest,
                    period_start=start,
                    period_end=end,
                    filters=used_filters,
                    source_name=path.name,
                )
            ]
        if start or end:
            for row in rows:
                row["period_start"] = row.get("period_start") or start
                row["period_end"] = row.get("period_end") or end
        return rows_to_observations(rows, asset_id=asset_id, observed_at=observed_at)
    if suffix in {".csv", ".tsv"}:
        rows = parse_gsc_csv(
            text,
            source_file_hash=digest,
            source_name=path.name,
            timezone=timezone,
            default_period=(period_start, period_end),
            filters=filters,
        )
        if not rows:
            if period_start and period_end:
                return [
                    empty_export_observation(
                        asset_id=asset_id,
                        observed_at=observed_at,
                        source_file_hash=digest,
                        period_start=period_start,
                        period_end=period_end,
                        filters=filters,
                        source_name=path.name,
                    )
                ]
            raise GscImportError(REASON_AMBIGUOUS_FILE)
        return rows_to_observations(rows, asset_id=asset_id, observed_at=observed_at)
    raise GscImportError(REASON_AMBIGUOUS_FILE)
