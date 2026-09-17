"""Build docs/campaigns/design-institucional/comparativo.html.

A navigable, phone-friendly comparison of the captures in ./evidence: the
production baseline (47da03b64), study B (overlay prototype) and the pilot
(= study A, real sources), per route and viewport, fold and full page. Labels
are neutral by default (Versão 1/2/3) and can be revealed with one control,
so a reviewer sees the screens before the author's justification. Captures
are pictures: they do not show interaction (menu, focus, form states); those
live in the pilot itself and in docs/uiux-evidence.

Run from the repo root after the captures exist:
    python3 docs/campaigns/design-institucional/build_comparativo.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVID = HERE / "evidence"
OUT = HERE / "comparativo.html"

ROUTES = [
    ("home", "/", "Home"),
    ("servicos", "/servicos/", "Índice de serviços (inclui avaliação de imóvel)"),
    ("quantitativos-orcamento-obras", "/quantitativos-orcamento-obras/", "Serviço privado: quantitativos e orçamento"),
    ("medicoes-glosas-obras-publicas", "/medicoes-glosas-obras-publicas/", "Obras públicas: medições, glosas e pagamentos"),
    ("casos-demonstrativo-projeto-privado", "/casos/demonstrativo-projeto-privado/", "Exemplo técnico: recorte de banheiro"),
    ("triagem-tecnica", "/triagem-tecnica/", "Contato e triagem"),
]
VERSIONS = [
    ("v1", "producao-47da03b64", "prod", "Produção (47da03b64)"),
    ("v2", "estudo-b", "estB", "Estudo B: coluna e margem (protótipo sobreposto)"),
    ("v3", "piloto", "pilot", "Piloto = estudo A: prancha e percurso"),
]
VIEWPORTS = [("390x844", "Celular 390×844"), ("1440x1000", "Desktop 1440×1000")]
STUDY_B_ROUTES = {"home": "docs-design-audit-prototypes-salto-institucional-2026-09-17-b-coluna-e-margem-index.html",
                  "quantitativos-orcamento-obras": "docs-design-audit-prototypes-salto-institucional-2026-09-17-b-coluna-e-margem-servico.html"}


def img(rel: str) -> str:
    return f'<img alt="" loading="lazy" decoding="async" src="{rel}"/>' if (HERE / rel).exists() else '<p class="missing">sem captura para esta combinação</p>'


def main() -> None:
    meta = {}
    for _, folder, label, _ in VERSIONS:
        p = EVID / folder / f"manifest-{label}.json"
        if p.exists():
            meta[folder] = json.loads(p.read_text(encoding="utf-8"))
    parts = []
    for slug, path, title in ROUTES:
        parts.append(f'<section class="route" id="{slug}"><h2>{title} <code>{path}</code></h2>')
        for vp, vplabel in VIEWPORTS:
            parts.append(f'<h3>{vplabel}</h3><div class="grid">')
            for vid, folder, label, vname in VERSIONS:
                if folder == "estudo-b":
                    base = STUDY_B_ROUTES.get(slug)
                    if not base:
                        parts.append(f'<figure class="cell" data-version="{vid}"><figcaption><b class="neutral">Versão 2</b><b class="named">{vname}</b></figcaption><p class="missing">o estudo B cobre home e serviço privado</p></figure>')
                        continue
                    fold = f"evidence/{folder}/{base}-{vp}-fold-{label}.jpg"
                    full = f"evidence/{folder}/{base}-{vp}-full-{label}.jpg"
                else:
                    fold = f"evidence/{folder}/{slug}-{vp}-fold-{label}.jpg"
                    full = f"evidence/{folder}/{slug}-{vp}-full-{label}.jpg"
                parts.append(
                    f'<figure class="cell" data-version="{vid}"><figcaption><b class="neutral">Versão {vid[1]}</b><b class="named">{vname}</b> · {vplabel}</figcaption>'
                    f'<details open><summary>Abertura</summary>{img(fold)}</details>'
                    f'<details><summary>Página inteira</summary>{img(full)}</details></figure>'
                )
            parts.append("</div>")
        parts.append("</section>")
    html = f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>
<title>Comparativo visual · CONFENGE salto institucional 01</title>
<style>
body{{margin:0;font:16px/1.5 system-ui,sans-serif;color:#071a31;background:#f3f4f5;padding:16px}}
h1{{font-size:1.5rem;margin:0 0 .5rem}}h2{{font-size:1.2rem;margin:2rem 0 .5rem}}h3{{font-size:1rem;margin:1rem 0 .5rem;color:#5d6a7a}}
code{{font-size:.85em;color:#2d6f2d}}
.note{{max-width:70ch;color:#26374a;font-size:.95rem}}
.grid{{display:grid;grid-template-columns:1fr;gap:12px}}@media(min-width:900px){{.grid{{grid-template-columns:repeat(3,minmax(0,1fr))}}}}
.cell{{margin:0;background:#fff;border:1px solid #dfe4e6;border-radius:4px;padding:8px;min-width:0}}
.cell img{{display:block;width:100%;height:auto;border:1px solid #dfe4e6}}
figcaption{{font-size:.85rem;margin-bottom:.5rem}}figcaption b{{display:block}}
.named{{display:none}} body.reveal .named{{display:block}} body.reveal .neutral{{display:none}}
details{{margin:.35rem 0}}summary{{cursor:pointer;font-weight:600;font-size:.9rem}}
.missing{{font-size:.85rem;color:#5d6a7a;padding:1rem;border:1px dashed #dfe4e6}}
button{{font:inherit;padding:.5rem .9rem;border:1px solid #071a31;background:#fff;border-radius:6px;cursor:pointer}}
nav a{{margin-right:.75rem;font-size:.9rem}}
</style></head><body>
<h1>Comparativo visual · três versões, seis rotas, dois viewports</h1>
<p class="note">Superfícies: Versão 1 = HTML servido em <code>https://confenge.com.br</code> (commit <code>47da03b64</code>, capturado em 2026-09-16/17); Versões 2 e 3 = worktree do ramo <code>campaign/salto-institucional-01-piloto</code> servida localmente (SHA registrado em <code>estado.json#pilot_source_sha</code>). Chromium 1234 via puppeteer-core, cache desativado, fontes carregadas, <code>content-visibility</code> forçado visível nas páginas inteiras. As capturas não mostram interação: menu, foco, teclado e estados do formulário estão no piloto navegável e em <code>docs/uiux-evidence/issue-532-cta-form-next-state</code>. O estudo B é um protótipo sobreposto ao piloto (mesmo conteúdo, outra composição via uma folha adicional), não uma implementação igualmente acabada.</p>
<p><button type="button" onclick="document.body.classList.toggle('reveal')">Mostrar / ocultar os nomes das versões</button></p>
<nav>{' '.join(f'<a href="#{s}">{t.split(":")[0]}</a>' for s,_,t in ROUTES)}</nav>
{''.join(parts)}
</body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
