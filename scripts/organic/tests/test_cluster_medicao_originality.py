"""Fail-closed originality gate for the six Medição/Glosa/Pagamento URLs.

Drives the shipped HTML (conteudos/<slug>/index.html) through
scripts.organic.cluster_medicao_originality.evaluate_cluster. Does not
reimplement extraction, similarity or section checks.
"""

from __future__ import annotations

import itertools
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.cluster_medicao_originality import (  # noqa: E402
    CLUSTER_REVISION,
    CLUSTER_SLUGS,
    DECISION_QUESTIONS,
    EXCLUSIVE_ARTIFACTS,
    INTENT_SHINGLE_JACCARD_MAX,
    INTENT_TOKEN_JACCARD_MAX,
    NEXT_ACTIONS,
    PAGE_CONTRACTS,
    REQUIRED_SECTION_IDS,
    REVISION_BODY_SHA256,
    REVISION_SURFACES,
    artifact_evidence,
    artifact_failures,
    content_fingerprint,
    evaluate_cluster,
    extract_body_paragraphs,
    format_date_br,
    inspect_page,
    intent_overlap,
    intent_signature,
    intent_tokens,
    jaccard,
    normalize_paragraph,
    pairwise_shared_ratio,
    revision_failures,
    revision_surfaces,
    shingles,
    sitemap_lastmod,
    source_provenance_failures,
    source_records,
    stem,
)


def test_cluster_originality_drives_shipped_html():
    report = evaluate_cluster(ROOT)
    assert report["ok"], "\n".join(report["failures"])
    for slug in CLUSTER_SLUGS:
        path = ROOT / "conteudos" / slug / "index.html"
        assert path.is_file(), slug
        html = path.read_text(encoding="utf-8")
        page = inspect_page(ROOT, slug)
        assert page["paragraphs"] == extract_body_paragraphs(html)
        assert EXCLUSIVE_ARTIFACTS[slug] in html
        assert REQUIRED_SECTION_IDS[0] in page["section_ids"]


def test_pairwise_ratio_uses_smaller_text_as_denominator():
    small = ["alpha unique", "beta unique", "gamma shared"]
    large = ["gamma shared", "delta other", "epsilon other", "zeta other"]
    assert pairwise_shared_ratio(small, large) == 1 / 3


def test_evaluate_cluster_is_deterministic():
    first = evaluate_cluster(ROOT)
    second = evaluate_cluster(ROOT)
    assert first["failures"] == second["failures"]
    assert first["pairwise"] == second["pairwise"]
    dumped = json.dumps(first["pairwise"], sort_keys=True)
    assert dumped == json.dumps(second["pairwise"], sort_keys=True)


# --------------------------------------------------------------------------
# Revision truth: the five surfaces must state one date, and it must be the
# date the body actually changed.
# --------------------------------------------------------------------------


def test_five_revision_surfaces_agree_on_the_declared_revision():
    for slug in CLUSTER_SLUGS:
        html = (ROOT / "conteudos" / slug / "index.html").read_text(encoding="utf-8")
        surfaces = revision_surfaces(html, root=ROOT, slug=slug)
        stated = {key: surfaces[key] for key in REVISION_SURFACES}
        assert set(stated.values()) == {CLUSTER_REVISION}, (slug, stated)
        expected_br = format_date_br(CLUSTER_REVISION)
        assert surfaces["visible_revised_on_text"] == expected_br, slug
        assert surfaces["sources_consulted_on_text"] == expected_br, slug


def test_revision_gate_fails_when_any_single_surface_diverges():
    """One surface out of step must fail, for each of the five in turn."""
    for slug in CLUSTER_SLUGS:
        page = inspect_page(ROOT, slug)
        assert revision_failures(slug, page) == [], slug
        for surface in REVISION_SURFACES:
            drifted = dict(page)
            drifted["revision"] = dict(page["revision"])
            drifted["revision"][surface] = "2026-07-30"
            failures = revision_failures(slug, drifted)
            assert failures, (slug, surface)
            assert any("diverge" in item for item in failures), (slug, surface, failures)


