/**
 * Browser evidence for the private-readiness landing.
 * Honest NOT_RUN if Chrome cannot start.
 */
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scratch = process.env.POS_INB_04_SCRATCH || "/tmp/grok-goal-1c376b072c82/implementer";
const shotDir = join(scratch, "screenshots");
mkdirSync(shotDir, { recursive: true });
const PORT = Number(process.env.POS_INB_04_PORT || 18704);
const PATH = "/ferramentas/prontidao-tecnica-obra-privada/";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function logLines(lines) {
  const text = lines.join("\n") + "\n";
  writeFileSync(join(scratch, "browser.log"), text);
  process.stdout.write(text);
}

function startServer() {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(root, urlPath);
    if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

async function fillPresent(page, overrides) {
  const values = {
    work_stage: "execucao",
    decision_on_table: "aprovar_medicao",
    scope_record: "escrito_assinado",
    design_set: "completo_revisao_atual",
    revision_control: "numerada_com_datas",
    design_responsibility: "nomeada_por_disciplina",
    quantities: "takeoff_ligado_projetos",
    budget: "composicoes_e_bases",
    calc_memory: "presente_ligada",
    coordination: "issue_register_rastreado",
    bim_or_constructability: "revisao_construtibilidade_registrada",
    change_control: "registro_escrito_com_impacto",
    execution_records: "diario_e_base_medicao",
    measurement_trace: "ligada_orcamento_e_executado",
    asbuilt: "atual",
    handover_docs: "manuais_garantias_ensaios",
    art_declared: "emitida_declarada",
    inspections_declared: "registradas",
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) {
    await page.select("#" + id, value);
  }
}

async function main() {
  let chrome;
  try {
    const { resolveChromePath } = await import("../../../scripts/site/resolve_chrome.mjs");
    chrome = resolveChromePath();
  } catch (err) {
    logLines(["NOT_RUN", "chrome_not_found", String(err && err.message ? err.message : err)]);
    return;
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (err) {
    logLines(["NOT_RUN", "puppeteer_core_missing", String(err && err.message ? err.message : err)]);
    return;
  }

  const server = await startServer();
  const origin = "http://127.0.0.1:" + PORT;
  const lines = ["CHROME " + chrome, "ORIGIN " + origin];
  let failed = 0;
  const fail = (name, detail) => {
    failed += 1;
    lines.push("FAIL " + name + " " + (detail || ""));
  };
  const pass = (name, detail) => lines.push("PASS " + name + " " + (detail || ""));

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: "new",
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(origin + PATH, { waitUntil: "networkidle0", timeout: 30000 });
    const runEnabled = await page.$eval("button.tool-run", (el) => !el.disabled);
    if (runEnabled) pass("js_unlocks_form");
    else fail("js_unlocks_form");

    async function runScenario(name, overrides, expectedHref) {
      await page.goto(origin + PATH, { waitUntil: "networkidle0", timeout: 30000 });
      await fillPresent(page, overrides);
      await page.click("button.tool-run");
      await page.waitForSelector("[data-routing-table]", { timeout: 8000 });
      const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
      if (focused === "resultado") pass(name + "_focus", focused);
      else fail(name + "_focus", focused);
      const href = await page.$eval(
        ".pptr-route[data-route-kind='primary'] a[data-tool-to-offer]",
        (el) => el.getAttribute("href"),
      );
      if (href === expectedHref) pass(name + "_href", href);
      else fail(name + "_href", href);
      return href;
    }

    await runScenario(
      "qty",
      { quantities: "nenhum", budget: "nenhum", calc_memory: "nenhum" },
      "/quantitativos-orcamento-obras/",
    );
    await runScenario(
      "clash",
      {
        coordination: "nenhum",
        bim_or_constructability: "nenhum",
        decision_on_table: "iniciar_execucao",
      },
      "/compatibilizacao-projetos-engenharia/",
    );
    await runScenario(
      "review",
      { design_set: "parcial" },
      "/revisao-tecnica-projetos-engenharia/",
    );

    await page.screenshot({ path: join(shotDir, "desktop-review.png"), fullPage: true });

    for (const width of [360, 390]) {
      await page.setViewport({ width, height: 800 });
      await page.goto(origin + PATH, { waitUntil: "networkidle0", timeout: 30000 });
      await fillPresent(page, { design_set: "parcial" });
      await page.click("button.tool-run");
      await page.waitForSelector("[data-routing-table]", { timeout: 8000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow <= 8) pass("viewport_" + width, "overflow=" + overflow);
      else fail("viewport_" + width, "overflow=" + overflow);
      await page.screenshot({ path: join(shotDir, "viewport-" + width + ".png"), fullPage: true });
    }

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(origin + PATH, { waitUntil: "networkidle0", timeout: 30000 });
    await fillPresent(page, { quantities: "nenhum", budget: "nenhum", calc_memory: "nenhum" });
    await page.focus("button.tool-run");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-routing-table]", { timeout: 8000 });
    const keyHref = await page.$eval(
      ".pptr-route[data-route-kind='primary'] a[data-tool-to-offer]",
      (el) => el.getAttribute("href"),
    );
    if (keyHref === "/quantitativos-orcamento-obras/") pass("keyboard_submit", keyHref);
    else fail("keyboard_submit", keyHref);
    const edit = await page.$("#btn-edit");
    if (edit) {
      await page.click("#btn-edit");
      const afterEdit = await page.evaluate(() => document.activeElement && document.activeElement.id);
      if (afterEdit) pass("edit_focus", afterEdit);
      else fail("edit_focus", afterEdit);
    } else fail("edit_control_missing");

    const noscriptPage = await browser.newPage();
    await noscriptPage.setJavaScriptEnabled(false);
    await noscriptPage.setViewport({ width: 390, height: 800 });
    await noscriptPage.goto(origin + PATH, { waitUntil: "domcontentloaded", timeout: 30000 });
    const off = await noscriptPage.evaluate(() => {
      const hrefs = Array.from(document.querySelectorAll("#acesso-direto a")).map((a) => a.getAttribute("href"));
      const processed = Boolean(document.querySelector("[data-routing-table], .pptr-route"));
      const method = Boolean(document.querySelector("#metodo") || document.querySelector(".pptr-method"));
      const resultBody = (document.querySelector("#resultado-corpo") || {}).textContent || "";
      return { hrefs, processed, method, resultBody };
    });
    if (off.method) pass("js_off_method");
    else fail("js_off_method");
    if (off.hrefs.includes("/quantitativos-orcamento-obras/")) pass("js_off_qty");
    else fail("js_off_qty", JSON.stringify(off.hrefs));
    if (off.hrefs.includes("/compatibilizacao-projetos-engenharia/")) pass("js_off_clash");
    else fail("js_off_clash", JSON.stringify(off.hrefs));
    if (off.hrefs.includes("/revisao-tecnica-projetos-engenharia/")) pass("js_off_review");
    else fail("js_off_review", JSON.stringify(off.hrefs));
    if (off.hrefs.some((h) => h && h.startsWith("/triagem-tecnica/"))) pass("js_off_contact");
    else fail("js_off_contact", JSON.stringify(off.hrefs));
    if (!off.processed) pass("js_off_no_processed");
    else fail("js_off_no_processed");
    await noscriptPage.screenshot({ path: join(shotDir, "js-off-390.png"), fullPage: true });
    await noscriptPage.close();
  } catch (err) {
    fail("browser_exception", String(err && err.stack ? err.stack : err));
  } finally {
    if (browser) await browser.close();
    await new Promise((done) => server.close(done));
  }

  if (failed) {
    lines.push("FAILED " + failed);
    logLines(lines);
    process.exit(1);
  }
  lines.push("ALL browser checks passed");
  logLines(lines);
}

main().catch((err) => {
  logLines(["NOT_RUN", "browser_launch_exception", String(err && err.stack ? err.stack : err)]);
});
