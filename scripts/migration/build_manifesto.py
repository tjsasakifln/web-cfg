#!/usr/bin/env python3
"""Build the versioned SmartLic → CONFENGE manifesto from committed donor extracts.

Does not call live GSC/backlink APIs. Demand numbers come only from versioned
snapshots under data/migration/smartlic-confenge/.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from manifesto_lib import MANIFESTO_PATH, ROOT, manifesto_sha256

DATA = ROOT / "data/migration/smartlic-confenge"
LEGACY_ORIGIN = "https://smartlic.tech"
CONFENGE = "https://confenge.com.br"

OWNER_TARGETS = "web-cfg (@dev) — CONFENGE public surface"
OWNER_BRIDGE = "SmartLic#2115 — redirect bridge only after this manifesto hash"
OWNER_RETIRE = "SmartLic#2111 sunset + SmartLic#2115 410/404 for unlisted paths"

QUERY_RULE = {
    "mode": "allowlist",
    "persist": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "jornada",
        "origem",
        "route_family",
        "cta_id",
        "asset_id",
        "correlation_id",
        "tema",
    ],
    "drop": "all_other_query_parameters",
    "pii": "never persist email/phone/name/cnpj/cpf or free-text identity in URL, analytics or logs",
}

MONITORING = {
    "window_days": 28,
    "starts": "after SmartLic#2115 cutover of this manifesto hash — NOT started in this PR",
    "sources": ["GSC property smartlic.tech (UNKNOWN until export)", "GSC property confenge.com.br", "target HTTP crawl"],
    "investigate_if": [
        "priority ready target returns unexpected 404/5xx",
        "redirect chain/loop/soft-404 on a ready row",
        "material drop in GSC clicks/impressions on ready legacy paths after cutover (threshold in handoff)",
    ],
}

ROLLBACK = (
    "Restore previous CONFENGE Netlify publish SHA and this manifesto version. "
    "Do not reactivate SmartLic as a product, SaaS, brand or public runtime. "
    "Bridge rollback is SmartLic#2115 (DNS/proxy to last non-destructive state)."
)

REMOVAL_TRIGGER = (
    "Remove smartlic.tech bridge only after: 28-day observation of this hash, "
    "zero residual priority 404/5xx/chain, critical backlinks (if any become known) "
    "point at CONFENGE or are accepted as retired, and SmartLic#2111 archive gate."
)

# Economic overrides: only 1:1 #60 / already-equivalent CONFENGE surfaces that are indexable.
REDIRECT_OVERRIDES = {
    "/blog/aditivos-contratuais-o-que-sao-como-monitorar": {
        "target": "/aditivos-obras-publicas/",
        "family": "blog-editorial",
        "intent": "aditivos_contratuais",
        "priority": "P1",
        "equivalence": (
            "Both pages answer how contractual amendments work in public contracts "
            "and what to document before absorbing extra scope."
        ),
        "utility": (
            "CONFENGE page is the live #60 amendment surface: limits 25/50, extra "
            "services, documents and a commercial CTA — not a parent hub."
        ),
    },
    "/glossario/aditivo-contratual": {
        "target": "/aditivos-obras-publicas/",
        "family": "glossario",
        "intent": "aditivos_contratuais",
        "priority": "P2",
        "equivalence": "Glossary intent 'aditivo contratual' is the same job as the CONFENGE aditivos pillar.",
        "utility": "Decisor B2G lands on actionable amendment guidance plus CTA, not a definition stub.",
    },
    "/perguntas/indice-reajuste-contrato-publico": {
        "target": "/reequilibrio-obras-publicas/",
        "family": "perguntas",
        "intent": "reajuste_indice",
        "priority": "P0",
        "equivalence": (
            "Question is which index/path to use for public-contract price restatement. "
            "CONFENGE pillar covers reajuste vs reequilíbrio vs repactuação with proof path."
        ),
        "utility": "Direct #60 margin-defense job; indexable commercial pillar with CTA.",
    },
    "/perguntas/reequilibrio-economico-financeiro": {
        "target": "/reequilibrio-obras-publicas/",
        "family": "perguntas",
        "intent": "reequilibrio",
        "priority": "P0",
        "equivalence": "Same primary question: when and how to claim economic-financial rebalancing.",
        "utility": "CONFENGE #60 pillar is the ready equivalent; lei-14133 child is noindex so it is not the target.",
    },
    "/glossario/reequilibrio-economico-financeiro": {
        "target": "/reequilibrio-obras-publicas/",
        "family": "glossario",
        "intent": "reequilibrio",
        "priority": "P2",
        "equivalence": "Term page intent matches the reequilíbrio pillar, not a generic library hub.",
        "utility": "B2G contractor job → documented plea + CTA.",
    },
    "/glossario/reajuste": {
        "target": "/reequilibrio-obras-publicas/",
        "family": "glossario",
        "intent": "reajuste_indice",
        "priority": "P2",
        "equivalence": "Reajuste is an explicit section of the CONFENGE reequilíbrio pillar (not a parent dump).",
        "utility": "Prevents mixing ordinary indexation with extraordinary recomposition — #60 core.",
    },
    "/glossario/medicao": {
        "target": "/medicoes-glosas-obras-publicas/",
        "family": "glossario",
        "intent": "medicao_glosa",
        "priority": "P2",
        "equivalence": "Measurement/glosa intent matches the dedicated CONFENGE medicoes pillar.",
        "utility": "#60 payment-pressure trigger with CTA.",
    },
    "/glossario/matriz-de-riscos": {
        "target": "/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/",
        "family": "glossario",
        "intent": "matriz_riscos",
        "priority": "P2",
        "equivalence": "Same artefact: risk matrix as a gate on reequilíbrio, not a generic glossary dump.",
        "utility": "Existing indexable CONFENGE guide used in the #60 vertical.",
    },
    "/glossario/mapa-de-riscos": {
        "target": "/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/",
        "family": "glossario",
        "intent": "matriz_riscos",
        "priority": "P2",
        "equivalence": "Mapa/matriz de riscos is the same contractual allocation artefact.",
        "utility": "Same #60 guide as matriz-de-riscos.",
    },
    "/perguntas/prazo-pagamento-contrato-publico": {
        "target": "/conteudos/atraso-pagamento-contrato-publico-suspender/",
        "family": "perguntas",
        "intent": "atraso_pagamento",
        "priority": "P1",
        "equivalence": "Both address late public-contract payment and the contractor's documented response.",
        "utility": "Indexable #60 payment-pressure article with next action.",
    },
    "/blog/orgaos-risco-atraso-pagamento-licitacao": {
        "target": "/atrasos-prorrogacao-obras-publicas/",
        "family": "blog-editorial",
        "intent": "atraso_pagamento",
        "priority": "P1",
        "equivalence": "Legacy post is about payment-delay risk in public contracts; CONFENGE pillar is delay/prorrogação in obras.",
        "utility": "Indexable delay pillar aligned to #60 execution pressure.",
    },
}

# Families: every historically public SmartLic surface. Parameterized farms are templates.
FAMILIES = [
    ("/", "home-saas", "SmartLic product home — not CONFENGE consultoria"),
    ("/sobre", "brand-saas", "SmartLic company page"),
    ("/features", "saas-marketing", "SaaS feature list"),
    ("/demo", "saas-marketing", "product demo"),
    ("/dados", "product-data", "SmartLic data marketing"),
    ("/calculadora", "product-tool", "SmartLic calculator product"),
    ("/calculadora/embed", "product-tool", "embedded calculator"),
    ("/comparador", "product-tool", "bid comparator SaaS"),
    ("/estatisticas", "product-data", "SmartLic stats product"),
    ("/estatisticas/embed", "product-data", "embedded stats"),
    ("/buscar", "saas-app", "authenticated search app"),
    ("/login", "auth", "authentication"),
    ("/signup", "auth", "signup / trial"),
    ("/planos", "billing", "pricing/plans"),
    ("/pricing", "billing", "pricing"),
    ("/planos/obrigado", "billing", "checkout thanks"),
    ("/planos/command", "billing", "billing command"),
    ("/founding", "billing", "founders offer"),
    ("/fundadores", "billing", "founders"),
    ("/consultoria-b2g", "legacy-offer", "SmartLic-branded B2G offer; not 1:1 with a CONFENGE page"),
    ("/consultorias", "legacy-offer", "consultorias listing"),
    ("/para-construtoras", "persona", "persona marketing"),
    ("/para-empresas", "persona", "persona marketing"),
    ("/para-empresas-de-ti", "persona", "TI persona — outside CONFENGE ICP"),
    ("/para-advogados", "persona", "persona marketing"),
    ("/para-consultorias", "persona", "persona marketing"),
    ("/para-fornecedores", "persona", "persona marketing"),
    ("/para-quem-quer-subcontratar", "persona", "subcontract persona"),
    ("/subcontratacao", "hub", "subcontratação hub without CONFENGE equivalent"),
    ("/como-avaliar-licitacao", "tender-howto", "tender evaluation — next vertical, not #60"),
    ("/como-evitar-prejuizo-licitacao", "tender-howto", "bid-loss prevention — not contract margin defense"),
    ("/como-filtrar-editais", "tender-howto", "edital filtering"),
    ("/como-priorizar-oportunidades", "tender-howto", "opportunity prioritization"),
    ("/licitacoes", "tenders-hub", "tender discovery hub"),
    ("/licitacoes/{setor}", "tenders-pseo", "programmatic sector tenders"),
    ("/licitacoes-publicas-2026", "tenders-hub", "2026 tenders landing — no #60 equivalent"),
    ("/contratos", "contracts-hub", "contracts explorer product"),
    ("/contratos/{setor}/{uf}", "contracts-pseo", "programmatic contracts"),
    ("/contratos/orgao/{cnpj}", "contracts-orgao-farm", "CNPJ-keyed agency contract farm"),
    ("/cnpj", "cnpj-hub", "CNPJ explorer"),
    ("/cnpj/{cnpj}", "cnpj-farm", "per-CNPJ pSEO"),
    ("/fornecedores", "fornecedores-hub", "supplier explorer"),
    ("/fornecedores/{cnpj}", "fornecedores-farm", "per-supplier pSEO"),
    ("/fornecedores/{cnpj}/{uf}", "fornecedores-farm", "per-supplier UF pSEO"),
    ("/orgaos", "orgaos-hub", "agency explorer"),
    ("/orgaos/{slug}", "orgaos-farm", "per-agency pSEO"),
    ("/orgaos-publicos", "orgaos-hub", "agency listing"),
    ("/municipios", "municipios-hub", "municipality explorer"),
    ("/municipios/{slug}", "municipios-farm", "per-city pSEO"),
    ("/indice-municipal", "indice-hub", "municipal index product"),
    ("/indice-municipal/{municipio-uf}", "indice-farm", "per-city index"),
    ("/observatorio", "observatorio-hub", "observatory product"),
    ("/observatorio/{slug}", "observatorio-farm", "observatory articles"),
    ("/itens", "itens-hub", "CATMAT explorer"),
    ("/itens/{catmat}", "itens-farm", "per-item pSEO"),
    ("/compliance/{cnpj}", "compliance", "compliance product"),
    ("/inteligencia/{cnpj}", "inteligencia-farm", "per-CNPJ intel product"),
    ("/blog", "blog-hub", "SmartLic blog hub"),
    ("/blog/{slug}", "blog-editorial", "editorial posts"),
    ("/blog/author/{slug}", "blog-author", "author pages"),
    ("/blog/licitacoes", "blog-pseo", "programmatic blog tenders"),
    ("/blog/licitacoes/{setor}/{uf}", "blog-pseo", "sector/UF pSEO posts"),
    ("/blog/licitacoes/cidade/{cidade}", "blog-pseo", "city pSEO"),
    ("/blog/licitacoes-do-dia", "blog-pseo", "daily tenders"),
    ("/blog/licitacoes-do-dia/{date}", "blog-pseo", "daily tenders by date"),
    ("/blog/panorama", "blog-pseo", "sector panorama"),
    ("/blog/panorama/{setor}", "blog-pseo", "sector panorama"),
    ("/blog/programmatic/{setor}", "blog-pseo", "programmatic"),
    ("/blog/programmatic/{setor}/{uf}", "blog-pseo", "programmatic UF"),
    ("/blog/contratos/{setor}", "blog-pseo", "contracts programmatic"),
    ("/blog/weekly", "blog-weekly", "weekly digest"),
    ("/blog/weekly/{slug}", "blog-weekly", "weekly digest post"),
    ("/perguntas", "perguntas-hub", "Q&A hub"),
    ("/perguntas/{slug}", "perguntas", "Q&A articles"),
    ("/glossario", "glossario-hub", "glossary hub"),
    ("/glossario/{termo}", "glossario", "glossary terms"),
    ("/guia", "guia-hub", "guides hub"),
    ("/guia/{slug}", "guia", "guides"),
    ("/casos", "casos-hub", "SmartLic cases"),
    ("/casos/{slug}", "casos", "SmartLic case studies"),
    ("/masterclass", "masterclass-hub", "masterclass product"),
    ("/masterclass/{tema}", "masterclass", "masterclass tema"),
    ("/alertas", "saas-app", "alerts app"),
    ("/alertas-publicos", "alerts-public", "public alerts"),
    ("/alertas-publicos/{setor}/{uf}", "alerts-public", "public alerts pSEO"),
    ("/ferramentas/pncp-licitacoes", "product-tool", "PNCP tool — SmartLic product"),
    ("/intencao/comercial", "intent-landing", "intent landing"),
    ("/intencao/investigativa", "intent-landing", "intent landing"),
    ("/intencao/juridica", "intent-landing", "intent landing"),
    ("/intencao/subcontratacao", "intent-landing", "intent landing"),
    ("/relatorio-2026-t1", "report", "T1 2026 report"),
    ("/ajuda", "help", "help center"),
    ("/privacidade", "legal", "SmartLic privacy"),
    ("/termos", "legal", "SmartLic terms"),
    ("/termos/fundadores", "legal", "founders terms"),
    ("/status", "ops", "status page"),
    ("/stack", "ops", "stack page"),
    ("/obrigado", "thanks", "thanks page"),
    ("/conta", "account", "account app"),
    ("/dashboard", "account", "dashboard"),
    ("/historico", "account", "history"),
    ("/pipeline", "account", "pipeline"),
    ("/onboarding", "account", "onboarding"),
    ("/mensagens", "account", "messages"),
    ("/segmentar", "account", "segmenter"),
    ("/indicar", "growth", "referral"),
    ("/intel-reports/{sessionId}", "paid-report", "paid intel report"),
    ("/analise/{hash}", "app-analysis", "private analysis"),
    ("/auth/callback", "auth", "oauth callback"),
    ("/recuperar-senha", "auth", "password recovery"),
    ("/redefinir-senha", "auth", "password reset"),
    ("/widgets/competitive-intel", "widget", "embed widget"),
]


def _load_json(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _path_of(url_or_path: str) -> str:
    if url_or_path.startswith("http"):
        return urlparse(url_or_path).path or "/"
    if not url_or_path.startswith("/"):
        return "/" + url_or_path
    return url_or_path


def _norm_path(path: str) -> str:
    if path != "/" and path.endswith("/"):
        return path.rstrip("/")
    return path or "/"


def _family_for(path: str) -> tuple[str, str, str]:
    p = _norm_path(path)
    parts = [x for x in p.split("/") if x]
    if not parts:
        return "/", "home-saas", "SmartLic product home"
    head = parts[0]
    mapping = {
        "cnpj": ("/cnpj/{cnpj}", "cnpj-farm", "per-CNPJ pSEO"),
        "fornecedores": ("/fornecedores/{cnpj}", "fornecedores-farm", "per-supplier pSEO"),
        "orgaos": ("/orgaos/{slug}", "orgaos-farm", "per-agency pSEO"),
        "municipios": ("/municipios/{slug}", "municipios-farm", "per-city pSEO"),
        "itens": ("/itens/{catmat}", "itens-farm", "per-item pSEO"),
        "compliance": ("/compliance/{cnpj}", "compliance", "compliance product"),
        "inteligencia": ("/inteligencia/{cnpj}", "inteligencia-farm", "per-CNPJ intel"),
        "indice-municipal": ("/indice-municipal/{municipio-uf}", "indice-farm", "municipal index"),
        "observatorio": ("/observatorio/{slug}", "observatorio-farm", "observatory"),
        "alertas-publicos": ("/alertas-publicos/{setor}/{uf}", "alerts-public", "public alerts"),
        "casos": ("/casos/{slug}", "casos", "cases"),
        "masterclass": ("/masterclass/{tema}", "masterclass", "masterclass"),
        "guia": ("/guia/{slug}", "guia", "guides"),
        "intel-reports": ("/intel-reports/{sessionId}", "paid-report", "paid report"),
        "analise": ("/analise/{hash}", "app-analysis", "private analysis"),
    }
    if head == "contratos" and len(parts) > 1 and parts[1] == "orgao":
        return "/contratos/orgao/{cnpj}", "contracts-orgao-farm", "agency contract farm"
    if head == "contratos" and len(parts) > 1:
        return "/contratos/{setor}/{uf}", "contracts-pseo", "programmatic contracts"
    if head == "licitacoes" and len(parts) > 1:
        return "/licitacoes/{setor}", "tenders-pseo", "sector tenders"
    if head == "blog":
        if len(parts) == 1:
            return "/blog", "blog-hub", "blog hub"
        second = parts[1]
        if second == "licitacoes":
            return "/blog/licitacoes/{setor}/{uf}", "blog-pseo", "programmatic blog tenders"
        if second == "licitacoes-do-dia":
            return "/blog/licitacoes-do-dia/{date}", "blog-pseo", "daily tenders"
        if second == "panorama":
            return "/blog/panorama/{setor}", "blog-pseo", "panorama"
        if second == "programmatic":
            return "/blog/programmatic/{setor}/{uf}", "blog-pseo", "programmatic"
        if second == "contratos":
            return "/blog/contratos/{setor}", "blog-pseo", "contracts programmatic"
        if second == "weekly":
            return "/blog/weekly/{slug}", "blog-weekly", "weekly"
        if second == "author":
            return "/blog/author/{slug}", "blog-author", "author"
        return "/blog/{slug}", "blog-editorial", "editorial post"
    if head == "perguntas" and len(parts) > 1:
        return "/perguntas/{slug}", "perguntas", "Q&A"
    if head == "glossario" and len(parts) > 1:
        return "/glossario/{termo}", "glossario", "glossary term"
    if head in mapping and len(parts) > 1:
        return mapping[head]
    # exact static
    for tmpl, fam, intent in FAMILIES:
        if "{" not in tmpl and _norm_path(tmpl) == p:
            return tmpl, fam, intent
    if head in mapping:
        return mapping[head]
    return p, head, "unclassified-public"


def _evidence(gsc_row: dict | None, extra: str) -> dict:
    ev = {
        "gsc_snapshot": "data/migration/smartlic-confenge/gsc-pages-2026-04-27.json",
        "gsc_as_of": "2026-04-27",
        "gsc_window": "28d filename; exact date range UNKNOWN beyond commit 2026-04-27",
        "clicks": gsc_row["clicks"] if gsc_row else None,
        "impressions": gsc_row["impressions"] if gsc_row else None,
        "position": gsc_row["position"] if gsc_row else None,
        "ctr": gsc_row.get("ctr") if gsc_row else None,
        "backlinks": "UNKNOWN",
        "referring_domains": "UNKNOWN",
        "live_http_2026_08_14": "UNKNOWN as HTML (Railway fallback 404 on apex; www TLS SAN mismatch)",
        "notes": extra,
    }
    if gsc_row is None:
        ev["clicks"] = "UNKNOWN"
        ev["impressions"] = "UNKNOWN"
        ev["position"] = "UNKNOWN"
    return ev


def _retire_justification(family: str, path: str) -> str:
    farms = {
        "cnpj-farm",
        "fornecedores-farm",
        "orgaos-farm",
        "municipios-farm",
        "itens-farm",
        "contracts-orgao-farm",
        "blog-pseo",
        "tenders-pseo",
        "contracts-pseo",
        "indice-farm",
        "observatorio-farm",
        "inteligencia-farm",
        "alerts-public",
    }
    saas = {
        "home-saas",
        "brand-saas",
        "saas-marketing",
        "saas-app",
        "auth",
        "billing",
        "account",
        "product-tool",
        "product-data",
        "paid-report",
        "widget",
        "ops",
        "help",
        "legal",
        "thanks",
        "growth",
        "app-analysis",
    }
    if family in farms:
        return (
            "pSEO/DataLake farm without unique CONFENGE utility or #60 equivalent. "
            "Migrating would recreate SmartLic as a content farm. Honest 410."
        )
    if family in saas:
        return (
            "SmartLic product/SaaS/auth/billing/account surface. CONFENGE is not a "
            "SmartLic successor product. No semantic equivalent. 410."
        )
    if family in {"tender-howto", "tenders-hub", "blog-editorial"} and path not in REDIRECT_OVERRIDES:
        return (
            "Tender-discovery or generic SaaS editorial without a ready #60 "
            "equivalent. Issue #60 forbids starting a second vertical to absorb this. 410."
        )
    if family in {"persona", "legacy-offer", "intent-landing", "hub"}:
        return (
            "Marketing/persona/offer page without a proven 1:1 CONFENGE counterpart. "
            "Home and /consultoria-b2g dumps are forbidden. 410."
        )
    return (
        "No unique utility, proven B2G-decisor path, or ready CONFENGE equivalent. "
        "Not migrated for sunk cost or volume. 410."
    )


def _priority(decision: str, gsc: dict | None, override_priority: str | None) -> str:
    if override_priority:
        return override_priority
    clicks = (gsc or {}).get("clicks") or 0
    impr = (gsc or {}).get("impressions") or 0
    if decision == "RETIRE":
        if clicks >= 2 or impr >= 50:
            return "P3"
        return "P4"
    if clicks > 0:
        return "P0"
    if impr >= 50:
        return "P1"
    return "P2"


def build_entry(legacy_path: str, *, gsc: dict | None, origin_note: str) -> dict:
    path = _norm_path(_path_of(legacy_path))
    family_tmpl, family, default_intent = _family_for(path)
    override = REDIRECT_OVERRIDES.get(path)
    legacy_url = LEGACY_ORIGIN + (path if path != "/" else "/")
    if override:
        target = CONFENGE + override["target"]
        return {
            "legacy_url": legacy_url,
            "family": override["family"],
            "family_template": family_tmpl,
            "intent": override["intent"],
            "evidence": _evidence(gsc, origin_note),
            "decision": "REDIRECT",
            "target_url": target,
            "target_absence_justification": "",
            "semantic_equivalence": override["equivalence"],
            "equivalence_utility": override["utility"],
            "priority": _priority("REDIRECT", gsc, override["priority"]),
            "owner": OWNER_TARGETS,
            "preconditions": [
                f"target {target} returns 200 on the candidate SHA",
                "canonical is CONFENGE-only",
                "robots is not accidental noindex",
                "CTA + allowlisted attribution present on commercial surface",
            ],
            "status": "ready",
            "expected_http": 301,
            "expected_canonical": target,
            "query_string_rule": QUERY_RULE,
            "monitoring": MONITORING,
            "rollback": ROLLBACK,
            "removal_trigger": REMOVAL_TRIGGER,
            "bridge_owner": OWNER_BRIDGE,
        }
    return {
        "legacy_url": legacy_url,
        "family": family,
        "family_template": family_tmpl,
        "intent": default_intent,
        "evidence": _evidence(gsc, origin_note),
        "decision": "RETIRE",
        "target_url": None,
        "target_absence_justification": _retire_justification(family, path),
        "semantic_equivalence": "none — retired without CONFENGE counterpart",
        "equivalence_utility": "",
        "priority": _priority("RETIRE", gsc, None),
        "owner": OWNER_RETIRE,
        "preconditions": [
            "do not 301 to home, /consultoria-b2g or a parent hub",
            "SmartLic#2115 may serve 410 for this path or leave Railway 404 until 410 is wired",
        ],
        "status": "decided",
        "expected_http": 410,
        "expected_canonical": None,
        "query_string_rule": QUERY_RULE,
        "monitoring": MONITORING,
        "rollback": ROLLBACK,
        "removal_trigger": REMOVAL_TRIGGER,
        "bridge_owner": OWNER_BRIDGE,
    }


def collect_paths() -> dict[str, str]:
    """path -> source note."""
    paths: dict[str, str] = {}
    for tmpl, _fam, _intent in FAMILIES:
        paths[_norm_path(tmpl)] = "public-route-family"
    pages = _load_json("gsc-pages-2026-04-27.json")["rows"]
    for row in pages:
        paths[_norm_path(row["path"])] = "gsc-pages-2026-04-27"
    slugs = _load_json("donor-slugs.json")
    for slug in slugs["blog"]:
        paths[_norm_path(f"/blog/{slug}")] = "frontend/lib/blog.ts"
    for slug in slugs["perguntas"]:
        paths[_norm_path(f"/perguntas/{slug}")] = "frontend/lib/questions.ts"
    for slug in slugs["glossario"]:
        paths[_norm_path(f"/glossario/{slug}")] = "frontend/lib/glossary-terms.ts"
    # dedicated question page that exists as its own route file
    paths["/perguntas/indice-reajuste-contrato-publico"] = (
        paths.get("/perguntas/indice-reajuste-contrato-publico") or "frontend/app/perguntas/indice-reajuste-contrato-publico"
    )
    return paths


def build() -> dict:
    gsc_pages = { _norm_path(r["path"]): r for r in _load_json("gsc-pages-2026-04-27.json")["rows"] }
    paths = collect_paths()
    entries = []
    for path, note in sorted(paths.items(), key=lambda kv: kv[0]):
        entries.append(build_entry(path, gsc=gsc_pages.get(path), origin_note=note))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifesto = {
        "meta": {
            "version": "v1",
            "schema": "smartlic-confenge-manifesto-v1",
            "generated_at": now,
            "baseline_as_of": "2026-04-27",
            "issue": "https://github.com/tjsasakifln/web-cfg/issues/62",
            "handoff_issue": "https://github.com/tjsasakifln/SmartLic/issues/2115",
            "decommission_issue": "https://github.com/tjsasakifln/SmartLic/issues/2111",
            "vertical": "web-cfg#60 margin-defense",
            "canonical_public_host": "https://confenge.com.br",
            "legacy_host": "https://smartlic.tech",
            "economic_rule": (
                "MIGRATE/REDIRECT only with proven or #60-aligned utility and a ready "
                "1:1 CONFENGE target. Volume, ease and sunk cost do not qualify. "
                "Zero indiscriminate home/parent redirects."
            ),
            "live_gsc": "UNKNOWN",
            "live_backlinks": "UNKNOWN — donor backlinks-log.md has zero confirmed links (all pending)",
            "entry_sources": [
                "data/migration/smartlic-confenge/gsc-pages-2026-04-27.json",
                "data/migration/smartlic-confenge/donor-slugs.json",
                "scripts/migration/build_manifesto.py FAMILIES + REDIRECT_OVERRIDES",
            ],
        },
        "entries": entries,
    }
    return manifesto


def main() -> None:
    """v1 builder is superseded. Rebuild via scripts/legacy_equity/build_inventory.py."""
    from pathlib import Path as _Path
    import runpy

    builder = _Path(__file__).resolve().parents[1] / "legacy_equity" / "build_inventory.py"
    print(
        "build_manifesto.py is superseded by scripts/legacy_equity/build_inventory.py "
        "(six-action inventory; same 11 ready 301s). Delegating.",
        file=sys.stderr,
    )
    runpy.run_path(str(builder), run_name="__main__")


if __name__ == "__main__":
    main()
