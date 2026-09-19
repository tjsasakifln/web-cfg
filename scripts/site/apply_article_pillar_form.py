#!/usr/bin/env python3
"""Artigos de /conteudos/: o formulário continua no pilar, não na home.

Campanha POS-REDESIGN-FECHAMENTO-20260918, frente artigo (TAREFAS-03).

Os artigos de ``conteudos/*/index.html`` são HTML manual (nenhum gerador os
reescreve; ``seo/scripts/bulk_seo_upgrade.py`` foi um passe único de
2026-07-30). Este script é a transformação idempotente da família:

1. ``Continuar pelo formulário`` deixa de apontar para a home (``/#contato``,
   ``/?…#contato`` ou o ``href="/"`` nu, que nem sequer abre o formulário) e
   passa ao formulário do pilar pertinente (``{pilar}#captura-pilar``).
   ``--check`` reprova enquanto qualquer artigo não congelado tiver esse link
   com destino na home, com ou sem fragmento (``RESIDUAL_FORM_RE``). O pilar
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

Rotas congeladas por hash (canário de medições e irmãs, aprovação ligada a
``material_hash``) não são tocadas por ``--write``; ``--check`` as lista como
pendência. Campanha INBOUND-RECEITA-20260919 (decisão do fundador EXECUTE_NOW,
2026-09-19): ``--write --include-hash-bound`` aplica a mesma transformação a
elas e imprime, por artigo, qual registro precisa de recaptura (o novo sha256
sai junto). Os registros em si não são editados aqui.

Contexto de atribuição (mesma campanha): ``js/modules/nav.js`` só grava
``tema``/``origem``/``jornada`` a partir do ``dataset`` do link clicado. Os
artigos antigos carregavam esse contexto na query da home
(``/?tema=…&origem=…#contato``) sem ``data-*``; trocar só o href perderia o
contexto no pilar. Quando o link não traz ``data-tema``/``data-origem``, a
transformação os deriva (``?tema=`` decodificado do href antigo, senão o H1;
``/conteudos/<slug>/``) e acrescenta ``data-cta-position="form"`` e
``data-journey`` (``?jornada=`` do href antigo, senão ``contrato``) apenas
quando ausentes, no mesmo formato dos artigos já convertidos.

Uso:
    python3 scripts/site/apply_article_pillar_form.py --write
    python3 scripts/site/apply_article_pillar_form.py --write --include-hash-bound
    python3 scripts/site/apply_article_pillar_form.py --check
"""
from __future__ import annotations

import argparse
import hashlib
import html as html_lib
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
ARTICLES = ROOT / "conteudos"
SERVICE_MAP = ROOT / "data/organic/content-service-map.json"
CANARY_CONTRACT = ROOT / "docs/evidence/389-measurement-glosa-canary/canary-contract.json"
STRIKING_DISTANCE = ROOT / "data/editorial/striking-distance-noindex.v1.json"
# Rótulos dos registros que pinam o hash de um artigo (impressos por
# --include-hash-bound para o agente de recaptura).
REG_CANARY = "docs/evidence/389-measurement-glosa-canary/canary-contract.json (canary.after_sha256)"
REG_CANARY_SIBLING = "docs/evidence/389-measurement-glosa-canary/canary-contract.json (frozen_siblings[].sha256)"
REG_STRIKING = "data/editorial/striking-distance-noindex.v1.json (urls[].approval.material_hash)"
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
# Destino cujo caminho canônico é a home: "/", "/?…", "/#contato" e "/?…#contato".
# O href="/" sem fragmento é o pior caso: ``urlAsksForContact`` (nav.js) é
# falso e o visitante pousa no topo da home, não no formulário.
HOME_HREF = r'/(?:\?[^"#]*)?(?:#contato)?'
FORM_LINK_RE = re.compile(
    r'<a class="button button-secondary"(?P<attrs>[^>]*?) href="(?P<href>' + HOME_HREF + r')"'
    r'(?P<tail>[^>]*)>' + re.escape(FORM_LABEL) + r"</a>"
)
# Guarda residual: qualquer link "Continuar pelo formulário" (qualquer classe
# ou ordem de atributos) cujo href resolva para a home, com ou sem fragmento.
RESIDUAL_FORM_RE = re.compile(
    r'<a [^>]*href="/(?:\?[^"#]*)?(?:#[^"]*)?"[^>]*>' + re.escape(FORM_LABEL) + r"</a>"
)
DEFAULT_CTA_POSITION = "form"
DEFAULT_JOURNEY = "contrato"
TEMA_PRINCIPAL_RE = re.compile(r'<strong>Tema principal</strong><a href="(?P<href>/[a-z0-9-]+/)"')
ASIDE_CARD_RE = re.compile(
    r'(<aside class="article-aside"><div class="aside-card">.*?<a class="button button-primary"[^>]*href="https://wa\.me/[^"]*"[^>]*>[^<]*</a>)(?P<existing>(?:<a class="text-link" data-pillar-link="1"[^>]*>.*?</a>)?)(</div>)',
    re.S,
)
WA_HREF_RE = re.compile(r'href="(https://wa\.me/5548988344559\?text=[^"]+)"')


