"""Durable budgets, idempotent generation and atomic public snapshot promotion."""

from __future__ import annotations

import copy
import fcntl
import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .core import (
    MAX_INPUT_BYTES, MAX_SNAPSHOT_BYTES, POINTER_SCHEMA, PUBLICATION_SCHEMA,
    NewsError, classify, fingerprint, iso, json_bytes, slug_for, timestamp,
    validate_draft, validate_input, validate_publication,
)
from .openai_client import DEFAULT_MODEL, ResponsesClient

LEDGER_SCHEMA = "confenge.contract-news-ledger/v1"


@dataclass(frozen=True)
class Settings:
    state_dir: Path
    output_dir: Path
    enabled: bool = False
    max_per_run: int = 2
    max_per_day: int = 6
    max_calls_per_day: int = 12
    max_attempts_per_record: int = 1
    timeout: int = 45
    model: str = DEFAULT_MODEL

    def validate(self) -> None:
        for value, maximum in ((self.max_per_run, 2), (self.max_per_day, 6), (self.max_calls_per_day, 12), (self.max_attempts_per_record, 2), (self.timeout, 60)):
            if type(value) is not int or not 1 <= value <= maximum:
                raise NewsError("invalid_operational_limit")
        state, public = self.state_dir.resolve(), self.output_dir.resolve()
        if state == public or public in state.parents or state in public.parents:
            raise NewsError("private_and_public_directories_must_be_separate")


def read_json(path: Path, limit: int) -> Any:
    try:
        if path.stat().st_size > limit:
            raise NewsError("file_too_large")
        with path.open("rb") as file:
            raw = file.read(limit + 1)
        if len(raw) > limit:
            raise NewsError("file_too_large")
        return json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        if isinstance(exc, NewsError):
            raise
        raise NewsError("invalid_json_file") from None


def atomic_write(path: Path, raw: bytes, mode: int) -> None:
    fd, name = tempfile.mkstemp(prefix=".contract-news-", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), mode)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        dir_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        temp.unlink(missing_ok=True)


def _save_ledger(settings: Settings, ledger: dict) -> None:
    atomic_write(settings.state_dir / "ledger.json", json_bytes(ledger), 0o600)


def _new_ledger(now: datetime) -> dict:
    return {"schema": LEDGER_SCHEMA, "changed_at": iso(now), "articles": {}, "attempts": {}, "budget": {}}


def _load_ledger(settings: Settings, now: datetime) -> dict:
    path = settings.state_dir / "ledger.json"
    if not path.exists():
        if (settings.output_dir / "current.json").exists():
            raise NewsError("missing_ledger_with_existing_publication")
        return _new_ledger(now)
    ledger = read_json(path, 64 * 1024 * 1024)
    if not isinstance(ledger, dict) or ledger.get("schema") != LEDGER_SCHEMA:
        raise NewsError("invalid_ledger")
    if any(not isinstance(ledger.get(key), dict) for key in ("articles", "attempts", "budget")):
        raise NewsError("invalid_ledger")
    timestamp(ledger.get("changed_at"), "ledger_changed_at")
    for key, row in ledger["articles"].items():
        if not isinstance(row, dict) or row.get("article", {}).get("id") != key:
            raise NewsError("invalid_ledger_article")
        if row.get("fingerprint") != fingerprint(row["article"]["facts"]):
            raise NewsError("ledger_fingerprint_mismatch")
    validate_publication(_snapshot(ledger))
    return ledger


def _snapshot(ledger: dict) -> dict:
    return {
        "schema": PUBLICATION_SCHEMA,
        "generated_at": ledger["changed_at"],
        "articles": sorted((row["article"] for row in ledger["articles"].values()), key=lambda article: (article["published_at"], article["id"]), reverse=True),
    }


