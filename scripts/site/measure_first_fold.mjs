/**
 * Medidor de primeira dobra das superficies obrigadas (issue #327).
 *
 * O contrato `data/commercial/first-fold-contract.v1.json` exige que nenhuma
 * rota seja promovida por opiniao. Este script produz a unica evidencia que o
 * contrato aceita: coordenadas renderizadas em Chrome headless, nos dois
 * viewports que o proprio contrato declara, para cada linha do censo.
 *
 * Ele nao decide nada por conta propria. As regras de veredito vivem em
 * `scripts/site/first_fold_rules.mjs` e sao as mesmas que o gate
 * `tests/commercial/test_first_fold_contract.mjs` aplica ao ler o resultado.
 * Isso e o que impede promover uma rota editando o censo a mao.
 *
 * Uso:
 *   node scripts/site/measure_first_fold.mjs            # mede e imprime
 *   node scripts/site/measure_first_fold.mjs --write    # grava evidencia e censo
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  ROLE_SELECTORS,
  blockerText,
  categoryRepetition,
  foldProblems,
  frozenRoutes,
  measurementRecord,
} from "./first_fold_rules.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.FIRST_FOLD_PORT || 8796);
const CONTRACT_PATH = join(ROOT, "data/commercial/first-fold-contract.v1.json");
const EVIDENCE_PATH = join(ROOT, "data/commercial/first-fold-measurements.v1.json");
const UNLOCK_PLAN_PATH = join(ROOT, "data/bofu-dominance/frozen-specs/unlock-plan.v1.json");

const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  const server = createServer((req, res) => {
    let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = join(ROOT, pathname);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ready) => server.listen(PORT, "127.0.0.1", () => ready(server)));
}

async function measureRoute(page, route, viewport) {
  const [width, height] = viewport.split("x").map(Number);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  return page.evaluate((roles) => {
    const main = document.querySelector("main") || document.body;

    const visible = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      }
      if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };

    const boxOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const textOf = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();

    // A dobra pertence ao bloco que carrega o H1, nao ao documento inteiro. Sem
    // esse recorte, um `.eyebrow` de uma secao a 3714px do topo seria lido como
    // se fosse a categoria da primeira dobra.
    const firstH1 = [...main.querySelectorAll("h1")].find(visible) || null;
    const hero = firstH1 ? firstH1.closest("header, section, article") || main : main;

    const pickIn = (scope, selectors) => {
      for (const selector of selectors) {
        for (const element of scope.querySelectorAll(selector)) {
          if (visible(element)) return { selector, element };
        }
      }
      return null;
    };

    const result = { viewport: `${window.innerWidth}x${window.innerHeight}`, roles: {} };
    for (const [role, selectors] of Object.entries(roles)) {
      // As tres respostas de leitura pertencem ao bloco do H1. A acao dominante
      // pode viver no bloco seguinte, como nos hubs, entao ela e procurada no
      // <main> inteiro e julgada pela coordenada, nao pelo parentesco.
      const hit = role === "primary_action" ? pickIn(main, selectors) : pickIn(hero, selectors);
      result.roles[role] = hit
        ? { selector: hit.selector, box: boxOf(hit.element), text: textOf(hit.element).slice(0, 240) }
        : null;
    }

    // Acao primaria dominante: quantas acoes com peso visual de primaria estao
    // inteiras dentro da dobra. Uma segunda primaria concorrente reprova o
    // invariante `single_primary_action`; nenhuma reprova a dobra.
    const inFold = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom <= window.innerHeight && rect.top >= 0;
    };
    result.primary_actions_in_fold = [...main.querySelectorAll("a.button-primary, button.button-primary")]
      .filter(visible)
      .filter(inFold)
      .map((element) => ({ text: textOf(element).slice(0, 120), href: element.getAttribute("href") || "", box: boxOf(element) }));

    // Acao secundaria: so e aceita quando cumpre funcao distinta da primaria,
    // ou seja, quando o destino difere.
    result.secondary_actions_in_fold = [...main.querySelectorAll(
      ".hero-actions a:not(.button), .deliverables-hero-actions a:not(.button), .report-hero-actions a:not(.button), .lead-inline-actions a:not(.button)",
    )]
      .filter(visible)
      .filter(inFold)
      .map((element) => ({ text: textOf(element).slice(0, 120), href: element.getAttribute("href") || "" }));

    // Prova conferivel: um destino publico que o visitante abre sem cadastro,
    // dentro do bloco de prova da dobra.
    const proofHit = pickIn(hero, roles.proof);
    let verifiableProof = null;
    if (proofHit) {
      const link = [...proofHit.element.querySelectorAll("a[href]")].filter(visible)[0]
        || (proofHit.element.matches("a[href]") ? proofHit.element : null);
      if (link) verifiableProof = { text: textOf(link).slice(0, 120), href: link.getAttribute("href") || "" };
    }
    result.verifiable_proof = verifiableProof;

    result.horizontal_overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return result;
  }, ROLE_SELECTORS);
}

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const unlockPlan = JSON.parse(readFileSync(UNLOCK_PLAN_PATH, "utf8"));
const routes = contract.census.map((row) => row.route);
const today = new Date().toISOString().slice(0, 10);
const BLOCKER = blockerText(unlockPlan);
const FROZEN_ROUTES = frozenRoutes(unlockPlan);

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const measurements = [];
try {
  for (const route of routes) {
    const perViewport = {};
    for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
      perViewport[viewport] = await measureRoute(page, route, viewport);
    }
    const desktop = perViewport[DESKTOP_VIEWPORT];
    const routeMeasurement = {
      route,
      measured_on: today,
      viewports: perViewport,
      category_repetition: categoryRepetition({
        eyebrow: desktop.roles.eyebrow?.text,
        h1: desktop.roles.h1?.text,
        lead: desktop.roles.lead?.text,
      }),
    };
    measurements.push(routeMeasurement);
    const problems = foldProblems(routeMeasurement);
    console.log(`${problems.length ? "FALHA " : "OK    "}${route.padEnd(52)} ${problems.join(" ")}`);
  }
} finally {
  await browser.close();
  server.close();
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
const evidence = {
  schema: "confenge.first-fold-measurements/1.0",
  issue: "#327",
  measured_at: new Date().toISOString(),
  measured_on: today,
  commit_sha: commit,
  tree_dirty: Boolean(dirty),
  viewports: [DESKTOP_VIEWPORT, MOBILE_VIEWPORT],
  role_selectors: ROLE_SELECTORS,
  rules: "scripts/site/first_fold_rules.mjs",
  routes: measurements,
};

const byRoute = new Map(measurements.map((row) => [row.route, row]));
const nextCensus = contract.census.map((surface) => {
  const { state, record } = measurementRecord(byRoute.get(surface.route), BLOCKER);
  if (state === "MEASURED_FAIL" && !FROZEN_ROUTES.has(surface.route)) {
    throw new Error(
      `first_fold_unexplained_failure:${surface.route}:${foldProblems(byRoute.get(surface.route)).join(" ")}`,
    );
  }
  const next = { ...surface, evidence_state: state, measurement: record };
  return next;
});

const invariants = contract.first_fold_invariants;
invariants.single_primary_action = {
  ...invariants.single_primary_action,
  state: "MEASURED",
  measured_at: today,
  measured_surfaces: measurements.map((row) => ({
    route: row.route,
    primary_actions_in_fold: {
      [DESKTOP_VIEWPORT]: row.viewports[DESKTOP_VIEWPORT].primary_actions_in_fold.length,
      [MOBILE_VIEWPORT]: row.viewports[MOBILE_VIEWPORT].primary_actions_in_fold.length,
    },
  })),
};
invariants.category_repetition = {
  ...invariants.category_repetition,
  state: "MEASURED",
  measured_at: today,
  method_pt_br:
    "Palavras de conteúdo com quatro letras ou mais, sem acento e sem palavras de ligação. " +
    "O eyebrow precisa trazer ao menos uma palavra que o H1 não traz, e o lead ao menos uma " +
    "que eyebrow e H1 não trazem.",
  measured_surfaces: measurements.map((row) => ({
    route: row.route,
    ok: row.category_repetition.ok,
    eyebrow_adds: row.category_repetition.eyebrow_new.slice(0, 4),
    lead_adds: row.category_repetition.lead_new.slice(0, 4),
  })),
};

const nextContract = {
  ...contract,
  contract_version: "CFG-FIRST-FOLD-2026-08-30-v3",
  census: nextCensus,
  first_fold_invariants: invariants,
};

const passes = nextCensus.filter((s) => s.evidence_state === "MEASURED_PASS").length;
const fails = nextCensus.filter((s) => s.evidence_state === "MEASURED_FAIL").length;
const pending = nextCensus.filter((s) => s.evidence_state === "PENDING").length;
console.log(`first-fold: medidas ${passes} PASS, ${fails} FAIL, ${pending} PENDING em ${nextCensus.length} rotas`);

if (process.argv.includes("--write")) {
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(CONTRACT_PATH, `${JSON.stringify(nextContract, null, 2)}\n`, "utf8");
  console.log("wrote", EVIDENCE_PATH);
  console.log("wrote", CONTRACT_PATH);
} else {
  console.log("dry run: nada gravado; use --write");
}
