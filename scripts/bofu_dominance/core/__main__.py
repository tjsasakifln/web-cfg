"""Entry point: ``python3 -m scripts.bofu_dominance.core``."""

from __future__ import annotations

import argparse
import sys

from scripts.bofu_dominance.core.hashing import canonical_json
from scripts.bofu_dominance.core.ledger import build_status, write_artifacts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the BOFU-CORE intent ledger")
    parser.add_argument("--write", action="store_true", help="write status.json and docs")
    parser.add_argument("--print", action="store_true", dest="dump", help="print status JSON")
    args = parser.parse_args(argv)
    status = build_status()
    if args.dump or not args.write:
        sys.stdout.write(canonical_json(status))
    if args.write:
        paths = write_artifacts(status)
        sys.stderr.write("wrote " + ", ".join(f"{k}={v}" for k, v in paths.items()) + "\n")
    frozen = [item for item in status["families"] if item["state"] == "FROZEN"]
    if any(item["recommendation"]["authorizes_html_edit"] for item in frozen):
        raise SystemExit("frozen family authorized edit-now")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
