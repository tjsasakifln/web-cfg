import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContractNews, createPublicationStore } from '../contract-news/server.mjs';
import { PUBLICATION_SCHEMA, POINTER_SCHEMA, PREFIX, validatePublication, assetId } from '../contract-news/schema.mjs';
import { renderArticle, renderSitemap, renderFeed, money } from '../contract-news/render.mjs';
import { validateRenderedPublication } from '../contract-news/validate.mjs';

const NOW = new Date('2026-11-19T16:00:00Z');
function article(index = 1, overrides = {}) {
  return {
    id: '12345678000195-2-' + String(index).padStart(6, '0') + '/2026',
    slug: 'saneamento-prefeitura-contrato-' + index,
    title: 'Município registra contrato de saneamento ' + index,
    description: 'Contrato de obras registrado no PNCP com valor global de R$ 9.345.678,90.',
    lead: 'O município registrou contrato para a implantação de redes de saneamento.',
    paragraphs: ['O objeto registrado compreende implantação de redes e serviços de engenharia.', 'A vigência informada no registro se estende até o ano seguinte.'],
    category: 'saneamento',
    published_at: '2026-11-19T13:00:00Z',
    modified_at: '2026-11-19T13:00:00Z',
    facts: {
      id: '12345678000195-2-' + String(index).padStart(6, '0') + '/2026', supplier_type: 'PJ', buyer: 'Prefeitura Municipal de Exemplo', supplier: 'Engenharia Exemplo Ltda.',
      object: 'Execução de redes de saneamento e serviços de engenharia.',
      value: { amount: '9345678.90', kind: 'valorGlobal', currency: 'BRL' },
      source_url: 'https://pncp.gov.br/app/contratos/12345678000195/2026/' + index,
      source_published_at: '2026-11-18', source_checked_at: NOW.toISOString(),
      signed_at: '2026-11-16', starts_at: '2026-11-18', ends_at: '2027-11-18',
      administrative_location: { city: 'Florianópolis', state: 'SC' },
    },
    ...overrides,
  };
}
function publication(articles = [article()]) { return { schema: PUBLICATION_SCHEMA, generated_at: NOW.toISOString(), articles }; }
async function publish(directory, snapshot) {
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = 'snapshot-' + sha256 + '.json';
  await writeFile(join(directory, file), bytes);
  const pointer = { schema: POINTER_SCHEMA, file, sha256, generated_at: snapshot.generated_at, article_count: snapshot.articles.length };
  await writeFile(join(directory, 'next.json'), JSON.stringify(pointer));
  await rename(join(directory, 'next.json'), join(directory, 'current.json'));
  return pointer;
}
async function setup(snapshot) {
  const directory = await mkdtemp(join(tmpdir(), 'confenge-contract-news-'));
  if (snapshot) await publish(directory, snapshot);
  const serve = createContractNews({ directory, now: () => NOW });
  const server = createServer(async (req, res) => { if (!await serve(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    directory, server, origin: 'http://127.0.0.1:' + server.address().port,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); },
  };
}

test('serves indexable article HTML, exact facts, metadata and contextual continuation without executable inline scripts', async () => {
  const fixture = publication();
  const app = await setup(fixture);
  try {
    const response = await fetch(app.origin + PREFIX + fixture.articles[0].slug + '/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8/);
    assert.match(response.headers.get('content-security-policy'), /style-src 'self'/);
    assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/);
    const html = await response.text();
    assert.match(html, /<h1>Município registra contrato de saneamento 1<\/h1>/);
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large">/);
    assert.match(html, /Valor global registrado/);
    assert.match(html, /R\$ 9\.345\.678,90/);
    assert.match(html, /Localização da unidade do órgão/);
    assert.match(html, /href="\/acompanhamento-contratos-obras\/"/);
    assert.match(html, /href="\/ferramentas\/radar-mercado-publico\/"/);
    assert.match(html, /href="\/triagem-tecnica\/#corrigir-o-site"/);
    assert.doesNotMatch(html, /<script\b(?![^>]*(?:src=|type="application\/ld\+json"))[^>]*>/i);
    const jsonld = JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
    const news = jsonld['@graph'].find(item => item['@type'] === 'NewsArticle');
    assert.equal(news.datePublished, fixture.articles[0].published_at);
    assert.equal(news.dateModified, fixture.articles[0].modified_at);
    assert.equal(news.citation, fixture.articles[0].facts.source_url);
    assert.equal(news.author['@type'], 'Organization');
    assert.equal(news.author.name, 'CONFENGE');
    assert.ok(html.includes('data-asset-id="' + assetId(fixture.articles[0]) + '"'));
    assert.ok(!assetId(fixture.articles[0]).includes('12345678000195'));
    const head = await fetch(response.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(html)));
    assert.equal(await head.text(), '');
    const cached = await fetch(response.url, { headers: { 'If-None-Match': response.headers.get('etag') } });
    assert.equal(cached.status, 304);
  } finally { await app.close(); }
});

