/**
 * Published money-asset inspection only. It never creates a lead or proves
 * transport. Authenticated transport proof is synthetic_lead_probe.mjs and
 * requires its separate operational authorization.
 */
import fs from "node:fs";
import path from "node:path";

const rawBase = process.argv[2] || process.env.MONEY_ASSET_PROOF_BASE || "https://confenge.com.br";
const outPath = process.argv[3] || process.env.MONEY_ASSET_PROOF_OUT || "";
const canonical = "https://confenge.com.br";
const PAGE_PATH = "/ferramentas/diagnostico-defesa-margem/";
const report = {
  ok: false,
  state: "NOT_VERIFIED",
  proven_as: "not_proven",
  asset: `${canonical}${PAGE_PATH}`,
  steps: {
    capture: { status: "NOT_VERIFIED", reason: "this_command_never_posts" },
    transport: { status: "NOT_VERIFIED", reason: "use_authorized_synthetic_lead_probe" },
    confirmacao_humana: { status: "NOT_VERIFIED", reason: "not_observable_by_page_inspection" },
  },
  ts: new Date().toISOString(),
};

function writeAndExit() {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(outPath, json, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(outPath, 0o600);
  }
  process.exit(report.ok ? 0 : 2);
}

let parsed;
try { parsed = new URL(rawBase); } catch { report.steps.page_live = { status: "BLOCKED", reason: "base_url_invalid" }; writeAndExit(); }
if (rawBase.replace(/\/$/, "") !== canonical || parsed.protocol !== "https:") {
  report.steps.page_live = { status: "BLOCKED", reason: "canonical_https_base_required" };
  writeAndExit();
}

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { redirect: "manual", signal: controller.signal });
    return { status: res.status, text: await res.text(), headers: res.headers };
  } finally { clearTimeout(timer); }
}

let page;
try {
  page = await getText(`${canonical}${PAGE_PATH}`);
  const noindex = /noindex/i.test(page.text) || /noindex/i.test(page.headers.get("x-robots-tag") || "");
  const cta = page.text.includes("Pedir uma segunda leitura do contrato");
  const utilityBeforeCta = page.text.indexOf('id="identificacao"') > -1 &&
    page.text.indexOf('id="identificacao"') < page.text.indexOf('id="segunda-leitura"');
  report.steps.page_live = { status: page.status === 200 && cta ? "PROVEN" : "BLOCKED", http: page.status, cta, noindex, utility_before_cta: utilityBeforeCta };
} catch (err) {
  report.steps.page_live = { status: "BLOCKED", reason: err?.name === "AbortError" ? "get_timeout" : "get_failed" };
}
report.steps.indexability_hygiene = { status: "UNKNOWN", reason: "page_unavailable" };
if (page) {
  try {
    const sitemap = await getText(`${canonical}/sitemap.xml`);
    const noindex = report.steps.page_live.noindex;
    const inSitemap = sitemap.text.includes("diagnostico-defesa-margem");
    const hygiene = page.status === 200 && sitemap.status === 200 &&
      ((noindex && !inSitemap) || (!noindex && inSitemap));
    report.steps.indexability_hygiene = { status: hygiene ? "PROVEN" : "UNKNOWN", sitemap_http: sitemap.status, noindex, in_sitemap: inSitemap };
    if (report.steps.page_live.status === "PROVEN" && hygiene) report.proven_as = "published_asset_only";
  } catch (err) {
    report.steps.indexability_hygiene = { status: "UNKNOWN", reason: err?.name === "AbortError" ? "sitemap_timeout" : "sitemap_failed" };
  }
}
writeAndExit();
