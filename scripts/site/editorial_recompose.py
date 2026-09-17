#!/usr/bin/env python3
"""Recomposição editorial determinística dos artigos manuais de /conteudos/.

Campanha CONFENGE-SALTO-INSTITUCIONAL-02 (lote C). Aplica o modelo de leitura do
bloco "Article" de assets/editorial.css sem tocar em título, corpo, JSON-LD,
canonical, links, CTAs, formulários ou conteúdo. Toda transformação é uma
edição cirúrgica de texto (nunca parse-e-reserialização), por isso os bytes
fora dos pontos de inserção ficam idênticos.

Operações (todas idempotentes):

1. `<link href="/assets/editorial.css" rel="stylesheet"/>` logo após a folha
   `/styles.css`, quando ausente.
2. Índice de página: `nav.article-toc` com o rótulo "Nesta página" e uma
   entrada por h2 de leitura dentro de `article-main`, quando o artigo tem
   três ou mais h2. Um índice já existente tem as entradas preservadas e só o
   invólucro normalizado para `<ol><li>`; ids estáveis são gerados a partir do
   texto do h2 apenas quando faltam, sem duplicar ids existentes.
3. Tabelas nuas (fora de `.table-wrap`/`.table-scroll`) ganham `div.table-scroll`
   acessível (role=group, tabindex, aria-label da legenda) seguido da dica
   "Deslize a tabela para ver todas as colunas." (visível só em telas estreitas;
   `.table-wrap` já exibe a dica por CSS).
4. Figuras: `alt` vazio recebe o texto da legenda (`figcaption`) ou do título
   da figura; o caso é registrado. Estilo inline de margem em `figure` é
   removido (a folha editorial rege a margem).
5. `author-box` e `sources-section`: verificação da estrutura esperada pela
   folha; nada é reescrito quando já conformes (o texto nunca muda).
6. Página com aprovação humana vinculada ao hash do HTML renderizado
   (`data/editorial/striking-distance-noindex.v1.json`) fica intacta e é
   registrada: qualquer byte novo invalidaria a aprovação (fail-closed).
7. Os cinco artigos fora do modelo (`article.container` ou
   `section.section--default > div.container[style]`) são envolvidos no
   esqueleto `header.content-hero.article-hero` + `div.container.article-layout`
   + `article.article-main`, removendo o `style` inline do contêiner. O texto
   visível não muda.

Uso:
  python3 scripts/site/editorial_recompose.py            # aplica em conteudos/*/index.html
  python3 scripts/site/editorial_recompose.py --check    # falha se alguma página mudaria
  python3 scripts/site/editorial_recompose.py --parity   # compara o texto visível de <main>
                                                         # com HEAD (só invólucros mudaram)
  python3 scripts/site/editorial_recompose.py --report   # imprime o registro de casos
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTICLES_DIR = ROOT / "conteudos"
EDITORIAL_LINK = '<link href="/assets/editorial.css" rel="stylesheet"/>'
TABLE_HINT = '<p class="table-hint">Deslize a tabela para ver todas as colunas.</p>'
TOC_LABEL = "Nesta página"
MIN_H2_FOR_TOC = 3
# h2 que não são leitura corrida: não entram no índice gerado.
NON_READING_CLASSES = (
    "author-box",
    "related-section",
    "article-faq",
    "article-decision",
    "article-callout",
    "lead-inline",
    "aside-card",
    "article-aside",
    "editorial-bridge",
    "answer-box",
)

STYLES_LINK_RE = re.compile(r'<link(?=[^>]*rel="stylesheet")(?=[^>]*href="/styles\.css")[^>]*>')
TOC_RE = re.compile(r'<nav aria-label="Nesta página" class="article-toc">(.*?)</nav>', re.S)
ANCHOR_RE = re.compile(r"<a\b[^>]*>.*?</a>", re.S)
TABLE_RE = re.compile(r"<table\b[^>]*>.*?</table>", re.S)
FIGURE_RE = re.compile(r"<figure\b[^>]*>.*?</figure>", re.S)
H2_RE = re.compile(r"<h2\b([^>]*)>(.*?)</h2>", re.S)
ID_ATTR_RE = re.compile(r'\bid="([^"]*)"')
CLASS_ATTR_RE = re.compile(r'\bclass="([^"]*)"')
ALT_RE = re.compile(r'\balt="([^"]*)"')
CAPTION_RE = re.compile(r"<caption\b[^>]*>(.*?)</caption>", re.S)
FIGCAPTION_RE = re.compile(r"<figcaption\b[^>]*>(.*?)</figcaption>", re.S)
MAIN_RE = re.compile(r"<main\b[^>]*>.*?</main>", re.S)
ARTICLE_MAIN_RE = re.compile(r'<article class="article-main"[^>]*>.*?</article>', re.S)


def slugify(text: str) -> str:
    text = unescape(re.sub(r"<[^>]+>", "", text))
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:60].rstrip("-") or "secao"


def strip_tags(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", html))).strip()


def all_ids(html: str) -> set[str]:
    return set(ID_ATTR_RE.findall(html))


def unique_id(base: str, taken: set[str]) -> str:
    candidate = base
    n = 2
    while candidate in taken:
        candidate = f"{base}-{n}"
        n += 1
    taken.add(candidate)
    return candidate


# --- 1. folha editorial -------------------------------------------------------

def ensure_editorial_link(html: str, log: list[str]) -> str:
    if "/assets/editorial.css" in html:
        return html
    m = STYLES_LINK_RE.search(html)
    if not m:
        log.append("sem link /styles.css: folha editorial não inserida")
        return html
    log.append("link editorial.css inserido")
    return html[: m.end()] + "\n" + EDITORIAL_LINK + html[m.end():]


# --- 6. esqueleto para os artigos fora do modelo ---------------------------------

SHAPE_A_OPEN = '<article class="container" style="max-width:46rem;padding-block:2.5rem 4rem">'
SHAPE_B_OPEN = '<section class="section section--default">\n<div class="container" style="max-width:46rem">'
SHAPE_B_CONTACT_OPEN = re.compile(
    r'<section class="section section--default" id="([^"]+)">\n<div class="container" style="max-width:46rem">'
)


def _hero(eyebrow: str, h1: str, lead: str) -> str:
    return (
        '<header class="content-hero article-hero"><div class="container content-hero-grid"><div>'
        f"{eyebrow}\n{h1}\n{lead}"
        "</div></div></header>"
    )


def recompose_shape(html: str, log: list[str]) -> str:
    """Envolve os artigos fora do modelo no esqueleto article-hero/article-layout."""
    if 'class="article-main"' in html:
        return html
    main_m = MAIN_RE.search(html)
    if not main_m:
        return html
    main = main_m.group(0)
    new_main = main
    if SHAPE_A_OPEN in main:
        head_re = re.compile(
            re.escape(SHAPE_A_OPEN)
            + r'\n(<p class="eyebrow">.*?</p>)\n(<h1>.*?</h1>)\n<p class="lead">(.*?)</p>\n',
            re.S,
        )
        m = head_re.search(main)
        if not m:
            log.append("forma A reconhecida, cabeçalho não casou: página não recomposta")
            return html
        body_end = main.rfind("</article>")
        body = main[m.end():body_end]
        new_main = (
            main[: m.start()]
            + _hero(m.group(1), m.group(2), f'<p class="lead content-lead">{m.group(3)}</p>')
            + '\n<div class="container article-layout">\n<article class="article-main">\n'
            + body
            + "</article>\n</div>"
            + main[body_end + len("</article>"):]
        )
        log.append("esqueleto article-layout aplicado (forma A)")
    elif SHAPE_B_OPEN in main:
        head_re = re.compile(
            re.escape(SHAPE_B_OPEN)
            + r'\n(<p class="eyebrow">.*?</p>)\n(<h1>.*?</h1>)\n<p>(.*?)</p>\n',
            re.S,
        )
        m = head_re.search(main)
        if not m:
            log.append("forma B reconhecida, cabeçalho não casou: página não recomposta")
            return html
        rest = main[m.end():]
        first_close = rest.find("</div>\n</section>")
        if first_close < 0:
            log.append("forma B: fechamento da primeira seção não encontrado")
            return html
        first_body = rest[:first_close]
        after = rest[first_close + len("</div>\n</section>"):]
        # Segunda seção (contato) vira seção do próprio artigo, sem contêiner próprio.
        cm = SHAPE_B_CONTACT_OPEN.search(after)
        contact = ""
        tail = after
        if cm:
            c_end = after.find("</div>\n</section>", cm.end())
            if c_end >= 0:
                contact = (
                    f'\n<section id="{cm.group(1)}">'
                    + after[cm.end():c_end]
                    + "</section>\n"
                )
                tail = after[:cm.start()] + after[c_end + len("</div>\n</section>"):]
        new_main = (
            main[: m.start()]
            + _hero(m.group(1), m.group(2), f'<p class="content-lead">{m.group(3)}</p>')
            + '\n<div class="container article-layout">\n<article class="article-main">\n'
            + first_body.rstrip("\n")
            + "\n"
            + contact
            + "</article>\n</div>"
            + tail
        )
        log.append("esqueleto article-layout aplicado (forma B)")
    else:
        return html
    return html[: main_m.start()] + new_main + html[main_m.end():]


# --- 2. índice de página -----------------------------------------------------------

def _reading_h2s(article_html: str) -> list[tuple[int, str, str]]:
    """(posição, atributos, texto) dos h2 de leitura em article-main."""
    # Remove blocos não-leitura para não indexar autor, relacionados, FAQ, decisão.
    masked = article_html
    for cls in NON_READING_CLASSES:
        pat = re.compile(
            r'<(section|aside|div)\b[^>]*class="[^"]*\b' + re.escape(cls) + r'\b[^"]*"[^>]*>.*?</\1>',
            re.S,
        )
        masked = pat.sub(lambda m: " " * len(m.group(0)), masked)
    out = []
    for m in H2_RE.finditer(masked):
        out.append((m.start(), m.group(1), m.group(2)))
    return out


def _enclosing_section_id(article_html: str, pos: int) -> str | None:
    """id da <section> aberta que contém a posição, se houver."""
    depth = 0
    for m in reversed(list(re.finditer(r"<(/?)section\b([^>]*)>", article_html[:pos]))):
        if m.group(1) == "/":
            depth += 1
        elif depth:
            depth -= 1
        else:
            idm = ID_ATTR_RE.search(m.group(2))
            return idm.group(1) if idm else None
    return None


def normalize_existing_toc(html: str, log: list[str]) -> str:
    m = TOC_RE.search(html)
    if not m:
        return html
    inner = m.group(1)
    if "<ol>" in inner:
        return html
    strong_m = re.match(r"\s*<strong>Nesta página</strong>", inner)
    if not strong_m:
        log.append("índice existente sem rótulo padrão: mantido")
        return html
    anchors = ANCHOR_RE.findall(inner[strong_m.end():])
    residue = ANCHOR_RE.sub("", inner[strong_m.end():]).strip()
    if residue:
        log.append("índice existente com conteúdo além de âncoras: mantido")
        return html
    new_inner = (
        f"<strong>{TOC_LABEL}</strong><ol>"
        + "".join(f"<li>{a}</li>" for a in anchors)
        + "</ol>"
    )
    log.append(f"índice existente normalizado para ol/li ({len(anchors)} entradas)")
    return html[: m.start(1)] + new_inner + html[m.end(1):]


def ensure_toc(html: str, log: list[str]) -> str:
    if TOC_RE.search(html):
        return normalize_existing_toc(html, log)
    am = ARTICLE_MAIN_RE.search(html)
    if not am:
        return html
    article = am.group(0)
    h2s = _reading_h2s(article)
    if len(h2s) < MIN_H2_FOR_TOC:
        log.append(f"índice não gerado: {len(h2s)} h2 de leitura (< {MIN_H2_FOR_TOC})")
        return html
    taken = all_ids(html)
    entries: list[tuple[str, str]] = []
    edits: list[tuple[int, int, str]] = []  # (start, end, replacement) em article
    for pos, attrs, text in h2s:
        idm = ID_ATTR_RE.search(attrs)
        if idm:
            anchor = idm.group(1)
        else:
            sec_id = _enclosing_section_id(article, pos)
            if sec_id:
                anchor = sec_id
            else:
                anchor = unique_id(slugify(text), taken)
                new_attrs = f' id="{anchor}"' + attrs
                edits.append((pos, pos + len("<h2") + len(attrs), f"<h2{new_attrs}"))
        entries.append((anchor, strip_tags(text)))
    for start, end, repl in reversed(edits):
        article = article[:start] + repl + article[end:]
    toc = (
        f'<nav aria-label="{TOC_LABEL}" class="article-toc"><strong>{TOC_LABEL}</strong><ol>'
        + "".join(f'<li><a href="#{a}">{t}</a></li>' for a, t in entries)
        + "</ol></nav>\n"
    )
    open_m = re.match(r'<article class="article-main"[^>]*>\n?', article)
    article = article[: open_m.end()] + toc + article[open_m.end():]
    log.append(f"índice gerado com {len(entries)} entradas; ids novos: {len(edits)}")
    return html[: am.start()] + article + html[am.end():]


# --- 3. tabelas ---------------------------------------------------------------------

def wrap_tables(html: str, log: list[str]) -> str:
    out = []
    last = 0
    wrapped = 0
    hinted = 0
    for m in TABLE_RE.finditer(html):
        before = html[last:m.start()]
        # invólucro já existente: o <div class="table-wrap|table-scroll ...> imediatamente antes
        prev = before.rstrip()
        has_wrap = bool(re.search(r'<div class="(?:table-wrap|table-scroll)"[^>]*>$', prev))
        out.append(before)
        if has_wrap:
            # `.table-wrap` já mostra a dica por CSS (::after em telas estreitas).
            out.append(m.group(0))
            last = m.end()
            continue
        cap = CAPTION_RE.search(m.group(0))
        label = strip_tags(cap.group(1)) if cap else "Tabela de dados"
        label = label.replace('"', "&quot;")
        out.append(
            f'<div class="table-scroll" role="group" tabindex="0" aria-label="{label}">'
            + m.group(0)
            + "</div>\n"
            + TABLE_HINT
        )
        wrapped += 1
        hinted += 1
        last = m.end()
    out.append(html[last:])
    if wrapped or hinted:
        log.append(f"tabelas: {wrapped} envolvidas em table-scroll, {hinted} dicas adicionadas")
    return "".join(out)


# --- 4. figuras ---------------------------------------------------------------------

def fix_figures(html: str, log: list[str]) -> str:
    def repl(m: re.Match) -> str:
        fig = m.group(0)
        original = fig
        open_tag = re.match(r"<figure\b[^>]*>", fig).group(0)
        if ' style="' in open_tag:
            new_open = re.sub(r'\s+style="[^"]*"', "", open_tag)
            fig = new_open + fig[len(open_tag):]
            log.append("figura: estilo inline removido")
        cap = FIGCAPTION_RE.search(fig)
        if not cap:
            log.append("figura sem figcaption: registrada (nenhum texto inventado)")
        for im in list(re.finditer(r"<img\b[^>]*>", fig)):
            tag = im.group(0)
            am = ALT_RE.search(tag)
            if am and am.group(1).strip():
                continue
            fallback = strip_tags(cap.group(1)) if cap else ""
            if not fallback:
                tm = re.search(r'\btitle="([^"]*)"', tag)
                fallback = tm.group(1) if tm else ""
            if not fallback:
                log.append("figura com alt vazio e sem legenda/título: mantida, registrada")
                continue
            fallback = fallback.replace('"', "&quot;")
            new_tag = (
                ALT_RE.sub(f'alt="{fallback}"', tag, count=1)
                if am
                else tag[:-2].rstrip() + f' alt="{fallback}"/>' if tag.endswith("/>") else tag[:-1] + f' alt="{fallback}">'
            )
            fig = fig.replace(tag, new_tag, 1)
            log.append("figura: alt vazio preenchido com a legenda")
        return fig if fig != original else original

    return FIGURE_RE.sub(repl, html)


# --- 5. autor e fontes: verificação -------------------------------------------------

def check_author_and_sources(html: str, log: list[str]) -> None:
    ab = re.search(r'<section class="author-box">(.*?)</section>', html, re.S)
    if ab:
        inner = ab.group(1)
        ok = (
            inner.startswith('<div class="author-photo">')
            and "<span>" in inner
            and "<h2>" in inner
        )
        if not ok:
            log.append("author-box fora da estrutura esperada (photo/span/h2): registrado, texto intacto")
    ss = re.search(r'<section class="sources-section"[^>]*>(.*?)</section>', html, re.S)
    if ss and "<ul>" not in ss.group(1):
        log.append("sources-section sem lista ul: registrado, texto intacto")


# --- pipeline -----------------------------------------------------------------------

def recompose(html: str) -> tuple[str, list[str]]:
    log: list[str] = []
    html = ensure_editorial_link(html, log)
    html = recompose_shape(html, log)
    html = ensure_toc(html, log)
    html = wrap_tables(html, log)
    html = fix_figures(html, log)
    check_author_and_sources(html, log)
    return html, log


APPROVAL_BOUND_REGISTRY = ROOT / "data" / "editorial" / "striking-distance-noindex.v1.json"


def approval_bound_pages() -> set[str]:
    """Páginas cuja aprovação humana está vinculada ao hash do HTML renderizado.

    Qualquer byte novo invalidaria a aprovação (approval_material_hash_mismatch,
    fail-closed para noindex). A recomposição as deixa intactas e registra.
    """
    try:
        data = json.loads(APPROVAL_BOUND_REGISTRY.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    out = set()
    for row in data.get("urls") or []:
        approval = row.get("approval") or {}
        if row.get("html") and approval.get("material_hash"):
            out.add(str(row["html"]))
    return out


def article_paths() -> list[Path]:
    return sorted(p for p in ARTICLES_DIR.glob("*/index.html"))


# --- paridade de texto visível -------------------------------------------------------

class _Text(HTMLParser):
    """Texto visível de <main>, ignorando script/style, nav.article-toc e p.table-hint."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip: list[str] = []
        self._stack: list[str] = []
        self._in_main = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self._in_main = True
        cls = (a.get("class") or "").split()
        skip = tag in ("script", "style", "svg") or "article-toc" in cls or "table-hint" in cls
        self._stack.append(tag)
        if skip:
            self._skip.append(tag)

    def handle_endtag(self, tag):
        if self._skip and self._skip[-1] == tag:
            self._skip.pop()
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()
        if tag == "main":
            self._in_main = False

    def handle_data(self, data):
        if self._in_main and not self._skip:
            self.parts.append(data)


