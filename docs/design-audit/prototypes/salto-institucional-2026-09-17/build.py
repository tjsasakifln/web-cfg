"""Build study B from the pilot pages: same HTML, plus mechanism-b.css.

Study A is the pilot itself (real sources). Study B loads the same pages and
appends one stylesheet that changes only the composition. Run from the repo
root after editing the pilot pages:

    python3 docs/design-audit/prototypes/salto-institucional-2026-09-17/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
PAGES = {"index.html": "b-coluna-e-margem/index.html",
         "quantitativos-orcamento-obras/index.html": "b-coluna-e-margem/servico.html"}
LINK = '<link href="/docs/design-audit/prototypes/salto-institucional-2026-09-17/mechanism-b.css" rel="stylesheet"/>'

for src, dst in PAGES.items():
    html = (ROOT / src).read_text(encoding="utf-8")
    html = html.replace("</head>", LINK + "\n<meta content=\"noindex,nofollow\" name=\"robots\"/>\n</head>", 1)
    html = html.replace("<title>", "<title>[Estudo B] ", 1)
    out = HERE / dst
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print("wrote", out.relative_to(ROOT))
