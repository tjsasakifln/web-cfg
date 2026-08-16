"""Drive the shipped IndexNow prepare-only entry."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.indexnow import (
    INDEXNOW_ENDPOINT,
    MAX_URLS_PER_PREPARE,
    IndexNowPrepareError,
    format_prepare,
    prepare,
)
from scripts.discovery.registry import load_allowlist

AS_OF = "2026-08-16T00:00:00Z"
APPROVED = "https://confenge.com.br/radar/nacional-obras-publicas/"
FIXTURE = "https://confenge.com.br/internal/data-desk/fixture-only/"
NOINDEX = "https://confenge.com.br/inteligencia/cenarios/aditivos-e-risco-de-margem/"


def test_prepare_rejects_fixture_and_noindex_and_accepts_allowlisted(tmp_path):
    receipt = prepare(
        [APPROVED, FIXTURE, NOINDEX],
        state="changed",
        root=ROOT,
        receipts_dir=tmp_path,
        dry_run=True,
        send=False,
        generated_at=AS_OF,
    )
    assert receipt["dry_run"] is True
    assert receipt["sent"] is False
    assert receipt["http_post"] is False
    assert receipt["endpoint_called"] is False
    assert receipt["indexation"] is False
    assert receipt["meaning"] == "notification_accepted_not_indexed"
    assert receipt["state"] == "changed"
    assert receipt["urls"] == [APPROVED]
    reasons = {row["url"]: row["reason"] for row in receipt["rejected"]}
    assert reasons[FIXTURE] == "fixture"
    assert reasons[NOINDEX] == "noindex"
    assert APPROVED in load_allowlist(root=ROOT)["urls"]
    assert FIXTURE not in load_allowlist(root=ROOT)["urls"]
    assert NOINDEX not in load_allowlist(root=ROOT)["urls"]


def test_prepare_is_idempotent_and_stores_receipt(tmp_path):
    first = prepare(
        [APPROVED],
        state="changed",
        root=ROOT,
        receipts_dir=tmp_path,
        generated_at=AS_OF,
    )
    second = prepare(
        [APPROVED],
        state="changed",
        root=ROOT,
        receipts_dir=tmp_path,
        generated_at=AS_OF,
    )
    assert first["idempotency_key"] == second["idempotency_key"]
    assert first["idempotent_replay"] is False
    assert second["idempotent_replay"] is True
    assert first["urls"] == second["urls"] == [APPROVED]
    stored = json.loads(Path(first["receipt_path"]).read_text(encoding="utf-8"))
    assert stored["indexation"] is False
    assert stored["http_post"] is False
    assert stored["idempotency_key"] == first["idempotency_key"]


def test_prepare_tracks_added_changed_removed(tmp_path):
    for state in ("added", "changed", "removed"):
        receipt = prepare(
            [APPROVED],
            state=state,
            root=ROOT,
            receipts_dir=tmp_path,
            generated_at=AS_OF,
        )
        assert receipt["state"] == state
        assert receipt["urls"] == [APPROVED]


def test_prepare_rate_limit_and_send_flag_refused(tmp_path):
    too_many = [
        f"https://confenge.com.br/radar/nacional-obras-publicas/?n={i}"
        for i in range(MAX_URLS_PER_PREPARE + 1)
    ]
    # query strings fail canonicalization one-by-one, but the batch size is
    # rejected first so we never open a send path.
    with pytest.raises(IndexNowPrepareError, match="rate_limit_exceeded"):
        prepare(too_many, root=ROOT, receipts_dir=tmp_path)
    with pytest.raises(IndexNowPrepareError, match="send_flag_not_implemented"):
        prepare([APPROVED], root=ROOT, receipts_dir=tmp_path, send=True, dry_run=True)
    with pytest.raises(IndexNowPrepareError, match="send_forbidden_without_human_gate"):
        prepare([APPROVED], root=ROOT, receipts_dir=tmp_path, send=True, dry_run=False)


def test_cli_indexnow_dry_run_default(tmp_path):
    out = tmp_path / "receipt.json"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "indexnow",
            "--as-of",
            AS_OF,
            "--json",
            "--out",
            str(out),
            "--url",
            APPROVED,
            "--url",
            FIXTURE,
            "--state",
            "changed",
            "--receipts-dir",
            str(tmp_path / "receipts"),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert "dry_run: true" in proc.stdout
    assert "sent: false" in proc.stdout
    assert "indexation: false" in proc.stdout
    assert FIXTURE in proc.stdout
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["http_post"] is False
    assert payload["endpoint_called"] is False
    assert payload["endpoint"] == INDEXNOW_ENDPOINT
    assert payload["urls"] == [APPROVED]
    replay = prepare(
        [APPROVED, FIXTURE],
        state="changed",
        root=ROOT,
        receipts_dir=tmp_path / "receipts",
        generated_at=AS_OF,
    )
    assert replay["idempotent_replay"] is True
    text = format_prepare(payload)
    assert "INDEXNOW PREPARE" in text
