"""Entity-authority contract: matrix, visible slots, schema mirror, proof and cases.

Pure checkers used by tests and optional page audits. Fail-closed: missing
required slots and invented schema/credentials/cases are errors.
"""

from __future__ import annotations

import json
import re
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
)

PERMISSION_CLASSES = ("demonstrativo", "consented", "confidential", "redacted")

FORBIDDEN_SCHEMA_TYPES = frozenset({"Review", "AggregateRating"})

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
    """Return one of the five matrix types, or None for identity/policy/other."""
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
    return re.sub(r"\s+", " ", text)


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
            r"(lei\s*n[ºo°]?\s*14\.?133|art\.\s*\d+|s[uú]mula|jurisprud[eê]ncia)",
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

    out: list[str] = []
    for c in public_proof_claims(proof):
        if c.get("claim"):
            out.append(str(c["claim"]))
        for phrase in c.get("allowed_public_phrases") or []:
            out.append(str(phrase))
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
        r'<ul class="(?:hero-proof|profile-list)"[^>]*>(.*?)</ul>',
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

    return errors


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


def representative_pages() -> dict[str, Path]:
    """One real shipped page per matrix surface type."""
    return {
        "servico": ROOT / "diretoria-b2g" / "index.html",
        "conteudo_tecnico": ROOT / "conteudos" / "limite-aditivo-25-50-obra-publica" / "index.html",
        "ferramenta": ROOT / "ferramentas" / "limite-acrescimos-supressoes" / "index.html",
        "pesquisa_dataset": ROOT / "radar" / "nacional-obras-publicas" / "index.html",
        "caso_proof": ROOT / "casos" / "aditivo-art125-demonstrativo" / "index.html",
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
