"""Write docs/campaigns/design-institucional/assets-manifest.json.

Lists the generated plates and the reused institutional assets with origin,
licence/permission as documented in the repo (or "não documentada"), veracity
class, intended page, editable source, exported version, sha256 and bytes,
plus the inventory of assets classified as inadequate for the pilot.

    python3 -m scripts.demonstrative.plates.build_manifest
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from scripts.demonstrative.plates import render_plates as R
from scripts.demonstrative.plates.sheet import PALETTE

ROOT = R.ROOT
OUT = ROOT / "docs/campaigns/design-institucional/assets-manifest.json"

PLATE_META = {
    "recorte-banheiro": {
        "code": "P1",
        "sources": ["data/demonstrative/private-project-pilot/source.v1.json", "data/demonstrative/private-project-pilot/consumption.v1.json"],
        "pages": ["/", "/quantitativos-orcamento-obras/", "/casos/demonstrativo-projeto-privado/"],
        "slot": "hero-sample (home), figure.qty-sample (quantitativos)",
    },
    "drenagem-perfil": {
        "code": "P2",
        "sources": ["data/demonstrative/infrastructure-pilot/source.v1.json", "data/demonstrative/infrastructure-pilot/consumption.v1.json"],
        "pages": ["/servicos/", "/casos/demonstrativo-infraestrutura/"],
        "slot": "índice de serviços (infraestrutura)",
    },
    "medicao-parede": {
        "code": "P3",
        "sources": ["data/demonstrative/plates/medicao-parede.v1.json"],
        "pages": ["/medicoes-glosas-obras-publicas/#exemplo-demonstrativo"],
        "slot": "seção «Mesma parede, quatro números» (HTML congelado: recaptura com motivo via frozen-specs)",
    },
    "avaliacao-estrutura": {
        "code": "P4",
        "sources": ["data/demonstrative/plates/avaliacao-estrutura.v1.json"],
        "pages": ["/servicos/#servico-avaliacao"],
        "slot": "seção de avaliação imobiliária",
    },
}

REUSED = [
    {
        "path": "assets/tiago-sasaki-foto-v11-sem-fundo-560.avif",
        "kind": "retrato",
        "origin": "Retrato do responsável técnico (Engº Tiago Sasaki); recorte «sem fundo» do master PNG; AVIF derivado do PNG (docs/campaigns/2026-09-08-comunicacao-publica-comercial.md). Commit inicial 2477b111b.",
        "license": "não documentada (direito de imagem/autor da foto sem arquivo de consentimento no repositório; é o responsável técnico da empresa)",
        "veracity": "real autorizada",
        "pages": ["/", "/especialista/tiago-jun-sasaki/"],
        "editable_source": "assets/tiago-sasaki-foto-v11-sem-fundo.png (1080x1350, master raster)",
        "exported_version": "v11 · 560x700",
    },
    {"path": "assets/tiago-sasaki-foto-v11-sem-fundo-560.webp", "kind": "retrato", "same_as": "assets/tiago-sasaki-foto-v11-sem-fundo-560.avif"},
    {"path": "assets/tiago-sasaki-foto-v11-sem-fundo-560.png", "kind": "retrato", "same_as": "assets/tiago-sasaki-foto-v11-sem-fundo-560.avif"},
    {
        "path": "assets/logo-confenge-500-f8a83f6d.png",
        "kind": "logotipo",
        "origin": "Derivado do master assets/logo-confenge.png por scripts/site/optimize_brand_logos.py (commit 94b4f04a0); contrato congelado em data/brand/logo-contract.v1.json (SHA-256, proporção 50:13, markup).",
        "license": "não documentada (tipografia da assinatura «INTELIGÊNCIA TÉCNICA» pendente do fundador no contrato de logo); marca própria da CONFENGE",
        "veracity": "real autorizada",
        "pages": ["cabeçalho de todo o site mutável"],
        "editable_source": "ausente (master vetorial BLOCKED_AWAITING_FOUNDER_ARTWORK; proibido traçar ou gerar SVG)",
        "exported_version": "500x130 · f8a83f6d",
    },
    {
        "path": "assets/logo-confenge-white-500-1677038e.png",
        "kind": "logotipo",
        "origin": "Idem, variante branca (rodapé).",
        "license": "idem",
        "veracity": "real autorizada",
        "pages": ["rodapé de todo o site mutável"],
        "editable_source": "ausente (ver logo-contract.v1.json)",
        "exported_version": "500x130 · 1677038e",
    },
    {
        "path": "assets/archivo-var-latin-b19be0f7.woff2",
        "kind": "fonte",
        "origin": "Archivo v2.001 (Omnibus-Type), subconjunto latino de 157 glifos gerado para o site; única fonte com licença verificada no repositório.",
        "license": "SIL Open Font License 1.1 (assets/archivo-OFL.txt)",
        "veracity": "contexto público",
        "pages": ["/ (assets/home-10x.css); as pranchas declaram font-family «Archivo Var, Arial, Helvetica, sans-serif»"],
        "editable_source": "https://github.com/Omnibus-Type/Archivo (fonte variável completa)",
        "exported_version": "b19be0f7 · latin subset, wdth 78-100",
    },
    {"path": "assets/archivo-OFL.txt", "kind": "licença", "same_as": "assets/archivo-var-latin-b19be0f7.woff2"},
]

INADEQUATE = [
    {
        "glob": "assets/clusters/*.jpg",
        "count": 8,
        "why": "Cartões-título rasterizados (título, categoria, logo, «15 GUIAS») do commit inicial, sem documento de origem; texto em raster não é prova legível e não passa a regra «ativo só com licença verificada». Continuam como og:image e <img> nas 6 BOFU congeladas, mas não entram na composição nova.",
    },
    {
        "glob": "assets/og-confenge.jpg",
        "count": 1,
        "why": "Retexturizado por «built-in image_gen» (data/site/commercial-media/source.json) sobre fundo fotográfico (grua/skyline) cuja licença não está documentada em lugar nenhum do repositório. Permanece só como og:image.",
    },
    {
        "glob": "assets/og-tiago-sasaki-v11.jpg",
        "count": 1,
        "why": "Mesmo pipeline image_gen; usar o retrato sem fundo (real autorizada) em vez do cartão.",
    },
    {
        "glob": "assets/og-conteudos.jpg",
        "count": 1,
        "why": "Commit inicial, origem não documentada, texto rasterizado.",
    },
    {
        "glob": "assets/conteudos/*.jpg",
        "count": 120,
        "why": "Capas de artigo rasterizadas (título repetido), retiradas do corpo por scripts/site/remove_redundant_article_covers.py; 2 retexturizadas por image_gen. Só og:image.",
    },
    {
        "glob": "assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/chart.svg",
        "count": 1,
        "why": "license NEEDS_REVIEW, indexable false, do_not_index true (data/data-desk/.../asset.v1.json): barrado de superfície indexável.",
    },
]

NOT_REUSED = [
    {
        "glob": "casos/*/assets/*.svg",
        "count": 9,
        "veracity": "demonstração",
        "why": "Fontes de verdade (geradas em repositório por scripts/demonstrative/*/render.py a partir de data/demonstrative/*/source.v1.json; provenance limpa). Não reutilizadas na composição nova só por estilo: paleta fora dos tokens (âmbar #f59e0b, vermelho #b91c1c, azul #0369a1) e sem carimbo. Permanecem intactas em /casos/.",
    },
]


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _lot_registers() -> dict[str, dict]:
    """Plates declared by the expansion lots (docs/campaigns/design-institucional/expansao/assets-lote-*.json)."""
    out: dict[str, dict] = {}
    for reg in sorted((ROOT / "docs/campaigns/design-institucional/expansao").glob("assets-lote-*.json")):
        doc = json.loads(reg.read_text(encoding="utf-8"))
        for item in doc.get("assets", []):
            pid = item.get("plate_id") or item.get("id")
            if not pid or item.get("kind", "prancha") != "prancha" and "plate_id" not in item:
                continue
            pid = pid.replace("-desktop", "").replace("-mobile", "")
            out.setdefault(pid, {"code": item.get("code") or item.get("sheet_code") or pid, "register": str(reg.relative_to(ROOT))})
    return out


def _pages_using(pid: str) -> list[str]:
    skip = {"_site", "docs", "node_modules", "build", "seo", ".git"}
    pages = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if rel.parts[0] in skip:
            continue
        if f"<!-- plate:{pid}" in path.read_text(encoding="utf-8", errors="ignore"):
            route = "/" + rel.as_posix().removesuffix("index.html")
            pages.append(route if route != "/index.html" else "/")
    return pages


def _meta(pid: str, registers: dict[str, dict]) -> dict:
    if pid in PLATE_META:
        return PLATE_META[pid]
    reg = registers.get(pid, {})
    return {
        "code": reg.get("code", pid),
        "sources": [str(R.SOURCES[key]) for key in R.PLATE_SOURCES.get(pid, ())],
        "pages": _pages_using(pid),
        "slot": "slot <!-- plate:" + pid + " --> (materializado por scripts/demonstrative/plates/inline.py); registro do lote em " + reg.get("register", "(sem registro)"),
    }


def build() -> dict:
    entries = []
    registers = _lot_registers()
    for name in sorted(R.render_all()):
        pid, variant = name[:-4].rsplit("-", 1)
        meta = _meta(pid, registers)
        path = R.OUT_DIR_REL / name
        entries.append({
            "path": str(path),
            "kind": "prancha",
            "code": f"{meta['code']}{'-M' if variant == 'mobile' else ''}",
            "variant": variant,
            "origin": "Gerada deterministicamente por scripts/demonstrative/plates/render_plates.py a partir dos JSON de origem; toda geometria e todo número vêm das fontes listadas.",
            "license": "obra própria da CONFENGE (dados demonstrativos, sem cliente, sem obra real)",
            "veracity": "demonstração",
            "pages": meta["pages"],
            "slot": meta["slot"],
            "editable_source": meta["sources"] + ["scripts/demonstrative/plates/render_plates.py", "scripts/demonstrative/plates/sheet.py"],
            "exported_version": "rev. " + ("R01" if pid in ("recorte-banheiro", "drenagem-perfil") else "R00"),
            "family_module": next((m.stem for m in (ROOT / "scripts/demonstrative/plates").glob("family_*.py") if f'"{pid}"' in m.read_text(encoding="utf-8")), "render_plates"),
            "evidence_png": f"docs/campaigns/design-institucional/evidence/pranchas/{pid}-{variant}-{1200 if variant == 'desktop' else 360}.png",
            "sha256": _sha(ROOT / path),
            "bytes": (ROOT / path).stat().st_size,
        })
    by_path = {e["path"]: e for e in REUSED}
    for item in REUSED:
        base = dict(by_path[item["same_as"]]) if "same_as" in item else dict(item)
        base.pop("same_as", None)
        base.update({k: v for k, v in item.items() if k != "same_as"})
        p = ROOT / item["path"]
        base["sha256"] = _sha(p)
        base["bytes"] = p.stat().st_size
        entries.append(base)
    inadequate = []
    for item in INADEQUATE:
        files = sorted(ROOT.glob(item["glob"]))
        inadequate.append({**item, "files_found": len(files), "bytes_total": sum(f.stat().st_size for f in files)})
    not_reused = []
    for item in NOT_REUSED:
        files = sorted(ROOT.glob(item["glob"]))
        not_reused.append({**item, "files_found": len(files), "bytes_total": sum(f.stat().st_size for f in files)})
    return {
        "schema": "confenge.design-assets-manifest/1.0",
        "campaign": "CONFENGE-SALTO-INSTITUCIONAL-01",
        "front": "B · materiais técnicos",
        "veracity_classes": ["real autorizada", "demonstração", "contexto público", "inadequada"],
        "palette": sorted(PALETTE),
        "regenerate": "python3 -m scripts.demonstrative.plates.render_plates && python3 -m scripts.demonstrative.plates.build_manifest",
        "check": "python3 -m scripts.demonstrative.plates.render_plates --check && python3 -m pytest scripts/demonstrative/plates -q",
        "assets": entries,
        "inadequate": inadequate,
        "not_reused": not_reused,
    }


def main() -> int:
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
