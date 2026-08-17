"""Load Google Search Console CSV exports (multi-export, multi-dimension).

Preserves aggregation discrepancies between tables — never force-reconcile.
Every normalized demand row carries query/page/device/country/date. Missing
dimensions stay None. A missing query×page matrix is join_unavailable.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

PRIVACY_NOTE = (
    "GSC dimensional tables are independently aggregated and privacy-thresholded. "
    "Page/query/device/country/date totals are not force-reconciled. "
    "A missing query×page matrix is join_unavailable, not a fabricated join."
)

COUNTRY_KEYS: dict[str, str] = {
    "brasil": "bra",
    "brazil": "bra",
    "estados unidos": "usa",
    "united states": "usa",
    "eua": "usa",
    "usa": "usa",
    "espanha": "esp",
    "spain": "esp",
    "angola": "ago",
    "franca": "fra",
    "frança": "fra",
    "france": "fra",
    "reino unido": "gbr",
    "united kingdom": "gbr",
    "uk": "gbr",
    "costa rica": "cri",
    "paises baixos": "nld",
    "países baixos": "nld",
    "netherlands": "nld",
    "russia": "rus",
    "rússia": "rus",
    "vietna": "vnm",
    "vietnã": "vnm",
    "vietnam": "vnm",
    "ucrania": "ukr",
    "ucrânia": "ukr",
    "ukraine": "ukr",
}


def _f(row: dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        if k in row and row[k] not in (None, ""):
            raw = str(row[k]).strip().replace("%", "").replace(",", ".")
            try:
                return float(raw)
            except ValueError:
                continue
    return default


def _s(row: dict[str, Any], *keys: str, default: str = "") -> str:
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return str(row[k]).strip()
    return default


def load_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def normalize_path(url: str) -> str:
    """Normalize GSC page URL → site path.

    Strips host (http/https, www), drops query string and fragment, and applies
    trailing-slash convention for directory-like paths.
    """
    u = (url or "").strip()
    if "?" in u:
        u = u.split("?", 1)[0]
    if "#" in u:
        u = u.split("#", 1)[0]
    for prefix in (
        "https://confenge.com.br",
        "http://confenge.com.br",
        "https://www.confenge.com.br",
        "http://www.confenge.com.br",
    ):
        if u.startswith(prefix):
            u = u[len(prefix) :] or "/"
            break
    if not u.startswith("/"):
        u = "/" + u if u else "/"
    # keep trailing slash convention for site paths that are directories
    if u != "/" and not u.endswith("/") and "." not in u.rsplit("/", 1)[-1]:
        u = u + "/"
    return u


def _is_total_or_junk_label(value: str) -> bool:
    v = (value or "").strip().lower()
    return v in {"", "total", "totais", "totals", "soma", "—", "-", "n/a", "na"}


def load_pages(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        url = _s(r, "page", "Páginas principais", "Páginas", "URL")
        if not url or _is_total_or_junk_label(url):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr_cell = str(r.get("CTR") or r.get("ctr") or "")
        if "%" in ctr_cell:
            ctr = _f(r, "ctr", "CTR") / 100.0
        elif impressions > 0:
            ctr = clicks / impressions
        else:
            ctr = 0.0
        out.append(
            {
                "url": url,
                "path": normalize_path(url),
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr if impressions else 0.0,
            }
        )
    return out


def load_queries(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        q = _s(r, "query", "Top consultas", "Consultas")
        if not q or _is_total_or_junk_label(q):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        out.append(
            {
                "query": q,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
            }
        )
    return out


def load_devices(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        device = _s(r, "device", "Dispositivo")
        if not device or _is_total_or_junk_label(device):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        # normalize device labels
        dlow = device.lower()
        if "celular" in dlow or "mobile" in dlow:
            device_key = "mobile"
        elif "computador" in dlow or "desktop" in dlow:
            device_key = "desktop"
        elif "tablet" in dlow:
            device_key = "tablet"
        else:
            device_key = dlow
        out.append(
            {
                "device": device,
                "device_key": device_key,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
            }
        )
    return out


def load_page_device(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """page × device matrix when export/API provides it."""
    out: list[dict[str, Any]] = []
    for r in rows or []:
        url = _s(r, "page", "Página", "Páginas principais", "URL")
        device = _s(r, "device", "Dispositivo")
        if not url or not device:
            continue
        if _is_total_or_junk_label(url) or _is_total_or_junk_label(device):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        dlow = device.lower()
        if "celular" in dlow or "mobile" in dlow:
            device_key = "mobile"
        elif "computador" in dlow or "desktop" in dlow:
            device_key = "desktop"
        elif "tablet" in dlow:
            device_key = "tablet"
        else:
            device_key = dlow
        out.append(
            {
                "url": url,
                "path": normalize_path(url),
                "device": device,
                "device_key": device_key,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
                "estimated": str(r.get("estimated") or "").lower() in {"1", "true", "yes"},
            }
        )
    return out


def country_key(label: str) -> str:
    raw = (label or "").strip().lower()
    if raw in COUNTRY_KEYS:
        return COUNTRY_KEYS[raw]
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-") or "unknown"


def load_countries(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        country = _s(r, "country", "País", "Pais", "Country")
        if not country or _is_total_or_junk_label(country):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        out.append(
            {
                "country": country,
                "country_key": country_key(country),
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
            }
        )
    return out


def load_dates(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        day = _s(r, "date", "Data", "Date")
        if not day or _is_total_or_junk_label(day):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        out.append(
            {
                "date": day,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
            }
        )
    return out


def load_query_page(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """query×page (optionally ×device×country×date) rows when the API or a dump provides them."""
    out: list[dict[str, Any]] = []
    for r in rows or []:
        query = _s(r, "query", "Top consultas", "Consultas")
        page = _s(r, "page", "Página", "Páginas principais", "URL")
        if not query and not page:
            continue
        if _is_total_or_junk_label(query) and _is_total_or_junk_label(page):
            continue
        clicks = _f(r, "clicks", "Cliques")
        impressions = _f(r, "impressions", "Impressões")
        ctr = clicks / impressions if impressions else 0.0
        if "%" in str(r.get("CTR") or r.get("ctr") or ""):
            ctr = _f(r, "ctr", "CTR") / 100.0
        elif r.get("ctr") not in (None, ""):
            ctr = _f(r, "ctr")
        device = _s(r, "device", "Dispositivo") or None
        country = _s(r, "country", "País", "Pais") or None
        day = _s(r, "date", "Data") or None
        out.append(
            {
                "query": query or None,
                "page": page or None,
                "path": normalize_path(page) if page else None,
                "device": device,
                "device_key": _device_key(device) if device else None,
                "country": country,
                "country_key": country_key(country) if country else None,
                "date": day,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f(r, "position", "Posição"),
                "ctr": ctr,
            }
        )
    return out


def _device_key(device: str | None) -> str | None:
    if not device:
        return None
    dlow = device.lower()
    if "celular" in dlow or "mobile" in dlow:
        return "mobile"
    if "computador" in dlow or "desktop" in dlow:
        return "desktop"
    if "tablet" in dlow:
        return "tablet"
    return dlow


def _paises_csv(root: Path) -> list[dict[str, str]]:
    for name in ("Paises.csv", "Países.csv", "Countries.csv"):
        rows = load_csv(root / name)
        if rows:
            return rows
    return []


def _grafico_csv(root: Path) -> list[dict[str, str]]:
    for name in ("Grafico.csv", "Gráfico.csv", "Chart.csv", "Dates.csv"):
        rows = load_csv(root / name)
        if rows:
            return rows
    return []


def _query_page_dump(root: Path) -> list[dict[str, Any]]:
    for name in ("query-page.json", "query_page.json", "rows.json"):
        path = root / name
        if path.is_file():
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                return payload
            if isinstance(payload, dict):
                for key in ("rows", "queries", "query_page"):
                    if isinstance(payload.get(key), list):
                        return payload[key]
    return []


def load_gsc_dir(gsc_dir: Path | str) -> dict[str, Any]:
    """Load a single GSC export directory (official CSV names or EN aliases)."""
    root = Path(gsc_dir)
    pages = load_pages(load_csv(root / "Paginas.csv") or load_csv(root / "Pages.csv"))
    queries = load_queries(load_csv(root / "Consultas.csv") or load_csv(root / "Queries.csv"))
    devices = load_devices(
        load_csv(root / "Dispositivos.csv") or load_csv(root / "Devices.csv")
    )
    page_device = load_page_device(
        load_csv(root / "Paginas-por-dispositivo.csv")
        or load_csv(root / "Pages-by-device.csv")
    )
    countries = load_countries(_paises_csv(root))
    dates = load_dates(_grafico_csv(root))
    query_page = load_query_page(_query_page_dump(root))
    meta_path = root / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    page_imp = sum(p["impressions"] for p in pages)
    page_clicks = sum(p["clicks"] for p in pages)
    return {
        "dir": str(root),
        "export_id": root.name,
        "meta": meta,
        "pages": pages,
        "queries": queries,
        "devices": devices,
        "page_device": page_device,
        "countries": countries,
        "dates": dates,
        "query_page": query_page,
        "totals": {
            "pages_impressions_sum": page_imp,
            "pages_clicks_sum": page_clicks,
            "queries_impressions_sum": sum(q["impressions"] for q in queries),
            "queries_clicks_sum": sum(q["clicks"] for q in queries),
            "devices_impressions_sum": sum(d["impressions"] for d in devices),
            "devices_clicks_sum": sum(d["clicks"] for d in devices),
            "countries_impressions_sum": sum(c["impressions"] for c in countries),
            "countries_clicks_sum": sum(c["clicks"] for c in countries),
            "dates_impressions_sum": sum(d["impressions"] for d in dates),
            "dates_clicks_sum": sum(d["clicks"] for d in dates),
        },
        "aggregation_note": (
            "GSC dimensional tables (pages/queries/devices/countries/dates) may disagree due to "
            "privacy thresholding and aggregation. Do not force equality."
        ),
        "privacy_note": PRIVACY_NOTE,
        "totals_reconciled": False,
    }


def discover_gsc_exports(seo_dir: Path | str) -> list[Path]:
    """List seo/gsc-* export dirs, newest name last."""
    root = Path(seo_dir)
    if not root.exists():
        return []
    dirs = sorted(
        [p for p in root.iterdir() if p.is_dir() and p.name.startswith("gsc-")],
        key=lambda p: p.name,
    )
    return dirs


def _base_norm_row() -> dict[str, Any]:
    return {
        "query": None,
        "page": None,
        "device": None,
        "country": None,
        "date": None,
        "impressions": 0.0,
        "clicks": 0.0,
        "ctr": 0.0,
        "position": None,
        "source_table": None,
        "join_status": "join_unavailable",
        "privacy_note": PRIVACY_NOTE,
    }


def _join_status(query: str | None, page: str | None) -> str:
    if query and page:
        return "present"
    return "join_unavailable"


def rows_from_api(rows: list[dict[str, Any]] | None, *, snapshot_id: str = "api") -> list[dict[str, Any]]:
    """Normalize API-shaped or fixture 5-tuples. Does not invent a join."""
    out: list[dict[str, Any]] = []
    for item in load_query_page(rows):
        query = item.get("query")
        page = item.get("page")
        row = _base_norm_row()
        row.update(
            {
                "query": query,
                "page": page,
                "path": item.get("path"),
                "device": item.get("device_key") or item.get("device"),
                "country": item.get("country_key") or item.get("country"),
                "date": item.get("date"),
                "impressions": item.get("impressions") or 0.0,
                "clicks": item.get("clicks") or 0.0,
                "ctr": item.get("ctr") or 0.0,
                "position": item.get("position"),
                "source_table": "query_page",
                "join_status": _join_status(query, page),
                "snapshot_id": snapshot_id,
            }
        )
        out.append(row)
    return out


def normalize_snapshot(gsc: dict[str, Any] | Path | str) -> dict[str, Any]:
    """Turn a loaded GSC export (or directory) into 5-tuple demand rows.

    Dimensional totals stay independent. query×page is present only when the
    source actually supplied both keys on the same row.
    """
    if isinstance(gsc, (str, Path)):
        loaded = load_gsc_dir(gsc)
    else:
        loaded = gsc
    snapshot_id = str(loaded.get("export_id") or loaded.get("snapshot_id") or "gsc")
    snapshot_date = None
    meta = loaded.get("meta") or {}
    if isinstance(meta, dict):
        snapshot_date = meta.get("export_date") or meta.get("as_of")
    rows: list[dict[str, Any]] = []

    for q in loaded.get("queries") or []:
        row = _base_norm_row()
        row.update(
            {
                "query": q.get("query"),
                "date": snapshot_date,
                "impressions": q.get("impressions") or 0.0,
                "clicks": q.get("clicks") or 0.0,
                "ctr": q.get("ctr") or 0.0,
                "position": q.get("position"),
                "source_table": "queries",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for p in loaded.get("pages") or []:
        row = _base_norm_row()
        url = p.get("url") or p.get("page")
        row.update(
            {
                "page": url,
                "path": p.get("path") or (normalize_path(url) if url else None),
                "date": snapshot_date,
                "impressions": p.get("impressions") or 0.0,
                "clicks": p.get("clicks") or 0.0,
                "ctr": p.get("ctr") or 0.0,
                "position": p.get("position"),
                "source_table": "pages",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for d in loaded.get("devices") or []:
        row = _base_norm_row()
        row.update(
            {
                "device": d.get("device_key") or d.get("device"),
                "date": snapshot_date,
                "impressions": d.get("impressions") or 0.0,
                "clicks": d.get("clicks") or 0.0,
                "ctr": d.get("ctr") or 0.0,
                "position": d.get("position"),
                "source_table": "devices",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for c in loaded.get("countries") or []:
        row = _base_norm_row()
        row.update(
            {
                "country": c.get("country_key") or c.get("country"),
                "date": snapshot_date,
                "impressions": c.get("impressions") or 0.0,
                "clicks": c.get("clicks") or 0.0,
                "ctr": c.get("ctr") or 0.0,
                "position": c.get("position"),
                "source_table": "countries",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for d in loaded.get("dates") or []:
        row = _base_norm_row()
        row.update(
            {
                "date": d.get("date"),
                "impressions": d.get("impressions") or 0.0,
                "clicks": d.get("clicks") or 0.0,
                "ctr": d.get("ctr") or 0.0,
                "position": d.get("position"),
                "source_table": "dates",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for pd in loaded.get("page_device") or []:
        row = _base_norm_row()
        url = pd.get("url") or pd.get("page")
        row.update(
            {
                "page": url,
                "path": pd.get("path") or (normalize_path(url) if url else None),
                "device": pd.get("device_key") or pd.get("device"),
                "date": snapshot_date,
                "impressions": pd.get("impressions") or 0.0,
                "clicks": pd.get("clicks") or 0.0,
                "ctr": pd.get("ctr") or 0.0,
                "position": pd.get("position"),
                "source_table": "page_device",
                "join_status": "join_unavailable",
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    for qp in loaded.get("query_page") or []:
        query = qp.get("query")
        page = qp.get("page") or qp.get("url")
        row = _base_norm_row()
        row.update(
            {
                "query": query,
                "page": page,
                "path": qp.get("path") or (normalize_path(page) if page else None),
                "device": qp.get("device_key") or qp.get("device"),
                "country": qp.get("country_key") or qp.get("country"),
                "date": qp.get("date") or snapshot_date,
                "impressions": qp.get("impressions") or 0.0,
                "clicks": qp.get("clicks") or 0.0,
                "ctr": qp.get("ctr") or 0.0,
                "position": qp.get("position"),
                "source_table": "query_page",
                "join_status": _join_status(query, page),
                "snapshot_id": snapshot_id,
            }
        )
        rows.append(row)

    join_flags = {r["join_status"] for r in rows}
    if join_flags == {"present"}:
        snapshot_join = "present"
    elif "present" in join_flags:
        snapshot_join = "mixed"
    else:
        snapshot_join = "join_unavailable"

    return {
        "schema": "gsc-snapshot-normalized/1.0",
        "snapshot_id": snapshot_id,
        "dir": loaded.get("dir"),
        "meta": meta,
        "privacy_note": PRIVACY_NOTE,
        "aggregation_note": loaded.get("aggregation_note"),
        "totals": loaded.get("totals") or {},
        "totals_reconciled": False,
        "join_status": snapshot_join,
        "rows": rows,
        "source_tables": {
            "queries": len(loaded.get("queries") or []),
            "pages": len(loaded.get("pages") or []),
            "devices": len(loaded.get("devices") or []),
            "countries": len(loaded.get("countries") or []),
            "dates": len(loaded.get("dates") or []),
            "page_device": len(loaded.get("page_device") or []),
            "query_page": len(loaded.get("query_page") or []),
        },
    }
