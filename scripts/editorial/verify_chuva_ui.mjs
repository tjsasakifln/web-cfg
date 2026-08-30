/** Browser evidence for the issue #127 rain canary. */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { createRequire } from "module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { extname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { resolveChromePath } from "../site/resolve_chrome.mjs";

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const configuredRoot = String(process.env.CHUVA_SITE_ROOT || "").trim();
const siteRoot = configuredRoot
  ? resolve(root, configuredRoot)
  : existsSync(join(root, "_site", "index.html"))
    ? join(root, "_site")
    : root;
const outDir = resolve(
  root,
  process.env.CHUVA_UI_OUT ||
    "docs/evidence/inbound-chuva-striking-distance-20260829/ui",
);
const route = "/conteudos/chuva-prorrogacao-prazo-obra-publica/";
const port = Number(process.env.CHUVA_UI_PORT || 8798);
const viewports = [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 1000],
  [1920, 1080],
];
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = createServer((request, response) => {
    let requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (requestPath.endsWith("/")) requestPath += "index.html";
    const file = join(siteRoot, requestPath);
    if (
      !file.startsWith(`${siteRoot}${sep}`) ||
      !existsSync(file) ||
      statSync(file).isDirectory()
    ) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    response.end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(port, "127.0.0.1", () => done(server)),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

mkdirSync(join(outDir, "screenshots"), { recursive: true });
const server = await startServer();
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
});
const report = {
  campaign: "CONFENGE_INBOUND_STRIKING_DISTANCE_CHUVA_REWRITE_INDEX_20260829",
  checked_at: "2026-08-29",
  route,
  site_root: siteRoot === root ? "." : siteRoot.replace(`${root}${sep}`, ""),
  checks: [],
  axe: [],
  screenshots: [],
};

