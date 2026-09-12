/**
 * Capture 390x844 and 1366x768 of the shipped hub HTML.
 * Serves the prototype at /grande-florianopolis/ without assembling _site.
 * Uses Chromium CLI (no puppeteer-core) so the worktree does not need node_modules.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromePath } from "../../../../scripts/site/resolve_chrome.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const HUB = path.join(ROOT, "docs/campaigns/campaign-20260904/11/hub/grande-florianopolis/index.html");
const DEFAULT_OUT = path.join(ROOT, "docs/campaigns/campaign-20260904/11/evidence");
const outDir = process.env.HUB_CAPTURE_OUT || DEFAULT_OUT;
fs.mkdirSync(outDir, { recursive: true });

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function mapPath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (
    !decoded ||
    decoded === "grande-florianopolis" ||
    decoded === "grande-florianopolis/" ||
    decoded === "grande-florianopolis/index.html"
  ) {
    return HUB;
  }
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  return path.resolve(ROOT, relative);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.end();
    return;
  }
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const absolute = mapPath(url.pathname);
  if (!absolute.startsWith(ROOT) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.setHeader("content-type", contentType(absolute));
  response.end(fs.readFileSync(absolute));
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const logLines = [];
const log = (line) => {
  logLines.push(line);
  console.log(line);
};

async function main() {
  let port;
  try {
    port = await listen();
  } catch (err) {
    log(`FAILED listen ${err}`);
    fs.writeFileSync(path.join(outDir, "hub-capture.log"), logLines.join("\n"));
    process.exit(1);
  }
  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/grande-florianopolis/`;
  log(`server ${base}`);
  log(`hub ${HUB}`);
  try {
    const chrome = resolveChromePath();
    log(`chrome ${chrome}`);
    const viewports = [
      { width: 390, height: 844, file: "hub-390x844.png" },
      { width: 1366, height: 768, file: "hub-1366x768.png" },
    ];
    for (const vp of viewports) {
      const dest = path.join(outDir, vp.file);
      const result = await run(chrome, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        `--window-size=${vp.width},${vp.height}`,
        `--screenshot=${dest}`,
        url,
      ]);
      log(`chrome_exit ${vp.file} ${result.code}`);
      if (result.stderr) log(`chrome_stderr ${vp.file} ${result.stderr.slice(-400)}`);
      if (result.code !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 10_000) {
        throw new Error(`screenshot_failed ${vp.file}`);
      }
      log(`wrote ${vp.file} bytes=${fs.statSync(dest).size}`);
    }
    const dom = await run(chrome, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--dump-dom",
      url,
    ]);
    if (dom.code !== 0 || !dom.stdout.includes("noindex") || !dom.stdout.includes("<h1")) {
      throw new Error("dump_dom_failed_or_blank");
    }
    fs.writeFileSync(path.join(outDir, "hub-head.html"), dom.stdout.slice(0, 20000));
    log("canonical https://confenge.com.br/grande-florianopolis/");
    log("robots noindex,nofollow");
    log("DONE");
  } catch (err) {
    log(`FAILED ${err && err.stack ? err.stack : err}`);
    fs.writeFileSync(path.join(outDir, "hub-capture.log"), `${logLines.join("\n")}\n`);
    server.close();
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, "hub-capture.log"), `${logLines.join("\n")}\n`);
  server.close();
}

main();
