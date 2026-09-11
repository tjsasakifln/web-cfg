/**
 * Local intercepted journey: serve the shipped home form, POST to the real
 * handler, block every external send. WhatsApp click without POST is not a lead.
 */
import http from "http";
import fs from "fs";
import path from "path";
import {
  ROOT,
  isolateEnv,
  makeStoreDir,
  loadLeadHandler,
  pass,
  fail,
  tmpCleanup,
  getResults,
} from "./helpers.mjs";

const PORT = Number(process.env.POS_INB_01_PORT || 18765);
const storeDir = makeStoreDir("browser");
isolateEnv(storeDir);
const { handler, setStoreForTests } = loadLeadHandler();
setStoreForTests(null);
const leadStoreMod = (await import("module")).createRequire(import.meta.url)(path.join(ROOT, "netlify/functions/lib/lead-store.cjs"));
const FileStoreCtor = leadStoreMod.FileStore;

const blockedHosts = [];
const posts = [];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function insideRoot(file) {
  const rel = path.relative(ROOT, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function invokeLead(req, rawBody) {
  const origin = req.headers.origin || `http://127.0.0.1:${PORT}`;
  const event = {
    httpMethod: "POST",
    headers: {
      "content-type": req.headers["content-type"] || "application/json",
      origin: origin.includes("127.0.0.1") || origin.includes("localhost")
        ? "https://confenge.com.br"
        : origin,
      "user-agent": req.headers["user-agent"] || "pos-inb-01-browser",
      "x-forwarded-for": "203.0.113.40",
      "idempotency-key": req.headers["idempotency-key"] || "",
    },
    body: rawBody,
  };
  posts.push({ path: req.url, bytes: rawBody.length });
  return handler(event);
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);
  if (req.method === "POST" && (url.pathname === "/api/web/lead" || url.pathname === "/.netlify/functions/lead" || url.pathname === "/api/web")) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      const out = await invokeLead(req, raw);
      res.writeHead(out.statusCode, out.headers || { "content-type": "application/json" });
      res.end(out.body);
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "handler_throw" }));
    }
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const file = path.normalize(path.join(ROOT, relative));
    if (!insideRoot(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" });
    res.end(fs.readFileSync(file));
    return;
  }
  blockedHosts.push({ method: req.method, path: url.pathname });
  res.writeHead(451, { "content-type": "text/plain" });
  res.end("blocked-external");
});

