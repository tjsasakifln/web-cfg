import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "./resolve_chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 8794;
const CLEARANCE_PX = 8;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
];
const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

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
await new Promise((resolveReady) => server.listen(PORT, "127.0.0.1", resolveReady));

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const failures = [];
const reports = [];

try {
  for (const viewport of VIEWPORTS) {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const report = await page.evaluate((clearance) => {
      const selectors = {
        category: ".hero-eyebrow",
        h1: "#hero-title",
        promise: ".hero-lead",
        proof: ".hero-proof",
        proofLink: ".hero-proof-line",
        primaryCta: ".hero .button-primary",
      };
      const boxes = Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => {
          const element = document.querySelector(selector);
          if (!element) return [name, null];
          const rect = element.getBoundingClientRect();
          return [name, {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }];
        }),
      );
      const required = Object.entries(boxes).filter(([name]) => name !== "proofLink");
      const fullyVisible = required.every(([, box]) =>
        box && box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight - clearance
      );
      const proofLinkVisible = boxes.proofLink
        && boxes.proofLink.width > 0
        && boxes.proofLink.bottom <= innerHeight - clearance;
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        clearance,
        boxes,
        fullyVisible: Boolean(fullyVisible && proofLinkVisible),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, CLEARANCE_PX);
    reports.push(report);
    if (!report.fullyVisible) failures.push(`${report.viewport}: first-fold elements are not fully visible`);
    if (report.horizontalOverflow) failures.push(`${report.viewport}: horizontal overflow`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify({ gate: "HOME_FIRST_FOLD", clearance_px: CLEARANCE_PX, reports }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("HOME_FIRST_FOLD_OK");
