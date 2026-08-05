"""Shared HTML chrome matching the existing CONFENGE static site."""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from scripts.site.brand import footer_blurb as _footer_blurb
    from scripts.site.brand import load_brand as _load_brand
    from scripts.site.brand import org_description as _org_description
except Exception:  # noqa: BLE001 ,  keep pSEO build resilient
    _load_brand = None  # type: ignore[assignment]
    _org_description = None  # type: ignore[assignment]
    _footer_blurb = None  # type: ignore[assignment]

SITE = "https://confenge.com.br"
WA_BASE = "https://wa.me/5548988344559"

_ORG_DESC_FALLBACK = (
    "Diretoria B2G fracionada para construtoras e empresas de engenharia: "
    "inteligência de mercado, decisão de participação, proposta, proteção de "
    "margem e riscos em contratos públicos."
)
_FOOTER_FALLBACK = (
    "Diretoria B2G fracionada para construtoras: decisão de participação, "
    "proposta, proteção de margem e gestão de riscos em contratos públicos."
)


def _brand_safe() -> dict[str, Any]:
    if _load_brand is None:
        return {}
    try:
        return _load_brand()
    except Exception:  # noqa: BLE001
        return {}


def _org_desc() -> str:
    if _org_description is None:
        return _ORG_DESC_FALLBACK
    try:
        return _org_description() or _ORG_DESC_FALLBACK
    except Exception:  # noqa: BLE001
        return _ORG_DESC_FALLBACK


def _footer_text() -> str:
    if _footer_blurb is None:
        return _FOOTER_FALLBACK
    try:
        return _footer_blurb() or _FOOTER_FALLBACK
    except Exception:  # noqa: BLE001
        return _FOOTER_FALLBACK


ORG_JSONLD = {
    "@type": "Organization",
    "@id": f"{SITE}/#organization",
    "name": "CONFENGE",
    "legalName": "CONFENGE",
    "url": f"{SITE}/",
    "logo": f"{SITE}/assets/logo-confenge.png",
    "image": f"{SITE}/assets/og-confenge.jpg",
    "description": _org_desc(),
    "email": "tiago.sasaki@confenge.com.br",
    "telephone": "+55-48-98834-4559",
    "taxID": "52.407.089/0001-09",
}
PERSON_JSONLD = {
    "@type": "Person",
    "@id": f"{SITE}/#tiago",
    "name": "Engº Tiago Sasaki",
    "image": f"{SITE}/assets/tiago-sasaki-foto-v11-sem-fundo.png",
    "url": f"{SITE}/especialista/tiago-jun-sasaki/",
    "jobTitle": "Engenheiro Civil e consultor B2G",
    "worksFor": {"@id": f"{SITE}/#organization"},
}

SVG_SPRITE = """<svg aria-hidden="true" class="svg-sprite" height="0" width="0">
<symbol id="i-arrow" viewbox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></symbol>
<symbol id="i-check" viewbox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></symbol>
<symbol id="i-chart" viewbox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"></path></symbol>
<symbol id="i-shield" viewbox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path></symbol>
<symbol id="i-building" viewbox="0 0 24 24"><path d="M3 21h18M5 21V9m14 12V9M3 9h18L12 3 3 9Z"></path></symbol>
<symbol id="i-file" viewbox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"></path></symbol>
<symbol id="i-menu" viewbox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"></path></symbol>
<symbol id="i-close" viewbox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></symbol>
<symbol id="i-whatsapp" viewbox="0 0 24 24"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z"></path></symbol>
</svg>"""


