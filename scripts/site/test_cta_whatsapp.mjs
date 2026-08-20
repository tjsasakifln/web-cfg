/**
 * Audit main WhatsApp CTAs: correct number + non-empty text param.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NUMBER = "5548988344559";
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "data/site/whatsapp-messages.json"), "utf8"),
);

const pages = [
  "index.html",
  "obrigado.html",
  "obrigado-contrato.html",
  "obrigado-edital.html",
  "obrigado-operacao.html",
  "defesa-margem-contratos-publicos/index.html",
  "bid-room-licitacoes-obras/index.html",
  "diretoria-b2g/index.html",
  "diagnostico-b2g-360/index.html",
];

const issues = [];
const found = [];

for (const rel of pages) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    issues.push({ rel, error: "missing_file" });
    continue;
  }
  const html = fs.readFileSync(full, "utf8");
  const re = /https:\/\/wa\.me\/(\d+)\?text=([^"'\s]+)/g;
  let m;
  let count = 0;
  while ((m = re.exec(html))) {
    count++;
    const num = m[1];
    const text = decodeURIComponent(m[2]);
    if (num !== NUMBER) issues.push({ rel, error: "wrong_number", num });
    if (!text || text.length < 20) issues.push({ rel, error: "weak_text", text });
    found.push({ rel, num, text_len: text.length });
  }
  if (count === 0) issues.push({ rel, error: "no_wa_link" });
}

// Catalog completeness
for (const key of [
  "contrato_pressao",
  "glosa_medicao",
  "aditivo",
  "reequilibrio",
  "atraso_pagamento",
  "sancao_notificacao",
  "edital",
  "orcamento_bdi",
  "proposta",
  "diagnostico_b2g",
  "pseo_conteudo",
]) {
  if (!catalog.messages[key] || catalog.messages[key].length < 20) {
    issues.push({ error: "catalog_missing", key });
  }
}

if (catalog.number_e164 !== NUMBER) issues.push({ error: "catalog_number" });

const SKIP_DIRS = new Set(["node_modules", "_site", ".git", ".venv", "venv", ".worktrees"]);
const SVG_PATH_TOKEN =
  /[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g;

function walkHtmlFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(full, acc);
    else if (ent.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

function svgPathCommandsParse(d) {
  const leftover = String(d)
    .replace(SVG_PATH_TOKEN, "")
    .replace(/[\s,]/g, "");
  return leftover.length === 0;
}

function hasCorruptNumber(d) {
  return /0\.6\.7/.test(d) || /0 \.6\.7/.test(d) || /\d\.\d+\.\d/.test(d);
}

const htmlFiles = walkHtmlFiles(root);
for (const full of htmlFiles) {
  const rel = path.relative(root, full).split(path.sep).join("/");
  const html = fs.readFileSync(full, "utf8");
  const dAttrs = [...html.matchAll(/\bd="([^"]*)"/g)].map((m) => m[1]);
  for (const d of dAttrs) {
    if (d.includes("0.6.7") || d.includes("0 .6.7") || hasCorruptNumber(d)) {
      issues.push({ rel, error: "corrupt_svg_path_number", d: d.slice(0, 80) });
    }
  }
  const symbols = [
    ...html.matchAll(/<symbol\b[^>]*id="i-whatsapp"[^>]*>([\s\S]*?)<\/symbol>/gi),
  ];
  for (const sym of symbols) {
    const paths = [...sym[1].matchAll(/<path\b[^>]*\bd="([^"]*)"/gi)].map((m) => m[1]);
    if (!paths.length) issues.push({ rel, error: "whatsapp_path_missing" });
    for (const d of paths) {
      if (!svgPathCommandsParse(d)) {
        issues.push({ rel, error: "whatsapp_path_unparsed", d: d.slice(0, 80) });
      }
      if (!d.includes("M20.5 11.6") && !d.includes("M20.5 11.6".replace(" ", ""))) {
        if (d.startsWith("M8.2 7.7")) {
          issues.push({ rel, error: "whatsapp_inner_scribble" });
        }
      }
    }
  }
}

const out = { ok: issues.length === 0, found: found.length, html_scanned: htmlFiles.length, issues };
fs.mkdirSync(path.join(root, "docs/evidence/inbound-10"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/evidence/inbound-10/cta-audit.json"),
  JSON.stringify(out, null, 2),
);

if (issues.length) {
  console.error("CTA_AUDIT_FAIL", JSON.stringify(issues, null, 2));
  process.exit(1);
}
console.log("CTA_AUDIT_OK", JSON.stringify({ found: found.length, html_scanned: htmlFiles.length }));
