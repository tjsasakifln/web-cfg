/**
 * Pós-deploy checklist against https://confenge.com.br
 * Run: node seo/scripts/playwright_prod_checklist.mjs
 * Requires: npx playwright (or playwright installed)
 *
 * Exit 0 only when production reflects the pushed SEO build.
 */
import { chromium } from "playwright";

const BASE = process.env.CONFENGE_BASE || "https://confenge.com.br";
const expectLocalShaHints = true;

// Legacy path expectations after host/path migration (no soft-404 to home).
// status: 301 | 410 | 404 ; locPart matched against Location when redirecting.
const legacy = [
  ["/servicos", 301, "servicos-obras-publicas"],
  ["/blog", 301, "conteudos"],
  ["/privacy-policy", 301, "privacidade"],
  ["/politica-de-privacidade", 301, "privacidade"],
  ["/contato", 301, "contato"],
  // Careers page does not exist — 410, not 301 to commercial contact.
  ["/trabalhe-conosco", 410, ""],
  ["/terms-and-conditions", 301, "termos-de-uso"],
  ["/avcbclcb", 410, ""],
  ["/vision", 410, ""],
  ["/nexgen", 410, ""],
];

function ok(cond, msg, rows) {
  rows.push({ ok: !!cond, msg });
  if (!cond) console.error("FAIL", msg);
  else console.log("OK  ", msg);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const rows = [];
  let failures = 0;

  // HTTP → HTTPS
  const httpRes = await page.request.fetch(BASE.replace("https://", "http://") + "/", {
    maxRedirects: 0,
  });
  ok(
    httpRes.status() === 301 &&
      (httpRes.headers().location || "").startsWith("https://"),
    `HTTP→HTTPS ${httpRes.status()} ${httpRes.headers().location || ""}`,
    rows
  );

  // Core URLs
  for (const path of [
    "/",
    "/llms.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/conteudos/sinapi-desonerado-nao-desonerado/",
  ]) {
    const res = await page.request.get(BASE + path);
    const want = path === "/llms.txt" ? 200 : 200;
    ok(res.status() === want, `${path} status ${res.status()} (want ${want})`, rows);
  }

  // SINAPI content
  await page.goto(BASE + "/conteudos/sinapi-desonerado-nao-desonerado/", {
    waitUntil: "domcontentloaded",
  });
  const title = await page.title();
  ok(title.includes("qual usar?"), `SINAPI title has "qual usar?": ${title}`, rows);
  ok(
    (await page.locator(".lead-inline").count()) >= 1,
    `SINAPI .lead-inline count=${await page.locator(".lead-inline").count()}`,
    rows
  );
  ok(
    (await page.locator(".compare-table").count()) >= 1,
    `SINAPI .compare-table present`,
    rows
  );
  ok((await page.locator("#checklist").count()) >= 1, `SINAPI #checklist present`, rows);
  const html = await page.content();
  ok(html.includes("CPRB"), `SINAPI mentions CPRB`, rows);
  const wa = await page.locator('a[href*="wa.me"]').first().getAttribute("href");
  ok(
    wa && decodeURIComponent(wa).toLowerCase().includes("desonerado"),
    `WhatsApp contextual desonerado`,
    rows
  );

  // Home form
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  ok(
    (await page.locator('form[name="diagnostico-confenge"]').count()) === 1,
    `home form diagnostico-confenge`,
    rows
  );
  ok(
    (await page.locator('input[name="origem"]').count()) >= 1,
    `home form hidden origem`,
    rows
  );

  // Prefill
  await page.goto(
    BASE +
      "/?tema=SINAPI%20QA&origem=/conteudos/sinapi-desonerado-nao-desonerado/#contato",
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForTimeout(600);
  const origem = await page.locator('input[name="origem"]').inputValue().catch(() => "");
  const msg = await page.locator("#mensagem").inputValue().catch(() => "");
  ok(
    origem.includes("sinapi-desonerado"),
    `prefill origem=${origem}`,
    rows
  );
  ok(msg.includes("SINAPI QA"), `prefill mensagem contains tema`, rows);

  // Aditivo structure
  await page.goto(BASE + "/conteudos/aditivo-qualitativo-quantitativo/", {
    waitUntil: "domcontentloaded",
  });
  const nums = await page.locator("#diagnostico .criterion-card > span").allTextContents();
  ok(
    JSON.stringify(nums) === JSON.stringify(["01", "02", "03", "04"]),
    `aditivo criterion nums=${JSON.stringify(nums)}`,
    rows
  );

  // Legacy redirects / gone (410)
  for (const [path, status, locPart] of legacy) {
    const res = await page.request.fetch(BASE + path, { maxRedirects: 0 });
    const loc = res.headers().location || "";
    let okRedirect = res.status() === status;
    if (okRedirect && status === 301) {
      okRedirect = locPart
        ? loc.toLowerCase().includes(locPart.toLowerCase())
        : loc.length > 0;
      // must not soft-404 abandoned brands to home
      if (["/vision", "/nexgen", "/avcbclcb"].includes(path)) {
        okRedirect = false;
      }
    }
    if (status === 410 || status === 404) {
      okRedirect = res.status() === 410 || res.status() === 404;
      // forbid 301 to /
      if ([301, 302, 307, 308].includes(res.status()) && (loc === "/" || loc.endsWith("confenge.com.br/"))) {
        okRedirect = false;
      }
    }
    ok(okRedirect, `legacy ${path} ${res.status()} → ${loc || "(body)"} (want ${status})`, rows);
  }

  // Host: netlify.app must not stay as alternate site
  const nf = await page.request.fetch("https://confenge.netlify.app/", {
    maxRedirects: 0,
  });
  const nfLoc = nf.headers().location || "";
  ok(
    nf.status() === 301 && nfLoc.includes("confenge.com.br"),
    `netlify.app host ${nf.status()} → ${nfLoc}`,
    rows
  );

  failures = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failures}/${rows.length} checks passed`);
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