def frozen_reasons() -> dict[str, list[str]]:
    """Artigos com hash congelado e o(s) registro(s) que pinam cada um.

    Autoridades reconhecidas:

    * canário de medições #389 e irmãs (``canary-contract.json``:
      ``canary.after_sha256`` e ``frozen_siblings[].sha256``);
    * aprovação delegada do dono ligada ao ``material_hash`` do HTML
      (``striking-distance-noindex.v1.json``): qualquer byte exige nova
      aprovação com hash, não um agente.

    2026-09-19 (INBOUND-RECEITA-20260919): o par
    ``custos-indiretos-atraso-administracao-obra`` /
    ``jogo-de-planilha-aditivo-obra-publica`` saiu daqui. Entrou em 2026-09-18
    como remendo porque ``--write`` os tocou e quebrou o pin byte a byte de
    ``scripts/organic/tests/test_inb08_owned_routes.py::CLICK_ORIGIN``. Esse
    pin agora mascara as três superfícies da ponte artigo→pilar (link do
    formulário, link do pilar no bloco de oferta, texto do WhatsApp) e continua
    pinando o corpo byte a byte contra ``origin/main``: a ponte de contato não
    é reescrita do guia. Sem hash externo, os dois voltam ao fluxo normal de
    ``--write``; o pin mascarado é a guarda que resta ao corpo deles.
    ``fiscal-nao-assina-medicao-obra-publica`` também está em ``CLICK_ORIGIN``
    e no cluster de medição, mas entra aqui pelo canário #389.
    """
    out: dict[str, list[str]] = {}

    def add(slug: str, reason: str) -> None:
        out.setdefault(slug, []).append(reason)

    contract = json.loads(CANARY_CONTRACT.read_text(encoding="utf-8"))
    canary = contract.get("canary") or {}
    canary_path = canary.get("path") or ""
    if canary_path.startswith("/conteudos/"):
        add(canary_path.strip("/").split("/")[-1], REG_CANARY)
    for sib in contract.get("frozen_siblings") or []:
        p = str(sib.get("path") or "")
        if p.startswith("conteudos/"):
            add(p.split("/")[1], REG_CANARY_SIBLING)
    if STRIKING_DISTANCE.is_file():
        for row in (json.loads(STRIKING_DISTANCE.read_text(encoding="utf-8")).get("urls") or []):
            approval = row.get("approval") or {}
            path = str(row.get("path") or "")
            if approval.get("material_hash") and path.startswith("/conteudos/"):
                add(path.strip("/").split("/")[-1], REG_STRIKING)
    return out


def frozen_articles() -> set[str]:
    """Artigos com hash congelado (ver ``frozen_reasons``). Consumido também por
    ``scripts/site/inbound_first_remediate.article_form_target``."""
    return set(frozen_reasons())


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


def home_form_link(html: str) -> bool:
    """Há link "Continuar pelo formulário" cujo destino é a home (com ou sem #contato)?"""
    return bool(RESIDUAL_FORM_RE.search(html))


