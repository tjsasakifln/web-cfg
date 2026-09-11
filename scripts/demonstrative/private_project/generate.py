"""Write the public demonstrative and the consumption descriptor from source."""

from __future__ import annotations

import argparse
import json
import subprocess
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

COMPOSE_REL = Path("scripts/campaigns/pos-inb-20260911/02/compose_purchase_proof.mjs")


def compose_purchase_pages(root: Path) -> dict[str, str]:
    script = root / COMPOSE_REL
    if not script.is_file():
        raise SystemExit(f"compose script missing: {COMPOSE_REL.as_posix()}")
    completed = subprocess.run(
        ["node", str(script), "--root", str(root)],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "compose_failed").strip()
        raise SystemExit(f"compose_purchase_proof failed: {detail}")
    payload = json.loads(completed.stdout) if completed.stdout.strip().startswith("{") else {}
    return payload if isinstance(payload, dict) else {}


def generate(root: Path, *, compose_purchases: bool = True) -> dict:
    source = load_source(root=root)
    extracts = derive(source)
    problems = verify(source, extracts)
    if problems:
        raise SystemExit("verify failed: " + ", ".join(problems))
    written = write_outputs(root, extracts)
    composed: dict[str, str] = {}
    if compose_purchases:
        composed = compose_purchase_pages(root)
    return {
        "extracts": extracts,
        "written": {k: str(v.relative_to(root)) for k, v in written.items()},
        "composed": composed,
    }


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