def visible_text(html: str) -> str:
    p = _Text()
    p.feed(html)
    # Sem espaços: um invólucro novo entre dois blocos não muda o texto, só a
    # junção; a comparação é caractere a caractere do que o visitante lê.
    return re.sub(r"\s+", "", "".join(p.parts))


def head_version(path: Path) -> str | None:
    rel = path.relative_to(ROOT).as_posix()
    try:
        return subprocess.check_output(
            ["git", "show", f"HEAD:{rel}"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="não escreve; falha se alguma página mudaria")
    ap.add_argument("--parity", action="store_true", help="compara o texto visível de <main> com HEAD")
    ap.add_argument("--report", action="store_true", help="imprime o registro de casos por página")
    ap.add_argument("paths", nargs="*", help="páginas específicas (padrão: conteudos/*/index.html)")
    args = ap.parse_args(argv)

    paths = [Path(p).resolve() for p in args.paths] or article_paths()
    if args.parity:
        bad = 0
        for p in paths:
            before = head_version(p)
            if before is None:
                print(f"PARITY SKIP {p.relative_to(ROOT)}: sem versão em HEAD")
                continue
            a, b = visible_text(before), visible_text(p.read_text(encoding="utf-8"))
            if a != b:
                bad += 1
                print(f"PARITY FAIL {p.relative_to(ROOT)}")
        print(f"parity: {len(paths) - bad}/{len(paths)} páginas com texto visível idêntico a HEAD")
        return 1 if bad else 0

    changed = 0
    report: dict[str, list[str]] = {}
    bound = approval_bound_pages()
    for p in paths:
        original = p.read_text(encoding="utf-8")
        rel = p.relative_to(ROOT).as_posix()
        if rel in bound:
            report[rel] = ["intacta: aprovação humana vinculada ao hash do HTML (striking-distance-noindex.v1.json)"]
            continue
        new, log = recompose(original)
        if new != original:
            changed += 1
            if not args.check:
                p.write_text(new, encoding="utf-8")
        if log:
            report[p.relative_to(ROOT).as_posix()] = log
    if args.report:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    if args.check:
        print(f"check: {changed} de {len(paths)} páginas mudariam")
        return 1 if changed else 0
    print(f"recompose: {changed} de {len(paths)} páginas alteradas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
