/** Browser e2e for the single #230 money-asset canary. */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-canary-e2e-"));
const base = "http://127.0.0.1:8766";
const secret = "money-canary-contract-secret";
const requests = [];
const leadRequests = [];
let downstreamMode = "ok";
let responseDelayMs = 0;

process.env.NODE_ENV = "test";
process.env.LEAD_STORE_DIR = storeDir;
process.env.CONFENGE_INBOUND_TIMEOUT_MS = "250";
delete process.env.RESEND_API_KEY;
delete process.env.OPS_WEBHOOK_URL;
delete process.env.TURNSTILE_SECRET_KEY;

function fail(name, detail = "") {
  throw new Error(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function pass(name, detail = "") {
  console.log("PASS", name, detail);
}

function verifySignature(header, raw) {
  const parts = Object.fromEntries(
    String(header || "").split(",").map((item) => item.trim().split("=")),
  );
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return expected === parts.v1;
}

const downstream = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw || "{}");
    requests.push({ body, headers: req.headers, raw });
    if (!verifySignature(req.headers["x-warmbly-signature"], raw)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_signature" }));
      return;
    }
    if (downstreamMode === "unavailable") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unavailable" }));
      return;
    }
    const duplicate = requests.filter((item) => item.body.lead_id === body.lead_id).length > 1;
    res.writeHead(duplicate ? 200 : 201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: {
        lead: { id: `wb-${body.lead_id}` },
        action: { id: `act-${body.lead_id}` },
        duplicate,
        dispatch_attempted: false,
      },
    }));
  });
});

await new Promise((resolve) => downstream.listen(0, "127.0.0.1", resolve));
const downstreamPort = downstream.address().port;
process.env.CONFENGE_INBOUND_WEBHOOK_URL =
  `http://127.0.0.1:${downstreamPort}/api/v1/webhooks/confenge/inbound`;
process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = secret;

