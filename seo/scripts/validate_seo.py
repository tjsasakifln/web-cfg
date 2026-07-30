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
errors: list[str] = []
warnings: list[str] = []


def page_path(p: Path) -> str:
    if p.name == "index.html":
        if p.parent == ROOT:
            return "/"
        return "/" + str(p.parent.relative_to(ROOT)).replace("\\", "/") + "/"
    return "/" + str(p.relative_to(ROOT)).replace("\\", "/")


def main() -> int:
    html_pages = [
        p
        for p in ROOT.rglob("*.html")
        if not any(x in p.parts for x in [".git", "seo", ".playwright-mcp", "node_modules"])
    ]
    sm = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sm_urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if "sitemap.xml" not in robots.lower() and "Sitemap:" not in robots:
        errors.append("robots.txt missing Sitemap")

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
        if path in ("/404.html", "/obrigado.html"):
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
        if path in ("/404.html", "/obrigado.html"):
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
    ]
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
        "service_cta_click",
        "content_to_service_click",
        "internal_search",
        "qualified_scroll",
        "confengeTrack",
    ]:
        if ev not in js:
            errors.append(f"analytics missing {ev}")
    if "/@|" not in js and r"/@|" not in js:
        # PII email/phone filter must exist in shipped track()
        if "email" not in js or "\\d{8,}" not in js:
            errors.append("analytics PII filter missing")

    # Editorial anti-mold checks (old + new frames)
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
    )
    mold_answer_starts = Counter()
    # Sentence ending on a bare connective — truncation signature
    trunc_end = re.compile(
        r"\b(do|de|da|das|dos|e|ou|para|com|em|no|na|por|sem|que|um|uma|os|as|a|o)\.\s*$",
        re.I,
    )
    for p in (ROOT / "conteudos").glob("*/index.html"):
        t = p.read_text(encoding="utf-8")
        slug = p.parent.name
        for bp in old_bp:
            if bp in t:
                errors.append(f"boilerplate residual {slug}: {bp!r}")
        if re.search(r"\?\.", t):
            errors.append(f"double punctuation ?. in {slug}")
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

    nt = (ROOT / "netlify.toml").read_text(encoding="utf-8")
    for leg in legacy:
        if leg not in nt:
            errors.append(f"redirect missing {leg}")

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
