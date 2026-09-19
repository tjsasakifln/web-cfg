#!/usr/bin/env python3
"""No mention of AI tooling (use, non-use, or comparison) on visitor surfaces.

Founder editorial addendum, 2026-09-19 (EXECUTE_NOW): public communication
(pages, articles, methodology, FAQ, forms, messages, demonstrative content,
images/alt/aria, metadata, JSON-LD, og/twitter previews) never mentions
whether AI is used. ABSENCE of mention, not a DECLARATION of absence.

This gate reproves three families, all on visitor-perceptible surfaces:

1. CLAIM of AI use: "IA" (uppercase, word-bounded), "inteligência artificial"
   (with/without accent), ChatGPT, chatbot, "modelo(s) generativo(s)",
   "agente(s) inteligente(s)", "tecnologia cognitiva", LLM, machine learning /
   aprendizado de máquina, and bare "AI" as an English word (word-bounded).
2. NEGATION or COMPARISON: "sem IA", "não usamos IA", "100% humano", "feito
   (inteiramente) por pessoas", "não é (uma) resposta de chatbot", "não é
   ChatGPT", "produzido/redigido por humanos", "não divulgamos nossas
   ferramentas", "preferimos não abordar" (the topic).
3. LINKS to the retired /uso-de-ia/ route.

Scope mirrors the other sitewide copy gates (issue #298): every shipped
visitor HTML file, via `scripts.site.public_copy_scope`. Legitimate
false-positive terms -- "inteligência técnica", "inteligência de mercado",
the /inteligencia/ route, "engenharia", "via", "dia", "perícia",
"vigilância", "auditoria", "Itajaí", "materiais", "ART", "AIA" -- must never
trip these patterns; a unit test below asserts exactly that.

What this gate does NOT touch: internal tooling, docs/, tests/, agent
instructions, audit/evidence records, robots.txt and crawl policy. Those are
excluded by `SKIP_PARTS` in `public_copy_scope` (docs, scripts, tests, data,
etc.) plus an explicit skip of robots.txt below.

Legitimate individual occurrences (should be zero) go in
`data/site/copy-exceptions.json` under rule `ai_mention`, one exact
(rule, match, path) per entry with a written reason.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (  # noqa: E402
    is_excepted,
    relpath,
    visible_markup,
    visible_text,
    visitor_facing_html_files,
)

EXCEPTION_RULE = "ai_mention"

# ---------------------------------------------------------------------------
# Patterns. Matched against a normalized copy of the corpus: accents folded,
# case preserved (case sensitivity is applied per-pattern via flags below).
# ---------------------------------------------------------------------------


def _fold(text: str) -> str:
    """Strip accents, keep case, so 'inteligência' and 'inteligencia' match."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


# (name, compiled pattern against folded text, case-sensitive?)
_CLAIM_PATTERNS: tuple[tuple[str, str, int], ...] = (
    ("ia_sigla", r"\bIA\b", 0),  # case-sensitive: only the uppercase acronym
    ("inteligencia_artificial", r"\binteligencia artificial\b", re.I),
    ("chatgpt", r"\bchatgpt\b", re.I),
    ("chatbot", r"\bchatbot\b", re.I),
    ("modelo_generativo", r"\bmodelos? generativos?\b", re.I),
    ("agente_inteligente", r"\bagentes? inteligentes?\b", re.I),
    ("tecnologia_cognitiva", r"\btecnologia cognitiva\b", re.I),
    ("llm", r"\bLLM\b", 0),  # case-sensitive
    ("machine_learning", r"\bmachine learning\b", re.I),
    ("aprendizado_de_maquina", r"\baprendizado de maquina\b", re.I),
    ("ai_bare", r"\bAI\b", 0),  # case-sensitive English acronym
)