def _stopped(settings: Settings) -> bool:
    if not settings.enabled or (settings.state_dir / "STOP").exists():
        return True
    release_link = os.environ.get("CONFENGE_NEWS_RELEASE_LINK")
    release_sha = os.environ.get("CONFENGE_NEWS_RELEASE_SHA")
    if release_link is None and release_sha is None:
        return False
    # The scheduler may pin the currently promoted site release. A partial or
    # malformed guard never silently disables this check.
    if not release_link or not release_sha or not re.fullmatch(r"[a-f0-9]{40}", release_sha):
        return True
    try:
        link = Path(release_link)
        if not link.is_absolute() or not link.is_symlink():
            return True
        return link.resolve(strict=True).name != release_sha
    except (OSError, ValueError, RuntimeError):
        return True


def validate_rendered_snapshot(snapshot: dict, state_dir: Path) -> None:
    """Run the actual production renderer before any public pointer is changed."""
    script = Path(__file__).resolve().parents[2] / "runtime/contract-news/validate.mjs"
    if not script.is_file():
        raise NewsError("render_gate_missing")
    fd, name = tempfile.mkstemp(prefix="render-candidate-", suffix=".json", dir=state_dir)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(json_bytes(snapshot))
        try:
            result = subprocess.run([os.environ.get("CONFENGE_NEWS_NODE", "node"), str(script), name],
                                    check=False, capture_output=True, timeout=30)
        except subprocess.TimeoutExpired:
            raise NewsError("render_gate_timeout") from None
        except OSError:
            raise NewsError("render_gate_unavailable") from None
        if result.returncode != 0:
            raise NewsError("render_gate_rejected")
        try:
            verdict = json.loads(result.stdout)
        except ValueError:
            raise NewsError("render_gate_invalid_result") from None
        if verdict.get("ok") is not True or verdict.get("articles") != len(snapshot["articles"]):
            raise NewsError("render_gate_invalid_result")
    finally:
        Path(name).unlink(missing_ok=True)


def promote(settings: Settings, ledger: dict) -> dict:
    """The pointer is replaced last; incomplete snapshots are never discoverable."""
    if _stopped(settings):
        raise NewsError("publication_disabled")
    snapshot = validate_publication(_snapshot(ledger))
    validate_rendered_snapshot(snapshot, settings.state_dir)
    raw = json_bytes(snapshot)
    sha = hashlib.sha256(raw).hexdigest()
    filename = f"snapshot-{sha}.json"
    destination = settings.output_dir / filename
    settings.output_dir.mkdir(parents=True, exist_ok=True, mode=0o755)
    if not destination.exists():
        atomic_write(destination, raw, 0o644)
    elif destination.read_bytes() != raw:
        raise NewsError("existing_snapshot_hash_mismatch")
    pointer = {
        "schema": POINTER_SCHEMA, "file": filename, "sha256": sha,
        "generated_at": snapshot["generated_at"], "article_count": len(snapshot["articles"]),
    }
    if _stopped(settings):
        raise NewsError("publication_disabled")
    atomic_write(settings.output_dir / "current.json", json_bytes(pointer), 0o644)
    # Keep the current and two predecessors for requests already reading a pointer.
    older = sorted((p for p in settings.output_dir.glob("snapshot-*.json") if p.name != filename), key=lambda p: p.stat().st_mtime_ns, reverse=True)
    for path in older[2:]:
        if len(path.name) == len("snapshot-") + 64 + len(".json"):
            path.unlink(missing_ok=True)
    return pointer


def _day_budget(ledger: dict, now: datetime) -> dict:
    today = now.astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat()
    value = ledger["budget"].setdefault(today, {"attempts": 0, "calls": 0, "publications": 0})
    if not isinstance(value, dict) or any(type(value.get(key)) is not int or value[key] < 0 for key in ("attempts", "calls", "publications")):
        raise NewsError("invalid_ledger_budget")
    for previous in list(ledger["budget"]):
        if previous < (now - timedelta(days=35)).date().isoformat():
            del ledger["budget"][previous]
    return value


def _reserve_call(settings: Settings, ledger: dict, at: datetime) -> None:
    if _stopped(settings):
        raise NewsError("publication_disabled")
    budget = _day_budget(ledger, at)
    if budget["calls"] >= settings.max_calls_per_day:
        raise NewsError("daily_call_budget_exhausted")
    budget["calls"] += 1
    _save_ledger(settings, ledger)


