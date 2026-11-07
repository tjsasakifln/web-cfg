"""Publish a static, release-local project toolbox in the existing public hub."""
import json
import re
from html import escape
from pathlib import Path

# A tool becomes discoverable when its page is packaged. The slug is relative to the
# public root; no GitHub branch, remote service or request from the visitor is involved.
TOOLS = {
    "cad": ("Abrir e editar DWG", "Consulte cotas, revise o desenho e trabalhe com camadas no editor CAD."),
    "bim": ("Visualizar IFC e trabalhar com BIM", "Navegue pelo modelo em 3D, confira elementos e acesse as ferramentas de medição."),
    "ferramentas/conversor-utm-sirgas-2000": ("Converter coordenadas SIRGAS 2000", "Passe de latitude e longitude para UTM e confira o fuso do levantamento."),
    "ferramentas/calculadora-de-beiral": ("Calcular a sombra de um beiral", "Compare a proteção da janela em diferentes horários e orientações de fachada."),
    "ferramentas/calculadora-psicrometrica": ("Calcular o ponto de orvalho", "Compare a temperatura da superfície com a condição de condensação do ar."),
    "ferramentas/calculadora-bdi": ("Calcular o BDI da obra", "Componha as parcelas do BDI e obtenha o preço de venda a partir do custo direto."),
    "ferramentas/caminho-critico-obra": ("Encontrar o caminho crítico da obra", "Confira o prazo de entrega e a folga de cada atividade do cronograma."),
}
MARKER = re.compile(r"(<!-- catalogo:inicio -->).*?(<!-- catalogo:fim -->)", re.S)
# Independent tool PRs add standalone links before this catalog ships. Move their
# single-purpose cards/paragraph to the shared grid without consuming contract cards.
ENTRY = re.compile(r'<section class="tool-situation" aria-labelledby="sit-(?:beiral|cpm)">.*?</section>'
                   r'|<aside class="tool-method">.*?</aside>|<p>[^<>]*<a [^<>]+>[^<>]+</a>[^<>]*</p>', re.S)
HREF = re.compile(r'href="(/[^"#?]+/)"')
COLLECTION = re.compile(r'(<script type="application/ld\+json">)(\s*\{.*?\})(\s*</script>)', re.S)

def publish_catalog(root: Path) -> None:
    path = root / "ferramentas/index.html"
    if not path.is_file():
        return
    html = path.read_text(encoding="utf-8")
    if not MARKER.search(html):
        return
    available = {f"/{slug}/": copy for slug, copy in TOOLS.items() if (root / slug / "index.html").is_file()}
    optional = {f"/{slug}/" for slug in TOOLS if slug.startswith("ferramentas/")}

    def remove_duplicate(match):
        links = set(HREF.findall(match[0]))
        return "" if len(links) == 1 and links <= optional else match[0]

    html = ENTRY.sub(remove_duplicate, html)
    cards = [f'<li><a href="{route}">{escape(title)}</a><span>{escape(description)}</span></li>'
             for route, (title, description) in available.items()]
    html = MARKER.sub(lambda m: m[1] + "\n" + "\n".join(cards) + "\n" + m[2], html)

    def collection(match):
        payload = json.loads(match[2])
        if payload.get("@type") != "CollectionPage":
            return match[0]
        items = payload["mainEntity"]["itemListElement"]
        owned = {"https://confenge.com.br/" + slug + "/" for slug in TOOLS}
        unchanged = [item for item in items if item.get("url") not in owned]
        listed = [{"@type": "ListItem", "name": title, "url": "https://confenge.com.br" + route}
                  for route, (title, _) in available.items()]
        for i, item in enumerate(listed + unchanged, 1):
            item["position"] = i
        payload["mainEntity"]["itemListElement"] = listed + unchanged
        if isinstance(payload.get("hasPart"), dict) and payload["hasPart"].get("url") in owned:
            del payload["hasPart"]
        return match[1] + "\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n</script>"

    rendered = COLLECTION.sub(collection, html)
    if rendered != path.read_text(encoding="utf-8"):
        path.write_text(rendered, encoding="utf-8")
