"""Adversarial editorial acceptance, source binding and private/public separation."""
import copy
import json
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from editorial_fixtures import enriched_fact, research_for, analysis_for, editorial_draft
from scripts.contract_news.core import NewsError, fingerprint, public_facts, validate_fact, validate_draft
from scripts.contract_news.editorial import (
    editorial_ready, source_catalog, validate_research, validate_analysis,
    validate_review, validate_published_editorial, _prose,
)


class EditorialTests(unittest.TestCase):
    def test_full_report_adds_documented_context_and_technical_analysis(self):
        fact = validate_fact(enriched_fact())
        research = validate_research(research_for(fact), fact)
        validate_analysis(analysis_for(research), research)
        article = validate_draft(editorial_draft(fact), fact)
        validate_published_editorial(article['editorial'], public_facts(fact))
        self.assertEqual({section['kind'] for section in article['editorial']['sections']}, {'context', 'technical', 'watch'})
        self.assertGreaterEqual(len(article['editorial']['sources']), 2)
        self.assertFalse(any('text' in source for source in article['editorial']['sources']))

    def test_source_evidence_must_be_a_real_literal_excerpt(self):
        fact = enriched_fact()
        value = research_for(fact)
        value['findings'][0]['evidence'] = 'Uma frase inventada, ausente de todos os documentos.'
        with self.assertRaisesRegex(NewsError, 'research_excerpt_not_in_source'):
            validate_research(value, fact)

    def test_registry_paraphrase_is_rejected_even_with_four_findings(self):
        fact = enriched_fact()
        value = research_for(fact)
        value['findings'] = [copy.deepcopy(value['findings'][0]) for _ in range(4)]
        for index, finding in enumerate(value['findings']):
            finding.update(id=f'f{index + 1}', source_id='contract', evidence=fact['object'])
        with self.assertRaisesRegex(NewsError, 'research_only_repeats_registry'):
            validate_research(value, fact)

    def test_technical_points_must_reference_actual_research_findings(self):
        research = research_for(enriched_fact())
        analysis = analysis_for(research)
        analysis['points'][0]['finding_ids'] = ['f99']
        with self.assertRaisesRegex(NewsError, 'unbound_technical_analysis'):
            validate_analysis(analysis, research)

    def test_every_quality_dimension_has_veto(self):
        review = dict(supported=True, issues=[], factual_accuracy=True, editorial_quality=True,
                      technical_value=True, source_traceability=True, publication_ready=True)
        validate_review(review)
        for key in review:
            bad = copy.deepcopy(review)
            bad[key] = ['not_verified'] if key == 'issues' else False
            with self.subTest(key=key), self.assertRaisesRegex(NewsError, 'editorial_review_rejected'):
                validate_review(bad)

    def test_unknown_private_fields_never_cross_the_public_contract(self):
        fact = enriched_fact()
        fact['editorial_context']['documents'][0]['raw_text'] = 'PRIVATE ATTACHMENT BODY'
        with self.assertRaisesRegex(NewsError, 'unexpected_document_field'):
            validate_fact(fact)
        self.assertNotIn('PRIVATE ATTACHMENT BODY', json.dumps(public_facts(fact)))
        for target in ('context', 'procurement'):
            other = enriched_fact()
            if target == 'context':
                other['editorial_context']['private_note'] = 'PRIVATE NOTE'
            else:
                continue  # The fixture has no procurement; document and root paths are exercised.
            with self.assertRaises(NewsError):
                validate_fact(other)
            self.assertNotIn('PRIVATE NOTE', json.dumps(public_facts(other)))

    def test_private_text_is_absent_but_material_document_identity_survives(self):
        fact = enriched_fact()
        public = public_facts(fact)
        self.assertNotIn('text', public['editorial_context']['documents'][0])
        self.assertEqual(fingerprint(fact), fingerprint(public))
        polled = copy.deepcopy(fact)
        polled['editorial_context']['documents_checked_at'] = '2026-11-20T17:00:00Z'
        polled['editorial_context']['documents'][0]['checked_at'] = '2026-11-20T17:00:00Z'
        self.assertEqual(fingerprint(fact), fingerprint(polled))
        polled['editorial_context']['documents'][0]['sha256'] = 'f' * 64
        self.assertNotEqual(fingerprint(fact), fingerprint(polled))

    def test_source_instant_uses_sao_paulo_but_signature_stays_civil(self):
        fact = enriched_fact()
        fact['source_published_at'] = '2026-11-18T01:00:00Z'
        catalog = json.loads(source_catalog(fact)[0]['text'])
        self.assertEqual(catalog['source_published_at_date'], '2026-11-17')
        self.assertEqual(catalog['signed_at_date'], fact['signed_at'])

    def test_ciminas_civil_dates_accept_brazilian_notation_in_the_draft(self):
        fact = enriched_fact()
        # Exact date fields from PNCP contract 19493732000199-2-000329/2026.
        fact.update(source_published_at='2026-11-16T11:34:34Z', signed_at='2026-10-22',
                    starts_at='2026-10-22', ends_at='2027-09-25')
        draft = editorial_draft(fact)
        draft['paragraphs'][0] += (' O cadastro foi publicado no PNCP em 16/11/2026, '
                                    'com assinatura em 22/10/2026 e vigência até 25/09/2027.')
        validate_draft(draft, fact)

    def test_complete_valid_dates_accept_either_notation(self):
        for source, prose in (
            ('2026-11-16', '16/11/2026'),
            ('16/11/2026', '2026-11-16'),
            ('2028-02-29', '29/02/2028'),
            ('29/02/2028', '2028-02-29'),
        ):
            with self.subTest(source=source, prose=prose):
                _prose(prose, 'date_probe', 1, 100, source)

    def test_legacy_date_separators_preserve_only_the_same_date_and_order(self):
        for source, prose in (
            ('10.11.2026', '10/11/2026'),
            ('2026.11.10', '2026-11-10'),
            ('10-11-2026', '10/11/2026'),
            ('2026/11/10', '2026-11-10'),
            ('29.02.2028', '29/02/2028'),
        ):
            with self.subTest(source=source, prose=prose):
                _prose(prose, 'date_probe', 1, 100, source)
        for source, prose in (
            ('2026.11.10', '10/11/2026'),
            ('10.11.2026', '2026-11-10'),
            ('10 de novembro de 2026', '10/11/2026'),
            ('29.02.2026', '29/02/2026'),
            ('31.11.2026', '31/11/2026'),
            ('77-10.11.2026', '10/11/2026'),
            ('2011.11.20', '20/11/1120'),
        ):
            with self.subTest(source=source, prose=prose), self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
                _prose(prose, 'date_probe', 1, 100, source)

    def test_date_equivalence_requires_a_complete_date_in_the_source(self):
        for source, prose in (
            ('Identificador 16112026.', '16/11/2026'),
            ('Identificador 20261116.', '2026-11-16'),
            ('Dia 16, mês 11 e ano 2026.', '16/11/2026'),
            ('Processo 2026-11-16-329.', '16/11/2026'),
            ('Processo 329-16/11/2026.', '2026-11-16'),
            ('Data 2026-11-16; registro 17.', '17/11/2026'),
        ):
            with self.subTest(source=source, prose=prose), self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
                _prose(prose, 'date_probe', 1, 100, source)

    def test_invalid_calendar_dates_are_rejected_even_if_in_the_source(self):
        for value in ('2026-02-29', '29/02/2026', '2026-11-31', '31/11/2026', '16/13/2026', '0000-11-16'):
            with self.subTest(value=value), self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
                _prose(value, 'date_probe', 1, 100, value)

    def test_process_numbers_keep_their_existing_numeric_binding(self):
        source = 'Contrato 225/2026. Processo 2026-11-16-329. Valor R$ 54.674,84.'
        for value in ('225/2026', '2026-11-16-329', 'R$ 54.674,84'):
            with self.subTest(value=value):
                _prose(value, 'number_probe', 1, 100, source)
        for value in ('2026/225', '226/2026'):
            with self.subTest(value=value), self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
                _prose(value, 'number_probe', 1, 100, source)

    def test_no_paid_work_for_known_incomplete_document_set(self):
        fact = enriched_fact()
        self.assertTrue(editorial_ready(fact))
        for status in ('partial', 'unavailable', 'not_collected'):
            changed = copy.deepcopy(fact)
            changed['editorial_context']['documents_status'] = status
            self.assertFalse(editorial_ready(changed))

    def test_noncanonical_document_links_and_personal_data_are_rejected(self):
        fact = enriched_fact()
        fact['editorial_context']['documents'][0]['url'] = 'https://example.org/document.pdf'
        with self.assertRaisesRegex(NewsError, 'unbound_context_source'):
            validate_fact(fact)
        fact = enriched_fact()
        draft = editorial_draft(fact)
        draft['lead'] += ' CPF 123.456.789-00.'
        with self.assertRaisesRegex(NewsError, 'personal_identifier_in_editorial'):
            validate_draft(draft, fact)

    def test_raw_uppercase_and_fabricated_values_do_not_reach_publication(self):
        fact = enriched_fact()
        draft = editorial_draft(fact)
        draft['title'] = 'CONSTRUCAO DE UNIDADE ESCOLAR COM INSTALACOES ELETRICAS'
        with self.assertRaisesRegex(NewsError, 'raw_uppercase_editorial'):
            validate_draft(draft, fact)
        draft = editorial_draft(fact)
        draft['lead'] += ' O orçamento adicional é de R$ 987.654,32.'
        with self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
            validate_draft(draft, fact)

    def test_registry_and_documentary_source_are_required_before_publication(self):
        fact = enriched_fact()
        draft = editorial_draft(fact)
        draft['editorial']['source_ids'] = ['document-1']
        for section in draft['editorial']['sections']:
            section['source_ids'] = ['document-1']
        with self.assertRaisesRegex(NewsError, 'editorial_lacks_added_value'):
            validate_draft(draft, fact)

    def test_quantities_joined_to_units_still_need_documentary_support(self):
        fact = enriched_fact()
        draft = editorial_draft(fact)
        draft['lead'] += ' O documento prevê luminárias de 987654W.'
        with self.assertRaisesRegex(NewsError, 'uncontrolled_numeric_or_markup_claim'):
            validate_draft(draft, fact)
        fact['editorial_context']['documents'][0]['text'] += ' O projeto prevê luminárias de 200W.'
        draft = editorial_draft(fact)
        draft['lead'] += ' O documento prevê luminárias de 200W.'
        validate_draft(draft, fact)


if __name__ == '__main__':
    unittest.main()
