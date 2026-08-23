"""Local-entity campaign constants. Honest statuses; no invented NAP."""

from __future__ import annotations

CAMPAIGN = "CONFENGE-WEB-LOCAL-ENTITY-SEARCH-02"
CAMPAIGN_AS_OF = "2026-08-23"
DECISION_STATE = "VALIDATE"
SITE = "https://confenge.com.br"
ORG_ID = f"{SITE}/#organization"
PERSON_ID = f"{SITE}/#tiago"
SPECIALIST_PATH = "/especialista/tiago-jun-sasaki/"
SPECIALIST_RELPATH = "especialista/tiago-jun-sasaki/index.html"
HOME_RELPATH = "index.html"

CLAIM_STATUSES = frozenset({"VERIFIED", "SELF_DECLARED", "UNKNOWN", "NOT_PUBLIC"})
SURFACE_DECISIONS = frozenset(
    {
        "USE_EXISTING_SERVICE",
        "REGIONAL_SECTION_ONLY",
        "REGIONAL_LANDING_CANDIDATE",
        "NO_LOCAL_SURFACE",
    }
)
CENSUS_CHANNELS = frozenset({"MAP_PACK", "ORGANIC", "LOCAL_ORGANIC"})
GSC_ABSENCE_STATUSES = frozenset({"BLOCKED", "UNKNOWN"})
GSC_SOURCES = frozenset({"gsc_api", "gsc_export", "historical_gsc_csv", "search_analytics_api"})

SELF_ATTESTED_PROOF_SOURCES = frozenset(
    {
        "perfil-publico-especialista",
        "operacao-remota-declarada",
        "conteudo-tecnico-publicado",
        "operacao-interna",
    }
)
SELF_ATTESTED_PROOF_CLASSES = frozenset(
    {
        "self_attested_public",
        "operational_declared",
        "content_published",
    }
)

ALLOWED_WRITE_PREFIXES = (
    "scripts/local_entity/",
    "data/local-entity/",
    "docs/seo/local-entity/",
    "tests/local_entity/",
    "especialista/tiago-jun-sasaki/",
)

ALLOWED_PUBLIC_EMAILS = frozenset({"tiago.sasaki@confenge.com.br"})
ALLOWED_PUBLIC_PHONES = frozenset(
    {
        "+55-48-98834-4559",
        "(48) 98834-4559",
        "5548988344559",
        "+5548988344559",
        "48 98834-4559",
    }
)
ALLOWED_PUBLIC_CNPJ = frozenset({"52.407.089/0001-09"})
ALLOWED_PUBLIC_SAME_AS = frozenset({"https://github.com/tjsasakifln"})
ALLOWED_PUBLIC_ADDRESS_COUNTRIES = frozenset({"BR"})

PERSONAL_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "hotmail.com",
        "outlook.com",
        "yahoo.com",
        "icloud.com",
        "proton.me",
        "protonmail.com",
    }
)

CITATION_FARM_HOSTS = frozenset(
    {
        "citations.com",
        "brightlocal.com",
        "yext.com",
        "hotfrog.com",
        "citysearch.com",
        "whodoyou.com",
        "citaty.com",
        "localcitation.com",
        "moz.com",
    }
)

FORBIDDEN_LOCAL_TYPES = frozenset({"LocalBusiness", "PostalAddress"})
FORBIDDEN_REVIEW_TYPES = frozenset({"Review", "AggregateRating", "CaseStudy"})
INVENTED_NAP_KEYS = frozenset(
    {
        "streetAddress",
        "postalCode",
        "addressLocality",
        "addressRegion",
        "postOfficeBoxNumber",
        "latitude",
        "longitude",
        "hasMap",
        "geo",
    }
)

EXISTING_SERVICE_PATHS = (
    "/especialista/tiago-jun-sasaki/",
    "/diagnostico-b2g-360/",
    "/diretoria-b2g/",
    "/bid-room-licitacoes-obras/",
    "/defesa-margem-contratos-publicos/",
    "/diagnostico-pre-licitacao/",
    "/auditoria-orcamento-licitacao/",
    "/medicoes-glosas-obras-publicas/",
    "/aditivos-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/defesa-tecnica-contratos-publicos/",
    "/acompanhamento-contratos-obras/",
    "/atrasos-prorrogacao-obras-publicas/",
)

GRAPH_FIELDS = (
    "@id",
    "credentials",
    "worksFor",
    "knowsAbout",
    "sameAs",
    "contact",
    "areaServed",
    "address",
)

GSC_LIVE_BLOCKED = {
    "status": "BLOCKED",
    "source_kind": "LIVE_JOB_OK",
    "reason": (
        "PR #159 live Search Analytics LIVE_JOB_OK; "
        "GSC secrets are not available to this campaign."
    ),
    "impressions": None,
    "clicks": None,
    "ready_for_product_decisions": False,
    "limitation": (
        "Live GSC is BLOCKED, not zero. Historical CSV/fixtures are not current "
        "Search Analytics and do not authorize product decisions."
    ),
}

PROOF_LIMITATION = (
    "data/site/proof.json claims marked VERIFIED with source perfil-publico-especialista "
    "(or other self-attested classes) are circular self-attestation from owned copy. "
    "This campaign remaps them to SELF_DECLARED. Campaign VERIFIED is reserved for "
    "independent third-party evidence committed in-repo; none is present for identity/NAP/CREA."
)