test('snapshot-backed pagination is crawlable, canonical and bounded; a new atomic pointer updates cached publication', async () => {
  const fixture = publication(Array.from({ length: 14 }, (_, index) => article(index + 1)));
  const app = await setup(fixture);
  try {
    let response = await fetch(app.origin + PREFIX);
    let html = await response.text();
    assert.equal(response.status, 200);
    assert.equal((html.match(/<article class="news-card">/g) || []).length, 12);
    assert.ok(html.includes('href="' + PREFIX + 'pagina/2/"'));
    response = await fetch(app.origin + PREFIX + 'pagina/2/');
    html = await response.text();
    assert.equal(response.status, 200);
    assert.equal((html.match(/<article class="news-card">/g) || []).length, 2);
    assert.ok(html.includes('rel="canonical" href="https://confenge.com.br' + PREFIX + 'pagina/2/"'));
    assert.equal((await fetch(app.origin + PREFIX + 'pagina/999/')).status, 404);
    const first = await fetch(app.origin + PREFIX + 'pagina/1/', { redirect: 'manual' });
    assert.equal(first.status, 308);
    assert.equal(first.headers.get('location'), PREFIX);
    const alias = await fetch(app.origin + PREFIX.slice(0, -1), { redirect: 'manual' });
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('location'), PREFIX);
    await publish(app.directory, publication([article(95)]));
    const updates = await Promise.all(Array.from({ length: 3 }, () => fetch(app.origin + PREFIX).then(result => result.text())));
    assert.ok(updates.every(body => body.includes('saneamento-prefeitura-contrato-95')));
    assert.ok(updates.every(body => !body.includes('saneamento-prefeitura-contrato-14')));
  } finally { await app.close(); }
});

test('ordinary sitemap keeps historical articles; news sitemap uses original publication within 48 hours, RSS escapes text', async () => {
  const old = article(2, { published_at: '2026-11-01T13:00:00Z', modified_at: NOW.toISOString() });
  const fresh = article(1, { title: 'Saneamento & infraestrutura <regional>' });
  const snapshot = publication([fresh, old]);
  const xml = renderSitemap(snapshot, { now: NOW });
  assert.ok(xml.includes(old.slug));
  assert.ok(xml.includes('<lastmod>' + old.modified_at + '</lastmod>'));
  const news = renderSitemap(snapshot, { news: true, now: NOW });
  assert.ok(!news.includes(old.slug));
  assert.ok(news.includes(fresh.slug));
  assert.ok(news.includes('Saneamento &amp; infraestrutura &lt;regional&gt;'));
  assert.ok(news.includes('<news:publication_date>' + fresh.published_at + '</news:publication_date>'));
  const feed = renderFeed(snapshot);
  assert.ok(feed.includes('Saneamento &amp; infraestrutura &lt;regional&gt;'));
  assert.match(feed, /<guid isPermaLink="true">https:\/\/confenge\.com\.br\/noticias\/contratos-publicos\//);
  const app = await setup(snapshot);
  try {
    for (const endpoint of ['sitemap.xml', 'news-sitemap.xml', 'feed.xml']) {
      const response = await fetch(app.origin + PREFIX + endpoint);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), endpoint === 'feed.xml' ? /^application\/rss\+xml/ : /^application\/xml/);
    }
    const articleResponse = await fetch(app.origin + PREFIX + old.slug + '/');
    assert.equal(articleResponse.status, 200, 'historical news does not expire');
  } finally { await app.close(); }
});

