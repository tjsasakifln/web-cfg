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

const out = { ok: issues.length === 0, found: found.length, issues };
fs.mkdirSync(path.join(root, "docs/evidence/inbound-10"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/evidence/inbound-10/cta-audit.json"),
  JSON.stringify(out, null, 2),
);

if (issues.length) {
  console.error("CTA_AUDIT_FAIL", JSON.stringify(issues, null, 2));
  process.exit(1);
}
console.log("CTA_AUDIT_OK", JSON.stringify({ found: found.length }));
