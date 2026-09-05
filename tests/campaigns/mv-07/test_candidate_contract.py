import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CANDIDATE = (
    ROOT
    / "docs/integration/campaign-20260905/07/public-candidates/planejamento-tecnico-licitacoes-obras-publicas"
)
CONTRACT_PATH = CANDIDATE / "offer-contract.json"


def load_contract():
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def public_copy():
    source = (CANDIDATE / "public-copy.md").read_text(encoding="utf-8")
    return source.split("<!-- PUBLIC_COPY_START -->", 1)[1].split("<!-- PUBLIC_COPY_END -->", 1)[0]


def test_candidate_has_stable_identity_route_nucleus_and_owners():
    contract = load_contract()
    identity = contract["identity"]
    assert identity == {
        "deliverable_id": "CFG-D55",
        "offer_candidate_id": "planejamento_tecnico_licitacoes_obras_publicas",
        "public_name_pt_br": "Planejamento Técnico de Licitações de Obras Públicas",
        "canonical_nucleus_id": "public_works_b2g",
        "canonical_route": "/planejamento-tecnico-licitacoes-obras-publicas/",
        "source_issues": [587, 588],
        "naming_authority_issue": 343,
    }


def test_two_audiences_are_explicit_and_same_matter_is_declined():
    audiences = load_contract()["audiences"]
    assert audiences["contracting_entity"]["status"] == "IN_SCOPE"
    assert audiences["bidder_or_contractor"]["status"] == "OUT_OF_SCOPE_FOR_THIS_OFFER"
    assert audiences["same_matter_rule"] == "DECLINE"
    assert {
        "/bid-room-licitacoes-obras/",
        "/diagnostico-pre-licitacao/",
        "/servicos-obras-publicas/",
    } <= set(audiences["bidder_or_contractor"]["destination_routes"])

    copy = public_copy().lower()
    assert "você representa o ente" in copy
    assert "sua empresa quer disputar o edital" in copy
    assert "não atende o ente contratante e uma empresa interessada no mesmo certame" in copy


def test_modular_package_is_complete_and_never_open_ended():
    contract = load_contract()
    assert [module["id"] for module in contract["modules"]] == [f"M{i:02d}" for i in range(10)]
    corpus = json.dumps(contract["modules"], ensure_ascii=False).lower()
    for required in (
        "dfd",
        "dod",
        "estudo técnico preliminar",
        "termo de referência",
        "anteprojeto",
        "projeto básico",
        "projeto executivo",
        "levantamentos",
        "memoriais",
        "especificações",
        "quantitativos",
        "orçamento",
        "bdi",
        "cronograma",
        "medição",
        "recebimento",
        "riscos",
        "responsabilidades",
    ):
        assert required in corpus
    assert contract["applicability"]["open_scope_forbidden"] is True


def test_applicability_matrix_has_bounded_states_owners_and_versions():
    applicability = load_contract()["applicability"]
    assert applicability["statuses"] == [
        "APLICÁVEL",
        "NÃO_APLICÁVEL",
        "PENDENTE_DE_INFORMAÇÃO",
        "FORA_DO_ESCOPO",
    ]
    columns = set(applicability["required_columns"])
    assert {
        "módulo ou peça",
        "status",
        "fundamento ou critério",
        "responsável por produzir",
        "responsável por validar ou decidir",
        "responsabilidade técnica",
        "versão",
    } <= columns


def test_legal_regime_is_selected_before_documents_including_for_estatais():
    contract = load_contract()
    gate = contract["legal_regime_gate"]
    assert gate["required_before_applicability"] is True
    assert "LEI_14133_E_REGULAMENTO_DO_ENTE" in gate["states"]
    assert "LEI_13303_E_REGULAMENTO_INTERNO_DA_ESTATAL" in gate["states"]
    assert gate["unknown_state"] == "REVIEW_REQUIRED"
    copy = public_copy().lower()
    assert "empresa estatal segue o mesmo fluxo da lei nº 14.133?" in copy
    assert "lei nº 13.303 e regulamento interno" in copy


def test_responsibilities_art_invoice_revisions_and_acceptance_are_bounded():
    contract = load_contract()
    responsibilities = contract["responsibilities"]
    assert any("atos administrativos" in item for item in responsibilities["contracting_entity"])
    assert any("pareceres" in item for item in responsibilities["legal_and_control"])
    assert "Não há promessa genérica" in contract["technical_and_fiscal_responsibility"]["art_rrt"]
    assert "não equivale a ateste" in contract["technical_and_fiscal_responsibility"]["invoice"]
    assert contract["revision_and_acceptance"]["default_included_rounds"] == 1
    assert contract["revision_and_acceptance"]["acceptance_is_not_administrative_approval"] is True


