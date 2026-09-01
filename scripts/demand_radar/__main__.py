"""CLI for building or checking the internal Demand Radar ledger."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from scripts.demand_radar.engine import build_ledger
from scripts.demand_radar.report import render_markdown

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "demand_radar" / "snapshots"
DEFAULT_APPROVALS = ROOT / "data" / "demand_radar" / "approved-sources.v1.json"
DEFAULT_LEDGER = ROOT / "data" / "demand_radar" / "ledger.v1.json"
DEFAULT_REPORT = ROOT / "docs" / "demand-radar" / "REPORT.md"
FULL_GIT_SHA = re.compile(r"^[0-9a-f]{40}$")


def _reject_non_standard_number(token: str) -> None:
    raise ValueError(f"non_standard_json_number:{token}")


def _load(path: Path) -> dict[str, Any]:
    try:
        return json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_standard_number,
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"snapshot_read_failed:{path}") from exc


def load_snapshots(root: Path) -> list[dict[str, Any]]:
    paths = sorted(path for path in root.rglob("*.json") if path.is_file())
    if not paths:
        raise ValueError(f"no_snapshot_files:{root}")
    return [_load(path) for path in paths]


def _origin_main() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "origin/main"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _full_git_sha(value: object, *, source: str) -> str:
    if not isinstance(value, str) or not FULL_GIT_SHA.fullmatch(value):
        raise ValueError(f"origin_main_full_sha_required:{source}")
    return value


def _sealed_origin_main(ledger_path: Path) -> str:
    ledger = _load(ledger_path)
    return _full_git_sha(ledger.get("origin_main"), source=str(ledger_path))


def _resolved_origin_main(args: argparse.Namespace) -> str:
    if args.origin_main is not None:
        return _full_git_sha(args.origin_main, source="--origin-main")
    if args.command == "check":
        # A deterministic check reproduces the provenance sealed in the output;
        # build is the only mode that observes the contemporary remote ref.
        return _sealed_origin_main(args.ledger)
    return _full_git_sha(_origin_main(), source="origin/main")


def _render(args: argparse.Namespace) -> tuple[str, str]:
    snapshots = load_snapshots(args.input_dir)
    ledger = build_ledger(
        snapshots,
        approvals=_load(args.approvals),
        as_of=args.as_of,
        origin_main=_resolved_origin_main(args),
    )
    ledger_text = json.dumps(ledger, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    return ledger_text, render_markdown(ledger)


def _check(path: Path, expected: str) -> None:
    try:
        actual = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"generated_output_missing:{path}") from exc
    if actual != expected:
        raise ValueError(f"generated_output_stale:{path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check"))
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--approvals", type=Path, default=DEFAULT_APPROVALS)
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--origin-main")
    args = parser.parse_args()

    ledger_text, report_text = _render(args)
    if args.command == "check":
        _check(args.ledger, ledger_text)
        _check(args.report, report_text)
        print("demand_radar_outputs_current")
        return 0
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.ledger.write_text(ledger_text, encoding="utf-8")
    args.report.write_text(report_text, encoding="utf-8")
    print(f"wrote {args.ledger.relative_to(ROOT)}")
    print(f"wrote {args.report.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
