"""Relatório HTML interno da campanha SALTO-INSTITUCIONAL-02 (não é página do site: docs/ fica fora do artefato).

Fontes: estado.json (campaign_02), matriz-rotas.json, relatorio-lote-*.md, assets-manifest.json,
evidence/** (capturas), relatorio-input.json (testes, medições, release, sonda, limitações — preenchido
pelo integrador com referência às evidências, sem PII).

    python3 docs/campaigns/design-institucional/expansao/build_relatorio.py
"""
from __future__ import annotations
import html, json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / "relatorio.html"


def esc(x) -> str:
    return html.escape(str(x), quote=True)


def md_to_html(text: str) -> str:
    """Conversão mínima e previsível (títulos, listas, tabelas, código inline, parágrafos)."""
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:-|]+\|$", lines[i + 1]):
            head = [c.strip() for c in ln.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")]); i += 1
            out.append('<div class="tw"><table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows) + "</tbody></table></div>")
            continue
        m = re.match(r"^(#{1,4})\s+(.*)", ln)
        if m:
            lvl = min(len(m.group(1)) + 1, 5); out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>"); i += 1; continue
        if re.match(r"^\s*[-*]\s+", ln):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append(re.sub(r"^\s*[-*]\s+", "", lines[i])); i += 1
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ul>"); continue
        if re.match(r"^\s*\d+\.\s+", ln):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(re.sub(r"^\s*\d+\.\s+", "", lines[i])); i += 1
            out.append("<ol>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ol>"); continue
        if ln.startswith("```"):
            i += 1; buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1; out.append("<pre>" + esc("\n".join(buf)) + "</pre>"); continue
        if not ln.strip():
            i += 1; continue
        buf = [ln]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||\s*[-*]\s|\s*\d+\.\s|```)", lines[i]):
            buf.append(lines[i]); i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")
    return "\n".join(out)


def inline(s: str) -> str:
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def img(rel: str, alt: str) -> str:
    p = HERE / rel
    if not p.exists():
        return f'<p class="missing">captura ausente: <code>{esc(rel)}</code></p>'
    return f'<figure><a href="{esc(rel)}"><img loading="lazy" src="{esc(rel)}" alt="{esc(alt)}"></a><figcaption>{esc(alt)}</figcaption></figure>'


def main() -> int:
    estado = json.loads((HERE.parent / "estado.json").read_text(encoding="utf-8"))
    c02 = estado.get("campaign_02", {})
    inp = json.loads((HERE / "relatorio-input.json").read_text(encoding="utf-8"))
    matriz = json.loads((HERE / "matriz-rotas.json").read_text(encoding="utf-8")) if (HERE / "matriz-rotas.json").exists() else {"summary": {}, "rows": []}
    manifest = json.loads((HERE.parent / "assets-manifest.json").read_text(encoding="utf-8"))
    parts = []
    parts.append(f"<h1>{esc(inp['title'])}</h1><p class='lead'>{esc(inp['summary'])}</p>")
    parts.append("<h2 id='estado'>Estado</h2><dl class='kv'>" + "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v)}</dd></div>" for k, v in inp["state"].items()) + "</dl>")
    # dimensões do estado.json
    dims = ["authorized_direction", "implementation", "visual_review", "technical_review", "integration", "publication", "public_verification", "capture_proof", "human_research", "commercial_result"]
    parts.append("<h2 id='dimensoes'>Dimensões (estado.json#campaign_02)</h2><div class='tw'><table><thead><tr><th>Dimensão</th><th>Estado</th><th>Nota</th></tr></thead><tbody>" + "".join(f"<tr><td>{esc(d)}</td><td><b>{esc(c02.get(d, {}).get('state', '—'))}</b></td><td>{esc(c02.get(d, {}).get('note') or c02.get(d, {}).get('basis') or '')}</td></tr>" for d in dims) + "</tbody></table></div>")
    parts.append("<h2 id='ganho'>Ganho observado para o visitante</h2>" + md_to_html(inp["visitor_gain_md"]))
    parts.append("<h2 id='antes-depois'>Antes / depois (produção anterior × candidato publicado)</h2>")
    for row in inp.get("before_after", []):
        parts.append(f"<h3>{esc(row['route'])}</h3><div class='pair'>" + img(row["before"], f"Antes · {row['route']} · {row.get('before_label','produção 47da03b64')}") + img(row["after"], f"Depois · {row['route']} · {row.get('after_label','candidato')}") + "</div>")
    parts.append("<h2 id='piloto'>Comparação com o piloto escolhido</h2>" + md_to_html(inp["pilot_comparison_md"]))
    s = matriz["summary"]
    parts.append(f"<h2 id='matriz'>Matriz de cobertura de rotas ({s.get('routes', 0)} rotas do artefato)</h2><p>{esc(json.dumps(s.get('by_treatment', {}), ensure_ascii=False))}; sem tratamento: {len(s.get('missing', []))}.</p>")
    parts.append("<div class='tw'><table><thead><tr><th>Rota</th><th>Família</th><th>Tratamento</th><th>Dono</th><th>Estado</th><th>Impedimento</th></tr></thead><tbody>" + "".join(f"<tr><td><code>{esc(r['route'])}</code></td><td>{esc(r['family'])}</td><td>{esc(r['treatment'])}</td><td>{esc(r.get('owner') or '')}</td><td>{esc(r.get('state') or '')}</td><td>{esc(r.get('impediment') or '')}</td></tr>" for r in matriz["rows"]) + "</tbody></table></div>")
    plates = [e for e in manifest.get("entries", manifest.get("assets", [])) if e.get("kind") == "prancha"]
    parts.append(f"<h2 id='materiais'>Biblioteca de materiais ({len(plates)} arquivos de prancha + ativos reutilizados)</h2><div class='tw'><table><thead><tr><th>Código</th><th>Arquivo</th><th>Origem</th><th>Licença</th><th>Veracidade</th><th>Páginas</th><th>sha256</th></tr></thead><tbody>" + "".join(f"<tr><td>{esc(e.get('code',''))}</td><td><code>{esc(e['path'])}</code></td><td>{esc(e.get('origin',''))[:160]}</td><td>{esc(e.get('license',''))[:80]}</td><td>{esc(e.get('veracity',''))}</td><td>{esc(', '.join(e.get('pages', [])))}</td><td><code>{esc(e.get('sha256','')[:16])}…</code></td></tr>" for e in manifest.get("entries", manifest.get("assets", []))) + "</tbody></table></div>")
    parts.append("<h2 id='testes'>Testes, comandos, ambientes e resultados</h2>" + md_to_html(inp["tests_md"]))
    parts.append("<h2 id='desempenho'>Orçamento e medições de desempenho por rota</h2>" + md_to_html(inp["performance_md"]))
    parts.append("<h2 id='a11y'>Responsividade e acessibilidade</h2>" + md_to_html(inp["a11y_md"]))
    parts.append("<h2 id='jornadas'>Jornadas de aceite comercial</h2>" + md_to_html(inp["journeys_md"]))
    parts.append("<h2 id='captura'>Prova de captura e persistência (dados sensíveis suprimidos)</h2>" + md_to_html(inp["capture_md"]))
    parts.append("<h2 id='release'>PRs, commits, release, identidades e rollback</h2>" + md_to_html(inp["release_md"]))
    parts.append("<h2 id='publico'>Verificação no domínio público</h2>" + md_to_html(inp["public_md"]))
    parts.append("<h2 id='limitacoes'>Limitações, evidências ausentes e melhorias opcionais</h2>" + md_to_html(inp["limitations_md"]))
    parts.append("<h2 id='lotes'>Relatórios das frentes</h2>")
    for x in "abc":
        p = HERE / f"relatorio-lote-{x}.md"
        if p.exists():
            parts.append(f"<details><summary>Lote {x.upper()} — relatorio-lote-{x}.md</summary>" + md_to_html(p.read_text(encoding="utf-8")) + "</details>")
    toc = ["estado", "dimensoes", "ganho", "antes-depois", "piloto", "matriz", "materiais", "testes", "desempenho", "a11y", "jornadas", "captura", "release", "publico", "limitacoes", "lotes"]
    doc = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{esc(inp['title'])}</title>
<style>:root{{color-scheme:light}}body{{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#122033;background:#fff}}main{{max-width:72rem;margin:0 auto;padding:1.25rem 16px 4rem}}h1{{font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.1;margin:.5rem 0 1rem}}h2{{margin:2.5rem 0 .75rem;padding-top:.75rem;border-top:2px solid #122033;font-size:1.4rem}}h3{{margin:1.5rem 0 .5rem;font-size:1.1rem}}.lead{{font-size:1.1rem;max-width:60ch}}nav.toc{{display:flex;flex-wrap:wrap;gap:.25rem 1rem;font-size:.9rem;margin:0 0 1rem}}nav.toc a{{color:#245b1f;font-weight:700;text-decoration:none;min-height:32px;display:inline-flex;align-items:center}}.kv{{display:grid;gap:.25rem;margin:0}}.kv div{{display:grid;grid-template-columns:minmax(9rem,14rem) minmax(0,1fr);gap:.5rem;padding:.35rem 0;border-bottom:1px solid #dde3ea}}.kv dt{{font-weight:700}}.kv dd{{margin:0;overflow-wrap:anywhere}}.tw{{overflow-x:auto;border:1px solid #dde3ea;margin:1rem 0}}table{{border-collapse:collapse;width:100%;font-size:.85rem}}th,td{{text-align:left;vertical-align:top;padding:.4rem .5rem;border-bottom:1px solid #eef1f4}}th{{background:#f4f7f5;position:sticky;top:0}}code{{font-family:ui-monospace,Menlo,monospace;font-size:.85em;background:#f4f7f5;padding:0 .25em}}pre{{overflow-x:auto;background:#f4f7f5;padding:.75rem;font-size:.8rem}}figure{{margin:0;min-width:0}}figure img{{width:100%;height:auto;border:1px solid #dde3ea;display:block}}figcaption{{font-size:.8rem;color:#4a5b6e;margin-top:.25rem}}.pair{{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;margin:0 0 1.5rem}}@media (min-width:800px){{.pair{{grid-template-columns:1fr 1fr}}}}.missing{{color:#8a1c1c}}details{{border-top:1px solid #dde3ea;padding:.5rem 0}}summary{{font-weight:700;cursor:pointer;min-height:44px;display:flex;align-items:center}}p,li{{max-width:75ch}}</style></head><body><main>
<p><small>Relatório interno da campanha · não publicado no site · gerado por build_relatorio.py</small></p>
<nav class="toc">{''.join(f'<a href="#{t}">{t.replace("-", " ")}</a>' for t in toc)}</nav>
{''.join(parts)}
</main></body></html>"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(doc)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
