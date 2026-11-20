import { createHash } from 'node:crypto';

export const PUBLICATION_SCHEMA = 'confenge.contract-news-publication/v1';
export const POINTER_SCHEMA = 'confenge.contract-news-pointer/v1';
export const PREFIX = '/noticias/contratos-publicos/';
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
// The archive sitemap reserves one entry for the section index.
export const MAX_ARTICLES = 49_999;
export const PAGE_SIZE = 12;
export const CATEGORIES = Object.freeze(['obras', 'saneamento', 'infraestrutura', 'projetos', 'manutencao']);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const PNCP_ID = /^(\d{14})-2-(\d{6})\/(\d{4})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

function fail(field) { throw new Error('contract_news_invalid:' + field); }
function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
}
function text(value, field, max, optional = false) {
  if (optional && value === null) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(field);
}
function instant(value, field, now) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now + 300_000) fail(field);
  return Date.parse(value);
}
function sourceDate(value, field, { optional = false, now } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) fail(field);
  if (value.length > 40) fail(field);
  const day = value.slice(0, 10);
  if (new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) fail(field);
  if (now && Date.parse(value) > now + 86_400_000) fail(field);
}

function validateEditorial(article, identity, clock) {
  if (article.editorial_version != null && !/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/.test(article.editorial_version)) fail('editorial_version');
  const editorial = article.editorial;
  if (editorial == null) return;
  if (!article.editorial_version) fail('editorial_version_missing');
  record(editorial, 'editorial');
  record(editorial.display, 'editorial_display');
  for (const key of ['buyer', 'supplier', 'object']) text(editorial.display[key], 'display_' + key, 700);
  if (!Array.isArray(editorial.summary) || editorial.summary.length !== 3) fail('editorial_summary');
  for (const item of editorial.summary) text(item, 'summary', 400);
  if (!Array.isArray(editorial.sections) || editorial.sections.length < 3 || editorial.sections.length > 5) fail('editorial_sections');
  if (!Array.isArray(editorial.sources) || editorial.sources.length < 2 || editorial.sources.length > 5) fail('editorial_sources');
  const context = article.facts.editorial_context || {};
  const expected = new Map([['contract', article.facts.source_url]]);
  if (context.procurement) {
    const match = /^(\d{14})-1-(\d{6})\/(\d{4})$/.exec(context.procurement.id || '');
    if (!match || match[1] !== identity[1]) fail('procurement_identity');
    const url = `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`;
    if (context.procurement.source_url !== url) fail('procurement_url');
    expected.set('procurement', url);
  }
  if (context.documents != null) {
    if (!Array.isArray(context.documents) || context.documents.length > 3) fail('documents');
    const docs = new Set();
    for (const document of context.documents) {
      record(document, 'document');
      if ('text' in document || !/^[1-9]\d{0,8}$/.test(String(document.id)) || docs.has(String(document.id))) fail('private_or_invalid_document');
      docs.add(String(document.id));
      const url = `https://pncp.gov.br/pncp-api/v1/orgaos/${identity[1]}/contratos/${identity[3]}/${Number(identity[2])}/arquivos/${document.id}`;
      if (document.url !== url || !/^[a-f0-9]{64}$/.test(document.sha256)) fail('document_provenance');
      expected.set('document-' + document.id, url);
    }
  }
  const ids = new Set();
  for (const source of editorial.sources) {
    record(source, 'editorial_source');
    if (!expected.has(source.id) || expected.get(source.id) !== source.url || ids.has(source.id) || 'text' in source) fail('unbound_editorial_source');
    ids.add(source.id);
    text(source.title, 'source_title', 500);
    instant(source.checked_at, 'source_checked_at', clock);
    if (source.sha256 != null && !/^[a-f0-9]{64}$/.test(source.sha256)) fail('editorial_source_digest');
  }
  const refs = value => {
    if (!Array.isArray(value) || !value.length || value.length > 5 || new Set(value).size !== value.length || value.some(id => !ids.has(id))) fail('editorial_references');
  };
  refs(editorial.source_ids);
  const kinds = new Set();
  for (const section of editorial.sections) {
    record(section, 'editorial_section');
    text(section.heading, 'section_heading', 130);
    if (!['context', 'technical', 'watch'].includes(section.kind)) fail('section_kind');
    kinds.add(section.kind);
    refs(section.source_ids);
    if (!Array.isArray(section.paragraphs) || !section.paragraphs.length || section.paragraphs.length > 3) fail('section_paragraphs');
    for (const paragraph of section.paragraphs) text(paragraph, 'section_paragraph', 2000);
  }
  if (!kinds.has('context') || !kinds.has('technical')) fail('editorial_depth');
}

