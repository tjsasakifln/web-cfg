"""Matriz de cobertura de rotas da campanha SALTO-INSTITUCIONAL-02.

Universo = rotas HTML do manifesto público do artefato construído
(seo/PUBLIC-ARTIFACT-MANIFEST.json, gerado por build:site) — não uma lista
histórica. Família = data/organic/public-family-registry.json (match por rota,
prefixo ou fonte). Tratamento/estado/evidência = matriz-lote-*.json escritas
pelas frentes + matriz-integrador.json. Rotas sem entrada ficam SEM_TRATAMENTO
(fail-closed: o relatório as lista como impedimento).

    python3 docs/campaigns/design-institucional/expansao/build_matriz.py [--check]
"""
from __future__ import annotations
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TREATMENTS = {"COMPOSICAO_REDESENHADA", "COMPONENTES_ADEQUADOS", "HERANCA_VISUAL_VALIDADA", "PRESERVADA_COM_JUSTIFICATIVA"}


def families():
    reg = json.loads((ROOT / "data/organic/public-family-registry.json").read_text(encoding="utf-8"))
    pillar_routes = set()
    bofu = ROOT / "data/organic/bofu-intent-matrix.json"
    if bofu.exists():
        for row in json.loads(bofu.read_text(encoding="utf-8")).get("rows", []):
            r = row.get("canonical_service_route")
            if r:
                pillar_routes.add(r)
    out = []
    for f in reg["families"]:
        m = f.get("match", {})
        out.append((f["id"], f.get("profile"), f.get("visitor_job", ""), m.get("routes", []), m.get("prefix"), pillar_routes if m.get("source") else set()))
    return out


def family_of(route: str, fams) -> tuple[str, str, str]:
    best = None
    for fid, profile, job, routes, prefix, srcset in fams:
        if route in routes or route in srcset:
            return fid, profile or "", job
        if prefix and route.startswith(prefix):
            if best is None or len(prefix) > len(best[3]):
                best = (fid, profile or "", job, prefix)
    return (best[0], best[1], best[2]) if best else ("(sem familia)", "", "")


def main(check: bool) -> int:
    manifest = json.loads((ROOT / "seo/PUBLIC-ARTIFACT-MANIFEST.json").read_text(encoding="utf-8"))
    routes = manifest["html_routes"]
    routes = [r if isinstance(r, str) else (r.get("route") or r.get("path")) for r in routes]
    fams = families()
    entries: dict[str, dict] = {}
    for p in sorted(HERE.glob("matriz-*.json")):
        if p.name == "matriz-rotas.json":
            continue
        for e in json.loads(p.read_text(encoding="utf-8")):
            e.setdefault("owner", p.stem.replace("matriz-", ""))
            entries[e["route"]] = e
    rows, missing, bad = [], [], []
    for r in sorted(routes):
        fid, profile, job = family_of(r, fams)
        e = entries.get(r, {})
        t = e.get("treatment", "SEM_TRATAMENTO")
        if t not in TREATMENTS:
            (missing if t == "SEM_TRATAMENTO" else bad).append(r)
        rows.append({
            "route": r, "family": fid, "profile": profile, "function": e.get("function") or job,
            "source": e.get("source"), "generator": e.get("generator"), "priority": e.get("priority"),
            "treatment": t, "owner": e.get("owner"), "state": e.get("state"), "evidence": e.get("evidence", []),
            "impediment": e.get("impediment"),
        })
    extra = sorted(set(entries) - set(routes))
    summary = {"routes": len(rows), "by_treatment": {}, "by_family": {}, "missing": missing, "invalid_treatment": bad, "entries_not_in_artifact": extra}
    for row in rows:
        summary["by_treatment"][row["treatment"]] = summary["by_treatment"].get(row["treatment"], 0) + 1
        summary["by_family"][row["family"]] = summary["by_family"].get(row["family"], 0) + 1
    out = {"schema": "confenge.design-institucional.matriz-rotas/1.0", "artifact_hash": manifest.get("public_artifact_hash"), "summary": summary, "rows": rows}
    target = HERE / "matriz-rotas.json"
    text = json.dumps(out, ensure_ascii=False, indent=1) + "\n"
    if check:
        ok = target.exists() and target.read_text(encoding="utf-8") == text and not missing and not bad
        print("OK matriz" if ok else f"FAIL matriz: missing={len(missing)} invalid={len(bad)} stale={not target.exists() or target.read_text(encoding='utf-8') != text}")
        return 0 if ok else 1
    target.write_text(text, encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT)}: {summary['routes']} rotas, {json.dumps(summary['by_treatment'], ensure_ascii=False)}, sem tratamento={len(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
