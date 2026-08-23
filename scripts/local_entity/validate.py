"""Fail-closed gates: invented NAP/review/credential, PII, collapse, GSC-as-zero, trees, landing."""

from __future__ import annotations

import json
import re
from typing import Any

from scripts.site.authority import INVENTED_CREDENTIAL_PATTERNS

from scripts.local_entity.census import validate_census, validate_gsc_live
from scripts.local_entity.constants import (
    ALLOWED_PUBLIC_CNPJ,
    ALLOWED_PUBLIC_EMAILS,
    ALLOWED_WRITE_PREFIXES,
    CLAIM_STATUSES,
    FORBIDDEN_LOCAL_TYPES,
    FORBIDDEN_REVIEW_TYPES,
    GSC_SOURCES,
    PERSONAL_EMAIL_DOMAINS,
    SURFACE_DECISIONS,
)
from scripts.local_entity.graph import extract_entity_graph, invented_type_hits, types_of, visible_text
from scripts.local_entity.pack import citation_target_defects, gbp_checklist_defects


class LocalEntityError(ValueError):
    """Fail-closed local-entity defect."""


class ExclusivePathError(LocalEntityError):
    """Write path outside the campaign exclusive trees."""


class PIILeakError(LocalEntityError):
    """Committed artifact would leak PII or secrets."""


_CPF_RE = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
_HOME_RE = re.compile(
    r"(endere[cç]o residencial|resid[eê]ncia particular|private home address)\s*[:\-]\s*[A-Za-z0-9].{8,}",
    re.I,
)
_CRED_JSON_RE = re.compile(
    r"BEGIN PRIVATE KEY|"
    r'"type"\s*:\s*"service_account"|'
    r'"private_key"|'
    r"GSC_CREDENTIALS_JSON\s*[:=]\s*\{",
    re.I,
)
_NEGATION = re.compile(r"\b(n[aã]o|nao|sem |nunca|jamais|evitar|proibid|do not|not a )\b", re.I)


def audit_graph_honesty(graph: dict[str, Any], html: str = "") -> list[str]:
    errors: list[str] = []
    hits = invented_type_hits(graph)
    for item in sorted(hits):
        if item in FORBIDDEN_REVIEW_TYPES or item in {"review", "aggregateRating"}:
            errors.append(f"invented_review:{item}")
        elif item in FORBIDDEN_LOCAL_TYPES or item in {
            "streetAddress",
            "postalCode",
            "addressLocality",
            "hasMap",
            "geo",
            "latitude",
            "longitude",
        }:
            errors.append(f"invented_nap:{item}")
        else:
            errors.append(f"invented_local_field:{item}")
    for node in graph.get("nodes") or []:
        kinds = types_of(node)
        if kinds & FORBIDDEN_REVIEW_TYPES:
            errors.append(f"invented_review:{sorted(kinds & FORBIDDEN_REVIEW_TYPES)}")
        if "LocalBusiness" in kinds:
            errors.append("invented_local_business")
        if node.get("review") or node.get("aggregateRating"):
            errors.append("invented_review_markup")
        cred = node.get("hasCredential")
        if cred:
            blob = json.dumps(cred, ensure_ascii=False)
            if re.search(r"\bcrea\b", blob, re.I):
                errors.append("invented_credential:crea")
    blob = visible_text(html).lower() if html else ""
    raw = (html or "").lower()
    search = blob + " " + raw
    for pat in INVENTED_CREDENTIAL_PATTERNS:
        for match in re.finditer(pat, search):
            window = search[max(0, match.start() - 48) : match.start()]
            if _NEGATION.search(window):
                continue
            errors.append(f"invented_credential:{pat}")
            break
    return sorted(set(str(e) for e in errors))


def audit_html_honesty(html: str) -> list[str]:
    return audit_graph_honesty(extract_entity_graph(html), html)


