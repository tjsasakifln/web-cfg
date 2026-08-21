"""#62 VALIDATE: one still-open donor URL has an explicit non-home decision."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXECUTE_SET = ROOT / "data/migrations/smartlic-url-map/execute-set.v2.json"
DONOR_URL = "https://smartlic.tech/blog/checklist-habilitacao-licitacao-2026"
ALLOWED = {"MIGRATE", "REDIRECT", "REDIRECT_301", "RETIRE", "RETIRE_410"}
HOME_TARGETS = {
    "/",
    "https://confenge.com.br",
    "https://confenge.com.br/",
}


def _rows(data: dict) -> list[dict]:
    rows: list[dict] = []
    for key in ("redirects", "holds", "retirements", "explicit_decisions"):
        rows.extend(data.get(key) or [])
    return rows


def test_habilitacao_checklist_has_explicit_retire_not_home() -> None:
    data = json.loads(EXECUTE_SET.read_text(encoding="utf-8"))
    match = [row for row in _rows(data) if row.get("legacy_url") == DONOR_URL]
    assert match, f"{DONOR_URL} missing from execute-set"
    row = match[0]
    decision = str(row.get("decision") or "").upper()
    assert decision in ALLOWED, f"{DONOR_URL} lacks explicit MIGRATE/REDIRECT/RETIRE"
    target = row.get("target_url")
    if isinstance(target, str):
        assert target.rstrip("/") not in {item.rstrip("/") for item in HOME_TARGETS}
        assert target != "/"
    if decision in {"RETIRE", "RETIRE_410"}:
        assert row.get("expected_http") in (410, 404)
        assert target in (None, "")
