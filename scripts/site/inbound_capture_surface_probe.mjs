#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const base = new URL(process.argv[2] || "https://confenge.com.br");
assert.equal(base.protocol, "https:", "production capture probe requires HTTPS");
assert.equal(base.hostname, "confenge.com.br", "canonical public host required");

const sitemapResponse = await fetch(new URL("/sitemap.xml", base), { redirect: "error" });
assert.equal(sitemapResponse.status, 200, "sitemap unavailable");
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(match[1]))
  .filter((url) => url.hostname === base.hostname);

// The sitemap intentionally omits some commercial routes. Derive additional
// candidates from versioned public HTML, then verify each candidate against the
// live canonical host rather than treating repository presence as deployment.
const trackedHtml = execFileSync("git", ["ls-files", "*.html"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
for (const file of trackedHtml) {
  const html = fs.readFileSync(file, "utf8");
  if (!/(?:action=["'](?:\/\.netlify\/functions\/lead|\/api\/web\/lead)["']|id=["']formulario-contato["'])/i.test(html)) continue;
  const route = file === "index.html"
    ? "/"
    : file.endsWith("/index.html")
      ? `/${file.slice(0, -"index.html".length)}`
      : `/${file}`;
  if (!urls.some((url) => url.pathname === route)) urls.push(new URL(route, base));
}

const capture = /(?:<form\b[^>]*\baction=["'](?:\/\.netlify\/functions\/lead|\/api\/web\/lead)["'][^>]*>|<form\b[^>]*\bid=["']formulario-contato["'][^>]*>)/i;
const hasSlot = (html) => /\bdata-turnstile-sitekey\b/i.test(html);
const hasWidget = (html) => /\b(?:class=["'][^"']*cf-turnstile|id=["']cf-turnstile)[^>]*>/i.test(html);
const findings = [];

for (let offset = 0; offset < urls.length; offset += 8) {
  const batch = urls.slice(offset, offset + 8);
  const rows = await Promise.all(batch.map(async (url) => {
    const response = await fetch(url, { redirect: "error" });
    if (response.status !== 200 || !String(response.headers.get("content-type") || "").includes("text/html")) return null;
    const html = await response.text();
    if (!capture.test(html)) return null;
    return {
      route: url.pathname,
      turnstile_sitekey: hasSlot(html),
      turnstile_widget: hasWidget(html),
    };
  }));
  findings.push(...rows.filter(Boolean));
}

const missing = findings.filter((row) => !row.turnstile_sitekey || !row.turnstile_widget);
const homeResponse = await fetch(base, { redirect: "error" });
const homeHtml = await homeResponse.text();
const scriptPath = homeHtml.match(/<script\b[^>]*\bsrc=["']([^"']*script\.js[^"']*)["']/i)?.[1] || "";
const scriptUrl = scriptPath ? new URL(scriptPath, base) : null;
const scriptText = scriptUrl && scriptUrl.hostname === base.hostname
  ? await (await fetch(scriptUrl, { redirect: "error" })).text()
  : "";
const humanWidgetContract = {
  sitekey_present: findings.some((row) => row.route === "/" && row.turnstile_sitekey),
  widget_present: findings.some((row) => row.route === "/" && row.turnstile_widget),
  cloudflare_loader_present: scriptText.includes("https://challenges.cloudflare.com/turnstile/v0/api.js"),
  token_forwarded: scriptText.includes("cf-turnstile-response") && scriptText.includes("turnstile_token"),
  lead_endpoint_bound: scriptText.includes("/.netlify/functions/lead"),
};
const humanWidgetReady = Object.values(humanWidgetContract).every(Boolean);
const report = {
  ok: missing.length === 0 && humanWidgetReady,
  canonical_host: base.hostname,
  sitemap_routes_scanned: urls.length,
  opportunity_capture_routes: findings.length,
  turnstile_ready_routes: findings.length - missing.length,
  human_widget_contract: humanWidgetContract,
  missing_turnstile_routes: missing.map((row) => row.route).sort(),
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!report.ok) process.exitCode = 2;