_NEGATION_PATTERNS: tuple[tuple[str, str, int], ...] = (
    ("sem_ia", r"\bsem IA\b", 0),
    ("nao_usamos_ia", r"\bnao usamos IA\b", 0),
    ("cem_por_cento_humano", r"\b100\s*%\s*humano\b", re.I),
    ("feito_por_pessoas", r"\bfeito(?: inteiramente)? por pessoas\b", re.I),
    ("nao_e_resposta_chatbot", r"\bnao e (?:uma )?resposta de chatbot\b", re.I),
    ("nao_e_chatgpt", r"\bnao e chatgpt\b", re.I),
    ("produzido_por_humanos", r"\bproduzido por humanos\b", re.I),
    ("redigido_por_humanos", r"\bredigido por humanos\b", re.I),
    ("nao_divulgamos_ferramentas", r"\bnao divulgamos nossas ferramentas\b", re.I),
    ("preferimos_nao_abordar", r"\bpreferimos nao abordar\b", re.I),
)

ALL_PATTERNS: tuple[tuple[str, str, int], ...] = _CLAIM_PATTERNS + _NEGATION_PATTERNS

# Compiled once, against folded text.
_COMPILED = [(name, re.compile(pattern, flags), flags) for name, pattern, flags in ALL_PATTERNS]

RETIRED_ROUTE = "uso-de-ia"
_HREF_RETIRED_ROUTE = re.compile(
    r"""href\s*=\s*["'][^"']*uso-de-ia[^"']*["']""",
    re.I,
)

_JSON_LD_BLOCK = re.compile(
    r"<script[^>]+type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.S | re.I,
)
_META_TAG = re.compile(r"<meta\b[^>]*>", re.I)
_META_NAME_OR_PROPERTY = re.compile(
    r"""\b(?:name|property)\s*=\s*["']([^"']+)["']""", re.I
)
_META_CONTENT = re.compile(r"""\bcontent\s*=\s*["']([^"']*)["']""", re.I)
_TITLE_ATTR = re.compile(r"""\btitle\s*=\s*["']([^"']*)["']""", re.I)

# Safelist terms that must NEVER trip the patterns above (unit-tested below).
SAFE_TERMS = (
    "inteligência técnica",
    "inteligência de mercado",
    "Inteligência",  # rota /inteligencia/
    "engenharia",
    "via",
    "dia",
    "perícia",
    "vigilância",
    "auditoria",
    "Itajaí",
    "materiais",
    "ART",
    "AIA",
)


def _json_ld_strings(html: str) -> list[str]:
    """Every 'name'/'description'/'text' string value inside JSON-LD blocks."""
    out: list[str] = []

    def _walk(node) -> None:  # noqa: ANN001
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("name", "description", "text") and isinstance(value, str):
                    out.append(value)
                _walk(value)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    for match in _JSON_LD_BLOCK.finditer(html):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        _walk(payload)
    return out


def _meta_twitter_and_og_content(html: str) -> list[str]:
    """`content` of every meta description/og:*/twitter:* tag.

    `visible_markup()` already inlines description/og:* meta content as a
    serialized attribute string; this adds twitter:* meta, which it excludes.
    """
    out: list[str] = []
    for tag in _META_TAG.finditer(html):
        tag_text = tag.group(0)
        name_match = _META_NAME_OR_PROPERTY.search(tag_text)
        if not name_match:
            continue
        kind = name_match.group(1).lower()
        if kind != "description" and not kind.startswith(("og:", "twitter:")):
            continue
        content_match = _META_CONTENT.search(tag_text)
        if content_match:
            out.append(content_match.group(1))
    return out


def _title_attr_values(html: str) -> list[str]:
    """Every `title="..."` attribute value (not the `<title>` element)."""
    return [m.group(1) for m in _TITLE_ATTR.finditer(html)]


def _corpus(html: str) -> str:
    """Everything a visitor can perceive: body text, alt/aria-label, meta,
    title attrs and JSON-LD name/description/text -- joined for scanning.
    """
    parts = [
        visible_text(html),
        visible_markup(html),
        "\n".join(_meta_twitter_and_og_content(html)),
        "\n".join(_title_attr_values(html)),
        "\n".join(_json_ld_strings(html)),
    ]
    return "\n".join(p for p in parts if p)


