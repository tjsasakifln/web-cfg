"""Retire every remaining /correcoes/ link from shipped chrome and prose.

/correcoes/ was a standalone bureaucratic page. It was retired: the file was
deleted, redirected in `_redirects`, and dropped from the sitemaps and the
family registry. Its useful function (a place to report an error) now lives
on the contact page at the canonical anchor exported by
`scripts.site.authority`: `CORRECTION_CHANNEL_HREF`
(`/triagem-tecnica/#corrigir-o-site`).

This module used to walk a hardcoded list of ~20 pages. That list only ever
grows stale: every page shipped after it was written kept the dead link with
no signal. The page set is now *derived* from the repository — every shipped
HTML file, via `scripts.site.shell_nav.shipped_html_files()` — the same
enumeration `shell_nav.py` itself uses to keep chrome in sync. Reusing it
means the two writers can never disagree about what "shipped" means, and it
already excludes the BOFU pillar pages frozen by
`data/bofu-dominance/frozen-specs/hashes.json` (campaign
CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01, `FROZEN_SHELL_FILES`) — exactly the
set this rewrite must not touch.

One additional skip this module owns on top of that: anything under
`politica-editorial/v/` is a frozen historical policy-version archive. Its
text, including any /correcoes/ mention describing what the policy said when
it was current, must stay byte-for-byte. Rewriting it would falsify the
record of what was actually published.

Four families of markup carry the dead route:
  1. The `authority-byline` "who owns this page" line (varies in link label:
     "Pedir correção", "Como corrigir", "Como corrigir ou contestar", etc.).
  2. The `authority-policy-nav` inline policy links (confianca-style pages).
  3. The `footer-authority` nav repeated on ~every shipped page.
  4. Body prose that explained the retired page's SLA/receipt mechanics.
     Several distinct sentences exist; each is normalized to point at the
     live channel without inventing a deadline that was never measured.

A fifth family is a stale build artifact, not hand-authored duplication:
five `analises-contratos-publicos/*` fixture pages predate a since-migrated
`scripts/contract_analysis/render.py` (it already emits
`CORRECTION_CHANNEL_HREF`). A sibling page in the same directory
(`reajuste-incc-coluna-35-.../index.html`) already carries the regenerated
text, so those exact strings are copied here verbatim rather than invented.

Usage:
    python3 scripts/site/patch_authority_footers.py --check
    python3 scripts/site/patch_authority_footers.py --write
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.authority import (  # noqa: E402
    CORRECTION_CHANNEL_HREF,
    FOOTER_AUTHORITY_NAV,
)
from scripts.site.shell_nav import shipped_html_files  # noqa: E402

DEAD_ROUTE = "/correcoes/"

# The frozen historical policy-version archive. Byte-for-byte, forever.
FROZEN_ARCHIVE_PREFIX = "politica-editorial/v/"

# Generated data-desk citation-kit output (scripts/data_desk/publish.py), not
# hand-authored chrome. Its /correcoes/ mention is an absolute URL inside a
# different anchor shape ("Correção: <a ...>https://.../correcoes/</a>"), and
# its bytes are bound to a pinned rendered_content_hash
# (scripts/data_desk/bind.py raises rendered_content_hash_drift on any
# change). Only a coordinated regeneration of that package can fix it.
DATA_DESK_ASSET_PREFIX = "assets/data-desk/"

# ---------------------------------------------------------------------------
# Ordered rewrite rules. Order matters: sentence- and section-level rewrites
# run before the generic label-preserving href swap, so a whole sentence is
# replaced once rather than leaving a partially-patched fragment behind.
# ---------------------------------------------------------------------------

# Pattern 4 (confianca/index.html): body prose that promised a receipt,
# protocol and measured SLA for a page that no longer exists. Rewritten, not
# link-swapped: nothing here was ever measured, so no deadline is promised.
_CONFIANCA_PROSE_RE = re.compile(
    r"<p>Encontrou um erro de fato, de credencial, de cálculo ou de fonte "
    r"nesta página\? Escreva pelo canal de "
    r'<a href="/correcoes/">Correções</a>\. Todo pedido recebe um '
    r"recibo com protocolo, que comprova a entrada\. Os prazos de acuse e de "
    r"publicação são os descritos na página de "
    r"Correções\.</p>"
)
_CONFIANCA_PROSE_REPLACEMENT = (
    "<p>Encontrou um erro de fato, de credencial, de cálculo ou de fonte "
    "nesta página? "
    f'<a href="{CORRECTION_CHANNEL_HREF}">Envie o link da página e explique '
    "o que precisa ser corrigido</a>.</p>"
)

# Stale contract-analysis fixture output (see module docstring). The
# replacement text is copied verbatim from
# analises-contratos-publicos/reajuste-incc-coluna-35-.../index.html, the
# sibling page the migrated generator already re-rendered.
_CA_RELATED_LI_RE = re.compile(
    r'<li><a href="/correcoes/">Como corrigir ou contestar</a></li>'
)
_CA_SECTION_RE = re.compile(
    r"<h2>Correção e contestação</h2><p>Erro material, "
    r"contestação de fato público ou pedido de correção "
    r'segue a <a href="/correcoes/">política pública de '
    r'correções</a> e a <a href="/politica-editorial/">política '
    r"editorial</a>\.</p>"
)
_CA_SECTION_REPLACEMENT = (
    "<h2>Correção e contestação</h2><p>Encontrou um erro ou "
    "quer contestar um fato público desta análise? "
    f'<a href="{CORRECTION_CHANNEL_HREF}">Fale com a gente</a>, seguindo a '
    '<a href="/politica-editorial/">política editorial</a>.</p>'
)
_CA_BYLINE_RE = re.compile(r'<a href="/correcoes/">Como corrigir ou contestar</a>')
_CA_BYLINE_REPLACEMENT = (
    f'<a href="{CORRECTION_CHANNEL_HREF}">Encontrou um erro nesta página?</a>'
)

# A literal dead URL used as its own link text ("Correção: /correcoes/").
# Swapping only the href would leave a visitor staring at a path that no
# longer resolves the way it reads, so the label is replaced too.
_LITERAL_URL_ANCHOR_RE = re.compile(r'<a href="/correcoes/">/correcoes/</a>')
_LITERAL_URL_ANCHOR_REPLACEMENT = (
    f'<a href="{CORRECTION_CHANNEL_HREF}">Encontrou um erro? Fale com a gente</a>'
)

# Pattern 1 (byline) and the standalone "Pedir correção" link on the
# specialist page: plain Portuguese, no promise.
_PEDIR_CORRECAO_RE = re.compile(r'<a href="/correcoes/">Pedir correção</a>')
_PEDIR_CORRECAO_REPLACEMENT = f'<a href="{CORRECTION_CHANNEL_HREF}">Encontrou um erro?</a>'

# Pattern 2 (authority-policy-nav) and pattern 3 (footer-authority nav) both
# repeat this exact anchor as one extra nav entry. Dropping it matches
# FOOTER_AUTHORITY_NAV, which no longer lists a Correções entry.
_NAV_CORRECOES_ENTRY_RE = re.compile(r'<a href="/correcoes/">Correções</a>')

# Generic label-preserving fallback: whatever anchor text remains (e.g.
# "Como corrigir", "Contestar ou pedir correção", "rota de correção" with a
# data-asset-id attribute) is already plain language with no invented
# promise, so only the href needs to move to the live channel.
_GENERIC_HREF_RE = re.compile(r'href="/correcoes/"')

_RULES: list[tuple[re.Pattern[str], str]] = [
    (_CONFIANCA_PROSE_RE, _CONFIANCA_PROSE_REPLACEMENT),
    (_CA_RELATED_LI_RE, ""),
    (_CA_SECTION_RE, _CA_SECTION_REPLACEMENT),
    (_CA_BYLINE_RE, _CA_BYLINE_REPLACEMENT),
    (_LITERAL_URL_ANCHOR_RE, _LITERAL_URL_ANCHOR_REPLACEMENT),
    (_PEDIR_CORRECAO_RE, _PEDIR_CORRECAO_REPLACEMENT),
    (_NAV_CORRECOES_ENTRY_RE, ""),
    (_GENERIC_HREF_RE, f'href="{CORRECTION_CHANNEL_HREF}"'),
]


def is_frozen_archive(rel: str) -> bool:
    return rel.startswith(FROZEN_ARCHIVE_PREFIX)


def is_data_desk_asset(rel: str) -> bool:
    return rel.startswith(DATA_DESK_ASSET_PREFIX)


_FOOTER_NAV_RE = re.compile(
    r'<nav class="footer-authority"[^>]*>.*?</nav>', re.S
)


def sync_text(text: str) -> str:
    """Idempotently sync one page's chrome to the canonical authority footer.

    Retirar a rota morta nao basta: quando a entrada de correcao saiu do rodape
    e nada entrou no lugar, 38 paginas ficaram SEM caminho de correcao nenhum e
    o gate nao viu, porque so verificava ausencia. Aqui o rodape inteiro passa a
    ser reescrito a partir de FOOTER_AUTHORITY_NAV, que e a fonte unica.
    """
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    text = _FOOTER_NAV_RE.sub(lambda _m: FOOTER_AUTHORITY_NAV, text)
    return text


def candidate_files() -> list[Path]:
    """Shipped HTML in scope: every page shell_nav ships, minus the frozen archive.

    shell_nav.shipped_html_files() already excludes the BOFU pillar pages
    frozen until 2026-09-16 (FROZEN_SHELL_FILES) and every non-visitor tree
    (data/, scripts/, docs/, tests/, ...). politica-editorial/v/ is this
    module's own exclusion: a frozen historical archive, not live chrome.
    """
    out = []
    for path in shipped_html_files():
        rel = path.relative_to(ROOT).as_posix()
        if is_frozen_archive(rel) or is_data_desk_asset(rel):
            continue
        out.append(path)
    return out


def run(write: bool) -> int:
    offenders: list[str] = []
    changed: list[str] = []
    misses: list[str] = []
    for path in candidate_files():
        rel = path.relative_to(ROOT).as_posix()
        original = path.read_text(encoding="utf-8")
        updated = sync_text(original)
        if updated == original:
            continue
        if DEAD_ROUTE in updated:
            misses.append(rel)
            print("MISS", rel, "(retired route survives every rule)")
            continue
        offenders.append(rel)
        if write:
            path.write_text(updated, encoding="utf-8")
            print("patched", rel)
        else:
            print("would patch", rel)
        changed.append(rel)

    if misses:
        print(f"unresolved={len(misses)}")
        return 1

    if write:
        print(f"changed={len(changed)}")
        return 0

    if offenders:
        print(f"FAIL {len(offenders)} shipped file(s) still link the retired /correcoes/ route:")
        for rel in offenders:
            print("  ", rel)
        print("  run: python3 scripts/site/patch_authority_footers.py --write")
        return 1

    # Verificacao POSITIVA: toda pagina cujo contrato exige caminho de correcao
    # precisa oferecer o canal. Sem isto, apagar a entrada do rodape "passa".
    from scripts.site.authority import (
        classify_surface,
        has_correction_link,
        load_matrix,
        CORRECTION_CHANNEL_HREF,
    )

    matrix = load_matrix()
    missing: list[str] = []
    for path in candidate_files():
        rel = path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8")
        kind = classify_surface("/" + rel, html)
        spec = (matrix.get("types") or {}).get(kind) or {}
        if str(spec.get("correction_link") or "").lower() != "required":
            continue
        if not has_correction_link(html):
            missing.append(f"{rel} ({kind})")
    if missing:
        print(f"FAIL {len(missing)} page(s) require a correction path and offer none:")
        for rel in missing:
            print("  ", rel)
        print(f"  every one must carry {CORRECTION_CHANNEL_HREF}")
        return 1

    print("PASS retired route gone, and every page that must offer a correction path does")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    return run(write=bool(args.write))


if __name__ == "__main__":
    raise SystemExit(main())
