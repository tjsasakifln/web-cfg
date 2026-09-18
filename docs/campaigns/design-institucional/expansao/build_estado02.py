"""Atualiza docs/campaigns/design-institucional/estado.json com o estado da campanha 02.

Preserva integralmente o registro da campanha 01 (direção, piloto, revisões) e
acrescenta `campaign_02` com dimensões separadas — nunca um PASS único:
direção autorizada, implementação, revisão visual, revisão técnica, integração,
publicação, verificação pública, captura, pesquisa humana, resultado comercial.
Os valores vêm de `expansao/estado02-input.json` (preenchido pelo integrador com
evidência referenciada, não copiada) e da matriz de rotas gerada.

    python3 docs/campaigns/design-institucional/expansao/build_estado02.py
"""
from __future__ import annotations
import json, sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ESTADO = HERE.parent / "estado.json"
INPUT = HERE / "estado02-input.json"
MATRIZ = HERE / "matriz-rotas.json"
DIMENSIONS = [
    "authorized_direction", "implementation", "visual_review", "technical_review", "integration",
    "publication", "public_verification", "capture_proof", "human_research", "commercial_result",
]
FINAL_STATES = {"PRODUCAO_VERIFICADA", "PUBLICADO_VALIDACAO_PENDENTE", "PRODUCAO_REVERTIDA", "BLOQUEADO_EXTERNAMENTE", "EM_EXECUCAO"}


def main() -> int:
    estado = json.loads(ESTADO.read_text(encoding="utf-8"))
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    missing = [d for d in DIMENSIONS if d not in data]
    if missing:
        print(f"FAIL estado02-input.json sem dimensões: {missing}")
        return 1
    if data.get("operational_state") not in FINAL_STATES:
        print(f"FAIL operational_state inválido: {data.get('operational_state')}")
        return 1
    c02 = {"campaign": "CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO", "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **data}
    if MATRIZ.exists():
        m = json.loads(MATRIZ.read_text(encoding="utf-8"))
        c02["route_matrix"] = {"file": "expansao/matriz-rotas.json", **m["summary"]}
    estado["campaigns"]["phase_done"] = data.get("phase_done", estado["campaigns"].get("phase_done"))
    estado["campaigns"]["phase_next"] = data.get("phase_next", estado["campaigns"].get("phase_next"))
    estado["owner_visual_decision"] = data["authorized_direction"].get("owner_visual_decision", estado.get("owner_visual_decision"))
    estado["campaign_02"] = c02
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {ESTADO.relative_to(HERE.parents[2])}: campaign_02.operational_state={data['operational_state']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