def surfaces() -> list[Path]:
    """Every shipped visitor HTML file. A new public family is in scope by default.

    `visitor_facing_html_files()` walks every `*.html` not under a tree in
    `SKIP_PARTS`. It has no way to know about content that only exists as
    stray, untracked local state (e.g. a `.grok/` worktree checkout left in
    the working directory by an unrelated tool) rather than as a route the
    repository ships. Filtering that out here, in this gate's own scope
    function, keeps `public_copy_scope` untouched (out of this change's
    allowed files) while not reporting thousands of false findings against
    files that are not part of this repository's tracked source.
    """
    return [
        path
        for path in visitor_facing_html_files(ROOT)
        if ".grok" not in Path(relpath(path, ROOT)).parts
    ]


def _findings_for_line(line: str) -> list[tuple[str, str]]:
    """(pattern_name, snippet) for every pattern that matches this raw line."""
    folded = _fold(line)
    hits: list[tuple[str, str]] = []
    for name, rx, _flags in _COMPILED:
        match = rx.search(folded)
        if match:
            start, end = match.start(), match.end()
            snippet = line[max(0, start - 24) : end + 40].strip()
            hits.append((name, snippet))
    return hits


def scan_file(path: Path) -> list[str]:
    """`rel:line: pattern -> snippet` for every violation in one file."""
    rel = relpath(path, ROOT)
    html = path.read_text(encoding="utf-8", errors="replace")
    corpus = _fold(_corpus(html))

    # Which patterns actually fire in the visitor-scoped corpus (this decides
    # pass/fail; the exceptions registry is checked against this, not the
    # raw-line pass below).
    active = {
        name
        for name, rx, _flags in _COMPILED
        if rx.search(corpus) and not is_excepted(EXCEPTION_RULE, name, rel)
    }
    out: list[str] = []
    reported: set[str] = set()
    if active:
        for lineno, line in enumerate(html.splitlines(), start=1):
            for name, snippet in _findings_for_line(line):
                if name in active:
                    out.append(f"{rel}:{lineno}: {name} -> {snippet!r}")
                    reported.add(name)

    # Retired /uso-de-ia/ links: scanned on the raw source, since a link
    # target lives in an href attribute the visible-copy scanners drop.
    if not is_excepted(EXCEPTION_RULE, "uso_de_ia_link", rel):
        for lineno, line in enumerate(html.splitlines(), start=1):
            match = _HREF_RETIRED_ROUTE.search(line)
            if match:
                out.append(f"{rel}:{lineno}: uso_de_ia_link -> {match.group(0)!r}")

    unreported = active - reported
    if unreported:
        # A pattern fired in the visible/metadata corpus (e.g. a JSON-LD
        # string joined by _corpus(), or text only visible after whitespace
        # collapsing) but no raw source line reproduced it verbatim. Fail
        # closed with a file-level finding instead of silently dropping it.
        for name in sorted(unreported):
            out.append(f"{rel}:0: {name} -> (see visible/metadata corpus, not a single raw line)")
    return out


def scan() -> list[str]:
    failures: list[str] = []
    for path in surfaces():
        failures.extend(scan_file(path))
    return failures


# ---------------------------------------------------------------------------
# Unit tests: safelist must never trip, forbidden fixtures must always trip.
# ---------------------------------------------------------------------------


def test_safelist_terms_never_match():
    folded_safe = _fold(" ".join(SAFE_TERMS)).lower()
    for name, rx, flags in _COMPILED:
        # Case-sensitive acronym patterns (IA, LLM, AI) are checked against
        # the safelist rendered in natural (mixed/lower) case, since that is
        # how these words appear in real copy.
        assert not rx.search(_fold(" ".join(SAFE_TERMS))), (
            f"pattern {name!r} ({rx.pattern}) matched a safelisted term"
        )
        # Also probe lowercase, in case a future edit widens a flag.
        if not (flags & re.I):
            continue
        assert not rx.search(folded_safe), (
            f"pattern {name!r} ({rx.pattern}) matched a lowercase safelisted term"
        )