test('all text fields are escaped, JSON-LD cannot terminate its script, exact decimal rendering preserves cents', () => {
  const malicious = '</script><script>alert("x")</script> & <img src=x onerror=alert(1)>';
  const item = article(1, { title: malicious, description: malicious, lead: malicious, paragraphs: [malicious], category: '<x> & y' });
  item.facts.buyer = malicious; item.facts.supplier = malicious; item.facts.object = malicious;
  const rendered = renderArticle(item);
  assert.ok(!rendered.html.includes('<script>alert'));
  assert.ok(!rendered.html.includes('<img src=x'));
  assert.ok(rendered.html.includes('&lt;/script&gt;'));
  assert.ok(rendered.jsonld.includes('\\u003c/script>'));
  assert.equal(JSON.parse(rendered.jsonld)['@graph'].find(entry => entry['@type'] === 'NewsArticle').headline, malicious);
  assert.equal(money('1234567890123456.09'), 'R$ 1.234.567.890.123.456,09');
  assert.equal(money('1.2'), 'R$ 1,20');
  assert.equal(money('1.2344'), 'R$ 1,23');
  assert.equal(money('1.2350'), 'R$ 1,24');
  assert.equal(money('999999999999999.9999'), 'R$ 1.000.000.000.000.000,00');
});

test('failed, missing, corrupt and unsafe snapshots fail closed without affecting other paths', async () => {
  const app = await setup();
  try {
    for (const suffix of ['', 'sitemap.xml', 'news-sitemap.xml', 'feed.xml']) {
      const url = app.origin + PREFIX + suffix;
      const response = await fetch(url);
      assert.equal(response.status, 503, suffix);
      assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(response.headers.get('x-confenge-news-state'), 'unavailable');
      assert.equal(response.headers.get('retry-after'), '300');
      const html = await response.text();
      assert.match(html, /temporariamente indisponíveis/);
      assert.match(html, /href="mailto:/);
      const head = await fetch(url, { method: 'HEAD' });
      assert.equal(head.status, 503, suffix);
      for (const header of ['cache-control', 'content-type', 'content-security-policy', 'x-robots-tag', 'x-confenge-news-state', 'retry-after']) {
        assert.equal(head.headers.get(header), response.headers.get(header), header);
      }
      assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(html)));
      assert.equal(await head.text(), '');
    }
    const pointer = await publish(app.directory, publication());
    await writeFile(join(app.directory, pointer.file), '{"tampered":true}');
    const response = await fetch(app.origin + PREFIX);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
    assert.ok(!(await response.text()).includes('tampered'));
    await writeFile(join(app.directory, 'current.json'), JSON.stringify({ ...pointer, file: '../secrets.json' }));
    assert.equal((await fetch(app.origin + PREFIX)).status, 503);
    await publish(app.directory, publication());
    for (const method of ['GET', 'HEAD']) {
      const missing = await fetch(app.origin + PREFIX + 'unknown-news/', { method });
      assert.equal(missing.status, 404);
      assert.equal(missing.headers.get('cache-control'), 'no-store, no-transform');
      assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');
      if (method === 'HEAD') assert.equal(await missing.text(), '');
    }
    for (const path of ['current.json', 'snapshot-abc.json', '.env', '%2e%2e%2f.env', 'a%2fb/', 'pagina/0/', 'pagina/0002/', 'sitemap.xml/']) {
      assert.equal((await fetch(app.origin + PREFIX + path, { redirect: 'manual' })).status, 404, path);
    }
    const unsupported = await fetch(app.origin + PREFIX, { method: 'POST', body: 'ignored' });
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get('allow'), 'GET, HEAD');
    assert.equal(unsupported.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(unsupported.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal((await fetch(app.origin + '/other-route/')).status, 404);
  } finally { await app.close(); }
});

