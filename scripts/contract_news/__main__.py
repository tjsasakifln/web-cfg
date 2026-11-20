"""python3 -m scripts.contract_news {generate,check}."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .core import MAX_INPUT_BYTES, NewsError
from .pipeline import Settings, check_publication, generate, read_json, source_state


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish bounded, source-grounded PNCP contract news.")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("generate")
    create.add_argument("--input", required=True, type=Path)
    create.add_argument("--state-dir", type=Path, default=Path("/var/lib/confenge-web/contract-news/private"))
    create.add_argument("--output-dir", type=Path, default=Path("/var/lib/confenge-web/contract-news/public"))
    create.add_argument("--dry-run", action="store_true")
    create.add_argument("--max-per-run", type=int, default=2)
    create.add_argument("--max-per-day", type=int, default=6)
    create.add_argument("--max-calls-per-day", type=int, default=12)
    create.add_argument("--max-attempts-per-record", type=int, default=1)
    create.add_argument("--timeout", type=int, default=120)
    check = commands.add_parser("check")
    check.add_argument("--input", required=True, type=Path)
    state = commands.add_parser("source-state")
    state.add_argument("--state-dir", type=Path, default=Path("/var/lib/confenge-web/contract-news/private"))
    args = parser.parse_args()
    try:
        if args.command == "check":
            result = check_publication(args.input)
        elif args.command == "source-state":
            result = source_state(args.state_dir)
        else:
            settings = Settings(
                state_dir=args.state_dir, output_dir=args.output_dir,
                enabled=os.environ.get("CONFENGE_NEWS_ENABLED") == "1",
                max_per_run=args.max_per_run, max_per_day=args.max_per_day,
                max_calls_per_day=args.max_calls_per_day,
                max_attempts_per_record=args.max_attempts_per_record,
                timeout=args.timeout, model=os.environ.get("CONFENGE_NEWS_MODEL") or None,
            )
            result = generate(read_json(args.input, MAX_INPUT_BYTES), settings,
                              api_key=os.environ.get("OPENAI_API_KEY", ""), dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (NewsError, OSError):
        exc = sys.exc_info()[1]
        code = str(exc) if isinstance(exc, NewsError) else "filesystem_error"
        print(json.dumps({"status": "error", "code": code}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
