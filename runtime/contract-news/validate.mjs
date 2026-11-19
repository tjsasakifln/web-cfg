#!/usr/bin/env node
// Offline publication gate, also importable by the publication pipeline.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_SNAPSHOT_BYTES, validatePublication } from './schema.mjs';
import { renderArticle, renderIndex, renderFeed, renderSitemap } from './render.mjs';

export function validateRenderedPublication(snapshot, options = {}) {
  validatePublication(snapshot, options);
  const paths = new Set();
  for (const article of snapshot.articles) {
    const page = renderArticle(article);
    const canonical = 'https://confenge.com.br/noticias/contratos-publicos/' + article.slug + '/';
    if (paths.has(canonical) || !page.html.includes('<link rel="canonical" href="' + canonical + '">') || !page.html.includes('data-asset-family="editorial"')) throw new Error('contract_news_render_identity');
    paths.add(canonical);
    const structured = JSON.parse(page.jsonld)['@graph'].find(item => item['@type'] === 'NewsArticle');
    if (!structured || structured.headline !== article.title || structured.datePublished !== article.published_at || structured.dateModified !== article.modified_at || structured.citation !== article.facts.source_url) throw new Error('contract_news_render_facts');
    if (/<script\b(?![^>]*\b(?:src=|type="application\/ld\+json"))[^>]*>/i.test(page.html)) throw new Error('contract_news_executable_inline_script');
  }
  return { ok: true, schema: snapshot.schema, articles: snapshot.articles.length };
}

async function main() {
  const [, , filename, outputDirectory] = process.argv;
  if (!filename) throw new Error('Usage: node runtime/contract-news/validate.mjs SNAPSHOT_JSON [RENDER_DIRECTORY]');
  const bytes = await readFile(filename);
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw new Error('contract_news_file_size');
  const snapshot = JSON.parse(bytes.toString('utf8'));
  const result = validateRenderedPublication(snapshot);
  if (outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, 'index.html'), renderIndex(snapshot).html);
    for (const article of snapshot.articles) {
      await mkdir(join(outputDirectory, article.slug), { recursive: true });
      await writeFile(join(outputDirectory, article.slug, 'index.html'), renderArticle(article).html);
    }
    await writeFile(join(outputDirectory, 'sitemap.xml'), renderSitemap(snapshot));
    await writeFile(join(outputDirectory, 'news-sitemap.xml'), renderSitemap(snapshot, { news: true }));
    await writeFile(join(outputDirectory, 'feed.xml'), renderFeed(snapshot));
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
