"""Shared builders that drive the shipped adapter/gate — not a second scorer."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from scripts.market_answers.consume import adapt_payload, load_candidate, load_payload
from scripts.market_answers.hashing import content_hash

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "data/editorial/market-answers/fixtures/contract-fixture.v1.json"
CANDIDATE = ROOT / "data/editorial/market-answers/candidates/valor-tipico-contratos-pavimentacao.v1.json"


def load_shipped_fixture() -> dict[str, Any]:
    return load_payload(FIXTURE)


def load_shipped_candidate() -> dict[str, Any]:
    return load_candidate(CANDIDATE)


def raw_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def official_like_payload(**overrides: Any) -> dict[str, Any]:
    """A Goal 03-shaped payload that can pass INDEX when every override agrees.

    Used only to knock out one gate condition at a time. Not written to the
    live extra-cli path.
    """
    base = raw_fixture()
    base["official_live"] = True
    base["producer_status"] = "OFFICIAL_LIVE"
    base["catalog_mode"] = "official_live"
    base["claimed_live"] = False
    base["test_only"] = False
    base["never_index"] = False
    base["producer_sha"] = "abc123official"
    base["geography"] = {
        "kind": "uf",
        "scope": "uf",
        "code": "SC",
        "ufs": ["SC"],
        "label": "Santa Catarina",
        "national_claim_allowed": False,
    }
    base["coverage"] = {
        "status": "COMPLETE",
        "partitions_expected": 1,
        "partitions_observed": 1,
        "national_universe_complete": False,
        "stale": False,
        "min_n": 30,
        "n": 48,
        "usable_n": 48,
        "geography": {"kind": "uf", "code": "SC"},
        "reason_codes": [],
    }
    base["freshness"] = {
        "as_of": "2026-08-17",
        "generated_at": "2026-08-17T00:00:00Z",
        "source_as_of": "2026-08-17T00:00:00Z",
        "max_age_hours": 48,
        "status": "FRESH",
        "policy": "publication-slo",
    }
    base["as_of"] = "2026-08-17"
    base["missingness"] = {
        "unknown_or_nonpositive": 0,
        "usable": 48,
        "total_keyword_rows": 48,
    }
    base["method_short"] = (
        "Mediana e quartis do valor integral nominal do instrumento, "
        "tipologia de pavimentação, recorte Santa Catarina. Não é custo por km."
    )
    base["limitations"] = [
        "O número é o valor integral nominal do instrumento, não custo por km.",
        "O recorte é exclusivamente de Santa Catarina.",
        "Comparáveis oficiais permanecem indisponíveis.",
    ]
    base["claim"] = {
        "authorization_state": "UNAUTHORIZED",
        "national_claim_allowed": False,
        "current_publication_allowed": False,
        "claim_scope": "uf",
        "issue": "#302",
    }
    base["reason_codes"] = []
    base.update(overrides)
    adapted = adapt_payload(base)
    return adapted


def matching_approval(payload: dict[str, Any], *, index_authorized: bool = True) -> dict[str, Any]:
    from scripts.market_answers.approval import (
        APPROVAL_TOKEN,
        APPROVED_BY,
        rendered_content_hash,
    )

    digest = payload.get("content_hash") or content_hash(payload)
    record = load_shipped_candidate()
    return {
        "approvals": [
            {
                "question_id": payload.get("question_id"),
                "asset_id": payload.get("question_id"),
                "url": "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/",
                "content_hash": digest,
                "payload_content_hash": digest,
                "rendered_content_hash": rendered_content_hash(record, payload),
                "index_authorized": index_authorized,
                "approved_by": APPROVED_BY,
                "approval_token": APPROVAL_TOKEN,
                "claim_scope": "uf",
                "geography": {"kind": "uf", "code": "SC"},
            }
        ]
    }


def drifted_approval(payload: dict[str, Any]) -> dict[str, Any]:
    data = matching_approval(payload)
    data["approvals"][0]["content_hash"] = "0" * 64
    data["approvals"][0]["payload_content_hash"] = "0" * 64
    return data
