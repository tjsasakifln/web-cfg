import { createServer } from "node:http";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".json", "application/json"],
  [".woff2", "font/woff2"],
]);

export function createWave1QaServer(directory) {
  const root = realpathSync(directory);
  const missing = (response) => response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  }).end("Not found");
  return createServer((request, response) => {
    try {
      const pathname = decodeURIComponent((request.url || "/").split("?", 1)[0]);
      if (!pathname.startsWith("/") || /[\\:\u0000]/.test(pathname) ||
          pathname.split("/").some((segment) => segment.startsWith("."))) {
        return missing(response);
      }
      const target = extname(pathname) ? pathname : pathname.replace(/\/?$/, "/index.html");
      const type = types.get(extname(target));
      if (!type) return missing(response);
      const file = realpathSync(resolve(root, "." + target));
      const contained = relative(root, file);
      if (!contained || isAbsolute(contained) || contained === ".." ||
          contained.startsWith(".." + sep) || !statSync(file).isFile()) {
        return missing(response);
      }
      const content = readFileSync(file);
      response.writeHead(200, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
      }).end(content);
    } catch {
      missing(response);
    }
  });
}
