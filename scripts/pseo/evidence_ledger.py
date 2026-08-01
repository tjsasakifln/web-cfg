"""Evidence ledger: every public numeric claim must map to a ledger entry.

Institutional/editorial text may be marked claim_kind=editorial without a
denominator. Factual claims require source + sample + period + confidence.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_entry(
    *,
    claim: str,
    value: Any,
    source: str,
    query_version: str | None = None,
    denominator: Any | None = None,
    sample_size: int | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    confidence: str = "medium",
    limitations: list[str] | None = None,
    claim_kind: str = "factual",  # factual | editorial | institutional
    verified_at: str | None = None,
) -> dict[str, Any]:
    entry = {
        "claim": claim,
        "value": value,
        "source": source,
        "query_version": query_version,
        "denominator": denominator,
        "sample_size": sample_size,
        "period_start": period_start,
        "period_end": period_end,
        "confidence": confidence,
        "limitations": list(limitations or []),
        "claim_kind": claim_kind,
        "verified_at": verified_at or now_iso(),
    }
    if claim_kind == "factual":
        missing = []
        if not source:
            missing.append("source")
        if sample_size is None and denominator is None:
            missing.append("sample_or_denominator")
        if missing:
            entry["ledger_incomplete"] = missing
    return entry


def ledger_from_market(m: dict[str, Any], *, dataset_hash: str | None = None) -> list[dict[str, Any]]:
    """Derive ledger entries from a market aggregate (no invented numbers)."""
    sm = m.get("sample_metrics") or {}
    n = int(sm.get("primary_contract_count") or m.get("contract_count") or 0)
    buyers = int(sm.get("unique_buyer_count") or m.get("buyer_count") or 0)
    period_start = m.get("period_start")
    period_end = m.get("period_end")
    src = ",".join(m.get("sources") or ["pncp_supplier_contracts"])
    base_lim = list(m.get("limitations") or [])
    if dataset_hash:
        base_lim.append(f"dataset_hash={dataset_hash[:12]}")
    entries = [
        make_entry(
            claim="primary_contract_count",
            value=n,
            source=src,
            query_version="export_markets_v1",
            denominator=n,
            sample_size=n,
            period_start=period_start,
            period_end=period_end,
            confidence="high" if n >= 15 else "medium",
            limitations=base_lim,
        ),
        make_entry(
            claim="unique_buyer_count",
            value=buyers,
            source=src,
            query_version="export_markets_v1",
            sample_size=n,
            period_start=period_start,
            period_end=period_end,
            confidence="high" if buyers >= 3 else "low",
            limitations=base_lim,
        ),
    ]
    if m.get("median_value") is not None:
        entries.append(
            make_entry(
                claim="median_contract_value",
                value=m.get("median_value"),
                source=src,
                query_version="export_markets_v1",
                sample_size=n,
                period_start=period_start,
                period_end=period_end,
                confidence="medium",
                limitations=base_lim + ["median is contrato_integral, not unit price"],
            )
        )
    return entries


def ledger_from_candidate(c: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ledger for any registry/candidate page from its data_ref."""
    ptype = c.get("page_type") or ""
    ref = c.get("data_ref") or c
    if ptype == "market" or c.get("page_type") == "market":
        return ledger_from_market(ref, dataset_hash=c.get("dataset_hash"))
    n = int(c.get("observation_count") or ref.get("open_count") or ref.get("contract_count") or 0)
    return [
        make_entry(
            claim="observation_count",
            value=n,
            source=",".join(c.get("sources") or ref.get("sources") or ["export"]),
            sample_size=n,
            period_start=ref.get("period_start"),
            period_end=ref.get("period_end") or ref.get("as_of"),
            confidence="medium",
            limitations=list(ref.get("limitations") or []),
        )
    ]


def validate_ledger(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Fail-closed check: factual claims must be complete."""
    incomplete = [e for e in entries if e.get("ledger_incomplete")]
    return {
        "ok": len(incomplete) == 0,
        "n_entries": len(entries),
        "incomplete": incomplete,
    }
