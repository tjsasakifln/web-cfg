"""Canonical credential registry: load, project, revoke, expire, parity.

Owned surfaces (/confianca/, /especialista/tiago-jun-sasaki/) take visible
copy and Person/Organization/ProfessionalService JSON-LD from this module.
A status change on one claim removes it from every owned projection together.

Fail-closed: WITHHELD, UNKNOWN, EXPIRED, revoked and never_project claims
do not render. Official CREA/CPTEC rows stay in the registry as audit trail
until a contemporaneous public source is reproduced.
"""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from html import escape, unescape
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "data" / "site" / "credential-registry.json"
PERMISSIONED_PROOF_PATH = ROOT / "data" / "site" / "permissioned-proof-registry.json"

STATUSES = frozenset({"VERIFIED", "SELF_ATTESTED", "WITHHELD", "EXPIRED", "UNKNOWN"})
PROJECTABLE_STATUSES = frozenset({"VERIFIED", "SELF_ATTESTED"})
DOCUMENTARY_PRIMARY_REFERENCE_KEYS = frozenset(
    {"document_id", "document_sha256", "document_owner", "storage_class"}
)
OWNED_SURFACES = ("/confianca/", "/especialista/tiago-jun-sasaki/")
OWNED_RELATIVE_PATHS = frozenset(
    {
        "confianca/index.html",
        "especialista/tiago-jun-sasaki/index.html",
    }
)
OWNED_SURFACE_BY_RELATIVE_PATH = {
    "confianca/index.html": "/confianca/",
    "especialista/tiago-jun-sasaki/index.html": "/especialista/tiago-jun-sasaki/",
}
OWNED_CANONICALS = frozenset(
    {
        "https://confenge.com.br/confianca/",
        "https://confenge.com.br/especialista/tiago-jun-sasaki/",
    }
)

REGION_START = "<!-- credential-registry:start -->"
REGION_END = "<!-- credential-registry:end -->"

MANAGED_ORG_KEYS = ("legalName", "taxID", "address")
MANAGED_PERSON_KEYS = ("name", "jobTitle", "alumniOf", "hasCredential", "sameAs")
MANAGED_SERVICE_KEYS = ("name", "description", "areaServed")

JSON_LD_RE = re.compile(
    r'(<script\b[^>]*\btype=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)',
    re.IGNORECASE | re.DOTALL,
)

FORBIDDEN_COPY_PATTERNS = (
    r"perito do tjsc",
    r"perito oficial",
    r"homologad[oa] pelo tribunal",
    r"acreditad[oa] pelo tribunal",
    r"certificad[oa] pelo tribunal",
    r"escrit[oó]rio aberto ao p[uú]blico",
    r"selo de art",
    r"art universal",
    r"visite nosso escrit[oó]rio",
    r"hor[aá]rio de atendimento presencial",
    r"processo n[ºo°]",
    r"autos n[ºo°]",
    r"melhor perito",
    r"endosso do tribunal",
)

ACTIVE_CASE_PATTERNS = (
    r"\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b",
    r"processo n[ºo°]\s*\d",
    r"autos n[ºo°]\s*\d",
)

CPTEC_APPOINTMENT_PATTERNS = (
    r"perito do tjsc",
    r"perito oficial",
    r"nomeado pelo tribunal",
    r"nomea[cç][aã]o como perito",
)

STOREFRONT_PATTERNS = (
    r"escrit[oó]rio aberto ao p[uú]blico",
    r"visite nosso escrit[oó]rio",
    r"loja aberta",
    r"hor[aá]rio de atendimento presencial",
)


@dataclass
class Projection:
    surface: str
    as_of: str
    claim_ids: list[str] = field(default_factory=list)
    phrases: list[str] = field(default_factory=list)
    visible_html: str = ""
    schema_org: dict[str, Any] = field(default_factory=dict)
    schema_person: dict[str, Any] = field(default_factory=dict)
    schema_service: dict[str, Any] = field(default_factory=dict)
    official_links: list[dict[str, str]] = field(default_factory=list)
    limits: list[str] = field(default_factory=list)
    unprojected_phrases: list[str] = field(default_factory=list)

    @property
    def visible_text(self) -> str:
        text = re.sub(r"<[^>]+>", " ", self.visible_html)
        return re.sub(r"\s+", " ", unescape(text)).strip()

    @property
    def schema_nodes(self) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        if self.schema_org:
            nodes.append({"@type": "Organization", **self.schema_org})
        if self.schema_person:
            nodes.append({"@type": "Person", **self.schema_person})
        if self.schema_service:
            nodes.append({"@type": "ProfessionalService", **self.schema_service})
        return nodes