def test_revision_gate_fails_when_all_five_agree_on_the_wrong_date():
    page = inspect_page(ROOT, CLUSTER_SLUGS[0])
    drifted = dict(page)
    drifted["revision"] = {
        **page["revision"],
        **{surface: "2026-07-30" for surface in REVISION_SURFACES},
    }
    failures = revision_failures(CLUSTER_SLUGS[0], drifted)
    assert any("declared revision" in item for item in failures), failures


def test_revision_gate_fails_when_the_body_moves_without_the_date():
    """A reworded paragraph with the stamp untouched is a stale revision."""
    for slug in CLUSTER_SLUGS:
        page = dict(inspect_page(ROOT, slug))
        page["content_fingerprint"] = "0" * 64
        failures = revision_failures(slug, page)
        assert any("body changed since the pinned fingerprint" in f for f in failures)


def test_restamping_the_dates_never_moves_the_body_fingerprint():
    """The fingerprint tracks content, not the stamp, so it cannot self-satisfy."""
    for slug in CLUSTER_SLUGS:
        html = (ROOT / "conteudos" / slug / "index.html").read_text(encoding="utf-8")
        restamped = html.replace(CLUSTER_REVISION, "2027-01-09").replace(
            format_date_br(CLUSTER_REVISION), format_date_br("2027-01-09")
        )
        assert restamped != html, slug
        assert content_fingerprint(restamped) == content_fingerprint(html), slug
        assert content_fingerprint(html) == REVISION_BODY_SHA256[slug], slug


def test_visible_and_machine_dates_cannot_drift_apart_in_wording():
    page = inspect_page(ROOT, CLUSTER_SLUGS[0])
    drifted = dict(page)
    drifted["revision"] = {
        **page["revision"],
        "visible_revised_on_text": "30 de julho de 2026",
    }
    failures = revision_failures(CLUSTER_SLUGS[0], drifted)
    assert any("visible_revised_on_text" in item for item in failures), failures


def test_sitemap_lastmod_is_read_from_the_shipped_sitemap():
    for slug in CLUSTER_SLUGS:
        assert sitemap_lastmod(ROOT, slug) == CLUSTER_REVISION, slug


# --------------------------------------------------------------------------
# Intent overlap: same search intent, no shared sentence.
# --------------------------------------------------------------------------

# A control page written to compete for the query owned by
# atraso-pagamento-contrato-publico-suspender. It shares no sentence with that
# article, and by construction no literal paragraph, yet it targets the same
# decision. The intent gate must catch it; the literal gate must not.
INTENT_DUPLICATE_CONTROL_TARGET = "atraso-pagamento-contrato-publico-suspender"
INTENT_DUPLICATE_CONTROL = """
Atraso de pagamento em obra publica: da para parar o servico?
Resposta direta. Havendo nota fiscal ja emitida e liquidada, o atraso de
pagamento pode liberar a suspensao do cumprimento das obrigacoes pela
contratada. Essa opcao nao existe no primeiro dia e tampouco existe se o
gargalo ainda estiver no ateste ou na liquidacao. Pela Lei numero 14.133 de
2021 o atraso precisa passar de dois meses contados da emissao da nota fiscal,
e a contratada deve notificar antes de suspender.
O credito nao entrou mesmo com nota fiscal e liquidacao concluidas
Os tres prazos que decidem se cabe suspender
Como a nota fiscal fixa a contagem dos dois meses de atraso
Quais provas demonstram atraso exigivel e nao mero aperto de caixa
Notificar, seguir executando, suspender ou pedir extincao
Cruzar os bracos no primeiro atraso e chamar isso de direito
Os limites desta triagem de suspensao
"""


def _cluster_intent_tokens():
    return {
        slug: inspect_page(ROOT, slug)["intent_tokens"] for slug in CLUSTER_SLUGS
    }


