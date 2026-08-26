#!/usr/bin/env python3
"""CLI for commercial lead stages (local file store or remote ops API).

Local:
  CONFENGE_STORAGE_DIR=/var/lib/confenge-web python3 scripts/revops/lead_cli.py list
  CONFENGE_STORAGE_DIR=/var/lib/confenge-web python3 scripts/revops/lead_cli.py set LEAD_ID contacted --actor tiago

Remote (production):
  OPS_TOKEN=… OPS_BASE=https://confenge.com.br python3 scripts/revops/lead_cli.py list --remote
  OPS_TOKEN=… python3 scripts/revops/lead_cli.py set LEAD_ID meeting --remote --actor tiago
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
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


def node_store(store_dir: Path, operation: str, lead_id: str = "", patch: dict | None = None):
    """Use the authoritative adapter; never interpret hashed envelopes in Python."""
    script = r"""
const path = require('path');
const { FileStore } = require(path.join(process.cwd(), 'netlify/functions/lib/lead-store.cjs'));
const { applyStageChange } = require(path.join(process.cwd(), 'netlify/functions/lib/lead-stages.cjs'));
(async () => {
  const [dir, operation, leadId, patchJson] = process.argv.slice(1);
  const store = new FileStore(path.resolve(dir));
  let value;
  if (operation === 'list') value = await store.list();
  else if (operation === 'get') value = await store.get(leadId);
  else if (operation === 'set') {
    const current = await store.get(leadId);
    if (!current) throw new Error('lead_not_found');
    value = await store.update(leadId, applyStageChange(current, JSON.parse(patchJson)));
  } else throw new Error('invalid_operation');
  process.stdout.write(JSON.stringify(value));
})().catch((error) => {
  process.stderr.write(String(error && (error.code || error.message) || error));
  process.exit(1);
});
"""
    proc = subprocess.run(
        ["node", "-e", script, str(store_dir.resolve()), operation, lead_id, json.dumps(patch or {})],
        cwd=str(Path(__file__).resolve().parents[2]),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit((proc.stderr or "local store operation failed")[:300])
    return json.loads(proc.stdout or "null")


def local_list(store_dir: Path) -> list[dict]:
    return node_store(store_dir, "list")


def local_get(store_dir: Path, lead_id: str) -> dict | None:
    return node_store(store_dir, "get", lead_id)


def local_set(store_dir: Path, lead_id: str, patch: dict) -> dict:
    return node_store(store_dir, "set", lead_id, patch)


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
    store_raw = os.environ.get("CONFENGE_STORAGE_DIR") or os.environ.get("LEAD_STORE_DIR")
    store_dir = Path(store_raw).resolve() if store_raw else None

    if args.cmd == "list":
        if args.remote:
            data = remote("leads", qs="&pii=0")
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            if store_dir is None:
                raise SystemExit("set CONFENGE_STORAGE_DIR to the absolute private store root")
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
            if store_dir is None:
                raise SystemExit("set CONFENGE_STORAGE_DIR to the absolute private store root")
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
            if store_dir is None:
                raise SystemExit("set CONFENGE_STORAGE_DIR to the absolute private store root")
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
