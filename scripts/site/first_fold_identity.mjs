/** Bind rendered first-fold evidence to its HTML, local dependencies and measurer. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || "";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs"]);

export function firstFoldHash(bytes, filename) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!TEXT_EXTENSIONS.has(extname(filename).toLowerCase())) return hash(raw);
  const decoded = raw.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(raw)) throw new Error("first_fold_text_input_is_not_utf8");
  return hash(Buffer.from(decoded.replace(/\r\n/g, "\n"), "utf8"));
}

export function firstFoldFileHash(filename) {
  return firstFoldHash(readFileSync(filename), filename);
}

export function firstFoldInputHashes(siteRoot, routes, controlRoot = siteRoot) {
  const base = resolve(siteRoot);
  const files = new Map();
  function add(file) {
    const absolute = resolve(file);
    if (!absolute.startsWith(base + sep)) throw new Error("first_fold_dependency_outside_surface");
    const rel = relative(base, absolute).split(sep).join("/");
    if (files.has(rel)) return;
    const bytes = readFileSync(absolute);
    files.set(rel, firstFoldHash(bytes, rel));
    if (rel.endsWith(".css")) {
      for (const match of bytes.toString("utf8").matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi)) {
        const ref = match[1].split(/[?#]/)[0];
        if (!ref || /^(?:[a-z]+:|\/\/)/i.test(ref)) continue;
        add(ref.startsWith("/") ? resolve(base, "." + ref) : resolve(dirname(absolute), ref));
      }
    }
  }
  for (const route of routes) {
    const file = resolve(base, "." + route, "index.html");
    add(file);
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
      const tag = match[0];
      if (/^<link/i.test(tag) && !/\bstylesheet\b/i.test(attr(tag, "rel"))) continue;
      const ref = (attr(tag, "src") || attr(tag, "href")).split(/[?#]/)[0];
      if (!ref || /^(?:[a-z]+:|\/\/)/i.test(ref)) continue;
      add(ref.startsWith("/") ? resolve(base, "." + ref) : resolve(dirname(file), ref));
    }
  }
  for (const rel of ["scripts/site/first_fold_rules.mjs", "scripts/site/measure_first_fold.mjs", "scripts/site/first_fold_identity.mjs"]) {
    files.set("@control/" + rel, firstFoldFileHash(resolve(controlRoot, rel)));
  }
  return Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
}

export function firstFoldIdentityProblems(evidence, actualHashes) {
  const recorded = evidence.input_hashes || {};
  const problems = [];
  if (!Object.keys(recorded).length) problems.push("first_fold_input_hashes_missing");
  if (evidence.surface === "source" && evidence.tree_dirty !== false) problems.push("first_fold_dirty_source_evidence");
  for (const name of new Set([...Object.keys(recorded), ...Object.keys(actualHashes)])) {
    if (recorded[name] !== actualHashes[name]) problems.push(`first_fold_input_changed:${name}`);
  }
  return problems;
}
