"""CLI: python3 -m scripts.contract_analysis build|validate"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.contract_analysis import MAX_CANARY
from scripts.contract_analysis.citation import prepare_citation
from scripts.contract_analysis.consume import ConsumeError, load_canary, load_editorial_fixture
from scripts.contract_analysis.gate import evaluate_cohort
from scripts.contract_analysis.render import write_pages, write_sitemap
from scripts.contract_analysis.report import build_status, write_status


def cmd_build(args: argparse.Namespace) -> int:
    bundle = load_canary(
        live_path=Path(args.live) if args.live else None,
        fixture_path=Path(args.fixture) if args.fixture else None,
        limit=args.limit,
    )
    decisions = evaluate_cohort(bundle["records"])
    pairs = list(zip(bundle["records"], decisions))
    written = {}
    if not args.report_only:
        # Extra-cli facts-only shortlist rarely reaches NOINDEX. Keep the
        # labeled editorial fixture as a preview surface when the canary
        # itself is a fixture export.
        render_pairs = list(pairs)
        if bundle.get("export_kind") == "extra_cli_public_read" and bundle.get("test_only"):
            preview = load_editorial_fixture()
            preview_decisions = evaluate_cohort(preview["records"])
            render_pairs = list(zip(preview["records"], preview_decisions))
        index_count = sum(1 for _rec, dec in render_pairs if dec.state == "PUBLISHABLE_INDEX")
        written = write_pages(render_pairs, index_count=index_count)
        write_sitemap(render_pairs)
    status = build_status(bundle=bundle, decisions=decisions, written=written)
    # Review packets for official-live READY_FOR_HUMAN_REVIEW. Never approve or activate.
    if not args.report_only:
        import hashlib

        from scripts.contract_analysis.approval import material_hash
        from scripts.contract_analysis.quality import INDEX_READY_VERDICT, READY_FOR_HUMAN_REVIEW
        from scripts.contract_analysis.review_packet import emit_review_packet
        from scripts.contract_analysis.render import render_analysis_html

        packets = []
        for rec, dec in pairs:
            official = (
                dec.human_review_status == READY_FOR_HUMAN_REVIEW
                or dec.review_recommendation == INDEX_READY_VERDICT
            )
            if not official:
                continue
            if rec.get("is_fixture") or dec.is_fixture:
                continue
            rec = dict(rec)
            rec["material_hash"] = material_hash(rec)
            ready = bundle.get("handoff") or {}
            rec["producer_commit"] = rec.get("producer_commit") or ready.get("producer_commit")
            rec["root_content_hash"] = rec.get("root_content_hash") or ready.get("root_content_hash")
            html = render_analysis_html(rec, dec)
            rec["rendered_hash"] = hashlib.sha256(html.encode("utf-8")).hexdigest()
            dest = emit_review_packet(rec, dec, rendered_html=html)
            packets.append(str(dest))
        status["review_packets"] = packets
    citations = []
    for rec, dec in pairs:
        if dec.state in {"PUBLISHABLE_NOINDEX", "PUBLISHABLE_INDEX"}:
            report = prepare_citation(rec, indexable=dec.indexable)
            citations.append(
                {
                    "id": dec.analysis_id,
                    "auto_send": report.get("auto_send"),
                    "distribute": report.get("kill_gates", {}).get("distribute"),
                }
            )
    status["citations"] = citations
    paths = write_status(status)
    print(
        json.dumps(
            {
                "ok": True,
                "evaluated": status["evaluated"],
                "source_kind": status["source_kind"],
                "catalog_mode": status.get("catalog_mode"),
                "test_only": status["test_only"],
                "index_count": status["index_count"],
                "state_counts": status["state_counts"],
                "recommendation": status["recommendation"],
                "expand_adjust_kill": status.get("expand_adjust_kill"),
                "has_comparable_or_not_comparable": status.get("has_comparable_or_not_comparable"),
                "live_absent": status.get("live_absent"),
                "factual_handoff_pending": status.get("factual_handoff_pending"),
                "nenhum_index_ativo": status.get("nenhum_index_ativo"),
                "report": str(paths["markdown"]),
                "rendered": status["rendered"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    bundle = load_canary(
        live_path=Path(args.live) if args.live else None,
        fixture_path=Path(args.fixture) if args.fixture else None,
        limit=args.limit,
    )
    decisions = evaluate_cohort(bundle["records"])
    fixture_indexed = [d.analysis_id for d in decisions if d.is_fixture and d.state == "PUBLISHABLE_INDEX"]
    over = len(decisions) > MAX_CANARY
    ok = not fixture_indexed and not over
    print(
        json.dumps(
            {
                "ok": ok,
                "evaluated": len(decisions),
                "source_kind": bundle.get("source_kind"),
                "index_count": sum(1 for d in decisions if d.state == "PUBLISHABLE_INDEX"),
                "fixture_indexed": fixture_indexed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.contract_analysis")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Evaluate ≤10 analyses, render canary, write status")
    build.add_argument("--live", help="Path to extra-cli public-read-contract-analysis export")
    build.add_argument("--fixture", help="Path to test-only fixture bundle")
    build.add_argument("--limit", type=int, default=MAX_CANARY)
    build.add_argument("--report-only", action="store_true")
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed if a fixture would INDEX or cap is exceeded")
    validate.add_argument("--live", help="Path to extra-cli public-read-contract-analysis export")
    validate.add_argument("--fixture", help="Path to test-only fixture bundle")
    validate.add_argument("--limit", type=int, default=MAX_CANARY)
    validate.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ConsumeError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
