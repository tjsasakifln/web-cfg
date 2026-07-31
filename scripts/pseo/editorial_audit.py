#!/usr/bin/env python3
"""Editorial audit for pSEO pages — fails publishable pages on semantic/editorial defects.

Produces:
  seo/pseo-editorial-report.json
  seo/pseo-editorial-report.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

INTERNAL_SLUG_RE = re.compile(
    r"\b(manutencao-predial-engenharia|pavimentacao-infraestrutura-viaria|"
    r"edificacoes-publicas|climatizacao-instalacoes|saneamento-hidraulica|"
    r"comparison_group|object_pattern|archetype_id)\b",
    re.I,
)
SERVICE_PATH_RE = re.compile(r"Servi[cç]o\s+CONFENGE:\s*/[a-z0-9\-/]+/?", re.I)
INGESTION_NAME_RE = re.compile(r"\bMRS-PREFEITURA|\bMRS-[A-Z]", re.I)
ZERO_MONEY_RE = re.compile(r"R\$\s*0,00")
MID_WORD_CUT_RE = re.compile(r"[a-záàâãéêíóôõúç]{2,}\.\.\.$", re.I)
BARE_SLUG_PATH_RE = re.compile(r"(?<![\"\'>])(/[a-z0-9]+(?:-[a-z0-9]+)+/)")
UNACCENTED_TECH_RE = re.compile(
    r"\b(Piaui|paralelepipedo|manutencao predial|pavimentacao|edificacoes)\b"
)
PERIOD_DASH_RE = re.compile(r"per[ií]odo[^.<]{0,40}—\s*a\s*—", re.I)


@dataclass
class Issue:
    code: str
    severity: str  # P0 | P1 | P2
    message: str
    evidence: str = ""


@dataclass
class PageAudit:
    page_id: str
    url: str
    page_type: str
    status: str
    human_review: str
    decision: str  # pass | fail_publish | fail_soft
    issues: list[Issue] = field(default_factory=list)
    sample: dict[str, Any] = field(default_factory=dict)
    independence: dict[str, Any] = field(default_factory=dict)
    duplication: dict[str, Any] = field(default_factory=dict)
    sources_checked: list[str] = field(default_factory=list)
    copy_quality: dict[str, Any] = field(default_factory=dict)
    cannibalization: dict[str, Any] = field(default_factory=dict)
    cta: dict[str, Any] = field(default_factory=dict)
    approval_recommendation: str = "keep_noindex"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = False
        self.title = ""
        self.meta_desc = ""
        self.robots = ""
        self.in_title = False
        self.table_rows: list[str] = []
        self._in_td = False
        self._td_buf = ""
        self._row_cells: list[str] = []

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        if tag in {"script", "style"}:
            self._skip = True
        if tag == "title":
            self.in_title = True
        if tag == "meta":
            name = (ad.get("name") or ad.get("property") or "").lower()
            if name in {"description", "og:description"}:
                self.meta_desc = ad.get("content") or self.meta_desc
            if name == "robots":
                self.robots = ad.get("content") or ""
        if tag == "tr":
            self._row_cells = []
        if tag in {"td", "th"}:
            self._in_td = True
            self._td_buf = ""

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self._skip = False
        if tag == "title":
            self.in_title = False
        if tag in {"td", "th"}:
            self._in_td = False
            self._row_cells.append(self._td_buf.strip())
        if tag == "tr" and self._row_cells:
            self.table_rows.append(" | ".join(self._row_cells))

    def handle_data(self, data):
        if self._skip:
            return
        if self.in_title:
            self.title += data
        if self._in_td:
            self._td_buf += data
        self.parts.append(data)

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()


def _extract(html: str) -> _TextExtractor:
    p = _TextExtractor()
    try:
        p.feed(html)
    except Exception:
        pass
    return p


def audit_page(reg: dict[str, Any], html_path: Path | None) -> PageAudit:
    pid = reg.get("page_id") or ""
    url = reg.get("url") or ""
    ptype = reg.get("page_type") or ""
    status = reg.get("status") or ""
    hr = reg.get("human_review") or "PENDING"
    issues: list[Issue] = []

    html = ""
    text = ""
    meta_desc = ""
    title = reg.get("title") or ""
    if html_path and html_path.exists():
        html = html_path.read_text(encoding="utf-8", errors="replace")
        ext = _extract(html)
        text = ext.text
        meta_desc = ext.meta_desc or ""
        title = ext.title or title
        table_rows = ext.table_rows
    else:
        table_rows = []
        text = " ".join(
            str(x)
            for x in (
                reg.get("title"),
                reg.get("h1"),
                reg.get("description"),
                reg.get("body_text"),
            )
            if x
        )
        meta_desc = reg.get("description") or ""

    visible = f"{title} {reg.get('h1') or ''} {meta_desc} {text}"

    # Internal taxonomy / slugs
    for m in INTERNAL_SLUG_RE.finditer(visible):
        issues.append(Issue("internal_slug_visible", "P0", "Slug/taxonomia interna no texto", m.group(0)))
        break
    if SERVICE_PATH_RE.search(visible):
        issues.append(Issue("service_path_as_text", "P0", "Caminho de serviço exibido como texto", SERVICE_PATH_RE.search(visible).group(0)))
    if INGESTION_NAME_RE.search(visible):
        issues.append(Issue("ingestion_prefix_name", "P0", "Nome de órgão com prefixo de ingestão", INGESTION_NAME_RE.search(visible).group(0)))
    if BARE_SLUG_PATH_RE.search(visible) and "http" not in (BARE_SLUG_PATH_RE.search(visible).group(0)):
        # allow breadcrumb-like only if not raw service path
        hit = BARE_SLUG_PATH_RE.search(visible).group(0)
        if re.search(r"/(auditoria|diagnostico|aditivos|medicoes|reequilibrio|acompanhamento)-", hit):
            issues.append(Issue("service_path_visible", "P0", "Caminho de serviço no conteúdo", hit))

    # Meta description quality
    if meta_desc:
        if MID_WORD_CUT_RE.search(meta_desc.strip()) or meta_desc.rstrip().endswith((" e", " de", " da", " do", " em", " com", " para")):
            issues.append(Issue("meta_desc_truncated", "P0", "Meta description truncada no meio da frase/palavra", meta_desc[-40:]))
        if len(meta_desc) > 0 and meta_desc[-1] not in ".!?…" and len(meta_desc) >= 140:
            # long desc without sentence end may be hard-cut
            if not meta_desc.rstrip().endswith((".", "!", "?")):
                issues.append(Issue("meta_desc_incomplete", "P1", "Meta description sem frase completa", meta_desc[-50:]))

    if ZERO_MONEY_RE.search(text) and ptype == "radar":
        issues.append(Issue("zero_for_missing_value", "P0", "R$ 0,00 usado (possível valor ausente)", "R$ 0,00"))

    # Duplicates in tables
    if table_rows:
        c = Counter(table_rows)
        dups = [r for r, n in c.items() if n > 1 and len(r) > 20]
        if dups:
            issues.append(Issue("table_duplicates", "P0", f"Linhas duplicadas na tabela ({len(dups)})", dups[0][:120]))

    # Concentration / independence from registry data_ref if present
    # (build embeds reasons; registry has observation_count)
    reasons = reg.get("reasons") or reg.get("mandatory_fail") or []
    for r in reasons:
        rs = str(r)
        if "max_buyer_share" in rs or "max_single_day" in rs or "suppliers<3" in rs or "buyers<3" in rs:
            issues.append(Issue("sample_concentration", "P0", f"Amostra concentrada/insuficiente: {rs}", rs))
        if "contract_url" in rs or "duplicate_rate" in rs:
            issues.append(Issue("data_quality_gate", "P0", rs, rs))
        if "no_claim_specific" in rs or "no_direct_" in rs:
            issues.append(Issue("claim_without_evidence", "P0", rs, rs))

    # Price language
    if ptype == "price":
        blob = f"{title} {reg.get('h1') or ''} {meta_desc}".lower()
        if re.search(r"\bpre[cç]o\s+por\s+m|\bpre[cç]o\s+unit|\bpre[cç]o\s+de\s+refer[eê]ncia\b", blob):
            issues.append(Issue("unit_price_promise", "P0", "Título/copy promete preço unitário sobre ticket contratual", blob[:80]))
        if "benchmark" in blob and "faixa" not in blob:
            issues.append(Issue("benchmark_overclaim", "P1", "Usa 'benchmark' sem provar diversidade amostral", "benchmark"))

    if ptype == "agency" and re.search(r"sazonalidade", text, re.I):
        if "insuficiente" not in text.lower() and "não publicada" not in text.lower():
            # check period
            if "um único" in text.lower() or "mesmo dia" in text.lower():
                issues.append(Issue("seasonality_insufficient", "P0", "Sazonalidade com base temporal fraca", "sazonalidade"))

    if UNACCENTED_TECH_RE.search(visible):
        issues.append(Issue("missing_accents", "P1", "Termo técnico sem acentuação editorial", UNACCENTED_TECH_RE.search(visible).group(0)))

    if PERIOD_DASH_RE.search(text) or "— a —" in text or "— a —" in html:
        issues.append(Issue("empty_period", "P0", "Metodologia com período — a —", "— a —"))

    # Dataset JSON-LD
    if '"@type": "Dataset"' in html or '"@type":"Dataset"' in html:
        for req in ("description", "creator", "identifier", "temporalCoverage", "variableMeasured"):
            if req not in html:
                issues.append(Issue("dataset_missing_prop", "P1", f"Dataset JSON-LD sem {req}", req))

    # Contract link as opportunity
    if ptype == "radar" and "/app/contratos/" in html:
        issues.append(Issue("contract_link_as_opportunity", "P0", "Link de contrato em radar", "/app/contratos/"))

    # Approved with open P0/P1
    p0 = [i for i in issues if i.severity == "P0"]
    p1 = [i for i in issues if i.severity == "P1"]
    if status == "publish" and (p0 or p1):
        issues.append(Issue("approved_with_open_editorial", "P0", "Página publish com P0/P1 editorial aberto", f"p0={len(p0)} p1={len(p1)}"))

    # Decision
    blocking = [i for i in issues if i.severity in {"P0", "P1"}]
    if status == "publish" and blocking:
        decision = "fail_publish"
        rec = "revoke_or_fix"
    elif blocking and status != "reject":
        decision = "fail_soft"
        rec = "keep_noindex"
    else:
        decision = "pass"
        rec = "eligible_for_human_review" if status in {"noindex", "publish"} and not blocking else "reject_or_noindex"

    return PageAudit(
        page_id=pid,
        url=url,
        page_type=ptype,
        status=status,
        human_review=hr,
        decision=decision,
        issues=issues,
        sample={"observation_count": reg.get("observation_count")},
        independence={},
        duplication={},
        sources_checked=list(reg.get("sources") or []),
        copy_quality={"title_len": len(title), "meta_desc_len": len(meta_desc)},
        cannibalization={},
        cta={"label": reg.get("cta_label"), "intent": reg.get("cta_intent")},
        approval_recommendation=rec,
    )


def run_editorial_audit(*, root: Path | None = None) -> dict[str, Any]:
    root = root or ROOT
    reg_path = root / "data" / "pseo" / "registry.json"
    if not reg_path.exists():
        return {"ok": False, "errors": ["registry.json missing — run pseo:build first"]}
    registry = json.loads(reg_path.read_text(encoding="utf-8"))
    pages = registry.get("pages") or []
    results: list[PageAudit] = []
    for p in pages:
        url = (p.get("url") or "").strip("/")
        html_path = root / url / "index.html" if url else None
        results.append(audit_page(p, html_path))

    # Cross-page generic block detection for problem pages
    problem_bodies: dict[str, str] = {}
    for r in results:
        if r.page_type == "problem_service":
            path = root / r.url.strip("/") / "index.html"
            if path.exists():
                problem_bodies[r.page_id] = _extract(path.read_text(encoding="utf-8", errors="replace")).text
    ids = list(problem_bodies.keys())
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            ta, tb = problem_bodies[a], problem_bodies[b]
            # simple overlap of long sentences
            sa = {s.strip() for s in re.split(r"[.!?]", ta) if len(s.strip()) > 80}
            sb = {s.strip() for s in re.split(r"[.!?]", tb) if len(s.strip()) > 80}
            overlap = sa & sb
            if len(overlap) >= 2:
                for r in results:
                    if r.page_id in {a, b}:
                        r.issues.append(
                            Issue("generic_repeated_blocks", "P0", f"Blocos genéricos repetidos com {a if r.page_id==b else b}", next(iter(overlap))[:100])
                        )
                        r.decision = "fail_soft" if r.status != "publish" else "fail_publish"
                        r.approval_recommendation = "keep_noindex"

    publish_fails = [r for r in results if r.status == "publish" and r.decision == "fail_publish"]
    p0_count = sum(1 for r in results for i in r.issues if i.severity == "P0")
    ok = len(publish_fails) == 0

    report = {
        "ok": ok,
        "generated_from": str(reg_path.relative_to(root)),
        "page_count": len(results),
        "publish_fail_count": len(publish_fails),
        "p0_issue_count": p0_count,
        "pages": [
            {
                **{k: v for k, v in asdict(r).items() if k != "issues"},
                "issues": [asdict(i) for i in r.issues],
            }
            for r in results
        ],
    }

    out_json = root / "seo" / "pseo-editorial-report.json"
    out_md = root / "seo" / "pseo-editorial-report.md"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# pSEO Editorial Audit",
        "",
        f"- ok: **{ok}**",
        f"- pages: {len(results)}",
        f"- publish fails: {len(publish_fails)}",
        f"- P0 issues: {p0_count}",
        "",
        "| page_id | status | decision | P0 | P1 | recommendation |",
        "|---|---|---|---:|---:|---|",
    ]
    for r in results:
        p0 = sum(1 for i in r.issues if i.severity == "P0")
        p1 = sum(1 for i in r.issues if i.severity == "P1")
        lines.append(f"| `{r.page_id}` | {r.status} | {r.decision} | {p0} | {p1} | {r.approval_recommendation} |")
    lines.append("")
    for r in results:
        if not r.issues:
            continue
        lines.append(f"## {r.page_id}")
        for i in r.issues:
            lines.append(f"- **{i.severity}** `{i.code}`: {i.message}")
        lines.append("")
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="pSEO editorial audit")
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args(argv)
    report = run_editorial_audit()
    print(json.dumps({"ok": report.get("ok"), "publish_fail_count": report.get("publish_fail_count"), "p0_issue_count": report.get("p0_issue_count"), "page_count": report.get("page_count")}, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
