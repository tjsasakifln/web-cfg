"""CLI: python3 -m scripts.knowledge_funnel walk|validate|hash"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.knowledge_funnel.corpus import REQUIRED_CASES, load_corpus
from scripts.knowledge_funnel.hash import trace_hash
from scripts.knowledge_funnel.walk import walk, walk_twice


def _dump(payload: dict, dest: str | None) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if dest:
        Path(dest).write_text(text, encoding="utf-8")
    sys.stdout.write(text)


def cmd_walk(args: argparse.Namespace) -> int:
    if args.twice:
        result = walk_twice(args.case, corpus_path=Path(args.corpus) if args.corpus else None)
        _dump(
            {
                "ok": result["match"],
                "hash_1": result["hash_1"],
                "hash_2": result["hash_2"],
                "trace": result["trace_1"],
            },
            args.out,
        )
        return 0 if result["match"] else 1
    trace = walk(
        args.case,
        corpus_path=Path(args.corpus) if args.corpus else None,
        store_dir=Path(args.store_dir) if args.store_dir else None,
    )
    _dump(trace, args.out)
    return 0 if trace.get("closed") in {"ok", "rejected", "retryable"} else 1


def cmd_validate(args: argparse.Namespace) -> int:
    corpus = load_corpus(Path(args.corpus) if args.corpus else None)
    pair = walk_twice("happy", corpus_path=Path(args.corpus) if args.corpus else None)
    negatives = {}
    ok = pair["match"]
    for case_id in REQUIRED_CASES:
        if case_id == "happy":
            continue
        trace = walk(case_id, corpus_path=Path(args.corpus) if args.corpus else None)
        expect = corpus["cases"][case_id]["expect"]
        closed = trace["closed"]
        case_ok = closed == expect or (expect == "ok" and closed == "ok")
        if expect == "retryable":
            case_ok = closed == "retryable" and any(
                item.get("handoff_status") == "RETRYABLE"
                for item in (trace.get("store") or {}).get("recoverable") or []
            )
        if expect == "rejected":
            case_ok = closed == "rejected"
        negatives[case_id] = {"ok": case_ok, "closed": closed, "hash": trace["trace_hash"]}
        ok = ok and case_ok
    payload = {
        "ok": ok,
        "corpus_schema": corpus.get("schema"),
        "claimed_live": False,
        "official_live": False,
        "happy_hash_match": pair["match"],
        "hash_1": pair["hash_1"],
        "hash_2": pair["hash_2"],
        "negatives": negatives,
    }
    _dump(payload, args.out)
    return 0 if ok else 1


def cmd_hash(args: argparse.Namespace) -> int:
    trace = json.loads(Path(args.trace).read_text(encoding="utf-8"))
    digest = trace_hash({key: value for key, value in trace.items() if key != "trace_hash"})
    _dump({"trace_hash": digest, "matches_embedded": digest == trace.get("trace_hash")}, args.out)
    return 0 if digest == trace.get("trace_hash") else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.knowledge_funnel")
    sub = parser.add_subparsers(dest="cmd", required=True)

    walk_p = sub.add_parser("walk", help="Run one labeled corpus case through shipped units")
    walk_p.add_argument("--case", default="happy")
    walk_p.add_argument("--corpus")
    walk_p.add_argument("--store-dir")
    walk_p.add_argument("--out")
    walk_p.add_argument("--twice", action="store_true")
    walk_p.set_defaults(func=cmd_walk)

    val = sub.add_parser("validate", help="Happy path ×2 plus fail-closed negatives")
    val.add_argument("--corpus")
    val.add_argument("--out")
    val.set_defaults(func=cmd_validate)

    hashed = sub.add_parser("hash", help="Re-hash an existing trace")
    hashed.add_argument("trace")
    hashed.add_argument("--out")
    hashed.set_defaults(func=cmd_hash)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001 — CLI fail-closed
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
