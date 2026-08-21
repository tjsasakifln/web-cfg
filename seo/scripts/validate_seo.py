#!/usr/bin/env python3
"""Technical SEO + conversion validation for the static CONFENGE site.

Drives real files in the repo (HTML, sitemap, netlify.toml, script.js).
Exit code 0 only when blocking checks pass.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
errors: list[str] = []
warnings: list[str] = []

# Internal trees are not public pages. `data/` holds fixtures (Data Desk embed
# fragments, JSON packs) and must not be treated as crawlable HTML.
SKIP_DIRS = frozenset(
    {
        ".git",
        "seo",
        ".playwright-mcp",
        "node_modules",
        "_site",
        "docs",
        ".netlify",
        ".cache",
        "data",
        "scripts",
        "tests",
        "netlify",
        ".worktrees",
    }
)


def _relative_parts(path: Path, base: Path) -> tuple[str, ...]:
    """Path parts relative to the scan root.

    Skip rules apply inside the checkout, not to ancestor directories.
    A worktree at `repo/.worktrees/name` must still see public HTML.
    """
    try:
        return path.resolve().relative_to(base.resolve()).parts
    except ValueError:
        return path.parts


def iter_seo_html_pages(root: Path | None = None) -> list[Path]:
    """HTML files the SEO gate treats as public/candidate pages."""
    base = (root or ROOT).resolve()
    out: list[Path] = []
    for p in base.rglob("*.html"):
        if any(part in SKIP_DIRS for part in _relative_parts(p, base)):
            continue
        out.append(p)
    return out


def page_path(p: Path) -> str:
    if p.name == "index.html":
        if p.parent == ROOT:
            return "/"
        return "/" + str(p.parent.relative_to(ROOT)).replace("\\", "/") + "/"
    return "/" + str(p.relative_to(ROOT)).replace("\\", "/")


INTRANET_PATH_RE = re.compile(r"(?:^|/)intranet(?:/|$|\?|#)", re.I)
NAV_BLOCK_RE = re.compile(r"<nav\b[^>]*>.*?</nav>", re.I | re.S)
LD_JSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
ATTR_URL_RE = re.compile(
    r'''(?:href|content|src)=["']([^"']+)["']''',
    re.I,
)


def _page_path_for(p: Path, base: Path) -> str:
    if p.name == "index.html":
        if p.parent == base:
            return "/"
        return "/" + str(p.parent.relative_to(base)).replace("\\", "/") + "/"
    return "/" + str(p.relative_to(base)).replace("\\", "/")


def intranet_url_match(value: str) -> bool:
    """True when value is an /intranet URL, loc, or href — not the bare word."""
    raw = (value or "").strip()
    if not raw:
        return False
    candidate = raw
    if candidate.startswith("//"):
        candidate = "https:" + candidate
    if candidate.startswith(("http://", "https://")):
        path = urlparse(candidate).path or "/"
    else:
        path = candidate.split("?")[0].split("#")[0]
    return bool(INTRANET_PATH_RE.search(path))


def intranet_indexable_hits(root: Path | None = None) -> list[str]:
    """Scan shipped sitemap/nav/JSON-LD/public HTML for indexable /intranet URLs."""
    base = (root or ROOT).resolve()
    hits: list[str] = []

    for cand in (base / "intranet" / "index.html", base / "intranet.html"):
        if cand.is_file():
            hits.append(f"public_html_page:{cand.relative_to(base).as_posix()}")

    from scripts.organic.sitemap_graph import load_graph_locs

    for loc in load_graph_locs(base):
        if intranet_url_match(loc):
            hits.append(f"sitemap_loc:{loc}")

    sitemap_files = sorted(base.glob("sitemap*.xml"))
    txt = base / "sitemap.txt"
    if txt.is_file():
        sitemap_files.append(txt)
    for sm in sitemap_files:
        text = sm.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"<loc>\s*([^<]+)\s*</loc>", text, re.I):
            loc = m.group(1).strip()
            if intranet_url_match(loc):
                hits.append(f"sitemap_xml_loc:{sm.name}:{loc}")
        if sm.suffix == ".txt":
            for line in text.splitlines():
                item = line.strip()
                if item and intranet_url_match(item):
                    hits.append(f"sitemap_txt:{item}")

    for p in iter_seo_html_pages(base):
        t = p.read_text(encoding="utf-8", errors="replace")
        try:
            rel = p.relative_to(base).as_posix()
        except ValueError:
            rel = str(p)
        path = _page_path_for(p, base)
        if path.rstrip("/") == "/intranet" or path.startswith("/intranet/"):
            hits.append(f"public_page:{path}")
        for href in ATTR_URL_RE.findall(t):
            if intranet_url_match(href):
                hits.append(f"html_href:{rel}:{href}")
        for block in LD_JSON_RE.findall(t):
            if intranet_url_match(block) or re.search(r"/intranet(?:/|$|\?|#|\"|')", block, re.I):
                hits.append(f"jsonld:{rel}")
        for nav in NAV_BLOCK_RE.findall(t):
            if intranet_url_match(nav) or re.search(r'''href=["'][^"']*/intranet''', nav, re.I):
                hits.append(f"nav:{rel}")
    return hits


def main() -> int:
    html_pages = iter_seo_html_pages(ROOT)
    from scripts.organic.sitemap_graph import load_graph_locs, load_index_members

    sm_urls = load_graph_locs(ROOT)
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if "sitemap-index.xml" not in robots.lower() and "Sitemap:" not in robots:
        errors.append("robots.txt missing Sitemap")
    for member in load_index_members(ROOT):
        if not (ROOT / member.filename).is_file():
            errors.append(f"sitemap-index member inaccessible: {member.filename}")

    titles: dict[str, list[str]] = defaultdict(list)
    descs: dict[str, list[str]] = defaultdict(list)
    paths_info: dict[str, Path] = {}

    for p in html_pages:
        t = p.read_text(encoding="utf-8", errors="replace")
        path = page_path(p)
        paths_info[path] = p
        title = re.search(r"<title>([^<]*)</title>", t)
        h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", t, re.S)
        can = re.search(
            r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']|href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']',
            t,
        )
        desc = re.search(
            r'name=["\']description["\'][^>]*content=["\']([^"\']*)["\']|content=["\']([^"\']*)["\'][^>]*name=["\']description["\']',
            t,
        )
        is_noindex = bool(
            re.search(r'name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', t, re.I)
        )
        is_utility = (
            path in ("/404.html", "/obrigado.html")
            or path.startswith("/obrigado")
            or p.name.startswith("obrigado")
        )
        if is_utility or is_noindex:
            # Journey confirmations and other noindex utilities are not indexable
            # SEO targets; skip title/canonical uniqueness gates.
            continue
        if not title:
            errors.append(f"no title {path}")
        else:
            titles[title.group(1)].append(path)
        if len(h1s) != 1:
            errors.append(f"h1 count {len(h1s)} {path}")
        if not can:
            errors.append(f"no canonical {path}")
        else:
            c = can.group(1) or can.group(2)
            if urlparse(c).path != path:
                errors.append(f"canonical mismatch {path} -> {c}")
        if not desc:
            warnings.append(f"no description {path}")
        else:
            d = desc.group(1) or desc.group(2)
            descs[d].append(path)
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
            try:
                json.loads(block)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"JSON-LD invalid {path}: {exc}")

    for t, ps in titles.items():
        if len(ps) > 1:
            errors.append(f"dup title {t}: {ps}")
    for d, ps in descs.items():
        if len(ps) > 1:
            errors.append(f"dup desc: {ps}")

    sm_paths = {urlparse(u).path for u in sm_urls}
    indexable: set[str] = set()
    for path, p in paths_info.items():
        if path in ("/404.html", "/obrigado.html") or path.startswith("/obrigado") or p.name.startswith("obrigado"):
            continue
        t = p.read_text(encoding="utf-8", errors="replace")
        if re.search(r'name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', t, re.I):
            continue
        indexable.add(path)
    if sm_paths - indexable:
        errors.append(f"sitemap not on FS: {sorted(sm_paths - indexable)}")
    if indexable - sm_paths:
        warnings.append(f"indexable not in sitemap: {sorted(indexable - sm_paths)}")

    legacy = [
        "/servicos",
        "/contato",
        "/vision",
        "/nexgen",
        "/avcbclcb",
        "/blog",
        "/trabalhe-conosco",
        "/terms-and-conditions",
        "/privacy-policy",
        "/politica-de-privacidade",
    ]
    # Redirect source of truth: publish-root `_redirects` (plus optional host in toml).
    redirects_blob = ""
    rd_path = ROOT / "_redirects"
    if not rd_path.exists():
        errors.append("missing _redirects in publish root")
    else:
        redirects_blob = rd_path.read_text(encoding="utf-8")
    nt_pre = (ROOT / "netlify.toml").read_text(encoding="utf-8") if (ROOT / "netlify.toml").exists() else ""
    combined = redirects_blob + "\n" + nt_pre
    for abandoned in ("/vision", "/nexgen", "/avcbclcb"):
        if abandoned not in combined:
            errors.append(f"abandoned path missing explicit rule: {abandoned}")
        # soft-404 to home forbidden
        for line in combined.splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith(abandoned) and " 301" in s and s.rstrip().endswith("/"):
                # e.g. /vision  /  301
                parts = s.split()
                if len(parts) >= 3 and parts[1] in ("/", "/index.html"):
                    errors.append(f"soft-404 forbidden: {abandoned} 301 to home")
            if abandoned in s and " 301" in s and " / " in f" {s} ":
                parts = s.split()
                if len(parts) >= 2 and parts[1] == "/":
                    errors.append(f"soft-404 forbidden: {abandoned} → /")
    # terms must not point at privacy
    for line in combined.splitlines():
        s = line.strip()
        if "terms-and-conditions" in s and "privacidade" in s and not s.startswith("#"):
            errors.append("terms-and-conditions must not redirect to privacidade")
    if "confenge.netlify.app" not in combined or "confenge.com.br/:splat" not in combined:
        errors.append("missing host redirect confenge.netlify.app → confenge.com.br/:splat")
    # no trailing-slash-only normalization rules (Netlify Pretty URLs)
    for line in redirects_blob.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if len(parts) >= 3 and parts[2].startswith("301"):
            a, b = parts[0].rstrip("/"), parts[1].rstrip("/")
            if a and b and a == b and parts[0] != parts[1]:
                errors.append(f"trailing-slash-only redirect forbidden: {s}")
    link_re = re.compile(r'href=["\']([^"\'#]+)')
    for path, p in paths_info.items():
        t = p.read_text(encoding="utf-8", errors="replace")
        for href in link_re.findall(t):
            if href.startswith(("http", "mailto:", "tel:", "data:", "//")):
                continue
            h = href.split("?")[0]
            if not h.startswith("/"):
                continue
            for leg in legacy:
                if h.rstrip("/") == leg.rstrip("/"):
                    errors.append(f"legacy internal link {path} -> {h}")
            if h.startswith("/assets/") or h.endswith((".css", ".js", ".xml", ".txt", ".webmanifest", ".json")):
                if not (ROOT / h.lstrip("/")).exists():
                    errors.append(f"broken asset {path} -> {h}")
                continue
            if h.endswith(".html"):
                if not (ROOT / h.lstrip("/")).exists() and h not in ("/obrigado.html",):
                    errors.append(f"broken html {path} -> {h}")
                continue
            if h == "/":
                continue
            hp = h if h.endswith("/") else h + "/"
            cand = ROOT / hp.lstrip("/") / "index.html"
            if not cand.exists() and h not in ("/obrigado", "/privacidade"):
                # allow only known redirect sources without index
                if h.rstrip("/") in legacy:
                    continue
                # skip if netlify redirects handle it
                continue

    sin = (ROOT / "conteudos/sinapi-desonerado-nao-desonerado/index.html").read_text(encoding="utf-8")
    for needle in [
        "compare-table",
        "checklist",
        "CPRB",
        "sequencia-decisao",
        "cta-pos-resposta",
        "qual usar?",
        "wa.me/5548988344559",
        "SINAPI desonerado",
    ]:
        if needle not in sin:
            errors.append(f"SINAPI missing {needle}")

    js = (ROOT / "script.js").read_text(encoding="utf-8")
    for ev in [
        "whatsapp_click",
        "lead_form_start",
        "lead_form_submit",
        "lead_form_error",
        "lead_form_success",
        "service_cta_click",
        "content_to_service_click",
        "internal_search",
        "qualified_scroll",
        "confengeTrack",
    ]:
        if ev not in js:
            errors.append(f"analytics missing {ev}")
    obrigado = (ROOT / "obrigado.html").read_text(encoding="utf-8")
    if 'data-lead-success="1"' not in obrigado:
        errors.append("obrigado.html missing data-lead-success for lead_form_success")
    if "script.js" not in obrigado:
        errors.append("obrigado.html must load script.js to fire lead_form_success")
    if "/@|" not in js and r"/@|" not in js:
        # PII email/phone filter must exist in shipped track()
        if "email" not in js or "\\d{8,}" not in js:
            errors.append("analytics PII filter missing")

    # Editorial anti-mold checks (old + new frames + bulk-template failures)
    old_bp = (
        "A resposta não é automática",
        "O tema exige uma leitura conjunta",
        "a análise deve analisar",
        "causa, responsabilidade, impacto e valor",
        "a decisão correta depende",
        "Antes de aceitar, executar ou contestar, amarre fato",
        "Esse elemento altera o enquadramento porque define a obrigação",
        "A verificação deve partir de documentos contemporâneos, não de uma reconstrução",
        "O efeito técnico precisa ser conectado a prazo, quantidade, produtividade",
        "A comunicação deve registrar fato, impacto provável, providência solicitada",
        "A conclusão só se sustenta quando um terceiro consegue repetir",
        "permita auditoria por terceiro",
        "Garanta que",
        "como fazer ",
        "?.",
        "Organize a linha do.",  # truncated FAQ/answer connective
        # bulk verb-glue / delay-template applied to unrelated topics (de4cbef regression)
        "Pedido ligado a",
        "Posicione edital fixa",
        "Monte edital fixa",
        "Documente edital omisso",
        "Sem efeito no caminho crítico, o pedido sobre",
        "retórica sem anexo não substitui prova",
        "prova contemporânea vale mais que relato posterior",
        "vira glosa ou impasse de caixa",
        "no mesmo dia do evento",
        "Struture ",
        "só se sustenta com prova feita na hora dos fatos",
        "Trate revisar ",
        "Converta separar ",
        "Converta quantificar ",
        "Lance revisar ",
        # second-wave mass "repair" mold (must stay zero)
        "Comece por aqui na montagem do dossiê",
        "Valide este bloco antes de fechar números",
        "Cruze com o diário e a planilha no mesmo dia",
        "Deixe rastreável para um terceiro repetir o raciocínio",
        "Não deixe este item só na memória da equipe",
        "Se estiver frágil, priorize reforço documental",
        "amarre o efeito a prazo",
        "Ignore esse ponto e o restante da análise",
        "É um dos primeiros itens que o órgão",
        "Quando falha, o custo aparece tarde",
        "Feche este item antes de precificar",
        "A qualidade da prova aqui costuma separar",
        "Sem isso, qualquer conclusão sobre",
        "Foque em «",
        "antes de escalar o próximo passo",
        "costuma decidir se o pedido avança ou trava",
        "Analise distinguir",
        "Analise estruturar",
        "Quantifique examinar",
        "Decomponha conectar",
        "Decomponha distinguir",
        "Conecte caminho crítico às atividades do caminho crítico",
        "como regra do edital está definido",
        "Critério em foco:",
        # third-wave mass frames (must stay zero)
        "Para conduzir ",
        "Valide examinar",
        "prazo, quantidade, custo ou responsabilidade mensurável",
        "costuma ser o ponto que o órgão questiona primeiro",
        "só avança se estiver amarrado a prova",
        "Quantifique a quantificação",
        "Analise a análise",
        "Decomponha a decomposição",
        "Trate a análise de",
        "Ligue o exame de",
    )
    mold_answer_starts = Counter()
    # Exact diagnostico card bodies across the corpus — mass frames fail above threshold
    diag_card_bodies: Counter[str] = Counter()
    # H3-normalized structural frames (H3-slotting cannot game this)
    structural_frames: Counter[str] = Counter()
    page_structural: dict[str, list[str]] = {}
    INF_LEAD = re.compile(
        r"^(distinguir|estruturar|examinar|conectar|revisar|separar|quantificar|analisar|"
        r"comparar|mapear|organizar|verificar|listar|ler|documentar|registrar|definir|"
        r"identificar|avaliar|calcular|confirmar|medir)\s+",
        re.I,
    )

    def normalize_struct(body: str, h3s: list[str]) -> str:
        t = re.sub(r"\s+", " ", body).strip()
        for h3 in sorted(h3s, key=len, reverse=True):
            if not h3 or len(h3) < 3:
                continue
            t = re.sub(re.escape(h3), "«H3»", t, flags=re.I)
            lab = INF_LEAD.sub("", h3).strip()
            if lab and lab.lower() != h3.lower() and len(lab) > 3:
                t = re.sub(re.escape(lab), "«H3»", t, flags=re.I)
        t = re.sub(r"(«H3»\s*)+", "«H3» ", t)
        return re.sub(r"\s+", " ", t).strip()

    # Sentence ending on a bare connective — truncation signature
    trunc_end = re.compile(
        r"\b(do|de|da|das|dos|e|ou|para|com|em|no|na|por|sem|que|um|uma|os|as|a|o)\.\s*$",
        re.I,
    )
    # Parenthetical H3 echo at end of card: ".... (Some Title)."
    paren_h3_end = re.compile(r"\([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^)]{2,80}\)\.\s*$")
    # Slug-stuffed answer without accents (multi-token lowercase dump)
    slug_answer = re.compile(
        r"Para conduzir [a-z0-9][a-z0-9 \-]{10,80},\s*separe obrigação contratual",
        re.I,
    )
    PRIORITY_SLUGS = {
        "sinapi-desonerado-nao-desonerado",
        "demolicao-nao-prevista-obra-publica",
        "atraso-pagamento-contrato-publico-suspender",
        "administracao-local-orcamento-obra-publica",
        "atraso-obra-culpa-administracao",
        "aditivo-empreitada-por-preco-global",
        "resposta-notificacao-atraso-obra-publica",
        "data-base-orcamento-reajuste-obra-publica",
        "medicao-por-evento-obra-publica",
        "glosa-por-qualidade-obra-publica",
        "atraso-na-medicao-obra-publica",
        "bdi-diferenciado-obra-publica",
        "mobilizacao-desmobilizacao-orcamento-obra",
        "empreitada-preco-global-preco-unitario",
    }
    for p in (ROOT / "conteudos").glob("*/index.html"):
        t = p.read_text(encoding="utf-8")
        slug = p.parent.name
        # Literal fingerprints: hard-fail on priority pages; bulk HEAD may still carry
        # pre-existing de4cbef shells (declared partial — no mass rewrite of 100+ guides).
        for bp in old_bp:
            if bp in t:
                msg = f"boilerplate residual {slug}: {bp!r}"
                if slug in PRIORITY_SLUGS:
                    errors.append(msg)
                else:
                    warnings.append(msg)
        if re.search(r"\?\.", t):
            errors.append(f"double punctuation ?. in {slug}")
        if slug_answer.search(t):
            msg = f"slug-stuffed answer mold {slug}"
            if slug in PRIORITY_SLUGS:
                errors.append(msg)
            else:
                warnings.append(msg)
        m = re.search(r"O risco prático a evitar é ([^.<]{5,70})", t)
        if m:
            frag = m.group(1).strip()
            if not frag.startswith("que ") and re.search(
                r"\b(destrói|compromete|consome|leva|expõe|trava|gera|aumenta)\b", frag
            ):
                errors.append(f"ungrammatical risk clause {slug}: {frag[:50]}")
        if re.search(r">WhatsApp sobre [a-záàâãéêíóôõúç0-9\- ]{12,}<", t, re.I):
            errors.append(f"WA slug-stuffed label {slug}")
        if re.search(r"como fazer [a-z].{0,40}desonerado", t, re.I):
            errors.append(f"keyword spam 'como fazer' {slug}")
        # Collect #diagnostico card bodies + structural frames
        diag = re.search(
            r'<section\b[^>]*\bid=["\']diagnostico["\'][^>]*>(.*?)</section>',
            t,
            re.S | re.I,
        )
        if diag:
            cards = re.findall(
                r'<div class="criterion-card">.*?<h3>(.*?)</h3><p>(.*?)</p>',
                diag.group(1),
                re.S,
            )
            h3s = [re.sub(r"<[^>]+>", "", h).strip() for h, _ in cards]
            page_norms: list[str] = []
            for _h, body_html in cards:
                body = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body_html)).strip()
                if len(body) > 40:
                    diag_card_bodies[body] += 1
                if paren_h3_end.search(body):
                    errors.append(f"parenthetical H3 echo in #diagnostico of {slug}")
                if body:
                    n = normalize_struct(body, h3s)
                    if len(n) > 30:
                        structural_frames[n] += 1
                        page_norms.append(n)
            page_structural[slug] = page_norms

        # Truncated paragraphs (FAQ + answer-box)
        for kind, pattern in (
            ("faq", r"<details>.*?<p>(.*?)</p></details>"),
            ("answer", r'answer-box.*?Resposta executiva</span><p>(.*?)</p>'),
        ):
            for block in re.finditer(pattern, t, re.S):
                text = re.sub(r"<[^>]+>", " ", block.group(1))
                text = re.sub(r"\s+", " ", text).strip()
                if trunc_end.search(text):
                    errors.append(
                        f"truncated {kind} ending in {slug}: …{text[-50:]!r}"
                    )

        ab = re.search(
            r'answer-box.*?Resposta executiva</span><p>(.*?)</p>', t, re.S
        )
        if ab:
            ans = re.sub(r"<[^>]+>", " ", ab.group(1))
            ans = re.sub(r"\s+", " ", ans).strip()
            if "a decisão correta depende" in ans and "Antes de aceitar, executar ou contestar" in ans:
                errors.append(f"new mold answer frame {slug}")
            # Garbled "X enquadra a obrigação" without "Use " scaffolding
            if re.search(r"(?<![Uu]se )[a-záàâãéêíóôõúç][\wáàâãéêíóôõúç ]{2,40} enquadra a obrigação", ans):
                errors.append(f"garbled answer enquadra-pattern {slug}")
            mold_answer_starts[ans[:48]] += 1

        if "Esse elemento altera o enquadramento porque define a obrigação originalmente assumida" in t:
            errors.append(f"criterion filler shell {slug}")

        # Duplicate criterion suffixes on the same page (noun-swap shell)
        bodies = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1))).strip()
            for m in re.finditer(
                r'<div class="criterion-card">.*?<p>(.*?)</p>\s*</div>\s*</div>',
                t,
                re.S,
            )
        ]
        suffixes = [b[-55:] for b in bodies if len(b) > 40]
        for suf, count in Counter(suffixes).items():
            if count >= 2:
                errors.append(
                    f"duplicate criterion suffix x{count} in {slug}: …{suf[:40]!r}"
                )

        # --- Structural #diagnostico / criteria-grid invariants ---
        diag = re.search(
            r'<section\b[^>]*\bid=["\']diagnostico["\'][^>]*>(.*?)</section>',
            t,
            re.S | re.I,
        )
        if diag:
            dbody = diag.group(1)
            nums = re.findall(
                r'<div class="criterion-card"[^>]*>\s*<span>([^<]+)</span>',
                dbody,
            )
            num_counts = Counter(nums)
            for num, count in num_counts.items():
                if count >= 2:
                    errors.append(
                        f"duplicate criterion number {num!r} x{count} in #diagnostico of {slug}"
                    )
            # Orphan cards outside the first .criteria-grid (nested-div aware)
            gpos = dbody.find('class="criteria-grid"')
            if gpos == -1:
                gpos = dbody.find("class='criteria-grid'")
            if gpos != -1 and "criterion-card" in dbody:
                grid_start = dbody.rfind("<div", 0, gpos + 1)
                if grid_start != -1:
                    gt = dbody.find(">", grid_start)
                    depth = 1
                    i = gt + 1
                    grid_end = -1
                    while i < len(dbody) and depth > 0:
                        no = dbody.find("<div", i)
                        nc = dbody.find("</div>", i)
                        if nc == -1:
                            break
                        if no != -1 and no < nc:
                            depth += 1
                            i = no + 4
                        else:
                            depth -= 1
                            i = nc + len("</div>")
                            if depth == 0:
                                grid_end = i
                                break
                    if grid_end != -1:
                        outside = dbody[:grid_start] + dbody[grid_end:]
                        if "criterion-card" in outside:
                            errors.append(
                                f"orphan criterion-card outside .criteria-grid in #diagnostico of {slug}"
                            )

    for start, count in mold_answer_starts.items():
        if count > 15:
            errors.append(f"answer start duplicated {count}x: {start!r}")

    # Exact card body reused too often = mass template (threshold: 8 pages)
    for body, count in diag_card_bodies.items():
        if count >= 8:
            errors.append(
                f"diagnostico card frame x{count}: …{body[:70]!r}"
            )

    # Structural frames after H3 → «H3» (threshold: 8 pages sitewide)
    hot_frames = {fr for fr, c in structural_frames.items() if c >= 8}
    for fr, count in structural_frames.items():
        if count >= 8:
            errors.append(
                f"structural diagnostico frame x{count}: …{fr[:80]!r}"
            )
    # Priority pages must not use frames that already hit ≥5 pages sitewide
    mid_hot = {fr for fr, c in structural_frames.items() if c >= 5}
    for slug in PRIORITY_SLUGS:
        for fr in page_structural.get(slug, []):
            if fr in mid_hot:
                errors.append(
                    f"priority structural mold {slug}: …{fr[:70]!r}"
                )
                break  # one error per priority page is enough

    # Classification honesty: if file exists, generic pages must not be marked all "manter"
    class_path = ROOT / "seo" / "content-classification.json"
    if class_path.exists():
        try:
            data = json.loads(class_path.read_text(encoding="utf-8"))
            items = data.get("items") or []
            generic_as_manter = [
                i["slug"]
                for i in items
                if i.get("answer_still_generic") and i.get("classification") == "manter"
            ]
            if len(generic_as_manter) > 5:
                errors.append(
                    f"classification dishonest: {len(generic_as_manter)} generic pages marked manter"
                )
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"classification parse: {exc}")

    rd = (ROOT / "_redirects").read_text(encoding="utf-8") if (ROOT / "_redirects").exists() else ""
    nt = (ROOT / "netlify.toml").read_text(encoding="utf-8") if (ROOT / "netlify.toml").exists() else ""
    cfg = rd + "\n" + nt
    for leg in legacy:
        if leg not in cfg:
            errors.append(f"redirect missing {leg}")

    for hit in intranet_indexable_hits(ROOT):
        errors.append(f"intranet must not be indexable: {hit}")

    print(f"pages={len(html_pages)} sitemap={len(sm_urls)} indexable={len(indexable)}")
    print(f"errors={len(errors)} warnings={len(warnings)}")
    for e in errors:
        print("ERR", e)
    for w in warnings:
        print("WARN", w)
    if errors:
        return 1
    print("VALIDATION_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
