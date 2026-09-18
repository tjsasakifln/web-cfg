#!/usr/bin/env python3
"""Artigos de /conteudos/: o formulário continua no pilar, não na home.

Campanha POS-REDESIGN-FECHAMENTO-20260918, frente artigo (TAREFAS-03).

Os artigos de ``conteudos/*/index.html`` são HTML manual (nenhum gerador os
reescreve; ``seo/scripts/bulk_seo_upgrade.py`` foi um passe único de
2026-07-30). Este script é a transformação idempotente da família:

1. ``Continuar pelo formulário`` deixa de apontar para ``/#contato`` (home) e
   passa ao formulário do pilar pertinente (``{pilar}#captura-pilar``). O pilar
   é o do "Tema principal" do próprio artigo; quando o artigo não traz esse
   bloco, vale ``data/organic/content-service-map.json`` (``path_overrides``,
   somente leitura: o arquivo é hash congelado). Os atributos ``data-tema`` e
   ``data-origem`` permanecem: ``js/modules/nav.js`` lê o ``dataset`` do link
   no clique (fase de captura) e grava ``tema``/``origem`` na atribuição de
   sessão; no pilar, ``tema`` entra como campo oculto e pré-preenche a
   ``textarea#mensagem``; ``landing_page`` é forçado com a ``landing_url`` do
   artigo e ``referrer`` também chega. O campo oculto ``origem`` do pilar já é
   pré-renderizado com o slug do pilar e ``ensureHidden`` só grava quando o
   campo está vazio: a origem do artigo chega em ``landing_page``/``tema``,
   não em ``origem`` (mesma causa raiz de TAREFAS-01; fora desta frente).
2. O link do pilar entra no bloco de oferta (primeiro ``aside-card`` do
   ``article-aside``), com o rótulo do cluster do mapa de serviços.
3. O texto pré-preenchido genérico do WhatsApp (``Gostaria de analisar um caso
   de <slug de palavra-chave> (licitação, contrato ou obra pública).``) vira
   frase natural com o título do artigo. Mensagens escritas à mão ficam.

Rotas congeladas por hash (canário de medições e irmãs) nunca são tocadas.

Uso:
    python3 scripts/site/apply_article_pillar_form.py --write
    python3 scripts/site/apply_article_pillar_form.py --check
"""
from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, unquote

ROOT = Path(__file__).resolve().parents[2]
ARTICLES = ROOT / "conteudos"
SERVICE_MAP = ROOT / "data/organic/content-service-map.json"
CANARY_CONTRACT = ROOT / "docs/evidence/389-measurement-glosa-canary/canary-contract.json"
WA_BASE = "https://wa.me/5548988344559"

PILLAR_ANCHOR = "#captura-pilar"
FORM_LABEL = "Continuar pelo formulário"
GENERIC_WA_RE = re.compile(
    r"^Olá, Tiago\. Gostaria de analisar um caso de (?P<topic>.+?) "
    r"\(licitação, contrato ou obra pública\)\.$"
)
# Rótulo do link do pilar quando o serviço não pertence a um cluster do mapa.
PILLAR_LABEL_FALLBACK = {
    "/acompanhamento-contratos-obras/": "Ver serviço de acompanhamento de contratos",
}
FORM_LINK_RE = re.compile(
    r'<a class="button button-secondary"(?P<attrs>[^>]*?) href="(?P<href>/(?:\?[^"]*)?#contato)"'
    r'(?P<tail>[^>]*)>' + re.escape(FORM_LABEL) + r"</a>"
)
TEMA_PRINCIPAL_RE = re.compile(r'<strong>Tema principal</strong><a href="(?P<href>/[a-z0-9-]+/)"')
ASIDE_CARD_RE = re.compile(
    r'(<aside class="article-aside"><div class="aside-card">.*?<a class="button button-primary"[^>]*href="https://wa\.me/[^"]*"[^>]*>[^<]*</a>)(?P<existing>(?:<a class="text-link" data-pillar-link="1"[^>]*>.*?</a>)?)(</div>)',
    re.S,
)
WA_HREF_RE = re.compile(r'href="(https://wa\.me/5548988344559\?text=[^"]+)"')


def frozen_articles() -> set[str]:
    """Artigos com hash congelado: canário de medições e irmãs (issue #389)."""
    contract = json.loads(CANARY_CONTRACT.read_text(encoding="utf-8"))
    out: set[str] = set()
    canary = contract.get("canary") or {}
    canary_path = canary.get("path") or ""
    if canary_path.startswith("/conteudos/"):
        out.add(canary_path.strip("/").split("/")[-1])
    for sib in contract.get("frozen_siblings") or []:
        p = str(sib.get("path") or "")
        if p.startswith("conteudos/"):
            out.add(p.split("/")[1])
    return out