def test_conflict_and_first_contact_are_fail_closed_and_privacy_safe():
    contract = load_contract()
    conflict = contract["conflict_gate"]
    capture = contract["capture"]
    assert conflict["same_matter_entity_and_bidder"] == "DECLINE"
    assert conflict["unknown_or_unavailable"] == "REVIEW_REQUIRED"
    assert conflict["analytics_receives_details"] is False
    assert capture["first_contact_upload"] is False
    assert capture["source"] == "CONFENGE_WEB"
    assert capture["outbound_eligible"] is False
    assert capture["auto_send"] is False
    assert capture["smtp_authorized"] is False
    assert "process_or_tender_identifier" in capture["analytics_forbidden"]
    assert "free_text" in capture["analytics_forbidden"]
    assert "antes da publicação do edital" in conflict["checkpoints"]
    assert conflict["sequence"] == [
        "contato geral sem identificadores protegidos nem documentos",
        "canal seguro para identificadores mínimos das partes e da matéria",
        "verificação de conflito liberada",
        "proposta e acesso ao acervo substantivo somente depois da liberação",
    ]


def test_confidentiality_retention_and_disqualification_are_explicit():
    contract = load_contract()
    privacy = contract["confidentiality_and_retention"]
    assert privacy["public_intake_retention_days_max"] == 730
    assert privacy["reuse_for_outbound_or_training"] is False
    assert privacy["no_invented_corpus_period"] is True
    assert "/privacidade/" in privacy["public_intake_retention_authority"]
    reasons = set(contract["disqualification"]["reason_codes"])
    assert {
        "CONFLICT_OR_INCOMPATIBLE_ROLE",
        "LEGAL_REGIME_NOT_CONFIRMED",
        "UNBOUNDED_OR_UNLAWFUL_SCOPE",
        "PROFESSIONAL_ATTRIBUTION_NOT_AVAILABLE",
        "MINIMUM_INPUTS_NOT_AVAILABLE",
        "CAPACITY_NOT_AVAILABLE",
    } <= reasons
    assert "somente reason_code" in contract["disqualification"]["analytics_rule"]


def test_public_copy_uses_plain_language_without_internal_funnel_terms_or_price():
    copy = public_copy()
    lowered = copy.lower()
    for forbidden in (
        "cta",
        "handoff",
        "pipeline",
        "qco",
        "tofu",
        "mofu",
        "bofu",
        "white-label",
        "fail-closed",
        "rollback",
        "smartlic",
        "extra-cli",
        "warmbly",
        "r$",
    ):
        assert forbidden not in lowered
    assert "enquadrar a contratação e receber a lista preliminar" in lowered
    assert "não envie documentos sigilosos" in lowered


def test_public_copy_states_limits_instead_of_forbidden_promises():
    lowered = public_copy().lower()
    for required_limit in (
        "não inclui parecer jurídico",
        "não promete aprovação",
        "não atende o ente contratante e uma empresa interessada no mesmo certame",
        "não existe uma sequência única",
        "não existe uma sequência única para todos os casos",
        "não. as instruções federais têm âmbito próprio",
    ):
        assert required_limit in lowered
    for forbidden_promise in (
        "aprovação garantida",
        "sem risco de impugnação",
        "certame bem-sucedido",
        "contratação direta garantida",
        "dispensa garantida",
        "garantimos a aprovação",
    ):
        assert forbidden_promise not in lowered


def test_legal_research_uses_official_sources_and_limits_federal_scope():
    research = (CANDIDATE / "legal-research.md").read_text(encoding="utf-8").lower()
    assert "consulta em 05/09/2026" in research
    assert "planalto.gov.br" in research
    assert "gov.br/compras" in research
    assert "lei nº 13.303" in research
    assert "regulamento interno" in research
    assert "transferências voluntárias" in research
    assert "não se deve universalizar as ins federais" in research
    assert "art. 169" in research
    assert "contratação integrada e semi-integrada" in research
    assert "não é correto atribuí-lo indistintamente" in research


def test_synthetic_matrix_confirms_legal_regime_before_applicability():
    matrix = (CANDIDATE / "applicability-matrix.md").read_text(encoding="utf-8").lower()
    assert "lei nº 14.133 e do regulamento local já foi confirmada" in matrix
    assert "regime já confirmado no exemplo" in matrix


def test_traceability_example_is_synthetic_and_links_the_full_chain():
    example = (CANDIDATE / "traceability-example.md").read_text(encoding="utf-8")
    assert "propositalmente abstrato" in example
    for record_id in (
        "NEC-01",
        "ETP-01",
        "OBJ-01",
        "PB-01",
        "QTD-01",
        "ORC-01",
        "CRO-01",
        "MED-01",
        "RSK-01",
    ):
        assert record_id in example


def test_price_remains_unknown_and_first_cases_create_evidence():
    pricing = load_contract()["pricing"]
    assert pricing["public_price"] is None
    assert set(pricing["validation_ledger_first_cases"]) >= {
        "horas",
        "retrabalho",
        "despesas",
        "receita recebida",
        "margem de contribuição",
    }


def test_hundred_repetition_rule_reuses_modules_instead_of_pages():
    rule = load_contract()["hundred_repetition_test"].lower()
    assert "cem demandas" in rule
    assert "mesmos módulos" in rule
    assert "cem páginas" in rule
