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


def test_superseded_urls_are_absent_from_indexable_sources():
    superseded = {OLD_LIMIT, OLD_ITEM}
    for page_file in (ROOT / "data" / "editorial" / "pages").glob("*.json"):
        definition = json.loads(page_file.read_text(encoding="utf-8"))
        assert definition.get("url") not in superseded
        assert all(row.get("url") not in superseded for row in definition.get("related", []))
    for name in ("sitemap.xml", "sitemap-editorial.xml", "sitemap-jurisprudencia.xml", "sitemap-inteligencia.xml", "feed.xml"):
        path = ROOT / name
        if path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            assert OLD_LIMIT not in text
            assert OLD_ITEM not in text


def test_new_pages_render_with_their_own_canonical():
    for page_id in ("lei-limite-25-50", "lei-item-novo-desconto", "guia-checklist-aditivo"):
        definition = page(page_id)
        html = render_page({**definition, "status": "EDITORIAL_REVIEWED"})
        canonical = re.search(
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
            html,
            re.I,
        )
        assert canonical and canonical.group(1) == f"https://confenge.com.br{definition['url']}"


def test_error_project_page_is_not_redirected_and_stays_noindex_when_present():
    assert ERROR_PROJECT not in redirect_rules()
    old_html = ROOT / ERROR_PROJECT.strip("/") / "index.html"
    if old_html.exists():
        robots = re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\']([^"\']+)', old_html.read_text(encoding="utf-8", errors="replace"), re.I)
        assert robots and {item.strip().lower() for item in robots.group(1).split(",")} >= {"noindex", "follow"}


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
    assert "conjunto de acréscimos e o conjunto de supressões" in body
    assert "aplicados isoladamente aos conjuntos" in body
    assert "veda a compensação entre itens distintos" in body
    assert "âmbito de atuação" in body
    assert "Estados e municípios podem ter regulamento ou orientação específica" in body
    assert "não pode ser usado artificialmente para ocultar acréscimo de escopo" in body
    assert "não se regulariza automaticamente por trocar a nomenclatura" in body
