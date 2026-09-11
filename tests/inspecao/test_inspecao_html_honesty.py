"""Mutation counterproofs on the shipped inspection page.

Drives scripts.local_entity.validate.audit_html_honesty against copies of the
real HTML. A green run without these mutations would not prove the scanner
still rejects invented NAP, storefront or ratings.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.local_entity.validate import audit_html_honesty
from scripts.site.authority import INVENTED_CREDENTIAL_PATTERNS
PAGE = ROOT / "inspecao-diagnostico-edificacoes" / "index.html"


def _shipped() -> str:
    html = PAGE.read_text(encoding="utf-8")
    assert "Inspeção e diagnóstico de edificações" in html
    return html


def test_shipped_inspection_html_is_honest() -> None:
    errors = audit_html_honesty(_shipped())
    assert errors == [], errors


def test_localbusiness_and_street_address_mutation_fails_honesty() -> None:
    html = _shipped()
    bait = html.replace(
        '"@type":"Service"',
        '"@type":["Service","LocalBusiness"]',
        1,
    ).replace(
        '"areaServed":{"@type":"Country","name":"Brasil"}',
        '"areaServed":{"@type":"Country","name":"Brasil"},'
        '"address":{"@type":"PostalAddress","streetAddress":"Rua Inventada, 100",'
        '"addressLocality":"Florianópolis","addressRegion":"SC"}',
        1,
    )
    errors = audit_html_honesty(bait)
    joined = " ".join(errors)
    assert errors, "scanner accepted invented storefront"
    assert "invented_local_business" in joined or "invented_nap" in joined, errors
    assert any("streetAddress" in e or "PostalAddress" in e or "LocalBusiness" in e for e in errors)


def test_customer_star_rating_mutation_fails_honesty() -> None:
    html = _shipped()
    bait = html.replace(
        "</h1>",
        '</h1><p>Avaliação 4,9 de clientes.</p><script type="application/ld+json">'
        + json.dumps(
            {
                "@type": "AggregateRating",
                "ratingValue": "4.9",
                "reviewCount": "12",
            }
        )
        + "</script>",
        1,
    )
    errors = audit_html_honesty(bait)
    joined = " ".join(errors)
    assert errors, "scanner accepted fabricated rating"
    assert "invented_review" in joined or "invented_credential" in joined, errors


def test_city_doorway_price_and_photo_diagnosis_are_absent_and_caught_when_injected() -> None:
    html = _shipped()
    main = html.split("<main", 1)[1]
    assert "São Paulo, Curitiba e Florianópolis" not in main
    assert "diagnóstico por fotografia" not in main.lower()
    assert "a partir de R$" not in main

    doorway = html.replace(
        "Não publicamos lista de cidades nem unidade de atendimento.",
        "Unidades em São Paulo, Curitiba e Florianópolis, com tempo de chegada de 40 minutos.",
    )
    assert "Unidades em São Paulo, Curitiba e Florianópolis" in doorway
    assert "Não publicamos lista de cidades nem unidade de atendimento." not in doorway

    photo = html.replace(
        "Fotografia não permite diagnosticar causa, estabilidade ou solução à distância.",
        "Envie a foto e diagnosticamos causa, estabilidade e solução por fotografia.",
    )
    assert "diagnosticamos causa, estabilidade e solução por fotografia" in photo

    priced = html.replace(
        "Hipótese não é causa única.",
        "Hipótese não é causa única. Inspeção a partir de R$ 1.900 por relatório.",
    )
    assert re.search(r"a partir de\s+R\$", priced)
    visible = re.sub(r"<[^>]+>", " ", priced)
    assert any(re.search(pat, visible, re.I) is None for pat in INVENTED_CREDENTIAL_PATTERNS)
    assert "a partir de R$ 1.900" in visible