const lead = require(path.join(root, "netlify/functions/lead.cjs"));
const { _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
_reset();

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function staticFile(urlPath) {
  if (urlPath === "/") return path.join(root, "index.html");
  if (urlPath === "/obrigado-contrato" || urlPath === "/obrigado-contrato/") {
    return path.join(root, "obrigado-contrato.html");
  }
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const candidate = path.join(root, clean.endsWith("/") ? `${clean}index.html` : clean);
  return candidate.startsWith(root) ? candidate : "";
}

const app = http.createServer((req, res) => {
  const url = new URL(req.url || "/", base);
  if (req.method === "POST" && url.pathname === "/.netlify/functions/lead") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      leadRequests.push(JSON.parse(body || "{}"));
      const result = await lead.handler({
        httpMethod: "POST",
        headers: {
          ...req.headers,
          origin: base,
          "x-forwarded-for": "198.51.100.230",
        },
        body,
      });
      const send = () => {
        res.writeHead(result.statusCode, result.headers || { "Content-Type": "application/json" });
        res.end(result.body);
      };
      if (responseDelayMs) setTimeout(send, responseDelayMs);
      else send();
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/.netlify/functions/collect") {
    req.resume();
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  const file = staticFile(url.pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  let content = fs.readFileSync(file);
  if (url.pathname === "/ferramentas/diagnostico-defesa-margem/") {
    content = Buffer.from(
      content.toString("utf8").replace('data-submit-timeout-ms="15000"', 'data-submit-timeout-ms="1000"'),
    );
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  res.end(content);
});

await new Promise((resolve, reject) => {
  app.once("error", reject);
  app.listen(8766, "127.0.0.1", resolve);
});

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

async function openCanary(page) {
  await page.goto(`${base}/ferramentas/diagnostico-defesa-margem/`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await page.waitForSelector('#lead-form[data-form-ready="true"]');
}

async function fillAndSubmit(page, suffix) {
  await page.type("#nome", `Canario Automatizado ${suffix}`);
  await page.type("#email", `canary-${suffix}@naoexiste.test.br`);
  await page.type("#mensagem", "Teste automatizado sem dados pessoais reais.");
  await page.click("#consentimento");
  await page.click('#lead-form [type="submit"]');
}

try {
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await openCanary(mobile);
  const geometry = await mobile.evaluate(() => {
    const honeypot = document.querySelector("#lead-form .honeypot");
    const priorDisplay = honeypot?.style.display || "";
    if (honeypot) honeypot.style.display = "none";
    const scrollWithoutHoneypot = document.documentElement.scrollWidth;
    if (honeypot) honeypot.style.display = priorDisplay;
    return ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    scrollWithoutHoneypot,
    action: document.querySelector("#lead-form")?.getAttribute("action"),
    statusRole: document.querySelector("#lead-form .form-status")?.getAttribute("role"),
    statusLive: document.querySelector("#lead-form .form-status")?.getAttribute("aria-live"),
    key: document.querySelector('#lead-form [name="idempotency_key"]')?.value || "",
    overflow: Array.from(document.querySelectorAll("body *"))
      .map((node) => ({
        tag: node.tagName,
        id: node.id,
        className: typeof node.className === "string" ? node.className : "",
        left: Math.round(node.getBoundingClientRect().left),
        right: Math.round(node.getBoundingClientRect().right),
        width: Math.round(node.getBoundingClientRect().width),
      }))
      .filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1)
      .slice(0, 12),
    wide: Array.from(document.querySelectorAll("body *"))
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .slice(0, 12)
      .map((node) => ({ tag: node.tagName, id: node.id, className: node.className, client: node.clientWidth, scroll: node.scrollWidth })),
  });
  });
  if (geometry.scroll > geometry.viewport + 1) fail("mobile_horizontal_overflow", geometry);
  if (geometry.action !== "/.netlify/functions/lead") fail("persist_first_no_js_action", geometry);
  if (geometry.statusRole !== "status" || geometry.statusLive !== "polite") fail("failure_status_a11y", geometry);
  if (!geometry.key.startsWith("fe-")) fail("idempotency_key_missing", geometry);
  await mobile.reload({ waitUntil: "networkidle0" });
  await mobile.waitForSelector('#lead-form[data-form-ready="true"]');
  const refreshedKey = await mobile.$eval('#lead-form [name="idempotency_key"]', (node) => node.value);
  if (refreshedKey !== geometry.key) fail("refresh_changed_idempotency", { before: geometry.key, after: refreshedKey });
  pass("mobile_refresh_and_a11y", { viewport: 390, idempotency_stable: true });

  responseDelayMs = 1300;
  await fillAndSubmit(mobile, "timeout");
  await mobile.waitForFunction(
    () => document.querySelector("#lead-form .form-status")?.textContent.includes("protocolo só aparece"),
    { timeout: 5000 },
  );
  const fallback = await mobile.$eval("#lead-form .form-status", (node) => ({
    text: node.textContent,
    whatsapp: Boolean(node.querySelector('[data-wa-fallback="1"]')),
  }));
  if (!fallback.whatsapp) fail("timeout_not_actionable", fallback);
  await new Promise((resolve) => setTimeout(resolve, 500));
  responseDelayMs = 0;
  await mobile.click('#lead-form [type="submit"]');
  await mobile.waitForFunction(() => location.pathname === "/obrigado-contrato", { timeout: 5000 });
  const timeoutRecords = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json") && !name.startsWith("idem"));
  if (timeoutRecords.length !== 1) fail("timeout_resend_duplicate_record", timeoutRecords);
  pass("timeout_resend_same_receipt", { records: timeoutRecords.length });

  const success = await browser.newPage();
  await success.setViewport({ width: 1280, height: 900 });
  await openCanary(success);
  const beforePosts = requests.length;
  await fillAndSubmit(success, "success");
  await success.waitForFunction(() => location.pathname === "/obrigado-contrato", { timeout: 5000 });
  const firstPayload = requests.at(-1)?.body;
  const submittedPayload = leadRequests.at(-1);
  if (!firstPayload?.lead_id || !submittedPayload?.idempotency_key || requests.length !== beforePosts + 1) {
    fail("success_handoff", requests.slice(beforePosts));
  }
  const replay = await success.evaluate(async (payload) => {
    const response = await fetch("/.netlify/functions/lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": payload.idempotency_key,
      },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }, submittedPayload);
  if (replay.status !== 200 || replay.body.idempotent !== true || replay.body.lead_id !== firstPayload.lead_id) {
    fail("duplicate_contract", replay);
  }
  if (requests.length !== beforePosts + 1) fail("duplicate_reposted_downstream", requests.length - beforePosts);
  pass("success_and_duplicate", { lead_id: firstPayload.lead_id });

  await openCanary(success);
  const nextRequestKey = await success.$eval(
    '#lead-form [name="idempotency_key"]',
    (node) => node.value,
  );
  if (!nextRequestKey.startsWith("fe-") || nextRequestKey === submittedPayload.idempotency_key) {
    fail("successful_receipt_did_not_rotate_key", {
      previous: submittedPayload.idempotency_key,
      next: nextRequestKey,
    });
  }
  pass("successful_receipt_rotates_key");

  downstreamMode = "unavailable";
  const unavailable = await browser.newPage();
  await openCanary(unavailable);
  await fillAndSubmit(unavailable, "unavailable");
  await unavailable.waitForFunction(() => location.pathname === "/obrigado-contrato", { timeout: 5000 });
  const files = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json") && !name.startsWith("idem"));
  const records = files.map((name) => JSON.parse(fs.readFileSync(path.join(storeDir, name), "utf8")));
  const retryable = records.find((record) => record.email === "canary-unavailable@naoexiste.test.br");
  if (retryable?.handoff?.status !== "RETRYABLE" || !retryable.handoff.next_attempt_at) {
    fail("unavailable_not_retryable", retryable);
  }
  pass("warmbly_unavailable_persists", { status: retryable.handoff.status });
} finally {
  await browser.close();
  await new Promise((resolve) => app.close(resolve));
  await new Promise((resolve) => downstream.close(resolve));
  fs.rmSync(storeDir, { recursive: true, force: true });
}

console.log("MONEY_ASSET_CANARY_E2E_OK");
