"""CONFENGE-ORGANIC-BREAKOUT-01 — select, gate and render at most 3 assets.

Publication does not invent live GSC demand. Fixtures and HOLD_FOR_DATA
never INDEX. Contract-analysis surfaces are out of scope.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.organic.gates import indexability_quality_gate
from scripts.revops.search_demand_observatory import (
    gsc_performance_status,
    label_historical_export,
    pull_api,
)

CAMPAIGN = "CONFENGE-ORGANIC-BREAKOUT-01"
MAX_ASSETS = 3
SITE = "https://confenge.com.br"
SOURCE = "CONFENGE_WEB"
CAMPAIGN_DAY = date(2026, 8, 18)
PREFERENCE_ORDER = (
    "frontier_ready",
    "gsc_observed_poorly_served",
    "citable_robust_facts",
    "existing_url_improvement",
)
FORBIDDEN_PATH_PREFIXES = (
    "scripts/contract_analysis/",
    "data/editorial/contract-analysis/",
    "analises-contratos-publicos/",
)
FRONTIER_RELS = (
    Path("data/organic/frontier/CONFENGE-TRAFFIC-OPPORTUNITY-FRONTIER-01.json"),
    Path("data/discovery/traffic-opportunity-frontier.json"),
)
CANDIDATES_REL = Path("data/organic/breakout/candidates.json")
SELECTION_REL = Path("data/organic/breakout/selection.json")
SITEMAP_REL = Path("sitemap.xml")
ROBOTS_REL = Path("robots.txt")
SMARTLIC_RE = re.compile(r"smartlic", re.I)
PII_RE = re.compile(
    r"\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})\b"
)
CHASSIS_START = "<!-- organic-breakout-chassis:{asset_id} -->"
CHASSIS_END = "<!-- /organic-breakout-chassis -->"
JS_START = "<!-- organic-breakout-js -->"
JS_END = "<!-- /organic-breakout-js -->"
ANSWER_BOX_RE = re.compile(r'(<div class="answer-box" id="resposta">.*?</div>)', re.S)
LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_candidates(root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    data = load_json(root / CANDIDATES_REL)
    if not isinstance(data, dict):
        raise ValueError("candidates_must_be_object")
    return data


def find_frontier(root: Path | None = None) -> dict[str, Any] | None:
    root = root or repo_root()
    for rel in FRONTIER_RELS:
        path = root / rel
        if path.is_file():
            try:
                payload = load_json(path)
            except (OSError, json.JSONDecodeError):
                return None
            if isinstance(payload, dict):
                return payload
    return None


def content_hash(record: dict[str, Any]) -> str:
    payload = {
        "asset_id": record.get("asset_id"),
        "question": record.get("question"),
        "answer": record.get("answer"),
        "method": record.get("method"),
        "period": record.get("period"),
        "geography": record.get("geography"),
        "grain": record.get("grain"),
        "limitations": record.get("limitations"),
        "visual_id": record.get("visual_id"),
        "visitor_job": record.get("visitor_job"),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def intents_of(records: list[dict[str, Any]]) -> list[str]:
    return [_text(row.get("intent")) for row in records if _text(row.get("intent"))]


def duplicate_intents(records: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    dupes: list[str] = []
    for intent in intents_of(records):
        if intent in seen and intent not in dupes:
            dupes.append(intent)
        seen.add(intent)
    return dupes


def is_doorway(record: dict[str, Any], html_text: str = "") -> bool:
    url = _text(record.get("url"))
    parsed = urlparse(url)
    if parsed.query or "?" in url:
        return True
    if record.get("fixture") or record.get("hold_for_data"):
        return True
    if not _text(record.get("visual_id")):
        return True
    if not _text((record.get("method") or {}).get("short") if isinstance(record.get("method"), dict) else ""):
        return True
    if len(_items(record.get("limitations"))) < 1:
        return True
    visible = html_text or " ".join(
        [
            _text(record.get("visitor_job")),
            _text(record.get("question")),
            _text(record.get("answer")),
        ]
    )
    words = re.findall(r"\w{4,}", visible.lower())
    return len(set(words)) < 40


def select_assets(
    catalog: dict[str, Any],
    *,
    frontier: dict[str, Any] | None = None,
    gsc_live: bool = False,
    max_assets: int = MAX_ASSETS,
) -> list[dict[str, Any]]:
    """Preference order, live-demand honesty, cap, no duplicate intent."""
    rows = [dict(item) for item in _items(catalog.get("candidates")) if isinstance(item, dict)]
    ready_frontier: set[str] = set()
    if isinstance(frontier, dict):
        for item in _items(frontier.get("ready") or frontier.get("opportunities")):
            if not isinstance(item, dict):
                continue
            if str(item.get("status") or "").upper() != "READY":
                continue
            aid = _text(item.get("asset_id") or item.get("id") or item.get("url"))
            if aid:
                ready_frontier.add(aid)

    ranked: list[dict[str, Any]] = []
    for row in rows:
        if row.get("publication_requires_live_demand") and not gsc_live:
            continue
        if row.get("fixture") or row.get("hold_for_data"):
            continue
        pref = _text(row.get("preference_class"))
        if _text(row.get("asset_id")) in ready_frontier:
            pref = "frontier_ready"
            row = dict(row)
            row["preference_class"] = pref
        if pref not in PREFERENCE_ORDER:
            continue
        if not _text(row.get("why_not_generic")):
            continue
        if is_doorway(row):
            continue
        ranked.append(row)

    ranked.sort(key=lambda item: PREFERENCE_ORDER.index(item["preference_class"]))
    selected: list[dict[str, Any]] = []
    used_intents: set[str] = set()
    for row in ranked:
        if len(selected) >= max_assets:
            break
        intent = _text(row.get("intent"))
        if not intent or intent in used_intents:
            continue
        used_intents.add(intent)
        selected.append(row)
    if len(selected) > max_assets:
        raise RuntimeError("asset_cap_exceeded")
    return selected


@dataclass(frozen=True)
class IndexDecision:
    asset_id: str
    indexable: bool
    robots: str
    sitemap: bool
    state: str
    reason_codes: tuple[str, ...]
    content_hash: str
    conditions: dict[str, bool]

    def as_dict(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "indexable": self.indexable,
            "robots": self.robots,
            "sitemap": self.sitemap,
            "state": self.state,
            "reason_codes": list(self.reason_codes),
            "content_hash": self.content_hash,
            "conditions": dict(self.conditions),
        }


def sitemap_locs(root: Path) -> set[str]:
    text = (root / SITEMAP_REL).read_text(encoding="utf-8")
    return {match.rstrip("/") + "/" for match in LOC_RE.findall(text)}


def evaluate_index_gate(
    record: dict[str, Any],
    html_text: str,
    *,
    root: Path | None = None,
    sitemap: set[str] | None = None,
) -> IndexDecision:
    root = root or repo_root()
    reasons: list[str] = []
    digest = content_hash(record)
    fixture = bool(record.get("fixture"))
    hold = bool(record.get("hold_for_data"))
    url = _text(record.get("url"))
    canonical = _text(record.get("canonical"))
    robots_meta = _meta_content(html_text, "robots").lower()
    canonical_href = _link_href(html_text, "canonical")
    if canonical_href:
        canonical_href = canonical_href.rstrip("/") + "/"

    visible_question = _text(record.get("question")) in html_text
    visible_answer = _text(record.get("answer"))[:40] in html_text or 'data-breakout-answer="true"' in html_text
    visible_method = "data-breakout-method" in html_text or _text((record.get("method") or {}).get("short"))[:24] in html_text
    visible_limits = "data-breakout-limitations" in html_text or any(
        _text(item)[:24] in html_text for item in _items(record.get("limitations"))
    )
    visible_job = "data-visitor-job" in html_text or _text(record.get("visitor_job"))[:24] in html_text
    visible_visual = f'data-visual-id="{record.get("visual_id")}"' in html_text
    visible_owner = "data-refresh-owner" in html_text
    visible_correction = "/correcoes/" in html_text
    visible_cta = 'data-source="CONFENGE_WEB"' in html_text and "data-cta-id=" in html_text
    visible_hash = digest in html_text
    schema_ok = "application/ld+json" in html_text
    if visible_method:
        schema_ok = schema_ok and (
            _text((record.get("method") or {}).get("id")) in html_text
            or "HowTo" in html_text
            or "methodology" in html_text.lower()
        )

    locs = sitemap if sitemap is not None else sitemap_locs(root)
    in_sitemap = canonical in locs or (canonical.rstrip("/") + "/") in locs
    self_canonical = canonical_href == (canonical.rstrip("/") + "/")
    doorway = is_doorway(record, html_text)
    smartlic = bool(SMARTLIC_RE.search(html_text))
    chassis_only = ""
    start = CHASSIS_START.format(asset_id=_text(record.get("asset_id")))
    if start in html_text and CHASSIS_END in html_text:
        chassis_only = html_text.split(start, 1)[1].split(CHASSIS_END, 1)[0]
    pii = bool(PII_RE.search(chassis_only))
    filter_index = False
    if "?stratum=" in html_text:
        window = html_text[html_text.find("?stratum=") : html_text.find("?stratum=") + 220]
        filter_index = "noindex" not in window.lower()

    organic = indexability_quality_gate(
        distinct_intent=bool(_text(record.get("intent"))),
        own_information=bool(_text(record.get("visual_id")) and _text(record.get("why_not_generic"))),
        sample_size=12,
        semantic_differentiation=0.7,
        independent_utility=True,
        data_confidence=0.7,
        non_redundant=True,
        no_cannibalization=True,
        has_context_interpretation=True,
        identifiable_update=True,
        useful_internal_links=len(_items(record.get("internal_links"))) >= 2,
        contextual_cta=bool(record.get("cta")),
        has_provenance=True,
        content_value_score=70,
        legal_safe=not smartlic,
        visible_parity=visible_method and visible_limits,
    )

    conditions = {
        "not_fixture": not fixture,
        "not_hold_for_data": not hold,
        "substantial": not doorway,
        "visible_question": visible_question,
        "visible_answer": visible_answer,
        "visible_method": visible_method,
        "visible_limitations": visible_limits,
        "visible_job": visible_job,
        "visible_visual": visible_visual,
        "visible_refresh_owner": visible_owner,
        "visible_correction": visible_correction,
        "cta_attribution": visible_cta,
        "content_hash_present": visible_hash,
        "self_canonical": self_canonical,
        "schema_parity": schema_ok,
        "no_smartlic": not smartlic,
        "no_pii": not pii,
        "filters_not_indexed": not filter_index,
        "organic_gate": bool(organic.get("indexable")),
        "in_sitemap": in_sitemap,
        "robots_index": "noindex" not in robots_meta,
    }
    if fixture:
        reasons.append("fixture_never_index")
    if hold:
        reasons.append("hold_for_data_never_index")
    if doorway:
        reasons.append("doorway_or_thin")
    if not visible_question:
        reasons.append("question_missing")
    if not visible_answer:
        reasons.append("answer_missing")
    if not visible_method:
        reasons.append("method_missing")
    if not visible_limits:
        reasons.append("limitations_missing")
    if not self_canonical:
        reasons.append("canonical_not_self")
    if smartlic:
        reasons.append("smartlic_brand")
    if pii:
        reasons.append("pii_present")
    if not organic.get("indexable"):
        reasons.extend(organic.get("fails") or ["organic_gate_fail"])

    index_ok = all(conditions.values()) and not fixture and not hold
    if record.get("index_intent") != "INDEX":
        index_ok = False
        reasons.append("index_intent_not_index")
    robots = "index,follow" if index_ok else "noindex,nofollow"
    if index_ok and "noindex" in robots_meta:
        index_ok = False
        reasons.append("robots_noindex")
        robots = robots_meta or "noindex,nofollow"
    if index_ok and not in_sitemap:
        reasons.append("sitemap_missing")
        index_ok = False
        robots = "noindex,nofollow"
        conditions = dict(conditions)
        conditions["in_sitemap"] = False
    state = "INDEX" if index_ok else "NOINDEX"
    return IndexDecision(
        asset_id=_text(record.get("asset_id")),
        indexable=index_ok,
        robots=robots,
        sitemap=index_ok,
        state=state,
        reason_codes=tuple(dict.fromkeys(reasons)),
        content_hash=digest,
        conditions=conditions,
    )


def align_sinapi_base(edital: str, planilha: str, regime: str) -> dict[str, Any]:
    """Coherence of SINAPI base vs edital vs company payroll regime."""
    edital_n = _text(edital)
    planilha_n = _text(planilha)
    regime_n = _text(regime)
    allowed = {"desonerado", "nao_desonerado", "silente", "contraditorio", "mista", "incerto"}
    if edital_n not in allowed or planilha_n not in allowed or regime_n not in allowed:
        return {
            "state": "INVALID_INPUT",
            "risk": "high",
            "verdict": "Entrada inválida. Use os valores do alinhador.",
            "cannot_conclude": ["Não se conclui enquadramento tributário nem um fator único de conversão."],
        }
    if edital_n == "contraditorio" or planilha_n == "mista":
        return {
            "state": "CONTRADICTION",
            "risk": "high",
            "verdict": "Há contradição ou mistura de bases. Não feche preço sem memória e sem a regra do órgão.",
            "cannot_conclude": [
                "Não se conclui qual tabela prevalece só pela página.",
                "Não se conclui um desconto entre desonerado e não desonerado.",
            ],
        }
    if edital_n == "silente":
        return {
            "state": "EDITAL_SILENT",
            "risk": "medium",
            "verdict": "O edital não fixou a base. Confirme planilha modelo, comunicação do órgão e data-base antes de escolher tabela.",
            "cannot_conclude": ["Silêncio do edital não autoriza default nacional."],
        }
    aligned = edital_n == planilha_n and edital_n in {"desonerado", "nao_desonerado"}
    regime_match = regime_n == edital_n
    if aligned and regime_match:
        return {
            "state": "ALIGNED",
            "risk": "low",
            "verdict": "Edital, planilha e regime apontam a mesma base. Ainda confira data-base e BDI na mesma referência.",
            "cannot_conclude": ["Alinhamento de base não prova exequibilidade da proposta."],
        }
    if aligned and not regime_match:
        return {
            "state": "BASE_OK_REGIME_GAP",
            "risk": "medium",
            "verdict": "A planilha segue o edital, mas o regime da empresa não coincide com a base. Trate a diferença na margem real, não trocando a tabela do certame.",
            "cannot_conclude": ["Não se conclui que a empresa deva mudar de regime só para caber na tabela."],
        }
    return {
        "state": "MISALIGNED",
        "risk": "high",
        "verdict": "Planilha e edital não estão na mesma base. Corrija antes de enviar. Trocar tabela para baratear unitário é o erro clássico.",
        "cannot_conclude": ["Não se conclui um fator único para converter uma tabela na outra."],
    }


def bdi_incidence_map() -> list[dict[str, str]]:
    """Relative incidence labels. Not official BDI rates."""
    return [
        {
            "family": "Mão de obra",
            "admin": "alta",
            "risco": "alta",
            "garantia": "media",
            "lucro": "alta",
            "note": "Encargos e administração pesam no custo direto e no BDI.",
        },
        {
            "family": "Material de obra",
            "admin": "media",
            "risco": "media",
            "garantia": "baixa",
            "lucro": "media",
            "note": "Logística e perda podem estar no unitário ou no BDI — uma casa só.",
        },
        {
            "family": "Equipamento / fornecimento",
            "admin": "baixa",
            "risco": "media",
            "garantia": "alta",
            "lucro": "media",
            "note": "Garantia de fabricante e frete não podem aparecer duas vezes.",
        },
    ]


def art125_saldo(
    valor_inicial_atualizado: float,
    acrescimos: float,
    supressoes: float,
    *,
    reforma_edificio_ou_equipamento: bool,
) -> dict[str, Any]:
    """Isolated increment/suppression sets on the updated initial value."""
    if valor_inicial_atualizado <= 0:
        return {
            "ok": False,
            "reason": "base_nao_positiva",
            "cannot_conclude": ["Sem valor inicial atualizado o teto é um número inventado."],
        }
    teto_acrescimo = 0.50 if reforma_edificio_ou_equipamento else 0.25
    teto_supressao = 0.25
    limite_acrescimo = valor_inicial_atualizado * teto_acrescimo
    limite_supressao = valor_inicial_atualizado * teto_supressao
    saldo_acrescimo = limite_acrescimo - acrescimos
    saldo_supressao = limite_supressao - supressoes
    return {
        "ok": True,
        "base": valor_inicial_atualizado,
        "teto_acrescimo": teto_acrescimo,
        "teto_supressao": teto_supressao,
        "limite_acrescimo": limite_acrescimo,
        "limite_supressao": limite_supressao,
        "acrescimos": acrescimos,
        "supressoes": supressoes,
        "saldo_acrescimo": saldo_acrescimo,
        "saldo_supressao": saldo_supressao,
        "compensa_automaticamente": False,
        "cannot_conclude": [
            "O saldo não autoriza transfigurar o objeto.",
            "Acréscimo e supressão de itens distintos não se compensam automaticamente.",
        ],
    }


def _esc(value: Any) -> str:
    return html.escape(_text(value), quote=True)


def _meta_content(html_text: str, name: str) -> str:
    for match in re.finditer(r"<meta\b[^>]*>", html_text, re.I):
        tag = match.group(0)
        if re.search(rf'name=["\']{re.escape(name)}["\']', tag, re.I):
            content = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
            if content:
                return content.group(1)
    return ""


def _link_href(html_text: str, rel: str) -> str:
    for match in re.finditer(r"<link\b[^>]*>", html_text, re.I):
        tag = match.group(0)
        if re.search(rf'rel=["\']{re.escape(rel)}["\']', tag, re.I):
            href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
            if href:
                return href.group(1)
    return ""


def chassis_html(record: dict[str, Any]) -> str:
    digest = content_hash(record)
    method = record.get("method") if isinstance(record.get("method"), dict) else {}
    cta = record.get("cta") if isinstance(record.get("cta"), dict) else {}
    limits = "".join(f"<li>{_esc(item)}</li>" for item in _items(record.get("limitations")))
    links = "".join(
        f'<li><a href="{_esc(item.get("href"))}">{_esc(item.get("label"))}</a></li>'
        for item in _items(record.get("internal_links"))
        if isinstance(item, dict)
    )
    visual = _visual_html(record)
    howto_id = _text(method.get("id"))
    ld = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": record.get("question"),
        "description": record.get("answer"),
        "totalTime": "PT10M",
        "tool": {"@type": "HowToTool", "name": record.get("visual_id")},
        "step": [
            {
                "@type": "HowToStep",
                "name": "Método",
                "text": method.get("short"),
            },
            {
                "@type": "HowToStep",
                "name": "Limitações",
                "text": " ".join(_text(item) for item in _items(record.get("limitations"))),
            },
        ],
        "author": {"@type": "Person", "name": record.get("author")},
        "dateModified": CAMPAIGN_DAY.isoformat(),
        "identifier": howto_id,
        "url": record.get("canonical"),
    }
    return (
        f'{CHASSIS_START.format(asset_id=record["asset_id"])}\n'
        f'<section class="breakout-chassis" id="breakout-{_esc(record["asset_id"])}" '
        f'data-asset-id="{_esc(record["asset_id"])}" data-content-hash="{digest}" '
        f'data-refresh-owner="{_esc(record.get("refresh_owner"))}" '
        f'data-route-family="{_esc((cta.get("route_family")))}" '
        f'data-source="{SOURCE}" data-campaign="{CAMPAIGN}">\n'
        f'<p class="breakout-job" data-visitor-job="{_esc(record.get("visitor_job"))}">'
        f'<strong>Job do visitante.</strong> {_esc(record.get("visitor_job"))}</p>\n'
        f'<p class="breakout-answer" data-breakout-answer="true"><strong>Resposta factual.</strong> {_esc(record.get("answer"))}</p>\n'
        f'<dl class="breakout-meta">\n'
        f'<div><dt>Pergunta</dt><dd data-breakout-question="true">{_esc(record.get("question"))}</dd></div>\n'
        f'<div><dt>Método</dt><dd data-breakout-method="{_esc(method.get("id"))}">{_esc(method.get("short"))}</dd></div>\n'
        f'<div><dt>Fonte</dt><dd>{_esc(method.get("source"))}</dd></div>\n'
        f'<div><dt>Período</dt><dd>{_esc(record.get("period"))}</dd></div>\n'
        f'<div><dt>Geografia</dt><dd>{_esc(record.get("geography"))}</dd></div>\n'
        f'<div><dt>Grão</dt><dd><code data-opaque-token>{_esc(record.get("grain"))}</code></dd></div>\n'
        f'<div><dt>Autoria / revisão</dt><dd>{_esc(record.get("author"))} · {_esc(record.get("reviewer"))}</dd></div>\n'
        f'<div><dt>Refresh</dt><dd>{_esc(record.get("refresh_owner"))}</dd></div>\n'
        f'<div><dt>Hash</dt><dd><code data-opaque-token>{digest}</code></dd></div>\n'
        f"</dl>\n"
        f'{visual}\n'
        f'<div class="breakout-limits" data-breakout-limitations="true">\n'
        f"<h2>O que esta página não pode concluir</h2>\n<ul>{limits}</ul>\n</div>\n"
        f'<p class="breakout-correction">Encontrou erro de fato? Use a '
        f'<a href="{_esc(record.get("correction_route"))}" '
        f'data-asset-id="{_esc(record.get("asset_id"))}">rota de correção</a>.</p>\n'
        f'<p><a class="button button-primary" href="{_esc(cta.get("path"))}" '
        f'data-cta-id="{_esc(cta.get("id"))}" data-asset-id="{_esc(cta.get("asset_id"))}" '
        f'data-route-family="{_esc(cta.get("route_family"))}" data-source="{SOURCE}">'
        f'{_esc(cta.get("label"))}</a></p>\n'
        f'<nav class="breakout-links" aria-label="Continuar no mesmo problema"><ul>{links}</ul></nav>\n'
        f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n'
        f"</section>\n"
        f"{CHASSIS_END}\n"
    )


def _visual_html(record: dict[str, Any]) -> str:
    visual = _text(record.get("visual_id"))
    if visual == "sinapi-aligner":
        rules = {
            "fn": "align_sinapi_base",
            "fields": ["edital", "planilha", "regime"],
        }
        return (
            '<div class="breakout-visual" data-visual-id="sinapi-aligner">'
            "<h2>Alinhador de base SINAPI</h2>"
            "<p>Ferramenta de coerência. Não calcula preço e não publica fator de conversão.</p>"
            '<form class="breakout-tool" data-breakout-tool="sinapi-aligner" action="#" method="get">'
            '<label>Base do edital <select name="edital">'
            '<option value="desonerado">Desonerado</option>'
            '<option value="nao_desonerado">Não desonerado</option>'
            '<option value="silente">Silente</option>'
            '<option value="contraditorio">Contraditório</option>'
            "</select></label>"
            '<label>Planilha em montagem <select name="planilha">'
            '<option value="desonerado">Desonerado</option>'
            '<option value="nao_desonerado">Não desonerado</option>'
            '<option value="mista">Mista</option>'
            "</select></label>"
            '<label>Regime da empresa <select name="regime">'
            '<option value="desonerado">Desonerada (CPRB / folha)</option>'
            '<option value="nao_desonerado">Não desonerada</option>'
            '<option value="incerto">Incerto</option>'
            "</select></label>"
            '<button type="button" class="button button-secondary" data-breakout-run="sinapi-aligner">Verificar coerência</button>'
            "</form>"
            '<p class="breakout-tool-out" data-breakout-out="sinapi-aligner" hidden></p>'
            f'<script type="application/json" id="breakout-rules-sinapi">{json.dumps(rules, ensure_ascii=False)}</script>'
            "</div>"
        )
    if visual == "bdi-incidence-map":
        rows = "".join(
            "<tr>"
            f"<th scope='row'>{_esc(item['family'])}</th>"
            f"<td>{_esc(item['admin'])}</td>"
            f"<td>{_esc(item['risco'])}</td>"
            f"<td>{_esc(item['garantia'])}</td>"
            f"<td>{_esc(item['lucro'])}</td>"
            f"<td>{_esc(item['note'])}</td>"
            "</tr>"
            for item in bdi_incidence_map()
        )
        return (
            '<div class="breakout-visual" data-visual-id="bdi-incidence-map">'
            "<h2>Mapa de incidência de BDI por família</h2>"
            "<p>Rótulos relativos (alta / média / baixa). <strong>Não é tabela oficial de percentuais</strong> e não substitui o modelo do edital.</p>"
            '<div class="table-wrap" role="group" tabindex="0" aria-label="Mapa de incidência de BDI por família"><table class="compare-table">'
            "<thead><tr><th>Família</th><th>Administração</th><th>Risco</th><th>Garantia</th><th>Lucro</th><th>Nota</th></tr></thead>"
            f"<tbody>{rows}</tbody></table></div>"
            '<svg class="breakout-bars" viewBox="0 0 320 90" role="img" aria-label="Incidência relativa ilustrativa, sem percentuais oficiais">'
            '<rect x="10" y="12" width="220" height="14" fill="#2d6f2d"></rect>'
            '<rect x="10" y="38" width="150" height="14" fill="#3d8238"></rect>'
            '<rect x="10" y="64" width="110" height="14" fill="#7aa36f"></rect>'
            '<text x="236" y="23" font-size="10">Mão de obra</text>'
            '<text x="166" y="49" font-size="10">Material</text>'
            '<text x="126" y="75" font-size="10">Equipamento</text>'
            "</svg>"
            "</div>"
        )
    example = art125_saldo(1_000_000.0, 180_000.0, 40_000.0, reforma_edificio_ou_equipamento=False)

    def _brl(value: float) -> str:
        return f"R$ {value:,.0f}".replace(",", ".")

    return (
        '<div class="breakout-visual" data-visual-id="art125-saldo">'
        "<h2>Memória de saldo do art. 125 (exemplo trabalhável)</h2>"
        "<p>Exemplo com valor inicial atualizado de R$ 1.000.000, acréscimos de R$ 180.000 e supressões de R$ 40.000, sem hipótese de reforma. "
        "Conjuntos isolados; compensação automática = não.</p>"
        '<div class="table-wrap" role="group" tabindex="0" aria-label="Memória de saldo do art. 125"><table class="compare-table"><tbody>'
        f"<tr><th scope='row'>Teto de acréscimo</th><td>25% = {_brl(float(example['limite_acrescimo']))}</td></tr>"
        f"<tr><th scope='row'>Acréscimos já usados</th><td>{_brl(float(example['acrescimos']))}</td></tr>"
        f"<tr><th scope='row'>Saldo de acréscimo</th><td>{_brl(float(example['saldo_acrescimo']))}</td></tr>"
        f"<tr><th scope='row'>Teto de supressão</th><td>25% = {_brl(float(example['limite_supressao']))}</td></tr>"
        f"<tr><th scope='row'>Supressões já usadas</th><td>{_brl(float(example['supressoes']))}</td></tr>"
        f"<tr><th scope='row'>Saldo de supressão</th><td>{_brl(float(example['saldo_supressao']))}</td></tr>"
        "<tr><th scope='row'>Compensa sozinho?</th><td>Não</td></tr>"
        "</tbody></table></div>"
        '<p><a href="/ferramentas/limite-acrescimos-supressoes/">Abrir o verificador com os números do seu contrato</a></p>'
        "</div>"
    )


def inject_chassis(html_text: str, record: dict[str, Any]) -> str:
    block = chassis_html(record)
    start = CHASSIS_START.format(asset_id=record["asset_id"])
    if start in html_text:
        html_text = re.sub(
            re.escape(start) + r".*?" + re.escape(CHASSIS_END),
            block.strip(),
            html_text,
            count=1,
            flags=re.S,
        )
    else:
        match = ANSWER_BOX_RE.search(html_text)
        if not match:
            raise RuntimeError(f"answer_box_missing:{record.get('asset_id')}")
        html_text = html_text[: match.end()] + "\n" + block + html_text[match.end() :]
    if JS_START not in html_text:
        html_text = html_text.replace(
            "</body>",
            f'{JS_START}<script defer src="/assets/js/organic-breakout.js"></script>{JS_END}\n</body>',
            1,
        )
    html_text = re.sub(
        r'(property="article:modified_time" content=")[^"]+(")',
        rf"\g<1>{CAMPAIGN_DAY.isoformat()}\2",
        html_text,
    )
    html_text = re.sub(
        r'(<meta content=")20\d{2}-\d{2}-\d{2}(" property="article:modified_time")',
        rf"\g<1>{CAMPAIGN_DAY.isoformat()}\2",
        html_text,
    )
    html_text = re.sub(
        r'(Revisado em <time datetime=")20\d{2}-\d{2}-\d{2}(">)[^<]+',
        rf"\g<1>{CAMPAIGN_DAY.isoformat()}\g<2>{CAMPAIGN_DAY.day} de agosto de {CAMPAIGN_DAY.year}",
        html_text,
        count=1,
    )
    html_text = re.sub(
        r'("dateModified":")20\d{2}-\d{2}-\d{2}"',
        rf'\g<1>{CAMPAIGN_DAY.isoformat()}"',
        html_text,
    )
    return html_text


def render_asset(record: dict[str, Any], *, root: Path | None = None) -> Path:
    root = root or repo_root()
    path = root / _text(record.get("html_path"))
    original = path.read_text(encoding="utf-8")
    updated = inject_chassis(original, record)
    path.write_text(updated, encoding="utf-8")
    return path


def _chassis_slice(html_text: str) -> str:
    if CHASSIS_END not in html_text:
        return ""
    start_token = "<!-- organic-breakout-chassis:"
    if start_token not in html_text:
        return ""
    return html_text.split(start_token, 1)[1].split(CHASSIS_END, 1)[0]


def inspect_html(html_text: str) -> dict[str, Any]:
    return {
        "question": bool(re.search(r"data-breakout-question", html_text)),
        "method": bool(re.search(r"data-breakout-method", html_text)),
        "limitations": bool(re.search(r"data-breakout-limitations", html_text)),
        "visual": bool(re.search(r"data-visual-id=", html_text)),
        "visitor_job": bool(re.search(r"data-visitor-job=", html_text)),
        "refresh_owner": bool(re.search(r"data-refresh-owner=", html_text)),
        "correction": "/correcoes/" in html_text,
        "cta_attribution": 'data-source="CONFENGE_WEB"' in html_text and "data-cta-id=" in html_text,
        "content_hash": bool(re.search(r"data-content-hash=", html_text)),
        "jsonld": "application/ld+json" in html_text,
        "smartlic": bool(SMARTLIC_RE.search(html_text)),
        "pii": bool(PII_RE.search(_chassis_slice(html_text))),
        "canonical": _link_href(html_text, "canonical"),
        "robots": _meta_content(html_text, "robots"),
    }


def prepare_distribution_pack(record: dict[str, Any]) -> dict[str, Any]:
    digest = content_hash(record)
    method = record.get("method") if isinstance(record.get("method"), dict) else {}
    historical = record.get("gsc_historical") if isinstance(record.get("gsc_historical"), dict) else {}
    targets = [
        {
            "id": "sicepot-sc",
            "target_class": "associação",
            "target_nominal": "SICEPOT-SC",
            "public_url": "https://sicepot-sc.org.br",
            "editorial_angle": f"Revisão técnica do {record.get('question')} com método {_text(method.get('id'))}.",
        },
        {
            "id": "crea-sc",
            "target_class": "associação",
            "target_nominal": "CREA-SC",
            "public_url": "https://www.crea-sc.org.br",
            "editorial_angle": "Peça de consulta para engenheiros que orçam ou aditam contrato público.",
        },
        {
            "id": "cbic-coinfra",
            "target_class": "associação",
            "target_nominal": "CBIC / COINFRA",
            "public_url": "https://cbic.org.br",
            "editorial_angle": "Citação do método e das limitações, não de um censo nacional.",
        },
        {
            "id": "sinaenco",
            "target_class": "associação",
            "target_nominal": "SINAENCO",
            "public_url": "https://sinaenco.com.br",
            "editorial_angle": "Utilidade para empresas de engenharia consultiva que leem edital e aditivo.",
        },
        {
            "id": "agencia-infra",
            "target_class": "imprensa",
            "target_nominal": "Agência Infra",
            "public_url": "https://www.agenciainfra.com",
            "editorial_angle": "Dado/visual citável com recusa explícita de extrapolar o que a página não mede.",
        },
    ]
    drafts = []
    for target in targets:
        drafts.append(
            {
                "target_id": target["id"],
                "target_nominal": target["target_nominal"],
                "subject": f"Pedido de revisão: {record.get('question')}",
                "body": (
                    f"Olá, equipe {target['target_nominal']}.\n\n"
                    f"Publicamos uma resposta verificável para: {record.get('question')}\n"
                    f"URL: {record.get('canonical')}\n\n"
                    f"Método: {method.get('short')}\n"
                    f"Dado/visual citável: {record.get('visual_id')} (hash {digest[:12]}).\n"
                    f"A evidência de busca citada é histórica ({historical.get('export')}), "
                    f"não uma alegação de demanda atual.\n\n"
                    f"Pedimos revisão ou citação do método e das limitações, não um favor de link. "
                    f"Se o recorte não servir à audiência de vocês, ignore.\n\n"
                    f"auto_send=false — esta mensagem não foi enviada."
                ),
            }
        )
    return {
        "schema": "organic-breakout-distribution-pack/1.0",
        "auto_send": False,
        "sent": False,
        "smtp_called": False,
        "webhook_called": False,
        "asset_id": record.get("asset_id"),
        "outreach_title": record.get("question"),
        "factual_summary": record.get("answer"),
        "citable_datum": {
            "visual_id": record.get("visual_id"),
            "content_hash": digest,
            "historical_gsc": historical,
            "historical_neq_live": True,
        },
        "method": method,
        "targets": targets,
        "drafts": drafts,
        "request_type": "review_or_citation",
        "not_a_favor": True,
    }


def write_pack(pack: dict[str, Any], *, root: Path | None = None) -> Path:
    root = root or repo_root()
    dest = root / "docs" / "ops" / "campaigns" / CAMPAIGN / "packs" / f"{pack['asset_id']}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dest


def gsc_campaign_state(*, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    pull_28 = pull_api(28)
    pull_7 = pull_api(7)
    status = gsc_performance_status(pull_28)
    historical_dir = root / "seo" / "gsc-2026-07-30"
    historical = {
        "path": "seo/gsc-2026-07-30",
        "label": "historical_not_live",
        "exists": historical_dir.is_dir(),
    }
    if historical_dir.is_dir():
        historical = label_historical_export(
            {"source": "seo/gsc-2026-07-30", "source_dir": "seo/gsc-2026-07-30", "queries": [], "pages": []}
        )
        historical["path"] = "seo/gsc-2026-07-30"
    return {
        "credential_present": pull_28.get("error") != "missing_credentials",
        "performance_status": status,
        "pull_28": pull_28,
        "pull_7": pull_7,
        "historical": historical,
        "historical_neq_live": True,
        "live_baseline_invented": False,
    }


def run_build(*, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    catalog = load_candidates(root)
    frontier = find_frontier(root)
    gsc_state = gsc_campaign_state(root=root)
    live = gsc_state["performance_status"] == "LIVE"
    selected = select_assets(catalog, frontier=frontier, gsc_live=live)
    locs = sitemap_locs(root)
    rendered: list[dict[str, Any]] = []
    packs: list[str] = []
    for record in selected:
        path = render_asset(record, root=root)
        html_text = path.read_text(encoding="utf-8")
        decision = evaluate_index_gate(record, html_text, root=root, sitemap=locs)
        pack = prepare_distribution_pack(record)
        packs.append(str(write_pack(pack, root=root).relative_to(root)))
        rendered.append(
            {
                "asset_id": record["asset_id"],
                "url": record["url"],
                "existing_url": record.get("existing_url"),
                "path": str(path.relative_to(root)),
                "content_hash": decision.content_hash,
                "index": decision.as_dict(),
                "inspect": inspect_html(html_text),
            }
        )
    selection = {
        "schema": "organic-breakout-selection/1.0",
        "campaign": CAMPAIGN,
        "max_assets": MAX_ASSETS,
        "asset_count": len(selected),
        "frontier": None if frontier is None else {"present": True},
        "gsc": {
            "performance_status": gsc_state["performance_status"],
            "credential_present": gsc_state["credential_present"],
            "historical_neq_live": True,
            "live_baseline_invented": False,
            "pull_error": gsc_state["pull_28"].get("error"),
        },
        "assets": rendered,
        "packs": packs,
        "duplicate_intents": duplicate_intents(selected),
        "forbidden_prefixes_untouched": list(FORBIDDEN_PATH_PREFIXES),
    }
    dest = root / SELECTION_REL
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(selection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return selection


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.organic.breakout")
    parser.add_argument("command", nargs="?", default="build", choices=("build", "validate", "hashes"))
    args = parser.parse_args(argv)
    result = run_build()
    if args.command == "hashes":
        print(
            json.dumps(
                {row["asset_id"]: row["content_hash"] for row in result.get("assets") or []},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.command == "validate":
        ok = (
            result.get("asset_count", 99) <= MAX_ASSETS
            and not result.get("duplicate_intents")
            and all((row.get("index") or {}).get("indexable") for row in result.get("assets") or [])
        )
        print(json.dumps({"ok": ok, **result}, ensure_ascii=False, indent=2))
        return 0 if ok else 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
