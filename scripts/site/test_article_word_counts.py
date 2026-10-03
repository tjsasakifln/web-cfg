"""Check rendered Article metadata against its final visible article."""
import json
import re
from pathlib import Path

from scripts.site.public_copy_scope import visible_text
from scripts.site.sync_article_word_counts import sync_word_count


def article_counts(root):
    checked = 0
    failures = []
    for path in root.rglob('*.html'):
        text = path.read_text(encoding='utf-8')
        article = re.search(r'<article\b.*?</article>', text, re.I | re.S)
        if not article:
            continue
        words = len(visible_text(article.group(0)).split())
        for raw in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', text, re.I | re.S):
            data = json.loads(raw)
            for node in data.get('@graph', [data]):
                if node.get('@type') in {'Article', 'TechArticle', 'BlogPosting'} and 'wordCount' in node:
                    checked += 1
                    if node['wordCount'] != words:
                        failures.append((path.relative_to(root).as_posix(), node['wordCount'], words))
    return checked, failures


def test_sync_after_responsive_token_wrapper_preserves_visible_text():
    text = '<script type="application/ld+json">{"@type":"Article","wordCount":1,"dateModified":"2026-08-29"}</script><article>Fonte <span class="opaque-token">23456/2026-44</span>, consultada.</article>'
    final = sync_word_count(text)
    assert '<article>' + final.split('<article>', 1)[1] == '<article>' + text.split('<article>', 1)[1]
    assert '"dateModified":"2026-08-29"' in final
    assert '"wordCount":4' in final
    assert sync_word_count(final) == final


def test_complete_published_article_census():
    root = Path(__file__).resolve().parents[2] / '_site'
    assert root.is_dir(), 'build public artifact before verifying final metadata'
    checked, failures = article_counts(root)
    assert checked >= 119, 'Article census unexpectedly shrank'
    assert not failures, failures


def test_census_detects_corrupted_final_metadata(tmp_path):
    (tmp_path / 'index.html').write_text('<script type="application/ld+json">{"@type":"TechArticle","wordCount":99}</script><article>Dois termos.</article>', encoding='utf-8')
    checked, failures = article_counts(tmp_path)
    assert checked == 1
    assert failures == [('index.html', 99, 2)]