def test_every_real_pair_is_below_both_intent_thresholds():
    report = evaluate_cluster(ROOT)
    assert report["pairwise"]
    for row in report["pairwise"]:
        assert row["intent_token_jaccard"] < INTENT_TOKEN_JACCARD_MAX, row
        assert row["intent_shingle_jaccard"] < INTENT_SHINGLE_JACCARD_MAX, row


def test_threshold_separates_domain_overlap_from_intent_duplication():
    """The threshold sits strictly between the two measured regimes.

    Below: pages that merely share this pillar's vocabulary.
    At or above: a page that owns another page's decision in other words.
    Without this, the threshold would only be a number that today's pages pass.
    """
    tokens = _cluster_intent_tokens()
    control = intent_tokens(INTENT_DUPLICATE_CONTROL)

    domain_ceiling = max(
        intent_overlap(tokens[a], tokens[b])["intent_token_jaccard"]
        for a, b in itertools.combinations(CLUSTER_SLUGS, 2)
    )
    duplicate = intent_overlap(
        tokens[INTENT_DUPLICATE_CONTROL_TARGET], control
    )["intent_token_jaccard"]

    assert domain_ceiling < INTENT_TOKEN_JACCARD_MAX <= duplicate, (
        domain_ceiling,
        INTENT_TOKEN_JACCARD_MAX,
        duplicate,
    )
    # The control only duplicates ONE cluster URL; the rest stay in the
    # domain band, so the measure is specific, not a blanket "same topic".
    for slug in CLUSTER_SLUGS:
        if slug == INTENT_DUPLICATE_CONTROL_TARGET:
            continue
        score = intent_overlap(tokens[slug], control)["intent_token_jaccard"]
        assert score < INTENT_TOKEN_JACCARD_MAX, (slug, score)


def test_literal_gate_alone_would_miss_the_intent_duplicate():
    """Why the literal check is not enough, stated as an assertion."""
    target_html = (
        ROOT / "conteudos" / INTENT_DUPLICATE_CONTROL_TARGET / "index.html"
    ).read_text(encoding="utf-8")
    target_paragraphs = extract_body_paragraphs(target_html)
    control_paragraphs = [
        normalize_paragraph(line)
        for line in INTENT_DUPLICATE_CONTROL.strip().splitlines()
        if len(normalize_paragraph(line)) >= 24
    ]
    assert control_paragraphs
    assert not set(target_paragraphs) & set(control_paragraphs)
    assert pairwise_shared_ratio(target_paragraphs, control_paragraphs) == 0.0


def test_intent_signature_drops_boilerplate_and_keeps_the_decision():
    for slug in CLUSTER_SLUGS:
        html = (ROOT / "conteudos" / slug / "index.html").read_text(encoding="utf-8")
        signature = intent_signature(html)
        assert "Base normativa e data de consulta" not in signature, slug
        assert "Engº Tiago Sasaki" not in signature, slug
        assert "Resposta" in signature, slug
        assert len(intent_tokens(signature)) >= 40, slug


def test_stemming_collapses_inflection_but_not_derivation():
    """Inflection collapses, including the irregular Portuguese plurals."""
    for singular, plural in (
        ("pagamento", "pagamentos"),
        ("medicao", "medicoes"),
        ("liquidacao", "liquidacoes"),
        ("boletim", "boletins"),
        ("fiscal", "fiscais"),
        ("glosa", "glosas"),
        ("evento", "eventos"),
        ("contrato", "contratos"),
    ):
        assert stem(singular) == stem(plural), (singular, plural)
    # Derivation is left alone on purpose: chaining strips until "contrato"
    # and "contar" met would manufacture overlap. The measure therefore
    # under-counts paraphrase, and the threshold carries margin for it.
    assert stem("suspensao") != stem("suspender")
    # Short and numeric tokens are never touched.
    assert stem("art") == "art"
    assert stem("14133") == "14133"


