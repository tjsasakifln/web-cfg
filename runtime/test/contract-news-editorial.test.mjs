import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePublication, PUBLICATION_SCHEMA } from '../contract-news/schema.mjs';
import { renderArticle, renderIndex } from '../contract-news/render.mjs';
import { validateRenderedPublication } from '../contract-news/validate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', `
import json,sys
sys.path.insert(0, 'tests/contract_news')
from editorial_fixtures import enriched_fact, editorial_draft
from scripts.contract_news.core import validate_draft, public_facts, slug_for, EDITORIAL_VERSION
fact = enriched_fact()
candidate = editorial_draft(fact)
draft = validate_draft(candidate, fact)
print(json.dumps({**draft, 'id': fact['id'], 'slug': slug_for(fact, candidate['subject']),
    'category': 'obras', 'published_at': '2026-11-19T12:00:00Z',
    'modified_at': '2026-11-20T12:00:00Z', 'facts': public_facts(fact),
    'editorial_version': EDITORIAL_VERSION}, ensure_ascii=False))
`], { cwd: root, encoding: 'utf8' }));
const snapshot = article => ({ schema: PUBLICATION_SCHEMA, generated_at: '2026-11-20T12:00:00Z', articles: [article] });

test('documentary article preserves dates, distinguishes analysis and links every cited source', () => {
  const value = snapshot(structuredClone(fixture));
  validateRenderedPublication(value);
  const { html, jsonld } = renderArticle(value.articles[0]);
  const news = JSON.parse(jsonld)['@graph'].find(item => item['@type'] === 'NewsArticle');
  assert.equal(news.datePublished, fixture.published_at);
  assert.equal(news.dateModified, fixture.modified_at);
  assert.deepEqual(news.citation, fixture.editorial.sources.map(source => source.url));
  assert.ok(news.wordCount > 320);
  assert.match(html, /data-editorial-version="2026-11-20.1"/);
  assert.match(html, /Análise técnica da CONFENGE/);
  assert.match(html, /Valor global no cadastro PNCP/);
  assert.match(html, /<details class="news-original"><summary>/);
  assert.doesNotMatch(html, /<details class="news-original" open/);
  for (const source of fixture.editorial.sources) {
    assert.ok(html.includes('id="news-source-' + source.id + '"'));
    assert.ok(html.includes('href="' + source.url + '"'));
  }
  for (const section of fixture.editorial.sections) {
    assert.ok(news.articleBody.includes(section.paragraphs[0]));
  }
  const index = renderIndex(value).html;
  assert.match(index, /Notícia com análise técnica/);
  assert.doesNotMatch(index, /R\$ 2\.000\.000,00/);
});

test('private documentary text and unbound public references fail before rendering', () => {
  const privateText = structuredClone(fixture);
  privateText.facts.editorial_context.documents[0].text = 'Private extracted documentary body';
  assert.throws(() => validatePublication(snapshot(privateText)), /private_or_invalid_document/);
  const wrongSource = structuredClone(fixture);
  wrongSource.editorial.sources[1].url = 'https://example.com/unrelated';
  assert.throws(() => validatePublication(snapshot(wrongSource)), /unbound_editorial_source/);
  const missingSource = structuredClone(fixture);
  missingSource.editorial.sections[0].source_ids = ['document-99'];
  assert.throws(() => validatePublication(snapshot(missingSource)), /editorial_references/);
});

test('reporting content is escaped in visible markup and structured data', () => {
  const article = structuredClone(fixture);
  article.editorial.sections[0].paragraphs[0] = '<img src=x onerror=alert(1)> & documento';
  const { html, jsonld } = renderArticle(article);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; documento'));
  assert.doesNotMatch(html, /<img src=x/);
  assert.ok(jsonld.includes('\\u003cimg'));
});