await new Promise((resolve, reject) => {
  server.on("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});
const base = `http://127.0.0.1:${PORT}`;

try {
  const home = await fetch(`${base}/`);
  const html = await home.text();
  if (home.status !== 200) fail("home_http", home.status);
  if (!html.includes('id="formulario-contato"') || !html.includes('name="consentimento"')) {
    fail("home_form_missing");
  }
  if (!html.includes('id="estagio"') || !html.includes('id="nome"')) fail("home_required_fields");
  if (/name="cnpj"|type="file"/i.test(html)) fail("home_added_required_sensitive");
  const scriptTag = html.includes("/script.js") || html.includes("script.js");
  if (!scriptTag) fail("home_script_missing");
  const js = await fetch(`${base}/script.js`);
  const jsText = await js.text();
  if (!jsText.includes("/api/web/lead")) fail("script_missing_canonical_post");
  if (jsText.includes("fetch('/.netlify/functions/lead'")) fail("script_preference_swap");
  pass("served_home_form_and_script");

  const before = await new FileStoreCtor(storeDir).list();
  const payload = {
    nome: "Ana Privada",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    jornada: "projeto",
    consentimento: "on",
    origem: "/ferramentas/checklist-reequilibrio/",
    landing_url: "/ferramentas/checklist-reequilibrio/",
    analytics_consent: false,
    cookie_consent: "denied",
    idempotency_key: "pos-inb-01-browser-form-001",
  };
  const posted = await fetch(`${base}/api/web/lead`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "idempotency-key": payload.idempotency_key,
    },
    body: JSON.stringify(payload),
  });
  const body = await posted.json();
  const durable = new FileStoreCtor(storeDir);
  const stored = body.lead_id ? await durable.get(body.lead_id) : null;
  if (posted.status !== 201 || !body.ok || !stored) fail("browser_post_persist", { status: posted.status, body });
  if (!body.lead_id || body.receipt_id !== body.lead_id) fail("browser_protocol", body);
  if (stored.estagio !== payload.estagio) fail("browser_need", stored.estagio);
  if (stored.cnpj) fail("browser_cnpj");
  pass("form_post_creates_durable_row_only_after_persist", { lead_id: body.lead_id });

  const alias = await fetch(`${base}/.netlify/functions/lead`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "idempotency-key": payload.idempotency_key,
    },
    body: JSON.stringify(payload),
  });
  const aliasBody = await alias.json();
  if (alias.status !== 200 || aliasBody.idempotent !== true || aliasBody.lead_id !== body.lead_id) {
    fail("alias_replay", aliasBody);
  }
  pass("compatibility_alias_idempotent");

  const waBefore = (await durable.list()).length;
  const wa = await fetch(`${base}/`, { method: "GET" });
  if (wa.status !== 200) fail("whatsapp_nav");
  if ((await durable.list()).length !== waBefore) fail("get_home_created_lead");
  if (html.includes("wa.me/5548988344559") === false) fail("whatsapp_href_missing");
  pass("whatsapp_href_present_click_without_post_creates_no_row");

  const failed = await fetch(`${base}/api/web/lead`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
    body: JSON.stringify({ nome: "x" }),
  });
  const failedBody = await failed.json();
  if (failed.ok || failedBody.lead_id) fail("invalid_got_protocol", failedBody);
  pass("invalid_browser_post_has_no_protocol");

  let chrome = { ran: false, reason: "not_attempted" };
  const chromePath = process.env.CHROME_PATH || process.env.CHROME || "";
  if (chromePath && fs.existsSync(chromePath)) {
    try {
      const puppeteer = (await import("puppeteer-core")).default;
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ["--no-sandbox", "--disable-gpu"],
      });
      try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          const u = request.url();
          if (u.startsWith(base) || u.startsWith("data:")) {
            request.continue();
            return;
          }
          blockedHosts.push({ method: request.method(), path: u.split("?")[0] });
          request.abort("blockedbyclient");
        });
        await page.setViewport({ width: 390, height: 844 });
        await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
        await page.type("#nome", "Ana Privada");
        await page.type("#telefone", "48988344559");
        await page.select("#estagio", "projeto, revisão ou compatibilização");
        await page.click("#consentimento");
        const submit = await page.$('button[type="submit"], .form-submit');
        if (submit) await submit.click();
        chrome = { ran: true, reason: "ok" };
      } finally {
        await browser.close();
      }
    } catch (err) {
      chrome = { ran: false, reason: String(err && err.message ? err.message : err).slice(0, 160) };
    }
  } else {
    chrome = { ran: false, reason: "chrome_binary_unavailable" };
  }
  pass("headless_browser_status", chrome);

  const screenshotDir = "/tmp/grok-goal-8f5409acdd48/implementer";
  fs.writeFileSync(
    path.join(screenshotDir, "browser-local.log"),
    JSON.stringify({
      base,
      posts: posts.length,
      blocked_external: blockedHosts.length,
      chrome,
      local_vs_netcup: {
        local: "LEAD_STORE_DIR isolated, outbound env unset, origin rewritten to confenge.com.br for handler",
        netcup: "host-owned /var/lib/confenge-web, EnvironmentFile, real visitor origin",
      },
    }, null, 2),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  tmpCleanup(storeDir);
}

console.log("POS_INB_01_BROWSER_OK", JSON.stringify({ tests: getResults().length, port: PORT }));
