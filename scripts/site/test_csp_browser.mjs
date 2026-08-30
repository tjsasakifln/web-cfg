#!/usr/bin/env node

/** Browser canary for the enforced CSP on representative public surfaces. */
import fs from "fs";
import path from "path";
import { createServer } from "http";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "_site");
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
const requestedBase = String(process.argv[2] || "").trim();
const liveBase = requestedBase ? new URL(requestedBase).origin : "";
if (liveBase && liveBase !== "https://confenge.com.br") {
  console.error("CSP_BROWSER_INVALID_LIVE_ORIGIN", liveBase);
  process.exit(1);
}
const liveResponse = liveBase ? await fetch(`${liveBase}/`, { redirect: "error" }) : null;
const csp = liveResponse
  ? String(liveResponse.headers.get("content-security-policy") || "").trim()
  : headers.match(/^\s*Content-Security-Policy:\s*(.+)$/mi)?.[1]?.trim() || "";
// The canary server is loopback HTTP. Exercise every enforcement directive
// except the production-only HTTP→HTTPS upgrade, which would make local asset
// URLs unreachable before script-src itself can be tested.
const browserCsp = csp
  .split(";")
  .map((part) => part.trim())
  .filter((part) => part.toLowerCase() !== "upgrade-insecure-requests")
  .join("; ");
const directiveSources = (name) => {
  const directive = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find((tokens) => tokens[0]?.toLowerCase() === name);
  return new Set(directive?.slice(1) || []);
};
const required = process.env.CSP_BROWSER_REQUIRED === "1" || Boolean(process.env.CI);
const routes = [
  "/",
  "/entregas/",
  "/diagnostico-b2g-360/",
  "/ferramentas/",
  "/ferramentas/limite-acrescimos-supressoes/",
  "/ferramentas/matriz-atraso-obra/",
  "/ops/",
];

function publicBlockedUri(value) {
  const raw = String(value || "");
  try {
    return new URL(raw).origin;
  } catch {
    return raw.slice(0, 80);
  }
}

function startServer() {
  const mime = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      } catch {
        response.writeHead(400).end("bad request");
        return;
      }
      const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const target = path.resolve(site, `.${relative}`);
      const insideSite = target === site || target.startsWith(`${site}${path.sep}`);
      if (!insideSite || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404, { "Content-Security-Policy": browserCsp }).end("not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mime[path.extname(target)] || "application/octet-stream",
        "Content-Security-Policy": browserCsp,
        "Cache-Control": "no-store",
      });
      response.end(fs.readFileSync(target));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const scriptUnsafeInline = directiveSources("script-src").has("'unsafe-inline'");
const styleUnsafeInline = directiveSources("style-src").has("'unsafe-inline'");
if (!csp || scriptUnsafeInline || (!liveBase && styleUnsafeInline)) {
  console.error("CSP_BROWSER_INVALID_HEADER");
  process.exit(1);
}
if (!liveBase && !fs.existsSync(path.join(site, "index.html"))) {
  console.error("CSP_BROWSER_ARTIFACT_MISSING run npm run build:site first");
  process.exit(1);
}

const server = liveBase ? null : await startServer();
const address = server?.address();
const base = liveBase || `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-quic"],
  });
} catch (error) {
  server?.close();
  console.error("CSP_BROWSER_UNAVAILABLE", String(error?.message || error).slice(0, 200));
  process.exit(required ? 2 : 0);
}

const failures = [];
try {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__cspViolations.push({
          effectiveDirective: event.effectiveDirective,
          blockedURI: event.blockedURI,
        });
      });
      if (location.pathname === "/ops/") {
        sessionStorage.setItem("confenge_ops_token", "csp-browser-canary-token");
      }
    });
    const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
    if (response?.status() !== 200) failures.push(`${route} returned ${response?.status() || "no response"}`);

    if (route === "/") {
      await page.evaluate(() => {
        const turnstile = document.createElement("script");
        turnstile.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        turnstile.async = true;
        document.head.appendChild(turnstile);
        const video = document.createElement("iframe");
        video.src = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
        document.body.appendChild(video);
      });
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    if (route === "/ops/") {
      const token = await page.$eval("#token", (element) => element.value);
      if (token !== "csp-browser-canary-token") failures.push("/ops/ inline bootstrap did not execute");
    }
    if (route === "/ferramentas/matriz-atraso-obra/") {
      const fullWidthFields = await page.$$eval(".tool-field--full", (elements) => elements.map((element) => {
        const style = getComputedStyle(element);
        return { start: style.gridColumnStart, end: style.gridColumnEnd };
      }));
      if (fullWidthFields.length < 2 || fullWidthFields.some(({ start, end }) => start !== "1" || end !== "-1")) {
        failures.push(`/ferramentas/matriz-atraso-obra/ dynamic fields lost full grid span: ${JSON.stringify(fullWidthFields)}`);
      }
    }
    const violations = await page.evaluate(() => window.__cspViolations || []);
    for (const violation of violations) {
      failures.push(
        `${route} ${violation.effectiveDirective || "directive"} blocked ${publicBlockedUri(violation.blockedURI)}`
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
  server?.close();
}

if (failures.length) {
  failures.forEach((failure) => console.error("CSP_BROWSER_FAIL", failure));
  process.exit(1);
}
console.log(
  `CSP_BROWSER_OK mode=${liveBase ? "live" : "artifact"} routes=${routes.length} `
  + `violations=0 style_inline=${styleUnsafeInline ? "allowed" : "blocked"} `
  + "turnstile=allowed youtube_nocookie=allowed",
);
