"""Load versioned GSC snapshots and optional WEB-016 demand-engine/1.0 records.

Does not reimplement the Demand Engine. If the module is absent, demand
engine status is ABSENT and GSC rows remain the evidence.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from scripts.organic.gsc_loader import load_csv, load_gsc_dir
from scripts.paid_search.schema import GSC_SNAPSHOTS, UNKNOWN

ROOT = Path(__file__).resolve().parents[2]


def repo_root(root: Path | str | None = None) -> Path:
    return Path(root) if root else ROOT


def load_countries(gsc_dir: Path) -> list[dict[str, Any]]:
    rows = load_csv(gsc_dir / "Paises.csv") or load_csv(gsc_dir / "Countries.csv")
    out: list[dict[str, Any]] = []
    for row in rows or []:
        country = (row.get("País") or row.get("Country") or "").strip()
        if not country:
            continue
        def _f(*keys: str) -> float:
            for key in keys:
                if row.get(key) not in (None, ""):
                    raw = str(row[key]).strip().replace("%", "").replace(",", ".")
                    try:
                        return float(raw)
                    except ValueError:
                        continue
            return 0.0

        clicks = _f("Cliques", "clicks")
        impressions = _f("Impressões", "impressions")
        out.append(
            {
                "country": country,
                "clicks": clicks,
                "impressions": impressions,
                "position": _f("Posição", "position"),
            }
        )
    return out


def load_gsc_snapshots(root: Path | str | None = None) -> list[dict[str, Any]]:
    base = repo_root(root)
    snapshots: list[dict[str, Any]] = []
    for rel in GSC_SNAPSHOTS:
        path = base / rel
        if not path.is_dir():
            continue
        doc = load_gsc_dir(path)
        doc["countries"] = load_countries(path)
        snapshots.append(doc)
    return snapshots


def iter_gsc_queries(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for snap in snapshots:
        export_id = snap.get("export_id")
        for row in snap.get("queries") or []:
            item = dict(row)
            item["export_id"] = export_id
            out.append(item)
    return out


def load_demand_engine_records(root: Path | str | None = None) -> dict[str, Any]:
    """Consume WEB-016 if the shipped module or a registry artifact is present."""
    base = repo_root(root)
    artifact_candidates = [
        base / "data" / "organic" / "demand-engine-registry.json",
        base / "data" / "organic" / "demand-engine.json",
    ]
    for path in artifact_candidates:
        if path.is_file():
            doc = json.loads(path.read_text(encoding="utf-8"))
            schema = str(doc.get("schema") or "")
            if schema.startswith("demand-engine/"):
                records = doc.get("records") or doc.get("candidates") or []
                return {
                    "available": True,
                    "schema": schema,
                    "status": "CONSUMED_ARTIFACT",
                    "path": str(path.relative_to(base)),
                    "records": records,
                    "authorizes_page": False,
                }

    try:
        from scripts.organic import demand_engine as engine
    except ImportError:
        return {
            "available": False,
            "schema": "demand-engine/1.0",
            "status": "ABSENT",
            "reason": "WEB-016 demand_engine module is not on this branch",
            "prerequisite": "merge or checkout PR #98 feat/web-016-demand-engine",
            "next_command": (
                "git fetch origin && "
                "python3 -m scripts.organic demand-engine --gsc-dir seo/gsc-2026-08-09"
            ),
            "records": [],
            "authorizes_page": False,
        }

    records: list[dict[str, Any]] = []
    if hasattr(engine, "run_snapshot"):
        for rel in GSC_SNAPSHOTS:
            path = base / rel
            if path.is_dir():
                doc = engine.run_snapshot(path)
                records.extend(doc.get("records") or [])
    elif hasattr(engine, "build_registry"):
        for rel in GSC_SNAPSHOTS:
            path = base / rel
            if path.is_dir():
                doc = engine.build_registry(load_gsc_dir(path))
                records.extend(doc.get("records") or [])

    return {
        "available": True,
        "schema": getattr(engine, "SCHEMA", "demand-engine/1.0"),
        "status": "CONSUMED_MODULE",
        "records": records,
        "authorizes_page": False,
    }


def demand_status_from_row(row: dict[str, Any]) -> Any:
    """Organic GSC presence is observed; paid demand stays UNKNOWN."""
    if "impressions" not in row and "clicks" not in row:
        return UNKNOWN
    return {
        "status": "observed",
        "impressions": float(row.get("impressions") or 0),
        "clicks": float(row.get("clicks") or 0),
        "position": row.get("position"),
        "ctr": row.get("ctr"),
        "export_id": row.get("export_id"),
        "source_table": "Consultas.csv",
    }


def read_consultas_queries(root: Path | str | None = None) -> set[str]:
    """Raw query strings from the official CSVs (for evidence citation checks)."""
    base = repo_root(root)
    found: set[str] = set()
    for rel in GSC_SNAPSHOTS:
        path = base / rel / "Consultas.csv"
        if not path.is_file():
            continue
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                query = (row.get("Top consultas") or row.get("Consultas") or "").strip()
                if query:
                    found.add(query)
    return found
