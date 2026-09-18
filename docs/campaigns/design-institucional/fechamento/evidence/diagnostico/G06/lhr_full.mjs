import { writeFileSync } from "node:fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { resolveChromePath } from "/home/tjsasakifln/code/confenge/.worktrees/pos-redesign-20260918/scripts/site/resolve_chrome.mjs";
const OUTDIR = "/home/tjsasakifln/code/confenge/.worktrees/pos-redesign-20260918/docs/campaigns/design-institucional/fechamento/evidence/diagnostico/G06";
const BASE = "https://confenge.com.br";
const ROUTES = process.argv.slice(2).filter(a => a.startsWith("/"));
const slug = (r) => r === "/" ? "home" : r.replace(/^\/|\/$/g, "").replace(/\//g, "_");
const chrome = await chromeLauncher.launch({ chromePath: resolveChromePath(), chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
try {
  for (const method of ["devtools", "simulate"]) {
    for (const route of ROUTES) {
      const r = await lighthouse(BASE + route, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"], formFactor: "mobile", throttlingMethod: method, disableStorageReset: false });
      const suffix = method === "devtools" ? "" : "-simulate";
      const out = `${OUTDIR}/lhr-${slug(route)}${suffix}.json`;
      writeFileSync(out, r.report);
      const a = r.lhr.audits;
      console.log(method, route, "lcp", Math.round(a["largest-contentful-paint"].numericValue), "perf", Math.round(r.lhr.categories.performance.score*100), "->", out);
    }
  }
} finally { await chrome.kill(); }
