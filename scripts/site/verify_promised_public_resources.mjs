#!/usr/bin/env node
/**
 * Completeness gate for promised public downloads.
 *
 * Derives the expected set from (1) hardcoded sentinels, (2) demonstrative
 * descriptors, (3) real hrefs on pages present in the artifact. Integrity of
 * files that happened to enter the package is not enough: a missing promised
 * download fails. Campaign-08 geometric expansion is required only when its
 * page is in the composition.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "confenge.promised-public-resources/1.0.0";

export const SENTINEL_PATHS = Object.freeze([
  "/casos/demonstrativo-projeto-privado/data/quantitativos.csv",
  "/casos/demonstrativo-projeto-privado/data/orcamento.csv",
  "/casos/demonstrativo-projeto-privado/data/coordenacao.csv",
  "/casos/demonstrativo-projeto-privado/data/revisao.csv",
]);

const AUTHORIZED_RESOURCE = /^\/casos\/[a-z0-9][a-z0-9-]{0,80}\/(?:data\/[a-z0-9][a-z0-9._-]{0,80}\.csv|assets\/[a-z0-9][a-z0-9._-]{0,80}\.svg)$/;
const AUTHORIZED_CSV = /^\/casos\/[a-z0-9][a-z0-9-]{0,80}\/data\/[a-z0-9][a-z0-9._-]{0,80}\.csv$/;
const SAFE_PAGE = /^\/casos\/[a-z0-9][a-z0-9-]{0,80}\/$/;
const DESCRIPTOR_SCHEMA = "confenge.demonstrative-sample-descriptor/1.0";
const ALLOWED_CSV_MIME = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
]);
const ALLOWED_SVG_MIME = new Set([
  "image/svg+xml",
  "text/xml",
  "application/xml",
]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_MAX_REQUESTS = 32;
const DEFAULT_HOSTS = Object.freeze(["confenge.com.br", "127.0.0.1", "localhost"]);
const ALLOWED_UNITS = new Set(["m", "m2", "m3", "un", "BRL"]);

export const SENTINEL_SCHEMAS = Object.freeze({
  "/casos/demonstrativo-projeto-privado/data/quantitativos.csv": {
    columns: [
      "id",
      "descricao",
      "unidade",
      "quantidade",
      "elementos",
      "prancha",
      "formula",
      "desconto",
      "revisao",
    ],
    numeric: ["quantidade"],
    unitColumn: "unidade",
    minRows: 1,
    descriptorRows: "quantity_rows",
    idKey: "id",
    quantityKey: "quantity",
    unitKey: "unit",
  },
  "/casos/demonstrativo-projeto-privado/data/orcamento.csv": {
    columns: [
      "id",
      "quantidade_id",
      "servico",
      "unidade",
      "quantidade",
      "preco_unitario",
      "valor",
      "classe_preco",
      "elementos",
      "revisao",
    ],
    numeric: ["quantidade", "preco_unitario", "valor"],
    numericEmptyOk: true,
    unitColumn: "unidade",
    minRows: 1,
    descriptorRows: "budget_rows",
    idKey: "id",
    quantityKey: "quantity",
    unitKey: "unit",
    amountKey: "amount",
    skipIdPrefixes: ["ORC-SUBTOTAL"],
  },
  "/casos/demonstrativo-projeto-privado/data/coordenacao.csv": {
    columns: [
      "id",
      "tipo",
      "estado",
      "local",
      "evidencia",
      "encaminhamento",
      "elementos",
      "falha_comprovada",
      "revisao",
    ],
    minRows: 1,
    descriptorRows: "coordination_findings",
    idKey: "id",
    kindKey: "kind",
    stateKey: "state",
  },
  "/casos/demonstrativo-projeto-privado/data/revisao.csv": {
    columns: [
      "id",
      "documento",
      "constatacao",
      "base",
      "acao",
      "tipo_conferencia",
      "achado_relacionado",
      "elementos",
      "revisao",
    ],
    minRows: 1,
    descriptorRows: "review_findings",
    idKey: "id",
    documentKey: "document_ref",
    checkKindKey: "check_kind",
  },
});

function fail(code, detail, extra = {}) {
  return { ok: false, code, detail, ...extra };
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function looksLikeHtmlError(buf) {
  const head = Buffer.from(buf).subarray(0, 1024).toString("utf8").trim().toLowerCase();
  if (!head) return false;
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("<html")) {
    return true;
  }
  if (/<title>[^<]*404/.test(head)) return true;
  if (head.includes("página não encontrada") && head.includes("<")) return true;
  return false;
}

export function normalizePublicUri(raw, pagePath = "/") {
  if (raw == null) {
    throw Object.assign(new Error("empty uri"), { code: "empty_uri" });
  }
  const original = String(raw).trim();
  if (!original) {
    throw Object.assign(new Error("empty uri"), { code: "empty_uri" });
  }
  if (original.includes("\\") || original.includes("\0")) {
    throw Object.assign(new Error("unsafe character"), { code: "unsafe_character" });
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(original) && !original.startsWith("/")) {
    let parsed;
    try {
      parsed = new URL(original);
    } catch {
      throw Object.assign(new Error("invalid uri"), { code: "invalid_uri" });
    }
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      throw Object.assign(new Error("external uri"), { code: "external_uri", host: parsed.hostname });
    }
    throw Object.assign(new Error("scheme refused"), { code: "refused_scheme" });
  }
  if (/%(?:2e|2f|5c|00|5c)/i.test(original) || /%(?:25)*(?:2e|2f|5c)/i.test(original)) {
    throw Object.assign(new Error("unsafe percent-escape"), { code: "unsafe_percent_escape" });
  }
  let decoded = original;
  try {
    decoded = decodeURIComponent(original);
  } catch {
    throw Object.assign(new Error("invalid percent-encoding"), { code: "invalid_percent_encoding" });
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    throw Object.assign(new Error("unsafe character after decode"), { code: "unsafe_character" });
  }
  if (decoded.split("/").includes("..") || decoded.includes("/../") || decoded.startsWith("../")) {
    throw Object.assign(new Error("traversal"), { code: "traversal" });
  }
  const base = pagePath.endsWith("/") ? pagePath : `${pagePath.replace(/[^/]+$/, "")}`;
  const joined = decoded.startsWith("/") ? decoded : path.posix.normalize(path.posix.join(base, decoded));
  const normalized = path.posix.normalize(joined);
  if (normalized !== joined && joined.includes("..")) {
    throw Object.assign(new Error("traversal"), { code: "traversal" });
  }
  if (!normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw Object.assign(new Error("traversal"), { code: "traversal" });
  }
  if (normalized.includes("//")) {
    throw Object.assign(new Error("empty path segment"), { code: "empty_path_segment" });
  }
  return normalized;
}

export function parseDelimitedCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (inQuotes) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  if (inQuotes) {
    throw Object.assign(new Error("unterminated quoted field"), { code: "unterminated_quote" });
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parsePublicCsv(buf) {
  if (looksLikeHtmlError(buf)) {
    throw Object.assign(new Error("html error body under csv name"), { code: "html_error_body" });
  }
  const text = Buffer.from(buf).toString("utf8");
  if (!text.trim()) {
    throw Object.assign(new Error("empty csv"), { code: "empty_csv" });
  }
  const records = parseDelimitedCsv(text, ";");
  const comments = [];
  const body = [];
  for (const record of records) {
    const first = (record[0] || "").trim();
    if (first.startsWith("#")) {
      comments.push(record.join(";"));
      continue;
    }
    if (record.every((cell) => !String(cell).trim())) continue;
    body.push(record);
  }
  if (!body.length) {
    throw Object.assign(new Error("csv has no header"), { code: "missing_header" });
  }
  const columns = body[0].map((cell) => String(cell).trim());
  const rows = body.slice(1).map((record) => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = record[idx] == null ? "" : String(record[idx]);
    });
    return obj;
  });
  const revisionComment = comments.join("\n").match(/revisao\s*=\s*([A-Za-z0-9._-]+)/i);
  return {
    comments,
    columns,
    rows,
    revisionFromComment: revisionComment ? revisionComment[1] : null,
  };
}

function parseNumber(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw Object.assign(new Error(`empty number ${label}`), { code: "empty_number", field: label });
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw Object.assign(new Error(`non-numeric ${label}`), { code: "non_numeric", field: label, value: text });
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error(`non-finite ${label}`), { code: "non_finite", field: label });
  }
  return n;
}

function numbersEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function pageUrlFromHtmlPath(relPosix) {
  if (relPosix.endsWith("/index.html")) {
    return `/${relPosix.slice(0, -"index.html".length)}`;
  }
  if (relPosix === "index.html") return "/";
  return `/${relPosix}`;
}

function extractHrefValues(html) {
  const values = [];
  const re = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
  let match;
  while ((match = re.exec(html))) {
    values.push(match[2]);
  }
  return values;
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) {
      acc.push({ full, rel: null, symlink: true, dir: st.isDirectory() });
      continue;
    }
    if (st.isDirectory()) walkFiles(full, acc);
    else if (st.isFile()) acc.push({ full, symlink: false });
  }
  return acc;
}

function relPosix(root, full) {
  return path.relative(root, full).split(path.sep).join("/");
}

function realPathInside(root, full) {
  const resolvedRoot = fs.realpathSync(root);
  let resolved;
  try {
    resolved = fs.realpathSync(full);
  } catch {
    return { ok: false, code: "dangling_or_unreadable" };
  }
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, code: "symlink_escape" };
  }
  return { ok: true, resolved };
}

export function loadDescriptors(sourceRoot) {
  const descriptors = [];
  const base = path.join(sourceRoot, "data", "demonstrative");
  if (!fs.existsSync(base)) return descriptors;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!name.endsWith(".json")) continue;
      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(full, "utf8"));
      } catch {
        continue;
      }
      if (payload && payload.schema === DESCRIPTOR_SCHEMA) {
        descriptors.push({ path: relPosix(sourceRoot, full), payload });
      }
    }
  }
  return descriptors;
}

export function deriveExpectedResources({ artifactDir, sourceRoot, htmlByRel = null }) {
  const findings = [];
  const expected = new Map();
  const add = (urlPath, origin) => {
    if (!expected.has(urlPath)) {
      expected.set(urlPath, { path: urlPath, origins: new Set() });
    }
    expected.get(urlPath).origins.add(origin);
  };

  for (const sentinel of SENTINEL_PATHS) add(sentinel, "sentinel");

  const pagesPresent = new Set();
  const htmlFiles = [];
  if (htmlByRel) {
    for (const [rel, html] of Object.entries(htmlByRel)) {
      htmlFiles.push({ rel, html });
      if (rel.endsWith("/index.html") || rel === "index.html") {
        pagesPresent.add(pageUrlFromHtmlPath(rel));
      }
    }
  } else if (artifactDir && fs.existsSync(artifactDir)) {
    for (const entry of walkFiles(artifactDir)) {
      if (entry.symlink || !entry.full.endsWith(".html")) continue;
      const rel = relPosix(artifactDir, entry.full);
      htmlFiles.push({ rel, html: fs.readFileSync(entry.full, "utf8") });
      if (rel.endsWith("/index.html") || rel === "index.html") {
        pagesPresent.add(pageUrlFromHtmlPath(rel));
      }
    }
  }

  for (const { rel, html } of htmlFiles) {
    const pagePath = pageUrlFromHtmlPath(rel);
    for (const raw of extractHrefValues(html)) {
      let normalized;
      try {
        normalized = normalizePublicUri(raw, pagePath);
      } catch (err) {
        if (err.code === "external_uri") continue;
        if (err.code === "empty_uri") continue;
        findings.push(
          fail("unsafe_page_href", `${rel}: ${err.code}`, { href: raw, page: pagePath }),
        );
        continue;
      }
      if (!/\.(csv|svg)$/i.test(normalized)) continue;
      if (!AUTHORIZED_RESOURCE.test(normalized)) {
        findings.push(
          fail("unauthorized_promised_path", `${rel} links ${normalized}`, {
            href: raw,
            page: pagePath,
            path: normalized,
          }),
        );
        continue;
      }
      add(normalized, `page:${pagePath}`);
    }
  }

  const descriptors = sourceRoot ? loadDescriptors(sourceRoot) : [];
  for (const { path: descPath, payload } of descriptors) {
    const pageUrl = payload.url || payload.canonical;
    let pageLocal = pageUrl;
    if (typeof pageLocal === "string" && pageLocal.startsWith("https://confenge.com.br")) {
      pageLocal = pageLocal.slice("https://confenge.com.br".length);
    }
    const pageInComposition =
      typeof pageLocal === "string" && pagesPresent.has(pageLocal.endsWith("/") ? pageLocal : `${pageLocal}/`);
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    for (const asset of assets) {
      if (!asset || (asset.type !== "csv" && asset.type !== "svg")) continue;
      const url = asset.url;
      if (typeof url !== "string") continue;
      let normalized;
      try {
        normalized = normalizePublicUri(url, pageLocal || "/");
      } catch (err) {
        findings.push(fail("unsafe_descriptor_asset", `${descPath}: ${err.code}`, { url }));
        continue;
      }
      if (!AUTHORIZED_RESOURCE.test(normalized)) {
        findings.push(
          fail("unauthorized_descriptor_asset", `${descPath} lists ${normalized}`, { path: normalized }),
        );
        continue;
      }
      if (asset.type === "csv" && !AUTHORIZED_CSV.test(normalized)) {
        findings.push(fail("descriptor_csv_path_mismatch", `${descPath} ${normalized}`));
        continue;
      }
      if (!pageInComposition && asset.type === "csv" && !SENTINEL_PATHS.includes(normalized)) {
        continue;
      }
      if (!pageInComposition && asset.type === "svg") continue;
      add(normalized, `descriptor:${descPath}`);
    }
  }

  return {
    expected: [...expected.values()].map((item) => ({
      path: item.path,
      origins: [...item.origins].sort(),
    })),
    pagesPresent: [...pagesPresent].sort(),
    descriptors: descriptors.map((d) => d.path),
    findings,
  };
}

function artifactFile(artifactDir, urlPath) {
  const rel = urlPath.replace(/^\//, "");
  return path.join(artifactDir, ...rel.split("/"));
}

const PRIVATE_CSV_BASENAME = /(?:^|[._-])(?:leads?|secret|gsc|handoff|fixture)(?:[._-]|$)/i;

function isPrivateCsvPath(urlPath) {
  const normalized = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  if (
    normalized.startsWith("/data/") ||
    normalized.startsWith("/tests/") ||
    normalized.startsWith("/docs/") ||
    normalized.startsWith("/ops/") ||
    normalized.startsWith("/seo/")
  ) {
    return true;
  }
  const base = path.posix.basename(normalized);
  return PRIVATE_CSV_BASENAME.test(base.replace(/\.csv$/i, ""));
}

function readExactFile(artifactDir, urlPath) {
  const full = artifactFile(artifactDir, urlPath);
  if (!fs.existsSync(full)) {
    return { error: fail("missing_promised_resource", urlPath) };
  }
  if (fs.lstatSync(full).isSymbolicLink()) {
    return { error: fail("symlink", urlPath) };
  }
  if (!fs.statSync(full).isFile()) {
    return { error: fail("missing_promised_resource", urlPath) };
  }
  const inside = realPathInside(artifactDir, full);
  if (!inside.ok) {
    return { error: fail(inside.code, urlPath) };
  }
  const buf = fs.readFileSync(full);
  return { buf, sha256: sha256Bytes(buf), bytes: buf.length, full };
}

function descriptorForPath(sourceRoot, urlPath) {
  if (!sourceRoot) return null;
  for (const { payload } of loadDescriptors(sourceRoot)) {
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    if (assets.some((asset) => asset && asset.url === urlPath)) return payload;
  }
  return null;
}

export function validateCsvAgainstContract(urlPath, buf, descriptor) {
  const parsed = parsePublicCsv(buf);
  const schema = SENTINEL_SCHEMAS[urlPath];
  if (schema) {
    for (const col of schema.columns) {
      if (!parsed.columns.includes(col)) {
        throw Object.assign(new Error(`missing column ${col}`), {
          code: "missing_column",
          column: col,
        });
      }
    }
    if (parsed.rows.length < schema.minRows) {
      throw Object.assign(new Error("csv has no data rows"), { code: "empty_csv" });
    }
    const expectedRevision = descriptor?.revision || parsed.revisionFromComment;
    for (const row of parsed.rows) {
      if (expectedRevision && row.revisao && row.revisao !== expectedRevision) {
        throw Object.assign(new Error("revision diverges from source"), {
          code: "revision_mismatch",
          row: row.id,
          got: row.revisao,
          expected: expectedRevision,
        });
      }
      if (schema.unitColumn && row[schema.unitColumn]) {
        const unit = row[schema.unitColumn];
        if (unit && !ALLOWED_UNITS.has(unit) && unit !== "BRL") {
          throw Object.assign(new Error(`unexpected unit ${unit}`), {
            code: "unexpected_unit",
            unit,
          });
        }
      }
      for (const field of schema.numeric || []) {
        const raw = row[field];
        if (!String(raw || "").trim()) {
          if (schema.numericEmptyOk) continue;
          throw Object.assign(new Error(`empty number ${field}`), { code: "empty_number", field });
        }
        parseNumber(raw, `${row.id}.${field}`);
      }
    }
    if (parsed.revisionFromComment && expectedRevision && parsed.revisionFromComment !== expectedRevision) {
      throw Object.assign(new Error("comment revision diverges"), {
        code: "revision_mismatch",
        got: parsed.revisionFromComment,
        expected: expectedRevision,
      });
    }
    if (descriptor && schema.descriptorRows && Array.isArray(descriptor[schema.descriptorRows])) {
      const byId = new Map(parsed.rows.map((row) => [row.id, row]));
      for (const expected of descriptor[schema.descriptorRows]) {
        const row = byId.get(expected[schema.idKey]);
        if (!row) {
          throw Object.assign(new Error(`missing row ${expected[schema.idKey]}`), {
            code: "missing_row",
            id: expected[schema.idKey],
          });
        }
        if (schema.quantityKey && expected[schema.quantityKey] != null && String(row.quantidade || "").trim()) {
          const got = parseNumber(row.quantidade, `${row.id}.quantidade`);
          const want = parseNumber(expected[schema.quantityKey], `${expected.id}.quantity`);
          if (!numbersEqual(got, want)) {
            throw Object.assign(new Error("quantity diverges from descriptor"), {
              code: "quantity_mismatch",
              id: row.id,
              got,
              expected: want,
            });
          }
        }
        if (schema.unitKey && expected[schema.unitKey] && row.unidade && row.unidade !== expected[schema.unitKey]) {
          throw Object.assign(new Error("unit diverges from descriptor"), {
            code: "unit_mismatch",
            id: row.id,
            got: row.unidade,
            expected: expected[schema.unitKey],
          });
        }
        if (schema.amountKey && expected[schema.amountKey] && String(row.valor || "").trim()) {
          const got = parseNumber(row.valor, `${row.id}.valor`);
          const want = parseNumber(expected[schema.amountKey], `${expected.id}.amount`);
          if (!numbersEqual(got, want)) {
            throw Object.assign(new Error("amount diverges from descriptor"), {
              code: "amount_mismatch",
              id: row.id,
              got,
              expected: want,
            });
          }
        }
        if (schema.kindKey && expected[schema.kindKey] && row.tipo && row.tipo !== expected[schema.kindKey]) {
          throw Object.assign(new Error("coordination kind diverges"), {
            code: "kind_mismatch",
            id: row.id,
          });
        }
        if (schema.stateKey && expected[schema.stateKey] && row.estado && row.estado !== expected[schema.stateKey]) {
          throw Object.assign(new Error("coordination state diverges"), {
            code: "state_mismatch",
            id: row.id,
          });
        }
        if (
          schema.documentKey &&
          expected[schema.documentKey] &&
          row.documento &&
          row.documento !== expected[schema.documentKey]
        ) {
          throw Object.assign(new Error("review document diverges"), {
            code: "document_mismatch",
            id: row.id,
          });
        }
        if (
          schema.checkKindKey &&
          expected[schema.checkKindKey] &&
          row.tipo_conferencia &&
          row.tipo_conferencia !== expected[schema.checkKindKey]
        ) {
          throw Object.assign(new Error("review check kind diverges"), {
            code: "check_kind_mismatch",
            id: row.id,
          });
        }
      }
      if (urlPath.endsWith("orcamento.csv") && descriptor.budget_subtotal) {
        const subtotal = parsed.rows.find((row) => row.id === "ORC-SUBTOTAL");
        if (subtotal && String(subtotal.valor || "").trim()) {
          const got = parseNumber(subtotal.valor, "ORC-SUBTOTAL.valor");
          const want = parseNumber(descriptor.budget_subtotal, "budget_subtotal");
          if (!numbersEqual(got, want)) {
            throw Object.assign(new Error("budget subtotal diverges"), {
              code: "subtotal_mismatch",
              got,
              expected: want,
            });
          }
        }
      }
    }
    if (urlPath.endsWith("orcamento.csv")) {
      for (const row of parsed.rows) {
        if ((schema.skipIdPrefixes || []).some((prefix) => String(row.id || "").startsWith(prefix))) {
          continue;
        }
        const qty = String(row.quantidade || "").trim();
        const price = String(row.preco_unitario || "").trim();
        const amount = String(row.valor || "").trim();
        if (qty && price && amount) {
          const product = parseNumber(qty, "quantidade") * parseNumber(price, "preco_unitario");
          const valor = parseNumber(amount, "valor");
          if (Math.abs(product - valor) > 0.015) {
            throw Object.assign(new Error("quantidade * preco_unitario != valor"), {
              code: "arithmetic_mismatch",
              id: row.id,
              product,
              valor,
            });
          }
        }
      }
    }
  } else {
    if (!parsed.columns.length || !parsed.rows.length) {
      throw Object.assign(new Error("csv has no data rows"), { code: "empty_csv" });
    }
  }
  return parsed;
}

export function validateArtifact({ artifactDir, sourceRoot }) {
  const derived = deriveExpectedResources({ artifactDir, sourceRoot });
  const findings = [...derived.findings];
  const resources = [];
  for (const item of derived.expected) {
    if (item.path.endsWith(".csv") || SENTINEL_PATHS.includes(item.path)) {
      const read = readExactFile(artifactDir, item.path);
      if (read.error) {
        findings.push(read.error);
        continue;
      }
      if (!read.bytes) {
        findings.push(fail("empty_bytes", item.path));
        continue;
      }
      if (!AUTHORIZED_CSV.test(item.path) && item.path.endsWith(".csv")) {
        findings.push(fail("unauthorized_promised_path", item.path));
        continue;
      }
      try {
        const descriptor = descriptorForPath(sourceRoot, item.path);
        const parsed = item.path.endsWith(".csv")
          ? validateCsvAgainstContract(item.path, read.buf, descriptor)
          : null;
        resources.push({
          path: item.path,
          origins: item.origins,
          sha256: read.sha256,
          bytes: read.bytes,
          columns: parsed ? parsed.columns : undefined,
          rows: parsed ? parsed.rows.length : undefined,
          revision: parsed ? parsed.revisionFromComment : undefined,
        });
      } catch (err) {
        findings.push(fail(err.code || "csv_invalid", `${item.path}: ${err.message}`, { path: item.path }));
      }
    } else if (item.path.endsWith(".svg")) {
      const read = readExactFile(artifactDir, item.path);
      if (read.error) {
        findings.push(read.error);
        continue;
      }
      if (!read.bytes) {
        findings.push(fail("empty_bytes", item.path));
        continue;
      }
      resources.push({
        path: item.path,
        origins: item.origins,
        sha256: read.sha256,
        bytes: read.bytes,
      });
    }
  }
  if (artifactDir && fs.existsSync(artifactDir)) {
    for (const entry of walkFiles(artifactDir)) {
      if (entry.symlink || !entry.full.toLowerCase().endsWith(".csv")) continue;
      const rel = relPosix(artifactDir, entry.full);
      const urlPath = `/${rel}`;
      if (isPrivateCsvPath(urlPath) || !AUTHORIZED_CSV.test(urlPath)) {
        findings.push(fail("private_csv", urlPath, { path: urlPath }));
      }
    }
  }
  const ok = findings.length === 0;
  return {
    schema: SCHEMA,
    ok,
    mode: "artifact",
    expected: derived.expected,
    pagesPresent: derived.pagesPresent,
    descriptors: derived.descriptors,
    resources,
    findings,
  };
}

function tarList(tarball) {
  const listed = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (listed.status !== 0) {
    throw Object.assign(new Error(listed.stderr || "tar list failed"), { code: "tarball_unreadable" });
  }
  return listed.stdout.split("\n").map((line) => line.replace(/^\.\//, "")).filter(Boolean);
}

function tarExtract(tarball, member) {
  const extracted = spawnSync("tar", ["-xOf", tarball, member], { maxBuffer: 8 * 1024 * 1024 });
  if (extracted.status !== 0) {
    throw Object.assign(new Error(extracted.stderr?.toString() || "tar extract failed"), {
      code: "tarball_member_missing",
      member,
    });
  }
  return Buffer.from(extracted.stdout);
}

export function validateTarball({ artifactDir, tarball, sourceRoot }) {
  const artifact = validateArtifact({ artifactDir, sourceRoot });
  const findings = [];
  if (!artifact.ok) findings.push(...artifact.findings);
  let members;
  try {
    members = tarList(tarball);
  } catch (err) {
    return {
      schema: SCHEMA,
      ok: false,
      mode: "tarball",
      artifact,
      findings: [fail(err.code || "tarball_unreadable", err.message)],
    };
  }
  const memberSet = new Set(members);
  const compared = [];
  for (const resource of artifact.resources || []) {
    const member = `_site${resource.path}`;
    if (!memberSet.has(member) && !memberSet.has(`${member}`)) {
      findings.push(fail("missing_promised_resource", `tarball lacks ${member}`, { path: resource.path }));
      continue;
    }
    let body;
    try {
      body = tarExtract(tarball, member);
    } catch (err) {
      findings.push(fail(err.code || "tarball_member_missing", member, { path: resource.path }));
      continue;
    }
    const digest = sha256Bytes(body);
    if (digest !== resource.sha256) {
      findings.push(
        fail("hash_mismatch", `${member} != artifact`, {
          path: resource.path,
          artifact: resource.sha256,
          tarball: digest,
        }),
      );
      continue;
    }
    compared.push({ path: resource.path, member, sha256: digest, bytes: body.length });
  }
  return {
    schema: SCHEMA,
    ok: findings.length === 0,
    mode: "tarball",
    expected: artifact.expected,
    resources: compared,
    findings,
  };
}

function mimeAllowed(contentType, urlPath) {
  const raw = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (urlPath.endsWith(".csv")) return ALLOWED_CSV_MIME.has(raw);
  if (urlPath.endsWith(".svg")) return ALLOWED_SVG_MIME.has(raw);
  return false;
}

function requestOnce(urlString, { timeoutMs, maxBytes, maxRedirects, allowHosts, requestCount }) {
  return new Promise((resolve, reject) => {
    if (requestCount.count >= requestCount.max) {
      reject(Object.assign(new Error("request limit"), { code: "request_limit" }));
      return;
    }
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      reject(Object.assign(new Error("invalid url"), { code: "invalid_url" }));
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reject(Object.assign(new Error("refused scheme"), { code: "refused_scheme" }));
      return;
    }
    const host = parsed.hostname.toLowerCase();
    if (!allowHosts.has(host)) {
      reject(Object.assign(new Error(`host not allowlisted: ${host}`), { code: "host_not_allowlisted", host }));
      return;
    }
    if (!AUTHORIZED_RESOURCE.test(parsed.pathname) && !SENTINEL_PATHS.includes(parsed.pathname)) {
      reject(Object.assign(new Error(`path not allowlisted: ${parsed.pathname}`), { code: "path_not_allowlisted" }));
      return;
    }
    if (isPrivateCsvPath(parsed.pathname)) {
      reject(Object.assign(new Error(`private csv path: ${parsed.pathname}`), { code: "private_csv" }));
      return;
    }
    requestCount.count += 1;
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (maxRedirects <= 0) {
            res.resume();
            reject(Object.assign(new Error("too many redirects"), { code: "too_many_redirects" }));
            return;
          }
          const next = new URL(res.headers.location, parsed);
          res.resume();
          resolve(
            requestOnce(next.href, {
              timeoutMs,
              maxBytes,
              maxRedirects: maxRedirects - 1,
              allowHosts,
              requestCount,
            }),
          );
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(Object.assign(new Error("response too large"), { code: "max_bytes" }));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            url: parsed.href,
            finalUrl: parsed.href,
            status,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("timeout"), { code: "timeout" }));
    });
    req.on("error", (err) => {
      reject(Object.assign(err, { code: err.code || "network_error" }));
    });
    req.end();
  });
}

export async function validateHttp({
  artifactDir,
  sourceRoot,
  httpBase,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRequests = DEFAULT_MAX_REQUESTS,
  allowHosts = DEFAULT_HOSTS,
}) {
  const artifact = validateArtifact({ artifactDir, sourceRoot });
  const findings = [];
  if (!artifact.ok) findings.push(...artifact.findings);
  const base = String(httpBase || "").replace(/\/+$/, "");
  const hosts = new Set(allowHosts);
  const requestCount = { count: 0, max: maxRequests };
  const resources = [];
  for (const resource of artifact.resources || []) {
    if (!resource.path.endsWith(".csv") && !SENTINEL_PATHS.includes(resource.path)) continue;
    const url = `${base}${resource.path}`;
    let response;
    try {
      response = await requestOnce(url, {
        timeoutMs,
        maxBytes,
        maxRedirects: 3,
        allowHosts: hosts,
        requestCount,
      });
    } catch (err) {
      findings.push(fail(err.code || "http_error", `${resource.path}: ${err.message}`, { path: resource.path }));
      continue;
    }
    if (response.status !== 200) {
      findings.push(
        fail("http_status", `${resource.path} status ${response.status}`, {
          path: resource.path,
          status: response.status,
          finalUrl: response.finalUrl,
        }),
      );
      continue;
    }
    const contentType = response.headers["content-type"] || "";
    if (!mimeAllowed(contentType, resource.path)) {
      findings.push(
        fail("http_mime", `${resource.path} content-type ${contentType}`, {
          path: resource.path,
          contentType,
        }),
      );
      continue;
    }
    if (looksLikeHtmlError(response.body)) {
      findings.push(fail("html_error_body", resource.path, { path: resource.path, status: response.status }));
      continue;
    }
    const digest = sha256Bytes(response.body);
    if (digest !== resource.sha256) {
      findings.push(
        fail("hash_mismatch", `${resource.path} http != artifact`, {
          path: resource.path,
          artifact: resource.sha256,
          http: digest,
        }),
      );
      continue;
    }
    try {
      validateCsvAgainstContract(resource.path, response.body, descriptorForPath(sourceRoot, resource.path));
    } catch (err) {
      findings.push(fail(err.code || "csv_invalid", `${resource.path}: ${err.message}`, { path: resource.path }));
      continue;
    }
    resources.push({
      path: resource.path,
      status: response.status,
      finalUrl: response.finalUrl,
      contentType,
      sha256: digest,
      bytes: response.body.length,
    });
  }
  return {
    schema: SCHEMA,
    ok: findings.length === 0,
    mode: "http",
    httpBase: base,
    expected: artifact.expected,
    resources,
    findings,
  };
}

function parseArgs(argv) {
  const args = {
    mode: "artifact",
    artifact: "_site",
    sourceRoot: ".",
    tarball: null,
    httpBase: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBytes: DEFAULT_MAX_BYTES,
    maxRequests: DEFAULT_MAX_REQUESTS,
    allowHosts: [...DEFAULT_HOSTS],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--mode") args.mode = next();
    else if (a === "--artifact") args.artifact = next();
    else if (a === "--source-root") args.sourceRoot = next();
    else if (a === "--tarball") args.tarball = next();
    else if (a === "--http-base") args.httpBase = next();
    else if (a === "--timeout-ms") args.timeoutMs = Number(next());
    else if (a === "--max-bytes") args.maxBytes = Number(next());
    else if (a === "--max-requests") args.maxRequests = Number(next());
    else if (a === "--allow-http-host") args.allowHosts.push(next());
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

export async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    return {
      schema: SCHEMA,
      ok: true,
      help: "verify_promised_public_resources.mjs --mode artifact|tarball|http|all --artifact _site --source-root . [--tarball file] [--http-base url]",
    };
  }
  const artifactDir = path.resolve(args.artifact);
  const sourceRoot = path.resolve(args.sourceRoot);
  const reports = [];
  if (args.mode === "artifact" || args.mode === "all") {
    reports.push(validateArtifact({ artifactDir, sourceRoot }));
  }
  if (args.mode === "tarball" || args.mode === "all") {
    if (!args.tarball) throw new Error("--tarball is required for tarball mode");
    reports.push(validateTarball({ artifactDir, tarball: path.resolve(args.tarball), sourceRoot }));
  }
  if (args.mode === "http" || args.mode === "all") {
    if (!args.httpBase) throw new Error("--http-base is required for http mode");
    reports.push(
      await validateHttp({
        artifactDir,
        sourceRoot,
        httpBase: args.httpBase,
        timeoutMs: args.timeoutMs,
        maxBytes: args.maxBytes,
        maxRequests: args.maxRequests,
        allowHosts: args.allowHosts,
      }),
    );
  }
  const ok = reports.every((report) => report.ok);
  return {
    schema: SCHEMA,
    ok,
    mode: args.mode,
    reports,
    findings: reports.flatMap((report) => report.findings || []),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  run().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok ? 0 : 1);
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(2);
  });
}
