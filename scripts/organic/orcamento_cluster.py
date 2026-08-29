"""Shipped-HTML helpers for the orçamento/BDI/SINAPI/exequibilidade cluster.

Loads real `conteudos/<slug>/index.html` files. Does not reimplement pages.
"""

from __future__ import annotations

import ast
import html as html_lib
import json
import os
import re
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_PATH = ROOT / "data" / "organic" / "orcamento-cluster-inventory.json"

CLUSTER_SLUGS = (
    "administracao-local-orcamento-obra-publica",
    "bdi-diferenciado-obra-publica",
    "comprovacao-exequibilidade-proposta-obra",
    "data-base-orcamento-reajuste-obra-publica",
    "empreitada-preco-global-preco-unitario",
    "matriz-de-riscos-reequilibrio-economico-financeiro",
    "mobilizacao-desmobilizacao-orcamento-obra",
    "sinapi-desonerado-nao-desonerado",
    "sinapi-ou-sicro-obra-publica",
)

CONCEPT_MARKERS = {
    "orcamento_de_referencia": (
        "orçamento de referência",
        "orcamento de referencia",
    ),
    "proposta": ("proposta",),
    "execucao": ("execução", "execucao"),
    "reajuste": ("reajuste",),
    "reequilibrio": ("reequilíbrio", "reequilibrio"),
    "exequibilidade": ("exequibilidade",),
}

_SAFE_FUNCS = {"max": max, "min": min, "abs": abs}
_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def load_inventory(path: Path | None = None) -> dict[str, Any]:
    target = path or INVENTORY_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def page_path(slug: str) -> Path:
    return ROOT / "conteudos" / slug / "index.html"


def read_shipped_html(slug: str) -> str:
    path = page_path(slug)
    return path.read_text(encoding="utf-8")


def _strip_tags(blob: str) -> str:
    blob = re.sub(r"<script\b[^>]*>.*?</script>", " ", blob, flags=re.I | re.S)
    blob = re.sub(r"<style\b[^>]*>.*?</style>", " ", blob, flags=re.I | re.S)
    blob = re.sub(r"<svg\b[^>]*>.*?</svg>", " ", blob, flags=re.I | re.S)
    blob = re.sub(r"<[^>]+>", " ", blob)
    return html_lib.unescape(blob)


def strip_shell(html: str) -> str:
    """Keep article body; drop header/nav/footer/svg/aside chrome and shared boxes."""
    work = html
    for pattern in (
        r"<script\b[^>]*>.*?</script>",
        r"<style\b[^>]*>.*?</style>",
        r"<svg\b[^>]*>.*?</svg>",
        r"<header\b[^>]*>.*?</header>",
        r"<footer\b[^>]*>.*?</footer>",
        r"<nav\b[^>]*>.*?</nav>",
        r"<aside\b[^>]*>.*?</aside>",
        r'<section\b[^>]*class="[^"]*author-box[^"]*"[^>]*>.*?</section>',
        r'<section\b[^>]*class="[^"]*lead-inline[^"]*"[^>]*>.*?</section>',
        r'<section\b[^>]*class="[^"]*article-decision[^"]*"[^>]*>.*?</section>',
        r'<section\b[^>]*class="[^"]*related-section[^"]*"[^>]*>.*?</section>',
        r'<p\b[^>]*class="[^"]*technical-note[^"]*"[^>]*>.*?</p>',
        r'<p\b[^>]*class="[^"]*sources-reviewed[^"]*"[^>]*>.*?</p>',
        r"<!-- organic-breakout-chassis:.*?<!-- /organic-breakout-chassis -->",
        r"<!-- organic-breakout-js -->.*?<!-- /organic-breakout-js -->",
    ):
        work = re.sub(pattern, " ", work, flags=re.I | re.S)
    article = re.search(r"<article\b[^>]*>.*?</article>", work, flags=re.I | re.S)
    main = re.search(r"<main\b[^>]*>.*?</main>", work, flags=re.I | re.S)
    body = article.group(0) if article else (main.group(0) if main else work)
    return _strip_tags(body)


def normalize_literal(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text or "")
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = folded.lower()
    folded = re.sub(r"[^a-z0-9]+", " ", folded)
    return re.sub(r"\s+", " ", folded).strip()


