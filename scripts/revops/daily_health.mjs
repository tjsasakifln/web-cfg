/**
 * Daily health: critical URLs, ops health, form OPTIONS, abandoned 410.
 *   node scripts/revops/daily_health.mjs
 *   node scripts/revops/daily_health.mjs https://confenge.com.br
 */
const BASE = (process.argv[2] || "https://confenge.com.br").replace(/\/$/, "");
const critical = ["/", "/conteudos/", "/#contato", "/robots.txt", "/sitemap.xml", "/ops/", "/ferramentas/"];
const gone = ["/avcb", "/clcb", "/avaliacao-imovel", "/automacao", "/vision"];
let fail = 0;
async function code(path) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  return r.status;
}
for (const p of critical) {
  const path = p.includes("#") ? p.split("#")[0] : p;
  const c = await code(path === "" ? "/" : path);
  const ok = c === 200 || c === 301 || c === 302;
  console.log(ok ? "PASS" : "FAIL", "critical", path, c);
  if (!ok) fail++;
}
for (const p of gone) {
  const c = await code(p);
  const ok = c === 410;
  console.log(ok ? "PASS" : "FAIL", "gone", p, c);
  if (!ok) fail++;
}
const health = await fetch(BASE + "/.netlify/functions/ops?action=health").then((r) => r.json());
console.log(health.ok ? "PASS" : "FAIL", "ops_health", health.service);
if (!health.ok) fail++;
const col = await fetch(BASE + "/.netlify/functions/collect").then((r) => r.json());
console.log(col.ok ? "PASS" : "FAIL", "collect", col.collector);
if (!col.ok) fail++;
if (fail) process.exit(1);
console.log("DAILY_HEALTH_OK", BASE);
