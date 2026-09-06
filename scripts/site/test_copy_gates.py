"""Public copy leak gates, on the real set of shipped visitor HTML."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.brand import load_brand  # noqa: E402
from scripts.site.public_copy_scope import (  # noqa: E402
    EXTRA_TEXT_SURFACES,
    MANIFEST_ROUTE_EXEMPT,
    is_excepted,
    load_exceptions,
    manifest_html_routes,
    relpath,
    route_for,
    visible_markup,
    visible_text,
    visitor_facing_html_files,
)
from scripts.site.test_design_gates import test_copy_leaks_absent_on_commercial_pages, test_job_title_valid  # noqa: E402

BRAND_EXCEPTION_RULE = "brand_forbidden_phrase"
BACKSTAGE_EXCEPTION_RULE = "public_backstage"


def _brand_scope() -> list[Path]:
    """Every shipped visitor surface plus the non-HTML public text files."""
    pages = list(visitor_facing_html_files(ROOT))
    for name in EXTRA_TEXT_SURFACES:
        path = ROOT / name
        if path.is_file():
            pages.append(path)
    return pages


def test_brand_forbidden_phrases_still_enforced():
    """All 54 brand.json forbidden phrases, on every shipped visitor surface.

    Issue #298: this used to check three phrases over four fixed files, so 51
    declared phrases were enforced nowhere and any page outside the quartet
    could ship any of them with CI green.
    """
    brand = load_brand()
    phrases = brand["forbidden_phrases"]
    assert "Arquitetura de ofertas" in phrases
    assert "Sem cases fabricados" in phrases
    assert len(phrases) >= 54, f"brand forbidden_phrases shrank to {len(phrases)}"
    needles = [(p, p.lower()) for p in phrases]
    failures: list[str] = []
    scanned = 0
    for path in _brand_scope():
        scanned += 1
        rel = relpath(path, ROOT)
        raw = path.read_text(encoding="utf-8")
        text = visible_markup(raw) if path.suffix == ".html" else raw
        lower = text.lower()
        for phrase, needle in needles:
            if needle in lower and not is_excepted(BRAND_EXCEPTION_RULE, phrase, rel):
                failures.append(f"{rel}: {phrase!r}")
    assert scanned >= 200, f"brand phrase scan too narrow: {scanned}"
    assert not failures, failures


def test_microcopy_preferences():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "responsáveis" in home.lower() or "responsável" in home.lower()
    assert "critério técnico definido" in home.lower()
    assert "entrega e limite combinados" in home.lower()
    bid = (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    assert "revisão crítica independente" in bid.lower()
    assert not re.search(r"\bowners\b", home, re.I)
    assert not re.search(r"\bowners\b", bid, re.I)
    # Defensive / internal language must not appear on public home
    lower = home.lower()
    for phrase in (
        "sem inventar case",
        "sem métrica fictícia",
        "sem metrica ficticia",
        "javascript",
        "arquétipo",
        "arquetipo",
        "pipeline editorial",
        "visual regression",
        "red team",
        "sem cta genérico",
        "cta genérico único",
        "jornada a",
        "jornada b",
        "jornada c",
        "prova próxima ao cta",
        "funil",
    ):
        assert phrase not in lower, f"public leak: {phrase}"
    # Client-facing situation chooser (not briefing metalinguage).
    assert "qual destas situações se parece com a sua" in lower
    assert "projetar, revisar, orçar ou compatibilizar" in lower
    assert "inspecionar, diagnosticar ou documentar obra e imóvel" in lower
    assert "perícia, assistência técnica ou avaliação" in lower
    assert "segurança do trabalho" in lower
    assert "licitação ou contrato de obra pública" in lower
    # B2G retains descriptive, canonical paths lower on the page.
    assert "contrato sob pressão" in lower
    assert "edital e proposta" in lower
    assert "operação recorrente" in lower
    assert "solicitar canal seguro para envio" in lower
    # Visible labels "Jornada A/B/C" must not appear (data-journey attrs OK)
    assert not re.search(r">\s*Jornada\s+[ABC]\s*<", home), "visible Jornada A/B/C label"
    assert "risco de não agir" not in lower
    # A oferta de proposta usa o nome canônico em português.
    assert "operação de proposta para licitação crítica" in lower
    assert "defesa técnica" in lower or "proteção de margem" in lower

def test_llms_consistent():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "Diretoria Fracionada para o Mercado Público" in text
    assert "/diretoria-b2g/" in text
    assert "Engenheiro Civil e Diretoria B2G fracionada" not in text




def test_concordance_and_forbidden_microcopy():
    """Already-identified grammar/CTA defects, on every shipped visitor page.

    Issue #298: the scope used to be seven fixed commercial files, so the same
    defect shipped freely on page eight.
    """
    forbidden = [
        "Premissas e decisões registrados",
        "Preferir formulário",
        "Deep work",
        "Conhecer a Diretoria B2G",
        "GO / REVIEW / NO-GO",
        "GO/REVIEW/NO-GO",
        "assume a recomendação e confronta com o resultado",
    ]
    failures: list[str] = []
    scanned = 0
    for path in _visitor_facing_html_files():
        scanned += 1
        rel = relpath(path, ROOT)
        text = path.read_text(encoding="utf-8")
        for phrase in forbidden:
            if phrase in text and not is_excepted(BRAND_EXCEPTION_RULE, phrase, rel):
                failures.append(f"{rel}: forbidden microcopy {phrase!r}")
    assert scanned >= 200, f"concordance scan too narrow: {scanned}"
    assert not failures, failures
    # no em-dash (travessão) in user-facing commercial HTML
    commercial = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "diagnostico-b2g-360" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "defesa-margem-contratos-publicos" / "index.html",
        ROOT / "obrigado.html",
        ROOT / "especialista" / "tiago-jun-sasaki" / "index.html",
    ]
    for path in commercial:
        if not path.exists():
            continue
        assert "—" not in path.read_text(encoding="utf-8"), f"{path}: em-dash/travessão present"


def test_copy_gate_scope_covers_every_published_route():
    """Nothing the publish step ships may fall outside the copy gates.

    The scope is derived from the repository; this cross-checks it against the
    routes `npm run build:site` actually publishes, so a family that gets added
    to the publish allowlist cannot stay outside copy enforcement.
    """
    covered = {route_for(relpath(p, ROOT)) for p in _visitor_facing_html_files()}
    routes = manifest_html_routes(ROOT)
    assert len(routes) >= 200, f"manifest looks empty: {len(routes)}"
    missing = [r for r in routes if r not in covered and r not in MANIFEST_ROUTE_EXEMPT]
    assert not missing, f"published routes outside the copy gates: {missing}"


def test_copy_gate_scope_has_no_handwritten_route_allowlist():
    """The gate scope must stay derived, never a re-hand-written list of routes."""
    source = Path(__file__).read_text(encoding="utf-8")
    body = source.split("def _public_html_surfaces()", 1)[1].split("def ", 1)[0]
    assert "rglob" not in body, "scope must delegate to public_copy_scope"
    assert body.count("ROOT /") <= 1, "no per-route allowlist inside the scope helper"
    surfaces = _public_html_surfaces()
    assert len(surfaces) >= 200, f"public surface scope too narrow: {len(surfaces)}"
    tops = {relpath(p, ROOT).split("/")[0] for p in surfaces}
    # Families published after the old 34-root list was written.
    for family in (
        "entregas",
        "servicos-obras-publicas",
        "problemas-que-resolvemos",
        "analises-contratos-publicos",
        "panorama-mercado-obras-publicas",
        "politica-editorial",
        "comercial",
        "correcoes",
        "conflitos",
        "uso-de-ia",
    ):
        assert family in tops, f"{family} outside the derived copy scope"


def test_new_public_family_is_gated_without_editing_a_list(tmp_path=None):
    """A brand-new public family is in scope the moment its HTML lands."""
    import tempfile

    from scripts.site.public_copy_scope import visitor_facing_html_files as scope

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "familia-nova-2027").mkdir()
        (root / "familia-nova-2027" / "index.html").write_text(
            "<html><body><p>Conversão com utilidade real</p></body></html>",
            encoding="utf-8",
        )
        found = [str(p.relative_to(root)) for p in scope(root)]
    assert found == ["familia-nova-2027/index.html"], found


def test_lint_phrase_rules_govern_ok_and_exit_code():
    """#298 defect 1: the five phrase rules must fail the lint, not just report."""
    from scripts.site import lint_editorial_copy as lint

    names = [name for name, _ in lint.PATS]
    assert names[0] == "em_dash"
    phrase_names = names[1:]
    assert set(phrase_names) == {
        "resultado_acionavel",
        "ordem_de_ataque",
        "engenharia_mais_prova",
        "diligencia_eterna",
        "agrega_valor",
    }
    samples = {
        "resultado_acionavel": "entrega um resultado acionável para a diretoria",
        "ordem_de_ataque": "define a ordem de ataque das oportunidades",
        "engenharia_mais_prova": "a tese é engenharia + prova",
        "diligencia_eterna": "o pedido vira diligência eterna",
        "agrega_valor": "o relatório agrega valor ao contrato",
    }
    for name in phrase_names:
        found: list[dict] = []
        lint.scan(samples[name], "synthetic/index.html", "html_visible", found)
        assert [f["pattern"] for f in found] == [name], (name, found)
        # A phrase-only finding must turn the report red and the exit code non-zero.
        report = lint.build_report([], found, 0, 1)
        assert report["ok"] is False, name
        assert report["phrase_count"] == 1, name
    assert lint.build_report([], [], 0, 1)["ok"] is True
    shipped = json.loads((ROOT / "docs" / "editorial" / "COPY-LINT-REPORT.json").read_text(encoding="utf-8"))
    assert shipped["ok"] is True
    assert shipped["phrase_count"] == 0
    assert shipped["scanned_html"] >= 200, shipped["scanned_html"]


