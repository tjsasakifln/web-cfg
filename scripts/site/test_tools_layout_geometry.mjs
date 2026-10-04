/**
 * Browser geometry regression for every public page in /ferramentas/.
 *
 * It exercises the initial UI and the relevant calculated-result state at the
 * campaign acceptance widths. Evidence is written outside the public artifact
 * when TOOLS_LAYOUT_EVIDENCE_DIR is supplied.
 *
 * Usage:
 *   node scripts/site/test_tools_layout_geometry.mjs
 *   TOOLS_LAYOUT_EVIDENCE_DIR=../tool-layout-evidence/after node scripts/site/test_tools_layout_geometry.mjs
 *   TOOLS_LAYOUT_ALLOW_FAILURES=1 ... # baseline capture only
 * PowerShell:
 *   $env:TOOLS_LAYOUT_EVIDENCE_DIR='../tool-layout-evidence/after'; node scripts/site/test_tools_layout_geometry.mjs
 */
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.TOOLS_LAYOUT_PORT || 8817);
const OUT = resolve(process.env.TOOLS_LAYOUT_EVIDENCE_DIR || join(ROOT, ".playwright-mcp", "tools-layout"));
const ALLOW_FAILURES = process.env.TOOLS_LAYOUT_ALLOW_FAILURES === "1";
const VIEWPORTS = [320, 390, 901, 1240, 1440];
const ROUTES = [
  { id: "catalogo", path: "/ferramentas/", primary: ".tool-hub-situations" },
  { id: "reequilibrio", path: "/ferramentas/checklist-reequilibrio/", primary: "#f" },
  { id: "limite", path: "/ferramentas/limite-acrescimos-supressoes/", primary: "#limite-form" },
  { id: "matriz", path: "/ferramentas/matriz-atraso-obra/", primary: "#f" },
  { id: "margem", path: "/ferramentas/diagnostico-defesa-margem/", primary: "#lookup" },
  { id: "prontidao", path: "/ferramentas/prontidao-tecnica-obra-privada/", primary: "#diagnostico" },
];
const expectedRoutePaths = ROUTES.map(({ path }) => path).sort();
const sitemapToolPaths = [...readFileSync(join(ROOT, "sitemap.xml"), "utf8").matchAll(
  /<loc>https:\/\/confenge\.com\.br(\/ferramentas\/[^<]*)<\/loc>/g,
)].map((match) => match[1]).sort();
const manifestToolPaths = JSON.parse(readFileSync(join(ROOT, "seo", "PUBLIC-ARTIFACT-MANIFEST.json"), "utf8"))
  .html_routes.filter((route) => route.startsWith("/ferramentas/"))
  .sort();
