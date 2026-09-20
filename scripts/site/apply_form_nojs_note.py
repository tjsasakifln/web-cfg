#!/usr/bin/env python3
"""Nota sem JavaScript em todo formulário de captura do site.

Campanha CONFENGE-INBOUND-RECEITA-E-PRODUCAO-20260919 (W6-ops-web).

O formulário compartilhado só envia, devolve protocolo e evita duplicidade com
o runtime carregado (``js/modules/form.js`` via ``script.js``). Sem
JavaScript, o navegador faz um POST nativo para a função e o visitante não
recebe recibo. A home já explica isso (``index.html``, ``class="form-nojs-note"``,
alternada por ``html.no-js``/``html.js``). As demais páginas com formulário de
captura não explicavam nada.

Este aplicador insere, em cada formulário de captura sem a nota, o mesmo aviso
dentro de ``<noscript>`` (só aparece sem JavaScript e não depende de CSS por
rota), reaproveitando o componente ``form-hint`` da própria página e os canais
que ela já publica (primeiro ``wa.me`` e primeiro ``mailto:`` encontrados; sem
eles, os canais canônicos de ``data/site/brand.json``).

Fora do escopo, sempre: páginas presas por hash (``font_preload.hash_bound_pages``
e ``BYTE_PINNED_ARTICLES``), ``/piloto/*``, ``/nurture/`` e a home (fonte do
padrão; pertence ao integrador). Desde 2026-09-19 (BOFU-FECHAMENTO), os
formulários gerados recebem a mesma nota pelo normalizador comum
``scripts/commercial/render_cta_form_next_state.mjs``; aqui só se verifica que
nenhum formulário de captura ficou sem ela.

Uso:
  python3 scripts/site/apply_form_nojs_note.py --check   # lista o que mudaria; sai 1 se houver pendência
  python3 scripts/site/apply_form_nojs_note.py --write   # aplica (idempotente)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.font_preload import BYTE_PINNED_ARTICLES, hash_bound_pages  # noqa: E402
from scripts.site.public_copy_scope import visitor_facing_html_files  # noqa: E402

NOTE_CLASS = "form-nojs-note"
NOTE_TEXT_BEFORE = "Sem JavaScript, este formulário não envia. Use o "
NOTE_TEXT_MIDDLE = " ou o "
NOTE_TEXT_AFTER = " ao lado."
WA_LABEL = "WhatsApp"
MAIL_LABEL = "e-mail"

DEFAULT_WA_NUMBER = "5548988344559"
DEFAULT_EMAIL = "tiago.sasaki@confenge.com.br"
# Situação genérica, sem dado pessoal: a mesma frase que a home publica.
DEFAULT_WA_TEXT = (
    "Ol%C3%A1%2C%20Tiago.%20Quero%20explicar%20uma%20situa%C3%A7%C3%A3o%20"
    "t%C3%A9cnica%20e%20entender%20o%20pr%C3%B3ximo%20passo."
)

EXCLUDED_PREFIXES = ("piloto/", "nurture/")
EXCLUDED_EXACT = frozenset({"index.html"})
# BOFU-FECHAMENTO-20260919 (CONTEXTO-CAPTURA-05): os formulários gerados
# (servicos-obras-publicas, diagnostico-pre-licitacao, diagnostico-b2g-expansao,
# entregas, analise-cnpj e /r/, casos/modelo-*) recebem a nota pelo normalizador
# comum ``scripts/commercial/render_cta_form_next_state.mjs`` (fonte única:
# ``scripts/commercial/form_nojs_note.mjs``, também usada por
# ``render_contract_defense_products.mjs``). Nenhuma exceção de gerador resta:
# este ``--check`` cobre todos os formulários de captura fora das páginas presas
# por hash, e roda em ``npm run test:cta-form-next-state``.
GENERATOR_OWNED: frozenset[str] = frozenset()
GENERATOR_OWNED_PREFIXES: tuple[str, ...] = ()

FORM_OPEN_RE = re.compile(r"<form\b[^>]*>", re.IGNORECASE)
FORM_CLOSE_RE = re.compile(r"</form\s*>", re.IGNORECASE)
CAPTURE_MARKERS = (
    'action="/.netlify/functions/lead"',
    "/api/web/lead",
    "data-capture-form",
)
WA_HREF_RE = re.compile(r'href="(https://wa\.me/[^"]+)"')
MAILTO_HREF_RE = re.compile(r'href="(mailto:[^"]+)"')
FIELDSET_OPEN_RE = re.compile(r"\s*<fieldset\b[^>]*>", re.IGNORECASE)
HINT_OPEN_RE = re.compile(r'\s*<p class="form-hint"[^>]*>', re.IGNORECASE)


def _brand_channels() -> tuple[str, str]:
    """Canais canônicos: número do WhatsApp e e-mail publicados em brand.json."""
    number, email = DEFAULT_WA_NUMBER, DEFAULT_EMAIL
    try:
        data = json.loads((ROOT / "data" / "site" / "brand.json").read_text(encoding="utf-8"))
        contact = data.get("contact") or data
        number = str(contact.get("whatsapp_number") or number)
        email = str(contact.get("email") or email)
    except Exception:  # noqa: BLE001 — sem brand.json, os canais publicados na home valem
        pass
    return number, email


def is_capture_form(open_tag: str) -> bool:
    return any(marker in open_tag for marker in CAPTURE_MARKERS)


def page_channels(html: str) -> tuple[str, str]:
    """Primeiro wa.me e primeiro mailto da página; canônicos quando ausentes."""
    number, email = _brand_channels()
    wa = WA_HREF_RE.search(html)
    mail = MAILTO_HREF_RE.search(html)
    wa_href = wa.group(1) if wa else f"https://wa.me/{number}?text={DEFAULT_WA_TEXT}"
    mail_href = mail.group(1) if mail else f"mailto:{email}"
    return wa_href, mail_href


def build_note(wa_href: str, mail_href: str) -> str:
    return (
        f'<noscript><p class="form-hint {NOTE_CLASS}">{NOTE_TEXT_BEFORE}'
        f'<a href="{wa_href}">{WA_LABEL}</a>{NOTE_TEXT_MIDDLE}'
        f'<a href="{mail_href}">{MAIL_LABEL}</a>{NOTE_TEXT_AFTER}</p></noscript>'
    )


def _insertion_offset(html: str, body_start: int) -> int:
    """Depois do ``<fieldset>`` de abertura ou do primeiro ``form-hint``; senão, logo após ``<form>``."""
    for pattern in (FIELDSET_OPEN_RE, HINT_OPEN_RE):
        m = pattern.match(html, body_start)
        if not m:
            continue
        if pattern is HINT_OPEN_RE:
            close = html.find("</p>", m.end())
            return close + len("</p>") if close >= 0 else m.end()
        return m.end()
    return body_start


def transform(html: str) -> str:
    """Insere a nota em cada formulário de captura que ainda não a tem. Idempotente."""
    out: list[str] = []
    pos = 0
    wa_href, mail_href = page_channels(html)
    note = build_note(wa_href, mail_href)
    for m in FORM_OPEN_RE.finditer(html):
        if m.start() < pos:
            continue
        close = FORM_CLOSE_RE.search(html, m.end())
        end = close.start() if close else len(html)
        body = html[m.end():end]
        if not is_capture_form(m.group(0)) or NOTE_CLASS in body:
            continue
        offset = _insertion_offset(html, m.end())
        out.append(html[pos:offset])
        out.append("\n" + note)
        pos = offset
    out.append(html[pos:])
    return "".join(out)


def excluded(rel: str, bound: set[str] | None = None) -> bool:
    bound = hash_bound_pages() | set(BYTE_PINNED_ARTICLES) if bound is None else bound
    if rel in bound or rel in EXCLUDED_EXACT or rel in GENERATOR_OWNED:
        return True
    return rel.startswith(EXCLUDED_PREFIXES) or rel.startswith(GENERATOR_OWNED_PREFIXES)


def candidate_files(root: Path | None = None) -> list[tuple[str, Path]]:
    base = root or ROOT
    bound = hash_bound_pages() | set(BYTE_PINNED_ARTICLES)
    out: list[tuple[str, Path]] = []
    for path in visitor_facing_html_files(base):
        rel = path.relative_to(base).as_posix()
        if excluded(rel, bound):
            continue
        out.append((rel, path))
    return out


def pending_changes(root: Path | None = None) -> list[tuple[str, Path, str]]:
    changes: list[tuple[str, Path, str]] = []
    for rel, path in candidate_files(root):
        html = path.read_text(encoding="utf-8")
        if not FORM_OPEN_RE.search(html):
            continue
        new = transform(html)
        if new != html:
            changes.append((rel, path, new))
    return changes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="lista os arquivos que mudariam; sai 1 se houver algum")
    mode.add_argument("--write", action="store_true", help="grava a nota nos arquivos pendentes")
    ap.add_argument("--root", type=Path, default=None, help="raiz alternativa (testes)")
    args = ap.parse_args(argv)

    changes = pending_changes(args.root)
    if not changes:
        print("form-nojs-note: nada a mudar")
        return 0
    for rel, path, new in changes:
        if args.write:
            path.write_text(new, encoding="utf-8")
            print(f"form-nojs-note: gravado {rel}")
        else:
            print(f"form-nojs-note: mudaria {rel}")
    if args.write:
        return 0
    print(f"form-nojs-note: {len(changes)} arquivo(s) pendente(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
