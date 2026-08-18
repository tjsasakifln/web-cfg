"""Unsent Market Answer (pavimentação SC) earned-distribution kit.

Prepare-only. Never sends mail, forms, or webhooks. Reads published page facts.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.discovery.campaign_overlay import CAMPAIGN_DIR_REL, CAMPAIGN_ID
from scripts.discovery.registry import repo_root
from scripts.distribution.schema import ALLOWED_TARGET_CLASSES, validate_outcome

CANONICAL = "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
AUTO_SEND = False
RETRIEVED_AT_DEFAULT = "2026-08-18T00:00:00Z"

# Facts taken from the published Market Answer page — not invented quartiles.
PUBLISHED_FACTS = {
    "canonical": CANONICAL,
    "question": "Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?",
    "median_brl": 218284,
    "p25_brl": 19969,
    "p75_brl": 708950,
    "n_usable": 5038,
    "n_denominator": 5063,
    "missingness": 25,
    "period": "2023-07-20–2026-08-15",
    "geography": "Santa Catarina",
    "geography_code": "SC",
    "unit": "valor integral nominal do instrumento",
    "not_unit": "custo por km, m² ou unidade física",
    "method": "mediana e quartis do valor integral nominal; tipologia keyword de pavimentação; recorte SC",
    "as_of": "2026-08-17T11:29:23.193694+02:00",
    "source": "payload official_live, leitura SELECT-only",
    "correction": "https://confenge.com.br/correcoes/",
    "method_page": "https://confenge.com.br/metodologia-inteligencia/",
    "limitations": [
        "O número é o valor integral nominal do instrumento, não custo por km, m² ou unidade física.",
        "O recorte é exclusivamente de Santa Catarina. Não descreve o país inteiro.",
        "Comparáveis oficiais permanecem indisponíveis neste recorte. Não há grupo de pares publicado.",
        "O drill-down de contratos individuais permanece limitado.",
        "A tipologia usa o classificador documental de pavimentação. Palavra-chave pode misturar escopos.",
        "Valores totais não positivos entram em missingness e não entram na amostra útil (25 de 5063).",
    ],
}


HEADLINES = [
    "Em Santa Catarina, a mediana do ticket contratual de pavimentação é R$ 218.284 (valor integral nominal; n=5.038).",
    "Metade dos contratos de pavimentação de SC fica entre R$ 19.969 (P25) e R$ 708.950 (P75) — isso não é custo por km.",
    "Amostra estadual 2023-07-20 a 2026-08-15: 5.038 contratos úteis de 5.063; 25 valores não positivos ficaram de fora.",
]


def published_facts_from_page(root: Path | None = None) -> dict[str, Any]:
    """Re-read the shipped page so tests drive the published HTML, not a hardcoded twin."""
    root = root or repo_root()
    page = root / "inteligencia" / "valor-tipico-contratos-pavimentacao" / "index.html"
    text = page.read_text(encoding="utf-8", errors="replace")
    facts = dict(PUBLISHED_FACTS)
    median = re.search(r"R\$\s*([0-9.]+)\s*\(mediana", text)
    p25 = re.search(r"R\$\s*([0-9.]+)\s*\(P25\)", text)
    p75 = re.search(r"R\$\s*([0-9.]+)\s*\(P75\)", text)
    n = re.search(r"Amostra:\s*(\d+)\s*contratos", text)
    period = re.search(r"Período:\s*([0-9–-]+)", text)
    if median:
        facts["median_brl"] = int(median.group(1).replace(".", ""))
    if p25:
        facts["p25_brl"] = int(p25.group(1).replace(".", ""))
    if p75:
        facts["p75_brl"] = int(p75.group(1).replace(".", ""))
    if n:
        facts["n_usable"] = int(n.group(1))
    if period:
        facts["period"] = period.group(1)
    facts["page_exists"] = page.is_file()
    return facts


def data_card_text(facts: dict[str, Any] | None = None) -> str:
    facts = facts or PUBLISHED_FACTS
    lines = [
        "DISTRIBUTION DATA CARD — Market Answer pavimentação SC",
        f"canonical: {facts['canonical']}",
        f"question: {facts['question']}",
        f"sample: n_usable={facts['n_usable']} / denominator={facts['n_denominator']} / missingness={facts['missingness']}",
        f"period: {facts['period']}",
        f"geography: {facts['geography']} ({facts['geography_code']})",
        f"method: {facts['method']}",
        f"unit: {facts['unit']}",
        f"not_unit: {facts['not_unit']}",
        f"quartiles: P25=R$ {facts['p25_brl']:,} · median=R$ {facts['median_brl']:,} · P75=R$ {facts['p75_brl']:,}".replace(",", "."),
        f"as_of: {facts['as_of']}",
        f"source: {facts['source']}",
        "reusable_assets:",
        f"  - page: {facts['canonical']}",
        "  - visible table: #distribuicao on the same URL",
        "  - method: #metodologia and https://confenge.com.br/metodologia-inteligencia/",
        f"  - corrections: {facts['correction']}",
        "headlines (factual, no clickbait):",
    ]
    for h in HEADLINES:
        lines.append(f"  - {h}")
    lines.append("limitations:")
    for item in facts["limitations"]:
        lines.append(f"  - {item}")
    lines.extend(
        [
            "method_and_correction_note:",
            "  Mediana e quartis do valor integral nominal do instrumento, tipologia documental",
            "  de pavimentação, recorte exclusivo de Santa Catarina. Correção pública em",
            f"  {facts['correction']}. Não estimar custo por km a partir do ticket.",
            "partnership_claim: false",
            "auto_send: false",
            "sent: false",
            "",
        ]
    )
    return "\n".join(lines)


def targets(*, retrieved_at: str = RETRIEVED_AT_DEFAULT) -> list[dict[str, Any]]:
    rows = [
        {
            "id": "sicepot-sc",
            "target_class": "associação",
            "target_nominal": "SICEPOT-SC",
            "editorial_angle": (
                "Ticket estadual de pavimentação como referência de porte contratual "
                "para associadas de construção pesada em SC — não custo por km."
            ),
            "public_route": "https://sicepot.com.br/contact/",
            "fallback": "https://sicepot.com.br/",
            "verified_public": {
                "address": "Avenida Prefeito Osmar Cunha, 183 - Sl. 1014 - Florianópolis/SC",
                "phone": "(48) 3223-0854",
                "mobile": "(48) 99137-8624",
            },
            "draft": "draft-01-sicepot-sc.txt",
        },
        {
            "id": "crea-sc",
            "target_class": "associação",
            "target_nominal": "CREA-SC / comunicação-notícias",
            "editorial_angle": (
                "Leitura técnica do ticket contratual de pavimentação em SC para o "
                "canal de notícias do conselho, com método e limitações visíveis."
            ),
            "public_route": "https://portal.crea-sc.org.br/noticias-crea-sc/",
            "fallback": "https://portal.crea-sc.org.br/",
            "verified_public": {
                "channel": "Notícias CREA-SC",
                "sede": "Rodovia Admar Gonzaga, 2125, Itacorubi, Florianópolis/SC",
            },
            "draft": "draft-02-crea-sc.txt",
        },
        {
            "id": "cbic-coinfra",
            "target_class": "associação",
            "target_nominal": "CBIC / COINFRA",
            "editorial_angle": (
                "Quartis de ticket de pavimentação em SC como evidência estadual "
                "adjacente à pauta de reequilíbrio e porte de contratos da COINFRA."
            ),
            "public_route": "https://cbic.org.br/assessoria-de-imprensa/",
            "fallback": "https://cbic.org.br/reequilibriodecontratos",
            "verified_public": {
                "press": "https://cbic.org.br/assessoria-de-imprensa/",
                "phone": "(61) 3327-1013",
                "email_public": "ascom@cbic.org.br",
                "coinfra_project": "https://cbic.org.br/reequilibriodecontratos",
            },
            "draft": "draft-03-cbic-coinfra.txt",
        },
        {
            "id": "sinaenco",
            "target_class": "associação",
            "target_nominal": "SINAENCO",
            "editorial_angle": (
                "Ticket típico de pavimentação em SC para empresas de A&EC que "
                "dimensionam estudos e gerenciamento — grain de instrumento, não km."
            ),
            "public_route": "https://sinaenco.com.br/fale-conosco/",
            "fallback": "https://sinaenco.com.br/noticias/",
            "verified_public": {
                "email_public": "sinaenco@sinaenco.com.br",
                "phone": "11 3123-9200",
                "form_subject_includes": "Imprensa",
            },
            "draft": "draft-04-sinaenco.txt",
        },
        {
            "id": "agencia-infra",
            "target_class": "imprensa",
            "target_nominal": "Agência iNFRA",
            "editorial_angle": (
                "Nota factual de ticket contratual de pavimentação em SC, com n, "
                "período, quartis e o aviso explícito de que não é custo por km."
            ),
            "public_route": "https://agenciainfra.com/blog/contato/",
            "fallback": "https://agenciainfra.com/blog/",
            "verified_public": {
                "contact_form": "https://agenciainfra.com/blog/contato/",
            },
            "draft": "draft-05-agencia-infra.txt",
        },
    ]
    for row in rows:
        row["citation_url"] = CANONICAL
        row["owner"] = "Tiago Sasaki"
        row["outcome"] = "UNKNOWN"
        row["source"] = "public_route_verified"
        row["date"] = retrieved_at[:10]
        row["retrieved_at"] = retrieved_at
        row["fit"] = True
        row["sent"] = False
        row["partnership_claim"] = False
        row["auto_send"] = False
        validate_outcome(row["outcome"])
        if row["target_class"] not in ALLOWED_TARGET_CLASSES:
            raise ValueError(f"invalid_target_class:{row['target_class']}")
    return rows


def _fmt_brl(value: int) -> str:
    return f"R$ {value:,}".replace(",", ".")


def draft_sicepot(facts: dict[str, Any]) -> str:
    return (
        "Assunto: Ticket contratual típico de pavimentação em SC (mediana "
        f"{_fmt_brl(facts['median_brl'])}, n={facts['n_usable']})\n"
        "\n"
        "Prezada diretoria e comunicação do SICEPOT-SC,\n"
        "\n"
        "A CONFENGE publicou uma leitura estadual do porte dos contratos públicos "
        "de pavimentação em Santa Catarina, no recorte em que as associadas de "
        "construção pesada operam. Não é um ranking de empresas e não estima "
        "custo por quilômetro.\n"
        "\n"
        f"No período {facts['period']}, a mediana do valor integral nominal do "
        f"instrumento é {_fmt_brl(facts['median_brl'])}. A metade central da "
        f"amostra fica entre {_fmt_brl(facts['p25_brl'])} (P25) e "
        f"{_fmt_brl(facts['p75_brl'])} (P75). Amostra útil: {facts['n_usable']} "
        f"contratos de um denominador de {facts['n_denominator']} "
        f"({facts['missingness']} valores não positivos ficaram de fora).\n"
        "\n"
        "Peço revisão editorial para eventual citação ou uso no canal do "
        "sindicato — como referência de porte contratual para associadas, não "
        "como parceria, endosso ou dado nacional.\n"
        "\n"
        f"Página: {facts['canonical']}\n"
        f"Método: {facts['method_page']}\n"
        f"Correção: {facts['correction']}\n"
        "\n"
        "Atenciosamente,\n"
        "Tiago Sasaki\n"
        "CONFENGE — https://confenge.com.br/\n"
    )


def draft_crea(facts: dict[str, Any]) -> str:
    return (
        "Assunto: Sugestão para Notícias CREA-SC — ticket típico de pavimentação "
        "em Santa Catarina (método visível)\n"
        "\n"
        "Prezada equipe de comunicação / notícias do CREA-SC,\n"
        "\n"
        "Sugiro pauta técnica, não institucional: o valor típico dos contratos "
        "públicos de pavimentação no Estado, lido como ticket integral do "
        "instrumento. O número serve a profissionais que calibram expectativa de "
        "porte — e deixa explícito o que não mede.\n"
        "\n"
        f"Resposta publicada: mediana {_fmt_brl(facts['median_brl'])} em SC; "
        f"P25 {_fmt_brl(facts['p25_brl'])}; P75 {_fmt_brl(facts['p75_brl'])}; "
        f"n={facts['n_usable']}; período {facts['period']}. Não é custo por km, "
        "m² ou unidade física. Recorte estadual, não nacional.\n"
        "\n"
        "O pedido é de revisão e eventual citação no canal de notícias do "
        "conselho. Não há alegação de parceria com o CREA-SC nem de homologação "
        "do método pelo plenário.\n"
        "\n"
        f"URL canônica: {facts['canonical']}\n"
        f"Limitações e correção: {facts['correction']}\n"
        "\n"
        "Atenciosamente,\n"
        "Eng. Tiago Sasaki\n"
        "CONFENGE\n"
    )


def draft_cbic(facts: dict[str, Any]) -> str:
    return (
        "Assunto: Evidência estadual de porte contratual de pavimentação (SC) "
        "para a pauta COINFRA / Assessoria de Imprensa da CBIC\n"
        "\n"
        "Prezada Assessoria de Imprensa da CBIC, com cópia de uso interno à "
        "COINFRA,\n"
        "\n"
        "A COINFRA já trata de reequilíbrio, reajuste e porte de contratos de "
        "obras públicas. Este recorte não substitui os normativos da comissão: "
        "oferece um número estadual verificável de ticket de pavimentação em "
        "Santa Catarina, com quartis e limitações no mesmo URL.\n"
        "\n"
        f"Mediana {_fmt_brl(facts['median_brl'])}; intervalo interquartil "
        f"{_fmt_brl(facts['p25_brl'])}–{_fmt_brl(facts['p75_brl'])}; "
        f"n={facts['n_usable']}; período {facts['period']}. Grain: valor "
        "integral nominal do instrumento. Explicitamente não é custo por km.\n"
        "\n"
        "Peço revisão para eventual menção, citação ou reúso editorial. Não "
        "solicito selo CBIC, parceria formal nem inclusão em posicionamento "
        "institucional.\n"
        "\n"
        f"Canônico: {facts['canonical']}\n"
        "Projeto COINFRA (contexto, não endosso): "
        "https://cbic.org.br/reequilibriodecontratos\n"
        f"Correção: {facts['correction']}\n"
        "\n"
        "Atenciosamente,\n"
        "Tiago Sasaki\n"
        "CONFENGE\n"
    )


def draft_sinaenco(facts: dict[str, Any]) -> str:
    return (
        "Assunto: Ticket típico de pavimentação em SC para empresas de A&EC "
        f"(mediana {_fmt_brl(facts['median_brl'])})\n"
        "\n"
        "Prezada comunicação do SINAENCO,\n"
        "\n"
        "Empresas de arquitetura e engenharia consultiva dimensionam estudos, "
        "gerenciamento e fiscalização a partir do porte do instrumento, não do "
        "quilômetro construído. O Market Answer da CONFENGE responde essa "
        "pergunta só para pavimentação em Santa Catarina.\n"
        "\n"
        f"Amostra {facts['n_usable']} contratos úteis ({facts['missingness']} "
        f"excluídos por valor não positivo) no período {facts['period']}. "
        f"Mediana {_fmt_brl(facts['median_brl'])}; P25 {_fmt_brl(facts['p25_brl'])}; "
        f"P75 {_fmt_brl(facts['p75_brl'])}. Método e limitações estão na página.\n"
        "\n"
        "Peço revisão para eventual citação em notícia ou informativo setorial. "
        "Não há pedido de parceria, convênio ou endosso do SINAENCO.\n"
        "\n"
        f"URL: {facts['canonical']}\n"
        f"Método: {facts['method_page']}\n"
        "\n"
        "Atenciosamente,\n"
        "Tiago Sasaki\n"
        "CONFENGE\n"
    )


def draft_agencia(facts: dict[str, Any]) -> str:
    return (
        "Assunto: Nota factual — ticket contratual de pavimentação em Santa "
        f"Catarina (mediana {_fmt_brl(facts['median_brl'])}, n={facts['n_usable']})\n"
        "\n"
        "Prezada redação da Agência iNFRA,\n"
        "\n"
        "Sugestão de nota, não de release promocional. Um recorte estadual "
        "responde quanto custa o instrumento de pavimentação em SC — e recusa "
        "a conversão para custo por km.\n"
        "\n"
        "Fatos publicáveis:\n"
        f"- Geografia: Santa Catarina (não é Brasil).\n"
        f"- Período: {facts['period']}.\n"
        f"- Amostra útil: {facts['n_usable']} de {facts['n_denominator']} "
        f"({facts['missingness']} missingness).\n"
        f"- Mediana: {_fmt_brl(facts['median_brl'])} (valor integral nominal).\n"
        f"- P25–P75: {_fmt_brl(facts['p25_brl'])} a {_fmt_brl(facts['p75_brl'])}.\n"
        "- Unidade: instrumento. Não km, não m².\n"
        "\n"
        "Peço revisão e, se couber, citação com o link canônico e a nota de "
        "método. Sem embargo de parceria e sem oferta de exclusividade.\n"
        "\n"
        f"{facts['canonical']}\n"
        f"Correção pública: {facts['correction']}\n"
        "\n"
        "Atenciosamente,\n"
        "Tiago Sasaki\n"
        "CONFENGE — fonte CONFENGE_WEB\n"
    )


DRAFT_BUILDERS = {
    "sicepot-sc": ("draft-01-sicepot-sc.txt", draft_sicepot),
    "crea-sc": ("draft-02-crea-sc.txt", draft_crea),
    "cbic-coinfra": ("draft-03-cbic-coinfra.txt", draft_cbic),
    "sinaenco": ("draft-04-sinaenco.txt", draft_sinaenco),
    "agencia-infra": ("draft-05-agencia-infra.txt", draft_agencia),
}


def build_kit(*, root: Path | None = None, retrieved_at: str | None = None) -> dict[str, Any]:
    root = root or repo_root()
    stamp = retrieved_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    facts = published_facts_from_page(root)
    target_rows = targets(retrieved_at=stamp)
    drafts = {}
    for row in target_rows:
        filename, builder = DRAFT_BUILDERS[row["id"]]
        drafts[filename] = builder(facts)
    return {
        "schema": "market_answer_distribution_kit_v1",
        "campaign": CAMPAIGN_ID,
        "auto_send": AUTO_SEND,
        "sent": False,
        "smtp_called": False,
        "form_posted": False,
        "partnership_claim": False,
        "canonical": CANONICAL,
        "facts": facts,
        "headlines": list(HEADLINES),
        "data_card": data_card_text(facts),
        "targets": target_rows,
        "drafts": drafts,
        "retrieved_at": stamp,
    }


def assert_kit_unsent(kit: dict[str, Any]) -> None:
    if kit.get("auto_send") is not False:
        raise ValueError("auto_send_must_be_false")
    if kit.get("sent") or kit.get("smtp_called") or kit.get("form_posted"):
        raise ValueError("kit_must_remain_unsent")
    if kit.get("partnership_claim"):
        raise ValueError("partnership_claim_forbidden")


def drafts_are_personalized(kit: dict[str, Any]) -> bool:
    bodies = list((kit.get("drafts") or {}).values())
    if len(bodies) != 5:
        return False
    # Not org-name-only clones: unique opening angle in the first 400 chars.
    heads = {body.split("\n\n", 2)[1][:220] for body in bodies if "\n\n" in body}
    return len(heads) == 5


def write_kit(kit: dict[str, Any], *, root: Path | None = None) -> dict[str, Path]:
    assert_kit_unsent(kit)
    if not drafts_are_personalized(kit):
        raise ValueError("drafts_not_personalized")
    dest = (root or repo_root()) / CAMPAIGN_DIR_REL
    dest.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    card = dest / "DISTRIBUTION_DATA_CARD.txt"
    card.write_text(kit["data_card"], encoding="utf-8")
    written["DISTRIBUTION_DATA_CARD.txt"] = card
    targets_path = dest / "DISTRIBUTION_TARGETS.json"
    targets_path.write_text(
        json.dumps(
            {
                "schema": "campaign_distribution_targets_v1",
                "campaign": CAMPAIGN_ID,
                "auto_send": False,
                "sent": False,
                "canonical": CANONICAL,
                "retrieved_at": kit["retrieved_at"],
                "targets": kit["targets"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    written["DISTRIBUTION_TARGETS.json"] = targets_path
    for name, body in kit["drafts"].items():
        path = dest / name
        path.write_text(body, encoding="utf-8")
        written[name] = path
    return written
