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

const legacy = [
  ["/servicos", 301, "/#atuacao"],
  ["/blog", 301, "/conteudos"],
  ["/privacy-policy", 301, "/privacidade"],
  ["/contato", 301, "/#contato"],
  ["/avcbclcb", 301, "/"],
  ["/vision", 301, "/"],
  ["/trabalhe-conosco", 301, "/#contato"],
  ["/nexgen", 301, "/"],
  ["/terms-and-conditions", 301, "/privacidade"],
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

  // Legacy redirects
  for (const [path, status, locPart] of legacy) {
    const res = await page.request.fetch(BASE + path, { maxRedirects: 0 });
    const loc = res.headers().location || "";
    const pass =
      res.status() === status && loc.toLowerCase().includes(locPart.replace("/#", "").toLowerCase().split("/")[0] || "") ||
      (res.status() === 301 && loc.length > 0);
    // Netlify hash redirects: location may be / or /#atuacao
    const okRedirect =
      res.status() === 301 &&
      (loc.includes(locPart) ||
        (path === "/servicos" && (loc.includes("atuacao") || loc.endsWith("/") || loc.includes("/#"))) ||
        (["/vision", "/nexgen", "/avcbclcb"].includes(path) && (loc === "/" || loc.endsWith("confenge.com.br/") || loc.endsWith("/"))) ||
        (path === "/blog" && loc.includes("conteudos")) ||
        (path.includes("privacy") || path.includes("terms") ? loc.includes("privacidade") : false) ||
        (path === "/contato" || path === "/trabalhe-conosco" ? loc.includes("contato") || loc.includes("/#") : false));
    ok(okRedirect, `redirect ${path} ${res.status()} → ${loc}`, rows);
  }

  failures = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failures}/${rows.length} checks passed`);
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
