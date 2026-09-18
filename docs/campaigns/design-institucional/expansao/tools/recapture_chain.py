"""Cadeia de recaptura de hashes protegidos (SALTO-INSTITUCIONAL-02).

Ordem obrigatória, com o CSS já congelado e os bytes finais das páginas
COMMITADOS (o baseline precisa de um commit alcançável):
  1. approvals.json da análise aprovada (rendered_content_hash com o CSS final)
  2. frozen specs dos seis pilares (materialize) + baseline_commit + motivo
  3. single-commercial-route.v1.json (expected_sha256 de medicoes)
  4. canary-contract.json (#389): after_sha256 da página canário e frozen_siblings
  5. cta-form-next-state (render --write), se o censo mudou
Depois: measure_first_fold.mjs --write (árvore limpa), audit_css_usage.py --write,
build:site, commit das saídas rastreadas.

    python3 docs/campaigns/design-institucional/expansao/tools/recapture_chain.py --baseline <sha> --reason "<motivo>"
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT))


def sha(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def step_approvals(reason: str) -> None:
    from scripts.contract_analysis.approval import rendered_content_hash
    p = ROOT / "data/editorial/contract-analysis/approvals.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    changed = 0
    for rec in doc["approvals"]:
        if rec.get("withdrawn") or rec.get("state") != "PUBLISHABLE_INDEX":
            continue
        slug = rec["canonical_url"].strip("/").split("/")[-1]
        page = ROOT / "analises-contratos-publicos" / slug / "index.html"
        new = rendered_content_hash(page.read_text(encoding="utf-8"), record={"slug": slug}, root=ROOT)
        if rec.get("rendered_content_hash") == new:
            continue
        prev = rec.get("rendered_content_hash")
        rec["rendered_content_hash_previous"] = prev
        rec["rendered_content_hash"] = new
        rec["rendered_hash_recaptured_at"] = now()
        rec["rendered_hash_recapture_reason"] = reason
        doc.setdefault("audit", []).append({
            "action": "recapture_rendered_presentation", "analysis_id": rec["analysis_id"], "actor": "CLAUDE_CODE_AGENT_EXECUTOR",
            "authority": "Decisao EXECUTE_NOW do proprietario para a campanha CONFENGE-SALTO-INSTITUCIONAL-02 (encaminhamento de 2026-09-17)",
            "at": rec["rendered_hash_recaptured_at"],
            "reviewer": "comparacao deterministica pelo proprio agente; nenhuma nova aprovacao tecnica ou revisao humana independente alegada",
            "rendered_content_hash_previous": prev, "rendered_content_hash": new, "reason": reason,
        })
        changed += 1
    if changed:
        p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"approvals: {changed} registro(s) recapturado(s)")


def step_frozen(baseline: str, reason: str) -> None:
    from scripts.bofu_dominance.frozen_specs.materialize import materialize
    materialize()
    p = ROOT / "data/bofu-dominance/frozen-specs/hashes.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["baseline_commit"] = baseline
    doc["recaptured_at"] = now()
    doc["recapture_reason"] = reason
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("frozen specs: materializados; baseline", baseline)


def step_single_route() -> None:
    p = ROOT / "data/organic/single-commercial-route.v1.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    text = p.read_text(encoding="utf-8")
    pillar = doc["route"] if isinstance(doc.get("route"), dict) else None
    # localizar o objeto com file/expected_sha256
    def walk(o):
        if isinstance(o, dict):
            if "expected_sha256" in o and "file" in o:
                yield o
            for v in o.values():
                yield from walk(v)
        elif isinstance(o, list):
            for v in o:
                yield from walk(v)
    n = 0
    for obj in walk(doc):
        live = sha(obj["file"])
        if obj["expected_sha256"] != live:
            obj["expected_sha256"] = live
            n += 1
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"single-commercial-route: {n} hash(es) atualizado(s)")


def step_canary(reason: str) -> None:
    p = ROOT / "docs/evidence/389-measurement-glosa-canary/canary-contract.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    today = now()[:10]
    n = 0
    for sib in doc["frozen_siblings"]:
        live = sha(sib["path"])
        if sib["sha256"] != live:
            sib["sha256"] = live
            n += 1
    if n:
        doc["frozen_siblings_recaptured_at"] = today
        doc["frozen_siblings_recapture_reason"] = reason + " Anterior: " + doc.get("frozen_siblings_recapture_reason", "")
    page = doc["canary"]["source"]
    live = sha(page)
    if doc["canary"].get("after_sha256") != live:
        doc["canary"]["after_sha256_previous"] = doc["canary"].get("after_sha256")
        doc["canary"]["after_sha256"] = live
        doc["canary"]["after_sha256_recaptured_at"] = today
        doc["canary"]["after_sha256_recapture_reason"] = reason + " Anterior: " + doc["canary"].get("after_sha256_recapture_reason", "")
        n += 1
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"canary 389: {n} hash(es) atualizado(s)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--reason", required=True)
    ap.add_argument("--skip", default="")
    a = ap.parse_args()
    skip = set(a.skip.split(","))
    if "approvals" not in skip: step_approvals(a.reason)
    if "frozen" not in skip: step_frozen(a.baseline, a.reason)
    if "single" not in skip: step_single_route()
    if "canary" not in skip: step_canary(a.reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