def service_map() -> tuple[dict[str, str], dict[str, str]]:
    doc = json.loads(SERVICE_MAP.read_text(encoding="utf-8"))
    by_cluster = {c["id"]: c["service_path"] for c in doc["clusters"]}
    labels = {c["service_path"]: c["cta_label"] for c in doc["clusters"]}
    overrides = {path: by_cluster[cid] for path, cid in doc.get("path_overrides", {}).items()}
    return overrides, labels


def article_h1(html: str) -> str:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    if not m:
        return ""
    return html_lib.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()


def pillar_for(slug: str, html: str, overrides: dict[str, str]) -> str | None:
    m = TEMA_PRINCIPAL_RE.search(html)
    if m:
        return m.group("href")
    return overrides.get(f"/conteudos/{slug}/")


def pillar_has_anchor(pillar: str) -> bool:
    page = ROOT / pillar.strip("/") / "index.html"
    if not page.is_file():
        return False
    text = page.read_text(encoding="utf-8")
    return f'id="{PILLAR_ANCHOR[1:]}"' in text and 'name="diagnostico-confenge"' in text


def natural_wa_message(h1: str) -> str:
    title = h1.rstrip(" .:")
    return f'Olá, Tiago. Li o artigo "{title}" e quero analisar um caso.'


def transform(slug: str, html: str, overrides: dict[str, str], labels: dict[str, str]) -> tuple[str, list[str]]:
    """Devolve (html transformado, pendências). Idempotente."""
    notes: list[str] = []
    pillar = pillar_for(slug, html, overrides)
    out = html

    # 1. formulário do pilar
    if FORM_LINK_RE.search(out):
        if not pillar:
            notes.append("sem pilar (Tema principal/path_overrides): link ao formulário mantido")
        elif not pillar_has_anchor(pillar):
            notes.append(f"pilar {pillar} sem {PILLAR_ANCHOR}: link ao formulário mantido")
        else:
            target = f"{pillar}{PILLAR_ANCHOR}"

            def _repl(m: re.Match[str]) -> str:
                attrs = m.group("attrs")
                tail = m.group("tail")
                return f'<a class="button button-secondary"{attrs} href="{target}"{tail}>{FORM_LABEL}</a>'

            out = FORM_LINK_RE.sub(_repl, out)

    # 2. link do pilar no bloco de oferta
    if pillar and pillar_has_anchor(pillar):
        label = labels.get(pillar) or PILLAR_LABEL_FALLBACK.get(pillar)
        if not label:
            notes.append(f"pilar {pillar} sem rótulo conhecido: link de oferta não inserido")
        else:
            link = (
                f'<a class="text-link" data-pillar-link="1" href="{pillar}">{html_lib.escape(label)} '
                '<svg class="icon"><use href="#i-arrow"></use></svg></a>'
            )

            def _aside(m: re.Match[str]) -> str:
                return f"{m.group(1)}{link}{m.group(3)}"

            out, n = ASIDE_CARD_RE.subn(_aside, out, count=1)
            if n == 0:
                notes.append("bloco de oferta (aside-card) não reconhecido: link do pilar não inserido")

    # 3. WhatsApp em frase natural
    h1 = article_h1(out)
    if h1:
        natural = natural_wa_message(h1)
        new_href = f"{WA_BASE}?text={quote(natural)}"

        def _wa(m: re.Match[str]) -> str:
            href = m.group(1)
            text = unquote(href.split("text=", 1)[1])
            if GENERIC_WA_RE.match(text):
                return f'href="{new_href}"'
            return m.group(0)

        out = WA_HREF_RE.sub(_wa, out)
    return out, notes


def run(write: bool) -> int:
    overrides, labels = service_map()
    frozen = frozen_articles()
    changed: list[str] = []
    pending: list[str] = []
    residual: list[str] = []
    for page in sorted(ARTICLES.glob("*/index.html")):
        slug = page.parent.name
        html = page.read_text(encoding="utf-8")
        if slug in frozen:
            if FORM_LINK_RE.search(html):
                pending.append(f"{slug}: congelado por hash (canário #389); ainda envia o formulário à home")
            continue
        new, notes = transform(slug, html, overrides, labels)
        for n in notes:
            pending.append(f"{slug}: {n}")
        if new != html:
            changed.append(slug)
            if write:
                page.write_text(new, encoding="utf-8")
        if FORM_LINK_RE.search(new):
            residual.append(slug)
    mode = "write" if write else "check"
    print(f"[{mode}] artigos alterados: {len(changed)}")
    for p in pending:
        print(f"  pendência: {p}")
    if not write and changed:
        print("  desatualizados: " + ", ".join(changed))
        print("  rode: python3 scripts/site/apply_article_pillar_form.py --write")
        return 1
    if residual:
        print("  ainda apontam ao formulário da home: " + ", ".join(residual))
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--write", action="store_true")
    g.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    return run(write=a.write)


if __name__ == "__main__":
    sys.exit(main())
