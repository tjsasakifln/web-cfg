"""Entity-authority contract: matrix, visible slots, schema mirror, proof and cases.

Pure checkers used by tests and optional page audits. Fail-closed: missing
required slots and invented schema/credentials/cases are errors.
"""

from __future__ import annotations

import json
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SITE_DATA = ROOT / "data" / "site"
SITE = "https://confenge.com.br"

SURFACE_TYPES = (
    "servico",
    "conteudo_tecnico",
    "ferramenta",
    "pesquisa_dataset",
    "caso_proof",
    "analise_tecnica_contrato",
)

PERMISSION_CLASSES = ("demonstrativo", "consented", "confidential", "redacted")

REQUIRED_SLOT_KEYS = (
    "author",
    "reviewer",
    "evidence",
    "update_history",
    "ai_disclosure",
    "consent",
)

FORBIDDEN_SCHEMA_TYPES = frozenset({"Review", "AggregateRating", "CaseStudy"})
FORBIDDEN_INVENTED_ASSOCIATION_KEYS = ("memberOf", "affiliation", "award", "awards")

ANALYSIS_CASE_TOKENS = (
    "caso confenge",
    "case de cliente",
    "customer success",
    "caso de sucesso",
    "depoimento de cliente",
)

ANALYSIS_DISCLAIMER_TOKENS = (
    "sem relação comercial",
    "sem relacao comercial",
    "não implica relação comercial",
    "nao implica relacao comercial",
    "não é caso confenge",
    "nao e caso confenge",
    "não é um caso confenge",
    "nao e um caso confenge",
    "não são casos confenge",
    "nao sao casos confenge",
    "não é case de cliente",
    "nao e case de cliente",
)

# Visible credential-like claims that are not independently verified and
# must not appear unless listed on a public VERIFIED proof record.
INVENTED_CREDENTIAL_PATTERNS = (
    r"\bcrea\s*n[ºo°]",
    r"\b\d+\s+anos de experi",
    r"\biso\s*9001\b",
    r"\boab\b",
    r"\btop\s+\d+",
    r"\bmelhor consultoria\b",
    r"\bselo\b",
    r"\bcertifica[cç][aã]o internacional\b",
    r"\b5\s*estrelas\b",
    r"\bavalia[cç][aã]o\s+\d",
    r"\b\d+\s+obras (entregues|executadas)\b",
    r"\br\$\s*\d+.*recuperad",
)

_PATH_RULES: tuple[tuple[str, str], ...] = (
    ("/analises-contratos-publicos/", "analise_tecnica_contrato"),
    ("/casos/", "caso_proof"),
    ("/ferramentas/", "ferramenta"),
    ("/inteligencia/", "pesquisa_dataset"),
    ("/radar/", "pesquisa_dataset"),
    ("/metodologia-inteligencia/", "pesquisa_dataset"),
    ("/conteudos/", "conteudo_tecnico"),
    ("/lei-14133-obras/", "conteudo_tecnico"),
    ("/jurisprudencia-contratos-obras/", "conteudo_tecnico"),
    ("/guias-contratos-obras/", "conteudo_tecnico"),
    ("/diagnostico-b2g-360/", "servico"),
    ("/diretoria-b2g/", "servico"),
    ("/bid-room-licitacoes-obras/", "servico"),
    ("/defesa-margem-contratos-publicos/", "servico"),
    ("/acompanhamento-contratos-obras/", "servico"),
    ("/aditivos-obras-publicas/", "servico"),
    ("/atrasos-prorrogacao-obras-publicas/", "servico"),
    ("/auditoria-orcamento-licitacao/", "servico"),
    ("/defesa-tecnica-contratos-publicos/", "servico"),
    ("/diagnostico-pre-licitacao/", "servico"),
    ("/medicoes-glosas-obras-publicas/", "servico"),
    ("/reequilibrio-obras-publicas/", "servico"),
)

PUBLIC_FAMILY_ROOTS = (
    "acompanhamento-contratos-obras",
    "aditivos-obras-publicas",
    "analises-contratos-publicos",
    "atrasos-prorrogacao-obras-publicas",
    "auditoria-orcamento-licitacao",
    "bid-room-licitacoes-obras",
    "casos",
    "conteudos",
    "defesa-margem-contratos-publicos",
    "defesa-tecnica-contratos-publicos",
    "diagnostico-b2g-360",
    "diagnostico-pre-licitacao",
    "diretoria-b2g",
    "ferramentas",
    "guias-contratos-obras",
    "inteligencia",
    "jurisprudencia-contratos-obras",
    "lei-14133-obras",
    "medicoes-glosas-obras-publicas",
    "metodologia-inteligencia",
    "radar",
    "reequilibrio-obras-publicas",
)

CHROME_EXEMPT_PREFIXES = (
    "/politica-editorial/",
    "/correcoes/",
    "/uso-de-ia/",
    "/conflitos/",
    "/privacidade/",
    "/termos-de-uso/",
    "/especialista/",
    "/imprensa/",
    "/nurture/",
    "/piloto/",
    "/ops/",
    "/obrigado",
)

FOOTER_AUTHORITY_NAV = (
    '<nav class="footer-authority" aria-label="Autoridade e políticas">'
    '<a href="/politica-editorial/">Política editorial</a>'
    '<a href="/correcoes/">Correções</a>'
    '<a href="/uso-de-ia/">Uso de IA</a>'
    '<a href="/conflitos/">Conflitos</a>'
    '<a href="/privacidade/">Privacidade</a>'
    "</nav>"
)


