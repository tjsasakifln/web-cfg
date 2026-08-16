"""Load the labeled WEB-002 corpus and in-memory mutations.

Mutations never write to the live extra-cli path and never flip claimed_live
on the on-disk fixtures.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from scripts.knowledge_funnel import CORPUS_SCHEMA, DEFAULT_CORPUS

REQUIRED_CASES = (
    "happy",
    "consent",
    "retry",
    "timeout",
    "duplicate_replay",
    "fixture_as_live",
    "pii_url_event",
    "missing_evidence",
    "stale_payload",
    "handoff_unavailable",
)


def root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_corpus(path: Path | None = None) -> dict[str, Any]:
    resolved = path if path is not None else root() / DEFAULT_CORPUS
    if not resolved.is_absolute():
        resolved = root() / resolved
    payload = json.loads(resolved.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("knowledge-funnel corpus is not an object")
    if payload.get("schema") != CORPUS_SCHEMA:
        raise ValueError(f"unexpected corpus schema: {payload.get('schema')!r}")
    if payload.get("claimed_live") is True or payload.get("official_live") is True:
        raise ValueError("corpus must stay labeled non-live")
    missing = [name for name in REQUIRED_CASES if name not in (payload.get("cases") or {})]
    if missing:
        raise ValueError(f"corpus missing required cases: {', '.join(missing)}")
    payload["_source_path"] = str(resolved)
    return payload


def resolve_fixture(corpus: dict[str, Any], key: str) -> Path:
    rel = (corpus.get("fixtures") or {}).get(key)
    if not rel:
        raise KeyError(f"corpus fixture not declared: {key}")
    path = root() / rel
    if not path.is_file():
        raise FileNotFoundError(f"corpus fixture missing: {path}")
    return path


def raw_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"fixture is not an object: {path}")
    return payload


def case_spec(corpus: dict[str, Any], case_id: str) -> dict[str, Any]:
    cases = corpus.get("cases") or {}
    if case_id not in cases:
        raise KeyError(f"unknown corpus case: {case_id}")
    spec = deepcopy(cases[case_id])
    spec["id"] = case_id
    spec.setdefault("correlation_id", f"kf-web002-{case_id}")
    spec.setdefault("cta", corpus.get("cta"))
    spec.setdefault("cta_id", corpus.get("cta_id"))
    spec["analysis_bindings"] = list(corpus.get("analysis_bindings") or [])
    return spec


def mutate_answer_raw(raw: dict[str, Any], mutate: str | None) -> dict[str, Any]:
    """In-memory only. Does not persist and does not invent official_live facts."""
    out = deepcopy(raw)
    if mutate == "fixture_as_live":
        out["claimed_live"] = True
        out["official_live"] = True
        reasons = list(out.get("reason_codes") or [])
        if "fixture_as_live" not in reasons:
            reasons.append("fixture_as_live")
        out["reason_codes"] = reasons
        return out
    if mutate == "missing_evidence":
        out["contract_refs"] = []
        out["evidence_refs"] = []
        return out
    return out


def bind_analysis(payload: dict[str, Any], bindings: list[dict[str, Any]]) -> dict[str, Any]:
    """Overlay corpus analysis_id onto consumed contract_refs. Does not invent analyses."""
    out = deepcopy(payload)
    by_id = {
        str(item.get("evidence_id")): str(item.get("analysis_id"))
        for item in bindings
        if item.get("evidence_id") and item.get("analysis_id")
    }
    refs = []
    for item in out.get("contract_refs") or []:
        if not isinstance(item, dict):
            continue
        rec = dict(item)
        ev = str(rec.get("id") or rec.get("contract_id") or "")
        if ev in by_id and not rec.get("analysis_id"):
            rec["analysis_id"] = by_id[ev]
        refs.append(rec)
    out["contract_refs"] = refs
    return out