test('pointer binding, schema, identities, dates and value semantics are enforced before publication', async () => {
  const valid = publication();
  assert.equal(validatePublication(valid, { now: NOW }), valid);
  assert.deepEqual(validateRenderedPublication(valid, { now: NOW }), { ok: true, schema: PUBLICATION_SCHEMA, articles: 1 });
  const mutations = [
    snapshot => { snapshot.schema = 'other'; },
    snapshot => { snapshot.articles[0].facts.supplier_type = 'PF'; },
    snapshot => { snapshot.articles[0].facts.id = '12345678000195-2-000099/2026'; },
    snapshot => { snapshot.articles[0].category = 'publicidade'; },
    snapshot => { snapshot.articles.push(structuredClone(snapshot.articles[0])); },
    snapshot => { snapshot.articles[0].facts.value.kind = 'valor_total'; },
    snapshot => { snapshot.articles[0].facts.value.amount = 100; },
    snapshot => { snapshot.articles[0].facts.value.amount = '-10.00'; },
    snapshot => { snapshot.articles[0].facts.value.amount = '1e8'; },
    snapshot => { snapshot.articles[0].facts.source_url = 'https://evil.example/'; },
    snapshot => { snapshot.articles[0].facts.source_url = 'https://pncp.gov.br/app/contratos/12345678000195/2026/2'; },
    snapshot => { snapshot.articles[0].facts.source_url += '?redirect=evil'; },
    snapshot => { snapshot.articles[0].facts.source_published_at = '2026-02-30'; },
    snapshot => { snapshot.articles[0].published_at = '2026-12-19T13:00:00Z'; },
    snapshot => { snapshot.articles[0].modified_at = '2026-11-01T13:00:00Z'; },
    snapshot => { snapshot.articles[0].slug = '../escape'; },
    snapshot => { snapshot.articles[0].slug = 'contrato-12345678000195'; },
    snapshot => { snapshot.articles[0].facts.administrative_location.state = 'XX'; },
  ];
  for (const mutate of mutations) { const snapshot = structuredClone(valid); mutate(snapshot); assert.throws(() => validatePublication(snapshot, { now: NOW }), /contract_news_invalid:/); }
  const directory = await mkdtemp(join(tmpdir(), 'confenge-news-pointer-'));
  try {
    const pointer = await publish(directory, valid);
    await writeFile(join(directory, 'current.json'), JSON.stringify({ ...pointer, article_count: 9 }));
    await assert.rejects(createPublicationStore(directory, { now: () => NOW })(), /pointer_mismatch/);
    await rm(join(directory, 'current.json'));
    await writeFile(join(directory, 'pointer-other.json'), JSON.stringify(pointer));
    await symlink(join(directory, 'pointer-other.json'), join(directory, 'current.json'));
    await assert.rejects(createPublicationStore(directory, { now: () => NOW })());
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an empty validated publication is visibly empty and never indexable', async () => {
  const app = await setup(publication([]));
  try {
    const response = await fetch(app.origin + PREFIX);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    const html = await response.text();
    assert.match(html, /Novas publicações em preparação/);
    assert.match(html, /<meta name="robots" content="noindex,follow">/);
    assert.equal((html.match(/<article class="news-card">/g) || []).length, 0);
  } finally { await app.close(); }
});