def _load(name: str) -> dict[str, Any]:
    path = SITE_DATA / name
    if not path.exists():
        raise FileNotFoundError(f"Missing authority data: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_matrix() -> dict[str, Any]:
    return _load("authority-matrix.json")


def load_governance() -> dict[str, Any]:
    return _load("authority-governance.json")


def load_editorial_policy() -> dict[str, Any]:
    return _load("editorial-policy.json")


def load_signals_baseline() -> dict[str, Any]:
    path = SITE_DATA / "authority-signals-baseline-2026-08-15.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing signals baseline: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_proof() -> dict[str, Any]:
    from scripts.site.brand import load_proof as _lp

    return _lp()


def load_cases() -> dict[str, Any]:
    from scripts.site.brand import load_cases as _lc

    return _lc()


def footer_authority_nav() -> str:
    return FOOTER_AUTHORITY_NAV


def classify_surface(path: str, html: str | None = None) -> str | None:
    """Return one matrix type, or None for identity/policy/other (fail-closed)."""
    raw = (path or "").strip()
    if raw.startswith("http"):
        raw = urlparse(raw).path
    if not raw.startswith("/"):
        raw = "/" + raw
    if raw.endswith("index.html"):
        raw = raw[: -len("index.html")]
    if not raw.endswith("/"):
        raw += "/"
    if html:
        m = re.search(r'data-surface-type="([a-z_]+)"', html)
        if m and m.group(1) in SURFACE_TYPES:
            return m.group(1)
    for prefix, kind in _PATH_RULES:
        if raw.startswith(prefix):
            return kind
    return None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _strip_tags(html: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", html or "", flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text))


class _JSONLDCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._in_ld = False
        self._buf: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        ad = {k.lower(): (v or "") for k, v in attrs}
        if ad.get("type", "").lower() == "application/ld+json":
            self._in_ld = True
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._in_ld:
            self.blocks.append("".join(self._buf))
            self._in_ld = False
            self._buf = []

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._buf.append(data)


def extract_jsonld_blocks(html: str) -> list[Any]:
    parser = _JSONLDCollector()
    try:
        parser.feed(html or "")
    except Exception:  # noqa: BLE001 — tolerate broken markup
        return []
    out: list[Any] = []
    for raw in parser.blocks:
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return out


def flatten_jsonld_nodes(blocks: list[Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, list):
            for item in obj:
                walk(item)
            return
        if not isinstance(obj, dict):
            return
        graph = obj.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                walk(item)
        if obj.get("@type") or obj.get("author") or obj.get("aggregateRating"):
            nodes.append(obj)

    for block in blocks:
        walk(block)
    return nodes


def _types_of(node: dict[str, Any]) -> set[str]:
    t = node.get("@type")
    if isinstance(t, list):
        return {str(x) for x in t}
    if t:
        return {str(t)}
    return set()


def _node_name(node: Any, by_id: dict[str, dict[str, Any]]) -> str:
    if isinstance(node, str):
        ref = by_id.get(node) or {}
        return str(ref.get("name") or "")
    if not isinstance(node, dict):
        return ""
    if node.get("name"):
        return str(node["name"])
    ref = node.get("@id")
    if ref and ref in by_id:
        return str(by_id[ref].get("name") or "")
    return ""


def _without_scripts(html: str) -> str:
    return re.sub(r"<script\b[^>]*>.*?</script>", " ", html or "", flags=re.I | re.S)


def extract_visible_authority(html: str) -> dict[str, Any]:
    markup = _without_scripts(html or "")
    visible = _strip_tags(markup)
    authors: list[str] = []
    for pat in (
        r'rel="author"[^>]*>([^<]+)',
        r'<a[^>]+rel="author"[^>]*>([^<]+)',
        r'data-author="([^"]+)"',
        r"<meta[^>]+name=\"author\"[^>]+content=\"([^\"]+)\"",
        r"<meta[^>]+content=\"([^\"]+)\"[^>]+name=\"author\"",
        r"Autoria:\s*</strong>\s*([^·<]+)",
        r"<strong>Autoria:</strong>\s*([^·<]+)",
        r"Responsável técnico:\s*<a[^>]*>([^<]+)",
        r"Responsavel tecnico:\s*<a[^>]*>([^<]+)",
        r"Responsável técnico:\s*([^·<]+)",
    ):
        for m in re.finditer(pat, markup, flags=re.I):
            name = re.sub(r"\s+", " ", m.group(1)).strip(" ·")
            if name and name not in authors:
                authors.append(name)
    meta_line = re.search(
        r'class="article-meta(?:-line)?"[^>]*>(.*?)</(?:div|p)>',
        markup,
        flags=re.I | re.S,
    )
    if meta_line:
        first = re.search(r"<span>([^<]+)</span>", meta_line.group(1))
        if first:
            name = first.group(1).strip()
            if name and name.lower() not in {"·", "atualizado em"} and name not in authors:
                authors.append(name)
    dates = re.findall(r'<time[^>]+datetime="([^"]+)"', markup, flags=re.I)
    dates += re.findall(
        r'<meta[^>]+(?:article:modified_time|article:published_time)"[^>]+content="([^"]+)"',
        markup,
        flags=re.I,
    )
    dates += re.findall(
        r'content="([^"]+)"[^>]+(?:article:modified_time|article:published_time)',
        markup,
        flags=re.I,
    )
    dates += re.findall(r"\b(20\d{2}-\d{2}-\d{2})\b", markup)
    permission = None
    pm = re.search(r'data-permission-class="([a-z_]+)"', html or "", flags=re.I)
    if pm:
        permission = pm.group(1).lower()
    return {
        "text": visible,
        "norm": _norm(visible),
        "authors": authors,
        "dates": sorted(set(dates)),
        "permission_class": permission,
        "has_org": "confenge" in _norm(visible),
    }


def has_solo_reviewer_disclosure(html: str, matrix: dict[str, Any] | None = None) -> bool:
    tokens = (
        ((matrix or load_matrix()).get("reviewer_trigger") or {}).get("solo_disclosure_tokens")
        or []
    )
    blob = _norm(_strip_tags(html or ""))
    return any(_norm(tok) in blob for tok in tokens)


def has_named_reviewer(html: str) -> bool:
    if re.search(r'data-reviewer="[^"]+"', html or "", flags=re.I):
        return True
    return bool(
        re.search(
            r"revis[aã]o t[eé]cnica\s*:\s*([A-ZÁÉÍÓÚÂÊÔÃÕ][^.<]{2,80})",
            html or "",
            flags=re.I,
        )
    )


def has_visible_author(html: str) -> bool:
    vis = extract_visible_authority(html)
    if vis["authors"]:
        return True
    blob = vis["norm"]
    return bool(
        re.search(
            r"(autor e respons[aá]vel t[eé]cnico|respons[aá]vel t[eé]cnico|autoria:|rel=\"author\")",
            blob,
        )
        or "engº tiago sasaki" in blob
        or "eng. tiago sasaki" in blob
        or "biblioteca técnica confenge" in blob
        or "biblioteca tecnica confenge" in blob
    )


def _is_required(spec: str) -> bool:
    return spec == "required"


def _requires_reviewer(spec: str, html: str, surface: str) -> bool:
    if spec == "required":
        return True
    if spec != "required_if_legal_claim":
        return False
    return has_material_legal_claim(html, surface)


def has_material_legal_claim(html: str, surface: str | None = None) -> bool:
    path_hint = surface or ""
    if path_hint in {"lei_14133_page", "jurisprudencia_page"}:
        return True
    blob = _norm(html or "")
    if "/lei-14133-obras/" in blob or "/jurisprudencia-contratos-obras/" in blob:
        return True
    if re.search(r"data-content-type=\"lei_14133\"", html or ""):
        return True
    if re.search(r"data-content-type=\"jurisprudencia\"", html or ""):
        return True
    return bool(
        re.search(
            r"(lei\s*(?:n[ºo°]?\s*)?14\.?133|art\.\s*\d+|s[uú]mula|jurisprud[eê]ncia)",
            blob,
        )
    )


def has_visible_method(html: str) -> bool:
    raw = html or ""
    if 'id="metodologia"' in raw or 'id="metodo"' in raw or "authority-method" in raw:
        return True
    if re.search(r"<h[1-6][^>]*>[^<]*m[eé]todo", raw, flags=re.I):
        return True
    blob = _norm(_strip_tags(raw))
    return bool(
        re.search(
            r"(metodologia reproduz|como (estes|esses|os) dados|como lemos|^m[eé]todo:|(?:^|[.\s])m[eé]todo:|fonte:)",
            blob,
        )
    )


def has_visible_as_of(html: str) -> bool:
    if re.search(r'<time[^>]+datetime="20\d{2}-\d{2}-\d{2}"', html or "", flags=re.I):
        return True
    if re.search(r'data-as-of="20\d{2}-\d{2}-\d{2}"', html or "", flags=re.I):
        return True
    blob = _norm(html or "")
    return bool(
        re.search(
            r"(as[_ -]?of|atualiza[cç][aã]o desta vers[aã]o|per[ií]odo (da|dos|de) (dados|demanda)|refer[eê]ncia:\s*20\d{2})",
            blob,
        )
        or re.search(r"\b20\d{2}-\d{2}-\d{2}\b", blob)
    )


def has_visible_limitations(html: str) -> bool:
    blob = _norm(_strip_tags(html or ""))
    return bool(
        re.search(
            r"(limita[cç][oõ]es|limita[cç][aã]o|o que n[aã]o alegamos|n[aã]o [eé] parecer|n[aã]o substitui|sem substituir)",
            blob,
        )
    )


def has_visible_coverage(html: str) -> bool:
    blob = _norm(_strip_tags(html or ""))
    return bool(
        re.search(
            r"(cobertura|recorte|per[ií]odo|inclus[aã]o|exclus[aã]o|n[aã]o [eé] censo|n[aã]o [eé] monitoramento em tempo real)",
            blob,
        )
    )


def has_update_history(html: str) -> bool:
    if extract_visible_authority(html)["dates"]:
        return True
    blob = _norm(html or "")
    return bool(re.search(r"(atualizado em|revisado em|última atualização|ultima atualizacao)", blob))


def has_correction_link(html: str) -> bool:
    return "/correcoes/" in (html or "")


def visible_permission_class(html: str) -> str | None:
    vis = extract_visible_authority(html)
    if vis["permission_class"] in PERMISSION_CLASSES:
        return vis["permission_class"]
    blob = _norm(_strip_tags(html or ""))
    if "demonstrativo" in blob or "não é case de cliente" in blob or "nao e case de cliente" in blob:
        return "demonstrativo"
    if "consentido" in blob or "com consentimento" in blob:
        return "consented"
    if "confidencial" in blob:
        return "confidential"
    if "redigid" in blob or "redacted" in blob:
        return "redacted"
    return None


def _main_without_footer(html: str) -> str:
    raw = html or ""
    cut = re.split(r"<footer\b", raw, maxsplit=1, flags=re.I)
    return cut[0] if cut else raw


def has_visible_ai_disclosure(html: str, *, on_page_only: bool = False) -> bool:
    """Footer /uso-de-ia/ counts unless the surface requires on-page disclosure."""
    scope = _main_without_footer(html) if on_page_only else (html or "")
    if re.search(r'data-ai-disclosure="[^"]+"', scope, flags=re.I):
        return True
    if re.search(r'id="ai-disclosure"|class="[^"]*ai-disclosure', scope, flags=re.I):
        return True
    blob = _norm(_strip_tags(scope))
    if "/uso-de-ia/" in scope or "uso de ia" in blob:
        return True
    return bool(re.search(r"intelig[eê]ncia artificial", blob))


def has_visible_consent_record(html: str) -> bool:
    blob = _norm(_strip_tags(html or ""))
    return bool(
        re.search(
            r"(registro de consentimento|consentimento (escrito|formal|documentado)|autoriza[cç][aã]o (do cliente|formal))",
            blob,
        )
    )


def has_analysis_class_label(html: str) -> bool:
    raw = html or ""
    if re.search(r'data-surface-type="analise_tecnica_contrato"', raw):
        return True
    blob = _norm(_strip_tags(raw))
    return "análise técnica de contrato público" in blob or "analise tecnica de contrato publico" in blob


def has_analysis_disclaimer(html: str) -> bool:
    blob = _norm(_strip_tags(html or ""))
    return any(tok in blob for tok in ANALYSIS_DISCLAIMER_TOKENS)


def _labels_caso_confenge(blob: str) -> bool:
    if re.search(r"n[aã]o (é|e|s[aã]o|sao) (um )?casos? confenge", blob):
        return False
    return "caso confenge" in blob or "casos confenge" in blob


def check_consent_slot(html: str, surface_type: str = "caso_proof") -> list[str]:
    """Caso CONFENGE needs permission class + real consent; demonstrativo is not consent."""
    del surface_type
    errors: list[str] = []
    klass = visible_permission_class(html)
    blob = _norm(_strip_tags(_without_scripts(html or "")))
    labeled_caso_confenge = _labels_caso_confenge(blob)
    if not klass:
        errors.append("consent_absent")
        if labeled_caso_confenge:
            errors.append("caso_confenge_without_consent")
        return errors
    if klass == "demonstrativo":
        if labeled_caso_confenge:
            errors.append("demonstrativo_labeled_caso_confenge")
        if "customer success" in blob or "caso de sucesso" in blob:
            errors.append("demonstrativo_claims_client")
        return errors
    if klass in {"consented", "confidential", "redacted"}:
        if not has_visible_consent_record(html):
            errors.append("consent_record_absent")
        if labeled_caso_confenge and not has_visible_consent_record(html):
            errors.append("caso_confenge_without_consent")
        return errors
    errors.append(f"unknown_permission_class:{klass}")
    return errors


def check_analysis_not_case(html: str) -> list[str]:
    """ANÁLISE TÉCNICA never uses Caso CONFENGE / review / customer-success semantics."""
    errors: list[str] = []
    blob = _norm(_strip_tags(_without_scripts(html or "")))
    if not has_analysis_class_label(html):
        errors.append("analysis_class_label_absent")
    if not has_analysis_disclaimer(html):
        errors.append("analysis_disclaimer_absent")
    if _labels_caso_confenge(blob):
        errors.append("analysis_labeled_caso_confenge")
    if ("customer success" in blob or "caso de sucesso" in blob) and not re.search(
        r"(n[aã]o [eé] customer success|n[aã]o [eé] caso de sucesso)",
        blob,
    ):
        errors.append("analysis_customer_success_copy")
    negated_case = "não é case de cliente" in blob or "nao e case de cliente" in blob
    if "case de cliente" in blob and not negated_case:
        errors.append("analysis_client_case_copy")
    nodes = flatten_jsonld_nodes(extract_jsonld_blocks(html))
    for node in nodes:
        types = _types_of(node)
        banned = types & {"CaseStudy", "Review", "AggregateRating"}
        if banned:
            errors.append(f"analysis_schema_case_or_review:{sorted(banned)}")
        if node.get("reviewedBy") and not has_named_reviewer(html) and not has_solo_reviewer_disclosure(html):
            errors.append("schema_invented_reviewer")
    return errors


def check_case_not_analysis(html: str) -> list[str]:
    """A caso-proof page must not wear the analysis class as its type."""
    if re.search(r'data-surface-type="analise_tecnica_contrato"', html or ""):
        return ["case_labeled_as_analysis"]
    return []


def check_matrix_slot_coverage(matrix: dict[str, Any] | None = None) -> list[str]:
    """Every matrix family must name author/reviewer/evidence/update/AI/consent."""
    m = matrix or load_matrix()
    errors: list[str] = []
    declared = tuple(m.get("required_slot_keys") or ())
    if declared != REQUIRED_SLOT_KEYS:
        errors.append("matrix_required_slot_keys_mismatch")
    surfaces = m.get("surfaces") or {}
    if not surfaces:
        return ["matrix_surfaces_absent"]
    for name, spec in surfaces.items():
        if name not in SURFACE_TYPES:
            errors.append(f"unknown_surface:{name}")
            continue
        for key in REQUIRED_SLOT_KEYS:
            if key not in spec:
                errors.append(f"matrix_slot_absent:{name}.{key}")
        if name == "analise_tecnica_contrato" and spec.get("mutually_exclusive_with") != "caso_proof":
            errors.append("analysis_not_exclusive_with_caso")
        if name == "caso_proof" and spec.get("mutually_exclusive_with") != "analise_tecnica_contrato":
            errors.append("caso_not_exclusive_with_analysis")
    for name in sorted(set(SURFACE_TYPES) - set(surfaces)):
        errors.append(f"matrix_family_absent:{name}")
    return errors


def check_required_slots(
    html: str,
    surface_type: str,
    *,
    matrix: dict[str, Any] | None = None,
) -> list[str]:
    """Return error codes for missing required slots on this surface."""
    m = matrix or load_matrix()
    spec = (m.get("surfaces") or {}).get(surface_type)
    if not spec:
        return [f"unknown_surface:{surface_type}"]
    errors: list[str] = []
    if _is_required(spec.get("author") or "") and not has_visible_author(html):
        errors.append("author_absent")
    if _requires_reviewer(spec.get("reviewer") or "", html, surface_type):
        if not has_named_reviewer(html) and not has_solo_reviewer_disclosure(html, m):
            errors.append("reviewer_absent")
    if _is_required(spec.get("update_history") or "") and not has_update_history(html):
        errors.append("update_history_absent")
    if _is_required(spec.get("methodology") or "") and not has_visible_method(html):
        errors.append("method_absent")
    if _is_required(spec.get("as_of") or "") and not has_visible_as_of(html):
        errors.append("as_of_absent")
    if _is_required(spec.get("coverage") or "") and not has_visible_coverage(html):
        errors.append("coverage_absent")
    if _is_required(spec.get("limitations") or "") and not has_visible_limitations(html):
        errors.append("limitations_absent")
    if _is_required(spec.get("permission_class") or "") and not visible_permission_class(html):
        errors.append("permission_class_absent")
    if _is_required(spec.get("citation_link") or ""):
        if not re.search(r"(como citar|citar:|citation)", html or "", flags=re.I):
            if 'rel="canonical"' not in (html or "") and "cite" not in _norm(html or ""):
                errors.append("citation_link_absent")
    if _is_required(spec.get("correction_link") or "") and not has_correction_link(html):
        errors.append("correction_link_absent")
    if _is_required(spec.get("ai_disclosure") or "") and not has_visible_ai_disclosure(
        html, on_page_only=(surface_type == "analise_tecnica_contrato")
    ):
        errors.append("ai_disclosure_absent")
    if _is_required(spec.get("consent") or ""):
        errors.extend(check_consent_slot(html, surface_type))
    if surface_type == "analise_tecnica_contrato":
        errors.extend(check_analysis_not_case(html))
    if surface_type == "caso_proof":
        errors.extend(check_case_not_analysis(html))
    return errors


def check_research_method_as_of(html: str) -> list[str]:
    errors: list[str] = []
    if not has_visible_method(html):
        errors.append("method_absent")
    if not has_visible_as_of(html):
        errors.append("as_of_absent")
    return errors


def check_case_permission_class(html: str) -> list[str]:
    if visible_permission_class(html):
        return []
    return ["permission_class_absent"]


def public_verified_claim_texts(proof: dict[str, Any] | None = None) -> list[str]:
    from scripts.site.brand import public_proof_claims
    from scripts.site.credential_registry import projectable_phrases

    out: list[str] = []
    for c in public_proof_claims(proof):
        if c.get("claim"):
            out.append(str(c["claim"]))
        for phrase in c.get("allowed_public_phrases") or []:
            out.append(str(phrase))
    out.extend(projectable_phrases())
    return out


def _claim_supported(text: str, allowed: list[str]) -> bool:
    n = _norm(text)
    if not n:
        return True
    for a in allowed:
        an = _norm(a)
        if not an:
            continue
        if an in n or n in an:
            return True
        # token overlap for close paraphrases (USP / EESC / Administração Pública)
        a_tokens = {t for t in re.split(r"[^a-z0-9áéíóúâêôãõç]+", an) if len(t) > 3}
        n_tokens = {t for t in re.split(r"[^a-z0-9áéíóúâêôãõç]+", n) if len(t) > 3}
        if a_tokens and len(a_tokens & n_tokens) >= min(2, len(a_tokens)):
            return True
    return False


def extract_credential_claim_texts(html: str) -> list[str]:
    texts: list[str] = []
    for pat in (
        r'<li[^>]*class="[^"]*proof[^"]*"[^>]*>(.*?)</li>',
        # `class` nao e necessariamente o primeiro atributo. A home escreve
        # `<ul aria-label="Credenciais verificaveis" class="hero-proof">`, e com
        # o padrao anterior, ancorado em `<ul class="`, a lista de credenciais
        # da home nunca era extraida: o gate passava por vazio, nao por acerto.
        r'<ul[^>]*\bclass="[^"]*\b(?:hero-proof|profile-list)\b[^"]*"[^>]*>(.*?)</ul>',
        r'data-credential="([^"]+)"',
    ):
        for m in re.finditer(pat, html or "", flags=re.I | re.S):
            chunk = m.group(1)
            if "<li" in chunk:
                for li in re.findall(r"<li[^>]*>(.*?)</li>", chunk, flags=re.I | re.S):
                    t = re.sub(r"<[^>]+>", " ", li)
                    t = re.sub(r"\s+", " ", t).strip(" ·")
                    if t:
                        texts.append(t)
            else:
                t = re.sub(r"<[^>]+>", " ", chunk)
                t = re.sub(r"\s+", " ", t).strip(" ·")
                if t:
                    texts.append(t)
    return texts


def check_credentials_against_proof(
    html: str,
    proof: dict[str, Any] | None = None,
) -> list[str]:
    """Fail if a visible credential-like claim is not backed by public VERIFIED proof."""
    errors: list[str] = []
    allowed = public_verified_claim_texts(proof)
    # Positioning / non-credential lines that appear next to proof chips.
    skip = (
        "sem promessa de vitória",
        "sem promessa de vitoria",
        "atendimento nacional",  # allowed via proof-nacional
    )
    for raw in extract_credential_claim_texts(html):
        n = _norm(raw)
        if not n or any(s in n for s in skip):
            continue
        if any(re.search(p, n) for p in INVENTED_CREDENTIAL_PATTERNS):
            errors.append(f"credential_not_backed:{raw}")
            continue
        if not _claim_supported(raw, allowed):
            errors.append(f"credential_not_backed:{raw}")
    blob = _norm(_strip_tags(_without_scripts(html or "")))
    for pat in INVENTED_CREDENTIAL_PATTERNS:
        for m in re.finditer(pat, blob):
            window = blob[max(0, m.start() - 48) : m.start()]
            if re.search(r"\b(n[aã]o|sem|nunca|jamais|evitar|proibid)\b", window):
                continue
            matched = blob[m.start() : min(len(blob), m.end() + 48)]
            if _claim_supported(matched, allowed):
                continue
            errors.append(f"credential_pattern_forbidden:{pat}")
            break
    return sorted(set(errors))


def check_schema_mirrors_visible(html: str) -> list[str]:
    """JSON-LD author/org/dates/reviews must not contradict visible content."""
    errors: list[str] = []
    blocks = extract_jsonld_blocks(html)
    nodes = flatten_jsonld_nodes(blocks)
    by_id: dict[str, dict[str, Any]] = {}
    for n in nodes:
        i = n.get("@id")
        if i:
            by_id[str(i)] = n
    vis = extract_visible_authority(html)
    visible_blob = vis["norm"]
    raw_html = html or ""

    for node in nodes:
        types = _types_of(node)
        if types & FORBIDDEN_SCHEMA_TYPES:
            if not _visible_review_or_rating(raw_html, vis):
                errors.append(f"schema_invented_type:{sorted(types & FORBIDDEN_SCHEMA_TYPES)}")
        if node.get("aggregateRating") or node.get("review"):
            if not _visible_review_or_rating(raw_html, vis):
                errors.append("schema_invented_review_or_rating")
        if node.get("ratingValue") and not _visible_review_or_rating(raw_html, vis):
            errors.append("schema_invented_rating_value")

        author = node.get("author")
        if author:
            name = _node_name(author, by_id)
            if name and not _name_visible(name, vis, raw_html):
                errors.append(f"schema_author_not_visible:{name}")

        if "Organization" in types:
            name = str(node.get("name") or "")
            if name and _norm(name) not in visible_blob and _norm(name) not in _norm(raw_html):
                # Organization block on every page is allowed if the brand name appears
                if "confenge" not in visible_blob:
                    errors.append(f"schema_org_not_visible:{name}")

        for key in ("datePublished", "dateModified", "dateCreated"):
            val = node.get(key)
            if not val:
                continue
            iso = str(val)[:10]
            if iso in vis["dates"] or iso in vis["text"]:
                continue
            errors.append(f"schema_date_not_visible:{key}={val}")

        reviewer = node.get("reviewedBy")
        if reviewer:
            rname = _node_name(reviewer, by_id)
            if rname and not _name_visible(rname, vis, raw_html):
                errors.append(f"schema_invented_reviewer:{rname}")

        if "Award" in types and not _visible_award(vis):
            errors.append("schema_invented_award")

        if "Person" in types or "Organization" in types:
            for key in FORBIDDEN_INVENTED_ASSOCIATION_KEYS:
                if node.get(key) and not _visible_association(vis, key, node.get(key)):
                    errors.append(f"schema_invented_association:{key}")

        if "Dataset" in types:
            errors.extend(check_dataset_mirrors_visible(node, vis, raw_html))

        if "BreadcrumbList" in types:
            errors.extend(check_breadcrumb_mirrors_visible(node, raw_html))

        # FAQ parity is opt-in while legacy generated articles are dispositioned.
        # Money surfaces covered by #235 carry this marker and therefore fail
        # closed if schema claims are not also rendered to visitors.
        if "FAQPage" in types and 'data-visible-schema-parity="true"' in raw_html:
            entities = node.get("mainEntity") or []
            if isinstance(entities, dict):
                entities = [entities]
            for entity in entities:
                if not isinstance(entity, dict):
                    continue
                question = str(entity.get("name") or "").strip()
                answer_node = entity.get("acceptedAnswer") or {}
                answer = str(answer_node.get("text") or "").strip() if isinstance(answer_node, dict) else ""
                if question and _norm(question) not in visible_blob:
                    errors.append(f"schema_faq_question_not_visible:{question}")
                if answer and _norm(answer) not in visible_blob:
                    errors.append(f"schema_faq_answer_not_visible:{answer}")

    return errors


def extract_visible_crumbs(html: str) -> list[str]:
    crumbs: list[str] = []
    nav = re.search(
        r'<nav[^>]*class="[^"]*breadcrumbs[^"]*"[^>]*>(.*?)</nav>',
        html or "",
        flags=re.I | re.S,
    )
    chunk = nav.group(1) if nav else ""
    for item in re.findall(r"<li[^>]*>(.*?)</li>", chunk, flags=re.I | re.S):
        text = unescape(re.sub(r"<[^>]+>", " ", item))
        text = re.sub(r"\s+", " ", text).strip(" /")
        if text:
            crumbs.append(text)
    return crumbs


def check_breadcrumb_mirrors_visible(node: dict[str, Any], html: str) -> list[str]:
    """BreadcrumbList names must be a subset of visible crumb labels."""
    visible = {_norm(c) for c in extract_visible_crumbs(html)}
    errors: list[str] = []
    elements = node.get("itemListElement") or []
    if isinstance(elements, dict):
        elements = [elements]
    for el in elements:
        if not isinstance(el, dict):
            continue
        name = str(el.get("name") or "").strip()
        if name and _norm(name) not in visible:
            errors.append(f"schema_breadcrumb_not_visible:{name}")
    return errors


def check_dataset_mirrors_visible(
    node: dict[str, Any],
    vis: dict[str, Any],
    html: str,
) -> list[str]:
    """Dataset JSON-LD is allowed only when the page visibly identifies a dataset."""
    errors: list[str] = []
    blob = vis["norm"]
    identity_ok = bool(
        re.search(r"(dataset|recorte|radar|pesquisa|as[_ -]?of|metodologia reproduz)", blob)
    )
    name = str(node.get("name") or "").strip()
    if name and not _name_visible(name, vis, html):
        tokens = [t for t in re.split(r"[^a-z0-9áéíóúâêôãõç]+", _norm(name)) if len(t) > 3]
        overlap = sum(1 for t in tokens if t in blob)
        if overlap < min(2, len(tokens) or 2):
            errors.append(f"schema_dataset_not_visible:{name}")
            identity_ok = False
    if not identity_ok:
        errors.append("schema_dataset_without_visible_identity")
    return errors


def _visible_award(vis: dict[str, Any]) -> bool:
    return bool(re.search(r"\b(pr[eê]mio|award|selo concedido)\b", vis["norm"]))


def _visible_association(vis: dict[str, Any], key: str, value: Any) -> bool:
    del key
    blob = vis["norm"]
    name = ""
    if isinstance(value, dict):
        name = str(value.get("name") or "")
    elif isinstance(value, str):
        name = value
    elif isinstance(value, list) and value:
        return any(_visible_association(vis, "memberOf", item) for item in value)
    if name and _norm(name) in blob:
        return True
    return bool(re.search(r"(membro de|filia[cç][aã]o|associa[cç][aã]o)", blob))


def _name_visible(name: str, vis: dict[str, Any], html: str) -> bool:
    n = _norm(name)
    if n in vis["norm"]:
        return True
    if any(_norm(a) == n or n in _norm(a) or _norm(a) in n for a in vis["authors"]):
        return True
    if "tiago" in n and "tiago" in vis["norm"]:
        return True
    if "confenge" in n and "confenge" in vis["norm"]:
        return True
    return False


def _visible_review_or_rating(html: str, vis: dict[str, Any]) -> bool:
    blob = vis["norm"]
    if re.search(r"\b\d\s*/\s*5\b|\b\d,\d\s*estrelas\b|\baggregate\b", blob):
        return True
    return bool(re.search(r"(avalia[cç][aã]o de clientes|nota m[eé]dia)", blob))


def check_published_cases_permission(cases: dict[str, Any] | None = None) -> list[str]:
    data = cases or load_cases()
    errors: list[str] = []
    for c in data.get("cases") or []:
        if c.get("public_status") == "APPROVED":
            if not c.get("client_authorized"):
                errors.append(f"approved_case_without_consent:{c.get('case_id')}")
            if c.get("permission_class") not in PERMISSION_CLASSES:
                errors.append(f"approved_case_missing_permission_class:{c.get('case_id')}")
    for surf in data.get("published_surfaces") or []:
        klass = surf.get("permission_class")
        if klass not in PERMISSION_CLASSES:
            errors.append(f"published_surface_missing_permission_class:{surf.get('path')}")
        if surf.get("public_status") == "APPROVED" and not surf.get("client_authorized"):
            errors.append(f"approved_surface_without_consent:{surf.get('path')}")
    return errors


def check_signals_baseline(data: dict[str, Any] | None = None) -> list[str]:
    data = data or load_signals_baseline()
    required = (
        "branded_search",
        "direct_returning",
        "qualified_referring_domains",
        "citation_reuse",
    )
    errors: list[str] = []
    signals = data.get("signals") or {}
    for key in required:
        rec = signals.get(key)
        if not isinstance(rec, dict):
            errors.append(f"signal_missing:{key}")
            continue
        value = rec.get("value")
        source = rec.get("source")
        if value == "UNKNOWN":
            if source not in (None, "", "UNKNOWN"):
                errors.append(f"signal_unknown_with_source:{key}")
            continue
        if value in (None, ""):
            errors.append(f"signal_empty:{key}")
            continue
        if not source:
            errors.append(f"signal_value_without_source:{key}")
    return errors


def normalize_public_path(path: str) -> str:
    raw = (path or "").strip()
    if raw.startswith("http"):
        raw = urlparse(raw).path
    if not raw.startswith("/"):
        raw = "/" + raw
    if raw.endswith("index.html"):
        raw = raw[: -len("index.html")]
    if raw != "/" and not raw.endswith("/"):
        raw += "/"
    return raw


def is_chrome_exempt(path: str) -> bool:
    raw = normalize_public_path(path)
    if raw == "/":
        return True
    return any(raw.startswith(prefix) for prefix in CHROME_EXEMPT_PREFIXES)


def public_html_paths() -> list[tuple[str, Path]]:
    """Shipped public HTML under known family roots (not _site, not piloto/ops)."""
    found: list[tuple[str, Path]] = []
    for root_name in PUBLIC_FAMILY_ROOTS:
        base = ROOT / root_name
        if not base.exists():
            continue
        for path in sorted(base.rglob("index.html")):
            rel = "/" + str(path.relative_to(ROOT)).replace("\\", "/")
            found.append((normalize_public_path(rel), path))
    return found


def audit_public_families(
    *,
    matrix: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Classify every public family page or fail closed.

    Unclassified is never a pass. Wave1 material-hash pages that miss a slot
    stay listed as fail, not silently rewritten.
    """
    m = matrix or load_matrix()
    families: dict[str, Any] = {}
    for name, spec in (m.get("surfaces") or {}).items():
        families[name] = {
            "label": spec.get("label"),
            "required_slots": {k: spec.get(k) for k in REQUIRED_SLOT_KEYS},
            "status": "unseen",
            "pages": [],
            "errors": [],
        }
    unclassified: list[dict[str, Any]] = []
    for url, path in public_html_paths():
        html = path.read_text(encoding="utf-8")
        kind = classify_surface(url, html)
        if kind is None:
            unclassified.append(
                {
                    "path": url,
                    "status": "fail_closed",
                    "code": "unclassified_public_family",
                    "errors": ["unclassified_public_family"],
                }
            )
            continue
        rec = families.setdefault(
            kind,
            {
                "label": kind,
                "required_slots": {},
                "status": "unseen",
                "pages": [],
                "errors": [],
            },
        )
        page_errors = check_required_slots(html, kind, matrix=m) + check_schema_mirrors_visible(html)
        rec["pages"].append(
            {
                "path": url,
                "status": "fail" if page_errors else "pass",
                "errors": page_errors,
            }
        )
        rec["errors"].extend(page_errors)
    for rec in families.values():
        if not rec["pages"]:
            rec["status"] = "fail_closed"
            rec["errors"] = ["family_has_no_public_page"]
        elif any(p["status"] == "fail" for p in rec["pages"]):
            rec["status"] = "fail"
        else:
            rec["status"] = "pass"
        rec["errors"] = sorted(set(rec["errors"]))
    return {
        "families": families,
        "unclassified_public": unclassified,
        "matrix_errors": check_matrix_slot_coverage(m),
    }


def representative_pages() -> dict[str, Path]:
    """One real shipped page per matrix surface type."""
    return {
        "servico": ROOT / "diretoria-b2g" / "index.html",
        "conteudo_tecnico": ROOT / "conteudos" / "limite-aditivo-25-50-obra-publica" / "index.html",
        "ferramenta": ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
        "pesquisa_dataset": ROOT / "radar" / "nacional-obras-publicas" / "index.html",
        "caso_proof": ROOT / "casos" / "aditivo-art125-demonstrativo" / "index.html",
        "analise_tecnica_contrato": ROOT
        / "analises-contratos-publicos"
        / "bdi-composicao-vs-referencia-sc"
        / "index.html",
    }


def chrome_pages() -> list[Path]:
    return [
        ROOT / "index.html",
        ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
        ROOT / "metodologia-inteligencia" / "index.html",
        ROOT / "politica-editorial" / "index.html",
        ROOT / "correcoes" / "index.html",
        ROOT / "uso-de-ia" / "index.html",
        ROOT / "conflitos" / "index.html",
        ROOT / "casos" / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
    ]


def policy_pages() -> dict[str, Path]:
    return {
        "editorial": ROOT / "politica-editorial" / "index.html",
        "corrections": ROOT / "correcoes" / "index.html",
        "ai_use": ROOT / "uso-de-ia" / "index.html",
        "conflicts": ROOT / "conflitos" / "index.html",
    }


def archived_policy_pages() -> dict[str, Path]:
    return {
        "historico": ROOT / "politica-editorial" / "historico" / "index.html",
        "v1.0.0": ROOT / "politica-editorial" / "v" / "1.0.0" / "index.html",
    }


def data_analysis_policy_pages() -> dict[str, Path]:
    """Surfaces that can take a policy/version link without a material-hash regen."""
    return {
        "inteligencia_hub": ROOT / "inteligencia" / "index.html",
        "metodologia": ROOT / "metodologia-inteligencia" / "index.html",
        "ferramenta_limite": ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
        "radar_nacional": ROOT / "radar" / "nacional-obras-publicas" / "index.html",
    }


def current_policy_version(policy: dict[str, Any] | None = None) -> str:
    rec = policy if policy is not None else load_editorial_policy()
    return str(rec.get("current_version") or "")


def policy_version_disclosure(policy: dict[str, Any] | None = None) -> str:
    version = current_policy_version(policy)
    return (
        f'<p class="policy-version-disclosure" data-policy-version="{version}">'
        f'Texto e dados desta página seguem a '
        f'<a href="/politica-editorial/">política editorial {version}</a>. '
        f'<a href="/correcoes/">Contestar ou pedir correção</a>.'
        "</p>"
    )


def _canonical_version_payload(version_rec: dict[str, Any]) -> str:
    pages = version_rec.get("pages") or {}
    payload = {key: str((pages.get(key) or {}).get("body") or "") for key in sorted(pages)}
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def content_sha256_for_version(version_rec: dict[str, Any]) -> str:
    import hashlib

    return hashlib.sha256(_canonical_version_payload(version_rec).encode("utf-8")).hexdigest()


def entry_sha256_for(entry: dict[str, Any]) -> str:
    import hashlib

    material = "\n".join(
        [
            str(entry.get("version") or ""),
            str(entry.get("effective_at") or ""),
            str(entry.get("summary") or ""),
            str(entry.get("content_sha256") or ""),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def seal_editorial_policy(policy: dict[str, Any] | None = None) -> dict[str, Any]:
    rec = json.loads(json.dumps(policy if policy is not None else load_editorial_policy()))
    versions = rec.get("versions") or {}
    for entry in rec.get("changelog") or []:
        ver = entry.get("version")
        body = versions.get(ver) or {}
        entry["content_sha256"] = content_sha256_for_version(body)
        entry["entry_sha256"] = entry_sha256_for(entry)
    return rec


def write_sealed_editorial_policy(path: Path | None = None) -> dict[str, Any]:
    dest = path or (SITE_DATA / "editorial-policy.json")
    sealed = seal_editorial_policy(json.loads(dest.read_text(encoding="utf-8")))
    dest.write_text(json.dumps(sealed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sealed


def check_policy_version_consistency(
    policy: dict[str, Any] | None = None,
    pages: dict[str, Path] | None = None,
) -> list[str]:
    """Fail closed on version/changelog drift and silent history rewrite."""
    rec = policy if policy is not None else load_editorial_policy()
    errors: list[str] = []
    current = str(rec.get("current_version") or "")
    changelog = rec.get("changelog") or []
    versions = rec.get("versions") or {}
    if not current:
        errors.append("current_version_absent")
    changelog_versions = [str(e.get("version") or "") for e in changelog]
    if current and current not in changelog_versions:
        errors.append("current_version_missing_from_changelog")
    if changelog_versions and changelog_versions[-1] != current:
        errors.append("current_version_not_last_changelog_entry")
    if len(changelog_versions) != len(set(changelog_versions)):
        errors.append("changelog_duplicate_version")
    if rec.get("prazo") != "UNKNOWN":
        errors.append("prazo_not_unknown")

    for entry in changelog:
        ver = str(entry.get("version") or "")
        body = versions.get(ver)
        if not isinstance(body, dict):
            errors.append(f"version_body_missing:{ver}")
            continue
        expected_content = content_sha256_for_version(body)
        if entry.get("content_sha256") != expected_content:
            errors.append(f"changelog_hash_mismatch:{ver}")
        if entry.get("entry_sha256") != entry_sha256_for(entry):
            errors.append(f"changelog_entry_rewritten:{ver}")
        if ver != current:
            archive = ROOT / "politica-editorial" / "v" / ver / "index.html"
            if not archive.exists():
                errors.append(f"archived_version_unreadable:{ver}")
            else:
                html = archive.read_text(encoding="utf-8")
                if ver not in html:
                    errors.append(f"archived_version_not_visible:{ver}")
                summary = str(entry.get("summary") or "")
                if summary and summary not in html:
                    errors.append(f"changelog_entry_rewritten:{ver}")

    gov = load_governance()
    gov_version = ((gov.get("policy") or {}).get("current_version")) or ""
    if gov_version and gov_version != current:
        errors.append("governance_version_mismatch")
    corr = gov.get("correction") or {}
    for key in ("acknowledge_sla", "publish_sla", "prazo"):
        if corr.get(key) != "UNKNOWN":
            errors.append(f"invented_sla:{key}")

    for name, path in (pages or policy_pages()).items():
        if not path.exists():
            errors.append(f"policy_page_missing:{name}")
            continue
        html = path.read_text(encoding="utf-8")
        if current and current not in html:
            errors.append(f"visible_version_mismatch:{name}")
        if current and f'data-policy-version="{current}"' not in html:
            errors.append(f"visible_version_attr_missing:{name}")
    return errors


def check_policy_visible_disclosure(
    html: str,
    policy: dict[str, Any] | None = None,
) -> list[str]:
    rec = policy if policy is not None else load_editorial_policy()
    blob = _norm(_strip_tags(html or ""))
    errors: list[str] = []
    for token in rec.get("required_visible_tokens") or []:
        if _norm(token) not in blob:
            errors.append(f"disclosure_missing:{token}")
    for token in rec.get("forbidden_current_tokens") or []:
        if _norm(token) in blob:
            errors.append(f"forbidden_promise:{token}")
    if rec.get("prazo") == "UNKNOWN" and "unknown" not in blob:
        errors.append("disclosure_missing:UNKNOWN")
    return errors


def check_policy_links(html: str, policy: dict[str, Any] | None = None) -> list[str]:
    rec = policy if policy is not None else load_editorial_policy()
    raw = html or ""
    errors: list[str] = []
    version = current_policy_version(rec)
    if "/politica-editorial/" not in raw:
        errors.append("policy_link_absent")
    if "/correcoes/" not in raw:
        errors.append("correction_link_absent")
    if version and version not in raw:
        errors.append("policy_version_absent")
    if version and f'data-policy-version="{version}"' not in raw:
        errors.append("policy_version_attr_absent")
    return errors


def combined_policy_html(pages: dict[str, Path] | None = None) -> str:
    chunks: list[str] = []
    for path in (pages or policy_pages()).values():
        if path.exists():
            chunks.append(path.read_text(encoding="utf-8"))
    return "\n".join(chunks)
