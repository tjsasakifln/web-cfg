// Lighthouse na borda pública (mesmo método da campanha 01): mobile, throttling simulado
// (rtt 150 ms / 1,6 Mbps / CPU 4x), cache frio por execução, N execuções por rota, mediana e faixa.
//   node docs/campaigns/design-institucional/expansao/tools/lighthouse_edge.mjs --base https://confenge.com.br \
//        --runs 3 --label prod-<sha> --out docs/campaigns/design-institucional/expansao/evidence/lighthouse-prod-<sha>-mobile.json / /servicos/ ...
import { writeFileSync } from "node:fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { resolveChromePath } from "../../../../../scripts/site/resolve_chrome.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("--base", "https://confenge.com.br").replace(/\/$/, "");
const RUNS = Number(opt("--runs", "3"));
const LABEL = opt("--label", "edge");
const OUT = opt("--out", `lighthouse-${LABEL}.json`);
const ROUTES = argv.filter((a, i) => a.startsWith("/") && !argv[i - 1]?.startsWith("--"));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const chrome = await chromeLauncher.launch({ chromePath: resolveChromePath(), chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
const results = [];
try {
  for (const route of ROUTES) {
    for (let run = 1; run <= RUNS; run++) {
      const r = await lighthouse(BASE + route, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility"], formFactor: "mobile", throttlingMethod: "simulate", disableStorageReset: false });
      const a = r.lhr.audits;
      // G06-04: Lighthouse 13 substituiu largest-contentful-paint-element por lcp-breakdown-insight
      // (details.items = [{type:'table', items:[{subpart, duration}]}, {type:'node', selector, snippet}]);
      // o item node pode faltar, por isso procura-se por tipo, nunca por índice fixo. Sob 'simulate' as
      // fases vêm do trace sem throttling de rede e não somam o LCP Lantern (só 'devtools' coincide).
      const bd = a["lcp-breakdown-insight"]?.details?.items || [];
      const nodeItem = bd.find((i) => i && i.type === "node");
      const phasesTbl = bd.find((i) => i && i.type === "table");
      const legacyEl = a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node;
      const lcpEl = nodeItem?.snippet || nodeItem?.selector || legacyEl?.snippet || null;
      const lcpSelector = nodeItem?.selector || legacyEl?.selector || null;
      const lcpPhases = phasesTbl && Array.isArray(phasesTbl.items) ? Object.fromEntries(phasesTbl.items.filter((row) => row && row.subpart).map((row) => [row.subpart, Math.round(Number(row.duration) || 0)])) : null;
      results.push({ route, run, performance: Math.round((r.lhr.categories.performance.score || 0) * 100), accessibility: Math.round((r.lhr.categories.accessibility.score || 0) * 100), lcp_ms: Math.round(a["largest-contentful-paint"].numericValue), cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)), tbt_ms: Math.round(a["total-blocking-time"].numericValue), fcp_ms: Math.round(a["first-contentful-paint"].numericValue), bytes: Math.round(a["total-byte-weight"].numericValue), lcp_element: lcpEl ? String(lcpEl).slice(0, 160) : null, lcp_selector: lcpSelector ? String(lcpSelector).slice(0, 160) : null, lcp_phases_ms: lcpPhases, lighthouseVersion: r.lhr.lighthouseVersion || null, final_url: r.lhr.finalDisplayedUrl });
      console.log(JSON.stringify(results[results.length - 1]));
    }
  }
} finally { await chrome.kill(); }
const summary = ROUTES.map((route) => { const rs = results.filter((x) => x.route === route); const p = rs.map((x) => x.performance), l = rs.map((x) => x.lcp_ms); return { route, runs: rs.length, perf_median: median(p), perf_range: [Math.min(...p), Math.max(...p)], lcp_median_ms: Math.round(median(l)), lcp_range_ms: [Math.min(...l), Math.max(...l)], cls_median: median(rs.map((x) => x.cls)), tbt_median_ms: Math.round(median(rs.map((x) => x.tbt_ms))), bytes_median: Math.round(median(rs.map((x) => x.bytes))), a11y_median: median(rs.map((x) => x.accessibility)), lcp_element: rs[0]?.lcp_element, lcp_selector: rs[0]?.lcp_selector, lcp_phases_ms: rs[0]?.lcp_phases_ms || null }; });
writeFileSync(OUT, JSON.stringify({ base: BASE, label: LABEL, measured_at: new Date().toISOString(), tool: `lighthouse (Node API) + chrome-launcher, ${resolveChromePath()}`, method: "mobile, simulated throttling rtt 150ms / 1.6 Mbps / cpu 4x, storage reset per run (cold cache); nenhuma execução descartada; lcp_element/lcp_selector/lcp_phases_ms lidos de lcp-breakdown-insight (Lighthouse 13) por tipo de item; sob simulate as fases não somam o LCP Lantern", lighthouseVersion: results[0]?.lighthouseVersion || null, runs_per_route: RUNS, summary, results }, null, 1) + "\n");
console.log("wrote", OUT);
for (const s of summary) console.log(`${s.route} perf ${s.perf_median} ${JSON.stringify(s.perf_range)} lcp ${s.lcp_median_ms} ${JSON.stringify(s.lcp_range_ms)} cls ${s.cls_median} bytes ${s.bytes_median}`);