def _build_header() -> str:
    brand = _brand_safe()
    # Approved visitor redesign shell (fallback matches data/site/brand.json).
    nav = (brand.get("navigation") or {}).get("desktop") or [
        {"label": "Serviços", "href": "/#ofertas"},
        {"label": "Problemas que resolvemos", "href": "/#jornadas"},
        {"label": "Conteúdos e ferramentas", "href": "/conteudos/"},
        {"label": "Especialista", "href": "/especialista/tiago-jun-sasaki/"},
    ]
    cta = (brand.get("navigation") or {}).get("cta") or {
        "label": "Analisar meu caso",
        "href": "/#contato",
    }
    links = "\n".join(f'<a href="{n["href"]}">{n["label"]}</a>' for n in nav)
    mobile = "".join(f'<a href="{n["href"]}">{n["label"]}</a>' for n in nav)
    return f"""<header class="site-header" id="inicio">
<div class="container header-inner">
<a aria-label="CONFENGE, página inicial" class="brand" href="/"><img alt="CONFENGE Inteligência Técnica" height="208" src="/assets/logo-confenge.png" width="800"/></a>
<nav aria-label="Navegação principal" class="desktop-nav">
{links}
</nav>
<a class="button button-primary header-cta" href="{cta['href']}">{cta['label']}</a>
<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" class="menu-toggle" type="button">
<svg class="icon menu-open"><use href="#i-menu"></use></svg><svg class="icon menu-close"><use href="#i-close"></use></svg>
</button>
</div>
<nav aria-label="Navegação móvel" class="mobile-nav" id="mobile-menu">
{mobile}
<a class="button button-primary" href="{cta['href']}">{cta['label']}</a>
</nav>
</header>"""


def _build_footer() -> str:
    blurb = _footer_text()
    brand = _brand_safe()
    offers = brand.get("offers") or []
    offer_links = "".join(
        f'<a href="{o.get("url")}">{html.escape(o.get("name") or "")}</a>' for o in offers
    ) or (
        '<a href="/diagnostico-b2g-360/">Diagnóstico B2G 360°</a>'
        '<a href="/diretoria-b2g/">Diretoria B2G</a>'
        '<a href="/bid-room-licitacoes-obras/">Bid Room</a>'
        '<a href="/defesa-margem-contratos-publicos/">Defesa de margem</a>'
    )
    return f"""<footer class="site-footer">
<div class="container footer-top">
<div class="footer-brand"><img alt="CONFENGE" height="208" src="/assets/logo-confenge-white.png" width="800"/><p>{html.escape(blurb)}</p></div>
<div class="footer-links"><strong>Ofertas</strong>{offer_links}</div>
<div class="footer-links footer-clusters"><strong>Problemas técnicos</strong><a href="/diagnostico-pre-licitacao/">Edital e proposta</a><a href="/auditoria-orcamento-licitacao/">Orçamento e BDI</a><a href="/medicoes-glosas-obras-publicas/">Medições e glosas</a><a href="/aditivos-obras-publicas/">Aditivos</a><a href="/reequilibrio-obras-publicas/">Reequilíbrio</a><a href="/defesa-tecnica-contratos-publicos/">Defesa técnica</a><a href="/acompanhamento-contratos-obras/">Gestão contratual</a><a href="/atrasos-prorrogacao-obras-publicas/">Atrasos</a></div>
<div class="footer-links"><strong>Empresa</strong><a href="/">Início</a><a href="/inteligencia/">Inteligência</a><a href="/conteudos/">Conteúdos</a><a href="/especialista/tiago-jun-sasaki/">Especialista</a><a href="mailto:tiago.sasaki@confenge.com.br">tiago.sasaki@confenge.com.br</a><a href="tel:+5548988344559">(48) 98834-4559</a><span>Atendimento nacional</span></div>
</div>
<div class="container footer-bottom"><span>© <span id="year">2026</span> CONFENGE. CNPJ 52.407.089/0001-09.</span><a href="/privacidade/">Política de Privacidade</a></div>
</footer>"""


HEADER = _build_header()
FOOTER = _build_footer()


def e(s: Any) -> str:
    return html.escape("" if s is None else str(s), quote=True)


def money(v: Any) -> str:
    if v is None:
        return ", "
    try:
        n = float(v)
    except (TypeError, ValueError):
        return ", "
    return f"R$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def wa_link(message: str) -> str:
    return f"{WA_BASE}?text={quote(message)}"


