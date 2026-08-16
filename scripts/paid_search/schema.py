"""Constants and fail-closed vocabulary for the WEB-032 canary."""

from __future__ import annotations

SCHEMA = "paid-search-canary/1.0"
ISSUE = 87
CAMPAIGN_ID = "web-032"
UNKNOWN = "UNKNOWN"

ALLOWED_CHANNELS = frozenset({"SEARCH"})
ALLOWED_MATCH_TYPES = frozenset({"EXACT", "PHRASE"})
FORBIDDEN_MATCH_TYPES = frozenset({"BROAD", "BROAD_MATCH_MODIFIER", "SMART"})
FORBIDDEN_CHANNELS = frozenset(
    {
        "PERFORMANCE_MAX",
        "PMAX",
        "DISPLAY",
        "DEMAND_GEN",
        "VIDEO",
        "SHOPPING",
        "DISCOVERY",
    }
)
FORBIDDEN_AUDIENCE_MODES = frozenset(
    {
        "REMARKETING",
        "RETARGETING",
        "CUSTOMER_MATCH",
        "SIMILAR_AUDIENCE",
        "AUDIENCE_EXPANSION",
        "OPTIMIZED_TARGETING",
    }
)

PRIMARY_METRIC = "qualified_learning_or_pipeline"
FORBIDDEN_PRIMARY_METRICS = frozenset(
    {"clicks", "click", "ctr", "impressions", "impression_share", "cpc"}
)

CONVERSION_HIERARCHY = (
    "qualified_engagement",
    "valid_lead",
    "qualified_lead",
    "meeting_pipeline",
)

SOURCE = "CONFENGE_WEB"

# Intersection with origin/main lead-core ATTR_ALLOWLIST. Do not put PII here.
ATTRIBUTION_URL_ALLOWLIST = (
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "jornada",
    "origem",
    "landing_page",
    "landing_url",
    "route_family",
    "cta_id",
    "asset_id",
    "intent",
    "content_cluster",
    "correlation_id",
)

FORBIDDEN_PARAM_NAMES = frozenset(
    {
        "email",
        "e-mail",
        "nome",
        "name",
        "telefone",
        "phone",
        "tel",
        "whatsapp",
        "cnpj",
        "cpf",
        "mensagem",
        "message",
        "contrato",
        "contract",
        "q",
        "query",
        "identifier",
        "fbclid",
        "msclkid",
        "li_fat_id",
    }
)

PII_VALUE_PATTERNS = (
    r"@",
    r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b",  # CNPJ-like
    r"\+?\d{10,15}",
)

HUMAN_REQUIRED_FIELDS = (
    "owner",
    "ads_account_id",
    "budget_total_brl",
    "budget_daily_brl",
    "cpc_cap_brl",
    "cpa_cap_qualified_lead_brl",
    "hard_stop_spend_brl",
)

LANDING_60 = {
    "id": "diagnostico-defesa-margem",
    "issue": 60,
    "kind": "utility",
    "path": "/ferramentas/diagnostico-defesa-margem/",
    "html": "ferramentas/diagnostico-defesa-margem/index.html",
    "canonical": "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
    "asset_id": "diagnostico-defesa-margem",
    "route_family": "defesa-margem-diagnostico",
    "cta_id": "segunda-leitura-contrato",
    "jornada": "contrato",
}

LANDING_84 = {
    "id": "valor-tipico-contratos-pavimentacao",
    "issue": 84,
    "kind": "market_answer",
    "path": "/inteligencia/valor-tipico-contratos-pavimentacao/",
    "html": "inteligencia/valor-tipico-contratos-pavimentacao/index.html",
    "canonical": "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/",
}

GSC_SNAPSHOTS = ("seo/gsc-2026-07-30", "seo/gsc-2026-08-09")