def generate(document: Any, settings: Settings, *, api_key: str = "", client: Any = None, now: datetime | None = None, dry_run: bool = False, clock: Any = None) -> dict:
    """One bounded execution. Tests inject a client; the CLI always uses OpenAI."""
    settings.validate()
    if now is not None and clock is not None:
        raise NewsError("ambiguous_clock")
    fixed = now
    clock = clock or ((lambda: fixed) if fixed is not None else (lambda: datetime.now(timezone.utc)))
    now = clock()
    facts, input_rejections = validate_input(document, now)
    # No creation of state/locks, API calls or publication in a dry run.
    if dry_run:
        candidates = [f for f in facts if classify(f) and now - timestamp(f["source_published_at"]) <= timedelta(days=7)]
        return {"status": "dry_run", "valid_records": len(facts), "eligible_new": len(candidates), "rejections": input_rejections, "calls": 0, "published": 0}
    if _stopped(settings):
        return {"status": "disabled", "calls": 0, "published": 0}
    if client is None and not api_key:
        raise NewsError("missing_openai_api_key")
    settings.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(settings.state_dir, 0o700)
    lock_fd = os.open(settings.state_dir / ".lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "locked", "calls": 0, "published": 0}
        ledger = _load_ledger(settings, now)
        budget = _day_budget(ledger, now)
        initial_calls = sum(row["calls"] for row in ledger["budget"].values())
        processed = published = unchanged = 0
        rejections = list(input_rejections)
        client = client or ResponsesClient(api_key, model=settings.model, timeout=settings.timeout)
        candidates = sorted(facts, key=lambda f: (f["id"] in ledger["articles"], Decimal(f["value"]["amount"]), f["source_published_at"]), reverse=True)
        # Rechecks advance an internal cursor even when public article bytes do not
        # change, so the same oldest identities cannot monopolize every batch.
        for fact in facts:
            if fact["id"] in ledger["articles"]:
                ledger["articles"][fact["id"]]["last_source_checked"] = fact["source_checked_at"]
        for row in document.get("recheck_results", []):
            if isinstance(row, dict) and row.get("id") in ledger["articles"] and row.get("status") in {"verified", "ineligible", "unavailable"}:
                ledger["articles"][row["id"]]["last_recheck_attempt_at"] = iso(now)
        for fact in candidates:
            budget = _day_budget(ledger, clock())
            existing = ledger["articles"].get(fact["id"])
            category = classify(fact)
            if not category:
                continue
            if not existing and now - timestamp(fact["source_published_at"]) > timedelta(days=7):
                continue
            fp = fingerprint(fact)
            if existing and existing["fingerprint"] == fp:
                unchanged += 1
                continue
            attempt = ledger["attempts"].get(fp, {"count": 0})
            if type(attempt.get("count")) is not int:
                raise NewsError("invalid_attempt_ledger")
            if attempt["count"] >= settings.max_attempts_per_record:
                continue
            if processed >= settings.max_per_run or budget["attempts"] >= settings.max_per_day or budget["publications"] >= settings.max_per_day or budget["calls"] + 2 > settings.max_calls_per_day:
                break
            if _stopped(settings):
                break
            # Reserve the attempt and first call durably before any paid request.
            processed += 1
            budget["attempts"] += 1
            ledger["attempts"][fp] = {"count": attempt["count"] + 1, "at": iso(now), "status": "started"}
            _reserve_call(settings, ledger, clock())
            try:
                draft = client.call("generate", fact)
                rendered = validate_draft(draft, fact)
                _reserve_call(settings, ledger, clock())
                review = client.call("review", fact, rendered)
                if not isinstance(review, dict) or set(review) != {"supported", "issues"} or review["supported"] is not True or review["issues"] != []:
                    raise NewsError("editorial_review_rejected")
                approved_at = clock()
                budget = _day_budget(ledger, approved_at)
                if budget["publications"] >= settings.max_per_day:
                    raise NewsError("daily_publication_budget_exhausted")
                article = {
                    "id": fact["id"], "slug": existing["article"]["slug"] if existing else slug_for(fact, draft["subject"]),
                    **rendered, "category": category,
                    "published_at": existing["article"]["published_at"] if existing else iso(approved_at),
                    "modified_at": iso(approved_at), "facts": copy.deepcopy(fact),
                }
                prospective = copy.deepcopy(ledger)
                prospective["articles"][fact["id"]] = {"fingerprint": fp, "article": article, "last_source_checked": fact["source_checked_at"], "last_recheck_attempt_at": iso(now)}
                prospective["changed_at"] = iso(approved_at)
                validate_publication(_snapshot(prospective))
                ledger["articles"][fact["id"]] = prospective["articles"][fact["id"]]
                ledger["changed_at"] = prospective["changed_at"]
                ledger["attempts"][fp]["status"] = "accepted"
                budget["publications"] += 1
                published += 1
                # Persist acceptance before promotion: a crash cannot cause repaying.
                _save_ledger(settings, ledger)
            except (NewsError, TimeoutError, OSError) as exc:
                code = str(exc) if isinstance(exc, NewsError) else "generation_transport_error"
                ledger["attempts"][fp].update(status="rejected", error=code)
                _save_ledger(settings, ledger)
                rejections.append(code)
        _save_ledger(settings, ledger)
        # Accepted data may need promotion after a previous process was interrupted.
        pointer = None
        if not _stopped(settings) and (ledger["articles"] or not rejections):
            pointer = promote(settings, ledger)
        return {
            "status": "published" if published else "unchanged",
            "published": published, "total_articles": len(ledger["articles"]),
            "unchanged": unchanged, "attempted": processed,
            "calls": sum(row["calls"] for row in ledger["budget"].values()) - initial_calls, "rejections": rejections,
            "snapshot_sha256": pointer["sha256"] if pointer else None,
        }
    finally:
        os.close(lock_fd)


def source_state(state_dir: Path) -> dict:
    """Private SELECT-only projection used by extra-cli to recheck known IDs."""
    path = state_dir / "ledger.json"
    if not path.exists():
        return {"published_ids": [], "recheck_ids": []}
    ledger = read_json(path, 64 * 1024 * 1024)
    if not isinstance(ledger, dict) or ledger.get("schema") != LEDGER_SCHEMA or not isinstance(ledger.get("articles"), dict):
        raise NewsError("invalid_ledger")
    validate_publication(_snapshot(ledger))
    rows = ledger["articles"]
    def checked(identity: str) -> datetime:
        row = rows[identity]
        values = [row.get("last_source_checked", row["article"]["facts"]["source_checked_at"])]
        if row.get("last_recheck_attempt_at"):
            values.append(row["last_recheck_attempt_at"])
        return max(timestamp(value) for value in values)
    return {"published_ids": sorted(rows), "recheck_ids": sorted(rows, key=lambda identity: (checked(identity), identity))[:5]}


def check_publication(path: Path) -> dict:
    snapshot = read_json(path, MAX_SNAPSHOT_BYTES)
    if isinstance(snapshot, dict) and snapshot.get("schema") == POINTER_SCHEMA:
        pointer = snapshot
        filename = pointer.get("file", "")
        expected = f"snapshot-{pointer.get('sha256')}.json"
        if filename != expected or not isinstance(pointer.get("sha256"), str) or len(pointer["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in pointer["sha256"]):
            raise NewsError("invalid_publication_pointer")
        target = path.parent / filename
        if target.is_symlink() or target.stat().st_size > MAX_SNAPSHOT_BYTES:
            raise NewsError("invalid_snapshot_file")
        raw = target.read_bytes()
        if hashlib.sha256(raw).hexdigest() != pointer["sha256"]:
            raise NewsError("snapshot_digest_mismatch")
        try:
            snapshot = json.loads(raw)
        except ValueError:
            raise NewsError("invalid_json_file") from None
        validate_publication(snapshot)
        if pointer.get("generated_at") != snapshot["generated_at"] or pointer.get("article_count") != len(snapshot["articles"]):
            raise NewsError("pointer_snapshot_mismatch")
    validate_publication(snapshot)
    return {"status": "valid", "articles": len(snapshot["articles"]), "generated_at": snapshot["generated_at"]}
