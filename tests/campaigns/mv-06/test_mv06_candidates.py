import html
import hashlib
import json
import re
import struct
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "docs" / "integration" / "campaign-20260905" / "06"
MANIFEST_PATH = PACK / "candidate-manifest.v1.json"
CANDIDATES = PACK / "public-candidates"


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_body = False
        self.ignored_depth = 0
        self.text = []
        self.start_tags = []
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        self.start_tags.append((tag, attributes))
        if tag == "body":
            self.in_body = True
        if self.in_body and tag in {"script", "style", "svg"}:
            self.ignored_depth += 1
        if attributes.get("id"):
            self.ids.append(attributes["id"])

    def handle_endtag(self, tag):
        if self.in_body and tag in {"script", "style", "svg"} and self.ignored_depth:
            self.ignored_depth -= 1
        if tag == "body":
            self.in_body = False

    def handle_data(self, data):
        if self.in_body and not self.ignored_depth and data.strip():
            self.text.append(data.strip())


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def candidate_html(record):
    return (PACK / record["candidate_file"]).read_text(encoding="utf-8")


def parser_for(raw):
    parser = PageParser()
    parser.feed(raw)
    return parser


def normalized(value):
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def visible_text(raw):
    return normalized(" ".join(parser_for(raw).text))


def record_by_id(family_id):
    return next(item for item in load_manifest()["families"] if item["id"] == family_id)


def test_campaign_manifest_is_bounded_to_three_distinct_families():
    manifest = load_manifest()
    assert manifest["schema_version"] == "confenge-mv-commercial-candidates/v1"
    assert manifest["campaign_env"] == "CONFENGE_MV_CAMPAIGN=06"
    assert manifest["base_sha"] == "470a5ffafeaf45a59649109742ce5885f9789328"
    assert manifest["public_state"] == "CANDIDATE_NOINDEX"
    assert manifest["publication_owner"] == "MV-09"
    assert manifest["family_count"] == 3 == len(manifest["families"])
    assert {item["route"] for item in manifest["families"]} == {
        "/pericias-assistencia-tecnica/",
        "/avaliacoes-imoveis/",
        "/seguranca-trabalho/",
    }
    assert len({item["nucleus_id"] for item in manifest["families"]}) == 3
    assert all(item["offer_id"] is None for item in manifest["families"])
    assert all(item["price_state"] == "NOT_DISPLAYED" for item in manifest["families"])
    assert all(item["terminal_action"] == "capture_form" for item in manifest["families"])
    assert set(manifest["analytics_contract"]["events"]) == {
        "service_page_view", "cta_click", "whatsapp_click", "email_click",
        "lead_form_start", "lead_form_submit", "lead_persisted",
    }


def test_only_three_candidate_page_directories_exist_in_the_campaign_pack():
    manifest = load_manifest()
    pages = sorted(CANDIDATES.glob("*/index.html"))
    assert len(pages) == 3
    assert {page.parent.name for page in pages} == {item["id"] for item in manifest["families"]}
    for record in manifest["families"]:
        assert (PACK / record["candidate_file"]).is_file()
        assert record["candidate_file"].startswith("public-candidates/")


def test_candidates_are_explicitly_noindex_without_canonical_or_price():
    for record in load_manifest()["families"]:
        raw = candidate_html(record)
        assert re.search(r'<meta\s+name="robots"\s+content="noindex,nofollow">', raw, re.I)
        assert not re.search(r'<link\s+[^>]*rel="canonical"', raw, re.I)
        assert "R$" not in visible_text(raw)
        assert re.search(r'<html\s+lang="pt-BR">', raw)
        assert raw.count("<h1>") == 1
        assert 'href="../candidate.css"' in raw


def test_visible_copy_uses_direct_portuguese_not_internal_funnel_labels():
    internal_labels = [
        "ICP", "lead", "CTA", "handoff", "pipeline", "QCO", "TOFU", "MOFU", "BOFU",
        "white-label", "fail-closed", "rollback", "EXECUTE_NOW", "INBOUND_ENGINE", "REVENUE_NOW",
    ]
    for record in load_manifest()["families"]:
        text = visible_text(candidate_html(record))
        for label in internal_labels:
            assert not re.search(rf"(?<![\w-]){re.escape(label)}(?![\w-])", text, re.I), (record["id"], label)


