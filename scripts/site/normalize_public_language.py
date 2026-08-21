"""Normalize visitor-facing language on the core commercial surfaces."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SURFACES = (
    "index.html",
    "acompanhamento-contratos-obras/index.html",
    "atrasos-prorrogacao-obras-publicas/index.html",
    "defesa-tecnica-contratos-publicos/index.html",
    "defesa-margem-contratos-publicos/index.html",
    "diagnostico-b2g-expansao/index.html",
    "diretoria-b2g/index.html",
    "bid-room-licitacoes-obras/index.html",
)

REPLACEMENTS = (
    (
        "Contract Defense &amp; Margin (defesa técnica e proteção de margem)",
        "Defesa técnica e proteção de margem",
    ),
    ("Contract Defense &amp; Margin", "Defesa de margem"),
    ("Contract Defense & Margin", "Defesa de margem"),
    ("Contract Defense", "defesa de margem"),
    ("Produto pontual · CFG-DIAG-EXP-v1", "Diagnóstico pontual de mercado"),
    ("Produto pontual CFG-DIAG-EXP-v1.", "Diagnóstico pontual de mercado."),
    ("Produto pontual CFG-DIAG-EXP-v1:", "Diagnóstico pontual de mercado:"),
    ("produto pontual CFG-DIAG-EXP-v1", "diagnóstico pontual de mercado"),
    ("Diagnóstico pontual de expansão B2G (CFG-DIAG-EXP-v1).", "Diagnóstico pontual de expansão B2G."),
    ("Fonte: registro CFG-DIAG-EXP-v1.", "Fonte: escopo comercial aprovado."),
    ("registro público CFG-DIAG-EXP-v1", "escopo comercial publicado"),
    ("Diagnóstico B2G de Expansão CFG-DIAG-EXP-v1", "Diagnóstico B2G de Expansão"),
    ("%20CFG-DIAG-EXP-v1", ""),
    ("<strong>CFG-DIRB2G-FLEX-v1</strong> - CONFENGE - Diretoria B2G Fracionada - Flex", "<strong>Plano Flex</strong>"),
    ("<strong>CFG-DIRB2G-180-v1</strong> - CONFENGE - Diretoria B2G Fracionada - 180", "<strong>Plano de 6 meses</strong>"),
    ("<strong>CFG-DIRB2G-365-v1</strong> - CONFENGE - Diretoria B2G Fracionada - 365", "<strong>Plano de 12 meses</strong>"),
    ("FACT / CALCULATION / INFERENCE / UNKNOWN", "fato, cálculo, inferência e lacuna"),
    ("FACT, CALCULATION, INFERENCE, UNKNOWN", "Fato, cálculo, inferência e lacuna"),
    ("<dt>FACT</dt>", "<dt>Fato</dt>"),
    ("<dt>CALCULATION</dt>", "<dt>Cálculo</dt>"),
    ("<dt>INFERENCE</dt>", "<dt>Inferência</dt>"),
    ("<dt>UNKNOWN</dt>", "<dt>Lacuna</dt>"),
    ("com FACT e UNKNOWN", "separando fatos e lacunas"),
    ("com FACT, INFERENCE e UNKNOWN", "com fatos, inferências e lacunas identificados"),
    ("<strong>Owner do cliente:</strong>", "<strong>Responsável na empresa:</strong>"),
    ("permanece owner das peças jurídicas", "permanece responsável pelas peças jurídicas"),
    ("<p class=\"eyebrow\">Inputs do cliente</p>", "<p class=\"eyebrow\">Documentos do cliente</p>"),
    ("<span class=\"type-mono\">Entra / fit</span>", "<span class=\"type-mono\">Faz sentido</span>"),
    ("<span class=\"type-mono\">Não entra / não fit</span>", "<span class=\"type-mono\">Não faz sentido</span>"),
    ("use a landing de atrasos", "use a página de atrasos"),
    ("use a landing correspondente", "use a página correspondente"),
    ("Sem ranking inventado e sem avaliação de cliente fabricada.", ""),
    ("Prova visível, sem case inventado.", "Como conferir o método e os limites do trabalho."),
    ("Diagnóstico B2G one-off CFG-DIAG-EXP-v1.", "Diagnóstico B2G pontual."),
    ("Diagnóstico B2G one-off da CONFENGE (CFG-DIAG-EXP-v1).", "Diagnóstico B2G pontual da CONFENGE."),
    ("kickoff", "reunião inicial"),
    ("Kickoff", "Reunião inicial"),
    ("sla 10-15", "prazo de 10 a 15 dias úteis"),
    ("foram aprovados pelo founder para produção limitada. Não houve revisão profissional de advogado.", "são comerciais e não substituem revisão jurídica independente."),
    ("Esta landing", "Esta página"),
    ("Ausência de guia permanece UNKNOWN.", "A ausência de guia não deve ser interpretada como ausência de risco."),
    ("Ausência de guia público neste eixo permanece UNKNOWN, não zero.", "A ausência de guia público neste eixo não deve ser interpretada como risco zero."),
    ("Identidade, valor assinado, vigência e UNKNOWN.", "Identidade, valor assinado, vigência e lacunas de informação."),
    ("Pedido persistido. Checkout permanece desligado.", "Pedido recebido. Entraremos em contato pelo canal informado."),
    ("Catálogo público e checkout de produção desligados.", "A contratação é confirmada somente depois da análise da demanda."),
)


def main() -> None:
    changed = []
    for relative in SURFACES:
        path = ROOT / relative
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in REPLACEMENTS:
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed.append(relative)
    print(f"normalized={len(changed)}")
    for relative in changed:
        print(relative)


if __name__ == "__main__":
    main()