def attribution_query(meta: dict[str, Any], cta_position: str) -> str:
    """Public CTA attribution query. Never expose pipeline field names."""
    parts = []
    # Map internal keys → public-safe query keys (no dataset_hash / pipeline jargon)
    key_map = (
        ("pseo_page_id", "pseo_page_id"),
        ("page_type", "page_type"),
        ("archetype", "segment_key"),
        ("segment", "segment"),
        ("region", "region"),
        ("agency_id", "agency_id"),
        ("intent", "intent"),
        # deliberately omit source_run_id / dataset_hash (pipeline provenance)
        ("origem", "origem"),
    )
    for src, pub in key_map:
        v = meta.get(src)
        if v:
            parts.append(f"{pub}={quote(str(v)[:120])}")
    # Short snapshot fingerprint without the name "dataset_hash"
    snap = meta.get("snapshot") or meta.get("dataset_hash")
    if snap:
        parts.append(f"snap={quote(str(snap)[:16])}")
    parts.append(f"cta_position={quote(cta_position)}")
    return "&".join(parts)


def form_href(meta: dict[str, Any], tema: str, cta_position: str = "form") -> str:
    q = attribution_query(meta, cta_position)
    return f"/?tema={quote(tema)}&origem={quote(meta.get('origem') or meta.get('url') or '/')}&{q}#contato"


def breadcrumbs_html(crumbs: list[tuple[str, str | None]]) -> str:
    items = []
    for i, (name, href) in enumerate(crumbs):
        if href and i < len(crumbs) - 1:
            items.append(
                f'<li><a href="{e(href)}">{e(name)}</a><span aria-hidden="true">/</span></li>'
            )
        else:
            items.append(f'<li aria-current="page">{e(name)}</li>')
    return f'<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol>{"".join(items)}</ol></nav>'


def breadcrumb_jsonld(crumbs: list[tuple[str, str | None]]) -> dict:
    elements = []
    for i, (name, href) in enumerate(crumbs, start=1):
        item: dict[str, Any] = {"@type": "ListItem", "position": i, "name": name}
        if href:
            item["item"] = href if href.startswith("http") else f"{SITE}{href}"
        elements.append(item)
    return {"@type": "BreadcrumbList", "itemListElement": elements}