def test_candidates_do_not_make_high_risk_commercial_or_professional_claims():
    forbidden = [
        "valor exato",
        "aceito por qualquer",
        "aceita por qualquer",
        "garantia de êxito",
        "resultado garantido",
        "defender tese",
        "perito do TJSC",
        "perito oficial",
        "homologado",
        "acreditado",
        "assumimos o eSocial",
        "equipe própria",
        "SmartLic",
    ]
    for record in load_manifest()["families"]:
        text = visible_text(candidate_html(record))
        for phrase in forbidden:
            assert phrase.casefold() not in text.casefold(), (record["id"], phrase)


def test_each_page_has_a_terminal_contact_action_and_safe_initial_request():
    for record in load_manifest()["families"]:
        raw = candidate_html(record)
        parser = parser_for(raw)
        anchors = [attrs for tag, attrs in parser.start_tags if tag == "a"]
        whatsapp = [a for a in anchors if "wa.me/" in a.get("href", "") and a.get("data-route-family") == record["id"]]
        email = [a for a in anchors if a.get("href", "").startswith("mailto:") and a.get("data-route-family") == record["id"]]
        assert whatsapp and email
        assert all(a.get("data-event-name") == "whatsapp_click" for a in whatsapp)
        assert all(a.get("data-event-name") == "email_click" for a in email)
        assert all(a.get("rel") == "noopener" for a in whatsapp)
        for anchor in whatsapp:
            query = parse_qs(urlparse(anchor["href"]).query)
            message = " ".join(query.get("text", []))
            assert message
            assert not re.search(r"\b(?:CPF|CNPJ|processo\s*n|autos|laudo\s+anexo)\b", message, re.I)
        text = visible_text(raw)
        assert "não envie" in text.casefold()


def test_primary_ctas_match_the_manifest_and_point_to_scope_framing():
    for record in load_manifest()["families"]:
        raw = candidate_html(record)
        assert record["primary_cta"] in visible_text(raw)
        escaped = re.escape(record["primary_cta"])
        assert re.search(rf'<a\s+[^>]*href="#enquadramento"[^>]*>\s*{escaped}\s*</a>', raw, re.I)


def test_pericias_separates_roles_and_covers_each_material_stage():
    raw = candidate_html(record_by_id("pericias-assistencia-tecnica"))
    text = visible_text(raw).casefold()
    required = [
        "assistente técnico", "perito nomeado pelo juízo", "triagem pré-litígio", "quesitos",
        "diligência", "análise de laudo", "parecer", "esclarecimentos", "advogado", "conflito",
    ]
    assert all(term.casefold() in text for term in required)
    assert "não substitui representação jurídica" in text
    assert "não promete resultado processual" in text


def test_avaliacoes_covers_every_scope_dimension_without_universal_acceptance():
    raw = candidate_html(record_by_id("avaliacoes-imoveis"))
    text = visible_text(raw).casefold()
    required = [
        "finalidade", "data de referência", "imóvel", "documentação", "vistoria", "método",
        "norma", "laudo", "parecer", "destinatário", "banco", "juízo",
    ]
    assert all(term.casefold() in text for term in required)
    assert "aceitação automática" in text
    assert "conclusão técnica vinculada" in text


def test_sst_separates_documents_esocial_and_multidisciplinary_dependencies():
    raw = candidate_html(record_by_id("seguranca-trabalho"))
    text = visible_text(raw).casefold()
    required = [
        "pgr", "ltcat", "avaliação ergonômica preliminar", "aep", "aet", "nr-15", "nr-16",
        "insalubridade", "periculosidade", "esocial", "médico do trabalho", "higienista ocupacional",
        "ergonomista", "pcmso", "aso", "empresa continua responsável",
    ]
    assert all(term.casefold() in text for term in required)
    assert "pgr não substitui automaticamente ltcat ou ppp" in text
    assert "título, registro e atribuição específicos de segurança do trabalho permanecem fora da copy" in text
    assert "engenheiro de segurança do trabalho" not in text
    assert "o cnpj fica para a etapa protegida" in text


