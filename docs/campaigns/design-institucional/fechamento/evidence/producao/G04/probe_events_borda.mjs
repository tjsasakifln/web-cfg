// Sonda read-only na borda (produção): carrega rotas pelo caminho normal do visitante, clica em
// controles com preventDefault (fase de captura) e registra o diff de window.dataLayer.
// Nada sai do cliente: sendBeacon é neutralizado antes do primeiro script, toda requisição POST e
// toda requisição a /api/ é abortada, e requisições fora da origem são abortadas. Nenhum formulário.
// Derivada de evidence/diagnostico/G04/probe_events.mjs (checkout local 252fc98d1).
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "/home/tjsasakifln/code/confenge/.worktrees/pos-redesign-verificado/scripts/site/resolve_chrome.mjs";
const BASE = process.argv[2] || "https://confenge.com.br"; const OUT = process.argv[3];
const CASES = [
  ["/", 'a[data-cta-position="hero"][href="/servicos/"]', "home hero Ver serviços por situação"],
  ["/", '.chooser-ask__actions a[href="#triagem-tecnica"]', "home chooser-ask → #triagem-tecnica"],
  ["/", 'a[data-cta-position="corporate_triage"][href="#contato"]', "home corporate_triage → #contato"],
  ["/", 'a.header-cta[href="/triagem-tecnica/"]', "home header Solicitar proposta"],
  ["/", 'a[data-event-name="critical_decision_cta_click"]', "home contact critical_decision wa.me"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="frame-quantities-budget-hero"]', "quantitativos hero"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="frame-quantities-budget-inline"]', "quantitativos inline"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-whatsapp"]', "quantitativos alt whatsapp"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-email"]', "quantitativos alt mailto"],
  ["/quantitativos-orcamento-obras/", 'a[data-cta-id="quantities-budget-alternative-phone"]', "quantitativos alt tel"],
  ["/quantitativos-orcamento-obras/", 'a.header-cta', "quantitativos header Solicitar proposta"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="frame-coordination-clash-hero"]', "compatibilizacao hero"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="frame-coordination-clash-inline"]', "compatibilizacao inline"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="coordination-clash-alternative-whatsapp"]', "compatibilizacao alt whatsapp"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="coordination-clash-alternative-email"]', "compatibilizacao alt mailto"],
  ["/compatibilizacao-projetos-engenharia/", 'a[data-cta-id="coordination-clash-alternative-phone"]', "compatibilizacao alt tel"],
  ["/servicos/", 'a[data-cta-id="services-private-quantities-budget"]', "hub → /quantitativos-orcamento-obras/"],
  ["/conteudos/documentos-reequilibrio-obra-publica/", '.lead-inline a.button-secondary[href^="/reequilibrio-obras-publicas/"]', "artigo Continuar pelo formulário"],
  ["/conteudos/documentos-reequilibrio-obra-publica/", 'a[data-pillar-link="1"]', "artigo text-link do pilar"],
];
const PII_KEY = /address|arquivo|attach|cnpj|company|cpf|document|edital|email|empresa|endereco|comment|description|field|file|text|name|nome|message|mensagem|note|phone|query|search|tel|whatsapp/i;
const b = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox"] });
const rows = []; const blocked = [];
for (const [route, sel, label] of CASES) {
  const p = await b.newPage();
  await p.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 confenge-evidence-probe");
  await p.evaluateOnNewDocument(() => {
    window.__sentBeacons = [];
    navigator.sendBeacon = (u) => { window.__sentBeacons.push(String(u)); return true; };
  });
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const u = r.url();
    let sameOrigin = false;
    try { sameOrigin = new URL(u).origin === new URL(BASE).origin; } catch { sameOrigin = false; }
    if (!sameOrigin || r.method() !== "GET" || /\/api\//.test(u)) { blocked.push({ route, method: r.method(), url: u.slice(0, 120) }); r.abort(); return; }
    r.continue();
  });
  await p.goto(BASE + route, { waitUntil: "networkidle0", timeout: 90000 });
  const r = await p.evaluate(async (sel, piiSrc) => {
    const PII_KEY = new RegExp(piiSrc, "i");
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const matches = document.querySelectorAll(sel).length;
    const before = (window.dataLayer || []).length;
    el.addEventListener("click", (e) => e.preventDefault(), { capture: true });
    const hrefBefore = location.href;
    el.click();
    await new Promise((r) => setTimeout(r, 120));
    const emitted = (window.dataLayer || []).slice(before).map((e) => {
      const o = {}; for (const k of ["event","cta_position","cta_id","cta_kind","destination_type","alias_from","consent","destination_path","destination_service_id","route_family","asset_id","cta_label","source_page_type"]) if (e[k] !== undefined) o[k] = e[k];
      o._keys = Object.keys(e).sort();
      o._pii = { keys: Object.keys(e).filter((k) => PII_KEY.test(k)), values_with_at: Object.entries(e).filter(([, v]) => typeof v === "string" && v.includes("@")).map(([k]) => k), values_10_15_digits: Object.entries(e).filter(([, v]) => typeof v === "string" && /\d{10,15}/.test(v)).map(([k]) => k) };
      o._contains_critical_decision_cta_click = JSON.stringify(e).includes("critical_decision_cta_click");
      o._correlation_id_shape = typeof e.correlation_id !== "string" ? "absent" : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.correlation_id) ? "uuid" : /^c-/.test(e.correlation_id) ? "c-prefixed" : /^[A-Z0-9]{8,}$/.test(e.correlation_id) ? "whatsapp_protocol" : "other";
      return o; });
    const all = (window.dataLayer || []).map((e) => e && e.event).filter(Boolean);
    return { found: true, matches, text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60), href: (el.getAttribute("href") || "").slice(0, 60), attrs: { event_name: el.getAttribute("data-event-name"), cta_position: el.getAttribute("data-cta-position"), cta_id: el.getAttribute("data-cta-id"), route_family: el.getAttribute("data-route-family"), asset_id: el.getAttribute("data-asset-id") }, emitted, navigated: location.href !== hrefBefore, dataLayer_events_all: all, forbidden_events: all.filter((n) => /^(qualified_lead|pipeline|handoff_accepted)$/.test(n)), beacons_intercepted: window.__sentBeacons };
  }, sel, PII_KEY.source);
  rows.push({ route, label, selector: sel, ...r });
  console.log(JSON.stringify(rows.at(-1)));
  await p.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, measured_at: new Date().toISOString(), method: "produção pela borda, caminho normal do visitante (sem cache-buster); clique com preventDefault (captura); diff de window.dataLayer; sendBeacon neutralizado; POST, /api/ e origens externas abortados; nenhum formulário enviado", rows, blocked_requests: blocked }, null, 1) + "\n");
