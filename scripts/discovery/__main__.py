"""CLI: python3 -m scripts.discovery report|indexnow

Prepare-only. Does not probe live search consoles or POST to IndexNow.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.indexnow import format_prepare, prepare  # noqa: E402
from scripts.discovery.registry import repo_root  # noqa: E402
from scripts.discovery.report import build_report, dump_stable, format_report  # noqa: E402


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", help="repository root (default: detected)")
    parser.add_argument("--as-of", dest="as_of", default=None, help="stable timestamp override")
    parser.add_argument("--json", action="store_true", help="also emit stable JSON")
    parser.add_argument("--out", help="write report/receipt to this path")


def _cmd_report(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else repo_root()
    report = build_report(root=root, generated_at=args.as_of)
    text = format_report(report)
    sys.stdout.write(text)
    if args.json:
        sys.stdout.write(dump_stable(report))
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        if args.json:
            out.write_text(dump_stable(report), encoding="utf-8")
        else:
            out.write_text(text, encoding="utf-8")
    return 0


def _cmd_indexnow(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else repo_root()
    urls = list(args.url or [])
    if not urls:
        raise SystemExit("indexnow requires --url (repeatable)")
    receipt = prepare(
        urls,
        state=args.state,
        root=root,
        receipts_dir=Path(args.receipts_dir) if args.receipts_dir else None,
        dry_run=not args.send,
        send=bool(args.send),
        generated_at=args.as_of,
    )
    sys.stdout.write(format_prepare(receipt))
    if args.json or args.out:
        payload = dump_stable(receipt)
        if args.json:
            sys.stdout.write(payload)
        if args.out:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(payload, encoding="utf-8")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m scripts.discovery",
        description="Discovery observatory and IndexNow prepare-only notifier.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    report_p = sub.add_parser("report", help="deterministic per-asset observatory report")
    _add_common(report_p)
    report_p.set_defaults(func=_cmd_report)

    idx_p = sub.add_parser("indexnow", help="prepare IndexNow notification (dry-run default)")
    _add_common(idx_p)
    idx_p.add_argument("--url", action="append", default=[], help="canonical URL (repeatable)")
    idx_p.add_argument(
        "--state",
        default="changed",
        choices=("added", "changed", "removed"),
        help="change state for accepted URLs",
    )
    idx_p.add_argument(
        "--send",
        action="store_true",
        help="explicit send flag — refused on this path; do not use",
    )
    idx_p.add_argument(
        "--receipts-dir",
        dest="receipts_dir",
        default=None,
        help="receipt store (default: data/discovery/receipts)",
    )
    idx_p.set_defaults(func=_cmd_indexnow)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
