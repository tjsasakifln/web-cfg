"""Give the browser tools the same static navigation as the public portal."""

from __future__ import annotations

import re
from pathlib import Path
from textwrap import dedent, indent

from scripts.pseo.html_shell import (
    BRAND_ASSETS,
    BRAND_ICONS,
    FOOTER,
    HEADER,
    SVG_SPRITE,
    THEME_COLOR_META,
    breadcrumbs_html,
)

BRAND_HEAD = "\n".join((
    THEME_COLOR_META, BRAND_ICONS,
    '<script src="/bim/web/pular-navegacao.mjs"></script>',
    BRAND_ASSETS,
))


# Vendor styles also style dialogs mounted on the document body. Keep them in
# that document while preventing their global resets from touching site chrome.
SCOPE = "@scope (:root) to (.site-header, .site-footer, .breadcrumbs, .skip-link, .svg-sprite)"


def apply_bim_shell(site: Path) -> None:
    web = site / "bim/web"
    lab = site / "bim/fotogrametria"
    # The local file tools need the public menu, without commercial tracking or
    # the site-wide anchor handler. Their engines use native hashchange events.
    nav = (Path(__file__).resolve().parents[2] / "js/modules/nav.js").read_text(encoding="utf-8")
    menu = re.search(r"^ *// BEGIN SHARED SITE MENU[^\n]*\n(.*?)^ *// END SHARED SITE MENU$", nav, re.M | re.S)
    if menu is None:
        raise ValueError("Componente de navegação institucional ausente")
    with (web / "pular-navegacao.mjs").open("a", encoding="utf-8") as module:
        # Set the progressive-enhancement class before the body can paint, but
        # wait for the actual controls before binding their event handlers.
        module.write("\ndocument.addEventListener('DOMContentLoaded', () => {\n")
        module.write("  document.querySelector('.skip-link').addEventListener('click', pularParaConteudo);\n")
        module.write(indent(dedent(menu[1]).strip(), "  ") + "\n}, { once: true });\n")

    pages = [*web.glob("*.html"), lab / "index.html"]
    for page in pages:
        document = page.read_text(encoding="utf-8")
        title = re.search(r"<title>([^<]+)</title>", document).group(1).split(" | ")[0]
        is_catalog = page == web / "index.html"
        crumbs = [("Início", "/"), ("BIM", "/bim/"), ("Ferramentas", "/bim/web/")]
        if not is_catalog:
            crumbs.append((title, None))

        chrome = SVG_SPRITE + "\n" + HEADER + "\n" + breadcrumbs_html(crumbs)
        document = document.replace("<main ", chrome + "\n<main ", 1)
        document = document.replace("</body>", FOOTER + "\n</body>", 1)
        # Keep metadata and the charset declaration first; the institutional
        # stylesheet precedes the application styles, the BIM theme follows.
        if BRAND_ASSETS not in document:
            raise ValueError(f"Recursos de identidade ausentes em {page.name}")
        document = document.replace(BRAND_ASSETS, BRAND_HEAD, 1)
        document = re.sub(r"<style>(.*?)</style>", lambda m: f"<style>{SCOPE} {{\n{m[1]}\n}}</style>", document, flags=re.S)
        page.write_text(document, encoding="utf-8")

    # WebSfM already scopes its compiled chunks before Vite computes their names.
    for sheet in [*web.glob("*.css"), lab / "entrada.css"]:
        css = sheet.read_text(encoding="utf-8")
        sheet.write_text(f"{SCOPE} {{\n{css}\n}}\n", encoding="utf-8")
