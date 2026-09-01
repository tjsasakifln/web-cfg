#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const base = new URL(process.argv[2] || "https://confenge.com.br");
assert.equal(base.protocol, "https:", "production capture probe requires HTTPS");
assert.equal(base.hostname, "confenge.com.br", "canonical public host required");
const EXPECTED_ACTIVE_CAPTURE_ROUTES = 21;

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
const hasUsableSiteKey = (html) => {
  const value = html.match(/\bdata-turnstile-sitekey=["']([^"']+)["']/i)?.[1] || "";
  return value.length >= 16 && !/fixture|placeholder|replace|example/i.test(value);
};
const hasWidget = (html) => /\b(?:class=["'][^"']*cf-turnstile|id=["']cf-turnstile)[^>]*>/i.test(html);
const findings = [];

for (let offset = 0; offset < urls.length; offset += 8) {
  const batch = urls.slice(offset, offset + 8);
  const rows = await Promise.all(batch.map(async (url) => {
    const response = await fetch(url, { redirect: "error" });
    if (response.status !== 200 || !String(response.headers.get("content-type") || "").includes("text/html")) return null;
    const html = await response.text();
    if (!capture.test(html)) return null;
    const directTarget = html.match(/<form\b[^>]*\baction=["'](\/\.netlify\/functions\/lead|\/api\/web\/lead)["'][^>]*>/i)?.[1] || null;
    const ajaxTarget = /<form\b[^>]*\bid=["']formulario-contato["'][^>]*\bdata-ajax=["']true["'][^>]*>/i.test(html)
      || /<form\b[^>]*\bdata-ajax=["']true["'][^>]*\bid=["']formulario-contato["'][^>]*>/i.test(html);
    const scriptBound = /<script\b[^>]*\bsrc=["']\/script\.js(?:\?[^"']*)?["'][^>]*>/i.test(html);
    return {
      route: url.pathname,
      turnstile_sitekey: hasUsableSiteKey(html),
      turnstile_widget: hasWidget(html),
      submit_target: directTarget || (ajaxTarget && scriptBound ? "/.netlify/functions/lead (script.js)" : null),
      script_bound: scriptBound,
    };
  }));
  findings.push(...rows.filter(Boolean));
}

const missing = findings.filter((row) => !row.turnstile_sitekey || !row.turnstile_widget || !row.submit_target);
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
  lead_endpoint_bound: scriptText.includes("/api/web/lead")
    || scriptText.includes("/.netlify/functions/lead"),
};
const humanWidgetReady = Object.values(humanWidgetContract).every(Boolean);
const routes = findings
  .map((row) => ({
    ...row,
    ready: Boolean(row.turnstile_sitekey && row.turnstile_widget && row.submit_target),
  }))
  .sort((a, b) => a.route.localeCompare(b.route));
const report = {
  ok: findings.length === EXPECTED_ACTIVE_CAPTURE_ROUTES && missing.length === 0 && humanWidgetReady,
  canonical_host: base.hostname,
  expected_active_capture_routes: EXPECTED_ACTIVE_CAPTURE_ROUTES,
  sitemap_routes_scanned: urls.length,
  opportunity_capture_routes: findings.length,
  turnstile_ready_routes: findings.length - missing.length,
  human_widget_contract: humanWidgetContract,
  route_blockers: missing.map((row) => ({
    route: row.route,
    turnstile_sitekey: row.turnstile_sitekey,
    turnstile_widget: row.turnstile_widget,
    submit_target: row.submit_target,
  })),
  routes,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!report.ok) process.exitCode = 2;
