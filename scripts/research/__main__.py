"""CLI: python3 -m scripts.research build|validate"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.research.pack import (
    DEFAULT_OUT_DIR,
    PackError,
    build_pack,
    observable_metric_values,
    validate_pack,
    write_pack,
)
from scripts.research.render import render_all
from scripts.research.snapshot import SnapshotError, load_snapshot


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def cmd_build(args: argparse.Namespace) -> int:
    snapshot = load_snapshot(Path(args.snapshot) if args.snapshot else None)
    pack = build_pack(snapshot)
    out_dir = Path(args.out) if args.out else _root() / DEFAULT_OUT_DIR
    path = write_pack(pack, out_dir)
    artifacts = {}
    if not args.pack_only:
        artifacts = render_all(pack)
    print(
        json.dumps(
            {
                "ok": True,
                "pack": str(path),
                "dataset_hash": pack["dataset_hash"],
                "data_as_of": pack["data_as_of"],
                "verdict": pack["verdict"],
                "questions": len(pack["questions"]),
                "charts": len(pack["charts"]),
                "artifacts": {key: str(value) for key, value in artifacts.items()},
                "observable": observable_metric_values(pack),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    if args.pack:
        pack = json.loads(Path(args.pack).read_text(encoding="utf-8"))
    else:
        pack = build_pack(load_snapshot(Path(args.snapshot) if args.snapshot else None))
    validate_pack(pack)
    print(
        json.dumps(
            {
                "ok": True,
                "dataset_hash": pack["dataset_hash"],
                "data_as_of": pack["data_as_of"],
                "verdict": pack["verdict"],
                "observable": observable_metric_values(pack),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.research")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Emit pack + docs + noindex preview")
    build.add_argument("--snapshot", help="Snapshot directory (default data/pseo)")
    build.add_argument("--out", help="Output directory for pack.json")
    build.add_argument(
        "--pack-only",
        action="store_true",
        help="Skip docs/preview render (used by reproducibility runs)",
    )
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed on provenance or overclaim")
    validate.add_argument("--snapshot", help="Snapshot directory (default data/pseo)")
    validate.add_argument("--pack", help="Validate an existing pack.json")
    validate.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (SnapshotError, PackError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
