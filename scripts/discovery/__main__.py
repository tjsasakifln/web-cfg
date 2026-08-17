"""CLI: python3 -m scripts.discovery report|indexnow|probe|import-gsc|import-referral

IndexNow stays prepare-only. Probe is read-only GET/HEAD. Importers are local files.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.gsc_import import GscImportError, import_gsc_file  # noqa: E402
from scripts.discovery.indexnow import format_prepare, prepare  # noqa: E402
from scripts.discovery.observation import sha256_text  # noqa: E402
from scripts.discovery.probe import probe_by_id  # noqa: E402
from scripts.discovery.referral_import import ReferralImportError, import_referral_file  # noqa: E402
from scripts.discovery.registry import load_cohort, repo_root  # noqa: E402
from scripts.discovery.report import build_report, dump_stable, format_report  # noqa: E402
from scripts.discovery.store import append_observation, default_store_path, write_snapshot_json  # noqa: E402


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", help="repository root (default: detected)")
    parser.add_argument("--as-of", dest="as_of", default=None, help="stable timestamp override")
    parser.add_argument("--json", action="store_true", help="also emit stable JSON")
    parser.add_argument("--out", help="write report/receipt/snapshot to this path")


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


def _resolve_asset_id(args: argparse.Namespace, root: Path) -> str:
    if getattr(args, "asset_id", None):
        return str(args.asset_id)
    cohort = load_cohort(root=root)
    approved = cohort.get("approved_asset_id")
    if approved:
        return str(approved)
    raise SystemExit("asset_id_required")


def _cmd_probe(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else repo_root()
    asset_id = _resolve_asset_id(args, root)
    observed_at = args.as_of or _utc_now()
    snapshot = probe_by_id(
        asset_id,
        root=root,
        observed_at=observed_at,
        timeout=args.timeout,
        retries=args.retries,
        rate_limit_s=args.rate_limit,
    )
    store = Path(args.snapshots) if args.snapshots else default_store_path(root)
    stored = append_observation(store, snapshot)
    digest = sha256_text(
        json.dumps({k: v for k, v in snapshot.items() if k != "appended"}, ensure_ascii=False, sort_keys=True)
    )
    payload = {
        **stored,
        "snapshot_sha256": digest,
        "replay_command": snapshot.get("replay_command"),
    }
    sys.stdout.write(dump_stable(payload) if args.json else _format_probe(payload))
    if args.out:
        write_snapshot_json(Path(args.out), payload)
    return 0 if stored.get("status") != "UNAVAILABLE" else 2


def _format_probe(payload: dict) -> str:
    http = payload.get("http") or {}
    robots = payload.get("robots") or {}
    sitemap = payload.get("sitemap") or {}
    lines = [
        "DISCOVERY PROBE",
        f"asset_id: {payload.get('asset_id')}",
        f"canonical_url: {(payload.get('dimensions') or {}).get('canonical_url')}",
        f"observed_at: {payload.get('observed_at')}",
        f"status: {payload.get('status')}",
        f"technical_status: {payload.get('technical_status')}",
        f"http_status: {http.get('status')}",
        f"chain: {http.get('chain')}",
        f"declared_canonical: {payload.get('declared_canonical')}",
        f"robots_meta: {robots.get('meta')}",
        f"robots_blocked: {robots.get('blocked')}",
        f"indexability: {(payload.get('indexability') or {}).get('state')}",
        f"sitemap_present: {sitemap.get('present')}",
        f"content_hash: {payload.get('content_hash')}",
        f"reason_codes: {','.join(payload.get('reason_codes') or [])}",
        f"replay_command: {payload.get('replay_command')}",
        f"snapshot_sha256: {payload.get('snapshot_sha256')}",
        f"record_hash: {payload.get('record_hash')}",
        f"replay: {str(payload.get('replay')).lower()}",
        "",
    ]
    return "\n".join(lines)


def _cmd_import_gsc(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else repo_root()
    asset_id = _resolve_asset_id(args, root)
    observed_at = args.as_of or _utc_now()
    try:
        rows = import_gsc_file(
            Path(args.file),
            asset_id=asset_id,
            observed_at=observed_at,
            timezone=args.timezone,
            period_start=args.period_start,
            period_end=args.period_end,
        )
    except GscImportError as exc:
        sys.stderr.write(f"gsc_import_refused:{exc}\n")
        return 1
    store = Path(args.snapshots) if args.snapshots else default_store_path(root)
    stored = [append_observation(store, row) for row in rows]
    appended = sum(1 for row in stored if row.get("appended"))
    payload = {"imported": len(stored), "appended": appended, "replayed": len(stored) - appended}
    sys.stdout.write(dump_stable(payload))
    return 0


def _cmd_import_referral(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else repo_root()
    asset_id = _resolve_asset_id(args, root)
    observed_at = args.as_of or _utc_now()
    try:
        rows = import_referral_file(
            Path(args.file),
            asset_id=asset_id,
            observed_at=observed_at,
        )
    except ReferralImportError as exc:
        sys.stderr.write(f"referral_import_refused:{exc}\n")
        return 1
    store = Path(args.snapshots) if args.snapshots else default_store_path(root)
    stored = [append_observation(store, row) for row in rows]
    appended = sum(1 for row in stored if row.get("appended"))
    payload = {"imported": len(stored), "appended": appended, "replayed": len(stored) - appended}
    sys.stdout.write(dump_stable(payload))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m scripts.discovery",
        description="Discovery observatory: offline report, read-only probe, local imports, IndexNow prepare-only.",
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

    probe_p = sub.add_parser("probe", help="read-only public GET/HEAD technical probe")
    _add_common(probe_p)
    probe_p.add_argument("--asset-id", dest="asset_id", default=None)
    probe_p.add_argument("--timeout", type=float, default=15.0)
    probe_p.add_argument("--retries", type=int, default=2)
    probe_p.add_argument("--rate-limit", dest="rate_limit", type=float, default=1.0)
    probe_p.add_argument("--snapshots", default=None, help="append-only NDJSON store")
    probe_p.set_defaults(func=_cmd_probe)

    gsc_p = sub.add_parser("import-gsc", help="import a local GSC CSV/JSON export")
    _add_common(gsc_p)
    gsc_p.add_argument("--file", required=True)
    gsc_p.add_argument("--asset-id", dest="asset_id", default=None)
    gsc_p.add_argument("--timezone", default=None)
    gsc_p.add_argument("--period-start", dest="period_start", default=None)
    gsc_p.add_argument("--period-end", dest="period_end", default=None)
    gsc_p.add_argument("--snapshots", default=None)
    gsc_p.set_defaults(func=_cmd_import_gsc)

    ref_p = sub.add_parser("import-referral", help="import a local referral/outcome export")
    _add_common(ref_p)
    ref_p.add_argument("--file", required=True)
    ref_p.add_argument("--asset-id", dest="asset_id", default=None)
    ref_p.add_argument("--snapshots", default=None)
    ref_p.set_defaults(func=_cmd_import_referral)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
