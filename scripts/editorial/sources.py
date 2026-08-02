"""Structured official source bank for editorial pages."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCES_PATH = ROOT / "data" / "editorial" / "SOURCE-MANIFEST.json"

ALLOWED_HOSTS = {
    "www.planalto.gov.br",
    "planalto.gov.br",
    "portal.tcu.gov.br",
    "pesquisa.apps.tcu.gov.br",
    "licitacoesecontratos.tcu.gov.br",
    "www.gov.br",
    "gov.br",
    "www.stf.jus.br",
    "stf.jus.br",
    "www.stj.jus.br",
    "stj.jus.br",
    "www.caixa.gov.br",
    "www.dnit.gov.br",
    "www.gov.br",
}

SOURCE_TYPES = {
    "statute",
    "regulation",
    "tcu_decision",
    "tcu_guidance",
    "stj_decision",
    "stf_decision",
    "agu_opinion",
    "official_cost_reference",
    "pncp_data",
    "technical_guidance",
}


def load_manifest(path: Path | None = None) -> dict[str, Any]:
    p = path or SOURCES_PATH
    if not p.exists():
        return {"schema_version": "1.0.0", "sources": []}
    return json.loads(p.read_text(encoding="utf-8"))


def save_manifest(data: dict[str, Any], path: Path | None = None) -> None:
    p = path or SOURCES_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_official_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    if not host:
        return False
    if host in ALLOWED_HOSTS:
        return True
    # allow subdomains of gov.br and jus.br
    return host.endswith(".gov.br") or host.endswith(".jus.br") or host.endswith(".tcu.gov.br")


def validate_source(src: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if not src.get("source_id"):
        issues.append("missing_source_id")
    st = src.get("type")
    if st not in SOURCE_TYPES:
        issues.append(f"invalid_type:{st}")
    url = src.get("url") or ""
    if not url or not is_official_url(url):
        issues.append("non_official_or_missing_url")
    if not src.get("title"):
        issues.append("missing_title")
    if not src.get("accessed_at"):
        issues.append("missing_accessed_at")
    if st in {"tcu_decision", "stj_decision", "stf_decision"}:
        if not src.get("number"):
            issues.append("decision_missing_number")
        if not src.get("body") and not src.get("court"):
            issues.append("decision_missing_court")
    if st == "statute" and not src.get("device"):
        # device optional at bank level; required when page claims a specific article
        pass
    return issues


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def page_sources_ok(
    page_source_ids: list[str],
    manifest: dict[str, Any],
    *,
    require_primary: bool = True,
) -> list[str]:
    """Fail if page lacks resolvable official sources."""
    issues: list[str] = []
    by_id = {s["source_id"]: s for s in manifest.get("sources") or [] if s.get("source_id")}
    if not page_source_ids:
        return ["no_sources"]
    primary_ok = False
    for sid in page_source_ids:
        src = by_id.get(sid)
        if not src:
            issues.append(f"unknown_source:{sid}")
            continue
        issues.extend(f"{sid}:{i}" for i in validate_source(src))
        if src.get("type") in {
            "statute",
            "regulation",
            "tcu_decision",
            "tcu_guidance",
            "stj_decision",
            "stf_decision",
            "agu_opinion",
            "official_cost_reference",
            "pncp_data",
        }:
            primary_ok = True
    if require_primary and not primary_ok:
        issues.append("no_primary_source")
    return issues


def extract_legal_devices(text: str) -> list[str]:
    found = re.findall(r"art\.?\s*(\d+)", text, flags=re.I)
    return sorted({f"art.{n}" for n in found})


# --- Claim–source validation (semantic layer beyond domain checks) ---

CLAIM_REQUIRED_FIELDS = (
    "claim_id",
    "claim",
    "claim_type",
    "source_ids",
    "source_locator",
    "support_level",
    "official_excerpt",
    "interpretation",
    "limitations",
    "verified_at",
    "verified_by",
)

CLAIM_TYPES = {
    "statutory_text",
    "operational_interpretation",
    "administrative_guidance",
    "jurisprudence",
    "hypothesis",
    "controversy",
}

SUPPORT_LEVELS = {"direct", "partial", "interpretive", "none"}

# Forbidden false associations: (article markers, banned phrase fragments)
FORBIDDEN_CLAIM_ASSOCIATIONS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (
        ("art. 124", "art.124", "art 124", "artigo 124"),
        (
            "vínculo societário",
            "vinculo societario",
            "atualização de vínculo societário",
            "atualizacao de vinculo societario",
        ),
    ),
)

EXCERPTS_PATH = ROOT / "data" / "editorial" / "sources" / "official-excerpts-lei-14133.json"


def load_official_excerpts(path: Path | None = None) -> dict[str, str]:
    p = path or EXCERPTS_PATH
    if not p.exists():
        return {}
    data = json.loads(p.read_text(encoding="utf-8"))
    return dict(data.get("excerpts") or {})


def _norm_pt(text: str) -> str:
    t = (text or "").lower()
    t = re.sub(r"\s+", " ", t)
    return t


def _significant_tokens(text: str, *, min_len: int = 5) -> list[str]:
    """Tokens useful for excerpt-support checks (Portuguese legal prose)."""
    stop = {
        "para",
        "pelo",
        "pela",
        "pelos",
        "pelas",
        "como",
        "quando",
        "sobre",
        "entre",
        "desta",
        "deste",
        "nessa",
        "neste",
        "ainda",
        "também",
        "tambem",
        "sendo",
        "desde",
        "após",
        "apos",
        "antes",
        "onde",
        "quais",
        "qual",
        "cada",
        "mais",
        "menos",
        "seus",
        "suas",
        "seu",
        "sua",
        "uma",
        "uns",
        "umas",
        "dos",
        "das",
        "com",
        "sem",
        "por",
        "que",
        "não",
        "nao",
        "nos",
        "nas",
        "aos",
        "às",
        "as",
        "os",
        "um",
        "de",
        "da",
        "do",
        "em",
        "ou",
        "e",
        "a",
        "o",
    }
    tokens = re.findall(r"[a-záàâãéêíóôõúç0-9\.]{3,}", _norm_pt(text), flags=re.I)
    out = []
    for tok in tokens:
        if len(tok) < min_len and not re.match(r"art\.?\d+", tok):
            continue
        if tok in stop:
            continue
        out.append(tok)
    return out


def claim_contradicts_excerpt(claim: str, official_excerpt: str) -> list[str]:
    """Detect polar contradictions between a claim and its cited official excerpt.

    Token overlap alone is insufficient: a claim can share words with art. 125 and still
    assert "acréscimo ilimitado", or share "repactuação" with art. 135 while saying it
    applies to any obra. These contradictions must fail the gate.
    """
    reasons: list[str] = []
    c = _norm_pt(claim)
    e = _norm_pt(official_excerpt or "")
    if not c or not e:
        return reasons

    # Unlimited / no-cap vs statutory percentage ceilings
    if re.search(
        r"\bilimitad|\bsem\s+teto|\bsem\s+limite\b|\bsem\s+percentual|"
        r"\bqualquer\s+percentual|\bindefinid[oa]\s+(acr[eé]scimo|limite)|"
        r"\bacr[eé]scimo\s+(livre|irrestrito|sem\s+teto)",
        c,
    ):
        if re.search(
            r"\d+\s*%|vinte e cinco|cinquenta|at[eé]\s+25|at[eé]\s+50|25\s*%|50\s*%|"
            r"limites permitidos",
            e,
        ):
            reasons.append("unlimited_vs_statutory_cap")

    # Repactuação broadened beyond continuous / exclusive-labor services
    # Only flag AFFIRMATIVE broadening. Skip when the claim denies the broad scope
    # (e.g. "não se aplica a qualquer contrato de obra" / "não é o mecanismo ordinário").
    if re.search(r"repactua", c) or re.search(r"repactua", e):
        broad_affirmative = bool(
            re.search(
                r"(?:aplica-se|vale|serve|serve\s+para|gera|produz)\s+"
                r"(?:a\s+|para\s+)?(?:qualquer|tod[oa]s?|indistintamente)|"
                r"(?:qualquer|tod[oa]s?)\s+(?:contrato\s+de\s+)?obra|"
                r"qualquer\s+obra\s+p[uú]blica|"
                r"em\s+qualquer\s+contrato|"
                r"indistintamente\s+a\s+qualquer|"
                r"automaticamente\s+(?:gera|produz|aplica)|"
                r"repactua[cç][aã]o\s+(?:do\s+art\.?\s*135\s+)?(?:aplica-se|vale)\s+a\s+qualquer",
                c,
            )
        )
        # Explicit denials of the broad reading must not trip the rule
        denies_broad = bool(
            re.search(
                r"\b(n[aã]o|nao)\s+(se\s+aplica|aplica|vale|serve|é|e)\b|"
                r"n[aã]o\s+é\s+o\s+mecanismo|"
                r"n[aã]o\s+é\s+mecanismo|"
                r"n[aã]o\s+o\s+mecanismo\s+ordin[aá]rio|"
                r"n[aã]o\s+se\s+aplica\s+a\s+qualquer|"
                r"n[aã]o\s+vale\s+para\s+qualquer|"
                r"exceto\s+(?:para|em)\s+servi[cç]os?\s+cont[ií]nuos|"
                r"apenas\s+(?:para|em)\s+servi[cç]os?\s+cont[ií]nuos|"
                r"somente\s+(?:para|em)\s+servi[cç]os?\s+cont[ií]nuos|"
                r"restrit[oa]\s+a\s+servi[cç]os?\s+cont[ií]nuos",
                c,
            )
        )
        if (
            broad_affirmative
            and not denies_broad
            and re.search(
                r"servi[cç]os?\s+cont[ií]nuos|dedica[cç][aã]o\s+exclusiva|predomin[aâ]ncia",
                e,
            )
        ):
            reasons.append("repactuacao_broadened_beyond_excerpt")

    # Denies aditivo formalization when excerpt makes it a condition of execution
    if re.search(
        r"(n[aã]o\s+(exige|requer|precisa)|dispensa|sem\s+necessidade).{0,40}"
        r"(aditivo|formaliza)|execut[ae].{0,30}sem\s+(termo\s+)?aditivo\s+(livre|sempre|sem\s+risco)",
        c,
    ):
        if re.search(
            r"formaliza[cç][aã]o do termo aditivo [eé] condi[cç][aã]o|"
            r"condi[cç][aã]o para a execu[cç][aã]o",
            e,
        ):
            reasons.append("denies_formalization_required")

    # 50% as general rule for any building vs reforma-only ceiling
    # Skip when the claim itself denies the broadening ("não é regra geral de qualquer…")
    if re.search(r"50\s*%|cinquenta\s+por\s+cento", c) and re.search(
        r"(qualquer|toda|todo).{0,30}(edifica[cç]|pr[eé]dio|obra\s+nova|constru[cç][aã]o\s+nova)",
        c,
    ):
        if not re.search(
            r"\b(n[aã]o|nao)\s+(é|e|se\s+aplica|vale)|n[aã]o\s+é\s+regra|"
            r"n[aã]o\s+como\s+regra|restringe|apenas\s+(em|na|para)\s+reforma",
            c,
        ):
            if re.search(r"reforma de edif[ií]cio|reforma de equipamento", e):
                reasons.append("50pct_broadened_beyond_reforma")

    # Allows unmotivated delay when excerpt prohibits it
    if re.search(
        r"(pode|livremente|autorizad[oa]).{0,40}retardar|"
        r"retardar imotivadamente.{0,20}(permitid|autorizad|l[ií]cito)",
        c,
    ):
        if re.search(r"proibid.{0,30}retardar imotivadamente", e):
            reasons.append("allows_prohibited_delay")

    # Denies release of parcela incontroversa when excerpt requires liberação
    if re.search(
        r"(n[aã]o\s+(precisa|deve|h[aá]\s+dever)\s+liber|pode\s+reter|reter\s+a\s+parcela|"
        r"glosar\s+(100|integral|tudo)|travar\s+(100|toda)\s*%?).{0,40}incontrovers|"
        r"incontrovers.{0,40}(n[aã]o\s+(precisa|deve)\s+liber|pode\s+ser\s+retid)",
        c,
    ):
        if re.search(r"parcela incontroversa dever[aá] ser liberada", e):
            reasons.append("denies_incontroversa_release")

    # Claims art.124 II includes vínculo societário while excerpt lists a–d without it
    if re.search(r"v[ií]nculo\s+societ|atualiza[cç][aã]o\s+de\s+v[ií]nculo", c):
        if re.search(r"substitui[cç][aã]o da garantia|por acordo entre as partes", e):
            if not re.search(r"\b(n[aã]o|nao)\b", c):
                reasons.append("art124_false_societario_in_claim")

    return reasons


def claim_supported_by_excerpt(
    claim: str,
    official_excerpt: str,
    *,
    min_hits: int = 2,
    min_ratio: float = 0.22,
) -> bool:
    """Return True only if excerpt is non-empty, thematically aligned, and not contradictory.

    Fail-closed: domain presence alone is never enough. Polar contradictions (e.g. unlimited
    acréscimo vs art. 125 caps; repactuação for any obra vs art. 135 continuous-labor scope)
    always return False even when token overlap is high.
    """
    excerpt = (official_excerpt or "").strip()
    if len(excerpt) < 40:
        return False
    if claim_contradicts_excerpt(claim, excerpt):
        return False
    claim_tokens = _significant_tokens(claim)
    if not claim_tokens:
        return False
    # Drop ultra-generic legal tokens that create false support
    weak = {
        "contrato",
        "contratos",
        "lei",
        "administracao",
        "administração",
        "obras",
        "obra",
        "servicos",
        "serviços",
        "quando",
        "mediante",
        "deverá",
        "devera",
        "serão",
        "serao",
    }
    distinctive = [t for t in claim_tokens if t not in weak and not t.isdigit()]
    pool = distinctive if len(distinctive) >= 2 else claim_tokens
    exc_n = _norm_pt(excerpt)
    hits = sum(1 for t in pool if t in exc_n)
    ratio = hits / max(len(pool), 1)
    # Need both absolute hits and a minimum ratio of distinctive claim tokens
    need = max(min_hits, min(4, (len(pool) + 3) // 4))
    return hits >= need and ratio >= min_ratio


def validate_claim(
    claim: dict[str, Any],
    *,
    manifest: dict[str, Any] | None = None,
    page_source_ids: list[str] | None = None,
) -> list[str]:
    """Validate one material claim record against required structure and excerpt support."""
    issues: list[str] = []
    cid = claim.get("claim_id") or "unknown_claim"

    for field in CLAIM_REQUIRED_FIELDS:
        if field not in claim:
            issues.append(f"{cid}:missing_field:{field}")
    # verified_by may be null until named human
    if claim.get("claim_id") is None or not str(claim.get("claim_id") or "").strip():
        issues.append(f"{cid}:empty_claim_id")
    if not (claim.get("claim") or "").strip():
        issues.append(f"{cid}:empty_claim")

    ctype = claim.get("claim_type")
    if ctype and ctype not in CLAIM_TYPES:
        issues.append(f"{cid}:invalid_claim_type:{ctype}")

    support = claim.get("support_level")
    if support and support not in SUPPORT_LEVELS:
        issues.append(f"{cid}:invalid_support_level:{support}")

    source_ids = claim.get("source_ids") or []
    if not isinstance(source_ids, list) or not source_ids:
        issues.append(f"{cid}:no_source_ids")
    else:
        man = manifest if manifest is not None else load_manifest()
        by_id = {s["source_id"]: s for s in man.get("sources") or [] if s.get("source_id")}
        for sid in source_ids:
            if sid not in by_id:
                issues.append(f"{cid}:unknown_source:{sid}")
        if page_source_ids is not None:
            page_set = set(page_source_ids)
            for sid in source_ids:
                if sid not in page_set:
                    issues.append(f"{cid}:source_not_on_page:{sid}")

    locator = (claim.get("source_locator") or "").strip()
    if not locator:
        issues.append(f"{cid}:missing_source_locator")

    excerpt = (claim.get("official_excerpt") or "").strip()
    claim_text = claim.get("claim") or ""

    # Always surface polar contradictions when an excerpt is present
    if excerpt and claim_text:
        for reason in claim_contradicts_excerpt(claim_text, excerpt):
            issues.append(f"{cid}:excerpt_contradicts_claim:{reason}")

    # Statutory / jurisprudence material claims need an excerpt that supports the proposition
    if ctype in {"statutory_text", "jurisprudence"} or support == "direct":
        if not excerpt:
            issues.append(f"{cid}:missing_official_excerpt")
        elif support in {"direct", "partial"} or ctype == "statutory_text":
            if not claim_supported_by_excerpt(claim_text, excerpt):
                issues.append(f"{cid}:excerpt_does_not_support_claim")

    # Forbidden false legal associations inside claim text
    blob = _norm_pt(
        " ".join(
            str(claim.get(k) or "")
            for k in ("claim", "interpretation", "official_excerpt", "source_locator")
        )
    )
    for art_markers, banned in FORBIDDEN_CLAIM_ASSOCIATIONS:
        if any(m in blob for m in art_markers) and any(b in blob for b in banned):
            # Allow claims that explicitly deny the association
            if "não" in blob or "nao" in blob or "não inclui" in blob or "nao inclui" in blob:
                continue
            issues.append(f"{cid}:forbidden_association:art124_vinculo_societario")

    return issues


def page_claims_ok(
    page: dict[str, Any],
    *,
    manifest: dict[str, Any] | None = None,
    require_claims: bool = True,
) -> list[str]:
    """Validate claim bank on a page. Fail-closed for lei_14133 archetype."""
    issues: list[str] = []
    claims = page.get("claims")
    archetype = page.get("archetype") or ""
    if not claims:
        if require_claims and archetype in {"lei_14133", "jurisprudencia"}:
            issues.append("missing_claims")
        return issues
    if not isinstance(claims, list):
        return ["claims_not_list"]
    man = manifest if manifest is not None else load_manifest()
    page_sources = list(page.get("sources") or [])
    seen_ids: set[str] = set()
    for claim in claims:
        if not isinstance(claim, dict):
            issues.append("claim_not_object")
            continue
        cid = claim.get("claim_id")
        if cid:
            if cid in seen_ids:
                issues.append(f"duplicate_claim_id:{cid}")
            seen_ids.add(str(cid))
        issues.extend(
            validate_claim(claim, manifest=man, page_source_ids=page_sources)
        )

    # Lei pages: require coverage depth so a single ornamental claim cannot pass audit
    if archetype == "lei_14133" and require_claims:
        if len(claims) < 2:
            issues.append("lei_page_insufficient_claims")
        # Each legal_device art.N should appear in some claim locator or claim text
        devices = page.get("legal_devices") or []
        claim_blob = _norm_pt(
            " ".join(
                str(c.get("source_locator") or "") + " " + str(c.get("claim") or "")
                for c in claims
                if isinstance(c, dict)
            )
        )
        for dev in devices:
            m = re.search(r"(\d+)", str(dev))
            if not m:
                continue
            num = m.group(1)
            # Allow art. 6 / art.6 / art. 6º / art. 6° (ordinal markers break \b after digit)
            if not re.search(rf"art\.?\s*{num}(?:\b|[º°o]\b|[º°])?", claim_blob):
                issues.append(f"legal_device_uncovered_by_claims:art.{num}")
    return issues


def page_text_forbidden_legal_errors(page: dict[str, Any]) -> list[str]:
    """Repo-wide legal regressions on public page text (JSON fields)."""
    issues: list[str] = []
    fields = (
        "title",
        "meta_description",
        "lead",
        "direct_answer",
        "body_markdown",
        "cta_whatsapp",
        "cta_email_body",
        "cta_email_subject",
    )
    blob_parts = [str(page.get(f) or "") for f in fields]
    for faq in page.get("faq") or []:
        if isinstance(faq, dict):
            blob_parts.append(str(faq.get("q") or ""))
            blob_parts.append(str(faq.get("a") or ""))
    for claim in page.get("claims") or []:
        if isinstance(claim, dict):
            blob_parts.append(str(claim.get("claim") or ""))
            blob_parts.append(str(claim.get("interpretation") or ""))
            blob_parts.append(str(claim.get("limitations") or ""))
            blob_parts.append(str(claim.get("official_excerpt") or ""))
    blob = _norm_pt(" ".join(blob_parts))

    page_id = page.get("page_id") or ""
    url = page.get("url") or ""
    is_art124 = "art124" in page_id or "art-124" in url or "art.124" in ",".join(
        page.get("legal_devices") or []
    )

    # Art. 124 must never assert vínculo societário as inciso II hypothesis
    if is_art124 or "art. 124" in blob or "art.124" in blob:
        banned = (
            "atualização de vínculo societário",
            "atualizacao de vinculo societario",
            "atualização de vinculo societário",
            "vínculo societário do contratado",
            "vinculo societario do contratado",
        )
        denial_markers = (
            "não inclui",
            "nao inclui",
            "não lista",
            "nao lista",
            "não integra",
            "nao integra",
            "não é hipótese",
            "nao e hipotese",
            "não. o art. 124",
            "nao. o art. 124",
            "não confunda",
            "nao confunda",
            "hipótese do art. 124",  # often in "não ... hipótese do art. 124"
            "errado",
        )
        for b in banned:
            if b not in blob:
                continue
            affirmative = False
            for m in re.finditer(re.escape(b), blob):
                start = max(0, m.start() - 120)
                end = min(len(blob), m.end() + 120)
                window = blob[start:end]
                if any(d in window for d in denial_markers) or re.search(
                    r"\b(não|nao)\b", window
                ):
                    continue
                affirmative = True
                break
            if affirmative:
                issues.append(f"art124_false_vinculo_societario:{b}")

    # Pages discussing repactuação must cite art. 135 when they treat the institute
    if re.search(r"\brepactua", blob):
        if not re.search(r"art\.?\s*135\b", blob):
            issues.append("repactuacao_without_art135")

    return issues
