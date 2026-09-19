// Render each plate SVG in Chromium with the real Archivo subset embedded, at 1200 (desktop) and 360 (mobile) CSS px, 2x DPR.
// Usage: node scripts/demonstrative/plates/capture_plates.cjs [outDir] [filter]
// Env: PUPPETEER_CORE (path to puppeteer-core), CHROME (Chromium binary).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const puppeteer = require(process.env.PUPPETEER_CORE || path.join(ROOT, 'node_modules/puppeteer-core'));
const CHROME = process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome');
const OUT = process.argv[2] || path.join(ROOT, 'docs/campaigns/design-institucional/evidence/pranchas');
const only = process.argv[3];
const FONT = fs.readFileSync(path.join(ROOT, 'assets/archivo-var-latin-b19be0f7.woff2')).toString('base64');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true, args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(path.join(ROOT, 'assets/pranchas')).filter(f => f.endsWith('.svg') && (!only || f.includes(only)));
  for (const f of files) {
    const svg = fs.readFileSync(path.join(ROOT, 'assets/pranchas', f), 'utf8');
    const mobile = f.endsWith('-mobile.svg');
    const width = mobile ? 360 : 1200;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face{font-family:'Archivo Var';src:url('data:font/woff2;base64,${FONT}') format('woff2');font-weight:100 900;font-display:block}
      html,body{margin:0;background:#e9ecef}
      figure{margin:0;width:${width}px}
      svg{display:block;width:${width}px;height:auto}
    </style></head><body><figure>${svg}</figure></body></html>`;
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fam = await page.evaluate(() => getComputedStyle(document.querySelector('svg text')).fontFamily);
    const loaded = await page.evaluate(() => document.fonts.check("650 16px 'Archivo Var'"));
    const el = await page.$('figure');
    const box = await el.boundingBox();
    const out = path.join(OUT, f.replace('.svg', `-${width}.png`));
    await el.screenshot({ path: out });
    console.log(`${f} -> ${path.relative(ROOT, out)} ${Math.round(box.width)}x${Math.round(box.height)} font=${fam} loaded=${loaded}`);
    await page.close();
  }
  await browser.close();
})();
