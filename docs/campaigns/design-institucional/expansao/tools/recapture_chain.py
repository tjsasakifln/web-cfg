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
import argparse, json, subprocess, sys, tarfile, tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT))


def sha(rel: str, *, root: Path = ROOT) -> str:
    from scripts.bofu_dominance.frozen_specs.hashing import sha256_bytes

    return sha256_bytes((root / rel).read_bytes())


@contextmanager
def committed_snapshot(baseline: str):
    """Materialize the reviewed Git bytes independently of checkout EOL policy.

    On Windows, Git can expose a tracked LF blob as CRLF in the working tree.
    Evidence hashes must attest the named commit, not that platform-specific
    checkout representation.  Reading from ``git archive`` also makes the
    baseline argument operational rather than merely descriptive.
    """
    try:
        resolved = subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "--verify", f"{baseline}^{{commit}}"],
            text=True,
        ).strip()
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"baseline is not a reachable commit: {baseline}") from exc
    ancestor = subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", resolved, "HEAD"],
        check=False,
    )
    if ancestor.returncode != 0:
        raise SystemExit(f"baseline is not an ancestor of HEAD: {resolved}")

    with tempfile.TemporaryDirectory(prefix="confenge-recapture-") as tmp:
        temp_root = Path(tmp)
        archive = temp_root / "baseline.tar"
        snapshot = temp_root / "tree"
        snapshot.mkdir()
        subprocess.run(
            ["git", "-C", str(ROOT), "archive", "--format=tar", f"--output={archive}", resolved],
            check=True,
        )
        with tarfile.open(archive, "r") as bundle:
            bundle.extractall(snapshot, filter="data")
        yield snapshot, resolved


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def step_approvals(reason: str, source_root: Path) -> None:
    from scripts.contract_analysis.approval import rendered_content_hash
    p = ROOT / "data/editorial/contract-analysis/approvals.json"
    source = source_root / "data/editorial/contract-analysis/approvals.json"
    doc = json.loads(source.read_text(encoding="utf-8"))
    changed = 0
    for rec in doc["approvals"]:
        if rec.get("withdrawn") or rec.get("state") != "PUBLISHABLE_INDEX":
            continue
        slug = rec["canonical_url"].strip("/").split("/")[-1]
        page = source_root / "analises-contratos-publicos" / slug / "index.html"
        new = rendered_content_hash(
            page.read_text(encoding="utf-8"),
            record={"slug": slug},
            root=source_root,
        )
        if rec.get("rendered_content_hash") == new:
            continue
        prev = rec.get("rendered_content_hash")
        rec["rendered_content_hash_previous"] = prev
        rec["rendered_content_hash"] = new
        rec["rendered_hash_recaptured_at"] = now()
        rec["rendered_hash_recapture_reason"] = reason
        doc.setdefault("audit", []).append({
            "action": "recapture_rendered_presentation", "analysis_id": rec["analysis_id"], "actor": "CODEX_AGENT_EXECUTOR",
            "authority": "Decisao da direcao para a campanha indicada em reason; recaptura apenas da apresentacao renderizada, sem nova aprovacao tecnica.",
            "at": rec["rendered_hash_recaptured_at"],
            "reviewer": "comparacao deterministica pelo proprio agente; nenhuma nova aprovacao tecnica ou revisao humana independente alegada",
            "rendered_content_hash_previous": prev, "rendered_content_hash": new, "reason": reason,
        })
        changed += 1
    if changed:
        p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"approvals: {changed} registro(s) recapturado(s)")


def frozen_recapture_provenance(previous: dict, current: dict, baseline: str, reason: str, at: str) -> dict:
    """Retain the reviewed checkpoint before replacing its hashes or provenance."""
    fields = ("baseline_commit", "previous_baseline_commit", "recaptured_at",
              "recapture_reason", "pillars", "forbidden", "html_mutation")
    checkpoint = {key: previous[key] for key in fields if key in previous}
    # JSON round-trip prevents the newly materialized dictionaries from sharing
    # mutable objects with the historical hashes retained in this record.
    history = json.loads(json.dumps(previous.get("recapture_history", [])))
    if checkpoint and checkpoint not in history:
        history.append(json.loads(json.dumps(checkpoint)))
    return {**current, "recapture_history": history,
            "previous_baseline_commit": previous.get("baseline_commit"),
            "baseline_commit": baseline, "recaptured_at": at,
            "recapture_reason": reason}


def step_frozen(baseline: str, reason: str, source_root: Path) -> None:
    from scripts.bofu_dominance.frozen_specs.materialize import materialize
    p = ROOT / "data/bofu-dominance/frozen-specs/hashes.json"
    previous = json.loads(p.read_text(encoding="utf-8"))
    materialize(root=source_root)
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc = frozen_recapture_provenance(previous, doc, baseline, reason, now())
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("frozen specs: materializados; baseline", baseline)


def recapture_binding(binding: dict, key: str, live: str, reason: str) -> bool:
    """Keep each binding's own provenance aligned with the digest it attests."""
    if binding.get(key) == live:
        return False
    fields = (key, key + "_previous", key + "_recaptured_at", key + "_recapture_reason")
    checkpoint = {field: binding[field] for field in fields if field in binding}
    history = binding.setdefault(key + "_recapture_history", [])
    if checkpoint not in history:
        history.append(json.loads(json.dumps(checkpoint)))
    binding[key + "_previous"] = binding.get(key)
    binding[key] = live
    binding[key + "_recaptured_at"] = now()
    binding[key + "_recapture_reason"] = reason
    return True


def step_single_route(reason: str, source_root: Path) -> None:
    p = ROOT / "data/organic/single-commercial-route.v1.json"
    source = source_root / "data/organic/single-commercial-route.v1.json"
    doc = json.loads(source.read_text(encoding="utf-8"))
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
        live = sha(obj["file"], root=source_root)
        if recapture_binding(obj, "expected_sha256", live, reason):
            n += 1
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"single-commercial-route: {n} hash(es) atualizado(s)")


def step_canary(reason: str, source_root: Path) -> None:
    p = ROOT / "docs/evidence/389-measurement-glosa-canary/canary-contract.json"
    source = source_root / "docs/evidence/389-measurement-glosa-canary/canary-contract.json"
    doc = json.loads(source.read_text(encoding="utf-8"))
    today = now()[:10]
    n = 0
    for sib in doc["frozen_siblings"]:
        live = sha(sib["path"], root=source_root)
        if recapture_binding(sib, "sha256", live, reason):
            n += 1
    if n:
        doc["frozen_siblings_recaptured_at"] = today
        doc["frozen_siblings_recapture_reason"] = reason + " Anterior: " + doc.get("frozen_siblings_recapture_reason", "")
    page = doc["canary"]["source"]
    live = sha(page, root=source_root)
    if recapture_binding(doc["canary"], "after_sha256", live, reason):
        n += 1
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"canary 389: {n} hash(es) atualizado(s)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--reason", required=True)
    ap.add_argument("--skip", default="")
    a = ap.parse_args()
    skip = set(a.skip.split(","))
    with committed_snapshot(a.baseline) as (source_root, resolved):
        if "approvals" not in skip: step_approvals(a.reason, source_root)
        if "frozen" not in skip: step_frozen(resolved, a.reason, source_root)
        if "single" not in skip: step_single_route(a.reason, source_root)
        if "canary" not in skip: step_canary(a.reason, source_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
