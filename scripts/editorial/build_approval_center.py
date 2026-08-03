"""Build TIAGO-SEO-APPROVAL-CENTER.html — human batch review without raw JSON.

Does NOT execute approval. Prepares review packets and optional CLI command
templates for the named human.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_editorial_packet() -> list[dict]:
    pages = []
    reg_path = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"
    if reg_path.exists():
        reg = json.loads(reg_path.read_text(encoding="utf-8"))
        for p in reg.get("pages") or []:
            pages.append(
                {
                    "kind": "editorial",
                    "page_id": p.get("page_id"),
                    "url": p.get("url"),
                    "title": p.get("title"),
                    "status": p.get("status"),
                    "material_hash": p.get("material_hash")
                    or (p.get("current_material_signature") or {}).get("hash"),
                    "sources": p.get("sources") or [],
                    "cta": p.get("cta_offer") or p.get("cta"),
                    "archetype": p.get("archetype"),
                    "primary_keyword": p.get("primary_keyword"),
                }
            )
    return pages


def load_pseo_packet() -> list[dict]:
    """Prefer WAVE1-PACKAGE (registry-bound HTML) over raw universe proposal."""
    pages: list[dict] = []
    pkg_path = ROOT / "data" / "pseo" / "WAVE1-PACKAGE.json"
    if pkg_path.exists():
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        for w in pkg.get("pages") or []:
            pages.append(
                {
                    "kind": "pseo",
                    "page_id": w.get("page_id") or w.get("candidate_id"),
                    "url": w.get("url"),
                    "title": w.get("title") or w.get("h1") or w.get("url"),
                    "status": w.get("registry_status")
                    or w.get("status")
                    or "READY_AFTER_HUMAN_REVIEW",
                    "score": w.get("indexability_score")
                    or w.get("seo_opportunity_score"),
                    "observation_count": w.get("observation_count"),
                    "page_type": w.get("page_type"),
                    "family": w.get("family"),
                    "cta": w.get("related_service"),
                    "cannibalization": w.get("cannibalization_candidates") or [],
                    "html_exists": w.get("html_exists", True),
                    "quality_eligible": w.get("quality_eligible"),
                }
            )
        if pages:
            return pages

    univ_path = ROOT / "data" / "pseo" / "CANDIDATE-UNIVERSE.json"
    if not univ_path.exists():
        return pages
    univ = json.loads(univ_path.read_text(encoding="utf-8"))
    wave = (univ.get("wave1_proposal") or {}).get("pages") or []
    by_id = {c["candidate_id"]: c for c in univ.get("candidates") or []}
    for w in wave:
        c = by_id.get(w.get("candidate_id")) or w
        pages.append(
            {
                "kind": "pseo",
                "page_id": c.get("candidate_id") or w.get("candidate_id"),
                "url": c.get("proposed_url") or c.get("url") or w.get("url"),
                "title": c.get("main_question") or w.get("url"),
                "status": c.get("status") or w.get("status"),
                "score": c.get("seo_opportunity_score") or w.get("seo_opportunity_score"),
                "observation_count": c.get("observation_count")
                or w.get("observation_count"),
                "page_type": c.get("page_type") or w.get("page_type"),
                "family": c.get("family"),
                "cta": c.get("related_service"),
                "cannibalization": c.get("cannibalization_candidates") or [],
            }
        )
    return pages


def render_html(editorial: list[dict], pseo: list[dict]) -> str:
    def row(p: dict, i: int) -> str:
        return f"""
        <tr data-id="{p.get('page_id')}">
          <td>{i}</td>
          <td>{p.get('kind')}</td>
          <td><code>{p.get('url')}</code></td>
          <td>{(p.get('title') or '')[:80]}</td>
          <td><code>{p.get('status')}</code></td>
          <td>{p.get('score', '—')}</td>
          <td>{p.get('observation_count', '—')}</td>
          <td class="actions">
            <button type="button" class="a" data-a="APROVAR">APROVAR</button>
            <button type="button" class="w" data-a="APROVAR COM RESSALVAS">RESSALVAS</button>
            <button type="button" class="r" data-a="REJEITAR">REJEITAR</button>
            <button type="button" class="d" data-a="DEVOLVER PARA CORREÇÃO">DEVOLVER</button>
          </td>
        </tr>"""

    rows_e = "".join(row(p, i) for i, p in enumerate(editorial, 1))
    rows_p = "".join(row(p, i) for i, p in enumerate(pseo, 1))
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="robots" content="noindex,nofollow"/>
<title>TIAGO — SEO Approval Center | CONFENGE</title>
<style>
:root {{ --bg:#0b1220; --card:#121a2b; --line:#243049; --txt:#e8eef7; --mut:#9fb0c7;
  --ok:#1f9d55; --warn:#c9a227; --bad:#c0392b; --info:#3b82f6; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--txt); }}
header {{ padding:1.25rem 1.5rem; border-bottom:1px solid var(--line); background:#0e1628; }}
h1 {{ margin:0 0 .35rem; font-size:1.35rem; }}
.meta {{ color:var(--mut); font-size:.9rem; }}
main {{ padding:1.25rem 1.5rem 4rem; }}
.banner {{ background:#1a1030; border:1px solid #5b3d8a; padding:1rem; border-radius:8px; margin-bottom:1.25rem; }}
.banner strong {{ color:#d8b4fe; }}
section {{ margin-bottom:2rem; }}
h2 {{ font-size:1.1rem; margin:0 0 .75rem; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; background:var(--card); }}
th, td {{ border:1px solid var(--line); padding:.4rem .5rem; text-align:left; vertical-align:top; }}
th {{ background:#152038; position:sticky; top:0; }}
code {{ color:#9ecbff; font-size:12px; }}
.actions button {{ margin:0 .15rem .15rem 0; border:0; border-radius:4px; padding:.3rem .45rem;
  font-size:11px; cursor:pointer; color:#fff; }}
.actions .a {{ background:var(--ok); }}
.actions .w {{ background:var(--warn); color:#111; }}
.actions .r {{ background:var(--bad); }}
.actions .d {{ background:var(--info); }}
#ledger {{ background:#0a0f1a; border:1px solid var(--line); padding:1rem; border-radius:8px;
  white-space:pre-wrap; font-family:ui-monospace,monospace; font-size:12px; min-height:120px; }}
.cmd {{ background:#0a0f1a; border:1px dashed var(--line); padding:.75rem; border-radius:8px;
  font-family:ui-monospace,monospace; font-size:12px; color:#a7f3d0; }}
footer {{ color:var(--mut); font-size:.85rem; padding:1rem 1.5rem 2rem; }}
</style>
</head>
<body>
<header>
  <h1>TIAGO — SEO Approval Center</h1>
  <div class="meta">Gerado: {_now()} · Revisão humana real · Automação <strong>não</strong> grava HUMAN_APPROVED</div>
</header>
<main>
  <div class="banner">
    <strong>Princípio:</strong> não procure justificativas para aprovar — procure razões para reprovar.
    Ações abaixo apenas <em>registram a intenção localmente no navegador</em> e montam o comando CLI.
    Só a execução explícita por Tiago Sasaki do script de aprovação altera o registry.
  </div>

  <section>
    <h2>Lote editorial ({len(editorial)} páginas)</h2>
    <table>
      <thead><tr><th>#</th><th>Tipo</th><th>URL</th><th>Título</th><th>Status</th><th>Score</th><th>N</th><th>Ação</th></tr></thead>
      <tbody>{rows_e or '<tr><td colspan="8">Nenhuma página editorial no registry</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Lote pSEO Wave 1 proposal ({len(pseo)} páginas)</h2>
    <p class="meta">Proposta diversificada — publish ainda exige aprovação nominal + gates fail-closed.</p>
    <table>
      <thead><tr><th>#</th><th>Tipo</th><th>URL</th><th>Pergunta / título</th><th>Status</th><th>Score</th><th>N</th><th>Ação</th></tr></thead>
      <tbody>{rows_p or '<tr><td colspan="8">Sem wave1_proposal no CANDIDATE-UNIVERSE</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Ledger local de decisões (não persistido no repo)</h2>
    <div id="ledger">Nenhuma decisão ainda. Clique nas ações da tabela.</div>
  </section>

  <section>
    <h2>Comando preparado (não executado)</h2>
    <div class="cmd" id="cmd"># Após revisar o pacote:
# bash scripts/editorial/approve_wave1_tiago.sh
# # ou, página a página:
# python3 scripts/editorial/approve_cli.py --page-id &lt;ID&gt; --decision APPROVED
# npm run editorial:build && npm run editorial:test && npm run pseo:build && npm run build:site</div>
  </section>

  <section>
    <h2>Checklist por página</h2>
    <ul>
      <li>Fontes oficiais verificáveis e links vivos</li>
      <li>Afirmações jurídicas com dispositivo correto</li>
      <li>Dados com N, período, metodologia e limitações (se houver números)</li>
      <li>Sem thin content / doorway / canibalização material</li>
      <li>CTA contextual (não genérico em todas as páginas)</li>
      <li>Hash material estável após última edição</li>
      <li>Title / H1 / description únicos</li>
    </ul>
  </section>
</main>
<footer>
  CONFENGE · Approval Center · robots: noindex · Este HTML não altera registries.
</footer>
<script>
const ledger = [];
const el = document.getElementById('ledger');
document.querySelectorAll('.actions button').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const tr = btn.closest('tr');
    const id = tr.getAttribute('data-id');
    const action = btn.getAttribute('data-a');
    const url = tr.querySelector('code')?.textContent || '';
    ledger.push({{ ts: new Date().toISOString(), page_id: id, url, action }});
    el.textContent = JSON.stringify(ledger, null, 2);
    const cmd = document.getElementById('cmd');
    cmd.textContent = ledger.map(d =>
      `# ${{d.action}} ${{d.page_id}}\\n# python3 scripts/editorial/approve_cli.py --page-id ${{d.page_id}} --decision ${{d.action.replace(/ /g,'_')}}`
    ).join('\\n') + '\\n\\n# Lembrete: automação NÃO executa estes comandos.';
  }});
}});
</script>
</body>
</html>
"""


def main() -> int:
    editorial = load_editorial_packet()
    pseo = load_pseo_packet()
    out = ROOT / "docs" / "review"
    out.mkdir(parents=True, exist_ok=True)
    html = render_html(editorial, pseo)
    path = out / "TIAGO-SEO-APPROVAL-CENTER.html"
    path.write_text(html, encoding="utf-8")
    meta = {
        "generated_at": _now(),
        "editorial_n": len(editorial),
        "pseo_wave1_n": len(pseo),
        "path": str(path.relative_to(ROOT)),
        "auto_approves": False,
        "note": "UI only — human must run approve CLI/script explicitly",
    }
    (out / "TIAGO-SEO-APPROVAL-CENTER.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {path} editorial={len(editorial)} pseo={len(pseo)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
