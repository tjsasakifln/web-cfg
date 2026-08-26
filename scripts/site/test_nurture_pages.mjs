import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const shellPages = [
  "nurture/index.html",
  "nurture/sair/index.html",
  "casos/index.html",
  "casos/aditivo-art125-demonstrativo/index.html",
  "casos/medicao-glosa-demonstrativo/index.html",
  "imprensa/index.html",
  "ferramentas/index.html",
  "ferramentas/limite-acrescimos-supressoes/index.html",
  "ferramentas/checklist-reequilibrio/index.html",
  "ferramentas/matriz-atraso-obra/index.html",
  "radar/nacional-obras-publicas/index.html",
];

const pages = [
  ...shellPages,
  "data/nurture/tracks.json",
  "netlify/functions/nurture.cjs",
  "netlify/functions/lib/nurture-core.cjs",
];

let fail = 0;
for (const rel of pages) {
  if (!existsSync(resolve(ROOT, rel))) {
    console.error("FAIL missing", rel);
    fail++;
  } else console.log("PASS exists", rel);
}

const tracks = JSON.parse(readFileSync(resolve(ROOT, "data/nurture/tracks.json"), "utf8"));
for (const id of ["contrato", "edital", "operacao"]) {
  const n = tracks.tracks[id]?.messages?.length;
  if (n !== 5) {
    console.error("FAIL messages", id, n);
    fail++;
  } else console.log("PASS messages", id, n);
}

const caseHtml = readFileSync(resolve(ROOT, "casos/aditivo-art125-demonstrativo/index.html"), "utf8");
if (!/DEMONSTRATIVO|NÃO É CASE/i.test(caseHtml)) {
  console.error("FAIL case label");
  fail++;
} else console.log("PASS case_demo_label");
if (/economia de R\$\s*[0-9]|nosso cliente ganhou/i.test(caseHtml)) {
  console.error("FAIL fake client claim");
  fail++;
} else console.log("PASS no_fake_client_claims");

const sm = readFileSync(resolve(ROOT, "sitemap.xml"), "utf8");
for (const u of ["/nurture/", "/casos/", "/imprensa/"]) {
  if (!sm.includes(u)) {
    console.error("FAIL sitemap", u);
    fail++;
  } else console.log("PASS sitemap", u);
}

// Brand shell: logo image + full footer, no text-logo stub chrome
for (const rel of shellPages) {
  const html = readFileSync(resolve(ROOT, rel), "utf8");
  const checks = [
    ['class="brand"', "brand_logo_class"],
    ["logo-confenge-500-f8a83f6d.png", "header_logo_asset"],
    ["footer-top", "footer_top"],
    ["logo-confenge-white-500-1677038e.png", "footer_logo_asset"],
    ["52.407.089/0001-09", "cnpj"],
    ["desktop-nav", "desktop_nav"],
  ];
  for (const [needle, name] of checks) {
    if (!html.includes(needle)) {
      console.error("FAIL shell", rel, name);
      fail++;
    }
  }
  if (html.includes('class="logo"') || html.includes("nav-desktop")) {
    console.error("FAIL legacy_light_chrome", rel);
    fail++;
  } else console.log("PASS brand_shell", rel);
}

// Nurture landing must communicate real track value
const nurture = readFileSync(resolve(ROOT, "nurture/index.html"), "utf8");
const valueMarkers = [
  ["art. 125", "track_contrato_art125"],
  ["Glosa", "track_contrato_glosa"],
  ["Operação de Proposta para Licitação Crítica", "track_edital_offer"],
  ["Decisão de participar", "track_edital_decidir"],
  ["Diretoria Fracionada para o Mercado Público", "track_operacao_diretoria"],
  ["double opt-in", "double_opt_in"],
  ["nurture-form", "subscribe_form"],
];
for (const [needle, name] of valueMarkers) {
  if (!nurture.includes(needle)) {
    console.error("FAIL nurture_value", name);
    fail++;
  } else console.log("PASS nurture_value", name);
}

if (fail) process.exit(1);
console.log("ALL nurture/cases/press structure checks passed");
