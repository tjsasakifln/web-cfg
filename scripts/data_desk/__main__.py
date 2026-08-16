"""CLI: python3 -m scripts.data_desk generate

Prepare-only. Writes a local package. Does not publish, syndicate, or send.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data_desk.package import format_generate, generate  # noqa: E402
from scripts.discovery.report import dump_stable  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m scripts.data_desk",
        description="Generate one Data Desk citation package. Never publishes.",
    )
    parser.add_argument("command", nargs="?", default="generate", choices=("generate",))
    parser.add_argument("--root", help="repository root")
    parser.add_argument("--asset", help="path to asset JSON (default: labeled fixture)")
    parser.add_argument("--out", help="output directory")
    parser.add_argument("--as-of", dest="as_of", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    package = generate(
        root=Path(args.root) if args.root else None,
        asset_path=Path(args.asset) if args.asset else None,
        out_dir=Path(args.out) if args.out else None,
        generated_at=args.as_of,
    )
    sys.stdout.write(format_generate(package))
    if args.json:
        sys.stdout.write("\n")
        sys.stdout.write(dump_stable(package))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