def form_target(slug: str, html: str, overrides: dict[str, str]) -> str | None:
    """Destino do formulário do artigo: ``{pilar}#captura-pilar`` ou None.

    Regra única, compartilhada com ``inbound_first_remediate.inject_journey_cta``
    para que ``npm run inbound:remediate`` não devolva o formulário à home.
    """
    pillar = pillar_for(slug, html, overrides)
    if pillar and pillar_has_anchor(pillar):
        return f"{pillar}{PILLAR_ANCHOR}"
    return None


def _attr_present(name: str, *chunks: str) -> bool:
    return any(re.search(rf'(?:^|\s){re.escape(name)}=', c) for c in chunks)


def _derive_context(slug: str, html: str, old_href: str, attrs: str, tail: str) -> tuple[str, str]:
    """Completa o contexto de atribuição do link do formulário quando ausente.

    O href antigo (``/?tema=…&amp;origem=…#contato``) levava o contexto na
    query da home; no pilar ele só chega pelo ``dataset`` do link clicado
    (``js/modules/nav.js``). Ordem dos atributos igual à dos artigos já
    convertidos: ``data-cta-position``/``data-journey`` antes do ``href``,
    ``data-tema``/``data-origem`` depois. Nada presente é reescrito.
    """
    query = parse_qs(urlsplit(html_lib.unescape(old_href)).query)
    if not _attr_present("data-cta-position", attrs, tail):
        attrs += f' data-cta-position="{DEFAULT_CTA_POSITION}"'
    if not _attr_present("data-journey", attrs, tail):
        journey = (query.get("jornada") or [DEFAULT_JOURNEY])[0].strip() or DEFAULT_JOURNEY
        attrs += f' data-journey="{html_lib.escape(journey, quote=True)}"'
    if not _attr_present("data-tema", attrs, tail):
        tema = (query.get("tema") or [""])[0].strip() or article_h1(html)
        if tema:
            tail += f' data-tema="{html_lib.escape(tema, quote=True)}"'
    if not _attr_present("data-origem", attrs, tail):
        tail += f' data-origem="/conteudos/{slug}/"'
    return attrs, tail


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
            target = form_target(slug, out, overrides)
            assert target is not None

            def _repl(m: re.Match[str]) -> str:
                attrs = m.group("attrs")
                tail = m.group("tail")
                attrs, tail = _derive_context(slug, out, m.group("href"), attrs, tail)
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


def run(write: bool, include_hash_bound: bool = False) -> int:
    overrides, labels = service_map()
    reasons = frozen_reasons()
    changed: list[str] = []
    pending: list[str] = []
    residual: list[str] = []
    recapture: list[str] = []
    for page in sorted(ARTICLES.glob("*/index.html")):
        slug = page.parent.name
        html = page.read_text(encoding="utf-8")
        hash_bound = slug in reasons
        if hash_bound and not (write and include_hash_bound):
            if home_form_link(html):
                pending.append(f"{slug}: congelado por hash (canário #389 ou aprovação hash-bound); ainda envia o formulário à home")
            continue
        new, notes = transform(slug, html, overrides, labels)
        for n in notes:
            pending.append(f"{slug}: {n}")
        if new != html:
            changed.append(slug)
            if write:
                page.write_text(new, encoding="utf-8")
            if hash_bound:
                digest = hashlib.sha256(new.encode("utf-8")).hexdigest()
                recapture.append(f"{slug}: sha256 novo {digest}; recapturar em: " + "; ".join(reasons[slug]))
        if home_form_link(new):
            residual.append(slug)
    mode = "write" if write else "check"
    print(f"[{mode}] artigos alterados: {len(changed)}")
    for p in pending:
        print(f"  pendência: {p}")
    for r in recapture:
        print(f"  recaptura obrigatória: {r}")
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
    ap.add_argument(
        "--include-hash-bound",
        action="store_true",
        help="com --write: transforma também os artigos congelados por hash e imprime a obrigação de recaptura",
    )
    a = ap.parse_args(argv)
    if a.include_hash_bound and not a.write:
        ap.error("--include-hash-bound só vale com --write")
    return run(write=a.write, include_hash_bound=a.include_hash_bound)


if __name__ == "__main__":
    sys.exit(main())