def test_every_copy_exception_is_justified_and_precise():
    """Exceptions are per-occurrence, resolvable and carry a written reason."""
    rows = load_exceptions()
    raw = json.loads((ROOT / "data" / "site" / "copy-exceptions.json").read_text(encoding="utf-8"))
    declared = raw.get("exceptions") or []
    assert len(rows) == len(declared), "an exception without a reason is silently dropped"
    known_rules = set(raw.get("rules") or {})
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        rule, match, rel = row["rule"], row["match"], row["path"]
        assert rule in known_rules, f"unknown rule {rule!r}"
        assert "*" not in rel and "?" not in rel, f"exception path must be exact: {rel!r}"
        assert (ROOT / rel).is_file(), f"stale exception path: {rel}"
        assert len(str(row["reason"]).strip()) >= 40, f"reason too thin: {rule}/{rel}"
        key = (rule, match.casefold(), rel)
        assert key not in seen, f"duplicate exception: {key}"
        seen.add(key)
        # A dead exception is rot: it must still describe a real occurrence.
        raw = (ROOT / rel).read_text(encoding="utf-8")
        if rule == "plain_language":
            hit = bool(re.search(match, visible_text(raw), re.I))
        elif rule == "editorial_copy_phrase":
            hit = True  # pattern name, resolved by the lint itself
        else:
            hit = match.lower() in visible_markup(raw).lower() or match in raw
        assert hit, f"dead exception (nothing to except): {rule} {match!r} {rel}"



