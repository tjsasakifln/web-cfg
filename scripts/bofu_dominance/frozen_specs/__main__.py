"""CLI: python3 -m scripts.bofu_dominance.frozen_specs [status|snapshot|gate]

Default is status: snapshot + gate over the six frozen pages with mutate=false.
Never writes pillar HTML.
"""

from __future__ import annotations

import argparse
import json
import sys

from scripts.bofu_dominance.frozen_specs.constants import DATA_DIR, ROOT
from scripts.bofu_dominance.frozen_specs.entry import run_entry
from scripts.bofu_dominance.frozen_specs.snapshot import write_snapshots_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="PREPARE-ONLY frozen BOFU pillar specs")
    parser.add_argument(
        "command",
        nargs="?",
        default="status",
        choices=("status", "snapshot", "gate"),
    )
    parser.add_argument("--write-data", action="store_true", help="Write snapshots.json only")
    parser.add_argument("--mutate", action="store_true", help="Forbidden in this campaign")
    args = parser.parse_args(argv)
    if args.mutate:
        print("html_mutation=false mutate flag refused in PREPARE-ONLY campaign", file=sys.stderr)
        return 2
    if args.command == "snapshot" and args.write_data:
        dest = DATA_DIR / "snapshots.json"
        doc = write_snapshots_json(dest, ROOT)
        print(
            json.dumps(
                {
                    "wrote": str(dest.relative_to(ROOT)),
                    "html_mutation": False,
                    "count": len(doc["pillars"]),
                },
                indent=2,
            )
        )
        return 0
    report = run_entry(mutate=False)
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    if report["html_mutation"] is not False:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
