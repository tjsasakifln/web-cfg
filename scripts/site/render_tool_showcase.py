"""Render the public tool catalogue and its share panels from one registry.

Run with --write to refresh the tracked HTML. --check detects drift.
The application forms, result markup and page routes remain owned by their tools.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
from html import escape
from pathlib import Path
from urllib.parse import urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[2]
HOST = "https://confenge.com.br"
HUB = "/ferramentas/"
TITLE = "Ferramentas de engenharia online: CAD, BIM, obras e imóveis"
DESCRIPTION = (
    "Abra e edite DWG, trabalhe com IFC, calcule limites de aditivos e avalie imóveis "
    "com o Modela Pro. Escolha uma ferramenta de engenharia e use no navegador."
)
CSS = '<link rel="stylesheet" href="/assets/tool-showcase/showcase.css"/>'
JS = '<script type="module" src="/assets/tool-showcase/showcase.mjs"></script>'
ID = re.compile(r"[a-z][a-z0-9-]*\Z")
PATH = re.compile(r"/(?:[a-z0-9-]+/)+(?:[a-z0-9-]+\.html)?(?:#[a-z0-9-]+)?\Z")
ART = {
    "plan": '<path d="M75 88V25h198v64h-57V62h-52v26H75m24-15V39h63v35m14-35h72v17h-72zM66 17h216M66 13v9m216-9v9M283 28v60m-5-60h11m-11 60h11"/>'
            '<path d="M101 57h52m25 19h25m40-8h21" opacity=".46"/>',
    "iso": '<path d="m85 62 88-43 101 33-89 46Zm0 0v15l100 33 89-46V52m-89 46v12M113 48v-19l61-28 73 23v19m-134-14 73 24 61-29m-61 29v21m-48-36v28m75-20v21" transform="translate(5 7) scale(.95)"/>'
           '<path d="m127 67 43-21 59 19-43 21Z" fill="currentColor" fill-opacity=".19"/>',
    "chart": '<path d="M75 22v70h215M91 77l188-55m-188 39 188-55M91 92l188-55" opacity=".52"/>'
             '<path d="M91 77 279 22" stroke-width="2"/><path d="M105 78h0m21-12h0m25 3h0m18-18h0m29 2h0m22-14h0m18 4h0m24-16h0" stroke-width="7"/>',
    "grid": '<rect x="77" y="20" width="212" height="75" rx="3"/><path d="M146 20v75m73-75v75M77 57h212m-194-8 30-17m38 16h38m38 36 24-18m-168 0h29v19H95zm75 0 24 17m-24 0 24-17m52-26 14-17 14 17z"/>',
    "sheet": '<path d="M104 16h131l26 24v57H104Zm131 0v24h26M121 42h79m-79 15h112m-112 14h58m-58 13h100"/>'
             '<path d="M187 65h57v24h-57z" stroke-dasharray="4 4"/><path d="m222 26 13 14 18-7" opacity=".4"/>',
    "table": '<rect x="83" y="20" width="201" height="76" rx="4"/><path d="M83 40h201M83 57h201M83 76h201m-135-56v76m67-76v76"/>'
             '<path d="M99 49h28m-28 18h19m-19 18h34m26-36h37m-37 18h23m46 0h33m-33 18h24" opacity=".58"/>',
    "bars": '<path d="M76 20v77h207m-194-20h184m-184-20h184m-184-20h184" opacity=".55"/>'
            '<path d="M117 61v35m32-55v55m32-19v19m32-73v73m32-51v51" stroke-width="15"/>',
    "timeline": '<path d="M79 64h208m-193 8v-8m58 8v-8m53 8v-8m60 8v-8"/>'
                '<circle cx="94" cy="64" r="5" fill="currentColor"/><circle cx="152" cy="64" r="5" fill="currentColor"/><circle cx="205" cy="64" r="5" fill="currentColor"/><circle cx="265" cy="64" r="5" fill="currentColor"/>'
                '<path d="M94 52V27h43m15 48v17h35m18-40V24h44m16 51v19h26" opacity=".7"/>',
    "check": '<path d="M109 18h153v79H109zM124 39l5 5 10-12m-15 27 5 5 10-12m-15 27 5 5 10-12M156 37h86m-86 20h70m-70 20h86"/>'
             '<path d="M151 15h66v9h-66z" fill="currentColor" fill-opacity=".3"/>',
    "photo": '<rect x="87" y="21" width="199" height="75" rx="3"/><circle cx="243" cy="39" r="9"/>'
             '<path d="m97 86 47-44 47 37 31-25 53 32m-158-5 44-28 58 28Zm0 0 102 0m-58-28 0 28" />',
    "mesh": '<path d="M74 84l38-36 53 9 30-38 38 39 54 20-36 20H111Zm38-36 52 50 31-79 55 79 37-20m-213 6 91-27 86 41m-139-50 122 10-70 40m31-79 38 39-67-1m-55 41 54-41"/>',
    "profile": '<path d="M77 21v76h212m-204-9 36-19 32 2 42-40 32 9 42-15m-184 69 40-13 32-1 41-32 39 4 32-17m-116 36v25m42-65v65m32-56v56" />',
    "part": '<path d="M115 24h124l34 27v32l-33 14H115l-29-21V49Zm0 0 0 48 125 0 33-21M115 72v25m125-25v25M86 49l29 23"/>'
            '<ellipse cx="149" cy="47" rx="13" ry="8"/><ellipse cx="207" cy="47" rx="13" ry="8"/>',
}


def load_registry(root: Path = ROOT) -> dict:
    data = json.loads((root / "data/site/tool-showcase.json").read_text(encoding="utf-8"))
    if data["schema"] != 1:
        raise ValueError("Unknown tool-showcase schema")
    entries = data["entries"]
    ids = {item["id"] for item in entries}
    groups = {group["id"] for group in data["groups"]}
    hrefs = {item["href"] for item in entries}
    if len(ids) != len(entries) or len(hrefs) != len(entries):
        raise ValueError("Each tool needs a unique id and href")
    if len(groups) != len(data["groups"]):
        raise ValueError("Duplicate tool-showcase group")
    for entry in entries:
        if entry["group"] not in groups or not ID.fullmatch(entry["id"]) or entry["art"] not in ART:
            raise ValueError(f"Invalid tool: {entry['id']}")
        for href in [entry["href"], *(link for _, link in entry.get("links", []))]:
            if not PATH.fullmatch(href):
                raise ValueError(f"Nonlocal tool destination: {href}")
        if "page" in entry:
            page = entry["page"]
            if urlsplit(entry["href"]).fragment or not entry["href"].endswith("/"):
                raise ValueError(f"Metadata needs a canonical page: {entry['href']}")
            if not set(page["related"]) <= ids - {entry["id"]}:
                raise ValueError(f"Invalid related links: {entry['id']}")
            if "start" in page and not ID.fullmatch(page["start"]):
                raise ValueError(f"Invalid start target: {entry['id']}")
    return data


def plate(art: str, mark: str = "") -> str:
    label = f'<span class="ts-plate-label">{escape(mark)}</span>' if mark else ""
    return (
        f'<div class="ts-plate" data-art="{art}" aria-hidden="true">'
        '<svg viewBox="0 0 360 114" focusable="false" fill="none" stroke="currentColor"'
        f' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ART[art]}</svg>'
        f'{label}</div>'
    )


def cta_attrs(key: str, position: str) -> str:
    return f'data-event-name="cta_click" data-cta-id="{key}" data-cta-position="{position}"'


def card(item: dict) -> str:
    tool = item["id"]
    link_tag = {
        "aditivos": ' data-hub-link="ferramentas-limite"',
        "prontidao": ' data-hub-link="ferramentas-prontidao"',
    }.get(tool, "")
    extras = "".join(
        f'<a class="ts-card-secondary" href="{escape(href)}">{escape(label)}</a>'
        for label, href in item.get("links", [])
    )
    share_target = item["href"] if "page" in item else f"{HUB}#ferramenta-{tool}"
    share = escape(share_url(share_target, "confenge_share"))
    return f'''<li class="ts-card" id="ferramenta-{tool}" data-tool-card="{tool}" data-tool-keywords="{escape(item['keywords'])}"{link_tag}>
{plate(item['art'], item['mark'])}
<div class="ts-card-body"><span class="ts-card-format">{escape(item['format'])}</span>
<h3>{escape(item['title'])}</h3><p>{escape(item['summary'])}</p>
<div class="ts-card-actions"><a class="ts-card-action" href="{escape(item['href'])}" {cta_attrs(f'tool-open-{tool}', 'tool_catalog')}>{escape(item['action'])}<span aria-hidden="true">↗</span></a>
<button type="button" class="ts-card-share" aria-label="Compartilhar: {escape(item['title'])}" data-card-share data-share-title="{escape(item['title'])}" data-share-url="{share}" hidden {cta_attrs(f'tool-share-card-{tool}', 'tool_share')}>
<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/></svg></button></div>{extras}
<p role="status" class="ts-card-status"></p>
</div></li>'''


def share_url(path: str, source: str) -> str:
    parsed = urlsplit(path)
    query = urlencode({"utm_source": source, "utm_medium": "referral", "utm_campaign": "ferramentas"})
    return f"{HOST}{parsed.path}?{query}" + (f"#{parsed.fragment}" if parsed.fragment else "")


def share_panel(path: str, title: str, key: str, related: list[dict]) -> str:
    wa = "https://wa.me/?" + urlencode({"text": f"{title} | CONFENGE\n{share_url(path, 'whatsapp')}"})
    linked = "https://www.linkedin.com/sharing/share-offsite/?" + urlencode({"url": share_url(path, "linkedin")})
    copy_url = share_url(path, "confenge_share")
    more = f'<a href="{HUB}">Ver todas as ferramentas</a>' if path != HUB else ""
    more += "".join(f'<a href="{escape(item["href"])}">{escape(item["title"])}</a>' for item in related)
    text = "Envie a alguém que precisa resolver uma tarefa de engenharia." if path == HUB else (
        "Envie o link da ferramenta para um colega. O link não leva os dados do seu trabalho."
    )
    heading = "Compartilhe as ferramentas CONFENGE" if path == HUB else "Compartilhe esta ferramenta"
    return f'''<section class="tool-share container" aria-labelledby="tool-share-title" data-tool-share data-share-title="{escape(title)}">
<h2 id="tool-share-title">{heading}</h2>
<p>{text}</p>
<div class="tool-share-social">
<button type="button" data-share-copy hidden {cta_attrs(f'tool-share-copy-{key}', 'tool_share')}>Copiar link</button>
<button type="button" data-share-native hidden {cta_attrs(f'tool-share-native-{key}', 'tool_share')}>Compartilhar…</button>
<a href="{escape(wa)}" target="_blank" rel="noopener noreferrer" {cta_attrs(f'tool-share-wa-{key}', 'tool_share')}>WhatsApp</a>
<a href="{escape(linked)}" target="_blank" rel="noopener noreferrer" {cta_attrs(f'tool-share-linkedin-{key}', 'tool_share')}>LinkedIn</a>
</div>
<label class="tool-share-manual" hidden>Link da ferramenta<input type="text" value="{escape(copy_url)}" readonly data-share-url></label>
<p class="tool-share-status" role="status"></p>
<aside id="programa-indicacao" class="tool-referral-entry" data-referral-entry hidden aria-label="Programa de indicação">
<h3>Indique e ganhe créditos de uso</h3>
<p>Gere seu link pessoal na sua conta. Quando uma nova pessoa indicada fizer a primeira exportação paga, você recebe 1 crédito cortesia. Até 10 cortesias por mês.</p>
<a href="/avaliacao-imoveis-urbanos/inferencia/#programa-indicacao" {cta_attrs('tool-referral-entry-' + key, 'tool_share')}>Gerar meu link de indicação</a>
<a href="/termos-de-uso/#creditos-ferramentas">Ver as regras</a>
</aside>
{f'<div class="tool-share-related">{more}</div>' if more else ''}
</section>'''


def meta_tags(path: str, title: str, description: str, image: str) -> str:
    abs_image = f"{HOST}/assets/tool-showcase/{image}.jpg"
    fields = {
        "og:type": "website", "og:locale": "pt_BR", "og:site_name": "CONFENGE",
        "og:title": f"{title} | CONFENGE", "og:description": description, "og:url": HOST + path,
        "og:image": abs_image, "og:image:type": "image/jpeg", "og:image:width": "1200",
        "og:image:height": "630", "og:image:alt": f"{title}, ilustração da ferramenta CONFENGE",
        "twitter:card": "summary_large_image", "twitter:title": f"{title} | CONFENGE",
        "twitter:description": description, "twitter:image": abs_image,
        "twitter:image:alt": f"{title}, ilustração da ferramenta CONFENGE",
    }
    return "\n".join(
        f'<meta {"name" if name.startswith("twitter:") else "property"}="{name}" content="{escape(value)}"/>'
        for name, value in fields.items()
    )


def marker(html: str, key: str, value: str, anchor: str, *, before: bool = True) -> str:
    start, end = f"<!-- tool-showcase:{key} -->", f"<!-- /tool-showcase:{key} -->"
    block = f"{start}\n{value}\n{end}"
    if start in html or end in html:
        if html.count(start) != 1 or html.count(end) != 1 or html.index(end) < html.index(start):
            raise ValueError(f"Malformed tool-showcase marker {key}")
        a, b = html.index(start), html.index(end) + len(end)
        return html[:a] + block + html[b:]
    if html.count(anchor) != 1:
        raise ValueError(f"Missing or ambiguous anchor {key}: {anchor}")
    return html.replace(anchor, f"{block}\n{anchor}" if before else f"{anchor}\n{block}", 1)


def set_head(html: str, path: str, title: str, desc: str, key: str, *, updated: str, index: bool = True) -> str:
    head, rest = html.split("</head>", 1)
    if "<!-- tool-showcase:head -->" not in head:
        head = re.sub(
            r'<meta\b(?=[^>]*\b(?:name|property)=["\x27](?:og:|twitter:|description["\x27]))[^>]*>\n?',
            "", head, flags=re.I,
        )
        head = re.sub(r'<title>.*?</title>\n?', "", head, count=1, flags=re.S | re.I)
        if index:
            head = re.sub(r'<meta\b(?=[^>]*\bname="robots")[^>]*>\n?', "", head, flags=re.I)
    tags = [
        f"<title>{escape(title)} | CONFENGE</title>",
        f'<meta name="description" content="{escape(desc)}"/>',
    ]
    if index:
        tags.extend((
            '<meta name="robots" content="index,follow,max-image-preview:large"/>',
            f'<meta property="og:updated_time" content="{escape(updated)}"/>',
        ))
    tags += [meta_tags(path, title, desc, key), CSS, JS]
    return marker(head + "</head>", "head", "\n".join(tags), "</head>") + rest


def catalogue(html: str, data: dict) -> str:
    html = set_head(html, HUB, TITLE, DESCRIPTION, "catalogo", updated=data["updated"])
    entries = data["entries"]
    indexed = [entry for entry in entries if entry.get("page", {}).get("index", "page" in entry)]
    collection = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": TITLE,
        "description": DESCRIPTION,
        "url": HOST + HUB,
        "inLanguage": "pt-BR",
        "dateModified": data["updated"],
        "primaryImageOfPage": HOST + "/assets/tool-showcase/catalogo.jpg",
        "mainEntity": {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": n, "name": item["title"], "url": HOST + item["href"]}
            for n, item in enumerate(indexed, 1)
        ]},
    }
    # Remove the former hand-maintained CollectionPage, preserving BreadcrumbList.
    if "<!-- tool-showcase:collection -->" not in html:
        html = re.sub(
            r'<script type="application/ld\+json">\s*\{\s*"@context": "https://schema.org",\s*"@type": "CollectionPage",.*?</script>\n?',
            "", html, count=1, flags=re.S,
        )
    html = marker(html, "collection",
                  f'<script type="application/ld+json">\n{json.dumps(collection, ensure_ascii=False, indent=2)}\n</script>',
                  "</head>")
    jumps = "".join(f'<a href="#{group["id"]}">{escape(group["jump"])}</a>' for group in data["groups"])
    sections = []
    for group in data["groups"]:
        key = group["id"]
        cards = "\n".join(card(item) for item in entries if item["group"] == key)
        sections.append(f'''<section class="ts-section container" data-group="{key}" id="{key}" aria-labelledby="{key}-title">
<div class="ts-section-heading"><h2 id="{key}-title">{escape(group["title"])}</h2><p>{escape(group["summary"])}</p></div>
<ul class="ts-grid">
{cards}
</ul></section>''')
    section_html = "\n".join(sections)
    main = f'''<main id="conteudo" class="tool-showcase">
<nav class="breadcrumbs container ts-crumb" aria-label="Navegação estrutural"><ol><li><a href="/">Início</a><span aria-hidden="true">/</span></li><li aria-current="page">Ferramentas</li></ol></nav>
<header class="ts-hero"><div class="container ts-hero-inner">
<div class="ts-hero-copy">
<p class="eyebrow">Ferramentas CONFENGE</p>
<h1>Ferramentas de engenharia online</h1>
<p data-tool-job>Abra uma planta em DWG, confira um modelo IFC, estime o valor de um imóvel ou organize a próxima decisão da obra.</p>
<div class="ts-hero-actions"><a class="button button-primary" href="#destaques">Explorar ferramentas</a><a class="ts-hero-link" href="#tool-share-title" aria-label="Compartilhar com um colega">Compartilhar</a></div>
</div>
<figure class="ts-hero-visual" aria-hidden="true">{plate('plan', 'DWG · DXF')}{plate('iso', 'IFC · BIM')}{plate('chart', 'MODELA PRO')}</figure>
</div></header>
<div class="ts-browser"><div class="container">
<nav class="ts-jumps" aria-label="Grupos de ferramentas">{jumps}</nav>
<div class="ts-search" data-tool-search hidden><label for="ts-query">Buscar ferramenta</label><input type="search" id="ts-query" placeholder="Ex.: DWG ou aditivo" autocomplete="off" maxlength="120"><button type="button" data-search-clear hidden>Limpar</button></div>
</div></div>
<div class="container"><p class="ts-search-status" role="status" data-search-status></p></div>
{section_html}
<div class="container ts-end" id="metodo">
<h2>Da ferramenta à decisão</h2>
<p data-tool-decision>Comece pela tarefa que você tem em mãos. Algumas ferramentas oferecem arquivos de exemplo. Nas de contratos, o resultado distingue fato, cálculo, inferência e o que ainda é desconhecido. A prontidão de obra privada é opcional e não é etapa obrigatória para solicitar um serviço.</p>
<p>Para seguir com o caso, conheça a <a href="/avaliacao-imoveis-urbanos/">avaliação profissional de imóveis</a>, a <a href="/compatibilizacao-projetos-engenharia/">compatibilização de projetos</a>, o <a href="/quantitativos-orcamento-obras/">levantamento de quantitativos e orçamento</a> ou a <a href="/servicos-obras-publicas/">engenharia de contratos de obras públicas</a>.</p>
<p>Responsável técnico: <a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a> · <a href="/triagem-tecnica/#corrigir-o-site">Encontrou um erro?</a></p>
<a href="/diagnostico-b2g-expansao/" data-cta-id="ferramentas-hub-diagnostico-expansao" data-cta-position="hub_tools" data-route-family="ferramentas" data-asset-id="ferramentas-hub" data-asset-family="tool" data-journey="operacao">Conhecer o Diagnóstico de Expansão no Mercado Público</a>
</div>
{share_panel(HUB, 'Ferramentas de engenharia online', 'catalogo', [])}
</main>'''
    if len(re.findall(r'<main\b[^>]*\bid="conteudo"', html)) != 1:
        raise ValueError("Missing or ambiguous catalogue main")
    html = re.sub(r'<main\b[^>]*\bid="conteudo"[^>]*>.*?</main>', lambda _: main, html, count=1, flags=re.S)
    html = re.sub(r'<script src="/assets/js/(?:tool-persist|tools-common)\.js"></script>\n?', "", html)
    html = re.sub(r'<link (?:href="/assets/editorial-tool.css" rel="stylesheet"|rel="stylesheet" href="/styles-tools.css")/>\n?', "", html)
    return html


def tool_page(html: str, item: dict, by_id: dict, updated: str) -> str:
    path, key, page = item["href"], item["id"], item["page"]
    html = set_head(html, path, page["title"], page["desc"], key, updated=updated, index=page.get("index", True))
    # Align the schema for this public tool page, not the dates of its
    # underlying example, evidence or reference material.
    def sync_date(block: re.Match) -> str:
        return re.sub(r'("dateModified"\s*:\s*")[^"]+(")', lambda m: m[1] + updated + m[2], block[0])
    html = re.sub(r'<script type="application/ld\+json">.*?</script>', sync_date, html, flags=re.S)
    if "brief" in page:
        # Keep existing form and scripting intact. The intro points to the real start control.
        if not re.search(r'\bid=["\x27]' + re.escape(page["start"]) + r'["\x27]', html):
            raise ValueError(f"Missing start fragment: {path}#{page['start']}")
        teaser = (f'<div class="tool-brief container"><div><p>{escape(page["brief"])}</p>'
                  f'<a href="#{page["start"]}" {cta_attrs(f"tool-start-{key}", "tool_intro")}>'
                  f'{escape(page.get("start_label", item["action"]))} <span aria-hidden="true">↗</span></a></div>{plate(item["art"], item["mark"])}</div>')
        if "<!-- tool-showcase:brief -->" in html:
            html = marker(html, "brief", teaser, "")
        else:
            # Modela and the contract tools have a distinct hero. The readiness
            # page starts with a block rather than a header; place after its H1.
            start = html.index("<main")
            end_h1 = html.index("</h1>", start) + len("</h1>")
            hero = re.search(r'<header\b[^>]*class="(?:mp-intro|tool-page-hero)"', html[start:end_h1])
            if key == "modela":
                where = html.index("</div></header>", end_h1)
            else:
                where = html.index("</header>", end_h1) + len("</header>") if hero else end_h1
            html = html[:where] + "\n" + marker("", "brief", teaser, "") + html[where:]
    # The actual results stay in the application. A nearby link points to
    # the public tool share card, never to a serialized result or file.
    if "brief" in page and "tool-result-share" not in html:
        action = "tool-credits" if key == "modela" else "btn-print"
        button = re.search(r'<button\b[^>]*\bid="' + action + r'"[^>]*>.*?</button>', html, re.S)
        if not button:
            raise ValueError(f"Result actions moved: {path}")
        link = '<a class="text-link tool-result-share" href="#tool-share-title">Compartilhar esta ferramenta</a>'
        html = html[:button.end()] + link + html[button.end():]
    html = re.sub(r'(<a\b[^>]*class="text-link tool-result-share"[^>]*>).*?(</a>)',
                  r'\1Compartilhar esta ferramenta\2', html)
    share = share_panel(path, item["title"], key, [by_id[ref] for ref in page["related"]])
    return marker(html, "share", share, "</main>")


def rendered_pages(root: Path) -> dict[Path, str]:
    data = load_registry(root)
    by_id = {item["id"]: item for item in data["entries"]}
    result = {}
    hub = root / "ferramentas/index.html"
    result[hub] = catalogue(hub.read_text(encoding="utf-8"), data)
    for item in data["entries"]:
        if "page" in item:
            file = root / item["href"].lstrip("/") / "index.html"
            result[file] = tool_page(file.read_text(encoding="utf-8"), item, by_id, data["updated"])
    return result


def social_sources(output: Path) -> None:
    """Write deterministic share artwork sources for a browser to rasterize."""
    output.mkdir(parents=True, exist_ok=True)
    logo = base64.b64encode((ROOT / "assets/logo-confenge-white-500-1677038e.png").read_bytes()).decode()
    font = base64.b64encode((ROOT / "assets/archivo-var-latin-b19be0f7.woff2").read_bytes()).decode()
    css = (ROOT / "assets/tool-showcase/showcase.css").read_text(encoding="utf-8")
    entries = [
        ("catalogo", "Ferramentas de engenharia online", "DWG · BIM · Imóveis · Obras", "iso", "CAD / BIM"),
        *((item["id"], item["title"], item["format"], item["art"], item["mark"])
          for item in load_registry()["entries"] if "page" in item),
    ]
    for key, title, fmt, art, mark in entries:
        (output / f"{key}.html").write_text(f'''<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<style>{css}
@font-face{{font-family:Archivo;src:url(data:font/woff2;base64,{font}) format("woff2");font-weight:100 900}}
*{{box-sizing:border-box}}body{{margin:0;width:1200px;height:630px;color:#fff;font-family:Archivo,sans-serif;background:radial-gradient(ellipse at 85% 30%,#19675a,#0a273b 60%)}}
.cover{{height:100%;padding:66px 68px;display:grid;grid-template-columns:1.18fr 1fr;gap:34px;align-items:center;background-image:linear-gradient(#a0fbd00d 1px,transparent 1px),linear-gradient(90deg,#a0fbd00d 1px,transparent 1px);background-size:32px 32px}}
.wordmark{{display:block;width:234px;height:auto;margin-bottom:44px}}h1{{color:#fff;font-size:59px;line-height:1.04;letter-spacing:-.04em;margin:16px 0;font-weight:760;max-width:17ch}}p{{color:#baf8d7;font-size:20px;font-weight:700;letter-spacing:.055em}}
.cover .ts-plate{{border:1px solid #b0e9d482;border-radius:18px;background:#0e3140;padding:22px;box-shadow:0 20px 80px #03172380}}.cover .ts-plate svg{{height:200px}}.cover .ts-plate-label{{font-size:16px;left:18px;bottom:16px}}.origin{{font-size:17px;letter-spacing:.025em;color:#d3f6ed;margin-top:28px}}
</style><body><div class="cover"><div><img class="wordmark" src="data:image/png;base64,{logo}" alt="CONFENGE"><p>{escape(fmt)}</p>
<h1>{escape(title)}</h1><div class="origin">confenge.com.br</div></div>{plate(art, mark)}</div></body></html>''',
                                           encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    group.add_argument("--social-sources", type=Path)
    args = parser.parse_args()
    if args.social_sources:
        social_sources(args.social_sources)
        return 0
    changed = []
    for file, rendered in rendered_pages(ROOT).items():
        if file.read_text(encoding="utf-8") != rendered:
            changed.append(str(file.relative_to(ROOT)))
            if args.write:
                file.write_text(rendered, encoding="utf-8", newline="\n")
    if changed:
        print("Rendered" if args.write else "Tool catalogue drift", ", ".join(changed))
    return int(bool(changed) and args.check)


if __name__ == "__main__":
    raise SystemExit(main())
