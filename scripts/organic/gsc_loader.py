"""Load Google Search Console CSV exports (multi-export, multi-dimension).

Preserves aggregation discrepancies between tables — never force-reconcile.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


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
        if not device:
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
        "totals": {
            "pages_impressions_sum": page_imp,
            "pages_clicks_sum": page_clicks,
            "queries_impressions_sum": sum(q["impressions"] for q in queries),
            "queries_clicks_sum": sum(q["clicks"] for q in queries),
            "devices_impressions_sum": sum(d["impressions"] for d in devices),
            "devices_clicks_sum": sum(d["clicks"] for d in devices),
        },
        "aggregation_note": (
            "GSC dimensional tables (pages/queries/devices/chart) may disagree due to "
            "privacy thresholding and aggregation. Do not force equality."
        ),
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
