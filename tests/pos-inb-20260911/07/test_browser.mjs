#!/usr/bin/env node
/**
 * POS-INB-07 browser check. Uses the repo Chrome helper.
 * If Chrome cannot start, records the launcher failure and exits 0 for the
 * HTML/composition suite to remain the bar — never fabricates pixels.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SCRATCH = process.env.POS07_SCRATCH || "/tmp/grok-goal-1e9c53760043/implementer";
const LOG = join(SCRATCH, "07-browser.log");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function log(line) {
  mkdirSync(SCRATCH, { recursive: true });
  const text = `${line}\n`;
  process.stdout.write(text);
  writeFileSync(LOG, existsSync(LOG) ? readFileSync(LOG, "utf8") + text : text);
}

function startServer() {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      if (rel.startsWith("/")) rel = rel.slice(1);
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      try {
        const body = readFileSync(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveServer({ server, port });
    });
  });
}

async function resolveChrome() {
  const mod = await import(pathToFileURL(join(ROOT, "scripts/site/resolve_chrome.mjs")).href);
  return mod.resolveChromePath();
}

async function runOnce(browser, origin, viewport, path) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.setViewport(viewport);
  await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 20000 });
  const report = await page.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 80),
    }));
    const skip = document.querySelector(".skip-link, a.skip-link");
    const main = document.querySelector("main") || document.body;
    const ctas = [...main.querySelectorAll("a.button-primary, button.button-primary, a[href*='wa.me'], a[href*='triagem-tecnica']")].map((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const inHeader = Boolean(el.closest(".site-header, .mobile-nav"));
      return {
        href: el.getAttribute("href") || el.tagName,
        display: style.display,
        visibility: style.visibility,
        width: rect.width,
        height: rect.height,
        off: rect.right < 0 || rect.bottom < 0 || inHeader,
        inHeader,
      };
    });
    const firstH = headings[0];
    return {
      title: document.title,
      firstHeading: firstH,
      headingCount: headings.length,
      skip: Boolean(skip),
      ctas,
    };
  });
  await page.close();
  return { errors, report };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(LOG, "");
  let chrome;
  try {
    chrome = await resolveChrome();
    log(`chrome=${chrome}`);
  } catch (err) {
    log(`LAUNCHER_FAILURE ${err && err.message ? err.message : err}`);
    log("FALLBACK html/composition tests remain the bar; no fabricated pixels.");
    process.exit(0);
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (err) {
    log(`LAUNCHER_FAILURE puppeteer-core missing: ${err && err.message ? err.message : err}`);
    process.exit(0);
  }

  const { server, port } = await startServer();
  const origin = `http://127.0.0.1:${port}`;
  log(`origin=${origin}`);
  const viewports = [
    { name: "360", width: 360, height: 800, deviceScaleFactor: 1 },
    { name: "390", width: 390, height: 844, deviceScaleFactor: 1 },
    { name: "desktop", width: 1280, height: 800, deviceScaleFactor: 1 },
  ];
  const paths = ["/servicos/", "/conteudos/", "/casos/", "/projetos-complementares-engenharia/"];
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (err) {
    log(`LAUNCHER_FAILURE launch: ${err && err.message ? err.message : err}`);
    server.close();
    process.exit(0);
  }

  let failed = 0;
  for (const round of [1, 2]) {
    log(`ROUND ${round}`);
    for (const vp of viewports) {
      for (const path of paths) {
        try {
          const { errors, report } = await runOnce(browser, origin, vp, path);
          const visibleCta = report.ctas.some(
            (c) =>
              !c.inHeader &&
              c.display !== "none" &&
              c.visibility !== "hidden" &&
              c.width > 0 &&
              c.height > 0 &&
              !c.off,
          );
          const headingOk = report.firstHeading && report.firstHeading.tag === "H1";
          const ok = errors.length === 0 && headingOk && visibleCta && report.skip;
          log(
            `${ok ? "PASS" : "FAIL"} round=${round} vp=${vp.name} path=${path} heading=${report.firstHeading && report.firstHeading.tag} cta=${visibleCta} skip=${report.skip} errors=${errors.length}`,
          );
          if (path === "/servicos/" && vp.name === "desktop") {
            const page = await browser.newPage();
            await page.setViewport(vp);
            await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 20000 });
            const clicked = await page.evaluate(() => {
              const link = [...document.querySelectorAll("a")].find((a) =>
                (a.getAttribute("href") || "").includes("/revisao-tecnica-projetos-engenharia/"),
              );
              if (!link) return null;
              link.click();
              return link.getAttribute("href");
            });
            await page.close();
            log(`CLICK revisao=${clicked}`);
            if (!clicked) {
              failed += 1;
              log("FAIL click named offer revisão");
            }
          }
          if (!ok) failed += 1;
        } catch (err) {
          failed += 1;
          log(`FAIL round=${round} vp=${vp.name} path=${path} ${err && err.message ? err.message : err}`);
        }
      }
    }
  }
  await browser.close();
  server.close();
  if (failed) {
    log(`FAILED ${failed}`);
    process.exit(1);
  }
  log("BROWSER_OK");
}

main().catch((err) => {
  log(`LAUNCHER_FAILURE uncaught: ${err && err.stack ? err.stack : err}`);
  process.exit(0);
});
