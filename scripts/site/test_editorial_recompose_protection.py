"""Mapa de proteção de scripts/site/editorial_recompose.py (lote C, onda 2).

`--include-protected` levanta só a fonte do canário 389 e os siblings de
conteudos/ listados em CANARY_LIFTABLE. Qualquer outro sibling do contrato
(o pilar de medições, CLICK_ORIGIN, um sibling futuro) continua "intacta" nos
dois modos, e as páginas do cluster de medição nunca perdem a proteção de corpo.
"""

from __future__ import annotations

import json
from pathlib import Path

from scripts.site import editorial_recompose as er

ROOT = Path(__file__).resolve().parents[2]


def _contract() -> dict:
    return json.loads(er.CANARY_389_CONTRACT.read_text(encoding="utf-8"))


def test_pillar_sibling_stays_intact_in_both_modes():
    pillar = "medicoes-glosas-obras-publicas/index.html"
    assert any(s["path"] == pillar for s in _contract()["frozen_siblings"])
    assert er.protected_pages()[pillar] == "intacta"
    assert er.protected_pages(include_protected=True)[pillar] == "intacta"


def test_click_origin_sibling_stays_intact_in_both_modes():
    rel = "conteudos/fiscal-nao-assina-medicao-obra-publica/index.html"
    assert er.protected_pages()[rel] == "intacta"
    assert er.protected_pages(include_protected=True)[rel] == "intacta"


def test_only_allowlisted_canary_pages_are_lifted():
    contract = _contract()
    paths = [contract["canary"]["source"]] + [s["path"] for s in contract["frozen_siblings"]]
    lifted = er.protected_pages(include_protected=True)
    for rel in paths:
        if rel in er.CANARY_LIFTABLE:
            assert lifted.get(rel) in (None, "so-folha"), rel
        else:
            assert lifted[rel] == "intacta", rel
    assert all(rel.startswith("conteudos/") for rel in er.CANARY_LIFTABLE)


def test_cluster_pages_keep_body_protection_when_lifting(monkeypatch, tmp_path):
    # Sibling futuro do contrato fora da allowlist: continua "intacta".
    contract = _contract()
    contract["frozen_siblings"].append({"path": "conteudos/inexistente-futuro/index.html", "sha256": "0" * 64})
    fake = tmp_path / "canary-contract.json"
    fake.write_text(json.dumps(contract), encoding="utf-8")
    monkeypatch.setattr(er, "CANARY_389_CONTRACT", fake)
    lifted = er.protected_pages(include_protected=True)
    assert lifted["conteudos/inexistente-futuro/index.html"] == "intacta"
    from scripts.organic.cluster_medicao_originality import CLUSTER_SLUGS

    for slug in CLUSTER_SLUGS:
        assert lifted.get(f"conteudos/{slug}/index.html") in {"intacta", "so-folha"}, slug


def test_check_mode_would_not_change_the_pillar():
    pillar = ROOT / "medicoes-glosas-obras-publicas/index.html"
    html = pillar.read_text(encoding="utf-8")
    protected = er.protected_pages(include_protected=True)
    assert protected["medicoes-glosas-obras-publicas/index.html"] == "intacta"
    # Sanidade: o transformador mudaria o pilar se ele não estivesse protegido,
    # o que prova que a proteção é o que o mantém byte a byte.
    out, _log = er.recompose(html)
    assert out != html
