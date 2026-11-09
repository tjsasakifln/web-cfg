// Rasterize the deterministic artwork from render_tool_showcase.py --social-sources.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const sources = process.argv[2];
if (!sources) throw new Error('Pass the directory created by --social-sources.');
const files = (await readdir(sources)).filter(name => /^[a-z0-9-]+\.html$/.test(name));
if (!files.length) throw new Error('No artwork sources found.');
const browser = await puppeteer.launch({
  executablePath: resolveChromePath() || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  for (const file of files) {
    await page.setContent(await readFile(join(sources, file), 'utf8'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const contained = await page.$eval('.cover', cover =>
      cover.scrollWidth <= 1200 && cover.scrollHeight <= 630 && cover.querySelector('h1').getBoundingClientRect().bottom <= 570);
    if (!contained) throw new Error('Share artwork overflows: ' + file);
    await page.screenshot({ path: resolve('assets/tool-showcase', file.replace(/\.html$/, '.jpg')), type: 'jpeg', quality: 84 });
  }
} finally {
  await browser.close();
}
console.log('Rendered ' + files.length + ' share cards.');
