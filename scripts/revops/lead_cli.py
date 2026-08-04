#!/usr/bin/env python3
"""CLI for commercial lead stages (local file store or remote ops API).

Local:
  LEAD_STORE_DIR=./.leads python3 scripts/revops/lead_cli.py list
  LEAD_STORE_DIR=./.leads python3 scripts/revops/lead_cli.py set LEAD_ID contacted --actor tiago

Remote (production):
  OPS_TOKEN=… OPS_BASE=https://confenge.com.br python3 scripts/revops/lead_cli.py list --remote
  OPS_TOKEN=… python3 scripts/revops/lead_cli.py set LEAD_ID meeting --remote --actor tiago
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def remote(action: str, method: str = "GET", body: dict | None = None, qs: str = "") -> dict:
    base = (os.environ.get("OPS_BASE") or "https://confenge.com.br").rstrip("/")
    token = os.environ.get("OPS_TOKEN") or os.environ.get("REVOPS_TOKEN") or ""
    if not token:
        raise SystemExit("OPS_TOKEN required for --remote")
    url = f"{base}/.netlify/functions/ops?action={action}{qs}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"HTTP {e.code}: {detail}") from e


def local_list(store_dir: Path) -> list[dict]:
    out = []
    if not store_dir.is_dir():
        return out
    for p in store_dir.glob("*.json"):
        if p.name == "idem" or p.parent.name == "idem":
            continue
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return out


def local_get(store_dir: Path, lead_id: str) -> dict | None:
    p = store_dir / f"{lead_id}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def local_set(store_dir: Path, lead_id: str, patch: dict) -> dict:
    # Use Node stages via subprocess to avoid duplicating rules? Prefer import via node -e.
    # For Python local path, shell out to node applying real module.
    import subprocess
    import tempfile

    rec = local_get(store_dir, lead_id)
    if not rec:
        raise SystemExit(f"lead not found: {lead_id}")
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({"record": rec, "patch_input": patch}, f)
        tmp = f.name
    script = r"""
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const stages = require(path.join(root, 'netlify/functions/lib/lead-stages.cjs'));
const payload = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const rec = payload.record;
const inp = payload.patch_input;
const applied = stages.applyStageChange(rec, inp);
const next = { ...rec, ...applied, updated_at: new Date().toISOString() };
fs.writeFileSync(process.argv[2], JSON.stringify(next));
"""
    out_tmp = tmp + ".out"
    r = subprocess.run(
        ["node", "-e", script, tmp, out_tmp],
        cwd=str(Path(__file__).resolve().parents[2]),
        capture_output=True,
        text=True,
    )
    Path(tmp).unlink(missing_ok=True)
    if r.returncode != 0:
        Path(out_tmp).unlink(missing_ok=True)
        raise SystemExit(r.stderr or r.stdout or "stage apply failed")
    next_rec = json.loads(Path(out_tmp).read_text(encoding="utf-8"))
    Path(out_tmp).unlink(missing_ok=True)
    (store_dir / f"{lead_id}.json").write_text(json.dumps(next_rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return next_rec


def main() -> int:
    ap = argparse.ArgumentParser(description="CONFENGE lead stage CLI")
    ap.add_argument("--remote", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list")
    p_get = sub.add_parser("get")
    p_get.add_argument("lead_id")

    p_set = sub.add_parser("set")
    p_set.add_argument("lead_id")
    p_set.add_argument("stage")
    p_set.add_argument("--actor", default="cli")
    p_set.add_argument("--note", default="")
    p_set.add_argument("--loss-reason", default="")
    p_set.add_argument("--owner", default="")
    p_set.add_argument("--proposal-value", type=float, default=None)
    p_set.add_argument("--contract-value", type=float, default=None)
    p_set.add_argument("--revenue", type=float, default=None)

    p_funnel = sub.add_parser("funnel")
    # Allow `lead_cli.py funnel --remote` as well as `--remote funnel`
    argv = list(sys.argv[1:])
    if "--remote" in argv:
        argv = ["--remote"] + [a for a in argv if a != "--remote"]
    args = ap.parse_args(argv)
    store_dir = Path(os.environ.get("LEAD_STORE_DIR") or ".leads")

    if args.cmd == "list":
        if args.remote:
            data = remote("leads", qs="&pii=0")
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            leads = local_list(store_dir)
            print(json.dumps({"count": len(leads), "leads": [
                {"lead_id": l.get("lead_id"), "commercial_stage": l.get("commercial_stage"), "landing_page": l.get("landing_page")}
                for l in leads
            ]}, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "get":
        if args.remote:
            print(json.dumps(remote("lead", qs=f"&id={args.lead_id}&pii=1"), ensure_ascii=False, indent=2))
        else:
            print(json.dumps(local_get(store_dir, args.lead_id), ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "set":
        body = {
            "lead_id": args.lead_id,
            "stage": args.stage,
            "actor": args.actor,
            "note": args.note or None,
            "loss_reason": args.loss_reason or None,
            "owner": args.owner or None,
            "proposal_value": args.proposal_value,
            "contract_value": args.contract_value,
            "revenue_received": args.revenue,
        }
        if args.remote:
            print(json.dumps(remote("stage", method="POST", body=body), ensure_ascii=False, indent=2))
        else:
            print(json.dumps(local_set(store_dir, args.lead_id, body), ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "funnel":
        if args.remote:
            print(json.dumps(remote("funnel"), ensure_ascii=False, indent=2))
        else:
            print(json.dumps({"error": "use --remote or run ops funnel"}, ensure_ascii=False))
            return 2
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
