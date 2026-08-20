"""CLI: python3 -m scripts.local_entity

Runs audit + census + decision on the in-repo specialist JSON-LD / proof / census inputs.
Does not call live Search Analytics.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from scripts.local_entity.run import dump_json, format_observables, repo_root, run_campaign


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.local_entity")
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = args.root or repo_root()
    result = run_campaign(
        root=root,
        out_dir=args.out_dir,
        write=not args.no_write,
    )
    sys.stdout.write(format_observables(result["observables"]))
    if args.json:
        sys.stdout.write(dump_json(result["observables"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
