"""Internal knowledge graph: edges only to useful existing public assets.

A graph node never becomes a public URL. Orphan and cannibalization stay
internal signals — they do not mint pages.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.contract_analysis import FAMILY_PATH

# Topic → existing useful surfaces. Paths must already exist as public pages.
TOPIC_ASSETS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("bdi", "preco_bdi", "preco", "preço"), "/ferramentas/diagnostico-defesa-margem/", "Diagnóstico de Defesa de Margem"),
    (("bdi", "sinapi", "sicro"), "/inteligencia/cenarios/referencia-sinapi-sicro-margem/", "Referência SINAPI/SICRO e margem"),
    (("reajuste", "reequilibrio", "reequilíbrio", "reajuste_reequilibrio"), "/lei-14133-obras/reequilibrio-reajuste-repactuacao/", "Reajuste, reequilíbrio e repactuação"),
    (("reajuste", "reequilibrio"), "/guias-contratos-obras/documentos-pedido-reequilibrio/", "Documentos do pedido de reequilíbrio"),
    (("aditivo", "aditivos_valor", "acréscimo", "acrescimo"), "/lei-14133-obras/limite-25-50-aditivo-obra/", "Limite de acréscimos e supressões"),
    (("aditivo", "art. 125", "art 125"), "/lei-14133-obras/art-124-alteracao-contratual-obra/", "Alteração contratual (art. 124)"),
    (("aditivo",), "/ferramentas/limite-acrescimos-supressoes/", "Calculadora de limite de aditivos"),
    (("prazo", "atraso"), "/lei-14133-obras/atraso-imputavel-administracao/", "Atraso imputável à Administração"),
    (("prazo", "atraso"), "/ferramentas/matriz-atraso-obra/", "Matriz de atraso de obra"),
    (("comparavel", "comparável", "preco"), "/inteligencia/precos/", "Inteligência de preços"),
    (("exceptional", "radar"), "/radar/nacional-obras-publicas/", "Radar nacional de obras públicas"),
)

HUB = (FAMILY_PATH, "Análises técnicas de contratos públicos")
CORRECTION = ("/correcoes/", "Como corrigir ou contestar")


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def public_path_exists(href: str, *, root: Path | None = None) -> bool:
    rel = href.strip("/")
    if not rel:
        return True
    base = root or _root()
    return (base / rel / "index.html").is_file() or (base / f"{rel}.html").is_file()


def _tokens(record: dict[str, Any]) -> set[str]:
    bits = [
        str(record.get("intent") or ""),
        str(record.get("angle") or ""),
        str(record.get("job") or ""),
        str(record.get("title") or ""),
    ]
    blob = " ".join(bits).lower()
    return {tok for tok in blob.replace("_", " ").replace("-", " ").split() if tok}


def related_assets(record: dict[str, Any], *, root: Path | None = None) -> list[dict[str, str]]:
    """Return existing useful assets. Missing files are omitted, not minted."""
    tokens = _tokens(record)
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for keys, href, label in TOPIC_ASSETS:
        if not any(key in tokens or key in " ".join(tokens) for key in keys):
            # also match angle exactly
            angle = str(record.get("angle") or record.get("intent") or "")
            if angle not in keys and angle.replace("_", " ") not in keys:
                continue
        if href in seen:
            continue
        if not public_path_exists(href, root=root):
            continue
        seen.add(href)
        out.append({"kind": "existing_asset", "href": href, "label": label})
    for href, label in (HUB, CORRECTION):
        if href not in seen and public_path_exists(href, root=root):
            out.append({"kind": "existing_asset", "href": href, "label": label})
            seen.add(href)
    return out


def graph_nodes(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Internal nodes. `public_url` is set only when an existing asset matches."""
    ficha = record.get("ficha") if isinstance(record.get("ficha"), dict) else {}
    nodes = []
    for kind, value in (
        ("contract", ficha.get("pncp_id") or (record.get("canonical_contract_ids") or [None])[0]),
        ("company", ficha.get("empresa")),
        ("buyer", ficha.get("orgao")),
        ("geography", ficha.get("municipio") or ficha.get("uf")),
        ("work_type", ficha.get("objeto")),
        ("topic", record.get("angle") or record.get("intent")),
    ):
        if not value:
            continue
        nodes.append(
            {
                "kind": kind,
                "value": str(value),
                "public_url": None,
                "internal_only": True,
            }
        )
    return nodes


def detect_orphans(record: dict[str, Any], *, root: Path | None = None) -> list[str]:
    """Nodes that have no useful existing public asset. Not a reason to mint a URL."""
    assets = related_assets(record, root=root)
    useful = [a for a in assets if a.get("href") not in {FAMILY_PATH, "/correcoes/"}]
    if useful:
        return []
    return ["graph_orphan_no_existing_asset"]


def detect_cannibalization(
    record: dict[str, Any],
    cohort: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Same slug or same title across two analyses is cannibalization, not a new URL."""
    hits: list[str] = []
    slug = str(record.get("slug") or "")
    title = str(record.get("title") or "").strip().lower()
    rid = str(record.get("id") or "")
    for other in cohort or []:
        oid = str(other.get("id") or "")
        if other is record or (rid and oid and rid == oid):
            continue
        if slug and slug == str(other.get("slug") or ""):
            hits.append(f"cannibalization_slug:{oid or 'unknown'}")
        ot = str(other.get("title") or "").strip().lower()
        if title and ot and title == ot:
            hits.append(f"cannibalization_title:{oid or 'unknown'}")
    return hits


def public_urls_from_graph(record: dict[str, Any], *, root: Path | None = None) -> list[str]:
    """Graph-only nodes emit no URL. Only pre-existing assets do."""
    return [item["href"] for item in related_assets(record, root=root)]
