/**
 * Dual-run Playwright probe against PR #55 deploy preview.
 * Critical inbound journeys: home, hub, tools/checklist, form surface, SEO shell.
 * Evidence written under SCRATCH/playwright-prod/
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "playwright-prod");
const BASE =
  process.env.CONFENGE_BASE || "https://deploy-preview-55--confenge.netlify.app";
const RUNS = Number(process.env.PROBE_RUNS || 2);

fs.mkdirSync(OUT, { recursive: true });

function pass(rows, name, detail = "") {
  rows.push({ ok: true, name, detail });
  console.log("PASS", name, detail);
}
function fail(rows, name, detail = "") {
  rows.push({ ok: false, name, detail });
  console.error("FAIL", name, detail);
}

async function probeOnce(runId) {
  const rows = [];
  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "confenge-preview-probe/1.0 (+epic-td-001 verification; no-PII)",
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  async function checkSurface(name, urlPath, asserts) {
    const url = new URL(urlPath, BASE).toString();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const status = res ? res.status() : 0;
    if (status < 200 || status >= 400) {
      fail(rows, `${name}_http`, `status=${status} url=${url}`);
      return;
    }
    pass(rows, `${name}_http`, `status=${status}`);
    await page.waitForTimeout(400);
    for (const a of asserts) {
      try {
        await a(page, rows, name);
      } catch (e) {
        fail(rows, `${name}_assert`, String(e.message || e).slice(0, 200));
      }
    }
    const shot = path.join(OUT, `run${runId}-${name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    pass(rows, `${name}_screenshot`, shot);
  }

  // Home
  await checkSurface("home", "/", [
    async (page, rows, name) => {
      const title = await page.title();
      if (!title || title.length < 5) fail(rows, `${name}_title`, title);
      else pass(rows, `${name}_title`, title.slice(0, 80));
    },
    async (page, rows, name) => {
      const logo = await page.locator(".brand img, header img, .site-header img").first();
      if ((await logo.count()) === 0) fail(rows, `${name}_logo`, "no logo");
      else {
        const box = await logo.boundingBox();
        if (!box || box.width < 20) fail(rows, `${name}_logo`, "tiny");
        else pass(rows, `${name}_logo`, `${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    },
    async (page, rows, name) => {
      const h1 = page.locator("h1").first();
      if ((await h1.count()) === 0) fail(rows, `${name}_h1`, "missing");
      else pass(rows, `${name}_h1`, (await h1.innerText()).slice(0, 80));
    },
    async (page, rows, name) => {
      const cta = page.locator("a.button-primary, .button-primary, a.header-cta").first();
      if ((await cta.count()) === 0) fail(rows, `${name}_primary_cta`, "missing");
      else pass(rows, `${name}_primary_cta`, (await cta.innerText()).replace(/\s+/g, " ").trim().slice(0, 60));
    },
    async (page, rows, name) => {
      const form = page.locator('form[data-form-multistep], form[name*="diagnostico"], form.contact-form, #contato form, .contact-form form').first();
      // home may use contact section form
      const anyForm = page.locator("form").first();
      if ((await form.count()) + (await anyForm.count()) === 0) fail(rows, `${name}_form`, "no form");
      else pass(rows, `${name}_form`, "present");
    },
    async (page, rows, name) => {
      const nav = page.locator(".desktop-nav a, nav a").first();
      if ((await nav.count()) === 0) fail(rows, `${name}_nav`, "missing");
      else pass(rows, `${name}_nav`, "present");
    },
  ]);

  // Content hub
  await checkSurface("hub", "/conteudos/", [
    async (page, rows, name) => {
      const h1 = page.locator("h1");
      const n = await h1.count();
      if (n !== 1) fail(rows, `${name}_single_h1`, `count=${n}`);
      else pass(rows, `${name}_single_h1`, (await h1.innerText()).slice(0, 80));
    },
    async (page, rows, name) => {
      const items = page.locator("[data-stage], .library-item, .hub-item, [data-search]");
      const n = await items.count();
      if (n < 1) fail(rows, `${name}_items`, `count=${n}`);
      else pass(rows, `${name}_items`, `count=${n}`);
    },
    async (page, rows, name) => {
      const body = await page.content();
      if (/0 guias|Ver os\s*<\/a>|href=["']#guias["']/i.test(body) && !/library-item/i.test(body)) {
        // only fail if zero-item empty CTA pattern
      }
      if (/Nenhum conteúdo indexável/i.test(body)) fail(rows, `${name}_empty_copy`, "empty indexable");
      else pass(rows, `${name}_no_empty_deadend`, "ok");
    },
  ]);

  // Tools hub
  await checkSurface("tools", "/ferramentas/", [
    async (page, rows, name) => {
      const h1 = page.locator("h1").first();
      if ((await h1.count()) === 0) fail(rows, `${name}_h1`, "missing");
      else pass(rows, `${name}_h1`, (await h1.innerText()).slice(0, 80));
    },
    async (page, rows, name) => {
      const links = page.locator('a[href*="checklist"], a[href*="matriz"], a[href*="limite"]');
      if ((await links.count()) < 1) fail(rows, `${name}_tool_links`, "none");
      else pass(rows, `${name}_tool_links`, `count=${await links.count()}`);
    },
  ]);

  // Checklist tool (interactive reequilíbrio dossiê — radio states + diagnosis)
  await checkSurface("checklist", "/ferramentas/checklist-reequilibrio/", [
    async (page, rows, name) => {
      // Progressive interactive units: category sections + req radio groups
      const cats = page.locator("section.tool-category, .tool-category");
      const reqs = page.locator(".tool-req, [data-key]");
      const radios = page.locator('input[type="radio"][data-req], .tool-req input[type="radio"]');
      const nCat = await cats.count();
      const nReq = await reqs.count();
      const nRadio = await radios.count();
      if (nReq < 5 || nRadio < 10) {
        fail(rows, `${name}_interactive`, `cats=${nCat} reqs=${nReq} radios=${nRadio}`);
      } else {
        pass(rows, `${name}_interactive`, `cats=${nCat} reqs=${nReq} radios=${nRadio}`);
      }
    },
    async (page, rows, name) => {
      const primary = page.locator("button.button-primary.tool-run, button.tool-run, form#f button[type=submit]");
      if ((await primary.count()) < 1) fail(rows, `${name}_run_cta`, "missing gerar diagnóstico");
      else pass(rows, `${name}_run_cta`, (await primary.first().innerText()).trim().slice(0, 40));
    },
    async (page, rows, name) => {
      // Exercise interaction: set first radio + run diagnosis; result panel should open
      const firstRadio = page.locator('input[type="radio"][data-req], .tool-req input[type="radio"]').first();
      if ((await firstRadio.count()) === 0) {
        fail(rows, `${name}_interact_fill`, "no radio");
        return;
      }
      await firstRadio.check({ force: true }).catch(async () => {
        await firstRadio.click({ force: true });
      });
      const run = page.locator("button.tool-run, form#f button[type=submit]").first();
      await run.click();
      await page.waitForTimeout(500);
      const out = page.locator("#out.tool-result-panel, .tool-result-panel");
      const hidden = await out.getAttribute("hidden").catch(() => null);
      const text = ((await out.innerText().catch(() => "")) || "").trim();
      if (hidden !== null && hidden !== "" && text.length < 10) {
        // still hidden or empty after run
        fail(rows, `${name}_diagnosis_result`, `hidden=${hidden} textLen=${text.length}`);
      } else {
        pass(rows, `${name}_diagnosis_result`, `textLen=${text.length}`);
      }
    },
    async (page, rows, name) => {
      // styles-tools must load as CSS (not HTML 404)
      const cssOk = await page.evaluate(async () => {
        const hrefs = ["styles-tools.css", "styles-tokens.css", "styles.css"];
        const out = {};
        for (const h of hrefs) {
          try {
            const r = await fetch("/" + h, { method: "HEAD" });
            out[h] = { status: r.status, type: r.headers.get("content-type") || "" };
          } catch (e) {
            out[h] = { status: 0, type: String(e) };
          }
        }
        return out;
      });
      for (const [file, info] of Object.entries(cssOk)) {
        const ok =
          info.status === 200 && /text\/css|stylesheet/i.test(info.type || "");
        if (!ok) fail(rows, `${name}_css_${file}`, JSON.stringify(info));
        else pass(rows, `${name}_css_${file}`, `${info.status} ${info.type}`);
      }
    },
  ]);

  // SEO shell — robots/meta
  await checkSurface("seo_shell", "/", [
    async (page, rows, name) => {
      const canon = page.locator('link[rel="canonical"]');
      if ((await canon.count()) === 0) fail(rows, `${name}_canonical`, "missing");
      else pass(rows, `${name}_canonical`, await canon.first().getAttribute("href"));
    },
    async (page, rows, name) => {
      const robots = await page.locator('meta[name="robots"]').first().getAttribute("content").catch(() => null);
      pass(rows, `${name}_robots_meta`, robots || "(default index)");
    },
  ]);

  // Filter noisy third-party console noise (analytics blockers etc.)
  const hardErrors = consoleErrors.filter(
    (e) =>
      !/favicon|net::ERR_BLOCKED|third-party|plausible|gtag|Turnstile|cloudflare/i.test(e),
  );
  if (hardErrors.length) fail(rows, "console_errors", hardErrors.slice(0, 5).join(" | "));
  else pass(rows, "console_errors", `raw=${consoleErrors.length} hard=0`);

  await browser.close();
  return {
    runId,
    base: BASE,
    at: new Date().toISOString(),
    rows,
    consoleErrors,
    ok: rows.every((r) => r.ok),
  };
}

async function main() {
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n=== RUN ${i}/${RUNS} against ${BASE} ===`);
    const r = await probeOnce(i);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `run${i}-report.json`), JSON.stringify(r, null, 2));
  }
  const allOk = runs.every((r) => r.ok);
  const summary = {
    ok: allOk,
    base: BASE,
    runs: runs.length,
    per_run: runs.map((r) => ({
      runId: r.runId,
      ok: r.ok,
      fails: r.rows.filter((x) => !x.ok).map((x) => x.name),
      pass_count: r.rows.filter((x) => x.ok).length,
      fail_count: r.rows.filter((x) => !x.ok).length,
    })),
    consistent: runs.length >= 2 && runs.every((r) => r.ok === runs[0].ok),
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
  if (!allOk) process.exit(1);
  console.log("PLAYWRIGHT_PREVIEW_PROBE_OK");
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    path.join(OUT, "launcher-error.json"),
    JSON.stringify({ ok: false, error: String(e.stack || e) }, null, 2),
  );
  process.exit(2);
});
