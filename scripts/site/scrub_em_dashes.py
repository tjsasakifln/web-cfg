#!/usr/bin/env python3
"""Surgical removal of em-dashes (travessões) from public CONFENGE prose.

Policy (aligned with docs/COPY-FINAL-REVIEW.md and AI-COPY-REWRITES.md):
- CONFENGE visitor-facing copy must not use U+2014 (—).
- Official source titles (Planalto/TCU/AGU/CAIXA/Compras.gov) may keep —.
- Missing-data placeholders use "n/d", not —.

CLI:
  python3 scripts/site/scrub_em_dashes.py --check
  python3 scripts/site/scrub_em_dashes.py --write
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EM = "\u2014"  # —
MIDDOT = "\u00b7"  # ·

# Source-title prefixes we never rewrite (external citations).
OFFICIAL_SOURCE_RE = re.compile(
    r"\b("
    r"Planalto|TCU|AGU|CAIXA|Compras\.gov(?:\.br)?"
    r"|Senado|Câmara|Camara|STF|STJ|CNJ|CGU|PNCP"
    r"|Ministério|Ministerio|SEAP|INSS|IBGE"
    r"|Lei\s+n[ºo°.]?\s*\d+"  # Lei nº 14.133/2021 — art. …
    r"|Decreto\s+n[ºo°.]?\s*\d+"
    r")\s*" + EM + r"\s*",
    re.I,
)

# Protect official source titles during scrub (restore after).
_PROTECT_TOKEN = "\u0000SRC{0}\u0000"

# UF / short labels after em-dash: "… públicas — PR"
UF_AFTER_EM = re.compile(
    EM + r"\s*([A-Z]{2})\b"
)

# Long region after title: "… públicas — Santa Catarina" / "— Parana"
REGION_AFTER_EM = re.compile(
    EM + r"\s*("
    r"Paran[aá]|Santa Catarina|Rio Grande do Sul|S[aã]o Paulo|"
    r"Rio de Janeiro|Minas Gerais|Bahia|Goi[aá]s|Pernambuco|"
    r"Cear[aá]|Par[aá]|Amazonas|Distrito Federal|"
    r"obras e margem|recorte aberto"
    r")\b",
    re.I,
)

# Parenthetical pair: "empresa — capacidade, acervo — para"
PAREN_PAIR = re.compile(
    EM + r"\s*([^" + EM + r"]{2,120}?)\s*" + EM + r"(?=\s)"
)

# Contrast / afterthought: "X — não Y", "X — sem Y", "X — mas Y"
CONTRAST = re.compile(
    EM + r"\s*(n[aã]o|sem|mas|porque|pois|quando|onde|com|como|ainda|mesmo|exceto)\b",
    re.I,
)

# "Página evergreen — não é" style label: word — clause
LABEL_COLON = re.compile(
    r"\b(evergreen|Metodologia|Margem|Leitura comercial|entidade legada|"
    r"An[aá]lise inicial|Wave \d+|Hist[oó]rico de contratos|"
    r"Radar Nacional de Obras P[uú]blicas e Margem Contratual)"
    r"\s*" + EM + r"\s*",
    re.I,
)

# Generic remaining spaced em-dash
SPACED_EM = re.compile(r"\s*" + EM + r"\s*")

# Alone as table/missing placeholder
ALONE_EM = re.compile(r"(?<=>)\s*" + EM + r"\s*(?=<)")
JSON_ALONE_EM = re.compile(r'(:\s*")' + EM + r'(")')

# Chrome RSS / brand titles
CHROME = (
    (f"CONFENGE {EM} Conteúdos", f"CONFENGE {MIDDOT} Conteúdos"),
    (f"CONFENGE {EM} Conteudos", f"CONFENGE {MIDDOT} Conteudos"),
)

# High-frequency AI templates (exact / near-exact)
TEMPLATE_SUBS: list[tuple[str, str]] = [
    (
        f"Delimite o problema {EM} valor, período, serviço afetado, decisão necessária e "
        f"responsável {EM} antes de discutir",
        "Delimite o problema (valor, período, serviço afetado, decisão necessária e "
        "responsável) antes de discutir",
    ),
    (
        f"próximos passos {EM} sem cadastro em lista",
        "próximos passos, sem cadastro em lista",
    ),
    (
        f"proximos passos {EM} sem cadastro em lista",
        "proximos passos, sem cadastro em lista",
    ),
    (
        f"enquadramento técnico {EM} sem promessa de resultado",
        "enquadramento técnico, sem promessa de resultado",
    ),
    (
        f"enquadramento tecnico {EM} sem promessa de resultado",
        "enquadramento tecnico, sem promessa de resultado",
    ),
    (
        f"quantificação do impacto {EM} não de narrativa genérica",
        "quantificação do impacto, não de narrativa genérica",
    ),
    (
        f"quantificacao do impacto {EM} nao de narrativa generica",
        "quantificacao do impacto, nao de narrativa generica",
    ),
    (
        f"Página evergreen {EM} não é URL por edital",
        "Página evergreen: não é URL por edital",
    ),
    (
        f"Página evergreen {EM} não é URL por…",
        "Página evergreen: não é URL por…",
    ),
    (
        f"Página evergreen {EM} não é URL por",
        "Página evergreen: não é URL por",
    ),
]


def is_official_source_title(text: str) -> bool:
    """True if the whole string (or its start) is an official citation label."""
    s = (text or "").strip()
    if not s or EM not in s:
        return False
    return bool(OFFICIAL_SOURCE_RE.match(s)) or bool(
        re.match(
            r"^(Planalto|TCU|AGU|CAIXA|Compras\.gov)",
            s,
            re.I,
        )
        and EM in s
    )


def _protect_official(text: str) -> tuple[str, list[str]]:
    held: list[str] = []

    def _hold(m: re.Match[str]) -> str:
        held.append(m.group(0))
        return _PROTECT_TOKEN.format(len(held) - 1)

    return OFFICIAL_SOURCE_RE.sub(_hold, text), held


def _restore_official(text: str, held: list[str]) -> str:
    for i, original in enumerate(held):
        text = text.replace(_PROTECT_TOKEN.format(i), original)
    return text


def scrub_prose(text: str) -> str:
    """Rewrite CONFENGE prose: remove em-dashes, keep official source titles."""
    if not text or EM not in text:
        return text

    out, held = _protect_official(text)

    for old, new in CHROME:
        out = out.replace(old, new)

    for old, new in TEMPLATE_SUBS:
        out = out.replace(old, new)

    # Parenthetical pairs before contrast (so inner content is not half-replaced)
    out = PAREN_PAIR.sub(r" (\1) ", out)

    # Label: word — rest → word: rest
    out = LABEL_COLON.sub(lambda m: f"{m.group(1)}: ", out)

    # Geo short UF
    out = UF_AFTER_EM.sub(r" (\1)", out)

    # Region / long title tail
    out = REGION_AFTER_EM.sub(r": \1", out)

    # Contrast / connective after em-dash
    out = CONTRAST.sub(lambda m: f", {m.group(1)}", out)

    # Placeholders
    out = ALONE_EM.sub("n/d", out)
    out = JSON_ALONE_EM.sub(r"\1n/d\2", out)

    # Any remaining spaced em-dash → comma+space (safe default for prose)
    out = SPACED_EM.sub(", ", out)

    # Cleanup spacing artifacts (never leave " ," or " (")
    out = re.sub(r" {2,}", " ", out)
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r"\s+,", ",", out)
    out = re.sub(r"\s+:", ":", out)
    out = re.sub(r"\s+\.", ".", out)
    out = re.sub(r"\(\s+", "(", out)
    out = re.sub(r"\s+\)", ")", out)
    out = re.sub(r"\s{2,}", " ", out)

    return _restore_official(out, held)


def scrub_html(html: str) -> str:
    """Scrub em-dashes in an HTML document, preserving official source link labels.

    Strategy: protect entire <a>...</a> whose visible text starts with an official
    source name and contains em-dash; scrub the rest of the document as text
    (including attributes and JSON-LD), then restore protected anchors.
    """
    if not html or EM not in html:
        return html

    held_anchors: list[str] = []

    def _protect_anchor(m: re.Match[str]) -> str:
        full = m.group(0)
        # strip tags for text check
        inner = re.sub(r"<[^>]+>", "", full)
        if is_official_source_title(inner) or OFFICIAL_SOURCE_RE.search(inner):
            held_anchors.append(full)
            return f"\u0000A{len(held_anchors) - 1}\u0000"
        return full

    # Protect anchors that look like official sources
    work = re.sub(
        r"<a\b[^>]*>[\s\S]*?</a>",
        _protect_anchor,
        html,
        flags=re.I,
    )

    # Also protect bare official prefixes still in free text (Fontes without <a> edge cases)
    work, held_src = _protect_official(work)

    # Run prose scrub on chunks separated by protected tokens so we do not
    # re-open official titles; scrub_prose itself protects again — safe.
    # Whole-document scrub is fine after protections.
    work = scrub_prose(work)

    work = _restore_official(work, held_src)
    for i, original in enumerate(held_anchors):
        work = work.replace(f"\u0000A{i}\u0000", original)

    return work


# Public HTML roots to scan / write (relative to repo root).
PUBLIC_ROOTS = (
    "radar",
    "conteudos",
    "inteligencia",
    "casos",
    "nurture",
    "privacidade",
    "termos-de-uso",
    "guias-contratos-obras",
    "lei-14133-obras",
    "jurisprudencia-contratos-obras",
    "aditivos-obras-publicas",
    "atrasos-prorrogacao-obras-publicas",
    "auditoria-orcamento-licitacao",
    "diagnostico-pre-licitacao",
    "defesa-tecnica-contratos-publicos",
    "acompanhamento-contratos-obras",
    "medicoes-glosas-obras-publicas",
    "reequilibrio-obras-publicas",
    "imprensa",
    "bid-room-licitacoes-obras",
    "defesa-margem-contratos-publicos",
    "diagnostico-b2g-360",
    "diretoria-b2g",
    "especialista",
    "metodologia-inteligencia",
    "ferramentas",
    "ops",  # public ops landing if any
    "piloto",  # noindex; still scrub so generators stay consistent
)


def iter_public_html(root: Path = ROOT) -> list[Path]:
    files: list[Path] = []
    for name in PUBLIC_ROOTS:
        base = root / name
        if not base.exists():
            continue
        if base.is_file() and base.suffix == ".html":
            files.append(base)
            continue
        files.extend(sorted(base.rglob("*.html")))
    # unique preserve order
    seen: set[Path] = set()
    out: list[Path] = []
    for p in files:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def residual_em_dashes(html: str) -> list[str]:
    """Return snippets of remaining em-dashes that are NOT official source titles.

    Ignores script/style blocks (not visitor prose). Official citation labels may keep —.
    """
    if EM not in html:
        return []
    work = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", html, flags=re.I)
    work = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", " ", work, flags=re.I)

    def _drop_official_a(m: re.Match[str]) -> str:
        full = m.group(0)
        inner = re.sub(r"<[^>]+>", "", full)
        if is_official_source_title(inner) or OFFICIAL_SOURCE_RE.search(inner):
            return " "
        return full

    work = re.sub(r"<a\b[^>]*>[\s\S]*?</a>", _drop_official_a, work, flags=re.I)
    work, _held = _protect_official(work)
    snippets: list[str] = []
    for m in re.finditer(EM, work):
        ctx = work[max(0, m.start() - 48) : m.start() + 48].replace("\n", " ")
        after = work[m.end() : m.end() + 24]
        before = work[max(0, m.start() - 24) : m.start()]
        # Official law / portal citations (may appear outside <a>)
        if re.search(r"Lei\s+n?|Decreto\s+n?|texto compilado|\bart\.?\s*\d", ctx, re.I):
            continue
        if re.match(r"\s*Lei\b", after, re.I) or re.search(r"\bLei\s+\d", after, re.I):
            continue
        if re.search(
            r"\b(Planalto|TCU|AGU|CAIXA|Compras\.gov|SINAPI|SICRO)\b",
            ctx,
            re.I,
        ):
            continue
        if re.search(r"Engenharia\s*$", before, re.I) and re.match(r"\s*Lei\b", after, re.I):
            continue
        snippets.append(ctx)
    return snippets


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true", help="Rewrite HTML files in place")
    ap.add_argument("--check", action="store_true", help="Exit 1 if residual prose em-dashes remain")
    ap.add_argument(
        "--path",
        type=Path,
        action="append",
        help="Limit to specific file or directory (repeatable)",
    )
    args = ap.parse_args(argv)

    if args.path:
        files: list[Path] = []
        for p in args.path:
            p = p if p.is_absolute() else ROOT / p
            if p.is_dir():
                files.extend(sorted(p.rglob("*.html")))
            elif p.is_file():
                files.append(p)
    else:
        files = iter_public_html()

    changed = 0
    residual_files: list[tuple[Path, list[str]]] = []
    for path in files:
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if EM not in raw:
            continue
        cleaned = scrub_html(raw)
        if args.write and cleaned != raw:
            path.write_text(cleaned, encoding="utf-8")
            changed += 1
            check_src = cleaned
        else:
            check_src = cleaned if args.write else scrub_html(raw)

        # For --check without --write, evaluate post-scrub residual on dry-run result
        target = cleaned if (args.write or args.check) else raw
        if args.check:
            snips = residual_em_dashes(target if args.write else cleaned)
            if snips:
                residual_files.append((path, snips[:5]))

    if args.write:
        print(f"scrub_em_dashes: wrote {changed} file(s)")
    if args.check:
        if residual_files:
            print(f"FAIL: residual prose em-dashes in {len(residual_files)} file(s)", file=sys.stderr)
            for path, snips in residual_files[:25]:
                rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
                print(f"  {rel}", file=sys.stderr)
                for s in snips[:2]:
                    print(f"    …{s}…", file=sys.stderr)
            return 1
        print("PASS: no residual prose em-dashes in public HTML")
        return 0
    if not args.write and not args.check:
        # dry summary
        with_em = sum(1 for p in files if EM in p.read_text(encoding="utf-8", errors="ignore"))
        print(f"files scanned: {len(files)}; with em-dash: {with_em}")
        print("Use --write to apply, --check to verify.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
