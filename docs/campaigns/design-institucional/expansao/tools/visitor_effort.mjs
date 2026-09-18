// Esforço do visitante, mesmo método para base e candidato (aceite 2026-09-18).
//   node docs/campaigns/design-institucional/expansao/tools/visitor_effort.mjs --base http://127.0.0.1:8791 --label main /  /servicos/ ...
// Por rota e viewport (390x844, 1440x1000): altura total materializada, prosa visível (chars de
// p/li/dt/dd/h*/figcaption fora de SVG), anotações de desenho (texto dentro de <svg>), posição
// (top) do primeiro contato acionável (button-primary/wa.me/mailto/tel/form), quantos contatos
// acionáveis, e se a ação dominante está inteira na primeira tela.
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../scripts/site/resolve_chrome.mjs";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("--base"); const LABEL = opt("--label", "x"); const OUT = opt("--out", `visitor-effort-${LABEL}.json`);
const ROUTES = argv.filter((a, i) => a.startsWith("/") && !argv[i - 1]?.startsWith("--"));
const b = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ["--no-sandbox"] });
const rows = [];
for (const route of ROUTES) for (const [w, h] of [[390, 844], [1440, 1000]]) {
  const p = await b.newPage(); await p.setCacheEnabled(false); await p.setViewport({ width: w, height: h });
  await p.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
  const r = await p.evaluate(async (vh) => {
    document.documentElement.style.scrollBehavior = "auto";
    document.querySelectorAll("*").forEach((el) => { const cs = getComputedStyle(el); if (cs.contentVisibility && cs.contentVisibility !== "visible") el.style.contentVisibility = "visible"; });
    document.querySelectorAll("img[loading=lazy]").forEach((i) => { i.loading = "eager"; });
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 200)); window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 100));
    const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const main = document.querySelector("main") || document.body;
    let prose = 0, proseNodes = 0;
    for (const el of main.querySelectorAll("p,li,dt,dd,h1,h2,h3,h4,figcaption,summary,label,td,th")) { if (el.closest("svg") || !vis(el)) continue; if ([...el.querySelectorAll("p,li,dt,dd,h1,h2,h3,h4,figcaption,summary,label,td,th")].some(vis)) continue; const t = el.innerText.replace(/\s+/g, " ").trim(); prose += t.length; if (t) proseNodes++; }
    let drawing = 0; for (const t of document.querySelectorAll("svg text")) drawing += (t.textContent || "").trim().length;
    const imgs = [...document.querySelectorAll('img[src*="/pranchas/"], picture img')].filter(vis).length;
    const contacts = [...document.querySelectorAll('a.button-primary, a.button, a[href^="https://wa.me"], a[href^="mailto:"], a[href^="tel:"], form button[type=submit], a[href*="#contato"], a[href*="#triagem"], a[href*="#captura"], a[href*="#pedido"]')].filter(vis).map((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), text: (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 60), href: (el.getAttribute("href") || "form").slice(0, 60) }; }).sort((a, b) => a.top - b.top);
    const header = document.querySelector("header.site-header, .site-head, header")?.getBoundingClientRect().height || 0;
    const first = contacts[0] || null;
    const primaryInFold = contacts.find((c) => /button/.test(c.href) || c.text) ? contacts.some((c) => c.bottom <= vh && c.top >= header) : false;
    const h1 = document.querySelector("h1")?.innerText.replace(/\s+/g, " ").trim().slice(0, 120);
    return { height: document.documentElement.scrollHeight, prose_chars: prose, prose_nodes: proseNodes, drawing_chars: drawing, plates_visible: imgs, first_contact: first, contacts_count: contacts.length, primary_in_fold: primaryInFold, header_h: Math.round(header), h1 };
  }, h);
  rows.push({ route, viewport: `${w}x${h}`, ...r });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await p.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, label: LABEL, measured_at: new Date().toISOString(), method: "fontes carregadas; content-visibility materializado; imagens lazy carregadas; prosa = innerText de p/li/dt/dd/h1-4/figcaption/summary/label/td/th visíveis dentro de <main>, folhas (sem SVG); anotações = texto dentro de <svg>; contato = primeiro controle acionável visível (botão primário, wa.me, mailto, tel, submit, âncora de contato) por top absoluto", rows }, null, 1) + "\n");