if (JSON.stringify(sitemapToolPaths) !== JSON.stringify(expectedRoutePaths)) {
  throw new Error(`tool sitemap inventory changed: ${JSON.stringify(sitemapToolPaths)}`);
}
if (JSON.stringify(manifestToolPaths) !== JSON.stringify(expectedRoutePaths)) {
  throw new Error(`tool public manifest inventory changed: ${JSON.stringify(manifestToolPaths)}`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || resolveChromePath();
}

function startServer() {
  const server = createServer((request, response) => {
    try {
      let requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
      if (requestPath.endsWith("/")) requestPath += "index.html";
      const filePath = join(ROOT, requestPath);
      if (!filePath.startsWith(`${ROOT}${sep}`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      response.end(readFileSync(filePath));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

function viewportHeight(width) {
  if (width <= 390) return 844;
  if (width <= 901) return 900;
  return 1000;
}

async function waitForPaint(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function geometry(page, route, state, width) {
  return page.evaluate(({ route, state, width }) => {
    const findings = [];
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && !element.hidden &&
        box.width > 0 && box.height > 0 && box.right >= 0 && box.left <= innerWidth;
    };
    const rounded = (value) => Math.round(value * 10) / 10;
    const describe = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const add = (code, element, details = {}) => findings.push({
      code,
      target: element ? describe(element) : "document",
      ...details,
    });

    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      add("document_horizontal_overflow", null, { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth });
    }

    const frameSelectors = [
      ".tool-form",
      ".tool-situation",
      ".tool-event-card",
      ".tool-result-panel",
      ".tool-limit-panel",
      ".tool-result-stat",
      ".tool-axis-visual",
      ".tool-precalc-summary",
      ".contact-form",
      ".pptr-method",
      ".pptr-direct",
      ".pptr-form fieldset",
      ".pptr-result",
      ".pptr-cta",
    ];
    const frames = [...document.querySelectorAll(frameSelectors.join(","))].filter(visible);
    for (const frame of frames) {
      const style = getComputedStyle(frame);
      const box = frame.getBoundingClientRect();
      const left = Number.parseFloat(style.paddingInlineStart) || 0;
      const right = Number.parseFloat(style.paddingInlineEnd) || 0;
      if (left < 13.5 || right < 13.5) {
        add("frame_inner_inset", frame, { left: rounded(left), right: rounded(right) });
      }
      if (box.left < -1 || box.right > innerWidth + 1) {
        add("frame_outside_viewport", frame, { left: rounded(box.left), right: rounded(box.right), viewport: innerWidth });
      }
    }

    const controls = [...document.querySelectorAll("main input:not([type=hidden]), main select, main textarea, main button, main .button")].filter(visible);
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      if (box.left < -1 || box.right > innerWidth + 1) {
        add("control_overflow", control, {
          left: rounded(box.left),
          right: rounded(box.right),
        });
      }
      if (box.height < 43 && style.position !== "absolute" && control.type !== "radio" && control.type !== "checkbox") {
        add("control_target_height", control, { height: rounded(box.height) });
      }
    }

    const textBlocks = [...document.querySelectorAll("main h1, main h2, main h3, main p, main li, main dt, main dd, main legend, main label")]
      .filter((element) => visible(element) && !element.closest(".honeypot"));
    for (const block of textBlocks) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let node;
      let outside = null;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        outside = [...range.getClientRects()].find((rect) => rect.left < -1 || rect.right > innerWidth + 1) || null;
        if (outside) break;
      }
      if (outside) {
        add("text_overflow", block, { left: rounded(outside.left), right: rounded(outside.right) });
      }
    }

    for (const table of [...document.querySelectorAll("main table")].filter(visible)) {
      const box = table.getBoundingClientRect();
      let ancestor = table.parentElement;
      let scrollOwner = false;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (["auto", "scroll"].includes(style.overflowX)) {
          scrollOwner = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (box.right > innerWidth + 1 && !scrollOwner) add("table_without_scroll_container", table, { right: rounded(box.right) });
    }

    if (route === "reequilibrio") {
      const choices = [...document.querySelectorAll(".tool-req-states > label")].filter(visible);
      for (const choice of choices) {
        const box = choice.getBoundingClientRect();
        if (box.height < 43) add("reequilibrio_choice_target", choice, { height: rounded(box.height) });
      }
    }

    return {
      route,
      state,
      width,
      title: document.title,
      frameCount: frames.length,
      controlCount: controls.length,
      findings,
      computed: {
        toolFormPadding: (() => {
          const form = document.querySelector(".tool-form");
          if (!form || !visible(form)) return null;
          const style = getComputedStyle(form);
          return `${style.paddingInlineStart} ${style.paddingInlineEnd}`;
        })(),
      },
    };
  }, { route, state, width });
}

async function screenshot(page, id, width, state, selector) {
  const target = await page.$(selector);
  if (!target) throw new Error(`missing screenshot target: ${id} ${state} ${selector}`);
  const path = join(OUT, "screenshots", `${id}-${width}-${state}.png`);
  await target.screenshot({ path });
  return path;
}

async function requireVisiblePrimary(page, route) {
  const visible = await page.$eval(route.primary, (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && !element.hidden && box.width > 0 && box.height > 0;
  }).catch(() => false);
  if (!visible) throw new Error(`missing or hidden primary surface: ${route.id} ${route.primary}`);
}

async function exercise(page, id) {
  if (id === "limite") {
    await page.evaluate(() => {
      const set = (name, value) => {
        const field = document.getElementById(name);
        field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("base_status", "CONFIRMED");
      set("valor_inicial", "10000000");
      set("object_status", "CONFIRMED");
      set("tipo", "geral");
      document.querySelector('[data-limite-step="1"] [data-limite-next]').click();
    });
    await waitForPaint(page);
    const stage2 = await geometry(page, id, "etapa-2", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "etapa-2", "#limite-form");
    await page.evaluate(() => {
      const set = (name, value) => {
        const field = document.getElementById(name);
        field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("previous_totals_status", "CONFIRMED_COMPLETE");
      set("acrescimos_previos", "1800000");
      set("supressoes_previas", "0");
      document.querySelector('[data-limite-step="2"] [data-limite-next]').click();
    });
    await waitForPaint(page);
    const stage3 = await geometry(page, id, "etapa-3", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "etapa-3", "#limite-form");
    await page.evaluate(() => {
      const set = (name, value) => {
        const field = document.getElementById(name);
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("acrescimo_proposto", "900000");
      set("supressao_proposta", "0");
      document.getElementById("limite-form").requestSubmit();
    });
    await page.waitForSelector("#resultado:not([hidden])", { timeout: 5000 });
    await waitForPaint(page);
    const result = await geometry(page, id, "resultado", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "resultado", "#resultado");
    return [stage2, stage3, result];
  }

  if (id === "reequilibrio") {
    const firstChoice = await page.$(".tool-req-states input[type=radio]");
    if (!firstChoice) throw new Error("reequilibrio radio choices missing");
    await firstChoice.focus();
    await page.keyboard.press("ArrowRight");
    const keyboardState = await page.evaluate(() => {
      const active = document.activeElement;
      const label = active?.closest(".tool-req-states > label");
      return {
        checked: active instanceof HTMLInputElement && active.checked,
        focusWithin: Boolean(label?.matches(":focus-within")),
        ring: label ? getComputedStyle(label).boxShadow : "none",
      };
    });
    if (!keyboardState.checked || !keyboardState.focusWithin || keyboardState.ring === "none") {
      throw new Error(`reequilibrio keyboard/focus regression: ${JSON.stringify(keyboardState)}`);
    }
    await page.evaluate(() => {
      const names = new Set([...document.querySelectorAll("#f input[type=radio]")].map((input) => input.name));
      for (const name of names) document.querySelector(`#f input[name="${CSS.escape(name)}"]`).checked = true;
      document.getElementById("f").requestSubmit();
    });
    await page.waitForSelector("#out:not([hidden])", { timeout: 5000 });
    await waitForPaint(page);
    const result = await geometry(page, id, "resultado", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "resultado", "#out");
    return [result];
  }

  if (id === "matriz") {
    await page.evaluate(() => {
      document.querySelectorAll("#f input:not([type=hidden]), #f textarea").forEach((field) => {
        if (/date/i.test(field.type)) field.value = "2026-01-15";
        else if (/number/i.test(field.type)) field.value = "5";
        else field.value = "Evento documentado para teste visual";
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      document.querySelectorAll("#f select").forEach((field) => {
        if (field.options.length > 1) field.selectedIndex = 1;
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
      document.getElementById("f").requestSubmit();
    });
    await page.waitForSelector("#out:not([hidden])", { timeout: 5000 });
    await waitForPaint(page);
    const result = await geometry(page, id, "resultado", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "resultado", "#out");
    return [result];
  }

  if (id === "margem") {
    await page.waitForFunction(() => !document.querySelector("#lookup button.tool-run")?.disabled, { timeout: 8000 });
    await page.evaluate(() => {
      const input = document.getElementById("qid");
      input.value = "itajai";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("lookup").requestSubmit();
    });
    await page.waitForFunction(() => /itaj/i.test(document.getElementById("identificacao")?.innerText || ""), { timeout: 8000 });
    await waitForPaint(page);
    const result = await geometry(page, id, "resultado", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "resultado", "#diagnostic-result");
    return [result];
  }

  if (id === "prontidao") {
    await page.waitForFunction(() => !document.querySelector("#diagnostico button.tool-run")?.disabled, { timeout: 5000 });
    await page.evaluate(() => {
      document.querySelectorAll("#diagnostico select").forEach((field) => {
        field.selectedIndex = Math.min(1, field.options.length - 1);
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
      document.getElementById("diagnostico").requestSubmit();
    });
    await page.waitForSelector("#resultado-acoes:not([hidden])", { timeout: 5000 });
    await waitForPaint(page);
    const result = await geometry(page, id, "resultado", page.viewport().width);
    await screenshot(page, id, page.viewport().width, "resultado", "#resultado");
    return [result];
  }
  return [];
}

mkdirSync(join(OUT, "screenshots"), { recursive: true });
const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
});
const report = {
  generatedAt: new Date().toISOString(),
  widths: VIEWPORTS,
  routes: ROUTES.map(({ id, path }) => ({ id, path })),
  checks: [],
};

try {
  const probe = await browser.newPage();
  await probe.setViewport({ width: 320, height: 480, deviceScaleFactor: 1 });
  await probe.setContent(`
    <main>
      <form class="tool-form" style="padding:0;width:340px;border:1px solid #000">
        <p>Fixture de geometria deliberadamente larga</p>
        <button style="height:20px">Continuar</button>
      </form>
    </main>
  `);
  const negativeProbe = await geometry(probe, "detector-probe", "negative", 320);
  const probeCodes = new Set(negativeProbe.findings.map(({ code }) => code));
  for (const expected of ["document_horizontal_overflow", "frame_inner_inset", "frame_outside_viewport", "control_target_height"]) {
    if (!probeCodes.has(expected)) throw new Error(`geometry detector missed ${expected}`);
  }
  report.detectorProbe = { expectedFailures: [...probeCodes].sort() };
  await probe.close();

  for (const width of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: viewportHeight(width), deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Storage can be unavailable on an opaque error document only.
      }
    });
    for (const route of ROUTES) {
      const response = await page.goto(`http://127.0.0.1:${PORT}${route.path}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      if (!response?.ok()) throw new Error(`${route.path} returned ${response?.status()}`);
      await waitForPaint(page);
      await requireVisiblePrimary(page, route);
      report.checks.push(await geometry(page, route.id, "inicial", width));
      await screenshot(page, route.id, width, "inicial", route.primary);
      report.checks.push(...await exercise(page, route.id));
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

const failures = report.checks.flatMap((check) => check.findings.map((finding) => ({
  route: check.route,
  state: check.state,
  width: check.width,
  ...finding,
})));
report.summary = {
  stateChecks: report.checks.length,
  failures: failures.length,
  byCode: Object.fromEntries([...new Set(failures.map((failure) => failure.code))].sort().map((code) => [
    code,
    failures.filter((failure) => failure.code === code).length,
  ])),
};
report.failures = failures;
writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`tools layout geometry: ${failures.length} failure(s)`, report.summary.byCode);
  console.error(failures.slice(0, 20));
  if (!ALLOW_FAILURES) process.exitCode = 1;
} else {
  console.log(`tools layout geometry: PASS (${report.summary.stateChecks} route/state/width checks)`);
}
