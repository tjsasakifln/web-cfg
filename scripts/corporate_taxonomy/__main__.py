"""CLI: python3 -m scripts.corporate_taxonomy check"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.corporate_taxonomy.claims import scan_owned_strategy_docs
from scripts.corporate_taxonomy.inventory import load_inventory
from scripts.corporate_taxonomy.validate import TaxonomyError, load_committed_taxonomy


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    command = args[0] if args else "check"
    if command != "check":
        print(f"unknown_command:{command}", file=sys.stderr)
        return 2
    try:
        document = load_committed_taxonomy()
        inventory = load_inventory()
        claims = scan_owned_strategy_docs(ROOT)
    except (TaxonomyError, OSError, ValueError) as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1
    if claims:
        for row in claims:
            print(f"FAIL {row}", file=sys.stderr)
        return 1
    print(
        "OK "
        f"{document['contract_id']}/{document['contract_version']} "
        f"nuclei={len(document['nuclei'])} inventory={len(inventory)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