def classify_status_errors(classified: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    claims = classified.get("claims") or []
    if not claims:
        return ["claims_absent"]
    fields = {c.get("field") for c in claims}
    for required in ("@id", "credentials", "worksFor", "knowsAbout", "sameAs", "contact", "areaServed"):
        if required not in fields:
            errors.append(f"graph_field_absent:{required}")
    for claim in claims:
        status = claim.get("status")
        if status not in CLAIM_STATUSES:
            errors.append(f"invalid_claim_status:{claim.get('id')}:{status}")
        source = str(claim.get("basis") or "")
        if (
            claim.get("status") == "VERIFIED"
            and "perfil-publico-especialista" in source
            and claim.get("third_party_verified") is True
        ):
            errors.append(f"self_attested_upgraded:{claim.get('id')}")
    return errors


def new_public_landing_paths(paths: list[str]) -> list[str]:
    landings: list[str] = []
    for raw in paths:
        p = raw.replace("\\", "/").lstrip("./")
        if not p.endswith("index.html") and not p.endswith(".html"):
            continue
        if p.startswith(ALLOWED_WRITE_PREFIXES):
            continue
        if p.startswith("especialista/tiago-jun-sasaki/"):
            continue
        if p.startswith(("docs/", "data/", "scripts/", "tests/", "seo/", ".github/")):
            continue
        landings.append(p)
    return landings


def assert_exclusive_write_paths(paths: list[str]) -> None:
    forbidden: list[str] = []
    for raw in paths:
        p = raw.replace("\\", "/").lstrip("./")
        if p in {".git", ""}:
            continue
        ok = any(p == prefix.rstrip("/") or p.startswith(prefix) for prefix in ALLOWED_WRITE_PREFIXES)
        if not ok:
            forbidden.append(p)
    if forbidden:
        raise ExclusivePathError("forbidden_tree:" + ",".join(sorted(forbidden)))


def scan_artifact_payload(doc: Any, name: str = "") -> list[str]:
    text = json.dumps(doc, ensure_ascii=False) if not isinstance(doc, str) else doc
    errors: list[str] = []
    if _CPF_RE.search(text):
        errors.append("pii_cpf")
    if _HOME_RE.search(text):
        errors.append("pii_private_home")
    if _CRED_JSON_RE.search(text):
        errors.append("credential_json")
    for match in _EMAIL_RE.finditer(text):
        email = match.group(0).lower()
        if email in ALLOWED_PUBLIC_EMAILS:
            continue
        host = email.rsplit("@", 1)[-1]
        if host in PERSONAL_EMAIL_DOMAINS:
            errors.append(f"pii_personal_email:{email}")
        elif host.endswith("confenge.com.br") and email not in ALLOWED_PUBLIC_EMAILS:
            errors.append(f"pii_extra_email:{email}")
    if re.search(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", text):
        for m in re.finditer(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", text):
            if m.group(0) not in ALLOWED_PUBLIC_CNPJ:
                errors.append(f"unexpected_cnpj:{m.group(0)}")
    if isinstance(doc, dict):
        errors.extend(_scan_nested(doc, name))
    return sorted(set(errors))


def _scan_nested(doc: dict[str, Any], name: str) -> list[str]:
    errors: list[str] = []
    if name.endswith("entity-graph.json") or name.endswith("classified.json"):
        org = (doc.get("graph") or {}).get("organization") or doc.get("organization") or {}
        if isinstance(org, dict) and org.get("streetAddress"):
            errors.append("invented_nap:streetAddress")
    rows = doc.get("rows") if isinstance(doc.get("rows"), list) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        source = str(row.get("source") or "")
        q = str(row.get("query_or_context") or "")
        if source in GSC_SOURCES and not q.startswith("sha256:"):
            errors.append("raw_gsc_query_text")
    gsc = doc.get("gsc_live") if isinstance(doc.get("gsc_live"), dict) else {}
    if gsc:
        errors.extend(f"gsc:{e}" for e in validate_gsc_live(gsc))
    if doc.get("targets"):
        errors.extend(citation_target_defects(doc))
    if doc.get("steps"):
        blob = "\n".join(str(s.get("action") or "") for s in doc.get("steps") or [])
        errors.extend(gbp_checklist_defects(blob))
    return errors


def validate_bundle(bundle: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    graph = bundle.get("graph") or {}
    html = bundle.get("html") or ""
    errors.extend(audit_graph_honesty(graph, html))
    for surface in bundle.get("additional_public_surfaces") or []:
        if not isinstance(surface, dict):
            errors.append("public_surface_invalid")
            continue
        surface_id = str(surface.get("id") or "unnamed")
        surface_graph = surface.get("graph") or {}
        surface_html = surface.get("html") or ""
        errors.extend(
            f"public_surface:{surface_id}:{error}"
            for error in audit_graph_honesty(surface_graph, surface_html)
        )
    classified = bundle.get("classified") or {}
    errors.extend(classify_status_errors(classified))
    census = bundle.get("census") or {}
    errors.extend(validate_census(census))
    decision = bundle.get("decision") or {}
    token = decision.get("decision")
    if token not in SURFACE_DECISIONS:
        errors.append(f"decision_not_in_enum:{token}")
    if decision.get("new_public_landing_created") is not False:
        errors.append("new_public_landing_created")
    pack = bundle.get("gbp") or {}
    if pack:
        blob = "\n".join(str(s.get("action") or "") for s in pack.get("steps") or [])
        errors.extend(gbp_checklist_defects(blob))
        if pack.get("login_required") or pack.get("mutation") or pack.get("api_write"):
            errors.append("gbp_not_readonly")
    citations = bundle.get("citations") or {}
    if citations:
        errors.extend(citation_target_defects(citations))
    for key, doc in (
        ("classified", classified),
        ("census", census),
        ("decision", decision),
        ("citations", citations),
        ("gbp", pack),
    ):
        errors.extend(f"{key}:{e}" for e in scan_artifact_payload(doc, key))
    changed = bundle.get("changed_paths")
    if changed is not None:
        try:
            assert_exclusive_write_paths(list(changed))
        except ExclusivePathError as exc:
            errors.append(str(exc))
        landings = new_public_landing_paths(list(changed))
        if landings:
            errors.append("new_public_landing:" + ",".join(landings))
    return sorted(set(errors))


def require_clean(errors: list[str], prefix: str = "local_entity") -> None:
    if errors:
        raise LocalEntityError(prefix + ":" + ";".join(errors))
