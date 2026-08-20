/**
 * Local _site Playwright smoke. Does not claim production.
 * CONFENGE_BASE defaults to http://127.0.0.1:8765
 */
import { chromium } from "playwright";

const BASE = (process.env.CONFENGE_BASE || "http://127.0.0.1:8765").replace(/\/$/, "");
const paths = [
  "/",
  "/robots.txt",
  "/sitemap-index.xml",
  "/sitemap.txt",
  "/defesa-margem-contratos-publicos/",
  "/atrasos-prorrogacao-obras-publicas/",
  "/defesa-tecnica-contratos-publicos/",
  "/acompanhamento-contratos-obras/",
  "/bid-room-licitacoes-obras/",
  "/diretoria-b2g/",
  "/diagnostico-b2g-expansao/",
  "/inteligencia/valor-tipico-contratos-pavimentacao/",
];

const rows = [];
function ok(cond, msg) {
  rows.push({ ok: !!cond, msg });
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("OK  ", msg);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  for (const path of paths) {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 15000 });
    ok(res && res.status() < 400, `${path} status ${res && res.status()}`);
  }
  await page.goto(BASE + "/inteligencia/valor-tipico-contratos-pavimentacao/", {
    waitUntil: "domcontentloaded",
  });
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  ok(/noindex/i.test(robots || ""), `market answer robots ${robots}`);
  await page.goto(BASE + "/diagnostico-b2g-expansao/", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  ok(!html.includes("/.netlify/functions/offer-checkout"), "expansao has no checkout URL");
  ok(html.includes("CFG-TERMS-B2B-2026-08-17-v1"), "expansao shows registry terms");
  const sitemap = await (await page.request.get(BASE + "/sitemap.txt")).text();
  ok(
    !sitemap.includes("/inteligencia/valor-tipico-contratos-pavimentacao/"),
    "stale market answer absent from sitemap.txt",
  );
} finally {
  await browser.close();
}
if (process.exitCode) {
  console.error("playwright_local_checklist failed");
  process.exit(1);
}
console.log("playwright_local_checklist passed", rows.length);
