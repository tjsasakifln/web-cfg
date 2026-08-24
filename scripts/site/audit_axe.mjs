/**
 * axe-core audit of every money and capture surface of the public artifact,
 * on mobile and desktop (#293).
 *
 * The route list is derived from data — a route is audited when it renders a
 * price or contains a capture form, plus the surfaces declared in
 * data/quality/interface-coverage-policy.json. Everything that is not audited
 * is written to the report with its reason; nothing is silently truncated.
 *
 * Usage: node scripts/site/audit_axe.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { createRequire } from "module";
import { resolveChromePath } from "./resolve_chrome.mjs";
import {
  ROOT,
  deriveCoverage,
  formatCoverageDeclaration,
  loadPolicy,
  resolveSiteRoot,
} from "./interface_coverage.mjs";

const require = createRequire(import.meta.url);
const PORT = Number(process.env.AXE_AUDIT_PORT || 8793);
const CHROME = resolveChromePath();

let axeSource;
try {
  const axePath = require.resolve("axe-core/axe.min.js");
  axeSource = readFileSync(axePath, "utf8");
} catch {
  console.error("axe-core not installed. Run: npm install --no-save axe-core");
  process.exit(2);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function startServer(siteRoot) {
  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = join(siteRoot, urlPath);
    if (!filePath.startsWith(siteRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

const policy = loadPolicy();
const siteRoot = resolveSiteRoot();
const coverage = deriveCoverage({ policy, siteRoot });
const VIEWPORTS = coverage.viewports;

console.log(formatCoverageDeclaration(coverage));
console.log("");

const exceptions = (coverage.known_exceptions || []).map((item) => ({ ...item, matched: 0 }));
function exceptionFor(route, viewportId, ruleId) {
  return exceptions.find(
    (item) =>
      item.route === route
      && item.rule === ruleId
      && (item.viewport === "all" || item.viewport === viewportId),
  );
}

const baseArg = process.argv[2];
const server = baseArg ? null : await startServer(siteRoot);
const BASE = (baseArg || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const startedAt = Date.now();
const report = {
  generated_at: new Date().toISOString(),
  issue: 293,
  base: BASE,
  site_root: coverage.site_root,
  policy_path: coverage.policy_path,
  coverage: {
    public_route_count: coverage.route_count,
    audited_route_count: coverage.axe.route_count,
    viewports: VIEWPORTS,
    page_loads: coverage.axe.page_loads,
    price_route_count: coverage.axe.price_route_count,
    capture_form_route_count: coverage.axe.capture_form_route_count,
    sampling: coverage.axe.sampling,
    audited_routes: coverage.axe.routes,
    not_audited_count: coverage.axe.not_sampled_count,
    not_audited: coverage.axe.not_sampled,
  },
  known_exceptions: coverage.known_exceptions,
  pages: [],
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  excused: 0,
};
let hardFail = 0;

const page = await browser.newPage();
for (const viewport of VIEWPORTS) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.device_scale_factor || 1,
    isMobile: Boolean(viewport.is_mobile),
    hasTouch: Boolean(viewport.has_touch),
  });
  for (const entry of coverage.axe.routes) {
    const path = entry.route;
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
        },
      });
    });
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    let blocking = 0;
    const violations = (results.violations || []).map((v) => {
      counts[v.impact] = (counts[v.impact] || 0) + 1;
      const excused = exceptionFor(path, viewport.id, v.id);
      if (excused) excused.matched += 1;
      else if (v.impact === "critical" || v.impact === "serious") blocking += 1;
      return {
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
        excused: excused ? excused.reason : null,
        targets: v.nodes.slice(0, 3).map((n) => n.target),
      };
    });
    report.pages.push({
      path,
      viewport: viewport.id,
      family: entry.family,
      selected_by: entry.reasons,
      counts,
      blocking,
      violations,
    });
    report.critical += counts.critical || 0;
    report.serious += counts.serious || 0;
    report.moderate += counts.moderate || 0;
    report.minor += counts.minor || 0;
    report.excused += violations.filter((v) => v.excused).length;
    if (blocking > 0) hardFail += 1;
    console.log(
      viewport.id,
      path,
      JSON.stringify(counts),
      violations.length ? violations.map((v) => (v.excused ? `${v.id}(excused)` : v.id)).join(",") : "clean",
    );
  }
}

await browser.close();
if (server) server.close();

report.duration_seconds = Math.round((Date.now() - startedAt) / 1000);
report.known_exceptions = exceptions.map(({ matched, ...rest }) => ({ ...rest, matched }));
const staleExceptions = report.known_exceptions.filter((item) => item.matched === 0);

const outDir = join(ROOT, "docs/uiux-evidence");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "axe-report.json");
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log("wrote", outFile);
console.log(
  `audited ${coverage.axe.route_count} routes x ${VIEWPORTS.length} viewports `
    + `= ${report.pages.length} page audits in ${report.duration_seconds}s`,
);
console.log(`not audited: ${coverage.axe.not_sampled_count} routes (reasons recorded in ${outFile})`);

if (staleExceptions.length) {
  console.error(
    "FAIL: registered axe exceptions no longer match any violation — delete them from "
      + `${coverage.policy_path}: ${staleExceptions.map((e) => `${e.route}@${e.viewport}:${e.rule}`).join(", ")}`,
  );
  process.exit(1);
}
if (hardFail) {
  console.error(`FAIL: ${hardFail} page audit(s) with unexcused critical/serious axe violations`);
  process.exit(1);
}
console.log("OK audit:axe — zero unexcused critical/serious across mobile and desktop");
process.exit(0);
