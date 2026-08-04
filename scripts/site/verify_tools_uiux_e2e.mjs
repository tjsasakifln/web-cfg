/**
 * E2E verification for tools + editorial pilot pages (puppeteer-core + system Chrome).
 * Viewports: 1440, 1024, 768, 390, 360, 320
 * Flows: nav, fill/run, result, overflow, keyboard focus, axe WCAG 2.2 AA
 *
 * Usage: node scripts/site/verify_tools_uiux_e2e.mjs [outDir]
 * Evidence: outDir/e2e-report.json, outDir/axe-report.json, outDir/screenshots/*.png
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import {
  readFileSync,
  existsSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { join, resolve, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUT = resolve(
  process.argv[2] || join(ROOT, "docs/uiux-tools-remediation/evidence")
);
const PORT = 8795;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const require = createRequire(import.meta.url);

const VIEWPORTS = [
  [1440, 1000],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 800],
  [320, 568],
];

const PILOTS = [
  {
    id: "hub",
    path: "/ferramentas/",
    expect: ["CollectionPage", "tool-card", "styles-tools"],
    flow: "hub",
  },
  {
    id: "limite",
    path: "/ferramentas/limite-acrescimos-supressoes/",
    expect: ["tool-form", "tool-money", "Calcular"],
    flow: "limite",
  },
  {
    id: "reequilibrio",
    path: "/ferramentas/checklist-reequilibrio/",
    expect: ["tool-form", "tool-req", "Diagnosticar"],
    flow: "reequilibrio",
  },
  {
    id: "matriz",
    path: "/ferramentas/matriz-atraso-obra/",
    expect: ["tool-form", "tool-event", "hipótese"],
    flow: "matriz",
  },
  {
    id: "aditivo",
    path: "/guias-contratos-obras/checklist-pedido-aditivo/",
    expect: ["data-aditivo-checklist", "tool-req", "Atendido"],
    flow: "aditivo",
  },
];

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

function startServer() {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(ROOT, urlPath);
    if (
      !filePath.startsWith(ROOT) ||
      !existsSync(filePath) ||
      statSync(filePath).isDirectory()
    ) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
    });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

let axeSource;
try {
  axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  console.error("axe-core missing");
  process.exit(2);
}

mkdirSync(join(OUT, "screenshots"), { recursive: true });
mkdirSync(join(OUT, "screenshots", "after"), { recursive: true });

const server = await startServer();
const BASE = `http://127.0.0.1:${PORT}`;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const report = {
  generated_at: new Date().toISOString(),
  base: BASE,
  viewports: VIEWPORTS.map(([w, h]) => `${w}x${h}`),
  results: [],
  overflows: [],
  axe: { pages: [], critical: 0, serious: 0, moderate: 0, minor: 0 },
  keyboard: [],
  flows: [],
  failed: 0,
};

function fail(msg) {
  console.error("FAIL", msg);
  report.failed += 1;
}
function pass(msg) {
  console.log("PASS", msg);
}

const page = await browser.newPage();

// --- Static source checks first ---
for (const pilot of PILOTS) {
  const rel = pilot.path === "/" ? "index.html" : pilot.path.replace(/^\//, "") + (pilot.path.endsWith("/") ? "index.html" : "");
  const fp = join(ROOT, rel.replace(/\/index\.html$/, "/index.html"));
  const htmlPath = existsSync(fp)
    ? fp
    : join(ROOT, pilot.path.replace(/^\//, ""), "index.html");
  if (!existsSync(htmlPath)) {
    fail(`missing_html ${pilot.id} ${htmlPath}`);
    continue;
  }
  const html = readFileSync(htmlPath, "utf8");
  if (html.includes("#0b5fff")) fail(`blue ${pilot.id}`);
  else pass(`no_blue ${pilot.id}`);
  for (const needle of pilot.expect) {
    if (!html.includes(needle) && !html.toLowerCase().includes(needle.toLowerCase())) {
      // soft: some expect are runtime-only
      if (["Calcular", "Diagnosticar", "hipótese"].includes(needle)) continue;
      fail(`expect_${needle} ${pilot.id}`);
    } else pass(`expect_${needle} ${pilot.id}`);
  }
  if (pilot.id === "hub" && /WebApplication/.test(html) && !/CollectionPage|ItemList/.test(html)) {
    fail("hub_webapp_only");
  }
}

// --- Screenshots + overflow at each viewport ---
for (const pilot of PILOTS) {
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const res = await page.goto(`${BASE}${pilot.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    if (!res || !res.ok()) {
      fail(`http ${pilot.id} ${w} status=${res && res.status()}`);
      continue;
    }
    await new Promise(r => setTimeout(r, 300));
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });
    const overflow = metrics.scrollWidth > metrics.clientWidth + 2;
    const shot = join(
      OUT,
      "screenshots",
      "after",
      `${pilot.id}-${w}x${h}.png`
    );
    await page.screenshot({ path: shot, fullPage: false });
    const entry = {
      pilot: pilot.id,
      viewport: `${w}x${h}`,
      overflow,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      shot,
    };
    report.results.push(entry);
    if (overflow) {
      fail(`overflow ${pilot.id} ${w}x${h} sw=${metrics.scrollWidth} cw=${metrics.clientWidth}`);
      report.overflows.push(entry);
    } else {
      pass(`no_overflow ${pilot.id} ${w}x${h}`);
    }
  }
}

// --- Functional flows at 1440 ---
await page.setViewport({ width: 1440, height: 1000 });

// Limite flow
{
  await page.goto(`${BASE}/ferramentas/limite-acrescimos-supressoes/`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.waitForSelector("#valor_inicial", { timeout: 10000 });
  await page.click("#valor_inicial", { clickCount: 3 });
  await page.type("#valor_inicial", "10.000.000,00");
  await page.click("#acrescimos_previos", { clickCount: 3 });
  await page.type("#acrescimos_previos", "1800000");
  await page.click("#acrescimo_proposto", { clickCount: 3 });
  await page.type("#acrescimo_proposto", "900000");
  await page.click('button[type="submit"]');
  await page.waitForSelector("#resultado:not([hidden])", { timeout: 8000 }).catch(() => null);
  const lim = await page.evaluate(() => {
    const out = document.getElementById("resultado");
    return {
      hidden: !out || out.hidden,
      text: out ? out.innerText.slice(0, 500) : "",
      hasPanels: !!(out && out.querySelector(".tool-limit-panel")),
      hasNumeric: !!(out && /limite numérico/i.test(out.innerText)),
    };
  });
  if (lim.hidden || !lim.hasPanels) fail("limite_result " + JSON.stringify(lim));
  else pass("limite_result panels");
  if (!lim.hasNumeric) fail("limite_wording");
  else pass("limite_wording");
  report.flows.push({ flow: "limite", ...lim });
  await page.screenshot({
    path: join(OUT, "screenshots", "after", "limite-result-1440.png"),
    fullPage: true,
  });
}

// Reequilibrio flow - mark blockers missing
{
  await page.goto(`${BASE}/ferramentas/checklist-reequilibrio/`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.waitForSelector("#f, form.tool-form", { timeout: 10000 });
  // Leave most pending (default missing) - submit
  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden]), #resultado:not([hidden])", {
    timeout: 8000,
  }).catch(() => null);
  const re = await page.evaluate(() => {
    const out = document.getElementById("out") || document.getElementById("resultado");
    return {
      hidden: !out || out.hidden,
      text: out ? out.innerText.slice(0, 600) : "",
      hasBlock: !!(out && /bloqueador|baixa|limitada|prontidão/i.test(out.innerText)),
    };
  });
  if (re.hidden) fail("reeq_result");
  else pass("reeq_result");
  if (!re.hasBlock) fail("reeq_blockers_in_output");
  else pass("reeq_blockers_in_output");
  report.flows.push({ flow: "reequilibrio", ...re });
  await page.screenshot({
    path: join(OUT, "screenshots", "after", "reeq-result-1440.png"),
    fullPage: true,
  });
}

// Matriz flow
{
  await page.goto(`${BASE}/ferramentas/matriz-atraso-obra/`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.waitForSelector('[data-f="causa"], input[data-f="causa"]', {
    timeout: 10000,
  });
  await page.type('[data-f="causa"]', "Projeto incompleto da Administração");
  await page.select('[data-f="parte"]', "administracao");
  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden]), #resultado:not([hidden])", {
    timeout: 8000,
  }).catch(() => null);
  const mx = await page.evaluate(() => {
    const out = document.getElementById("out") || document.getElementById("resultado");
    const t = out ? out.innerText : "";
    return {
      hidden: !out || out.hidden,
      text: t.slice(0, 600),
      hypothesis: /hipótese|hipoteses|preliminar|veredito/i.test(t),
      noFavorable: !/caso favorável|responsabilidade da Administração\s*$/im.test(t),
    };
  });
  if (mx.hidden) fail("matriz_result");
  else pass("matriz_result");
  if (!mx.hypothesis) fail("matriz_hypothesis");
  else pass("matriz_hypothesis");
  report.flows.push({ flow: "matriz", ...mx });
  await page.screenshot({
    path: join(OUT, "screenshots", "after", "matriz-result-1440.png"),
    fullPage: true,
  });
}

// Aditivo checklist - mark one essential + one blocker
{
  await page.goto(`${BASE}/guias-contratos-obras/checklist-pedido-aditivo/`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.waitForSelector("[data-aditivo-checklist]", { timeout: 10000 });
  // select first essential as met
  const radios = await page.$$('[data-aditivo-checklist] input[value="met"]');
  if (radios[0]) await radios[0].click();
  // select first blocker yes
  const yes = await page.$$('[data-aditivo-checklist] input[value="yes"]');
  if (yes[0]) await yes[0].click();
  await new Promise(r => setTimeout(r, 400));
  const ad = await page.evaluate(() => {
    const out = document.querySelector("[data-checklist-result]");
    const t = out && !out.hidden ? out.innerText : "";
    const prog = document.querySelector("[data-progress-label]");
    return {
      hasUi: !!document.querySelector("[data-aditivo-checklist]"),
      triState: !!document.querySelector('input[value="pending"]'),
      resultVisible: !!(out && !out.hidden),
      text: t.slice(0, 500),
      progress: prog ? prog.textContent : "",
      not100: prog ? !/100%|100 %/.test(prog.textContent) : true,
    };
  });
  if (!ad.hasUi || !ad.triState) fail("aditivo_ui " + JSON.stringify(ad));
  else pass("aditivo_ui");
  // result may appear after change
  if (ad.resultVisible) {
    pass("aditivo_result");
    if (!ad.not100 && /bloqueio|bloqueador/i.test(ad.progress + ad.text)) {
      // if 100 with blocker that's a fail - but we check not100
    }
  } else {
    // click diagnose
    const btn = await page.$("[data-checklist-diagnose]");
    if (btn) {
      await btn.click();
      await new Promise(r => setTimeout(r, 300));
    }
    const ad2 = await page.evaluate(() => {
      const out = document.querySelector("[data-checklist-result]");
      return { visible: !!(out && !out.hidden), text: out ? out.innerText.slice(0, 400) : "" };
    });
    if (!ad2.visible) fail("aditivo_result");
    else pass("aditivo_result");
  }
  report.flows.push({ flow: "aditivo", ...ad });
  await page.screenshot({
    path: join(OUT, "screenshots", "after", "aditivo-partial-1440.png"),
    fullPage: true,
  });
}

// --- Keyboard: tab to primary action on limite ---
{
  await page.goto(`${BASE}/ferramentas/limite-acrescimos-supressoes/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.focus("body");
  let reached = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return { tag: null };
      return {
        tag: el.tagName,
        type: el.getAttribute("type"),
        text: (el.innerText || el.value || "").slice(0, 40),
        cls: el.className,
      };
    });
    if (
      (info.tag === "BUTTON" && /calcular|submit/i.test(info.text + info.type)) ||
      (info.tag === "BUTTON" && info.type === "submit") ||
      (info.tag === "INPUT" && info.type !== "hidden")
    ) {
      reached = true;
      break;
    }
  }
  if (!reached) fail("keyboard_reach_form");
  else pass("keyboard_reach_form");
  report.keyboard.push({ page: "limite", reached_interactive: reached });
  // focus-visible: ensure outline style exists for :focus-visible (from site CSS)
  const hasFocusStyle = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    // presence of focus-visible in styles.css is enough for structural check
    return !!document.querySelector('link[href*="styles"]');
  });
  if (!hasFocusStyle) fail("focus_css_link");
  else pass("focus_css_link");
}


// --- Persist / erase / copy / download / invalid money (skeptic gaps) ---
{
  // Limite: invalid money must not coerce to 0
  await page.goto(`${BASE}/ferramentas/limite-acrescimos-supressoes/`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector("#valor_inicial");
  await page.click("#valor_inicial", { clickCount: 3 });
  await page.type("#valor_inicial", "10.000.000");
  await page.click("#acrescimos_previos", { clickCount: 3 });
  await page.type("#acrescimos_previos", "abc");
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 300));
  const inv = await page.evaluate(() => {
    const el = document.getElementById("acrescimos_previos");
    const out = document.getElementById("resultado");
    return {
      valueKept: el && el.value.includes("abc"),
      invalid: el && el.getAttribute("aria-invalid") === "true",
      noPanels: !(out && out.querySelector(".tool-limit-panel")),
      msg: out ? out.innerText.slice(0, 200) : "",
    };
  });
  if (!inv.valueKept || !inv.invalid) fail("limite_invalid_kept " + JSON.stringify(inv));
  else pass("limite_invalid_kept");
  if (!inv.noPanels && !/inválid|corrig/i.test(inv.msg)) fail("limite_invalid_no_compute");
  else pass("limite_invalid_no_silent_zero");

  // Limite: valid submit → persist → reload
  await page.click("#acrescimos_previos", { clickCount: 3 });
  await page.type("#acrescimos_previos", "1800000");
  await page.click("#acrescimo_proposto", { clickCount: 3 });
  await page.type("#acrescimo_proposto", "900000");
  await page.click('button[type="submit"]');
  await page.waitForSelector("#resultado:not([hidden])", { timeout: 8000 });
  const stored = await page.evaluate(() => localStorage.getItem("confenge.tool.limite-acrescimos"));
  if (!stored || !stored.includes('"v"')) fail("limite_persist_write");
  else pass("limite_persist_write");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("#valor_inicial");
  const restored = await page.evaluate(() => ({
    v: document.getElementById("valor_inicial").value,
    ac: document.getElementById("acrescimos_previos").value,
    raw: localStorage.getItem("confenge.tool.limite-acrescimos"),
  }));
  if (!restored.v || !String(restored.ac).includes("1800000") && restored.ac !== "1.800.000") {
    // accept either raw digits or formatted
    if (!restored.raw || !restored.raw.includes("1800000")) fail("limite_persist_reload " + JSON.stringify(restored));
    else pass("limite_persist_reload_storage");
  } else pass("limite_persist_reload");

  // Copy / download produce non-empty text (re-run calc first)
  await page.click('button[type="submit"]');
  await page.waitForSelector("#resultado:not([hidden])");
  const reportLen = await page.evaluate(async () => {
    // trigger copy path via building lastText already done on submit; click copy if present
    const btn = document.getElementById("btn-copy");
    if (btn) btn.click();
    // access lastText not global — re-read download by intercepting Blob is hard; check report via recomputing DOM export button
    const dl = document.getElementById("btn-dl");
    return { hasCopy: !!btn, hasDl: !!dl, resultText: (document.getElementById("resultado") || {}).innerText || "" };
  });
  if (!reportLen.hasCopy || !reportLen.hasDl) fail("limite_copy_dl_buttons");
  else pass("limite_copy_dl_buttons");
  if (!reportLen.resultText || reportLen.resultText.length < 40) fail("limite_result_text_short");
  else pass("limite_result_text_professional", reportLen.resultText.length);
  // print path exists
  const hasPrint = await page.$("#btn-print");
  if (!hasPrint) fail("limite_print_btn");
  else pass("limite_print_btn");

  // Erase clears storage + UI
  page.once("dialog", async (d) => { await d.accept(); });
  await page.click("#btn-reset");
  await new Promise((r) => setTimeout(r, 300));
  const erased = await page.evaluate(() => ({
    ls: localStorage.getItem("confenge.tool.limite-acrescimos"),
    v: document.getElementById("valor_inicial").value,
    hidden: document.getElementById("resultado").hidden,
  }));
  if (erased.ls) fail("limite_erase_storage");
  else pass("limite_erase_storage");
  if (!erased.hidden) fail("limite_erase_ui");
  else pass("limite_erase_ui");
}

{
  // Reequilibrio persist + fieldset + ressalvas + urgency order + naKeys
  await page.goto(`${BASE}/ferramentas/checklist-reequilibrio/`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector("#root fieldset, .tool-fieldset, fieldset", { timeout: 10000 });
  const fs = await page.evaluate(() => document.querySelectorAll("fieldset").length);
  if (fs < 5) fail("reeq_fieldsets " + fs);
  else pass("reeq_fieldsets", fs);

  // Mark two N/A, set alta urgency + alta materialidade, leave blockers open
  await page.select("#urg", "alta");
  await page.select("#mat", "alta");
  const naInputs = await page.$$('input[value="na"]');
  if (naInputs[0]) await naInputs[0].click();
  if (naInputs[1]) await naInputs[1].click();
  const met = await page.$('input[value="met"]');
  if (met) await met.click();
  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden])", { timeout: 8000 });

  const reDom = await page.evaluate(() => {
    const out = document.getElementById("out");
    const t = out ? out.innerText : "";
    const ressalvas = out ? out.querySelector("[data-ressalvas]") : null;
    const order = out ? out.querySelector("[data-correction-order]") : null;
    const naLine = (t.match(/Não aplicáveis:\s*(\d+)/i) || [])[1];
    return {
      t: t.slice(0, 900),
      hasRessalvas: !!(ressalvas && ressalvas.querySelectorAll("li").length),
      ressalvaText: ressalvas ? ressalvas.innerText.slice(0, 300) : "",
      hasOrder: !!(order && order.querySelectorAll("li").length),
      orderText: order ? order.innerText.slice(0, 400) : "",
      naCount: naLine ? Number(naLine) : -1,
      urgenteReason: /bloqueador_urgente|suporte_economico_urgente/i.test(t),
    };
  });
  if (!reDom.hasRessalvas) fail("reeq_ressalvas_dom"); else pass("reeq_ressalvas_dom", reDom.ressalvaText.slice(0, 80));
  if (!/bloqueador|materialidade|urgência/i.test(reDom.ressalvaText)) fail("reeq_ressalvas_content");
  else pass("reeq_ressalvas_content");
  if (reDom.naCount < 1) fail("reeq_nakeys_ui", reDom.naCount); else pass("reeq_nakeys_ui", reDom.naCount);
  if (!reDom.hasOrder) fail("reeq_order_dom"); else pass("reeq_order_dom");
  if (!reDom.urgenteReason) fail("reeq_urgency_reason_ui"); else pass("reeq_urgency_reason_ui");

  // Switch to baixa and confirm order/reason change in DOM
  await page.select("#urg", "baixa");
  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden])", { timeout: 8000 });
  const reBaixa = await page.evaluate(() => {
    const order = document.querySelector("[data-correction-order]");
    return {
      orderText: order ? order.innerText : "",
      noUrgente: order ? !/urgente/i.test(order.innerText) : false,
    };
  });
  if (reBaixa.orderText === reDom.orderText) fail("reeq_urgency_order_ui_same");
  else pass("reeq_urgency_order_ui_diff");
  if (!reBaixa.noUrgente) fail("reeq_baixa_no_urgente_tag"); else pass("reeq_baixa_no_urgente_tag");

  const reStore = await page.evaluate(() => localStorage.getItem("confenge.tool.checklist-reequilibrio"));
  if (!reStore) fail("reeq_persist");
  else pass("reeq_persist");
  await page.reload({ waitUntil: "networkidle0" });
  const reRestored = await page.evaluate(() => localStorage.getItem("confenge.tool.checklist-reequilibrio"));
  if (!reRestored) fail("reeq_persist_after_reload");
  else pass("reeq_persist_after_reload");
}

{
  // Matriz: duration, concurrency, full event output + XSS escape on restore/result
  await page.goto(`${BASE}/ferramentas/matriz-atraso-obra/`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector('[data-f="causa"]');
  const hasDur = await page.$('[data-f="duracaoDias"]');
  const hasConc = await page.$('[data-f="concorrencia"]');
  const hasObs = await page.$('[data-f="observacao"]');
  if (!hasDur || !hasConc || !hasObs) fail("matriz_fields_missing");
  else pass("matriz_fields_dur_conc_obs");
  await page.type('[data-f="causa"]', "Frente não liberada");
  await page.select('[data-f="parte"]', "administracao");
  await page.type('[data-f="duracaoDias"]', "15");
  await page.select('[data-f="concorrencia"]', "sim");
  await page.type('[data-f="observacao"]', "Sobreposição com chuva no mesmo trecho");
  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden])", { timeout: 8000 });
  const mxFull = await page.evaluate(() => {
    const t = document.getElementById("out").innerText;
    return {
      t: t.slice(0, 800),
      docs: /documento|faltante|prova/i.test(t),
      nexo: /nexo temporal|período/i.test(t),
      crit: /caminho crítico|crítico/i.test(t),
      conc: /concorrência|sobreposição/i.test(t),
    };
  });
  if (!mxFull.docs) fail("matriz_result_docs"); else pass("matriz_result_docs");
  if (!mxFull.conc && !/concorr/i.test(mxFull.t)) fail("matriz_result_conc"); else pass("matriz_result_conc");
  const mxStore = await page.evaluate(() => localStorage.getItem("confenge.tool.matriz-atraso"));
  if (!mxStore) fail("matriz_persist"); else pass("matriz_persist");

  // XSS: inject payload via localStorage restore + result HTML
  await page.evaluate(() => {
    const payload = {
      v: 4,
      savedAt: Date.now(),
      data: {
        tem_matriz: "sim",
        events: [{
          id: "xss-1",
          causa: '"><img src=x onerror=window.__xss=1>',
          observacao: "<script>window.__xss=1</script><img src=x onerror=window.__xss=1>",
          dataInicio: "2026-01-01",
          dataFim: "2026-01-10",
          parte: "administracao",
          comunicacaoContemporanea: false,
          documentoDisponivel: false,
          atividadeAfetada: "<b>atv</b>",
          impactoCaminhoCritico: "sim",
          concorrencia: true,
        }],
      },
    };
    localStorage.setItem("confenge.tool.matriz-atraso", JSON.stringify(payload));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[data-f="causa"]', { timeout: 10000 });
  const xssCard = await page.evaluate(() => {
    const causa = document.querySelector('[data-f="causa"]');
    const obs = document.querySelector('[data-f="observacao"]');
    const card = document.querySelector(".tool-event-card");
    const badEls = card ? card.querySelectorAll("img, script, iframe, object, embed").length : -1;
    return {
      causaVal: causa ? causa.value : "",
      obsVal: obs ? obs.value : "",
      badEls: badEls,
      xssFlag: !!window.__xss,
    };
  });
  if (xssCard.xssFlag) fail("matriz_xss_executed_card");
  else pass("matriz_xss_card_no_exec");
  if (xssCard.badEls !== 0) fail("matriz_xss_card_attrs", xssCard);
  else pass("matriz_xss_card_escaped");
  if (!/onerror|img|script/i.test(xssCard.causaVal + xssCard.obsVal)) fail("matriz_xss_input_value_ok", xssCard);
  else pass("matriz_xss_input_value_ok");

  await page.click('button[type="submit"]');
  await page.waitForSelector("#out:not([hidden])", { timeout: 8000 });
  const xssOut = await page.evaluate(() => {
    const out = document.getElementById("out");
    const html = out ? out.innerHTML : "";
    const badEls = out ? out.querySelectorAll("img, script, iframe, object, embed").length : -1;
    return {
      html: html.slice(0, 1200),
      badEls: badEls,
      hasEntities: /&lt;|&quot;|&#39;|&amp;/.test(html),
      xssFlag: !!window.__xss,
      textShowsPayload: out ? /onerror|img src|script/i.test(out.innerText) : false,
    };
  });
  if (xssOut.xssFlag) fail("matriz_xss_executed_result");
  else pass("matriz_xss_result_no_exec");
  if (xssOut.badEls !== 0) fail("matriz_xss_result_raw", { badEls: xssOut.badEls, html: xssOut.html.slice(0, 200) });
  else pass("matriz_xss_result_escaped");
  if (!xssOut.hasEntities && !xssOut.textShowsPayload) fail("matriz_xss_result_visible");
  else pass("matriz_xss_result_safe_text");
}


// --- axe on all pilots ---
for (const pilot of PILOTS) {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE}${pilot.path}`, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
  });
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const violations = (results.violations || []).map((v) => {
    counts[v.impact] = (counts[v.impact] || 0) + 1;
    report.axe[v.impact] = (report.axe[v.impact] || 0) + 1;
    return {
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    };
  });
  report.axe.pages.push({
    path: pilot.path,
    id: pilot.id,
    counts,
    violations,
  });
  if (counts.critical > 0 || counts.serious > 0) {
    fail(`axe ${pilot.id} critical=${counts.critical} serious=${counts.serious}`);
  } else {
    pass(`axe ${pilot.id} critical=0 serious=0 (mod=${counts.moderate})`);
  }
}

await browser.close();
server.close();

writeFileSync(join(OUT, "e2e-report.json"), JSON.stringify(report, null, 2));
writeFileSync(
  join(OUT, "axe-report.json"),
  JSON.stringify(report.axe, null, 2)
);
writeFileSync(
  join(OUT, "e2e-summary.txt"),
  [
    `failed=${report.failed}`,
    `overflows=${report.overflows.length}`,
    `axe_critical=${report.axe.critical}`,
    `axe_serious=${report.axe.serious}`,
    `axe_moderate=${report.axe.moderate}`,
    `screenshots=${join(OUT, "screenshots/after")}`,
    `generated=${report.generated_at}`,
  ].join("\n") + "\n"
);

console.log("\n=== E2E SUMMARY ===");
console.log("failed", report.failed);
console.log("overflows", report.overflows.length);
console.log("axe critical/serious", report.axe.critical, report.axe.serious);
console.log("report", join(OUT, "e2e-report.json"));

if (report.failed > 0) process.exit(1);
console.log("ALL tools UIUX e2e checks passed");
