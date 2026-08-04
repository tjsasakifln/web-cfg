"""Material regressions for the first PR #54 editorial cohort.

These assertions validate legal propositions, rendered destinations and public
surfaces together; they deliberately do not pass merely because isolated words
are present in a page.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.render import render_page  # noqa: E402
from scripts.site.inbound_first_remediate import (  # noqa: E402
    SUPERSEDED_URLS,
    force_noindex_superseded_pages,
    remediate_feed,
)
from scripts.site.inbound_gates import robots_of  # noqa: E402


OLD_LIMIT = "/conteudos/limite-aditivo-25-50-obra-publica/"
NEW_LIMIT = "/lei-14133-obras/limite-25-50-aditivo-obra/"
OLD_ITEM = "/conteudos/desconto-da-proposta-em-item-novo-aditivo/"
NEW_ITEM = "/lei-14133-obras/preco-item-novo-desconto-proposta/"
ERROR_PROJECT = "/conteudos/erro-de-projeto-gera-aditivo-obra-publica/"


def page(page_id: str) -> dict:
    return json.loads(
        (ROOT / "data" / "editorial" / "pages" / f"{page_id}.json").read_text(encoding="utf-8")
    )


def redirect_rules() -> dict[str, tuple[str, str]]:
    rules: dict[str, tuple[str, str]] = {}
    for line in (ROOT / "_redirects").read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if not parts or parts[0].startswith("#"):
            continue
        assert len(parts) >= 3, f"redirect_malformed:{line}"
        rules[parts[0]] = (parts[1], parts[2])
    return rules


def robots_tokens(html: str) -> set[str]:
    raw = robots_of(html)
    if raw == "missing":
        return set()
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def public_surface_paths() -> list[Path]:
    names = (
        "sitemap.xml",
        "sitemap-editorial.xml",
        "sitemap-jurisprudencia.xml",
        "sitemap-inteligencia.xml",
        "feed.xml",
        "conteudos/index.html",
        "aditivos-obras-publicas/index.html",
    )
    return [ROOT / name for name in names if (ROOT / name).exists()]


def test_superseded_urls_redirect_permanently_and_directly():
    rules = redirect_rules()
    assert rules[OLD_LIMIT] == (NEW_LIMIT, "301!")
    assert rules[OLD_ITEM] == (NEW_ITEM, "301!")
    for old, (destination, status) in rules.items():
        if old in {OLD_LIMIT, OLD_ITEM}:
            assert status.startswith("301")
            assert destination not in rules, f"redirect_chain:{old}->{destination}"
            assert destination not in {OLD_LIMIT, OLD_ITEM}
    assert ERROR_PROJECT not in rules
    assert SUPERSEDED_URLS == {OLD_LIMIT, OLD_ITEM}


def test_superseded_urls_are_absent_from_indexable_sources():
    superseded = {OLD_LIMIT, OLD_ITEM}
    for page_file in (ROOT / "data" / "editorial" / "pages").glob("*.json"):
        definition = json.loads(page_file.read_text(encoding="utf-8"))
        assert definition.get("url") not in superseded
        assert all(row.get("url") not in superseded for row in definition.get("related", []))
    for path in public_surface_paths():
        text = path.read_text(encoding="utf-8", errors="replace")
        assert OLD_LIMIT not in text, f"superseded_in:{path.relative_to(ROOT)}"
        assert OLD_ITEM not in text, f"superseded_in:{path.relative_to(ROOT)}"


def test_remediate_feed_strips_superseded_urls(tmp_path, monkeypatch):
    """Drive the shipped feed generator, not a frozen snapshot."""
    feed = tmp_path / "feed.xml"
    feed.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>t</title>
<item>
<title>old limit</title>
<link>https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/</link>
<guid isPermaLink="true">https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/</guid>
</item>
<item>
<title>old item</title>
<link>https://confenge.com.br/conteudos/desconto-da-proposta-em-item-novo-aditivo/</link>
</item>
<item>
<title>keep</title>
<link>https://confenge.com.br/conteudos/atraso-na-medicao-obra-publica/</link>
</item>
</channel></rss>
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "scripts.site.inbound_first_remediate.ROOT",
        tmp_path,
    )
    # indexable_map reads conteudos under ROOT; provide one indexable peer page.
    peer = tmp_path / "conteudos" / "atraso-na-medicao-obra-publica" / "index.html"
    peer.parent.mkdir(parents=True)
    peer.write_text(
        '<html><head><meta name="robots" content="index,follow"/></head></html>',
        encoding="utf-8",
    )
    result = remediate_feed()
    text = feed.read_text(encoding="utf-8")
    assert result["removed_items"] >= 2
    assert OLD_LIMIT not in text
    assert OLD_ITEM not in text
    assert "/conteudos/atraso-na-medicao-obra-publica/" in text


def test_new_pages_render_with_their_own_canonical():
    for page_id in ("lei-limite-25-50", "lei-item-novo-desconto", "guia-checklist-aditivo"):
        definition = page(page_id)
        html = render_page({**definition, "status": "EDITORIAL_REVIEWED"})
        canonical = re.search(
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
            html,
            re.I,
        ) or re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
            html,
            re.I,
        )
        assert canonical and canonical.group(1) == f"https://confenge.com.br{definition['url']}"
        for old in (OLD_LIMIT, OLD_ITEM):
            assert old not in html


def test_error_project_page_is_not_redirected_and_stays_noindex_when_present():
    assert ERROR_PROJECT not in redirect_rules()
    old_html = ROOT / ERROR_PROJECT.strip("/") / "index.html"
    if old_html.exists():
        html = old_html.read_text(encoding="utf-8", errors="replace")
        tokens = robots_tokens(html)
        assert {"noindex", "follow"} <= tokens
        canonical = re.search(
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
            html,
            re.I,
        ) or re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
            html,
            re.I,
        )
        if canonical:
            # Self-canonical with noindex is coherent; do not point to a competing indexable page.
            assert ERROR_PROJECT.rstrip("/") in canonical.group(1)
        for surface in public_surface_paths():
            text = surface.read_text(encoding="utf-8", errors="replace")
            if surface.name in {"feed.xml", "sitemap.xml", "sitemap-editorial.xml"}:
                assert ERROR_PROJECT not in text


def test_force_noindex_superseded_pages_updates_artifact():
    for url in SUPERSEDED_URLS:
        path = ROOT / url.strip("/") / "index.html"
        if not path.exists():
            continue
        original = path.read_text(encoding="utf-8", errors="replace")
        force_noindex_superseded_pages()
        updated = path.read_text(encoding="utf-8", errors="replace")
        assert {"noindex", "follow"} <= robots_tokens(updated)
        # restore only if the helper mutated a previously indexable page mid-suite
        if original != updated and "noindex" not in robots_of(original):
            path.write_text(original, encoding="utf-8")
            force_noindex_superseded_pages()
            assert {"noindex", "follow"} <= robots_tokens(
                path.read_text(encoding="utf-8", errors="replace")
            )


def test_no_mechanical_punctuation_remains_in_first_cohort():
    defect = re.compile(r"\S\s+\.\s{2,}\S")
    for page_id in ("lei-limite-25-50", "lei-item-novo-desconto", "guia-checklist-aditivo"):
        definition = page(page_id)
        public_material = json.dumps(definition, ensure_ascii=False)
        assert not defect.search(public_material), page_id


def test_item_new_price_rule_follows_art_127_structure():
    definition = page("lei-item-novo-desconto")
    body = definition["body_markdown"]
    answer = definition["direct_answer"]
    assert "art.127" in definition["legal_devices"]
    assert "sem preço unitário" in answer
    assert "relação geral entre o valor da proposta" in answer
    assert "preços referenciais ou de mercado vigentes na data do aditamento" in answer
    assert "limites do art. 125 continuam aplicáveis" in answer
    assert "Três situações que não devem ser misturadas" in body
    assert "Item realmente sem preço unitário contratual" in body
    assert "Item existente ou análogo na planilha" in body
    assert "Reequilíbrio de preço de item existente" in body


def test_checklist_carries_art_132_rule_and_deadline():
    definition = page("guia-checklist-aditivo")
    assert {"art.127", "art.130", "art.132"} <= set(definition["legal_devices"])
    assert "lei-14133-art126-132" in definition["sources"]
    body = definition["body_markdown"]
    assert "formalização do termo aditivo é condição" in body
    assert "necessidade justificada de antecipar os efeitos" in body
    assert "prazo máximo de um mês" in body
    labels = {row["id"]: row["label"] for row in definition["checklist_items"]}
    assert "justificativa" in labels["ad-28"].lower() and "um mês" in labels["ad-28"]
    assert "sem necessidade justificada" in labels["ad-30"].lower()


def test_limits_page_segregates_sets_without_universalizing_agu_on_50():
    definition = page("lei-limite-25-50")
    assert "agu-on-50-2014" in definition["sources"]
    body = definition["body_markdown"]
    assert "conjunto de acréscimos e o conjunto de supressões" in body or "acréscimos e supressões segregados" in body
    assert "aplicados isoladamente aos conjuntos" in body
    assert "veda a compensação entre itens distintos" in body
    assert "âmbito de atuação" in body
    assert "Estados e municípios podem ter regulamento ou orientação específica" in body
    assert "não pode ser usado artificialmente para ocultar acréscimo de escopo" in body
    assert "não se regulariza automaticamente por trocar a nomenclatura" in body
    assert "compensar automaticamente" in body
    assert "repercussão percentual" in body
    assert "terceiro refaça o cálculo" in body
    assert "reajuste" in body and "repactuação" in body
    assert "regime jurídico aplicável" in body