def test_public_surfaces_have_no_prose_em_dashes():
    """Radar, conteudos, inteligencia and pillars: no CONFENGE prose travessão.

    Official source titles (Planalto/TCU/AGU/…) may still use —.
    """
    from scripts.site.scrub_em_dashes import residual_em_dashes

    samples = [
        ROOT / "radar" / "index.html",
        ROOT / "radar" / "edificacoes-publicas-sc" / "index.html",
        ROOT / "conteudos" / "index.html",
        ROOT / "conteudos" / "comprovacao-exequibilidade-proposta-obra" / "index.html",
        ROOT / "inteligencia" / "index.html",
        ROOT / "aditivos-obras-publicas" / "index.html",
    ]
    for path in samples:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        residual = residual_em_dashes(text)
        assert residual == [], f"{path}: prose em-dash residual {residual[:3]!r}"
    # Radar hub should show human punctuation (spot regression of generator copy)
    radar = (ROOT / "radar" / "index.html").read_text(encoding="utf-8")
    assert "operação, não para o mercado inteiro" in radar
    assert "perfil da empresa (capacidade, acervo" in radar
    assert "calibrar o recorte, não assinar" in radar
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "situação compreendida" in home
    assert "critério técnico definido" in home
    assert "entrega e limite combinados" in home
    # Journey confirmations exist
    for name in ("obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        p = ROOT / name
        assert p.exists(), name
        t = p.read_text(encoding="utf-8")
        assert "data-lead-success" in t
        assert "Prazo" in t or "prazo" in t
        assert "wa.me" in t
    assert "Entrar em obras públicas" in home
    assert "Solicitar canal seguro para envio" in home
    assert "enviar documentos para análise" not in home.lower()
    # Thank-you pages must not expose journey letter labels to visitors
    for name in ("obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"):
        ty = (ROOT / name).read_text(encoding="utf-8")
        assert not re.search(r"Jornada\s+[ABC]", ty), f"{name}: visible Jornada letter"
    # Journey-aligned CTA family on offer pages
    assert "Solicitar diagnóstico da operação" in (ROOT / "diagnostico-b2g-360" / "index.html").read_text(encoding="utf-8")
    assert "Solicitar canal seguro para envio" in (ROOT / "bid-room-licitacoes-obras" / "index.html").read_text(encoding="utf-8")
    defesa = (ROOT / "defesa-margem-contratos-publicos" / "index.html").read_text(encoding="utf-8")
    assert "Solicitar canal seguro para envio" in defesa
    assert "enviar documentos para análise" not in defesa.lower()
    assert "Diagnosticar encaixe da Diretoria Fracionada para o Mercado Público" in (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")


def test_whatsapp_float_in_landmark():
    pages = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "obrigado.html",
    ]
    for path in pages:
        text = path.read_text(encoding="utf-8")
        assert "contact-float" in text, f"{path}: missing contact-float landmark"
        assert 'aria-label="Contato rápido"' in text or "Contato rápido" in text


# Visitor-visible backstage / marketing-objective language (public surface banlist).
# Keep in sync with brand.json forbidden_phrases / copy_leaks extensions.
PUBLIC_BACKSTAGE_PHRASES = (
    "Conversão com utilidade real",
    "utilidade real",
    "alta intenção",
    "Prova próxima ao CTA",
    "Nurture por intenção",
    "Wave 1 noindex",
    "QA interno",
    "PILOTO · NOINDEX",
    "Search Demand Observatory",
    "pending_lineage",
    "datalake",
    "extra-cli",
    "motor de inbound",
    "ativo de conversão",
    "jornada de decisão",
    "prova de autoridade",
    "CTA contextual",
    "Onboarding e horizonte",
    "Este cluster",
    "este cluster",
    "dados do lead",
    "notificação de lead",
    "notificacao de lead",
)

# Patterns for short chrome that phrase-substring misses (visible badge "CTA", bare lineage).
PUBLIC_BACKSTAGE_PATTERNS = (
    re.compile(r">\s*CTA\s*<"),
    re.compile(r"<span>\s*CTA\s*</span>", re.I),
    re.compile(r"\blineage\b", re.I),
)

# Internal offer taxonomy must never ship as visitor chrome.
# jobTitle in JSON-LD is out of scope; these patterns target dt/aria markup.
VISITOR_CONTEXT_BANNED = (
    re.compile(r"<dl\b[^>]*\bclass=['\"][^'\"]*\bhero-proof\b", re.I),
    re.compile(r"<dt>\s*Job\s*</dt>", re.I),
    re.compile(r"<dt>\s*ICP\s*</dt>", re.I),
    re.compile(r"<dt>\s*Trigger\s*</dt>", re.I),
    re.compile(r"""aria-label=['"]Job,\s*ICP e trigger['"]""", re.I),
)

def _public_html_surfaces() -> list[Path]:
    """Every shipped visitor HTML file, derived from the repository.

    Issue #298: this used to be a hand-written list of 34 roots, which left 23
    public HTML files (including the three families published on 2026-08-23)
    outside the backstage gate by default. The scope now comes from
    scripts/site/public_copy_scope, so a new public family is covered the moment
    its first index.html lands, with no list to edit.
    """
    return list(visitor_facing_html_files(ROOT))


def _visitor_facing_html_files() -> list[Path]:
    """All shipped visitor HTML. A new public offer page is in scope by default."""
    return list(visitor_facing_html_files(ROOT))


def test_visitor_offer_context_has_no_internal_labels():
    """No Job/ICP/Trigger chrome and no dl.hero-proof on visitor HTML."""
    failures: list[str] = []
    scanned = 0
    for path in _visitor_facing_html_files():
        scanned += 1
        text = path.read_text(encoding="utf-8")
        vis = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
        vis = re.sub(r"<style[\s\S]*?</style>", " ", vis, flags=re.I)
        for cre in VISITOR_CONTEXT_BANNED:
            if cre.search(vis):
                failures.append(f"{path.relative_to(ROOT)}: {cre.pattern}")
    assert scanned >= 20, f"visitor HTML scan too narrow: {scanned}"
    assert not failures, failures


def test_hero_proof_credentials_list_still_present():
    """ul.hero-proof remains the credentials component; dl.hero-proof is gone."""
    diretoria = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert re.search(r"<ul\b[^>]*\bhero-proof\b", diretoria), "diretoria credentials ul.hero-proof missing"
    assert re.search(r"<ul\b[^>]*\bhero-proof\b", home), "home credentials ul.hero-proof missing"
    assert "Credenciais e posicionamento" in diretoria
    assert not re.search(r"<dl\b[^>]*\bhero-proof\b", diretoria)
    assert 'class="offer-context"' in diretoria
    assert "<dt>O que resolvemos</dt>" in diretoria
    assert "<dt>Para quem é</dt>" in diretoria
    assert "<dt>Quando faz sentido</dt>" in diretoria
    assert "<dt>Job</dt>" not in diretoria
    assert "<dt>ICP</dt>" not in diretoria
    assert "<dt>Trigger</dt>" not in diretoria


def scan_backstage_html(html: str, rel: str = "fixture.html") -> list[str]:
    """Visitor-visible backstage leaks. Fixtures and shipped pages share this."""
    vis = visible_markup(html)
    lower = vis.lower()
    failures: list[str] = []
    for phrase in PUBLIC_BACKSTAGE_PHRASES:
        if phrase.lower() in lower and not is_excepted(BACKSTAGE_EXCEPTION_RULE, phrase, rel):
            failures.append(f"{rel}: {phrase!r}")
    for cre in PUBLIC_BACKSTAGE_PATTERNS:
        if cre.search(vis) and not is_excepted(BACKSTAGE_EXCEPTION_RULE, cre.pattern, rel):
            failures.append(f"{rel}: pattern {cre.pattern!r}")
    return failures


def scan_brand_html(html: str, rel: str = "fixture.html") -> list[str]:
    """Brand forbidden phrases on one HTML blob. Same function the sitewide scan uses."""
    brand = load_brand()
    phrases = brand["forbidden_phrases"]
    lower = visible_markup(html).lower()
    failures: list[str] = []
    for phrase in phrases:
        if phrase.lower() in lower and not is_excepted(BRAND_EXCEPTION_RULE, phrase, rel):
            failures.append(f"{rel}: {phrase!r}")
    return failures


def evaluate_copy_html(html: str, rel: str = "fixture.html") -> list[str]:
    return scan_backstage_html(html, rel) + scan_brand_html(html, rel)


def test_copy_scanners_ignore_non_perceptible_subtrees():
    """Hidden implementation copy is not visitor-facing brand/backstage copy."""
    html = """
    <main>
      <template><p>extra-cli</p></template>
      <section hidden><p>fale conosco</p></section>
      <section aria-hidden="true"><p>excelência</p></section>
      <section inert><p>alta intenção</p></section>
      <section style="color: red; display: none !important"><p>inovação</p></section>
    </main>
    """
    assert evaluate_copy_html(html) == []


def test_brand_scanner_keeps_public_copy_channels_only():
    html = """
    <html>
      <head>
        <title>tecnologia de ponta</title>
        <meta name="description" content="potencialize seus resultados">
        <meta property="og:title" content="maximize oportunidades">
        <meta name="keywords" content="conte conosco">
      </head>
      <body class="conte conosco" data-internal-copy="conte conosco">
        <p>soluções personalizadas</p>
        <img alt="solução completa" data-caption="conte conosco">
        <button aria-label="excelência"></button>
        <input placeholder="inovação" data-help="conte conosco">
      </body>
    </html>
    """
    failures = scan_brand_html(html)
    for phrase in (
        "soluções personalizadas",
        "solução completa",
        "excelência",
        "inovação",
        "tecnologia de ponta",
        "potencialize seus resultados",
        "maximize oportunidades",
    ):
        assert any(repr(phrase) in finding for finding in failures), phrase
    assert not any(repr("conte conosco") in finding for finding in failures)


def test_public_backstage_language_absent():
    """No visitor-facing backstage / conversion-objective jargon on public HTML."""
    failures: list[str] = []
    for path in _public_html_surfaces():
        rel = relpath(path, ROOT)
        failures.extend(scan_backstage_html(path.read_text(encoding="utf-8"), rel))
    assert not failures, failures


def test_ferramentas_eyebrow_client_facing():
    html = (ROOT / "ferramentas" / "index.html").read_text(encoding="utf-8")
    m = re.search(r'class="eyebrow">([^<]+)', html)
    assert m, "ferramentas missing eyebrow"
    eye = m.group(1).strip()
    assert "conversão" not in eye.lower(), eye
    assert "utilidade" not in eye.lower(), eye
    assert re.search(r"ferramenta", eye, re.I), f"expected tools category eyebrow, got {eye!r}"


def test_visitor_copy_rejects_internal_strategy_phrases():
    """#188: home and /conteudos/ must not expose internal strategy language."""
    forbidden = (
        "O foco comercial prioriza o contrato sob pressão; os demais seguem com clareza subordinada.",
        "Busque pelo problema concreto, não por categorias de inventário.",
    )
    pages = (
        ROOT / "index.html",
        ROOT / "conteudos" / "index.html",
    )
    for path in pages:
        text = path.read_text(encoding="utf-8")
        for phrase in forbidden:
            assert phrase not in text, f"{path}: internal phrase still visible"


def test_sinapi_snippet_unique_not_generic():
    """#126: GSC URL title, H1 and meta name the SINAPI desonerado decision.

    Drives the shipped page that currently gets 89 impressions / 1 click.
    Fails if the original title (no SINAPI) or truncated/generic snippet returns.
    """
    path = ROOT / "conteudos" / "sinapi-desonerado-nao-desonerado" / "index.html"
    html = path.read_text(encoding="utf-8")
    title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
    h1_m = re.search(r"<h1>([^<]+)</h1>", html, re.I)
    desc_m = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
        html,
        re.I,
    )
    assert title_m and h1_m and desc_m, f"{path.name}: missing title, H1 or meta description"
    title = title_m.group(1).strip()
    h1 = h1_m.group(1).strip()
    meta = (desc_m.group(1) or desc_m.group(2)).strip()
    title_core = re.sub(r"\s*\|\s*CONFENGE\s*$", "", title).strip()
    assert "SINAPI" in title_core, "title must name SINAPI (original defect: omitted query)"
    assert title_core != "Desonerado e não desonerado: o que o edital exige"
    assert title_core != h1, "title and H1 must not be duplicates"
    assert title_core.lower() not in meta.lower(), "title duplicated into meta"
    assert h1.lower() not in meta.lower(), "H1 duplicated into meta"
    for blob, name in ((title, "title"), (h1, "h1"), (meta, "meta")):
        assert "…" not in blob and "..." not in blob, f"{name} truncated"
        lower = blob.lower()
        for generic in ("guia completo", "tudo sobre", "saiba mais", "página inicial", "clique aqui"):
            assert generic not in lower, f"{name} generic: {generic}"
        assert "SINAPI" in blob, f"{name} missing SINAPI intent"
        assert "desonerad" in lower, f"{name} missing desonerado intent"
    assert 24 <= len(title_core) <= 62, f"title core length {len(title_core)}"
    assert 70 <= len(meta) <= 170, f"meta length {len(meta)}"
    assert "SINAPI" in h1


