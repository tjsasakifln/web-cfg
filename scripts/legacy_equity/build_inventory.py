#!/usr/bin/env python3
"""Build the hash-pinned SmartLic → CONFENGE inventory (six-action table).

Reads the committed v1 manifesto URL set (do not drop coverage) plus the
versioned GSC/donor extracts. Does not call live GSC/backlink APIs.
UNKNOWN stays UNKNOWN.

Writes identical bytes to:
  data/migrations/smartlic-url-map/inventory.v2.json
  data/migration/smartlic-confenge/manifesto.v1.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.inventory import (  # noqa: E402
    DEFAULT_QUERY_STRING_POLICY,
    INVENTORY_PATH,
    MANIFESTO_PATH,
    inventory_sha256,
    validate_inventory,
)

LEGACY_ORIGIN = "https://smartlic.tech"
CONFENGE = "https://confenge.com.br"
STABLE_GENERATED_AT = "2026-08-16T00:00:00Z"

QUERY_RULE = DEFAULT_QUERY_STRING_POLICY

FRAGMENT_BEHAVIOR = "not forwarded — fragments are client-only and never appear in Location"
TRAILING_SLASH_POLICY = "legacy path is normalized by stripping a trailing slash except for /"
CASE_NORMALIZATION = "host lowercase; path case preserved; no case-fold of slug"
EXPIRY_RETENTION = (
    "Retain the 301 until 28-day observation of this hash completes, residual "
    "priority errors are zero, later-discovered critical backlinks are accepted "
    "or remapped, and SmartLic#2111 archive gate is satisfied."
)

ROLLBACK = (
    "Restore previous CONFENGE Netlify publish SHA and this inventory hash. "
    "Do not reactivate SmartLic as a product, SaaS, brand or public runtime. "
    "Bridge rollback is SmartLic#2115 (DNS/proxy to last non-destructive state)."
)
REMOVAL_TRIGGER = (
    "Remove smartlic.tech bridge only after: 28-day observation of this hash, "
    "zero residual priority 404/5xx/chain, critical backlinks (if any become known) "
    "point at CONFENGE or are accepted as retired, and SmartLic#2111 archive gate."
)
MONITORING = {
    "window_days": 28,
    "starts": "after SmartLic#2115 cutover of this inventory hash — NOT started in this PR",
    "sources": [
        "GSC property smartlic.tech (UNKNOWN until export)",
        "GSC property confenge.com.br",
        "target HTTP crawl",
        "bridge aggregated request counts",
    ],
    "investigate_if": [
        "priority ready target returns unexpected 404/5xx",
        "redirect chain/loop/soft-404 on a ready row",
        "material drop in GSC clicks/impressions on ready legacy paths after cutover (threshold in handoff)",
        "HOLD row starts returning 301 (fail-closed violated)",
    ],
}

# Future CONFENGE surfaces that are NOT live. Never put a live weak URL here.
HOLD_EXACT: dict[str, tuple[str, str]] = {
    "/como-avaliar-licitacao": (
        "CONFENGE tender-evaluation guide (not live)",
        "Tender-evaluation job belongs to a future inbound vertical; no ready 1:1 CONFENGE page.",
    ),
    "/como-evitar-prejuizo-licitacao": (
        "CONFENGE bid-loss prevention guide (not live)",
        "Bid-loss prevention is a future tender-operations surface; not #60 margin-defense.",
    ),
    "/como-filtrar-editais": (
        "CONFENGE edital-filtering guide (not live)",
        "Edital filtering is a future tender-discovery surface; bid-room is not 1:1.",
    ),
    "/como-priorizar-oportunidades": (
        "CONFENGE opportunity-prioritization guide (not live)",
        "Opportunity prioritization is a future tender-operations surface.",
    ),
    "/licitacoes": (
        "CONFENGE tenders hub (not live)",
        "Tender-discovery hub has no ready CONFENGE equivalent; parent dumps forbidden.",
    ),
    "/licitacoes-publicas-2026": (
        "CONFENGE 2026 tenders landing (not live)",
        "Calendar/year landing is a future tender-discovery surface.",
    ),
    "/contratos": (
        "CONFENGE public-contracts explorer (not live)",
        "Contracts explorer would be a new public-read vertical, not a #60 pillar.",
    ),
    "/cnpj": (
        "CONFENGE CNPJ/company lookup hub (not live)",
        "Company-lookup hub is a future extra-cli public-read surface; farm instances stay retired.",
    ),
    "/fornecedores": (
        "CONFENGE suppliers hub (not live)",
        "Supplier explorer hub is a future public-read surface; /fornecedores/{id} farm stays retired.",
    ),
    "/orgaos": (
        "CONFENGE agencies hub (not live)",
        "Agency explorer hub is a future public-read surface; /orgaos/{slug} farm stays retired.",
    ),
    "/municipios": (
        "CONFENGE municipalities hub (not live)",
        "Municipality explorer hub is a future public-read surface; farm instances stay retired.",
    ),
    "/glossario": (
        "CONFENGE glossary hub (not live)",
        "No CONFENGE glossary hub exists; individual ready terms already REDIRECT_301.",
    ),
    "/perguntas": (
        "CONFENGE Q&A hub (not live)",
        "No CONFENGE perguntas hub exists; ready Q&A slugs already REDIRECT_301.",
    ),
    "/guia": (
        "CONFENGE guides hub (not live)",
        "CONFENGE /guias-contratos-obras/ is a different corpus, not a 1:1 SmartLic /guia hub.",
    ),
}

HOLD_BLOG = {
    "como-consultar-contratos-publicos-pncp": (
        "CONFENGE PNCP/public-contracts explorer (not live)",
        "PNCP contract-lookup how-to belongs to a future public-read vertical.",
    ),
    "pncp-guia-completo-empresas": (
        "CONFENGE PNCP guide (not live)",
        "PNCP how-to for firms is a future surface; no ready 1:1 CONFENGE page.",
    ),
    "pncp-consulta-contratos-passo-a-passo": (
        "CONFENGE PNCP contracts how-to (not live)",
        "Step-by-step PNCP contract lookup is a future public-read surface.",
    ),
    "pncp-api-integracao-empresas": (
        "CONFENGE PNCP integration note (not live)",
        "PNCP API integration is a future developer/data surface.",
    ),
    "pncp-dispensa-licitacao-quando-aplicar": (
        "CONFENGE dispensa guide (not live)",
        "Dispensa-when-to-apply is a future lei-14133 child, not the parent hub.",
    ),
    "pncp-erros-comuns-empresas-iniciantes": (
        "CONFENGE PNCP common-errors guide (not live)",
        "PNCP beginner errors belong to a future PNCP guide, not a #60 pillar.",
    ),
    "pncp-modalidade-pregao-eletronico": (
        "CONFENGE pregão eletrônico guide (not live)",
        "Pregão modality explainer is a future tender-operations surface.",
    ),
    "pncp-registro-precos-como-participar": (
        "CONFENGE registro-de-preços guide (not live)",
        "SRP participation is a future tender-operations surface.",
    ),
    "pncp-timeline-publicacao-edital": (
        "CONFENGE edital-publication timeline (not live)",
        "Edital calendar/timeline is a future tender-operations surface.",
    ),
    "pncp-vs-comprasgov-diferencas": (
        "CONFENGE PNCP vs Compras.gov explainer (not live)",
        "Portal comparison is a future tender-operations surface.",
    ),
    "como-participar-primeira-licitacao-2026": (
        "CONFENGE first-tender participation guide (not live)",
        "First-tender how-to is a future inbound vertical; bid-room is not 1:1.",
    ),
    "licitacoes-engenharia-2026": (
        "CONFENGE engineering-tenders surface (not live)",
        "Engineering tender discovery is a future vertical; bid-room is not 1:1.",
    ),
    "subcontratacao-licitacoes-regras-lei-14133": (
        "CONFENGE lei-14133 subcontracting child (not live)",
        "Subcontracting rules need a dedicated child; parent /lei-14133-obras/ dump is forbidden.",
    ),
    "lei-14133-guia-fornecedores": (
        "CONFENGE lei-14133 supplier guide (not live)",
        "Supplier-facing lei-14133 guide is a future child, not the parent hub.",
    ),
    "prazo-vigencia-contratos-publicos-guia": (
        "CONFENGE contract-term/vigência guide (not live)",
        "Vigência how-to is a future contracts-operations surface.",
    ),
    "impugnacao-edital-quando-como-contestar": (
        "CONFENGE impugnação guide (not live)",
        "Impugnação how-to is a future lei-14133 child.",
    ),
    "checklist-habilitacao-licitacao-2026": (
        "CONFENGE habilitação checklist (not live)",
        "Habilitação checklist is a future tender-operations surface.",
    ),
    "clausulas-escondidas-editais-licitacao": (
        "CONFENGE hidden-clause edital guide (not live)",
        "Edital-clause review is a future tender-operations surface.",
    ),
}

HOLD_PERGUNTAS = {
    "prazo-publicacao-edital": (
        "CONFENGE edital-publication timing page (not live)",
        "Edital calendar question has no ready 1:1 CONFENGE page.",
    ),
    "subcontratacao-permitida-licitacao": (
        "CONFENGE lei-14133 subcontracting child (not live)",
        "Same job as the subcontracting blog; parent hub dump forbidden.",
    ),
    "bdi-composicao-licitacao": (
        "CONFENGE BDI explainer (not live)",
        "analises-contratos-publicos/bdi-composicao-vs-referencia-sc/ is a case study, not a 1:1 guide.",
    ),
    "qualificacao-tecnica-lei-14133": (
        "CONFENGE lei-14133 qualification child (not live)",
        "Technical qualification is a future lei-14133 child, not the parent hub.",
    ),
    "pncp-o-que-e-como-usar": (
        "CONFENGE PNCP explainer (not live)",
        "PNCP what/how is a future public-read surface.",
    ),
    "cadastro-pncp-fornecedor": (
        "CONFENGE PNCP supplier-registration guide (not live)",
        "PNCP cadastro is a future tender-operations surface.",
    ),
    "vigencia-contrato-administrativo": (
        "CONFENGE contract vigência guide (not live)",
        "Administrative-contract term question is a future contracts-operations surface.",
    ),
    "prazo-impugnacao-edital": (
        "CONFENGE impugnação timing page (not live)",
        "Impugnação deadline is a future lei-14133 child.",
    ),
    "licitacao-obras-engenharia-qualificacao": (
        "CONFENGE obras qualification guide (not live)",
        "Engineering qualification is a future lei-14133/obras child.",
    ),
    "documentos-habilitacao-licitacao": (
        "CONFENGE habilitação documents guide (not live)",
        "Habilitação document list is a future tender-operations surface.",
    ),
    "atestado-capacidade-tecnica": (
        "CONFENGE atestado de capacidade técnica guide (not live)",
        "ACT how-to is a future tender-operations surface.",
    ),
    "assinatura-eletronica-contratos-publicos": (
        "CONFENGE electronic-signature contracts guide (not live)",
        "e-signature on public contracts is a future contracts-operations surface.",
    ),
}

# WEB-017 nominal review: one v2 ready row targeted a different visitor job.
# Payment-delay risk is the atraso-de-pagamento article, not work-delay/prorrogação.
READY_TARGET_OVERRIDES: dict[str, dict[str, str]] = {
    "/blog/orgaos-risco-atraso-pagamento-licitacao": {
        "target": f"{CONFENGE}/conteudos/atraso-pagamento-contrato-publico-suspender/",
        "semantic_equivalence": (
            "Legacy post is about payment-delay risk in public contracts. "
            "CONFENGE article answers late public-contract payment and the "
            "contractor's documented response — not work-delay/prorrogação."
        ),
        "unique_utility": (
            "Indexable #60 payment-pressure article with next action. "
            "/atrasos-prorrogacao-obras-publicas/ is a different job (prazo/caminho crítico)."
        ),
    },
}

HOLD_GLOSSARIO = {
    "pncp": (
        "CONFENGE PNCP glossary/explainer (not live)",
        "PNCP term page waits for the PNCP public-read surface.",
    ),
    "bdi": (
        "CONFENGE BDI explainer (not live)",
        "BDI term is not equivalent to the SC case study.",
    ),
    "contrato-administrativo": (
        "CONFENGE contrato administrativo explainer (not live)",
        "General administrative-contract term has no ready 1:1 pillar.",
    ),
    "edital": (
        "CONFENGE edital explainer (not live)",
        "Edital term belongs to a future tender-operations surface.",
    ),
    "impugnacao": (
        "CONFENGE impugnação explainer (not live)",
        "Impugnação term waits for the lei-14133 child.",
    ),
    "atestado-de-capacidade-tecnica": (
        "CONFENGE ACT explainer (not live)",
        "ACT term waits for the habilitação/qualification surface.",
    ),
    "habilitacao": (
        "CONFENGE habilitação explainer (not live)",
        "Habilitação term waits for the tender-operations surface.",
    ),
    "estudo-tecnico-preliminar": (
        "CONFENGE ETP explainer (not live)",
        "ETP term is a future lei-14133 child.",
    ),
    "fiscalizacao": (
        "CONFENGE fiscalização explainer (not live)",
        "Contract inspection term is a future contracts-operations surface.",
    ),
    "garantia-contratual": (
        "CONFENGE garantia contratual explainer (not live)",
        "Contract-guarantee term is a future contracts-operations surface.",
    ),
}


def _norm_path(url_or_path: str) -> str:
    if url_or_path.startswith("http"):
        path = urlsplit(url_or_path).path or "/"
    else:
        path = url_or_path if url_or_path.startswith("/") else "/" + url_or_path
    if path != "/" and path.endswith("/"):
        return path.rstrip("/")
    return path or "/"


def _hold_for(path: str) -> tuple[str, str] | None:
    if path in HOLD_EXACT:
        return HOLD_EXACT[path]
    parts = [p for p in path.split("/") if p]
    if len(parts) == 2 and parts[0] == "blog" and parts[1] in HOLD_BLOG:
        return HOLD_BLOG[parts[1]]
    if len(parts) == 2 and parts[0] == "perguntas" and parts[1] in HOLD_PERGUNTAS:
        return HOLD_PERGUNTAS[parts[1]]
    if len(parts) == 2 and parts[0] == "glossario" and parts[1] in HOLD_GLOSSARIO:
        return HOLD_GLOSSARIO[parts[1]]
    return None


def _evidence_value(evidence: dict, key: str):
    value = evidence.get(key)
    if value in (None, ""):
        return "UNKNOWN"
    return value


def _redirect_test_cases(path: str, target: str) -> list[dict]:
    return [
        {
            "name": "exact-https-apex",
            "request": {"path": path, "query": "", "host": "smartlic.tech"},
            "expect": {"status": 301, "location": target},
        },
        {
            "name": "www-one-hop",
            "request": {"path": path, "query": "", "host": "www.smartlic.tech"},
            "expect": {"status": 301, "location": target},
        },
        {
            "name": "trailing-slash",
            "request": {"path": path if path.endswith("/") else path + "/", "query": "", "host": "smartlic.tech"},
            "expect": {"status": 301, "location": target},
        },
        {
            "name": "allowlisted-query",
            "request": {"path": path, "query": "utm_source=gsc&jornada=defesa", "host": "smartlic.tech"},
            "expect": {"status": 301, "location_prefix": target, "keep": ["utm_source", "jornada"]},
        },
        {
            "name": "pii-query-dropped",
            "request": {"path": path, "query": "email=ada@example.com&cnpj=00000000000191", "host": "smartlic.tech"},
            "expect": {"status": 301, "location": target, "forbid": ["email", "cnpj"]},
        },
    ]


def _project_entry(src: dict) -> dict:
    path = _norm_path(src["legacy_url"])
    evidence = dict(src.get("evidence") or {})
    clicks = _evidence_value(evidence, "clicks")
    impressions = _evidence_value(evidence, "impressions")
    decision_v1 = src.get("decision") or src.get("action")
    is_ready_redirect = decision_v1 in {"REDIRECT", "REDIRECT_301", "MIGRATE"} and (
        src.get("status") == "ready" or src.get("target_url") or src.get("target")
    )
    hold = None if is_ready_redirect else _hold_for(path)

    if is_ready_redirect:
        action = "REDIRECT_301"
        status = "ready"
        override = READY_TARGET_OVERRIDES.get(path)
        target = (override or {}).get("target") or src.get("target_url") or src.get("target")
        http = 301
        reason = (
            (override or {}).get("semantic_equivalence")
            or src.get("semantic_equivalence")
            or src.get("equivalence_utility")
            or ""
        )
        unique = (
            (override or {}).get("unique_utility")
            or src.get("equivalence_utility")
            or src.get("semantic_equivalence")
            or ""
        )
        owner = src.get("owner") or "web-cfg (@dev) — CONFENGE public surface"
        observation = "NOT_STARTED — 28-day window starts at first production 301 of this hash"
    elif hold:
        action = "HOLD_TARGET_NOT_READY"
        status = "hold"
        target = None
        http = 410
        reason = hold[1]
        unique = "none ready — unique job exists but destination is not live"
        owner = "web-cfg#62 HOLD + SmartLic#2115 fail-closed 410"
        observation = "HOLD — destination not live; do not 301; re-evaluate when the named surface ships"
    else:
        action = "RETIRE_410"
        status = "decided"
        target = None
        http = 410
        reason = src.get("target_absence_justification") or "No unique utility or ready CONFENGE equivalent. 410."
        unique = "none — no unique CONFENGE-ready utility"
        owner = src.get("owner") or "SmartLic#2111 sunset + SmartLic#2115 410 for unlisted paths"
        observation = "NOT_STARTED — retired paths observed as 410 after cutover"

    out = {
        "legacy_url": src["legacy_url"],
        "historical_status": evidence.get("live_http_2026_08_14")
        or "UNKNOWN as HTML (Railway fallback 404 on apex; www TLS SAN mismatch)",
        "historical_canonical": "UNKNOWN — live SmartLic HTML is uncrawlable (Railway fallback 404)",
        "family": src.get("family"),
        "family_template": src.get("family_template"),
        "intent": src.get("intent"),
        "query": "UNKNOWN — GSC page extract has no per-URL query join",
        "impressions": impressions,
        "clicks": clicks,
        "backlinks": evidence.get("backlinks") or "UNKNOWN",
        "referrers": evidence.get("referring_domains") or "UNKNOWN",
        "unique_utility": unique,
        "action": action,
        "decision": action,
        "target": target,
        "target_url": target,
        "reason": reason,
        "owner": owner,
        "priority": src.get("priority"),
        "rollback_impact": (
            "High — ready 301s are the only preserved equity hop; reverting this hash restores 410-only."
            if action == "REDIRECT_301"
            else (
                "Low — HOLD already fail-closed 410; changing to a weak 301 would be the defect."
                if action == "HOLD_TARGET_NOT_READY"
                else "Low — retired path already fail-closed 410; rollback does not restore SmartLic HTML."
            )
        ),
        "observation_status": observation,
        "evidence": evidence,
        "target_absence_justification": "" if action == "REDIRECT_301" else reason,
        "semantic_equivalence": reason if action == "REDIRECT_301" else "none — no live 1:1",
        "equivalence_utility": unique if action == "REDIRECT_301" else "",
        "preconditions": src.get("preconditions") or [],
        "status": status,
        "expected_http": http,
        "expected_canonical": target if action == "REDIRECT_301" else None,
        "query_string_rule": src.get("query_string_rule") or QUERY_RULE,
        "monitoring": MONITORING,
        "rollback": src.get("rollback") or ROLLBACK,
        "removal_trigger": src.get("removal_trigger") or REMOVAL_TRIGGER,
        "bridge_owner": src.get("bridge_owner") or "SmartLic#2115 — redirect bridge only after this inventory hash",
    }

    if action == "REDIRECT_301":
        out.update(
            {
                "legacy_exact_or_pattern": "exact",
                "destination_canonical": target,
                "equivalence_rationale": reason,
                "http_status": 301,
                "no_chain": True,
                "no_loop": True,
                "query_string_policy": QUERY_RULE,
                "fragment_behavior": FRAGMENT_BEHAVIOR,
                "trailing_slash_policy": TRAILING_SLASH_POLICY,
                "case_normalization": CASE_NORMALIZATION,
                "test_cases": _redirect_test_cases(path, target),
                "expiry_retention": EXPIRY_RETENTION,
            }
        )
    if action == "HOLD_TARGET_NOT_READY":
        out["intended_future_surface"] = hold[0]
        out["skip_reason"] = (
            f"HOLD_TARGET_NOT_READY: {hold[1]} Intended surface: {hold[0]}. "
            "Do not 301 to a weak substitute or home."
        )
        out["preconditions"] = [
            "do not 301 to home, /consultoria-b2g or a parent hub",
            "do not 301 to a weak substitute",
            "SmartLic#2115 must serve 410 with no Location until a ready 1:1 exists and this hash is re-pinned",
        ]
    return out


def build(source: dict) -> dict:
    entries = [_project_entry(e) for e in source["entries"]]
    src_meta = source.get("meta") or {}
    counts = {}
    for e in entries:
        counts[e["action"]] = counts.get(e["action"], 0) + 1
    return {
        "meta": {
            "version": "v2",
            "schema": "smartlic-url-map-v2",
            "generated_at": STABLE_GENERATED_AT,
            "baseline_as_of": src_meta.get("baseline_as_of") or "2026-04-27",
            "issue": "https://github.com/tjsasakifln/web-cfg/issues/62",
            "handoff_issue": "https://github.com/tjsasakifln/SmartLic/issues/2115",
            "decommission_issue": "https://github.com/tjsasakifln/SmartLic/issues/2111",
            "vertical": src_meta.get("vertical") or "web-cfg#60 margin-defense",
            "canonical_public_host": "https://confenge.com.br",
            "legacy_host": "https://smartlic.tech",
            "supersedes": {
                "schema": "smartlic-confenge-manifesto-v1",
                "sha256": "c2cee8362321099205b76b11f89485d4248a00b8abbbda354d15964f6b316e0d",
                "note": (
                    "v2 keeps 11 ready CONFENGE 301s. Vocabulary expands to six actions. "
                    "Previously-RETIRE rows whose job has a named future surface are "
                    "HOLD_TARGET_NOT_READY (fail-closed 410, no Location). WEB-017 remapped "
                    "/blog/orgaos-risco-atraso-pagamento-licitacao from "
                    "/atrasos-prorrogacao-obras-publicas/ to "
                    "/conteudos/atraso-pagamento-contrato-publico-suspender/ (payment-delay job)."
                ),
            },
            "economic_rule": (
                "REDIRECT_301/MIGRATE only with a ready 1:1 CONFENGE target (HTTPS 200, "
                "host confenge.com.br, indexable, no SmartLic brand). Future destinations "
                "are HOLD_TARGET_NOT_READY. Volume, ease and sunk cost do not qualify. "
                "Zero indiscriminate home/parent redirects."
            ),
            "live_gsc": "UNKNOWN",
            "live_backlinks": "UNKNOWN — donor backlinks-log.md has zero confirmed links (all pending)",
            "entry_sources": [
                "data/migration/smartlic-confenge/manifesto.v1.json (v1 URL set, 1255 entries)",
                "data/migration/smartlic-confenge/gsc-pages-2026-04-27.json",
                "data/migration/smartlic-confenge/donor-slugs.json",
                "scripts/legacy_equity/build_inventory.py HOLD_* tables",
            ],
            "action_counts": counts,
            "ready_redirect_count": counts.get("REDIRECT_301", 0),
            "hold_count": counts.get("HOLD_TARGET_NOT_READY", 0),
            "retire_count": counts.get("RETIRE_410", 0),
            "migrate_count": counts.get("MIGRATE", 0),
            "ignore_count": counts.get("IGNORE_NONCANONICAL", 0),
            "legal_count": counts.get("LEGAL_SECURITY_HOLD", 0),
        },
        "entries": entries,
    }


def dump(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def execute_set_payload(data: dict, digest: str) -> dict:
    redirects = []
    holds = []
    persist = None
    for entry in data["entries"]:
        if entry["action"] == "REDIRECT_301":
            persist = persist or list((entry.get("query_string_rule") or {}).get("persist") or [])
            redirects.append(
                {
                    "legacy_url": entry["legacy_url"],
                    "path": _norm_path(entry["legacy_url"]),
                    "target_url": entry["target"],
                    "expected_canonical": entry["expected_canonical"],
                    "expected_http": 301,
                    "family": entry["family"],
                    "owner": entry["bridge_owner"],
                    "persist": list((entry.get("query_string_rule") or {}).get("persist") or []),
                }
            )
        elif entry["action"] == "HOLD_TARGET_NOT_READY":
            holds.append(
                {
                    "legacy_url": entry["legacy_url"],
                    "path": _norm_path(entry["legacy_url"]),
                    "skip_reason": entry["skip_reason"],
                    "intended_future_surface": entry["intended_future_surface"],
                    "expected_http": 410,
                    "target_url": None,
                }
            )
    redirects.sort(key=lambda r: r["path"])
    holds.sort(key=lambda r: r["path"])
    return {
        "inventory_sha256": digest,
        "schema": "smartlic-url-map-execute-v2",
        "default_status": 410,
        "owner": "SmartLic#2115",
        "observation_window_days": 28,
        "persist": persist or list(QUERY_RULE["persist"]),
        "redirects": redirects,
        "holds": holds,
        "unknown_url_policy": {"status": 410, "location": None},
    }


def write_pair(data: dict) -> str:
    payload = dump(data)
    INVENTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFESTO_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_PATH.write_bytes(payload)
    MANIFESTO_PATH.write_bytes(payload)
    digest = inventory_sha256(INVENTORY_PATH)
    sha_path = INVENTORY_PATH.with_suffix(".sha256")
    sha_path.write_text(digest + "\n", encoding="utf-8")
    (MANIFESTO_PATH.parent / "manifesto.v1.sha256").write_text(digest + "\n", encoding="utf-8")
    execute_path = INVENTORY_PATH.parent / "execute-set.v2.json"
    execute_path.write_bytes(dump(execute_set_payload(data, digest)))
    return digest


def main() -> int:
    source = json.loads(MANIFESTO_PATH.read_text(encoding="utf-8"))
    # If the file is already v2, rebuild from itself (idempotent projection).
    inventory = build(source)
    report = validate_inventory(inventory)
    if not report["ok"]:
        print("BUILD_BLOCKED", file=sys.stderr)
        for err in report["errors"][:40]:
            print(err, file=sys.stderr)
        return 2
    digest = write_pair(inventory)
    print(
        "BUILD_OK "
        f"entries={report['entry_count']} "
        f"redirect={report['redirect_count']} "
        f"hold={report['hold_count']} "
        f"retire={report['retire_count']} "
        f"migrate={report['migrate_count']} "
        f"ignore={report['ignore_count']} "
        f"legal={report['legal_count']} "
        f"sha256={digest}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
