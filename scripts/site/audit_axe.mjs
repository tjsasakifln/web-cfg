/**
 * axe-core audit on critical commercial pages via puppeteer + system Chrome.
 * Installs axe-core on demand if missing from node_modules.
 * Usage: node scripts/site/audit_axe.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require = createRequire(import.meta.url);
const PORT = 8793;
const CHROME = resolveChromePath();
const PAGES = [
  "/", // home includes Netlify form #contato (formulário surface)
  "/diretoria-b2g/",
  "/diagnostico-b2g-360/",
  "/bid-room-licitacoes-obras/",
  "/defesa-margem-contratos-publicos/",
  "/ferramentas/diagnostico-defesa-margem/",
  "/especialista/tiago-jun-sasaki/",
  "/inteligencia/",
  "/conteudos/",
  "/obrigado.html",
  "/404.html",
  // Three representative pSEO / intelligence content pages
  "/inteligencia/cenarios/inconsistencia-orcamento-edital/",
  "/inteligencia/cenarios/referencia-sinapi-sicro-margem/",
  "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
];

let axeSource;
try {
  const axePath = require.resolve("axe-core/axe.min.js");
  axeSource = readFileSync(axePath, "utf8");
} catch {
  console.error("axe-core not installed. Run: npm install --no-save axe-core");
  process.exit(2);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

const baseArg = process.argv[2];
const server = baseArg ? null : await startServer();
const BASE = baseArg || `http://127.0.0.1:${PORT}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const report = { generated_at: new Date().toISOString(), pages: [], critical: 0, serious: 0, moderate: 0, minor: 0 };
let hardFail = 0;

for (const path of PAGES) {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    });
  });
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const violations = (results.violations || []).map((v) => {
    counts[v.impact] = (counts[v.impact] || 0) + 1;
    return {
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target),
    };
  });
  report.pages.push({ path, counts, violations });
  report.critical += counts.critical || 0;
  report.serious += counts.serious || 0;
  report.moderate += counts.moderate || 0;
  report.minor += counts.minor || 0;
  if ((counts.critical || 0) + (counts.serious || 0) > 0) hardFail += 1;
  console.log(path, JSON.stringify(counts), violations.length ? violations.map((v) => v.id).join(",") : "clean");
}

await browser.close();
if (server) server.close();

const outDir = join(ROOT, "docs/uiux-evidence");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "axe-report.json");
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log("wrote", outFile);

if (hardFail) {
  console.error(`FAIL: ${hardFail} page(s) with critical/serious axe violations`);
  process.exit(1);
}
console.log("OK audit:axe — zero critical/serious");
process.exit(0);