def test_banlist_includes_conversion_eyebrow():
    """Regression: known leak phrase must remain in brand + design banlists."""
    brand = load_brand()
    phrases = " ".join(
        list(brand.get("forbidden_phrases") or [])
        + list(brand.get("copy_leaks") or [])
    ).lower()
    assert "conversão com utilidade real" in phrases
    assert "alta intenção" in phrases
    ds_path = ROOT / "data" / "site" / "design-system.json"
    import json

    ds = json.loads(ds_path.read_text(encoding="utf-8"))
    ds_leaks = " ".join(ds.get("public_copy_leaks") or []).lower()
    assert "conversão com utilidade real" in ds_leaks


def test_gate_bites_on_reintroduction():
    """Prove the public banlist would catch reintroduced conversion / pipeline leaks."""
    fixture = ROOT / "scripts" / "site" / "fixtures" / "truthful_gates" / "forbidden-phrase.html"
    html = fixture.read_text(encoding="utf-8")
    hits = evaluate_copy_html(html, "scripts/site/fixtures/truthful_gates/forbidden-phrase.html")
    assert hits, "adversarial fixture must fail the shipped copy scanner"
    assert any("Conversão com utilidade real" in hit for hit in hits)
    synthetic = '<p class="eyebrow">Conversão com utilidade real</p>'
    assert scan_backstage_html(synthetic)
    assert any(cre.search('<div class="aside-card"><span>CTA</span><h2>X</h2>') for cre in PUBLIC_BACKSTAGE_PATTERNS)
    assert any(cre.search("Números só com lineage.") for cre in PUBLIC_BACKSTAGE_PATTERNS)
    assert "este cluster" in "Este cluster trata do edital".lower()


if __name__ == "__main__":
    failed = 0
    for t in (
        test_copy_leaks_absent_on_commercial_pages,
        test_job_title_valid,
        test_brand_forbidden_phrases_still_enforced,
        test_microcopy_preferences,
        test_llms_consistent,
        test_concordance_and_forbidden_microcopy,
        test_public_surfaces_have_no_prose_em_dashes,
        test_whatsapp_float_in_landmark,
        test_visitor_offer_context_has_no_internal_labels,
        test_hero_proof_credentials_list_still_present,
        test_public_backstage_language_absent,
        test_ferramentas_eyebrow_client_facing,
        test_visitor_copy_rejects_internal_strategy_phrases,
        test_sinapi_snippet_unique_not_generic,
        test_banlist_includes_conversion_eyebrow,
        test_gate_bites_on_reintroduction,
        test_copy_gate_scope_covers_every_published_route,
        test_copy_gate_scope_has_no_handwritten_route_allowlist,
        test_new_public_family_is_gated_without_editing_a_list,
        test_every_copy_exception_is_justified_and_precise,
        test_lint_phrase_rules_govern_ok_and_exit_code,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