def test_route_ia_and_intelligence_words_are_safe():
    for phrase in (
        "Inteligência de mercado sobre obras públicas",
        "metodologia-inteligencia",
        "/inteligencia/",
        "inteligência técnica aplicada à perícia",
        "engenharia, perícia e vigilância",
        "auditoria de materiais em Itajaí",
        "ART e AIA anexados",
    ):
        corpus = _fold(phrase)
        for name, rx, _flags in _COMPILED:
            assert not rx.search(corpus), f"{phrase!r} tripped {name!r}"


def test_forbidden_fixtures_each_trip_the_gate():
    fixtures = {
        "ia_sigla": "Usamos IA para revisar documentos.",
        "inteligencia_artificial": "O time aplica inteligência artificial na triagem.",
        "inteligencia_artificial_no_accent": "aplicamos inteligencia artificial no processo",
        "chatgpt": "A resposta veio do ChatGPT.",
        "chatbot": "Isto não é um chatbot comum.",
        "modelo_generativo": "Rodamos um modelo generativo na análise.",
        "agente_inteligente": "Um agente inteligente organiza os dados.",
        "tecnologia_cognitiva": "Nossa tecnologia cognitiva acelera o laudo.",
        "llm": "O texto passa por um LLM antes da publicação.",
        "machine_learning": "Aplicamos machine learning na triagem.",
        "aprendizado_de_maquina": "Usamos aprendizado de maquina no processo.",
        "ai_bare": "Built with AI assistance.",
        "sem_ia": "Este laudo é feito sem IA.",
        "cem_por_cento_humano": "Conteúdo 100% humano, sempre.",
        "feito_por_pessoas": "Tudo aqui é feito por pessoas.",
        "produzido_por_humanos": "Texto produzido por humanos.",
        "nao_divulgamos_ferramentas": "Nao divulgamos nossas ferramentas internas.",
    }
    for name, text in fixtures.items():
        folded = _fold(text)
        assert any(rx.search(folded) for _n, rx, _f in _COMPILED), (
            f"fixture for {name!r} did not trip any pattern: {text!r}"
        )


def test_rewritten_copy_without_tool_mention_passes():
    ok_texts = (
        "Organizamos os documentos e identificamos inconsistências.",
        "O responsável técnico assina o que está publicado.",
        "A conferência técnica segue o mesmo padrão.",
        "Inteligência de mercado orienta a priorização dos temas.",
    )
    for text in ok_texts:
        folded = _fold(text)
        for name, rx, _flags in _COMPILED:
            assert not rx.search(folded), f"{text!r} wrongly tripped {name!r}"


def test_retired_route_link_pattern_matches_href_only():
    assert _HREF_RETIRED_ROUTE.search('<a href="/uso-de-ia/">detalhes</a>')
    assert not _HREF_RETIRED_ROUTE.search("<p>uso responsável dos dados</p>")


def test_no_ai_mention_sitewide():
    """The real gate: every shipped visitor HTML file, scanned for real.

    This intentionally fails while the AI-mention remediation (E1/E2) has not
    yet propagated across the public surface; that is the honest state, not a
    bug in the test. `npm run test:ai-mention` runs the same scan as a
    standalone script/CI step.
    """
    pages = surfaces()
    assert len(pages) >= 100, f"visitor scan too narrow: {len(pages)}"
    failures = scan()
    assert not failures, "\n".join(failures)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.parse_args()

    for test in (
        test_safelist_terms_never_match,
        test_route_ia_and_intelligence_words_are_safe,
        test_forbidden_fixtures_each_trip_the_gate,
        test_rewritten_copy_without_tool_mention_passes,
        test_retired_route_link_pattern_matches_href_only,
    ):
        test()
        print(f"OK {test.__name__}")

    pages = surfaces()
    if len(pages) < 100:
        print(f"FAIL: visitor scan too narrow ({len(pages)} files)", file=sys.stderr)
        return 1
    failures = scan()
    print(f"SCANNED {len(pages)} visitor HTML files")
    if failures:
        print(f"\nFAIL ({len(failures)} occurrences):", file=sys.stderr)
        for line in failures:
            print("  " + line, file=sys.stderr)
        return 1
    print("PASS: no AI-tooling mention on the public surface")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