try {
  const page = await browser.newPage();
  for (const [width, height] of viewports) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const response = await page.goto(`${base}${route}`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    assert(response?.status() === 200, `${width}: http ${response?.status()}`);
    const geometry = await page.evaluate(() => {
      const wrapper = document.querySelector("#matriz .table-wrap");
      const h1 = document.querySelector("h1")?.getBoundingClientRect();
      const answer = document.querySelector("#resposta")?.getBoundingClientRect();
      return {
        document_overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
        h1_visible: Boolean(h1 && h1.width > 0 && h1.height > 0),
        answer_visible: Boolean(answer && answer.width > 0 && answer.height > 0),
        h1_count: document.querySelectorAll("h1").length,
        table_present: Boolean(wrapper?.querySelector("table")),
        table_overflow_x: wrapper ? getComputedStyle(wrapper).overflowX : null,
        table_scroll_width: wrapper?.scrollWidth || 0,
        table_client_width: wrapper?.clientWidth || 0,
        table_focusable: wrapper?.getAttribute("tabindex") === "0",
        table_role: wrapper?.getAttribute("role") || null,
        main_width: document.querySelector("main")?.getBoundingClientRect().width || 0,
      };
    });
    assert(!geometry.document_overflow, `${width}: document overflow`);
    assert(geometry.h1_count === 1 && geometry.h1_visible, `${width}: h1`);
    assert(geometry.answer_visible, `${width}: direct answer hidden`);
    assert(geometry.table_present, `${width}: matrix missing`);
    assert(geometry.table_overflow_x === "auto", `${width}: matrix overflow`);
    assert(geometry.table_focusable && geometry.table_role === "group", `${width}: matrix keyboard contract`);
    assert(geometry.main_width <= width + 1, `${width}: main wider than viewport`);
    report.checks.push({ kind: "responsive", width, height, ...geometry, status: "PASS" });

    const screenshot = `screenshots/chuva-${width}x${height}.png`;
    await page.screenshot({ path: join(outDir, screenshot), fullPage: false });
    report.screenshots.push(screenshot);

    if (width === 390 || width === 1440) {
      const matrix = await page.$("#matriz .table-wrap");
      assert(matrix, `${width}: matrix screenshot target missing`);
      const matrixStart = `screenshots/chuva-matriz-inicio-${width}.png`;
      await matrix.screenshot({ path: join(outDir, matrixStart) });
      report.screenshots.push(matrixStart);
      if (width === 390) {
        await page.$eval("#matriz .table-wrap", (wrapper) => {
          wrapper.scrollLeft = wrapper.scrollWidth;
        });
        const matrixEnd = `screenshots/chuva-matriz-fim-${width}.png`;
        await matrix.screenshot({ path: join(outDir, matrixEnd) });
        report.screenshots.push(matrixEnd);
      }
    }

    if (width === 390 || width === 1440) {
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: [
              "wcag2a",
              "wcag2aa",
              "wcag21a",
              "wcag21aa",
              "wcag22aa",
              "best-practice",
            ],
          },
        });
        return result.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          nodes: nodes.length,
          targets: nodes.slice(0, 3).map((node) => node.target),
        }));
      });
      const blocking = violations.filter(({ impact }) =>
        ["critical", "serious"].includes(impact),
      );
      assert(blocking.length === 0, `${width}: axe ${JSON.stringify(blocking)}`);
      report.axe.push({ width, violations, blocking: 0, status: "PASS" });
    }
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => ({
    className: document.activeElement?.className || "",
    href: document.activeElement?.getAttribute("href") || "",
  }));
  assert(
    String(firstFocus.className).includes("skip-link") && firstFocus.href === "#conteudo",
    `first keyboard target is not skip link: ${JSON.stringify(firstFocus)}`,
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash === "#conteudo", { timeout: 3000 });

  let reachedMatrix = false;
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("Tab");
    reachedMatrix = await page.evaluate(() =>
      document.activeElement?.matches("#matriz .table-wrap"),
    );
    if (reachedMatrix) break;
  }
  assert(reachedMatrix, "matrix was not reachable by Tab");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await new Promise((done) => setTimeout(done, 120));
  const matrixScroll = await page.evaluate(
    () => document.querySelector("#matriz .table-wrap")?.scrollLeft || 0,
  );
  assert(matrixScroll > 0, "matrix did not respond to keyboard horizontal scroll");
  await page.$eval(".article-faq details:first-of-type summary", (summary) => summary.focus());
  await page.keyboard.press("Enter");
  const faqOpen = await page.$eval(".article-faq details:first-of-type", (details) => details.open);
  assert(faqOpen, "FAQ disclosure did not open by keyboard");
  report.checks.push({
    kind: "keyboard",
    first_focus: firstFocus,
    skip_link_activated: true,
    matrix_reached_by_tab: true,
    matrix_scroll_left_after_arrows: matrixScroll,
    faq_opened_by_enter: true,
    status: "PASS",
  });

  const jsOff = await browser.newPage();
  await jsOff.setJavaScriptEnabled(false);
  await jsOff.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const jsOffResponse = await jsOff.goto(`${base}${route}`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  const noScript = await jsOff.evaluate(() => ({
    html_class: document.documentElement.className,
    h1: document.querySelector("h1")?.textContent?.trim() || "",
    answer: document.querySelector("#resposta")?.textContent?.trim() || "",
    matrix_rows: document.querySelectorAll("#matriz tbody tr").length,
    cta_href: document.querySelector("#diagnostico-confenge a")?.getAttribute("href") || "",
    document_overflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  assert(jsOffResponse?.status() === 200, `js-off http ${jsOffResponse?.status()}`);
  assert(noScript.html_class.includes("no-js"), "js-off class missing");
  assert(noScript.h1.includes("Chuva na obra pública"), "js-off h1 missing");
  assert(noScript.answer.includes("não prova nexo"), "js-off answer missing");
  assert(noScript.matrix_rows === 2, "js-off matrix missing");
  assert(noScript.cta_href.startsWith("https://wa.me/"), "js-off native CTA missing");
  assert(!noScript.document_overflow, "js-off document overflow");
  report.checks.push({ kind: "js_off", ...noScript, status: "PASS" });
  await jsOff.close();
} finally {
  await browser.close();
  server.close();
}

writeFileSync(join(outDir, "ui-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  "CHUVA_UI_OK",
  JSON.stringify({
    responsive_viewports: viewports.length,
    axe_viewports: report.axe.length,
    screenshots: report.screenshots.length,
    js_off: true,
    keyboard: true,
  }),
);
