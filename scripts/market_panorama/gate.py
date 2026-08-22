"""Publication gate for the market-panorama family.

INDEX is a consumer decision, taken per page, bound to the payload content hash
and recorded in the approvals ledger. Nothing the producer sends can grant it.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from scripts.market_panorama import (
    CATALOG_OFFICIAL_LIVE,
    DATA_READY,
    REASON_APPROVAL_HASH_DRIFT,
    REASON_NO_APPROVAL,
    REASON_NOT_DATA_READY,
    REASON_NOT_OFFICIAL_LIVE,
    REASON_NOT_PUBLISHABLE,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
    STATE_BLOCKED,
    STATE_INDEX,
    STATE_NOINDEX,
)
from scripts.market_panorama.consume import canonical_dumps

ROBOTS_INDEX = "index,follow"
ROBOTS_NOINDEX = "noindex,nofollow,noarchive"


@dataclass(frozen=True)
class PublicationDecision:
    panorama_id: str
    slug: str
    state: str
    robots: str
    indexable: bool
    source_kind: str
    is_fixture: bool
    reason_codes: tuple[str, ...]
    content_hash: str
    payload_fingerprint: str


def payload_fingerprint(payload: dict[str, Any]) -> str:
    """Digest this consumer computes over the payload itself.

    The producer's ``content_hash`` is a value the producer chooses. Binding an
    INDEX approval to it would let anyone who can write the rendezvous swap the
    facts while keeping the string, and the approval would survive. This digest
    is computed here, over everything except that self-declared field, so an
    approval expires the moment any rendered fact moves.
    """
    body = {k: v for k, v in payload.items() if k != "content_hash"}
    return "sha256:" + hashlib.sha256(canonical_dumps(body).encode("utf-8")).hexdigest()


def panorama_id(payload: dict[str, Any]) -> str:
    """Stable id from the recomputed fingerprint. Never from a company name."""
    digest = hashlib.sha256(payload_fingerprint(payload).encode("utf-8")).hexdigest()[:12]
    return f"mp-{digest}"


def slug_for(payload: dict[str, Any]) -> str:
    profile = payload.get("subject_profile") or {}
    uf = str(profile.get("uf") or "br").lower()
    if uf in {"", "unknown", "none"}:
        uf = "br"
    as_of = str(payload.get("as_of") or "")[:7] or "sem-data"
    return f"obras-publicas-{uf}-{as_of}"


def evaluate(payload: dict[str, Any], *, source_kind: str, approvals: dict[str, Any] | None = None) -> PublicationDecision:
    approvals = approvals or {}
    reasons: list[str] = []
    is_fixture = source_kind == SOURCE_FIXTURE

    if payload.get("catalog_mode") != CATALOG_OFFICIAL_LIVE:
        reasons.append(REASON_NOT_OFFICIAL_LIVE)
    if payload.get("data_state") != DATA_READY:
        reasons.append(REASON_NOT_DATA_READY)
    if payload.get("publication_readiness") != DATA_READY:
        reasons.append(REASON_NOT_PUBLISHABLE)

    pid = panorama_id(payload)
    content_hash = str(payload.get("content_hash") or "")
    fingerprint = payload_fingerprint(payload)

    state = STATE_BLOCKED if reasons else STATE_NOINDEX
    indexable = False

    if state == STATE_NOINDEX and source_kind == SOURCE_OFFICIAL_LIVE:
        approval = approvals.get(pid)
        if not isinstance(approval, dict) or not approval:
            reasons.append(REASON_NO_APPROVAL)
        elif approval.get("payload_fingerprint") != fingerprint:
            reasons.append(REASON_APPROVAL_HASH_DRIFT)
        elif approval.get("approved") is True:
            state = STATE_INDEX
            indexable = True

    # A fixture can never index, whatever the ledger says.
    if is_fixture:
        indexable = False
        if state == STATE_INDEX:
            state = STATE_NOINDEX

    return PublicationDecision(
        panorama_id=pid,
        slug=slug_for(payload),
        state=state,
        robots=ROBOTS_INDEX if indexable else ROBOTS_NOINDEX,
        indexable=indexable,
        source_kind=source_kind,
        is_fixture=is_fixture,
        reason_codes=tuple(reasons),
        content_hash=content_hash,
        payload_fingerprint=fingerprint,
    )
