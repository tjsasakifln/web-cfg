/**
 * Fail-closed scan: no hardcoded secrets / public ntfy topics / FormSubmit as primary.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN = [
  { re: /confenge-prod-leads-b2g-9f3c2a1e7d4b6e80/, name: "exposed_ntfy_topic" },
  { re: /formsubmit\.co\/ajax\//i, name: "formsubmit_ajax_url" },
  { re: /NTFY_TOPIC\s*=\s*["'][^"']+["']/, name: "hardcoded_ntfy_topic_assign" },
  { re: /sk_live_[a-zA-Z0-9]{20,}/, name: "stripe_live_key" },
  { re: /re_[a-zA-Z0-9]{20,}/, name: "resend_key_literal" },
  { re: /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/, name: "private_key" },
];

const SCAN_DIRS = ["netlify", "scripts", "seo/scripts", "script.js", "index.html"];

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) {
      if (name === "node_modules" || name === ".git" || name === "_site") continue;
      walk(path.join(p, name), out);
    }
  } else if (/\.(cjs|mjs|js|ts|html|json|yml|yaml|toml|md)$/i.test(p)) {
    out.push(p);
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  const full = path.join(root, d);
  if (!fs.existsSync(full)) continue;
  if (fs.statSync(full).isDirectory()) walk(full, files);
  else files.push(full);
}

const hits = [];
for (const file of files) {
  const rel = path.relative(root, file);
  // Historical evidence / self-referential scanners may mention rotated secrets
  if (rel.startsWith(`docs${path.sep}evidence${path.sep}`)) continue;
  if (rel.endsWith("gap-matrix-initial.md")) continue;
  if (rel === `scripts${path.sep}site${path.sep}test_secrets_scan.mjs`) continue;
  if (rel === `scripts${path.sep}site${path.sep}test_lead_function.mjs`) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      hits.push({ file: rel, rule: rule.name });
    }
  }
}

if (hits.length) {
  console.error("SECRETS_SCAN_FAIL", JSON.stringify(hits, null, 2));
  process.exit(1);
}
console.log("SECRETS_SCAN_OK", { files: files.length });
