"""Human GBP checklist (read-only) and legitimate professional citation targets."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from scripts.local_entity.constants import CAMPAIGN_AS_OF, CITATION_FARM_HOSTS


class PackError(ValueError):
    """Human-pack honesty defect."""


GBP_STEPS: tuple[dict[str, Any], ...] = (
    {
        "id": "gbp-01",
        "action": (
            "Abrir uma janela anônima/privada. Não entrar em conta Google, "
            "não abrir o app Google Business Profile e não usar API."
        ),
        "readonly": True,
    },
    {
        "id": "gbp-02",
        "action": "Pesquisar no Google (deslogado): CONFENGE.",
        "readonly": True,
    },
    {
        "id": "gbp-03",
        "action": "Pesquisar: CONFENGE consultoria.",
        "readonly": True,
    },
    {
        "id": "gbp-04",
        "action": "Pesquisar: Engº Tiago Sasaki.",
        "readonly": True,
    },
    {
        "id": "gbp-05",
        "action": "Pesquisar: CONFENGE Florianópolis.",
        "readonly": True,
    },
    {
        "id": "gbp-06",
        "action": "Pesquisar: consultoria licitações obras públicas Santa Catarina.",
        "readonly": True,
    },
    {
        "id": "gbp-07",
        "action": (
            "Anotar se aparece painel de conhecimento, pacote de mapas (map-pack) "
            "ou cartão de perfil. Presença = presente / ausente / pouco claro. "
            "Não clicar em 'Reivindicar esta empresa' nem 'Possui este negócio?'."
        ),
        "readonly": True,
    },
    {
        "id": "gbp-08",
        "action": (
            "No Google Maps (deslogado), pesquisar CONFENGE. Não sugerir edição, "
            "não adicionar ficha, não enviar foto, não pedir avaliação."
        ),
        "readonly": True,
    },
    {
        "id": "gbp-09",
        "action": (
            "Se uma ficha estiver visível, copiar só o que está público na tela "
            "(nome, telefone, site) e comparar com o contato já publicado em "
            "data/site/brand.json. Não editar a ficha."
        ),
        "readonly": True,
    },
    {
        "id": "gbp-10",
        "action": (
            "Se nenhuma ficha estiver visível, registrar UNKNOWN. Uma ficha futura "
            "de área de serviço (endereço oculto) é decisão do fundador fora deste PR. "
            "Não inventar rua, CEP, horário de loja nem pedido de review."
        ),
        "readonly": True,
    },
)

CITATION_TARGETS: tuple[dict[str, Any], ...] = (
    {
        "id": "crea-sc-noticias",
        "name": "CREA-SC / comunicação-notícias",
        "class": "conselho_profissional",
        "public_route": "https://portal.crea-sc.org.br/noticias-crea-sc/",
        "fallback": "https://portal.crea-sc.org.br/",
        "purpose": (
            "Conselho profissional do estado do DDD 48. Candidato a citação de entidade, "
            "não diretório farm e não parceria."
        ),
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "outcome": "UNKNOWN",
    },
    {
        "id": "sicepot-sc",
        "name": "SICEPOT-SC",
        "class": "associacao",
        "public_route": "https://sicepot.com.br/contact/",
        "fallback": "https://sicepot.com.br/",
        "purpose": "Associação de construção pesada em Santa Catarina. Rota pública de contato.",
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "outcome": "UNKNOWN",
    },
    {
        "id": "cbic-coinfra",
        "name": "CBIC / COINFRA",
        "class": "associacao",
        "public_route": "https://cbic.org.br/assessoria-de-imprensa/",
        "fallback": "https://cbic.org.br/",
        "purpose": "Entidade nacional de construção. Assessoria de imprensa pública.",
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "outcome": "UNKNOWN",
    },
    {
        "id": "sinaenco",
        "name": "SINAENCO",
        "class": "associacao",
        "public_route": "https://sinaenco.com.br/fale-conosco/",
        "fallback": "https://sinaenco.com.br/",
        "purpose": "Sindicato nacional de arquitetura e consultoria de engenharia. Formulário público.",
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "outcome": "UNKNOWN",
    },
    {
        "id": "eesc-usp-comunicacao",
        "name": "EESC-USP / comunicação institucional",
        "class": "instituicao_formacao",
        "public_route": "https://eesc.usp.br/",
        "fallback": "https://www.usp.br/",
        "purpose": (
            "Instituição de formação já declarada no perfil (alumniOf). Rota pública institucional; "
            "não é diploma digital nem prova de terceiro anexada neste repositório."
        ),
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "outcome": "UNKNOWN",
    },
)

_NEGATION = re.compile(
    r"\b(n[aã]o|nao|do not|don't|never|proibid|sem |evitar|jamais)\b",
    re.I,
)
_LOGIN = re.compile(
    r"\b(log ?in|sign in|entrar na conta|faça login|faca login|autenticar)\b",
    re.I,
)
_MUTATION = re.compile(
    r"\b(reivindicar|claim this listing|editar o perfil|adicionar endere[cç]o|"
    r"publicar foto|pedir avalia[cç]|mutate|posts\.upsert|api write|"
    r"google my business api|gbp api)\b",
    re.I,
)


def gbp_checklist() -> dict[str, Any]:
    return {
        "as_of": CAMPAIGN_AS_OF,
        "readonly": True,
        "login_required": False,
        "mutation": False,
        "api_write": False,
        "owner": "founder",
        "steps": [dict(s) for s in GBP_STEPS],
        "forbidden": [
            "login",
            "GBP API write",
            "claim listing",
            "add street address",
            "request reviews",
            "upload photos",
            "suggest an edit",
        ],
    }


def citation_targets() -> dict[str, Any]:
    return {
        "as_of": CAMPAIGN_AS_OF,
        "auto_send": False,
        "sent": False,
        "partnership_claim": False,
        "citation_farm": False,
        "targets": [dict(t) for t in CITATION_TARGETS],
    }


def gbp_checklist_defects(text: str) -> list[str]:
    errors: list[str] = []
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line or _NEGATION.search(line):
            continue
        if _LOGIN.search(line):
            errors.append(f"gbp_login_step:{line[:80]}")
        if _MUTATION.search(line):
            errors.append(f"gbp_mutation_step:{line[:80]}")
    return errors


def citation_target_defects(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if doc.get("auto_send") is True or doc.get("sent") is True:
        errors.append("citation_autosent")
    if doc.get("partnership_claim") is True:
        errors.append("citation_partnership_claim")
    if doc.get("citation_farm") is True:
        errors.append("citation_farm")
    targets = doc.get("targets") or []
    if not targets:
        errors.append("citation_targets_absent")
    for t in targets:
        route = str(t.get("public_route") or "")
        if not route.startswith("https://"):
            errors.append(f"citation_route_not_https:{t.get('id')}")
        host = urlparse(route).hostname or ""
        host = host.lower().removeprefix("www.")
        if host in CITATION_FARM_HOSTS:
            errors.append(f"citation_farm_host:{host}")
        if t.get("auto_send") is True or t.get("sent") is True:
            errors.append(f"citation_target_sent:{t.get('id')}")
        if t.get("partnership_claim") is True:
            errors.append(f"citation_target_partnership:{t.get('id')}")
    return errors