def pairwise_similarity(a: str, b: str) -> float:
    na, nb = normalize_literal(a), normalize_literal(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def similarity_matrix(slugs: tuple[str, ...] | None = None) -> dict[str, Any]:
    names = slugs or CLUSTER_SLUGS
    bodies = {slug: strip_shell(read_shipped_html(slug)) for slug in names}
    pairs: list[dict[str, Any]] = []
    worst = 0.0
    worst_pair = None
    for i, left in enumerate(names):
        for right in names[i + 1 :]:
            score = pairwise_similarity(bodies[left], bodies[right])
            rec = {
                "a": left,
                "b": right,
                "similarity": round(score, 6),
                "a_chars": len(bodies[left]),
                "b_chars": len(bodies[right]),
            }
            pairs.append(rec)
            if score > worst:
                worst = score
                worst_pair = (left, right)
    return {
        "schema": "orcamento-cluster-similarity/1.0",
        "threshold": 0.15,
        "pair_count": len(pairs),
        "worst": round(worst, 6),
        "worst_pair": worst_pair,
        "pairs": pairs,
    }


def _attr(tag: str, name: str) -> str:
    m = re.search(
        rf"""\b{name}\s*=\s*(['"])(.*?)\1""",
        tag,
        flags=re.I | re.S,
    )
    return m.group(2).strip() if m else ""


def extract_example(html: str) -> dict[str, Any]:
    block = re.search(
        r'<section\b[^>]*id=["\']exemplo-calculo["\'][^>]*>.*?</section>',
        html,
        flags=re.I | re.S,
    )
    if not block:
        raise ValueError("worked example section #exemplo-calculo missing")
    open_tag = re.match(r"<section\b[^>]*>", block.group(0), flags=re.I)
    if not open_tag:
        raise ValueError("worked example opening tag missing")
    tag = open_tag.group(0)
    inputs: dict[str, Decimal] = {}
    for m in re.finditer(
        r'<[^>]*\bdata-input=["\']([^"\']+)["\'][^>]*\bdata-value=["\']([^"\']+)["\'][^>]*>'
        r'|<[^>]*\bdata-value=["\']([^"\']+)["\'][^>]*\bdata-input=["\']([^"\']+)["\'][^>]*>',
        block.group(0),
        flags=re.I,
    ):
        key = m.group(1) or m.group(4)
        raw = m.group(2) or m.group(3)
        inputs[key] = Decimal(raw.replace(",", "."))
    result_raw = _attr(tag, "data-result")
    if result_raw == "":
        raise ValueError("data-result missing")
    return {
        "id": _attr(tag, "data-example-id"),
        "formula": _attr(tag, "data-formula"),
        "unit": _attr(tag, "data-unit"),
        "result": Decimal(result_raw.replace(",", ".")),
        "fonte_url": _attr(tag, "data-fonte-url"),
        "source_reference": _attr(tag, "data-source-reference"),
        "accessed_at": _attr(tag, "data-source-accessed-at"),
        "premise_kind": _attr(tag, "data-premise-kind"),
        "official_competence": _attr(tag, "data-official-competence"),
        "locality": _attr(tag, "data-locality"),
        "charges_basis": _attr(tag, "data-charges-basis"),
        "inputs": inputs,
        "html": block.group(0),
    }


class _FormulaGuard(ast.NodeVisitor):
    def visit(self, node: ast.AST) -> None:
        if isinstance(
            node,
            (
                ast.Expression,
                ast.BinOp,
                ast.UnaryOp,
                ast.Add,
                ast.Sub,
                ast.Mult,
                ast.Div,
                ast.Pow,
                ast.Mod,
                ast.USub,
                ast.UAdd,
                ast.Load,
                ast.Constant,
                ast.Name,
                ast.Call,
                ast.keyword,
            ),
        ):
            return super().visit(node)
        raise ValueError(f"disallowed formula node: {type(node).__name__}")

    def visit_Constant(self, node: ast.Constant) -> None:
        if type(node.value) is not int:
            raise ValueError("formula literals must be integers; decimal values belong in inputs")

    def visit_Call(self, node: ast.Call) -> None:
        if not isinstance(node.func, ast.Name) or node.func.id not in _SAFE_FUNCS:
            raise ValueError("disallowed function in formula")
        for arg in node.args:
            self.visit(arg)


def recompute_formula(formula: str, inputs: dict[str, Decimal]) -> Decimal:
    tree = ast.parse(formula, mode="eval")
    _FormulaGuard().visit(tree)
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    allowed = set(inputs) | set(_SAFE_FUNCS)
    unknown = names - allowed
    if unknown:
        raise ValueError(f"unknown names in formula: {sorted(unknown)}")
    for key in inputs:
        if not _NAME_RE.match(key):
            raise ValueError(f"illegal input name: {key}")
    compiled = compile(tree, "<formula>", "eval")
    value = eval(compiled, {"__builtins__": {}}, {**_SAFE_FUNCS, **inputs})  # noqa: S307
    return value if isinstance(value, Decimal) else Decimal(value)


def parse_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, flags=re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def parse_meta(html: str, name: str) -> str:
    m = re.search(
        rf'<meta[^>]*name=["\']{name}["\'][^>]*content=["\']([^"\']*)["\']'
        rf'|<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']{name}["\']',
        html,
        flags=re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").strip()


def parse_canonical(html: str) -> str:
    m = re.search(
        r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']'
        r'|href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']',
        html,
        flags=re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").strip()


def parse_h1(html: str) -> str:
    m = re.search(r"<h1\b[^>]*>(.*?)</h1>", html, flags=re.I | re.S)
    return re.sub(r"\s+", " ", _strip_tags(m.group(1))).strip() if m else ""


def jsonld_types(html: str) -> set[str]:
    found: set[str] = set()
    for block in re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        flags=re.I | re.S,
    ):
        try:
            payload = json.loads(block)
        except json.JSONDecodeError:
            continue
        stack = [payload]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                raw = cur.get("@type")
                if isinstance(raw, str):
                    found.add(raw)
                elif isinstance(raw, list):
                    found.update(str(item) for item in raw)
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)
    return found


def report_dir() -> Path | None:
    env = os.environ.get("ORCAMENTO_CLUSTER_REPORT_DIR")
    if env:
        path = Path(env)
        path.mkdir(parents=True, exist_ok=True)
        return path
    fallback = Path("/tmp/grok-goal-e729cc8c2618/implementer")
    if fallback.is_dir():
        return fallback
    return None


def dump_json(name: str, payload: Any) -> Path | None:
    dest = report_dir()
    if dest is None:
        return None
    path = dest / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
