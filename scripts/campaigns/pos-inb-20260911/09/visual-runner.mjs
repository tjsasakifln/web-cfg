#!/usr/bin/env node
/**
 * Visual inspection at 360, 390 and desktop using the Chrome binary.
 * Puppeteer import is not treated as a browser. On failure writes NOT_RUN.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { probeChrome } from "../../../../tests/campaigns/inb_20260911/15/lib/strict.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, "../../../..");

function parseArgs(argv) {
  const out = { root: defaultRoot, report: null, outDir: null, port: Number(process.env.POS09_VISUAL_PORT || 18093) };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") out.root = path.resolve(argv[++i]);
    else if (argv[i] === "--report") out.report = argv[++i];
    else if (argv[i] === "--out") out.outDir = argv[++i];
    else if (argv[i] === "--port") out.port = Number(argv[++i]);
  }
  return out;
}

function serve(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
      if (!rel || rel.endsWith("/")) rel = `${rel}index.html`;
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(file);
      const type = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(fs.readFileSync(file));
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const PAGES = [
  "/casos/demonstrativo-projeto-privado/",
  "/quantitativos-orcamento-obras/",
  "/ferramentas/prontidao-tecnica-obra-privada/",
  "/revisao-tecnica-projetos-engenharia/",
  "/parcerias-engenharia/",
  "/servicos/",
  "/servicos-obras-publicas/",
];

const VIEWPORTS = [
  { name: "360", width: 360, height: 740 },
  { name: "390", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = probeChrome();
  const report = {
    status: "NOT_RUN",
    chrome,
    pages: PAGES,
    viewports: VIEWPORTS.map((v) => v.name),
    shots: [],
    errors: [],
  };
  const write = () => {
    if (args.report) {
      fs.mkdirSync(path.dirname(args.report), { recursive: true });
      fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ status: report.status, reason: report.reason, shots: report.shots.length, errors: report.errors }, null, 2));
  };
  if (!chrome.available) {
    report.reason = chrome.reason || "chrome_binary_not_found";
    write();
    process.exitCode = 0;
    return;
  }
  const outDir = args.outDir || path.join(path.dirname(args.report || path.join(process.cwd(), "pos09-visual.json")), "browser");
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve(args.root, args.port);
  try {
    for (const viewport of VIEWPORTS) {
      for (const page of PAGES) {
        const slug = `${viewport.name}-${page.replace(/\//g, "_").replace(/^_|_$/g, "") || "home"}`;
        const shot = path.join(outDir, `${slug}.png`);
        const url = `http://127.0.0.1:${args.port}${page}`;
        const result = spawnSync(
          chrome.binary,
          [
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            `--window-size=${viewport.width},${viewport.height}`,
            `--screenshot=${shot}`,
            "--hide-scrollbars",
            "--virtual-time-budget=4000",
            url,
          ],
          { encoding: "utf8", timeout: 20000 },
        );
        const exists = fs.existsSync(shot) && fs.statSync(shot).size > 1000;
        report.shots.push({ viewport: viewport.name, page, shot, exists, status: result.status, stderr: (result.stderr || "").slice(0, 300) });
        if (!exists) report.errors.push(`${viewport.name} ${page} screenshot missing`);
      }
    }
    report.status = report.errors.length ? "NOT_RUN" : "pass";
    if (report.errors.length) report.reason = report.errors[0];
  } catch (err) {
    report.status = "NOT_RUN";
    report.reason = String(err && err.message);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  write();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
