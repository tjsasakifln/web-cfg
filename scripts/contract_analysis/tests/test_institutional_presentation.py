import hashlib
import re

import pytest
from scripts.contract_analysis.presentation import project_approved_snapshot
from scripts.contract_analysis.render import LEGACY_CANARY_SNAPSHOT


def test_presentation_preserves_the_complete_factual_main_and_metadata():
    original = LEGACY_CANARY_SNAPSHOT.read_text(encoding='utf-8')
    raw_digest = hashlib.sha256(LEGACY_CANARY_SNAPSHOT.read_bytes()).hexdigest()
    current = project_approved_snapshot(original)
    main = lambda text: re.search(r'<main\b.*?</main>', text, re.S).group(0)
    assert main(current).replace('Ol%C3%A1%2C%20CONFENGE.', 'Ol%C3%A1%2C%20Tiago.') == main(original)
    for pattern in (r'<script[^>]*application/ld\+json.*?</script>', r'<link[^>]*canonical[^>]*>', r'<meta[^>]*robots[^>]*>'):
        assert re.findall(pattern, current, re.S) == re.findall(pattern, original, re.S)
    assert 'Biblioteca e provas' not in current
    assert '<strong>Projetos</strong>' in current
    assert 'Ol%C3%A1%2C%20Tiago.' not in current
    assert hashlib.sha256(LEGACY_CANARY_SNAPSHOT.read_bytes()).hexdigest() == raw_digest


def test_unreviewed_snapshot_mutation_fails_closed():
    original = LEGACY_CANARY_SNAPSHOT.read_text(encoding='utf-8')
    with pytest.raises(ValueError, match='snapshot_mismatch'):
        project_approved_snapshot(original.replace('719177.48', '999999.99', 1))