def load_registry(path: Path | None = None) -> dict[str, Any]:
    target = path or REGISTRY_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def validate_registry(registry: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if registry.get("schema") != "confenge.credential-registry/1.0":
        errors.append("schema_mismatch")
    claims = registry.get("claims")
    if not isinstance(claims, list) or not claims:
        errors.append("claims_missing")
        return errors
    seen: set[str] = set()
    required = (
        "id",
        "entity",
        "claim",
        "source_class",
        "source_reference",
        "as_of",
        "scope",
        "allowed_wording",
        "forbidden_wording",
        "owner",
        "status",
        "projection_surfaces",
        "rollback",
    )
    for claim in claims:
        if not isinstance(claim, dict):
            errors.append("claim_not_object")
            continue
        cid = str(claim.get("id") or "")
        if not cid:
            errors.append("claim_id_missing")
            continue
        if cid in seen:
            errors.append(f"duplicate_id:{cid}")
        seen.add(cid)
        for key in required:
            if key not in claim:
                errors.append(f"missing_field:{cid}:{key}")
        status = claim.get("status")
        if status not in STATUSES:
            errors.append(f"invalid_status:{cid}:{status}")
        source_class = str(claim.get("source_class") or "")
        source_reference = claim.get("source_reference")
        if not isinstance(source_reference, dict):
            errors.append(f"source_reference_not_object:{cid}")
        if source_class == "DOCUMENTARY_PRIMARY":
            missing_reference = sorted(
                key
                for key in DOCUMENTARY_PRIMARY_REFERENCE_KEYS
                if not isinstance(source_reference, dict) or not source_reference.get(key)
            )
            if missing_reference:
                errors.append(
                    f"documentary_primary_reference_incomplete:{cid}:{','.join(missing_reference)}"
                )
            if isinstance(source_reference, dict) and source_reference.get("materially_accessible") is not True:
                errors.append(f"documentary_primary_not_accessible:{cid}")
        if claim.get("status") in PROJECTABLE_STATUSES and not claim.get("source_class"):
            errors.append(f"projectable_without_source:{cid}")
        if is_projectable(claim) and not (claim.get("allowed_wording") or []):
            errors.append(f"projectable_without_wording:{cid}")
    return errors


def _parse_day(value: Any) -> date | None:
    if not value:
        return None
    text = str(value)[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _today(now: date | datetime | str | None = None) -> date:
    if now is None:
        return date.today()
    if isinstance(now, datetime):
        return now.date()
    if isinstance(now, date):
        return now
    parsed = _parse_day(now)
    return parsed or date.today()


def is_projectable(claim: dict[str, Any], now: date | datetime | str | None = None) -> bool:
    if claim.get("never_project"):
        return False
    if claim.get("revoked"):
        return False
    status = claim.get("status")
    if status not in PROJECTABLE_STATUSES:
        return False
    expires = _parse_day(claim.get("expires_at"))
    if expires and _today(now) > expires:
        return False
    return True


def revoke_claim(registry: dict[str, Any], claim_id: str) -> dict[str, Any]:
    clone = copy.deepcopy(registry)
    found = False
    for claim in clone.get("claims") or []:
        if claim.get("id") == claim_id:
            claim["revoked"] = True
            claim["status"] = "WITHHELD"
            found = True
    if not found:
        raise KeyError(claim_id)
    return clone


def expire_claim(registry: dict[str, Any], claim_id: str, as_of: str | None = None) -> dict[str, Any]:
    clone = copy.deepcopy(registry)
    day = as_of or _today().isoformat()
    found = False
    for claim in clone.get("claims") or []:
        if claim.get("id") == claim_id:
            claim["status"] = "EXPIRED"
            claim["expires_at"] = day
            found = True
    if not found:
        raise KeyError(claim_id)
    return clone


def withhold_claim(registry: dict[str, Any], claim_id: str, reason: str | None = None) -> dict[str, Any]:
    clone = copy.deepcopy(registry)
    found = False
    for claim in clone.get("claims") or []:
        if claim.get("id") == claim_id:
            claim["status"] = "WITHHELD"
            if reason:
                claim["withheld_reason"] = reason
            found = True
    if not found:
        raise KeyError(claim_id)
    return clone


def set_claim_status(
    registry: dict[str, Any],
    claim_id: str,
    status: str,
    **extra: Any,
) -> dict[str, Any]:
    if status not in STATUSES:
        raise ValueError(status)
    clone = copy.deepcopy(registry)
    found = False
    for claim in clone.get("claims") or []:
        if claim.get("id") == claim_id:
            claim["status"] = status
            claim.update(extra)
            found = True
    if not found:
        raise KeyError(claim_id)
    return clone


def claims_for_surface(
    registry: dict[str, Any],
    surface: str,
    *,
    now: date | datetime | str | None = None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for claim in registry.get("claims") or []:
        surfaces = claim.get("projection_surfaces") or []
        if surface not in surfaces:
            continue
        if not is_projectable(claim, now=now):
            continue
        out.append(claim)
    return out


def projectable_phrases(
    registry: dict[str, Any] | None = None,
    *,
    now: date | datetime | str | None = None,
) -> list[str]:
    data = registry if registry is not None else load_registry()
    phrases: list[str] = []
    for claim in data.get("claims") or []:
        if not is_projectable(claim, now=now):
            continue
        if claim.get("claim"):
            phrases.append(str(claim["claim"]))
        for phrase in claim.get("allowed_wording") or []:
            phrases.append(str(phrase))
    return phrases


def _merge_schema(target: dict[str, Any], incoming: dict[str, Any]) -> None:
    for key, value in incoming.items():
        if key == "sameAs":
            existing = target.get("sameAs")
            items: list[Any] = []
            if isinstance(existing, list):
                items.extend(existing)
            elif existing:
                items.append(existing)
            add = value if isinstance(value, list) else [value]
            for item in add:
                if item not in items:
                    items.append(item)
            target["sameAs"] = items
            continue
        if key == "hasCredential":
            existing = target.get("hasCredential")
            items = []
            if isinstance(existing, list):
                items.extend(existing)
            elif existing:
                items.append(existing)
            add = value if isinstance(value, list) else [value]
            for item in add:
                if item not in items:
                    items.append(item)
            target["hasCredential"] = items if len(items) != 1 else items[0]
            continue
        target[key] = copy.deepcopy(value)


def _format_br_date(iso: str) -> str:
    day = _parse_day(iso)
    if not day:
        return iso
    months = (
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    )
    return f"{day.day} de {months[day.month - 1]} de {day.year}"


def _visible_rows(surface: str, claims: list[dict[str, Any]]) -> list[tuple[str, str, dict[str, Any]]]:
    """Return (term, description_html, claim) for the commercial credential list."""
    by_id = {c["id"]: c for c in claims}
    order_confianca = (
        "org-legal-name",
        "org-cnpj",
        "org-situacao-ativa",
        "org-cadastral-address",
        "org-cnae-servicos-engenharia",
        "person-legal-name",
        "person-civil-eesc-usp",
        "service-art-nf",
        "service-national-formalities",
    )
    order_especialista = (
        "person-legal-name",
        "person-civil-eesc-usp",
        "org-legal-name",
        "org-cnpj",
        "org-cadastral-address",
        "service-art-nf",
        "service-national-formalities",
        "person-github",
    )
    preferred = order_especialista if "especialista" in surface else order_confianca
    ordered_ids: list[str] = []
    seen: set[str] = set()
    for cid in preferred:
        if cid in by_id:
            ordered_ids.append(cid)
            seen.add(cid)
    for cid in by_id:
        if cid not in seen:
            ordered_ids.append(cid)
    rows: list[tuple[str, str, dict[str, Any]]] = []
    for cid in ordered_ids:
        claim = by_id.get(cid)
        if not claim:
            continue
        wording = (claim.get("allowed_wording") or [claim["claim"]])[0]
        source = claim.get("source_reference") or {}
        url = source.get("url")
        extra = ""
        if cid == "org-cnpj" and url:
            extra = (
                f' · <a href="{escape(url, quote=True)}" rel="noopener" target="_blank">'
                "consultar na Receita Federal</a>"
            )
        elif cid == "person-github" and url:
            extra = (
                f' · <a href="{escape(url, quote=True)}" rel="noopener" target="_blank">'
                "github.com/tjsasakifln</a>"
            )
        elif cid == "service-national-formalities" and url:
            extra = (
                f' · <a href="{escape(url, quote=True)}" rel="noopener" target="_blank">'
                "ver regra de visto no Confea</a>"
            )
        term = {
            "org-legal-name": "Razão social",
            "org-cnpj": "CNPJ",
            "org-situacao-ativa": "Situação cadastral",
            "org-cadastral-address": "Endereço cadastral e fiscal",
            "org-cnae-servicos-engenharia": "CNAE principal",
            "org-crea-pj": "Registro CREA-SC da pessoa jurídica",
            "person-legal-name": "Responsável",
            "person-civil-eesc-usp": "Formação",
            "person-github": "Perfil técnico complementar",
            "person-crea-sc": "Registro CREA-SC",
            "person-rnp": "RNP",
            "person-titles-civil-sst": "Títulos profissionais",
            "person-sst-engineer": "Engenharia de Segurança do Trabalho",
            "person-cptec-registration": "Cadastro CPTEC/TJSC",
            "person-cptec-work-count": "Trabalhos no CPTEC/TJSC",
            "person-postgrad-valuations": "Pós-graduação",
            "service-art-nf": "Contratação",
            "service-national-formalities": "Atuação nacional",
        }.get(cid, claim["claim"])
        desc = (
            f'<span data-credential="{escape(wording, quote=True)}" data-credential-id="{escape(cid, quote=True)}">'
            f"{escape(wording)}</span>"
            f"{extra}"
        )
        source_class = str(claim.get("source_class") or "")
        if claim.get("status") == "VERIFIED" and source_class == "official_public_registry":
            status_label = "Conferido em fonte oficial"
        elif claim.get("status") == "VERIFIED" and source_class == "official_public_url":
            status_label = "Perfil público do titular"
        elif claim.get("status") == "VERIFIED":
            status_label = "Fonte registrada"
        elif source_class.startswith("owner_declared"):
            status_label = "Regra de atuação"
        elif claim.get("status") == "SELF_ATTESTED":
            status_label = "Informação declarada pelo titular"
        else:
            status_label = None
        if status_label:
            desc += f' <small class="credential-status">{escape(status_label)}</small>'
        rows.append((term, desc, claim))
    return rows


def render_visible_html(surface: str, claims: list[dict[str, Any]], as_of: str) -> str:
    rows = _visible_rows(surface, claims)
    items = "".join(
        f"<div class=\"credential-item\"><dt>{escape(term)}</dt><dd>{desc}</dd></div>"
        for term, desc, _claim in rows
    )
    heading = (
        "Identidade e formação"
        if "especialista" in surface
        else "Identidade e registros"
    )
    lead = (
        "Dados do profissional, da empresa e das regras de atuação, com origem e data."
        if "especialista" in surface
        else "Dados que identificam a empresa e quem a conduz, com origem e data."
    )
    limits: list[str] = []
    if any(c["id"] == "org-cadastral-address" for c in claims):
        limits.append(
            "O atendimento ocorre online ou no local do cliente, com agendamento. O endereço cadastral e fiscal não recebe visitas espontâneas."
        )
    if any(c["id"] == "service-art-nf" for c in claims):
        limits.append(
            "A proposta define o escopo e a atribuição profissional; a ART e a nota fiscal são tratadas quando aplicáveis ao serviço."
        )
    limit_html = "".join(f"<p class=\"credential-limit\">{escape(item)}</p>" for item in limits)
    return (
        f'<section class="credential-block" aria-labelledby="credenciais-titulo" data-credential-as-of="{escape(as_of)}">'
        f'<h2 id="credenciais-titulo">{heading}</h2>'
        f"<p>{escape(lead)}</p>"
        f'<dl class="credential-list">{items}</dl>'
        f"{limit_html}"
        f'<p class="credential-as-of">Informações conferidas em <time datetime="{escape(as_of)}">{escape(_format_br_date(as_of))}</time>. '
        "Os dados da pessoa jurídica vêm da consulta pública de CNPJ da Receita Federal; "
        "a formação em Engenharia Civil é informação declarada pelo titular.</p>"
        "</section>"
    )


def render_trust_proof_block(
    surface: str,
    claims: list[dict[str, Any]],
    as_of: str,
) -> str:
    """Render the reusable visible proof block from the same claims as JSON-LD."""
    return render_visible_html(surface, claims, as_of)


def project(
    registry: dict[str, Any],
    surface: str,
    *,
    now: date | datetime | str | None = None,
) -> Projection:
    if surface not in OWNED_SURFACES:
        raise ValueError(f"unowned_surface:{surface}")
    claims = claims_for_surface(registry, surface, now=now)
    as_of = str(registry.get("as_of") or _today(now).isoformat())
    proj = Projection(surface=surface, as_of=as_of)
    for claim in claims:
        proj.claim_ids.append(str(claim["id"]))
        if claim.get("claim"):
            proj.phrases.append(str(claim["claim"]))
        for phrase in claim.get("allowed_wording") or []:
            proj.phrases.append(str(phrase))
        schema = claim.get("schema") or {}
        if isinstance(schema, dict):
            if "Organization" in schema:
                _merge_schema(proj.schema_org, schema["Organization"])
            if "Person" in schema:
                _merge_schema(proj.schema_person, schema["Person"])
            if "ProfessionalService" in schema:
                _merge_schema(proj.schema_service, schema["ProfessionalService"])
        source = claim.get("source_reference") or {}
        url = source.get("url")
        if url:
            proj.official_links.append(
                {
                    "claim_id": str(claim["id"]),
                    "label": str(source.get("label") or url),
                    "url": str(url),
                }
            )
        if claim.get("scope"):
            proj.limits.append(str(claim["scope"]))
    if proj.schema_service and "url" not in proj.schema_service:
        proj.schema_service["url"] = f"https://confenge.com.br{surface}"
        proj.schema_service["provider"] = {"@id": "https://confenge.com.br/#organization"}
    projected = set(proj.claim_ids)
    for claim in registry.get("claims") or []:
        surfaces = claim.get("projection_surfaces") or []
        if surface not in surfaces:
            continue
        if str(claim.get("id")) in projected:
            continue
        proj.unprojected_phrases.extend(_claim_public_phrases(claim))
    proj.visible_html = render_trust_proof_block(surface, claims, as_of)
    defects = projection_defects(proj)
    if defects:
        raise ValueError(";".join(defects))
    return proj


_SKIP_PHRASE_VALUES = frozenset(
    {
        "BR",
        "SC",
        "ProfessionalLicense",
        "EducationalOccupationalCredential",
        "PostalAddress",
        "CollegeOrUniversity",
        "ProfessionalService",
        "Organization",
        "Person",
    }
)


def _claim_public_phrases(claim: dict[str, Any]) -> list[str]:
    phrases: list[str] = []
    if claim.get("claim"):
        phrases.append(str(claim["claim"]))
    for phrase in claim.get("allowed_wording") or []:
        phrases.append(str(phrase))

    def walk(obj: Any) -> None:
        if isinstance(obj, str):
            text = obj.strip()
            if len(text) < 8 or text in _SKIP_PHRASE_VALUES or text.startswith("http"):
                return
            phrases.append(text)
            return
        if isinstance(obj, dict):
            for value in obj.values():
                walk(value)
            return
        if isinstance(obj, list):
            for item in obj:
                walk(item)

    walk(claim.get("schema") or {})
    # Longest first so "Confenge Serviços..." is removed before a substring.
    unique = sorted(set(phrases), key=len, reverse=True)
    return unique


def _asserted_match(blob: str, pat: str) -> bool:
    for match in re.finditer(pat, blob, flags=re.I):
        window = blob[max(0, match.start() - 48) : match.start()]
        if re.search(r"\b(n[aã]o|n[aã]o é|nao e|sem|nunca|jamais|evitar|proibid|nem)\b", window):
            continue
        return True
    return False


def projection_defects(proj: Projection) -> list[str]:
    blob = _norm(proj.visible_text + " " + json.dumps(proj.schema_nodes, ensure_ascii=False))
    errors: list[str] = []
    for pat in FORBIDDEN_COPY_PATTERNS:
        if _asserted_match(blob, pat):
            errors.append(f"forbidden_copy:{pat}")
    for pat in ACTIVE_CASE_PATTERNS:
        if _asserted_match(blob, pat):
            errors.append(f"active_case:{pat}")
    for pat in STOREFRONT_PATTERNS:
        if _asserted_match(blob, pat):
            errors.append(f"storefront:{pat}")
    errors.extend(visible_schema_parity_errors(proj))
    return errors


def _norm(text: str) -> str:
    folded = (
        unescape(text or "")
        .lower()
        .replace("º", "o")
        .replace("°", "o")
    )
    folded = re.sub(r"\s+", " ", folded)
    return folded.strip()


def visible_schema_parity_errors(proj: Projection) -> list[str]:
    visible = _norm(proj.visible_text)
    errors: list[str] = []

    def must_see(value: Any, label: str) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            for nested in value.values():
                must_see(nested, label)
            return
        if isinstance(value, list):
            for nested in value:
                must_see(nested, label)
            return
        text = str(value).strip()
        if not text or text.startswith("https://schema.org") or text in {
            "Organization",
            "Person",
            "PostalAddress",
            "CollegeOrUniversity",
            "EducationalOccupationalCredential",
            "ProfessionalLicense",
            "ProfessionalService",
            "Country",
            "BR",
            "SC",
        }:
            return
        if text.startswith("https://confenge.com.br"):
            return
        if text.startswith("{"):
            return
        if text.startswith("https://"):
            host_path = re.sub(r"^https://", "", text).rstrip("/")
            if host_path.lower() in visible or host_path.split("/", 1)[0].lower() in visible:
                return
        if _norm(text) in visible:
            return
        if any(_norm(text) in _norm(p) for p in proj.phrases):
            return
        errors.append(f"schema_not_visible:{label}:{text}")

    must_see(proj.schema_org, "Organization")
    must_see(proj.schema_person, "Person")
    must_see(proj.schema_service, "ProfessionalService")
    return errors


def allowed_schema_values(
    registry: dict[str, Any] | None = None,
    *,
    surface: str | None = None,
) -> dict[str, set[str]]:
    data = registry if registry is not None else load_registry()
    allowed: dict[str, set[str]] = {
        "legalName": set(),
        "taxID": set(),
        "jobTitle": set(),
        "sameAs": set(),
        "alumniOf": set(),
        "hasCredential": set(),
        "areaServed": set(),
        "address": set(),
        "streetAddress": set(),
        "addressLocality": set(),
        "addressRegion": set(),
        "postalCode": set(),
        "addressCountry": set(),
        "name": set(),
        "description": set(),
        "identifier": set(),
        "credentialCategory": set(),
    }
    for claim in data.get("claims") or []:
        if not is_projectable(claim):
            continue
        if surface is not None and surface not in (claim.get("projection_surfaces") or []):
            continue
        schema = claim.get("schema") or {}
        if not isinstance(schema, dict):
            continue

        def walk(obj: Any, parent_key: str | None) -> None:
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if key.startswith("@"):
                        continue
                    if isinstance(value, dict) and key in allowed:
                        allowed[key].add(
                            json.dumps(value, ensure_ascii=False, sort_keys=True)
                        )
                    if isinstance(value, str) and key in allowed:
                        allowed[key].add(value)
                        if parent_key == "hasCredential":
                            allowed["hasCredential"].add(value)
                    walk(value, parent_key=key)
            elif isinstance(obj, list):
                for item in obj:
                    if isinstance(item, str):
                        if parent_key == "sameAs":
                            allowed["sameAs"].add(item)
                        elif parent_key == "hasCredential":
                            allowed["hasCredential"].add(item)
                    else:
                        walk(item, parent_key=parent_key)

        walk(schema, parent_key=None)
        for phrase in claim.get("allowed_wording") or []:
            if claim.get("id") == "org-cnpj":
                allowed["taxID"].add(str(phrase).replace("CNPJ ", "").strip())
    for tax in list(allowed["taxID"]):
        digits = re.sub(r"\D", "", tax)
        if len(digits) == 14:
            allowed["taxID"].add(digits)
            allowed["taxID"].add(
                f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
            )
    return allowed


def owned_surface(html: str = "", relative_path: str | None = None) -> str | None:
    """Resolve one owned surface without granting by incidental page links."""
    if relative_path is not None:
        rel = relative_path.replace("\\", "/").lstrip("./")
        return OWNED_SURFACE_BY_RELATIVE_PATH.get(rel)
    raw = html or ""
    canonical = re.search(
        r'<link\b(?=[^>]*\brel=["\']canonical["\'])(?=[^>]*\bhref=["\']([^"\']+)["\'])[^>]*>',
        raw,
        re.I,
    )
    if not canonical:
        return None
    url = canonical.group(1)
    for surface in OWNED_SURFACES:
        if url == f"https://confenge.com.br{surface}":
            return surface
    return None


def is_owned_surface(html: str = "", relative_path: str | None = None) -> bool:
    return owned_surface(html, relative_path) is not None


def schema_value_allowed(key: str, value: Any, allowed: dict[str, set[str]] | None = None) -> bool:
    table = allowed if allowed is not None else allowed_schema_values()
    accepted = table.get(key) or set()
    if isinstance(value, str):
        return value in accepted
    if isinstance(value, list):
        return all(schema_value_allowed(key, item, table) for item in value)
    if isinstance(value, dict):
        serialized = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if serialized in accepted:
            return True
        if key == "address":
            return False
        if key == "hasCredential":
            nested = value.get("name") or value.get("identifier")
            cred_names = (table.get("hasCredential") or set()) | (table.get("identifier") or set())
            return isinstance(nested, str) and nested in cred_names
        if key == "alumniOf":
            nested = value.get("name")
            return isinstance(nested, str) and nested in (table.get("alumniOf") or set()).union(
                table.get("name") or set()
            )
        name = value.get("name") or value.get("identifier") or value.get("credentialID")
        if isinstance(name, str) and name in accepted.union(table.get("name") or set()):
            return True
    return False


def apply_to_html(html: str, proj: Projection) -> str:
    rendered = html
    if REGION_START in rendered and REGION_END in rendered:
        rendered = re.sub(
            re.escape(REGION_START) + r".*?" + re.escape(REGION_END),
            REGION_START + proj.visible_html + REGION_END,
            rendered,
            count=1,
            flags=re.S,
        )
    else:
        rendered = rendered.replace(
            "<main",
            f"<main data-missing-credential-region=\"true\"",
            1,
        )

    def replace(match: re.Match[str]) -> str:
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            return match.group(0)
        _patch_jsonld(payload, proj)
        _scrub_unprojected_jsonld(payload, proj.unprojected_phrases)
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        return f"{match.group(1)}{body}{match.group(3)}"

    rendered = JSON_LD_RE.sub(replace, rendered)
    rendered = _scrub_unprojected_meta(rendered, proj.unprojected_phrases)
    return _scrub_unprojected_visible(rendered, proj.unprojected_phrases)


def _scrub_phrase(text: str, phrase: str) -> str:
    if not phrase or phrase not in text:
        return text
    cleaned = text.replace(phrase, "")
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r",\s*,", ",", cleaned)
    cleaned = re.sub(r"\s+de\s+,", " ", cleaned)
    return cleaned.strip(" ,")


def _scrub_unprojected_jsonld(payload: Any, phrases: list[str]) -> None:
    if not phrases:
        return
    if isinstance(payload, list):
        for item in payload:
            _scrub_unprojected_jsonld(item, phrases)
        return
    if not isinstance(payload, dict):
        return
    for key, value in list(payload.items()):
        if isinstance(value, str):
            updated = value
            for phrase in phrases:
                updated = _scrub_phrase(updated, phrase)
            if updated != value:
                if updated:
                    payload[key] = updated
                else:
                    del payload[key]
        else:
            _scrub_unprojected_jsonld(value, phrases)


def _scrub_unprojected_meta(html: str, phrases: list[str]) -> str:
    if not phrases:
        return html

    def scrub_content(content: str) -> str:
        for phrase in phrases:
            content = _scrub_phrase(content, phrase)
        return content

    def replace_content_first(match: re.Match[str]) -> str:
        return f"{match.group(1)}{scrub_content(match.group(2))}{match.group(3)}"

    def replace_name_first(match: re.Match[str]) -> str:
        return f"{match.group(1)}{scrub_content(match.group(2))}{match.group(3)}"

    desc = r'name=["\']description["\']|property=["\'](?:og|twitter):description["\']'
    html = re.sub(
        rf'(<meta\b[^>]*content=["\'])([^"\']*)(["\'][^>]*(?:{desc}))',
        replace_content_first,
        html,
        flags=re.I,
    )
    html = re.sub(
        rf'(<meta\b[^>]*(?:{desc})[^>]*content=["\'])([^"\']*)(["\'])',
        replace_name_first,
        html,
        flags=re.I,
    )
    return html


def _scrub_unprojected_visible(html: str, phrases: list[str]) -> str:
    """Remove withdrawn wording from text nodes without rewriting markup or JS."""
    if not phrases:
        return html
    protected_or_tag = re.compile(
        r"(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>)",
        flags=re.I | re.S,
    )
    parts = protected_or_tag.split(html)
    for index, part in enumerate(parts):
        if not part or part.startswith("<"):
            continue
        updated = part
        for phrase in phrases:
            updated = _scrub_phrase(updated, phrase)
        parts[index] = updated
    return "".join(parts)


def _types(node: dict[str, Any]) -> set[str]:
    raw = node.get("@type")
    if isinstance(raw, str):
        return {raw}
    if isinstance(raw, list):
        return {str(x) for x in raw}
    return set()


def _patch_jsonld(payload: Any, proj: Projection) -> None:
    nodes: list[dict[str, Any]]
    if isinstance(payload, dict) and isinstance(payload.get("@graph"), list):
        nodes = [n for n in payload["@graph"] if isinstance(n, dict)]
        container: list[Any] = payload["@graph"]
    elif isinstance(payload, list):
        nodes = [n for n in payload if isinstance(n, dict)]
        container = payload
    elif isinstance(payload, dict):
        nodes = [payload]
        container = None
    else:
        return

    org = next((n for n in nodes if "Organization" in _types(n)), None)
    person = next((n for n in nodes if "Person" in _types(n)), None)
    service = next((n for n in nodes if "ProfessionalService" in _types(n)), None)

    if org is not None:
        for key in MANAGED_ORG_KEYS:
            org.pop(key, None)
        org.update(copy.deepcopy(proj.schema_org))
    if person is not None:
        for key in MANAGED_PERSON_KEYS:
            person.pop(key, None)
        person.update(copy.deepcopy(proj.schema_person))
    if proj.schema_service:
        body = copy.deepcopy(proj.schema_service)
        body.setdefault("@type", "ProfessionalService")
        body.setdefault("@id", "https://confenge.com.br/#professionalservice")
        if service is None and container is not None:
            container.append(body)
        elif service is not None:
            for key in MANAGED_SERVICE_KEYS:
                service.pop(key, None)
            service.update(body)
    elif service is not None:
        if container is not None:
            container[:] = [n for n in container if n is not service]


def sync_owned_pages(
    registry: dict[str, Any] | None = None,
    *,
    root: Path | None = None,
    now: date | datetime | str | None = None,
) -> dict[str, str]:
    data = registry if registry is not None else load_registry()
    errors = validate_registry(data)
    if errors:
        raise ValueError(f"invalid_registry:{errors}")
    base = root or ROOT
    written: dict[str, str] = {}
    mapping = {
        "/confianca/": base / "confianca" / "index.html",
        "/especialista/tiago-jun-sasaki/": base / "especialista" / "tiago-jun-sasaki" / "index.html",
    }
    for surface, path in mapping.items():
        html = path.read_text(encoding="utf-8")
        proj = project(data, surface, now=now)
        updated = apply_to_html(html, proj)
        path.write_text(updated, encoding="utf-8")
        written[surface] = str(path)
    return written


def client_proof_approved_count(path: Path | None = None) -> int:
    target = path or PERMISSIONED_PROOF_PATH
    data = json.loads(target.read_text(encoding="utf-8"))
    return int(data.get("approved_public_proof_count") or 0)


def visible_text_of(html: str) -> str:
    without = JSON_LD_RE.sub(" ", html or "")
    without = re.sub(r"<script\b[^>]*>.*?</script>", " ", without, flags=re.I | re.S)
    without = re.sub(r"<style\b[^>]*>.*?</style>", " ", without, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", without)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def withheld_visible_claim_errors(
    html: str,
    registry: dict[str, Any] | None = None,
) -> list[str]:
    """Reject visible aliases or wording for every non-projectable claim.

    This deliberately scans the complete rendered page text, not only the
    registry-managed credential region: a byline or a new tool header cannot
    reintroduce a withheld claim beside an otherwise clean projection.
    """
    data = registry if registry is not None else load_registry()
    visible = _norm(visible_text_of(html))
    errors: list[str] = []
    for claim in data.get("claims") or []:
        if is_projectable(claim):
            continue
        phrases = [
            str(claim.get("claim") or ""),
            *(str(value) for value in claim.get("allowed_wording") or []),
            *(str(value) for value in claim.get("visible_aliases") or []),
        ]
        for phrase in sorted({_norm(value) for value in phrases if _norm(value)}, key=len, reverse=True):
            if phrase and phrase in visible:
                errors.append(f"withheld_claim_visible:{claim.get('id')}:{phrase}")
    return sorted(set(errors))


def extract_jsonld_nodes(html: str) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for match in JSON_LD_RE.finditer(html or ""):
        try:
            payload = json.loads(match.group(2))
        except json.JSONDecodeError:
            continue
        stack: list[Any] = [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                if item.get("@graph"):
                    stack.extend(item["@graph"] if isinstance(item["@graph"], list) else [item["@graph"]])
                if item.get("@type"):
                    nodes.append(item)
    return nodes


def jsonld_blob(html: str) -> str:
    return json.dumps(extract_jsonld_nodes(html), ensure_ascii=False)


if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "validate"
    registry = load_registry()
    if cmd == "validate":
        errors = validate_registry(registry)
        print("OK" if not errors else "FAIL")
        for err in errors:
            print(err)
        raise SystemExit(1 if errors else 0)
    if cmd == "sync":
        written = sync_owned_pages(registry)
        for surface, path in written.items():
            print(surface, path)
        raise SystemExit(0)
    raise SystemExit(f"unknown command: {cmd}")
