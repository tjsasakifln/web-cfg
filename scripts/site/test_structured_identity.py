from __future__ import annotations

import json
from pathlib import Path

from scripts.pseo.public_artifact import audit_public_artifact
from scripts.site.structured_identity import audit_html, sanitize_html, sanitize_tree


def test_sanitizer_removes_only_unsupported_identity_and_credentials() -> None:
    payload = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Organization", "name": "CONFENGE", "legalName": "owned", "taxID": "owned", "sameAs": ["https://example.test/org"], "url": "https://confenge.com.br/"},
            {"@type": "Person", "name": "Engº Tiago Sasaki", "sameAs": ["https://example.test"], "jobTitle": "owned", "alumniOf": {"@type": "CollegeOrUniversity", "name": "owned"}, "hasCredential": {"name": "owned"}, "url": "https://confenge.com.br/especialista/tiago-jun-sasaki/"},
            {"@type": "ProfilePage", "name": "Engº Tiago Sasaki | Engenheiro Civil e consultor B2G", "mainEntity": {"@id": "https://confenge.com.br/#tiago"}},
        ],
    }
    html = f'<script type="application/ld+json">{json.dumps(payload)}</script>'
    sanitized, removed = sanitize_html(html)
    assert removed == 9
    assert audit_html(sanitized) == []
    assert '"name":"CONFENGE"' in sanitized
    assert sanitized.count('"name":"Tiago Sasaki"') == 2
    assert '"url":"https://confenge.com.br/"' in sanitized


def test_public_artifact_sanitization_is_fail_closed(tmp_path: Path) -> None:
    page = tmp_path / "index.html"
    page.write_text(
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"Organization","name":"CONFENGE","legalName":"unsupported","taxID":"unsupported"}'
        '</script>',
        encoding="utf-8",
    )
    report = sanitize_tree(tmp_path)
    assert report == {"html_scanned": 1, "html_rewritten": 1, "fields_removed": 2}
    assert audit_html(page.read_text(encoding="utf-8")) == []


def test_live_source_contains_no_structured_credential_object() -> None:
    root = Path(__file__).resolve().parents[2]
    specialist = (root / "especialista" / "tiago-jun-sasaki" / "index.html").read_text(encoding="utf-8")
    sanitized, _removed = sanitize_html(specialist)
    assert audit_html(sanitized) == []
    assert "hasCredential" not in sanitized


def test_public_artifact_audit_rejects_reintroduced_identity_claim(tmp_path: Path) -> None:
    artifact = tmp_path / "_site"
    artifact.mkdir()
    (artifact / "index.html").write_text(
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"Organization","name":"CONFENGE","legalName":"unsupported"}'
        '</script>',
        encoding="utf-8",
    )
    report = audit_public_artifact(tmp_path)
    assert any(
        finding["code"] == "unsupported_structured_identity"
        and finding["path"] == "index.html"
        for finding in report["findings"]
    )


def test_audit_rejects_organization_same_as_and_credential_in_name() -> None:
    html = (
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@graph":['
        '{"@type":"Organization","name":"CONFENGE","sameAs":["https://example.test"]},'
        '{"@type":"Person","name":"Engº Tiago Sasaki"},'
        '{"@type":"ProfilePage","name":"Tiago Sasaki | Engenheiro Civil"}'
        ']}</script>'
    )
    errors = audit_html(html)
    assert any(error.endswith(".sameAs") for error in errors)
    assert sum("unsupported_structured_credential_name" in error for error in errors) == 2
