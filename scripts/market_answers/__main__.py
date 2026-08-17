"""CLI: python3 -m scripts.market_answers build|validate"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from scripts.market_answers.consume import (
    ConsumeError,
    load_approvals,
    load_candidate,
    load_payload,
)
from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import write_page
from scripts.market_answers.report import build_status, write_status


def _today() -> date:
    return date(2026, 8, 17)


def _load(args: argparse.Namespace) -> tuple[dict, dict, dict]:
    payload = load_payload(Path(args.payload) if args.payload else None)
    record = load_candidate(Path(args.candidate) if args.candidate else None)
    approvals = load_approvals(Path(args.approvals) if args.approvals else None)
    return record, payload, approvals


def cmd_build(args: argparse.Namespace) -> int:
    record, payload, approvals = _load(args)
    decision = evaluate(record, payload, approvals, today=_today())
    written: dict[str, Path] = {}
    if not args.report_only:
        written = write_page(record, payload, decision)
    status = build_status(
        record=record,
        payload=payload,
        decision=decision,
        written=written,
        today=_today(),
    )
    paths = write_status(status)
    print(
        json.dumps(
            {
                "ok": True,
                "official_live": decision.official_live,
                "producer_status": decision.producer_status,
                "state": decision.state,
                "indexable": decision.indexable,
                "index_count": 1 if decision.indexable else 0,
                "robots": decision.robots,
                "sitemap": decision.sitemap,
                "recommendation": decision.recommendation,
                "content_hash": decision.content_hash,
                "report": str(paths["markdown"]),
                "rendered": {key: str(path) for key, path in written.items()},
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    record, payload, approvals = _load(args)
    decision = evaluate(record, payload, approvals, today=_today())
    fixture_indexed = decision.is_fixture and decision.state == "PUBLISHABLE_INDEX"
    ready_on_fixture = (
        decision.is_fixture and decision.recommendation == "READY_FOR_OFFICIAL_PAYLOAD"
    )
    if decision.is_fixture:
        ok = (
            not fixture_indexed
            and not ready_on_fixture
            and not decision.indexable
            and "noindex" in decision.robots
            and decision.sitemap is False
        )
    elif decision.indexable:
        ok = (
            all(decision.conditions.values())
            and decision.robots == "index,follow"
            and decision.sitemap is True
            and not fixture_indexed
        )
    else:
        ok = "noindex" in decision.robots and decision.sitemap is False and not fixture_indexed
    print(
        json.dumps(
            {
                "ok": ok,
                "official_live": decision.official_live,
                "producer_status": decision.producer_status,
                "state": decision.state,
                "index_count": 1 if decision.indexable else 0,
                "robots": decision.robots,
                "sitemap": decision.sitemap,
                "recommendation": decision.recommendation,
                "fixture_indexed": fixture_indexed,
                "reason_codes": list(decision.reason_codes),
            },
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.market_answers")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Consume payload, gate, render canary, write status")
    build.add_argument("--payload", help="Path to Goal 03 payload (default: official live or fixture)")
    build.add_argument("--candidate", help="Path to candidate record")
    build.add_argument("--approvals", help="Path to approvals JSON")
    build.add_argument("--report-only", action="store_true")
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed if the fixture would INDEX")
    validate.add_argument("--payload", help="Path to Goal 03 payload")
    validate.add_argument("--candidate", help="Path to candidate record")
    validate.add_argument("--approvals", help="Path to approvals JSON")
    validate.set_defaults(func=cmd_validate)

    hashes = sub.add_parser("hashes", help="Print payload and rendered content hashes")
    hashes.add_argument("--payload", help="Path to Goal 03 payload")
    hashes.add_argument("--candidate", help="Path to candidate record")
    hashes.add_argument("--approvals", help="Path to approvals JSON")
    hashes.set_defaults(func=cmd_hashes)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ConsumeError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