export function assetId(article) {
  return 'news-' + createHash('sha256').update(article.id).digest('hex').slice(0, 16);
}

export function validatePointer(pointer) {
  record(pointer, 'pointer');
  if (pointer.schema !== POINTER_SCHEMA || !/^[a-f0-9]{64}$/.test(pointer.sha256 || '') || pointer.file !== 'snapshot-' + pointer.sha256 + '.json') fail('pointer_identity');
  if (!Number.isSafeInteger(pointer.article_count) || pointer.article_count < 0 || pointer.article_count > MAX_ARTICLES) fail('pointer_count');
  if (typeof pointer.generated_at !== 'string' || !ISO_INSTANT.test(pointer.generated_at) || !Number.isFinite(Date.parse(pointer.generated_at))) fail('pointer_date');
  return pointer;
}

export function validatePublication(snapshot, { now = new Date() } = {}) {
  record(snapshot, 'publication');
  const clock = new Date(now).getTime();
  if (!Number.isFinite(clock) || snapshot.schema !== PUBLICATION_SCHEMA) fail('schema');
  const generatedAt = instant(snapshot.generated_at, 'generated_at', clock);
  if (!Array.isArray(snapshot.articles) || snapshot.articles.length > MAX_ARTICLES) fail('articles');
  const ids = new Set();
  const slugs = new Set();
  for (const article of snapshot.articles) {
    record(article, 'article');
    const identity = typeof article.id === 'string' && PNCP_ID.exec(article.id);
    if (!identity || ids.has(article.id)) fail('id');
    if (typeof article.slug !== 'string' || article.slug.length > 180 || !SLUG.test(article.slug) || ['pagina', 'index', 'sitemap', 'feed', 'news-sitemap'].includes(article.slug) || slugs.has(article.slug) || article.slug.includes(identity[1])) fail('slug');
    ids.add(article.id); slugs.add(article.slug);
    for (const [key, max] of [['title', 200], ['description', 400], ['lead', 2000], ['category', 100]]) text(article[key], key, max);
    if (!Array.isArray(article.paragraphs) || article.paragraphs.length < 1 || article.paragraphs.length > 12) fail('paragraphs');
    if (!CATEGORIES.includes(article.category)) fail('category');
    for (const paragraph of article.paragraphs) text(paragraph, 'paragraph', 6500);
    const published = instant(article.published_at, 'published_at', clock);
    const modified = instant(article.modified_at, 'modified_at', clock);
    if (modified < published || modified > generatedAt + 1000) fail('publication_order');
    const facts = article.facts;
    record(facts, 'facts');
    if (facts.id !== article.id || facts.supplier_type !== 'PJ') fail('fact_identity');
    text(facts.buyer, 'buyer', 500);
    text(facts.supplier, 'supplier', 500);
    text(facts.object, 'object', 12_000);
    record(facts.value, 'value');
    if (typeof facts.value.amount !== 'string' || !/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(facts.value.amount) || !/[1-9]/.test(facts.value.amount) || !['valorGlobal', 'valorInicial'].includes(facts.value.kind) || facts.value.currency !== 'BRL') fail('value');
    let source;
    try { source = new URL(facts.source_url); } catch { fail('source_url'); }
    const path = /^\/app\/contratos\/(\d{14})\/(\d{4})\/(\d+)\/?$/.exec(source.pathname);
    if (source.protocol !== 'https:' || source.hostname !== 'pncp.gov.br' || source.port || source.username || source.password || source.search || source.hash || !path || path[1] !== identity[1] || path[2] !== identity[3] || Number(path[3]) !== Number(identity[2])) fail('source_url');
    sourceDate(facts.source_published_at, 'source_published_at', { now: clock });
    instant(facts.source_checked_at, 'source_checked_at', clock);
    for (const key of ['signed_at', 'starts_at', 'ends_at']) sourceDate(facts[key], key, { optional: true });
    if (facts.source_updated_at != null) sourceDate(facts.source_updated_at, 'source_updated_at');
    if (facts.source_sha256 != null && !/^[a-f0-9]{64}$/.test(facts.source_sha256)) fail('source_sha256');
    record(facts.administrative_location, 'administrative_location');
    if (facts.administrative_location.city != null && facts.administrative_location.city !== '') text(facts.administrative_location.city, 'city', 160);
    if (facts.administrative_location.state != null && facts.administrative_location.state !== '' && !STATES.has(facts.administrative_location.state)) fail('state');
    validateEditorial(article, identity, clock);
  }
  return snapshot;
}