def test_jaccard_and_shingles_are_well_formed():
    assert jaccard(set(), set()) == 0.0
    assert jaccard({"a"}, {"a"}) == 1.0
    assert jaccard({"a", "b"}, {"b", "c"}) == 1 / 3
    assert shingles(["a", "b", "c", "d", "e"], 4) == {
        ("a", "b", "c", "d"),
        ("b", "c", "d", "e"),
    }
    assert shingles(["a", "b"], 4) == set()


# --------------------------------------------------------------------------
# Distinct ownership: one decision question, one artifact, one next action.
# --------------------------------------------------------------------------


def test_each_url_owns_a_distinct_question_artifact_and_next_action():
    for table in (DECISION_QUESTIONS, EXCLUSIVE_ARTIFACTS, NEXT_ACTIONS):
        assert set(table) == set(CLUSTER_SLUGS)
        assert len(set(table.values())) == len(CLUSTER_SLUGS)
    for slug in CLUSTER_SLUGS:
        page = inspect_page(ROOT, slug)
        assert page["decision_question_present"], slug
        assert page["next_action_present"], (slug, page["pillar_anchor_texts"])
        assert page["artifact_present"], slug


def test_artifact_marker_outside_example_cannot_satisfy_the_gate():
    """Regression: the old gate accepted a marker anywhere in the HTML."""
    for slug, contract in PAGE_CONTRACTS.items():
        html = (ROOT / "conteudos" / slug / "index.html").read_text(
            encoding="utf-8"
        )
        example = re.search(r'<section id="exemplo">.*?</section>', html, re.S)
        assert example, slug
        emptied = example.group(0)
        for marker in (
            contract.artifact,
            contract.artifact_heading,
            contract.artifact_aria_label,
            contract.artifact_decision_output,
        ):
            emptied = emptied.replace(marker, "REMOVIDO")
        moved_to_shell = html.replace(example.group(0), emptied) + contract.artifact
        evidence = artifact_evidence(moved_to_shell, contract)
        assert not evidence["artifact_present"], slug
        page = {"artifact_evidence": evidence}
        assert artifact_failures(slug, page), slug


def test_artifact_contract_proves_structure_and_decision_output():
    for slug, contract in PAGE_CONTRACTS.items():
        page = inspect_page(ROOT, slug)
        assert not artifact_failures(slug, page), slug
        assert page["artifact_kind"] == contract.artifact_kind
        assert all(page["artifact_evidence"].values()), slug


def test_revalidated_primary_sources_have_provenance_date_and_limits():
    records = source_records()
    for slug in CLUSTER_SLUGS:
        page = inspect_page(ROOT, slug)
        assert not source_provenance_failures(slug, page, records), slug


def test_similarity_excludes_conversion_and_related_shell():
    html = """
    <article class="article-main">
      <p>Parágrafo substantivo exclusivo com conteúdo decisório suficiente.</p>
      <aside class="lead-inline"><p>Texto compartilhado do formulário comercial.</p></aside>
      <section class="editorial-bridge commercial-bridge">
        <p>Texto compartilhado da ponte comercial.</p>
      </section>
      <section class="related-section"><p>Texto compartilhado de relacionados.</p></section>
    </article>
    """
    assert extract_body_paragraphs(html) == [
        "parágrafo substantivo exclusivo com conteúdo decisório suficiente."
    ]


def test_no_ownership_marker_leaks_into_a_sibling_url():
    htmls = {
        slug: (ROOT / "conteudos" / slug / "index.html").read_text(encoding="utf-8")
        for slug in CLUSTER_SLUGS
    }
    for owner in CLUSTER_SLUGS:
        markers = (
            DECISION_QUESTIONS[owner],
            EXCLUSIVE_ARTIFACTS[owner],
            NEXT_ACTIONS[owner],
        )
        for other, html in htmls.items():
            if other == owner:
                continue
            for marker in markers:
                assert marker not in html, (owner, other, marker)