def page_shell(
    *,
    title: str,
    description: str,
    canonical_path: str,
    robots: str,
    og_title: str | None = None,
    jsonld_graph: list[dict],
    body_main: str,
    wa_message: str,
    extra_head: str = "",
    data_attrs: dict[str, str] | None = None,
    author_name: str | None = None,
) -> str:
    canonical = f"{SITE}{canonical_path}"
    og_t = og_title or title
    attrs = data_attrs or {}
    body_attr = " ".join(f'data-{k}="{e(v)}"' for k, v in attrs.items())
    author = author_name or "Engº Tiago Sasaki"
    ld = json.dumps(
        {"@context": "https://schema.org", "@graph": jsonld_graph},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"""<!DOCTYPE html>
<html class="no-js" lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{e(title)}</title>
<meta content="{e(description)}" name="description"/>
<meta content="{e(robots)}" name="robots"/>
<meta content="#061a33" name="theme-color"/>
<link href="{e(canonical)}" rel="canonical"/>
<link href="/assets/favicon-32.png" rel="icon" sizes="32x32" type="image/png"/>
<link href="/assets/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180"/>
<link href="/manifest.webmanifest" rel="manifest"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<link href="/styles.css" rel="stylesheet"/>
<script defer="" src="/script.js"></script>
<meta content="article" property="og:type"/>
<meta content="pt_BR" property="og:locale"/>
<meta content="CONFENGE" property="og:site_name"/>
<meta content="{e(og_t)}" property="og:title"/>
<meta content="{e(description)}" property="og:description"/>
<meta content="{e(canonical)}" property="og:url"/>
<meta content="{SITE}/assets/og-confenge.jpg" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="{e(author)}" name="author"/>
<script type="application/ld+json">{ld}</script>
{extra_head}
</head>
<body {body_attr}>
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{SVG_SPRITE}
{HEADER}
<main id="conteudo">
{body_main}
</main>
{FOOTER}
<aside class="contact-float" aria-label="Contato rápido"><a aria-label="Falar com a CONFENGE pelo WhatsApp" class="whatsapp-float" data-cta-position="float" data-content-cluster="pseo" href="{e(wa_link(wa_message))}" rel="noopener" target="_blank"><svg class="icon"><use href="#i-whatsapp"></use></svg></a></aside>
</body>
</html>
"""


def indicators_html(items: list[tuple[str, str, str | None]]) -> str:
    """items: (label, value, hint)"""
    cards = []
    for label, value, hint in items:
        h = f"<small>{e(hint)}</small>" if hint else ""
        cards.append(
            f'<div class="criterion-card"><span>{e(label)}</span><div><h3>{e(value)}</h3>{h}</div></div>'
        )
    return f'<div class="criteria-grid">{"".join(cards)}</div>'


def table_html(headers: list[str], rows: list[list[Any]], caption: str | None = None) -> str:
    th = "".join(f"<th>{e(h)}</th>" for h in headers)
    trs = []
    for row in rows:
        trs.append("<tr>" + "".join(f"<td>{e(c)}</td>" for c in row) + "</tr>")
    cap = f"<caption>{e(caption)}</caption>" if caption else ""
    return (
        f'<div class="table-wrap" data-pseo-table="1"><table class="data-table">{cap}'
        f"<thead><tr>{th}</tr></thead><tbody>{''.join(trs)}</tbody></table></div>"
    )


def author_box() -> str:
    return """<section class="author-box"><div class="author-photo"><img src="/assets/tiago-sasaki-avatar-v11-sem-fundo.png" width="512" height="512" alt="Engº Tiago Sasaki" loading="lazy" decoding="async"/></div><div><span>Autor e responsável técnico pelo conteúdo</span><h2><a href="/especialista/tiago-jun-sasaki/">Engº Tiago Sasaki</a></h2><p>Engenheiro Civil formado pela EESC-USP, com experiência na iniciativa privada e na Administração Pública, atuando em fiscalização, gestão de contratos, orçamentação e decisões técnicas em obras públicas.</p><a class="text-link" href="/especialista/tiago-jun-sasaki/">Conhecer a experiência <svg class="icon"><use href="#i-arrow"></use></svg></a></div></section>"""


def cta_block(meta: dict[str, Any], label: str, wa_message: str, tema: str) -> str:
    """Commercial CTA for pSEO pages ,  decision/consequence language, not pipeline jargon."""
    wa = wa_link(wa_message)
    form = form_href(meta, tema, "inline_cta")
    attr = attribution_query(meta, "inline_cta")
    # Prefer economic framing when label is generic
    display = label
    if not display or "oferta coerente" in display.lower() or "organizar documentos" in display.lower():
        display = "O edital parece atraente. A planilha pode dizer o contrário."
    body = (
        "Antes de imobilizar a equipe, confronte edital, preço, cronograma e risco de execução "
        "com a capacidade real da empresa."
    )
    return f"""<section class="lead-inline" id="diagnostico-confenge" aria-label="Próximo passo comercial" data-pseo-cta="1" data-pseo-attr="{e(attr)}">
<div class="lead-inline-copy"><span>Próximo passo</span><strong>{e(display)}</strong>
<p>{e(body)}</p></div>
<div class="lead-inline-actions">
<a class="button button-primary" data-cta-position="inline_cta" data-content-cluster="pseo" data-pseo-event="pseo_whatsapp_click" href="{e(wa)}" rel="noopener" target="_blank">Revisar esta oportunidade</a>
<a class="button button-secondary" data-cta-position="form" data-content-cluster="pseo" data-pseo-event="pseo_cta_click" href="{e(form)}">Continuar pelo formulário</a>
</div></section>"""


def _br(iso: str | None) -> str:
    if not iso:
        return ", "
    d = str(iso)[:10]
    if len(d) == 10 and d[4] == "-" and d[7] == "-":
        return f"{d[8:10]}/{d[5:7]}/{d[0:4]}"
    return str(iso)


# Internal source keys → visitor-facing labels (never emit raw pipeline names)
_SOURCE_PUBLIC_LABELS = {
    "pncp_supplier_contracts": "Contratos públicos (PNCP e portais correlatos)",
    "site-confenge-guides": "Biblioteca técnica CONFENGE",
    "pncp_raw_bids": "Editais e avisos públicos (PNCP)",
    "sc_public_entities": "Cadastros públicos de entes e órgãos",
}


def public_source_label(raw: str | None) -> str:
    """Map internal dataset keys to public labels; leave already-human text as-is."""
    s = (raw or "").strip()
    if not s:
        return "Fontes públicas oficiais"
    if s in _SOURCE_PUBLIC_LABELS:
        return _SOURCE_PUBLIC_LABELS[s]
    # slug-like internal keys → humanize without exposing pipeline jargon
    if re.fullmatch(r"[a-z][a-z0-9_]{2,}", s) and "_" in s:
        return s.replace("_", " ").capitalize()
    # bare short source keys (e.g. "pncp")
    if re.fullmatch(r"[a-z]{2,12}", s):
        return {
            "pncp": "Portal Nacional de Contratações Públicas (PNCP)",
            "sinapi": "SINAPI (Caixa)",
            "sicro": "SICRO (DNIT)",
        }.get(s, s.upper() if len(s) <= 5 else s.capitalize())
    return s


# Internal field / pipeline tokens that must never appear in visitor-facing copy
_INTERNAL_FIELD_RE = re.compile(
    r"\b("
    r"historical_count|open_count|data_encerramento|as_of|verified_at|"
    r"value_status|status_bucket|link_pncp|link_oficial|pncp_id|"
    r"dataset_hash|source_run_id|page_material_hash|mandatory_fail|"
    r"quality_gates?|human_review|claim_evidence|evidence_kind|"
    r"framework_with_market_density|PUBLISH_READY|NOINDEX_"
    r")\b",
    re.I,
)

_LIMITATION_REPLACEMENTS = (
    (
        re.compile(
            r"Somente oportunidades com data_encerramento\s*>=\s*as_of e status compativel\.?",
            re.I,
        ),
        "Somente oportunidades ainda abertas na data de verificação, com status compatível.",
    ),
    (
        re.compile(
            r"historical_count\s+N[AÃ]O\s+entra\s+em\s+open_count\.?",
            re.I,
        ),
        "A contagem histórica não se confunde com o total de oportunidades abertas.",
    ),
    (
        re.compile(r"Nao e monitoramento em tempo real; verifique no portal oficial\.?", re.I),
        "Não é monitoramento em tempo real; confira sempre no portal oficial.",
    ),
    (
        re.compile(r"Pagina evergreen:\s*nao indexa um edital por URL\.?", re.I),
        "Página evergreen: não indexa um edital individual por URL.",
    ),
    (re.compile(r"\bdata_encerramento\b", re.I), "data de encerramento"),
    (re.compile(r"\bas_of\b", re.I), "data de verificação"),
    (re.compile(r"\bhistorical_count\b", re.I), "contagem histórica"),
    (re.compile(r"\bopen_count\b", re.I), "total de abertas"),
    (re.compile(r"\bverified_at\b", re.I), "data de verificação"),
    (re.compile(r"\bstatus_bucket\b", re.I), "status"),
    (re.compile(r"\bvalue_status\b", re.I), "status do valor"),
)


def scrub_public_limitation(text: str | None) -> str:
    """Rewrite snapshot limitations so pipeline field names never reach HTML."""
    s = str(text or "").strip()
    if not s:
        return s
    for pat, repl in _LIMITATION_REPLACEMENTS:
        s = pat.sub(repl, s)
    # Final safety: any remaining snake_case internal tokens → neutral wording
    s = _INTERNAL_FIELD_RE.sub("critério interno omitido", s)
    s = s.replace("problema→serviço", "problema e serviço")
    s = re.sub(r"\bdatalake\b", "base pública de contratos", s, flags=re.I)
    return s


def scrub_public_limitations(items: list | None) -> list[str]:
    return [scrub_public_limitation(x) for x in (items or []) if str(x).strip()]


def methodology_block(
    period_start: str | None,
    period_end: str | None,
    sources: list[str],
    limitations: list[str],
    extra: str = "",
) -> str:
    labels = [public_source_label(s) for s in (sources or [])]
    src = "".join(f"<li>{e(s)}</li>" for s in labels) or (
        "<li>Fontes públicas oficiais de contratações e biblioteca técnica CONFENGE</li>"
    )
    lim_items = scrub_public_limitations(limitations)
    lim = "".join(f"<li>{e(s)}</li>" for s in lim_items)
    if period_start and period_end:
        period_html = (
            f'Período dos dados: <strong><time datetime="{e(period_start)}">{e(_br(period_start))}</time></strong> '
            f'a <strong><time datetime="{e(period_end)}">{e(_br(period_end))}</time></strong>.'
        )
    elif period_start or period_end:
        one = period_start or period_end
        period_html = f'Período dos dados (referência): <strong><time datetime="{e(one)}">{e(one)}</time></strong>.'
    else:
        period_html = (
            "Período dos dados: <strong>não informado neste recorte</strong> "
            "(página conceitual ou sem janela temporal aplicável)."
        )
    return f"""<section class="sources-section" id="metodologia">
<p class="eyebrow">Metodologia e limitações</p>
<h2>Como estes dados foram produzidos</h2>
<p>{period_html}
Síntese a partir de registros públicos de contratação e da biblioteca técnica CONFENGE.
Não é monitoramento em tempo real nem censo nacional.</p>
{extra}
<p><strong>Fontes</strong></p><ul>{src}</ul>
<p><strong>Limitações</strong></p><ul>{lim}</ul>
<p class="technical-note">Conteúdo de inteligência decisória com base em evidência pública. Não constitui ranking comercial proprietário nem recomendação de participação em licitação específica.</p>
</section>"""


_SERVICE_LABELS = {
    "aditivos-obras-publicas": "Aditivos e serviços extras em obras públicas",
    "auditoria-orcamento-licitacao": "Auditoria de orçamento, BDI e referências",
    "medicoes-glosas-obras-publicas": "Medições, glosas e pagamentos",
    "reequilibrio-obras-publicas": "Reequilíbrio econômico-financeiro",
    "diagnostico-pre-licitacao": "Diagnóstico pré-licitação e edital",
    "defesa-tecnica-contratos-publicos": "Defesa técnica e sanções",
    "acompanhamento-contratos-obras": "Gestão e acompanhamento contratual",
    "atrasos-prorrogacao-obras-publicas": "Atrasos e prorrogações",
}


def _service_label(path_or_slug: str) -> str:
    s = (path_or_slug or "").strip().strip("/")
    if not s:
        return "Serviço CONFENGE"
    slug = s.split("/")[-1] if "/" in s else s
    if slug in _SERVICE_LABELS:
        return _SERVICE_LABELS[slug]
    # Humanize without crude Title Case on Portuguese particles
    words = slug.replace("-", " ").split()
    small = {"de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os"}
    out = []
    for i, w in enumerate(words):
        wl = w.lower()
        out.append(wl if i > 0 and wl in small else wl.capitalize())
    return " ".join(out) or "Serviço CONFENGE"


def confenge_help(service_paths: list[str], text: str) -> str:
    items = []
    # Prefer shared editorial labeler (conteúdos + services) when available
    try:
        from scripts.pseo.render import guide_path_label as _labeler
    except Exception:  # noqa: BLE001
        _labeler = _service_label
    for p in service_paths[:4]:
        raw = (p or "").strip()
        if not raw:
            continue
        href = raw if raw.startswith("/") else f"/{raw.strip('/')}/"
        label = _labeler(raw)
        items.append(
            f'<li><a href="{e(href)}" data-pseo-event="pseo_related_page_click">{e(label)}</a></li>'
        )
    links = "".join(items)
    return f"""<section id="como-ajudamos">
<p class="eyebrow">Atuação adequada</p>
<h2>Como a CONFENGE pode ajudar neste cenário</h2>
<p>{e(text)}</p>
<ul>{links}</ul>
</section>"""
