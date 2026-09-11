import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

export function serveStatic(root, port) {
  const resolvedRoot = path.resolve(root);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let rel = urlPath.replace(/^\//, "");
    if (rel.endsWith("/") || rel === "") rel = `${rel}index.html`;
    const file = path.resolve(resolvedRoot, rel);
    if (!file.startsWith(resolvedRoot)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { "content-type": contentTypeFor(file), "content-length": body.length });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export async function fetchBuffer(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: buf, text: buf.toString("utf8") };
}

export function looksLikeHtml(text) {
  return /^\s*</.test(String(text || "")) && /<html|<!doctype html/i.test(String(text || ""));
}

export function looksLikeCsv(text) {
  const first = String(text || "")
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trim().startsWith("#"));
  if (!first) return false;
  return first.includes(";") || first.includes(",");
}
