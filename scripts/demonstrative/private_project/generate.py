"""Write the public demonstrative and the consumption descriptor from source."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DEFAULT = Path(__file__).resolve().parents[3]
if str(ROOT_DEFAULT) not in sys.path:
    sys.path.insert(0, str(ROOT_DEFAULT))

from scripts.demonstrative.private_project.derive import (  # noqa: E402
    SOURCE_REL,
    derive,
    load_source,
    verify,
)
from scripts.demonstrative.private_project.render import write_outputs  # noqa: E402


def generate(root: Path) -> dict:
    source = load_source(root=root)
    extracts = derive(source)
    problems = verify(source, extracts)
    if problems:
        raise SystemExit("verify failed: " + ", ".join(problems))
    written = write_outputs(root, extracts)
    return {"extracts": extracts, "written": {k: str(v.relative_to(root)) for k, v in written.items()}}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the private-project demonstrative")
    parser.add_argument("--root", type=Path, default=ROOT_DEFAULT)
    args = parser.parse_args(argv)
    result = generate(args.root.resolve())
    summary = {
        "proof_id": result["extracts"]["proof_id"],
        "revision": result["extracts"]["revision"],
        "floor_area_m2": result["extracts"]["named_totals"]["floor_area_m2"],
        "wall_net_m2": result["extracts"]["named_totals"]["wall_net_m2"],
        "budget_subtotal": result["extracts"]["budget_subtotal"],
        "written": result["written"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
