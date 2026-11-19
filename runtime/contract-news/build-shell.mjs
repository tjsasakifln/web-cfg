#!/usr/bin/env node
// A deterministic, empty preview for static builds. Public articles live only
// in the durable runtime publication; no fixture is copied into the site.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PUBLICATION_SCHEMA } from './schema.mjs';
import { renderIndex, renderSitemap, renderFeed } from './render.mjs';
import { validateRenderedPublication } from './validate.mjs';

const snapshot = { schema: PUBLICATION_SCHEMA, generated_at: '2026-11-19T00:00:00Z', articles: [] };
validateRenderedPublication(snapshot);
const directory = fileURLToPath(new URL('../../noticias/contratos-publicos/', import.meta.url));
await mkdir(directory, { recursive: true });
for (const [name, content] of Object.entries({
  'index.html': renderIndex(snapshot).html,
  'sitemap.xml': renderSitemap(snapshot),
  'news-sitemap.xml': renderSitemap(snapshot, { news: true }),
  'feed.xml': renderFeed(snapshot),
})) await writeFile(join(directory, name), content + '\n');
process.stdout.write('Contract news empty preview and feeds generated.\n');
