"""CLI: python3 -m scripts.distribution prepare

Prepare-only. Does not send mail, fire webhooks, or contact anyone.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.distribution.market_answer_kit import build_kit, write_kit  # noqa: E402
from scripts.distribution.prepare import format_prepare_report, prepare_asset  # noqa: E402
from scripts.distribution.registry import DEFAULT_ASSET_ID  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m scripts.distribution",
        description="Prepare an earned-distribution report. Never sends.",
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="prepare",
        choices=("prepare", "audit", "market-answer-kit"),
        help="prepare (default), audit, or market-answer-kit — all prepare-only",
    )
    parser.add_argument(
        "--asset",
        default=DEFAULT_ASSET_ID,
        help="asset id (default: radar-nacional-obras-publicas)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="also print the machine report after the human-readable text",
    )
    args = parser.parse_args(argv)
    if args.command == "market-answer-kit":
        kit = build_kit(root=ROOT)
        written = write_kit(kit, root=ROOT)
        sys.stdout.write(
            "MARKET ANSWER KIT\n"
            f"auto_send: {str(kit['auto_send']).lower()}\n"
            f"sent: {str(kit['sent']).lower()}\n"
            f"targets: {len(kit['targets'])}\n"
            f"drafts: {len(kit['drafts'])}\n"
            f"files: {', '.join(sorted(written))}\n"
        )
        if args.json:
            safe = {k: v for k, v in kit.items() if k != "drafts"}
            json.dump(safe, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
            sys.stdout.write("\n")
        return 0
    report = prepare_asset(args.asset, root=ROOT)
    sys.stdout.write(format_prepare_report(report))
    if args.json:
        sys.stdout.write("\n")
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