def test_current_proof_is_labeled_and_unknown_credentials_remain_fail_closed():
    pericias = candidate_html(record_by_id("pericias-assistencia-tecnica"))
    avaliacoes = candidate_html(record_by_id("avaliacoes-imoveis"))
    sst = candidate_html(record_by_id("seguranca-trabalho"))
    for raw in (pericias, avaliacoes, sst):
        text = visible_text(raw).casefold()
        assert "tiago jun sasaki" in text
        assert "informação profissional declarada pelo titular: engenheiro civil formado pela eesc-usp" in text
        assert "publicada pelo próprio responsável" in text
        assert "52.407.089/0001-09" in text
    assert 'data-proof-state="credential-integration-required"' in sst
    assert "CPTEC" not in visible_text(sst)


def test_external_sources_are_primary_and_open_safely():
    allowed_hosts = {"www.planalto.gov.br", "normativos.confea.org.br", "www.abntcatalogo.com.br", "www.gov.br"}
    for record in load_manifest()["families"]:
        parser = parser_for(candidate_html(record))
        source_links = [
            attrs for tag, attrs in parser.start_tags
            if tag == "a" and urlparse(attrs.get("href", "")).hostname in allowed_hosts
        ]
        assert source_links
        assert all(link.get("target") == "_blank" and link.get("rel") == "noopener" for link in source_links)


def test_ids_are_unique_and_anchor_targets_exist():
    for record in load_manifest()["families"]:
        raw = candidate_html(record)
        parser = parser_for(raw)
        assert len(parser.ids) == len(set(parser.ids))
        local_hrefs = [
            attrs["href"][1:] for tag, attrs in parser.start_tags
            if tag == "a" and attrs.get("href", "").startswith("#")
        ]
        assert local_hrefs
        assert set(local_hrefs).issubset(set(parser.ids))


def test_fragments_keep_integration_fail_closed_and_pii_free():
    registry = json.loads((PACK / "fragments" / "public-family-registry.fragment.json").read_text(encoding="utf-8"))
    intake = json.loads((PACK / "fragments" / "intake-attribution.fragment.json").read_text(encoding="utf-8"))
    expected = {item["id"] for item in load_manifest()["families"]}
    assert {item["id"] for item in registry["entries"]} == expected
    assert all(item["terminal_action"] == "capture_form" for item in registry["entries"])
    assert all(item["debt"] == [] for item in registry["entries"])
    assert intake["source"] == "CONFENGE_WEB"
    assert intake["auto_send"] is False
    assert {item["route_family"] for item in intake["families"]} == expected
    assert "free_text" in intake["analytics_denylist"]
    assert not set(intake["analytics_allowlist"]) & set(intake["analytics_denylist"])
    sst = next(item for item in intake["families"] if item["route_family"] == "seguranca-trabalho")
    assert "cnpj" not in sst["allowed_public_context_fields"]
    assert "cnpj" in sst["protected_later_fields"]


def test_expected_viewport_and_component_screenshots_are_present_and_bound_to_sources():
    evidence = PACK / "evidence" / "screenshots"
    for record in load_manifest()["families"]:
        for viewport in ("desktop-1440x1000", "mobile-390x844"):
            path = evidence / f"{record['id']}-{viewport}.png"
            assert path.is_file() and path.stat().st_size > 20_000, path
        for component in ("proof-desktop", "contact-desktop"):
            path = evidence / f"{record['id']}-{component}.png"
            assert path.is_file() and path.stat().st_size > 20_000, path
    manifest = json.loads((evidence / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["base_sha"] == "470a5ffafeaf45a59649109742ce5885f9789328"
    assert len(manifest["captures"]) == 12
    for record in load_manifest()["families"]:
        route_captures = [item for item in manifest["captures"] if item["route"] == record["route"]]
        assert {(item["kind"], item.get("selector")) for item in route_captures} == {
            ("viewport", None), ("component", ".proof-panel"), ("component", ".contact-panel")
        }
        assert len([item for item in route_captures if item["kind"] == "viewport"]) == 2
    for source in manifest["source_files"]:
        path = (evidence / source["file"]).resolve()
        assert path.is_relative_to(CANDIDATES.resolve())
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"]
    for capture in manifest["captures"]:
        path = evidence / capture["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == capture["sha256"]
        with path.open("rb") as image_file:
            assert image_file.read(8) == b"\x89PNG\r\n\x1a\n"
            image_file.read(8)
            width, height = struct.unpack(">II", image_file.read(8))
        assert (width, height) == (capture["pixel_width"], capture["pixel_height"])
