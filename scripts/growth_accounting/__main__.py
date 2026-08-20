"""CLI: python3 -m scripts.growth_accounting build|validate"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.growth_accounting.errors import GrowthAccountingError
from scripts.growth_accounting.load import DEFAULT_BASELINE, DEFAULT_OUT_DIR, load_payload, repo_root
from scripts.growth_accounting.report import build_report, write_report
from scripts.growth_accounting.validate import load_json, validate_report


def cmd_build(args: argparse.Namespace) -> int:
    payload = load_payload(Path(args.input) if args.input else None)
    if args.as_of:
        payload = dict(payload)
        payload["as_of"] = args.as_of
    report = build_report(payload)
    out_dir = Path(args.out) if args.out else repo_root() / DEFAULT_OUT_DIR
    paths = write_report(report, out_dir, stem=args.stem)
    print(
        json.dumps(
            {
                "ok": True,
                "schema": report["schema"],
                "current_state": report["current_state"],
                "cohort_days": report["cohort_days"],
                "timezone": report["timezone"],
                "primary_series": report["primary_series"]["name"],
                "source_families_separated": report["flags"]["source_families_separated"],
                "unknown_preserved": report["flags"]["unknown_preserved"],
                "query_to_lead_join": report["flags"]["query_to_lead_join"],
                "page_count_kpi": report["flags"]["page_count_kpi"],
                "cohorts_available": report["cohorts_available"],
                "exponential_gate_eligible": report["exponential_gate_eligible"],
                "reason_codes": report["reason_codes"],
                "artifacts": paths,
                "input_hash": report["input_hash"],
                "report_hash": report["report_hash"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    if args.report:
        report = load_json(Path(args.report))
        payload = load_payload(Path(args.input)) if args.input else None
        validate_report(report, payload=payload)
    else:
        payload = load_payload(Path(args.input) if args.input else None)
        if args.as_of:
            payload = dict(payload)
            payload["as_of"] = args.as_of
        report = build_report(payload)
        validate_report(report, payload=payload)
    print(
        json.dumps(
            {
                "ok": True,
                "schema": report["schema"],
                "current_state": report["current_state"],
                "cohort_days": report["cohort_days"],
                "exponential_gate_eligible": report["exponential_gate_eligible"],
                "reason_codes": report["reason_codes"],
                "report_hash": report["report_hash"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.growth_accounting")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Emit JSON+MD growth-accounting report")
    build.add_argument("--input", help=f"Input JSON (default {DEFAULT_BASELINE})")
    build.add_argument("--as-of", dest="as_of", help="Frozen as_of override (ISO-8601 with offset)")
    build.add_argument("--out", help=f"Output directory (default {DEFAULT_OUT_DIR})")
    build.add_argument("--stem", default="current-state", help="Output filename stem")
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed on schema, hashes, and forbidden claims")
    validate.add_argument("--input", help="Input JSON used to rebuild")
    validate.add_argument("--report", help="Existing report JSON to validate")
    validate.add_argument("--as-of", dest="as_of", help="Frozen as_of override")
    validate.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (GrowthAccountingError, OSError, json.JSONDecodeError, AssertionError, ValueError) as exc:
        reason = getattr(exc, "reason", None)
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "reason": reason,
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
