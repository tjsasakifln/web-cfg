"""CLI: python3 -m scripts.market_answers build|validate"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from scripts.market_answers.clock import parse_instant, utc_now
from scripts.market_answers.consume import (
    ConsumeError,
    load_approvals,
    load_candidate,
    load_payload,
)
from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import write_page
from scripts.market_answers.report import build_status, write_status


def _now(args: argparse.Namespace) -> datetime:
    raw = getattr(args, "now", None) or os.environ.get("MARKET_ANSWER_NOW", "").strip()
    if raw:
        instant = parse_instant(raw)
        if instant is None:
            raise ConsumeError(f"unparseable evaluation instant {raw!r}")
        return instant
    return utc_now()


def _load(args: argparse.Namespace) -> tuple[dict, dict, dict]:
    payload = load_payload(Path(args.payload) if args.payload else None)
    record = load_candidate(Path(args.candidate) if args.candidate else None)
    approvals = load_approvals(Path(args.approvals) if args.approvals else None)
    return record, payload, approvals


def _public_result(decision, *, ok: bool, extra: dict | None = None) -> dict:
    body = {
        "ok": ok,
        "official_live": decision.official_live,
        "producer_status": decision.producer_status,
        "state": decision.state,
        "indexable": decision.indexable,
        "index_count": 1 if decision.indexable else 0,
        "robots": decision.robots,
        "sitemap": decision.sitemap,
        "recommendation": decision.recommendation,
        "content_hash": decision.content_hash,
        "freshness_class": decision.freshness_class,
        "evaluated_at": decision.evaluated_at,
        "age_seconds": decision.age_seconds,
        "expires_at": decision.expires_at,
        "reason_codes": list(decision.reason_codes),
    }
    if extra:
        body.update(extra)
    return body


def cmd_build(args: argparse.Namespace) -> int:
    record, payload, approvals = _load(args)
    now = _now(args)
    decision = evaluate(record, payload, approvals, now=now)
    written: dict[str, Path] = {}
    if not args.report_only:
        written = write_page(record, payload, decision)
    status = build_status(
        record=record,
        payload=payload,
        decision=decision,
        written=written,
        now=now,
    )
    paths = write_status(status)
    print(
        json.dumps(
            _public_result(
                decision,
                ok=True,
                extra={
                    "report": str(paths["markdown"]),
                    "rendered": {key: str(path) for key, path in written.items()},
                },
            ),
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    record, payload, approvals = _load(args)
    now = _now(args)
    decision = evaluate(record, payload, approvals, now=now)
    fixture_indexed = decision.is_fixture and decision.state == "PUBLISHABLE_INDEX"
    ready_on_fixture = (
        decision.is_fixture and decision.recommendation == "READY_FOR_OFFICIAL_PAYLOAD"
    )
    stale_or_unknown = decision.freshness_class in {"STALE", "UNKNOWN"}
    indexed_while_stale = decision.state == "PUBLISHABLE_INDEX" and stale_or_unknown
    if decision.is_fixture:
        ok = (
            not fixture_indexed
            and not ready_on_fixture
            and not decision.indexable
            and "noindex" in decision.robots
            and decision.sitemap is False
            and not indexed_while_stale
        )
    elif decision.indexable:
        ok = (
            all(decision.conditions.values())
            and decision.robots == "index,follow"
            and decision.sitemap is True
            and not fixture_indexed
            and not stale_or_unknown
            and decision.freshness_class in {"CURRENT", "EXPIRING"}
        )
    else:
        ok = "noindex" in decision.robots and decision.sitemap is False and not fixture_indexed
        if args.fail_on_stale and stale_or_unknown:
            ok = False
    if indexed_while_stale:
        ok = False
    print(
        json.dumps(
            _public_result(
                decision,
                ok=ok,
                extra={"fixture_indexed": fixture_indexed},
            ),
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


def cmd_hashes(args: argparse.Namespace) -> int:
    from scripts.market_answers.approval import payload_content_hash, rendered_content_hash

    record, payload, _approvals = _load(args)
    print(
        json.dumps(
            {
                "payload_content_hash": payload_content_hash(payload),
                "rendered_content_hash": rendered_content_hash(record, payload),
                "official_live": bool(payload.get("official_live")),
                "is_fixture": bool(payload.get("is_fixture")),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--payload", help="Path to Goal 03 payload (default: official live or fixture)")
    parser.add_argument("--candidate", help="Path to candidate record")
    parser.add_argument("--approvals", help="Path to approvals JSON")
    parser.add_argument(
        "--now",
        help="UTC instant for replay (ISO-8601). Default: datetime.now(timezone.utc)",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.market_answers")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Consume payload, gate, render canary, write status")
    _add_common(build)
    build.add_argument("--report-only", action="store_true")
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed if INDEX would be illegal")
    _add_common(validate)
    validate.add_argument(
        "--fail-on-stale",
        action="store_true",
        help="Non-zero exit when freshness_class is STALE or UNKNOWN (operational incident)",
    )
    validate.set_defaults(func=cmd_validate)

    hashes = sub.add_parser("hashes", help="Print payload and rendered content hashes")
    _add_common(hashes)
    hashes.set_defaults(func=cmd_hashes)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ConsumeError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