# Classification only. Volume on a family does not authorize it.
FAMILY_CATALOG = (
    {
        "id": "legacy_avcb",
        "label": "AVCB / legado imobiliário",
        "cluster": "legacy-entity",
        "adjacent_to_60": False,
        "commercial_intent": "none",
        "problem_now": False,
        "first_vertical_event": False,
        "landing_id": None,
        "event_family": None,
        "patterns": (r"\b(avcb|clcb)\b",),
    },
    {
        "id": "brand",
        "label": "Marca CONFENGE (split, não canário)",
        "cluster": "brand",
        "adjacent_to_60": False,
        "commercial_intent": "branded",
        "problem_now": False,
        "first_vertical_event": False,
        "landing_id": None,
        "event_family": None,
        "patterns": (r"\b(confenge|coenge|consenge|conenge|smartenge|tiago\s*sasaki)\b",),
    },
    {
        "id": "glosa_medicao",
        "label": "Glosa / medição rejeitada em obra pública",
        "cluster": "medicoes-pagamentos",
        "adjacent_to_60": True,
        "commercial_intent": "high",
        "problem_now": True,
        "first_vertical_event": True,
        "landing_id": "diagnostico-defesa-margem",
        "event_family": "medicao",
        "patterns": (
            r"\bglosa\b",
            r"medi[cç][aã]o\s+rejeitada",
            r"medi[cç][aã]o\s+de\s+obra\s+p[uú]blica\s+rejeitada",
        ),
    },
    {
        "id": "reequilibrio",
        "label": "Reequilíbrio / reajuste / curva ABC",
        "cluster": "reequilibrio",
        "adjacent_to_60": True,
        "commercial_intent": "high",
        "problem_now": False,
        "first_vertical_event": True,
        "landing_id": "diagnostico-defesa-margem",
        "event_family": "reequilibrio",
        "patterns": (r"\breequil", r"\breajuste\b", r"curva\s+abc"),
    },
    {
        "id": "aditivos",
        "label": "Aditivos qualitativo/quantitativo",
        "cluster": "aditivos",
        "adjacent_to_60": True,
        "commercial_intent": "high",
        "problem_now": False,
        "first_vertical_event": True,
        "landing_id": "diagnostico-defesa-margem",
        "event_family": "aditivo",
        "patterns": (r"\baditivo", r"acr[eé]scimo", r"\bsupress"),
    },
    {
        "id": "sinapi_desonerado",
        "label": "SINAPI desonerado / não desonerado",
        "cluster": "orcamento-bdi",
        "adjacent_to_60": False,
        "commercial_intent": "informational",
        "problem_now": False,
        "first_vertical_event": False,
        "landing_id": None,
        "event_family": None,
        "patterns": (r"\bdesonerado\b", r"\bsinapi\b"),
    },
    {
        "id": "bdi",
        "label": "BDI diferenciado",
        "cluster": "orcamento-bdi",
        "adjacent_to_60": True,
        "commercial_intent": "high",
        "problem_now": False,
        "first_vertical_event": True,
        "landing_id": None,  # diagnostic does not compute BDI
        "event_family": "bdi",
        "patterns": (r"\bbdi\b",),
    },
    {
        "id": "prorrogacao_prazo",
        "label": "Prorrogação de prazo / chuva / vigência",
        "cluster": "atrasos-prorrogacao",
        "adjacent_to_60": True,
        "commercial_intent": "medium",
        "problem_now": False,
        "first_vertical_event": True,
        "landing_id": "diagnostico-defesa-margem",
        "event_family": "prorrogacao",
        "patterns": (
            r"\bprorroga",
            r"\bchuva\b",
            r"prazo\s+de\s+vig[eê]ncia",
            r"prazo\s+de\s+execu[cç]",
        ),
    },
    {
        "id": "market_answer_pavimentacao",
        "label": "Valor típico de contratos de pavimentação (#84)",
        "cluster": "market-answer",
        "adjacent_to_60": False,
        "commercial_intent": "commercial_investigation",
        "problem_now": False,
        "first_vertical_event": False,
        "landing_id": "valor-tipico-contratos-pavimentacao",
        "event_family": None,
        "patterns": (r"pavimenta", r"valor\s+t[ií]pico"),
    },
)

NEGATIVE_STEMS = (
    "avcb",
    "clcb",
    "vaga",
    "emprego",
    "salário",
    "salario",
    "curso",
    "faculdade",
    "tcc",
    "smartlic",
    "desonerado",
    "sinapi",
    "grátis",
    "gratis",
    "pdf",
    "chatgpt",
    "inteligência artificial",
    "ia para",
    "residencial",
    "particular",
    "modelo planilha",
    "técnico edificações",
    "tecnico edificacoes",
)

KILL_SPECS = (
    {
        "id": "cap_without_qualified_intent",
        "action": "PAUSE",
        "fields": ("spend_brl", "hard_stop_spend_brl", "qualified_intent_signals"),
    },
    {
        "id": "misaligned_search_terms",
        "action": "PAUSE",
        "fields": (
            "search_term_mismatch_rate",
            "search_terms_observed",
            "mismatch_rate_threshold",
            "mismatch_min_terms",
        ),
    },
    {
        "id": "low_lead_quality",
        "action": "PAUSE",
        "fields": (
            "valid_leads",
            "qualified_lead_rate",
            "quality_min_valid_leads",
            "quality_rate_threshold",
        ),
    },
    {
        "id": "tracking_does_not_reconcile",
        "action": "PAUSE",
        "fields": ("tracking_reconcile_ok",),
    },
)

DEFAULT_KILL_THRESHOLDS = {
    "mismatch_rate_threshold": 0.40,
    "mismatch_min_terms": 5,
    "quality_min_valid_leads": 3,
    "quality_rate_threshold": 0.20,
}
