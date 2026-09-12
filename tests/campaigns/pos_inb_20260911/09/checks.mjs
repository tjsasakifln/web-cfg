/**
 * Q01–Q08 against shipped pages, CSVs, maps, kits and the lead handler.
 * READY/handoff/test-file presence is not PASS.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FAIL,
  MISSING_DEPENDENCY,
  NOT_RUN,
  NOT_VERIFIED,
  PASS,
  SEVERITY,
  existsInRoot,
  record,
} from "../../inb_20260911/15/lib/harness.mjs";
import { EXTERNAL_EVIDENCE, HARD_AT_RELEASE } from "../../inb_20260911/15/lib/strict.mjs";
import * as html from "../../inb_20260911/15/lib/html.mjs";
import { leadEvent, loadLead, loadReadiness, validLead } from "../../inb_20260911/15/lib/shipped.mjs";
import { receiptImpliesPersist, retryDuplicated } from "../../inb_20260911/15/checks.mjs";
import { artifactWouldCopy } from "./lib/artifact.mjs";
import { fetchBuffer, looksLikeCsv, looksLikeHtml, serveStatic } from "./lib/http.mjs";
import {
  CSVS,
  CSV_DIR,
  COMPAT_PAGE,
  COMPLEMENTARES_PAGE,
  DEMO_PAGE,
  GENERIC_HUB,
  INFRA_DEMONSTRATIVO_HINTS,
  INSPECAO_PAGE,
  EXCERPT_ITEM_ID,
  KIT_EXPECTED,
  KITS_JSON,
  OBRAS_PUBLICAS_PAGE,
  ORCAMENTO_PAGE,
  PERICIA_PAGE,
  PRONTIDAO_ENGINE,
  PRONTIDAO_PAGE,
  PUBLIC_LEAK_PAGES,
  REQUIRED_DESTINATIONS,
  REVISAO_PAGE,
  SERVICOS_PAGE,
} from "./matrix.mjs";

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function passFail(report, item, ok) {
  record(report, { ...item, status: ok ? PASS : FAIL, severity: ok ? null : item.severity || SEVERITY.JOURNEY });
}

export async function checkQ01(report, root, { port }) {
  const pageRel = DEMO_PAGE;
  if (!existsInRoot(root, pageRel)) {
    record(report, {
      id: "Q01.page",
      campaign: "02",
      owner: "02",
      path: pageRel,
      status: MISSING_DEPENDENCY,
      dependency_level: HARD_AT_RELEASE,
      expected: "private demonstrativo page",
      observed: "absent",
    });
    return;
  }
  const page = read(root, pageRel);
  const publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pos09-public-"));
  const demoSrc = path.join(root, "casos/demonstrativo-projeto-privado");
  const demoDest = path.join(publicRoot, "casos/demonstrativo-projeto-privado");
  fs.mkdirSync(demoDest, { recursive: true });
  fs.cpSync(demoSrc, demoDest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(root, src);
      if (!rel || rel === ".") return true;
      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        const base = path.basename(src);
        if (base === "data") {
          return artifactWouldCopy(root, `${rel}/revisao.csv`).copy;
        }
        return !["seo", "scripts", "tests"].includes(base);
      }
      const verdict = artifactWouldCopy(root, rel);
      return verdict.copy;
    },
  });
  let server;
  let sourceServer;
  try {
    server = await serveStatic(publicRoot, port);
    sourceServer = await serveStatic(root, port + 1);
    for (const csv of CSVS) {
      const rel = `${CSV_DIR}/${csv.file}`;
      const hrefRel = `data/${csv.file}`;
      const sourceOk = existsInRoot(root, rel);
      passFail(
        report,
        {
          id: `Q01.source.${csv.file}`,
          campaign: "02",
          owner: "02",
          path: rel,
          expected: "CSV exists in source",
          observed: sourceOk,
          severity: SEVERITY.JOURNEY,
        },
        sourceOk,
      );
      const linked = page.includes(`href="${hrefRel}"`) || page.includes(`href="/${rel}"`);
      passFail(
        report,
        {
          id: `Q01.link.${csv.file}`,
          campaign: "02",
          owner: "02",
          path: pageRel,
          expected: `HTML still links ${hrefRel}; removing the link does not satisfy Q01`,
          observed: linked,
          severity: SEVERITY.JOURNEY,
        },
        linked,
      );
      const artifact = artifactWouldCopy(root, rel);
      passFail(
        report,
        {
          id: `Q01.artifact.${csv.file}`,
          campaign: "03",
          owner: "03",
          path: rel,
          expected: "CSV copied into the public artifact/package",
          observed: artifact,
          severity: SEVERITY.JOURNEY,
        },
        artifact.ok && artifact.copy,
      );
      const url = `http://127.0.0.1:${port}/${rel}`;
      let httpOk = false;
      let observed = null;
      try {
        const res = await fetchBuffer(url);
        const csvBody = looksLikeCsv(res.text) && !looksLikeHtml(res.text);
        httpOk = res.status === 200 && csvBody;
        observed = { status: res.status, csvBody, htmlBody: looksLikeHtml(res.text), preview: res.text.slice(0, 80) };
      } catch (err) {
        observed = String(err && err.message);
      }
      passFail(
        report,
        {
          id: `Q01.http.${csv.file}`,
          campaign: "03",
          owner: "03",
          url: `/${rel}`,
          expected: "HTTP 200 with CSV body from the published artifact, not HTML",
          observed,
          severity: SEVERITY.JOURNEY,
        },
        httpOk,
      );
      let bodyOk = false;
      let bodyObserved = null;
      try {
        const res = await fetchBuffer(`http://127.0.0.1:${port + 1}/${rel}`);
        bodyOk = res.status === 200 && looksLikeCsv(res.text) && !looksLikeHtml(res.text);
        bodyObserved = { status: res.status, htmlBody: looksLikeHtml(res.text), preview: res.text.slice(0, 80) };
      } catch (err) {
        bodyObserved = String(err && err.message);
      }
      passFail(
        report,
        {
          id: `Q01.http.body.${csv.file}`,
          campaign: "03",
          owner: "03",
          url: `/${rel}`,
          expected: "CSV bytes, not an HTML 200 stand-in",
          observed: bodyObserved,
          severity: SEVERITY.JOURNEY,
        },
        bodyOk,
      );
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (sourceServer) await new Promise((resolve) => sourceServer.close(resolve));
  }
}

export async function checkQ02(report, root) {
  if (!existsInRoot(root, ORCAMENTO_PAGE)) {
    record(report, {
      id: "Q02.page",
      campaign: "02",
      owner: "02",
      path: ORCAMENTO_PAGE,
      status: MISSING_DEPENDENCY,
      dependency_level: HARD_AT_RELEASE,
      expected: "orçamento page",
      observed: "absent",
    });
    return;
  }
  const page = read(root, ORCAMENTO_PAGE);
  const awaiting = /awaiting-canonical-excerpt/.test(page) || /quando o demonstrativo canônico/.test(page);
  passFail(
    report,
    {
      id: "Q02.excerpt.not_awaiting",
      campaign: "02",
      owner: "02",
      path: ORCAMENTO_PAGE,
      expected: "numeric excerpt from the published demonstrativo, not awaiting-canonical-excerpt",
      observed: awaiting ? "awaiting-canonical-excerpt or future promise" : "no awaiting marker",
      severity: SEVERITY.JOURNEY,
    },
    !awaiting,
  );
  const csvRel = `${CSV_DIR}/quantitativos.csv`;
  if (!existsInRoot(root, csvRel)) {
    record(report, {
      id: "Q02.excerpt.tracks_source",
      campaign: "02",
      owner: "02",
      path: csvRel,
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "quantitativos.csv source for excerpt",
      observed: "csv absent",
    });
    return;
  }
  const csv = read(root, csvRel);
  const qtyLine = csv.split(/\r?\n/).find((line) => line.startsWith(`${EXCERPT_ITEM_ID};`));
  const qty = qtyLine ? qtyLine.split(";")[3] : null;
  const qtyNumber = qty ? Number(String(qty).replace(",", ".")) : NaN;
  const visible = html.visibleText(page);
  const localized = Number.isFinite(qtyNumber) ? String(qtyNumber).replace(".", ",") : null;
  const dotted = Number.isFinite(qtyNumber) ? String(qtyNumber) : null;
  const visibleHasQty = Boolean(
    qty &&
      Number.isFinite(qtyNumber) &&
      (visible.includes(qty) ||
        (localized && visible.includes(localized)) ||
        (dotted && visible.includes(dotted))),
  );
  const trail = page.match(/data-trail-quantity="([^"]+)"/);
  const trailNumber = trail ? Number(String(trail[1]).replace(",", ".")) : NaN;
  const trailMatchesSource = Number.isFinite(qtyNumber) && Number.isFinite(trailNumber) && trailNumber === qtyNumber;
  const hasNumber = visibleHasQty && (trailMatchesSource || !trail);
  passFail(
    report,
    {
      id: "Q02.excerpt.numeric",
      campaign: "02",
      owner: "02",
      path: ORCAMENTO_PAGE,
      expected: `visible numeric excerpt containing ${EXCERPT_ITEM_ID} quantity ${qty}`,
      observed: hasNumber ? qty : visible.slice(0, 180),
      severity: SEVERITY.JOURNEY,
    },
    Boolean(hasNumber),
  );
}

export async function checkQ03(report, root) {
  if (!existsInRoot(root, PRONTIDAO_PAGE) || !existsInRoot(root, PRONTIDAO_ENGINE)) {
    record(report, {
      id: "Q03.page",
      campaign: "04",
      owner: "04",
      path: PRONTIDAO_PAGE,
      status: MISSING_DEPENDENCY,
      dependency_level: HARD_AT_RELEASE,
      expected: "prontidão page and engine",
      observed: { page: existsInRoot(root, PRONTIDAO_PAGE), engine: existsInRoot(root, PRONTIDAO_ENGINE) },
    });
    return;
  }
  const page = read(root, PRONTIDAO_PAGE);
  const mapMatch = page.match(/id="pptr-destination-map">([^<]+)</);
  passFail(
    report,
    {
      id: "Q03.map.present",
      campaign: "04",
      owner: "04",
      path: PRONTIDAO_PAGE,
      expected: "published destination map in the real page",
      observed: Boolean(mapMatch),
      severity: SEVERITY.JOURNEY,
    },
    Boolean(mapMatch),
  );
  let map = { by_offer_id: {} };
  if (mapMatch) {
    try {
      map = JSON.parse(mapMatch[1]);
    } catch (err) {
      record(report, {
        id: "Q03.map.parse",
        campaign: "04",
        owner: "04",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: "JSON map",
        observed: String(err && err.message),
      });
      return;
    }
  }
  const engine = loadReadiness(root);
  for (const [role, spec] of Object.entries(REQUIRED_DESTINATIONS)) {
    const resolved = engine.resolveCommercialDestination(
      {
        offer_id: spec.offer_id,
        purchase_id: spec.purchase_id || null,
        route_id: spec.route_id || null,
      },
      map,
    );
    const okPath = resolved.present && resolved.href === spec.path;
    const swapped = spec.not && spec.not.includes(resolved.href);
    passFail(
      report,
      {
        id: `Q03.map.${role}`,
        campaign: "04",
        owner: "04",
        path: PRONTIDAO_PAGE,
        expected: `${role} resolves to ${spec.path} via the published map`,
        observed: resolved,
        severity: SEVERITY.JOURNEY,
      },
      okPath && !swapped,
    );
    if (role === "revisao") {
      passFail(
        report,
        {
          id: "Q03.map.revisao_not_elaboracao",
          campaign: "04",
          owner: "04",
          path: PRONTIDAO_PAGE,
          expected: "revisão is not swapped for elaboração hub",
          observed: resolved.href,
          severity: SEVERITY.JOURNEY,
        },
        Boolean(resolved.href) &&
          resolved.href !== GENERIC_HUB &&
          !String(resolved.href).includes("servico-projeto") &&
          resolved.href === spec.path,
      );
    }
  }
}

function publicLeakHits(pageHtml) {
  const visible = html.visibleText(pageHtml);
  const hits = [];
  if (/\bSELECT\b/.test(visible)) hits.push("SELECT");
  if (/resolved_in_R01/.test(visible)) hits.push("resolved_in_R01");
  if (/aprovad[oa] pelo fundador|aprova[cç][aã]o do fundador/i.test(visible)) hits.push("founder_approval");
  return hits;
}

export async function checkQ04(report, root) {
  for (const rel of PUBLIC_LEAK_PAGES) {
    if (!existsInRoot(root, rel)) continue;
    const page = read(root, rel);
    const hits = publicLeakHits(page);
    passFail(
      report,
      {
        id: `Q04.public.${rel}`,
        campaign: rel.includes("revisao") ? "02" : "04",
        owner: rel.includes("revisao") ? "02" : "04",
        path: rel,
        expected: "no SELECT / resolved_in_R01 / founder-approval labels in public visible copy",
        observed: hits.length ? hits : "clean",
        severity: SEVERITY.EXPOSURE,
      },
      hits.length === 0,
    );
  }
}

export async function checkQ05(report, root) {
  if (!existsInRoot(root, KITS_JSON) || !existsInRoot(root, "parcerias-engenharia/index.html")) {
    record(report, {
      id: "Q05.kits",
      campaign: "05",
      owner: "05",
      path: KITS_JSON,
      status: MISSING_DEPENDENCY,
      dependency_level: HARD_AT_RELEASE,
      expected: "partner kits JSON and page",
      observed: "absent",
    });
    return;
  }
  const kits = JSON.parse(read(root, KITS_JSON));
  const page = read(root, "parcerias-engenharia/index.html");
  for (const kit of kits.kits || []) {
    const expected = KIT_EXPECTED[kit.id];
    if (!expected) continue;
    const dest = kit.destination?.path || "";
    let ok;
    if (expected.path) ok = dest === expected.path;
    else {
      const dedicatedExists = (expected.dedicated || []).some((p) =>
        existsInRoot(root, `${p.replace(/^\//, "").replace(/\/$/, "")}/index.html`),
      );
      const forbidden = (expected.forbidden || []).includes(dest) || dest === GENERIC_HUB;
      ok = dedicatedExists ? !forbidden && expected.dedicated.some((p) => dest === p || dest.startsWith(p)) : dest !== GENERIC_HUB;
    }
    passFail(
      report,
      {
        id: `Q05.kit.${kit.id}`,
        campaign: "05",
        owner: "05",
        path: KITS_JSON,
        expected: expected.path || expected.dedicated,
        observed: dest,
        severity: SEVERITY.JOURNEY,
      },
      ok,
    );
  }
  const noJs = html.extractHrefs(page).some((h) => h.includes("/quantitativos-orcamento-obras/"));
  passFail(
    report,
    {
      id: "Q05.kit.nojs_fallback",
      campaign: "05",
      owner: "05",
      path: "parcerias-engenharia/index.html",
      expected: "no-JS hrefs still point at specific services",
      observed: html.extractHrefs(page).filter((h) => h.startsWith("/")).slice(0, 12),
      severity: SEVERITY.JOURNEY,
    },
    noJs,
  );
}

export async function checkQ06(report, root) {
  try {
  process.env.NODE_ENV = "test";
  delete process.env.NTFY_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.OPS_WEBHOOK_URL;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_REQUIRE_TURNSTILE;
  const storeDir = process.env.LEAD_STORE_DIR;
  if (!storeDir) {
    process.env.LEAD_STORE_DIR = path.join(root, ".pos09-lead-store");
  }
  const { handler, setStoreForTests, MemoryStore, _reset } = loadLead(root);
  const mem = new MemoryStore();
  setStoreForTests(mem);
  _reset();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
  try {
    const res = await handler(
      leadEvent(
        validLead({
          telefone: "48999996101",
          analytics_consent: false,
          cookie_consent: false,
        }),
        "POST",
        { ip: "198.51.100.61" },
      ),
    );
    const body = JSON.parse(res.body);
    const stored = body.lead_id ? await mem.get(body.lead_id) : null;
    const verdict = receiptImpliesPersist(res, stored);
    passFail(
      report,
      {
        id: "Q06.persist_before_receipt",
        campaign: "01",
        owner: "01",
        path: "netlify/functions/lead.cjs",
        expected: "201 only after durable put",
        observed: { status: res.statusCode, claims: verdict.claims, persisted: verdict.persisted },
        severity: SEVERITY.EXPOSURE,
      },
      verdict.claims && verdict.persisted && res.statusCode === 201,
    );
    passFail(
      report,
      {
        id: "Q06.analytics_refusal",
        campaign: "01",
        owner: "01",
        path: "netlify/functions/lead.cjs",
        expected: "analytics_consent false does not block persist",
        observed: { status: res.statusCode, persisted: Boolean(stored) },
        severity: SEVERITY.EXPOSURE,
      },
      res.statusCode === 201 && Boolean(stored),
    );

    const idemStore = new MemoryStore();
    setStoreForTests(idemStore);
    _reset();
    const payload = validLead({
      telefone: "48999996102",
      idempotency_key: "pos09-q06-idem-001",
    });
    const headers = { ip: "198.51.100.62", "Idempotency-Key": "pos09-q06-idem-001" };
    const first = await handler(leadEvent(payload, "POST", headers));
    const second = await handler(leadEvent(payload, "POST", headers));
    const listed = await idemStore.list();
    const dup = retryDuplicated(first, second, listed.length);
    passFail(
      report,
      {
        id: "Q06.idempotency",
        campaign: "01",
        owner: "01",
        path: "netlify/functions/lead.cjs",
        expected: "retry returns same id, no second persist",
        observed: dup,
        severity: SEVERITY.EXPOSURE,
      },
      first.statusCode === 201 && dup.sameId && dup.replay && !dup.duplicated,
    );

    const privateOk = !JSON.stringify(body).includes("analytics_consent") || body.ok === true;
    passFail(
      report,
      {
        id: "Q06.private_context",
        campaign: "01",
        owner: "01",
        path: "netlify/functions/lead.cjs",
        expected: "receipt does not put PII or free text into a public URL",
        observed: { keys: Object.keys(body) },
        severity: SEVERITY.EXPOSURE,
      },
      privateOk && !body.landing_page?.includes("?email="),
    );
    record(report, {
      id: "Q06.no_live_lead",
      campaign: "01",
      owner: "01",
      status: PASS,
      expected: "isolated MemoryStore; no external LIVE lead",
      observed: `store=${process.env.LEAD_STORE_DIR || "MemoryStore"}`,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  } catch (err) {
    record(report, {
      id: "Q06.persist_before_receipt",
      campaign: "01",
      owner: "01",
      path: "netlify/functions/lead.cjs",
      status: FAIL,
      severity: SEVERITY.EXPOSURE,
      expected: "isolated handler run",
      observed: String(err && err.message),
    });
  }
}

export async function checkQ07(report, root) {
  const hubs = [SERVICOS_PAGE, OBRAS_PUBLICAS_PAGE, "casos/index.html", "conteudos/index.html"].filter((rel) =>
    existsInRoot(root, rel),
  );
  const servicos = existsInRoot(root, SERVICOS_PAGE) ? read(root, SERVICOS_PAGE) : "";
  const avaliacaoKept =
    /avalia[cç][aã]o/i.test(html.visibleText(servicos)) &&
    (existsInRoot(root, PERICIA_PAGE) || existsInRoot(root, INSPECAO_PAGE));
  passFail(
    report,
    {
      id: "Q07.hub.avaliacao",
      campaign: "07",
      owner: "07",
      path: SERVICOS_PAGE,
      expected: "hubs keep evaluation / perícia paths",
      observed: { avaliacaoKept, pericia: existsInRoot(root, PERICIA_PAGE), inspecao: existsInRoot(root, INSPECAO_PAGE) },
      severity: SEVERITY.JOURNEY,
    },
    avaliacaoKept,
  );
  const obras = existsInRoot(root, OBRAS_PUBLICAS_PAGE);
  const servicosLinksPublic = /servicos-obras-publicas/.test(servicos);
  passFail(
    report,
    {
      id: "Q07.hub.obras_publicas",
      campaign: "07",
      owner: "07",
      path: OBRAS_PUBLICAS_PAGE,
      expected: "public-works hub remains reachable",
      observed: { obras, servicosLinksPublic },
      severity: SEVERITY.JOURNEY,
    },
    obras && servicosLinksPublic,
  );
  if (existsInRoot(root, "robots.txt")) {
    const robots = read(root, "robots.txt");
    const blocksPublic =
      /Disallow:\s*\/servicos-obras-publicas/i.test(robots) || /Disallow:\s*\/servicos\//i.test(robots);
    passFail(
      report,
      {
        id: "Q07.robots",
        campaign: "07",
        owner: "10",
        path: "robots.txt",
        expected: "robots does not contradict publication of hubs",
        observed: blocksPublic ? "disallow on public hubs" : "ok",
        severity: SEVERITY.JOURNEY,
      },
      !blocksPublic,
    );
  }
  if (existsInRoot(root, "sitemap.xml")) {
    const sitemap = read(root, "sitemap.xml");
    passFail(
      report,
      {
        id: "Q07.sitemap",
        campaign: "07",
        owner: "10",
        path: "sitemap.xml",
        expected: "sitemap lists public-works and services hubs",
        observed: {
          servicos: sitemap.includes("/servicos/"),
          obras: sitemap.includes("/servicos-obras-publicas/"),
        },
        severity: SEVERITY.JOURNEY,
      },
      sitemap.includes("/servicos/") && sitemap.includes("/servicos-obras-publicas/"),
    );
  }
  for (const rel of hubs) {
    const page = read(root, rel);
    const canonical = html.canonicalOf(page);
    const route = rel === "index.html" ? "/" : `/${rel.replace(/index\.html$/, "")}`;
    const expected = `https://confenge.com.br${route}`;
    const ok = !canonical || canonical.replace(/\/$/, "") === expected.replace(/\/$/, "");
    passFail(
      report,
      {
        id: `Q07.canonical.${rel}`,
        campaign: "07",
        owner: "10",
        path: rel,
        expected,
        observed: canonical,
        severity: SEVERITY.JOURNEY,
      },
      ok,
    );
  }
}

export async function checkQ08(report, root) {
  const infraPage = "casos/demonstrativo-infraestrutura/index.html";
  const included = existsInRoot(root, infraPage);
  if (included) {
    const page = read(root, infraPage);
    const complete = html.h1Of(page) && html.extractHrefs(page).length > 0;
    passFail(
      report,
      {
        id: "Q08.complete",
        campaign: "08",
        owner: "08",
        path: infraPage,
        expected: "new infrastructure demonstrativo is complete when included",
        observed: complete,
        severity: SEVERITY.JOURNEY,
      },
      complete,
    );
    return;
  }
  const scan = [
    SERVICOS_PAGE,
    OBRAS_PUBLICAS_PAGE,
    "casos/index.html",
    "index.html",
    ORCAMENTO_PAGE,
    "parcerias-engenharia/index.html",
  ].filter((rel) => existsInRoot(root, rel));
  const leaks = [];
  for (const rel of scan) {
    const page = read(root, rel);
    for (const hint of INFRA_DEMONSTRATIVO_HINTS) {
      if (page.includes(hint)) leaks.push(`${rel}:${hint}`);
    }
  }
  passFail(
    report,
    {
      id: "Q08.omitted_no_public_promise",
      campaign: "08",
      owner: "08",
      expected: "omitted demonstrativo 08 has zero public promises or links",
      observed: leaks.length ? leaks : "no public reference",
      severity: SEVERITY.JOURNEY,
    },
    leaks.length === 0,
  );
}

export async function checkBrowser(report, root, visual) {
  if (!visual || visual.status === "NOT_RUN") {
    record(report, {
      id: "browser.360_390_desktop",
      campaign: "09",
      owner: "09",
      status: NOT_RUN,
      expected: "Chrome at 360, 390 and desktop on priority pages",
      observed: visual || { reason: "runner_not_invoked" },
    });
    return;
  }
  passFail(
    report,
    {
      id: "browser.360_390_desktop",
      campaign: "09",
      owner: "09",
      expected: "no page errors; filled surface at 360/390/desktop",
      observed: visual,
      severity: SEVERITY.JOURNEY,
    },
    visual.status === "pass",
  );
}

export async function checkGscExternal(report) {
  record(report, {
    id: "gsc.live.external",
    campaign: "06",
    owner: "06",
    status: NOT_VERIFIED,
    dependency_level: EXTERNAL_EVIDENCE,
    expected: "live GSC is NOT_VERIFIED",
    observed: "no live Search Console in this suite",
  });
}

export async function runAllChecks(report, root, options = {}) {
  const port = options.httpPort || Number(process.env.POS09_HTTP_PORT || 18091);
  await checkQ01(report, root, { port });
  await checkQ02(report, root);
  await checkQ03(report, root);
  await checkQ04(report, root);
  await checkQ05(report, root);
  await checkQ06(report, root);
  await checkQ07(report, root);
  await checkQ08(report, root);
  await checkGscExternal(report);
  await checkBrowser(report, root, options.visual);
}
