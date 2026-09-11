/**
 * Purchase-path and negative checks. Each function drives shipped units or
 * candidate HTML; none reimplements lead/analytics/family matching.
 */
import fs from "node:fs";
import path from "node:path";
import { FAIL, MISSING_DEPENDENCY, PASS, SEVERITY, existsInRoot, record, routeToFile } from "./lib/harness.mjs";
import * as html from "./lib/html.mjs";
import {
  familyMembership,
  leadEvent,
  loadCollect,
  loadConfengeTrack,
  loadEventContract,
  loadLead,
  loadPersistOrder,
  loadProofRegistry,
  loadReadiness,
  validLead,
} from "./lib/shipped.mjs";
import {
  CORE_CAMPAIGNS,
  CORE_IDS,
  EXPANSION_CAMPAIGNS,
  OWNED_TREES,
  PURCHASE_PATHS,
} from "./matrix.mjs";

export function receiptImpliesPersist(res, storeHadRecord) {
  const body = typeof res.body === "string" ? JSON.parse(res.body) : res.body || {};
  const claims =
    body.ok === true &&
    (res.statusCode === 201 || res.statusCode === 200) &&
    body.status !== "suppressed";
  return { claims, persisted: Boolean(storeHadRecord), body, statusCode: res.statusCode };
}

export function retryDuplicated(first, second, storeCount) {
  const b1 = typeof first.body === "string" ? JSON.parse(first.body) : first.body || {};
  const b2 = typeof second.body === "string" ? JSON.parse(second.body) : second.body || {};
  const sameId = Boolean(b1.lead_id && b1.lead_id === b2.lead_id);
  const replay = second.statusCode === 200 && b2.idempotent === true;
  const duplicated = storeCount > 1 || Boolean(b1.lead_id && b2.lead_id && b1.lead_id !== b2.lead_id);
  return { sameId, replay, storeCount, duplicated, firstId: b1.lead_id, secondId: b2.lead_id };
}

export async function checkPersistBeforeReceipt(report, root) {
  process.env.NODE_ENV = "test";
  delete process.env.NTFY_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.OPS_WEBHOOK_URL;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_REQUIRE_TURNSTILE;
  const { handler, setStoreForTests, MemoryStore, _reset } = loadLead(root);
  const persistOrder = loadPersistOrder(root);
  const mem = new MemoryStore();
  setStoreForTests(mem);
  _reset();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
  try {
    const res = await handler(leadEvent(validLead({ telefone: "48999991101" }), "POST", { ip: "198.51.100.11" }));
    const stored = res.body && JSON.parse(res.body).lead_id
      ? await mem.get(JSON.parse(res.body).lead_id)
      : null;
    const verdict = receiptImpliesPersist(res, stored);
    if (!verdict.claims || !verdict.persisted || res.statusCode !== 201) {
      record(report, {
        id: "persist_before_receipt.shipped_lead",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        steps: ["POST /lead with consent", "read MemoryStore", "compare 201 vs store"],
        expected: "201 only after durable put",
        observed: { status: res.statusCode, claims: verdict.claims, persisted: verdict.persisted },
        impact: "recibo público sem persistência",
      });
    } else {
      record(report, {
        id: "persist_before_receipt.shipped_lead",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: PASS,
        detail: `lead_id=${verdict.body.lead_id}`,
      });
    }

    const failing = new MemoryStore();
    failing.put = async () => {
      throw new Error("forced_persist_failure");
    };
    setStoreForTests(failing);
    _reset();
    const failed = await handler(leadEvent(validLead({ telefone: "48999991102" }), "POST", { ip: "198.51.100.12" }));
    const failedBody = JSON.parse(failed.body);
    if (failedBody.ok === true || failed.statusCode === 201) {
      record(report, {
        id: "persist_before_receipt.put_failure_no_receipt",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        expected: "no 201 when put throws",
        observed: { status: failed.statusCode, body: failedBody },
        impact: "recibo antes de persistir",
      });
    } else {
      record(report, {
        id: "persist_before_receipt.put_failure_no_receipt",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: PASS,
        detail: `status=${failed.statusCode}`,
      });
    }

    const trace = persistOrder.createTrace();
    persistOrder.recordStep(trace, persistOrder.STEPS.VALIDATED);
    persistOrder.recordStep(trace, persistOrder.STEPS.HANDOFF_ATTEMPTED);
    const inverted = persistOrder.persistBeforeHandoff(trace);
    if (inverted !== false) {
      record(report, {
        id: "persist_before_receipt.trace_helper_detects_inversion",
        campaign: "02",
        owner: "02",
        path: "scripts/conversion/persist-order.cjs",
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        expected: "persistBeforeHandoff false when handoff precedes persist",
        observed: inverted,
      });
    } else {
      persistOrder.recordStep(trace, persistOrder.STEPS.PERSISTED);
      record(report, {
        id: "persist_before_receipt.trace_helper_detects_inversion",
        campaign: "02",
        owner: "02",
        path: "scripts/conversion/persist-order.cjs",
        status: persistOrder.persistBeforeHandoff(trace) ? FAIL : PASS,
        detail: "handoff-before-persist returns false",
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function checkDuplicateRetry(report, root) {
  process.env.NODE_ENV = "test";
  delete process.env.NTFY_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_REQUIRE_TURNSTILE;
  process.env.OPS_WEBHOOK_URL = "https://ops.example.test/hook";
  process.env.OPS_WEBHOOK_ALLOWED_HOSTS = "ops.example.test";
  const { handler, setStoreForTests, MemoryStore, _reset } = loadLead(root);
  const mem = new MemoryStore();
  setStoreForTests(mem);
  _reset();

  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    if (fetches === 1) {
      const err = new Error("timeout");
      err.name = "AbortError";
      throw err;
    }
    return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) };
  };
  try {
    const payload = validLead({
      nome: "Maria Construtora Norte",
      telefone: "48999993301",
      idempotency_key: "inb15-retry-timeout-001",
    });
    const headers = { ip: "198.51.100.31", "Idempotency-Key": "inb15-retry-timeout-001" };
    const first = await handler(leadEvent(payload, "POST", headers));
    const second = await handler(leadEvent(payload, "POST", headers));
    const listed = await mem.list();
    const verdict = retryDuplicated(first, second, listed.length);
    const firstOk = first.statusCode === 201 && verdict.firstId;
    const timeoutThenRetry = fetches >= 1;
    if (!firstOk || verdict.duplicated || !verdict.sameId || !verdict.replay || !timeoutThenRetry) {
      record(report, {
        id: "duplicate_retry.shipped_lead",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        steps: [
          "POST lead with Idempotency-Key (delivery fetch times out)",
          "POST same key again",
          "count MemoryStore records",
        ],
        expected: "first 201, retry 200 idempotent, one durable record",
        observed: {
          first: first.statusCode,
          second: second.statusCode,
          ...verdict,
          fetches,
        },
        impact: "erro/timeout/retry duplicado",
      });
    } else {
      record(report, {
        id: "duplicate_retry.shipped_lead",
        campaign: "02",
        owner: "02",
        path: "netlify/functions/lead.cjs",
        status: PASS,
        detail: `lead_id=${verdict.firstId} store=${verdict.storeCount} fetches=${fetches}`,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPS_WEBHOOK_URL;
    delete process.env.OPS_WEBHOOK_ALLOWED_HOSTS;
  }
}

export function piiHitsInProps(contract, props) {
  const hits = [];
  for (const [key, value] of Object.entries(props || {})) {
    if (contract.keyLooksPii(key) || contract.looksLikePiiValue(value, key)) hits.push(key);
  }
  return hits;
}

export async function checkPiiInEvent(report, root) {
  const contract = loadEventContract(root);
  const admitted = contract.admitEvent({
    event: "cta_click",
    props: {
      page_path: "/quantitativos-orcamento-obras/",
      cta_label: "ok",
      email: "should-not@pass.example",
      telefone: "+5548999990000",
      nome: "Pessoa Real",
      mensagem: "texto livre com telefone 48999990000",
    },
  });
  const props = (admitted.event && admitted.event.props) || admitted.props || {};
  const hits = piiHitsInProps(contract, props);
  if (hits.length) {
    record(report, {
      id: "pii_in_event.admitEvent",
      campaign: "02",
      owner: "02",
      path: "netlify/functions/lib/event-contract.cjs",
      status: FAIL,
      severity: SEVERITY.EXPOSURE,
      expected: "PII keys dropped by shipped admitEvent",
      observed: hits,
      impact: "dado pessoal em evento",
    });
  } else {
    record(report, {
      id: "pii_in_event.admitEvent",
      campaign: "02",
      owner: "02",
      path: "netlify/functions/lib/event-contract.cjs",
      status: PASS,
      detail: admitted.ok === false ? `rejected:${admitted.reason}` : "scrubbed",
    });
  }

  const { track, dataLayer } = loadConfengeTrack(root);
  track("whatsapp_click", {
    page_path: "/x",
    cta_label: "ok",
    email: "leak@confenge.com.br",
    phone: "+5548999999999",
  });
  const last = dataLayer[dataLayer.length - 1] || {};
  if (last.email || last.phone) {
    record(report, {
      id: "pii_in_event.confengeTrack",
      campaign: "02",
      owner: "02",
      path: "script.js",
      status: FAIL,
      severity: SEVERITY.EXPOSURE,
      expected: "track() must not push email/phone",
      observed: last,
    });
  } else {
    record(report, {
      id: "pii_in_event.confengeTrack",
      campaign: "02",
      owner: "02",
      path: "script.js",
      status: PASS,
    });
  }

  process.env.NODE_ENV = "test";
  const collect = loadCollect(root);
  const collected = await collect.handler({
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br", "content-type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          event: "page_view",
          props: { page_path: "/", email: "analytics@example.com", nome: "Visitante" },
        },
      ],
    }),
  });
  const cbody = JSON.parse(collected.body || "{}");
  const leak = JSON.stringify(cbody).includes("analytics@example.com") || JSON.stringify(cbody).includes("Visitante");
  record(report, {
    id: "pii_in_event.collect_handler",
    campaign: "02",
    owner: "02",
    path: "netlify/functions/collect.cjs",
    status: leak ? FAIL : PASS,
    severity: leak ? SEVERITY.EXPOSURE : null,
    expected: "collector response and admission without raw PII",
    observed: { status: collected.statusCode, leak },
  });
}

export function unknownTreatedAsDefect(result) {
  if (!result || !Array.isArray(result.domains)) return true;
  const unknownAnswers = Object.values(result.answers || {}).every((v) => v === "UNKNOWN");
  if (!unknownAnswers) return false;
  return result.domains.some((d) => d.status === "GAP") || result.status === "GAP";
}

export async function checkUnknownAsDefect(report, root) {
  const E = loadReadiness(root);
  const empty = E.emptyAnswers();
  const result = E.diagnosePrivateProjectTechnicalReadiness(empty);
  const treated = unknownTreatedAsDefect(result);
  record(report, {
    id: "unknown_as_defect.readiness",
    campaign: "07",
    owner: "07",
    path: "assets/js/private-project-technical-readiness.cjs",
    status: treated ? FAIL : PASS,
    severity: treated ? SEVERITY.JOURNEY : null,
    expected: "all-UNKNOWN answers stay UNKNOWN, not GAP",
    observed: {
      unknown_count: result.unknown_count,
      gap_count: result.gap_count,
      statuses: result.domains.map((d) => d.status),
    },
    impact: treated ? "desconhecido interpretado como defeito" : null,
  });

  const event = E.buildAnalyticsEvent(result);
  const contract = loadEventContract(root);
  const hits = piiHitsInProps(contract, event);
  record(report, {
    id: "unknown_as_defect.readiness_analytics_keys",
    campaign: "07",
    owner: "07",
    path: "assets/js/private-project-technical-readiness.cjs",
    status: hits.length ? FAIL : PASS,
    severity: hits.length ? SEVERITY.EXPOSURE : null,
    expected: "tool analytics without PII",
    observed: { keys: Object.keys(event || {}), hits },
  });
}

export async function checkFamilyAndIndex(report, root, includedCampaigns) {
  const routes = [...new Set(PURCHASE_PATHS.flatMap((p) => p.routes))];
  const fam = familyMembership(root, routes);
  if (!fam.ok) {
    record(report, {
      id: "family_membership.python",
      campaign: "16",
      owner: "16",
      path: "scripts/site/inbound_gates.py",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "shipped inbound_gates family match",
      observed: fam.error,
    });
    return;
  }
  record(report, {
    id: "family_membership.python",
    campaign: "16",
    owner: "16",
    path: "scripts/site/inbound_gates.py",
    status: PASS,
    detail: `undeclared=${(fam.undeclared_indexable || []).length}`,
  });

  for (const row of fam.matches || []) {
    const pathId = `family_membership.route:${row.route}`;
    if (!row.exists) {
      const journey = PURCHASE_PATHS.find((p) => p.routes.includes(row.route));
      record(report, {
        id: pathId,
        campaign: journey?.core || null,
        owner: journey?.core || "16",
        url: row.route,
        path: row.file,
        status: MISSING_DEPENDENCY,
        expected: "HTML for declared journey route",
        observed: "file absent on examined tree",
        impact: "MISSING_DEPENDENCY of producer page, not a hidden PASS",
      });
      continue;
    }
    if (row.indexable && !row.family_id) {
      record(report, {
        id: pathId,
        campaign: "16",
        owner: "16",
        url: row.route,
        path: row.file,
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: "indexable route belongs to public-family-registry",
        observed: "no family",
        impact: "rota sem família",
      });
      continue;
    }
    record(report, {
      id: pathId,
      campaign: "16",
      owner: "16",
      url: row.route,
      path: row.file,
      status: PASS,
      detail: `family=${row.family_id} indexable=${row.indexable}`,
    });
  }

  for (const row of fam.undeclared_indexable || []) {
    record(report, {
      id: `family_membership.undeclared:${row.route}`,
      campaign: "16",
      owner: "16",
      url: row.route,
      path: row.file,
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "every indexable visitor route declared in family registry",
      observed: "undeclared",
      impact: "rota sem família",
    });
  }

  for (const id of CORE_IDS) {
    if (includedCampaigns && includedCampaigns.length && !includedCampaigns.includes(id)) {
      record(report, {
        id: `core_manifest.omission:${id}`,
        campaign: "16",
        owner: "16",
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: "CORE 01-10 remain in the matrix",
        observed: `manifest omitted ${id}`,
        impact: "integrador apagou rota/campanha CORE para esconder falha",
      });
    }
  }
}

export async function checkJourneys(report, root) {
  for (const journey of PURCHASE_PATHS) {
    const files = journey.files.filter((rel) => existsInRoot(root, rel));
    if (!files.length) {
      record(report, {
        id: `journey.${journey.id}`,
        campaign: journey.core,
        owner: journey.core,
        url: journey.routes[0],
        status: MISSING_DEPENDENCY,
        expected: `HTML for ${journey.label}`,
        observed: "no candidate file",
      });
      continue;
    }
    const pages = files.map((rel) => ({
      rel,
      html: fs.readFileSync(path.join(root, rel), "utf8"),
    }));
    const combined = pages.map((p) => p.html).join("\n");
    const text = html.visibleText(combined);
    const problems = [];

    for (const needle of journey.must_mention || []) {
      if (!new RegExp(needle, "i").test(text)) problems.push(`missing_delivery_language:${needle}`);
    }
    if (journey.private_not_licitacao && !/privad/i.test(text)) {
      problems.push("private_demand_not_named");
    }
    if (journey.distinguish_purchase) {
      const hasRevisao = /revis/i.test(text);
      const hasCompat = /compatibiliz/i.test(text);
      if (!(hasRevisao && hasCompat)) problems.push("revisao_compatibilizacao_not_distinguished");
    }
    if (journey.sample_then_contact) {
      const sample = pages.find((p) => p.rel.includes("casos/"));
      const contact = pages.find((p) => p.rel.includes("triagem"));
      if (sample && html.labelsSampleAsClient(sample.html)) problems.push("sample_labeled_real_client");
      if (sample && !html.hasCalculationIds(sample.html)) problems.push("sample_without_calculation_ids");
      if (sample && contact) {
        const hrefs = html.extractHrefs(sample.html);
        if (!hrefs.some((h) => h.includes("/triagem-tecnica/"))) problems.push("sample_missing_contact_link");
      }
    }
    if (journey.no_contact_required) {
      const page = pages[0];
      if (!/sem informar contato|sem enviar documentos|nada é enviado/i.test(html.visibleText(page.html))) {
        problems.push("tool_does_not_state_no_contact");
      }
      if (html.hasLeadForm(page.html)) problems.push("tool_requires_contact_form");
    }
    if (journey.needs_context_location && !html.incompleteContextAccepted(combined) && !/Brasil|local|confirma/i.test(text)) {
      problems.push("unconfirmed_location_not_accepted");
    }
    if (journey.secret_material) {
      if (!/n[aã]o envie|sigil|conflito|canal seguro/i.test(text)) problems.push("secret_material_not_gated");
    }
    if (journey.undefined_document) {
      if (!/documento|PGR|LTCAT|ainda/i.test(text)) problems.push("sst_undefined_document_not_framed");
    }
    if (journey.dedicated_missing_ok) {
      const dedicated = ["projetos-complementares/index.html", "complementares/index.html"];
      if (!dedicated.some((rel) => existsInRoot(root, rel))) {
        record(report, {
          id: `journey.${journey.id}.dedicated_route`,
          campaign: journey.core,
          owner: journey.core,
          url: "/projetos-complementares/",
          status: MISSING_DEPENDENCY,
          expected: "dedicated complementary route from producer 12",
          observed: "hub + triage only on examined tree",
        });
      }
    }
    if (html.requiredCnpj(combined)) problems.push("cnpj_required_blocks_incomplete_context");
    if (html.utmOnInternal(combined).length) problems.push("internal_utm");
    if (html.claimsReceipt(combined) && !html.hasLeadForm(combined)) {
      problems.push("whatsapp_or_copy_claimed_as_receipt");
    }
    if (journey.preserve_b2g) {
      for (const page of pages) {
        const route = `/${page.rel.replace(/index\.html$/, "")}`;
        const verdict = html.b2gPublicPreserved(page.html, route);
        if (verdict.cannibalized) {
          problems.push(
            `b2g_cannibalized:${page.rel}:specialty=${verdict.specialty}:rewrite=${verdict.privateRewrite}:canonicalDrift=${verdict.canonicalDrift}:noindex=${verdict.noindex}`,
          );
        }
      }
    }

    for (const page of pages) {
      if (!html.hasSkipLink(page.html)) problems.push(`no_skip_link:${page.rel}`);
      if (!html.hasViewport(page.html)) problems.push(`no_viewport:${page.rel}`);
      if (!html.h1Of(page.html)) problems.push(`no_h1:${page.rel}`);
      const lang = html.langOf(page.html);
      if (lang && !/^pt/i.test(lang)) problems.push(`lang:${lang}`);
      const canonical = html.canonicalOf(page.html);
      if (canonical && !canonical.startsWith("https://confenge.com.br/")) {
        problems.push(`canonical_host:${canonical}`);
      }
      const wantIndex = journey.requested_indexability === "index";
      if (wantIndex && html.isNoindex(page.html) && journey.routes.includes(`/${page.rel.replace(/index\.html$/, "")}`)) {
        // tool is noindex by contract; only flag when the journey asked for index on that file
        if (journey.requested_indexability === "index" && !page.rel.includes("ferramentas/prontidao")) {
          /* checked per-file below via family python */
        }
      }
      for (const href of html.requiredCtaHrefs(page.html)) {
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.includes("wa.me")) continue;
        if (href.startsWith("http") && !href.startsWith("https://confenge.com.br/")) continue;
        const dest = href.replace("https://confenge.com.br", "");
        const destFile = routeToFile(dest.split("#")[0].split("?")[0] || "/");
        if (dest.startsWith("/") && !existsInRoot(root, destFile) && !existsInRoot(root, dest.replace(/^\//, ""))) {
          problems.push(`broken_required_link:${href}`);
        }
      }
    }

    const status = problems.length ? FAIL : PASS;
    record(report, {
      id: `journey.${journey.id}`,
      campaign: journey.core,
      owner: journey.core,
      url: journey.routes[0],
      path: files[0],
      status,
      severity: status === FAIL ? SEVERITY.JOURNEY : null,
      expected: `entrega, prova, links, contexto, recebimento honesto for ${journey.label}`,
      observed: problems.length ? problems : "surface matches contracts on examined files",
      impact: problems.length ? problems.join("; ") : null,
      steps: files.map((f) => `read ${f}`),
    });
  }
}

export async function checkPublishedTestDataAndProof(report, root) {
  const proof = await loadProofRegistry(root);
  const config = proof.loadAuditConfig(root);
  const registry = proof.loadCanonicalRegistry(root);
  const pages = proof.readPublicPages(root, config);
  const live = proof.evaluateProofGate({ config, registry, pages });
  record(report, {
    id: "proof_gate.shipped",
    campaign: "06",
    owner: "06",
    path: "scripts/commercial/real_proof_registry.mjs",
    status: live.length ? FAIL : PASS,
    severity: live.length ? SEVERITY.EXPOSURE : null,
    expected: "permissioned proof gate clean",
    observed: live.slice(0, 8),
    impact: live.length ? "amostra/cliente/prova inconsistente" : null,
  });

  const demo = path.join(root, "casos/medicao-glosa-demonstrativo/index.html");
  if (fs.existsSync(demo)) {
    const page = fs.readFileSync(demo, "utf8");
    const asClient = html.labelsSampleAsClient(page);
    const ids = html.hasCalculationIds(page);
    record(report, {
      id: "sample.not_client_and_has_ids",
      campaign: "06",
      owner: "06",
      path: "casos/medicao-glosa-demonstrativo/index.html",
      url: "/casos/medicao-glosa-demonstrativo/",
      status: asClient || !ids ? FAIL : PASS,
      severity: asClient || !ids ? SEVERITY.EXPOSURE : null,
      expected: "demonstrativo labeled as such, with calculation IDs",
      observed: { asClient, ids },
    });
  } else {
    record(report, {
      id: "sample.not_client_and_has_ids",
      campaign: "06",
      owner: "06",
      status: MISSING_DEPENDENCY,
      expected: "demonstrativo page",
      observed: "absent",
    });
  }

  let testHits = 0;
  for (const [rel, pageHtml] of pages.entries()) {
    if (rel.startsWith("docs/") || rel.startsWith("tests/") || rel.startsWith("scripts/")) continue;
    const hits = html.publishedTestDataHits(pageHtml);
    if (hits.length) {
      testHits += 1;
      record(report, {
        id: `published_test_data:${rel}`,
        campaign: "16",
        owner: "16",
        path: rel,
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        expected: "no fixture/test markers on public HTML",
        observed: hits,
        impact: "dado de teste publicado",
      });
    }
  }
  if (!testHits) {
    record(report, {
      id: "published_test_data.public_html",
      campaign: "16",
      owner: "16",
      status: PASS,
      detail: `scanned=${pages.size}`,
    });
  }
}

export async function checkWhatsappNotConversation(report, root) {
  const files = [
    "quantitativos-orcamento-obras/index.html",
    "triagem-tecnica/index.html",
    "medicoes-glosas-obras-publicas/index.html",
  ];
  for (const rel of files) {
    if (!existsInRoot(root, rel)) {
      record(report, {
        id: `whatsapp_not_conversation:${rel}`,
        campaign: "02",
        owner: "02",
        path: rel,
        status: MISSING_DEPENDENCY,
        expected: "page exists",
        observed: "absent",
      });
      continue;
    }
    const page = fs.readFileSync(path.join(root, rel), "utf8");
    const wa = html.hasWhatsapp(page);
    const claims = html.claimsReceipt(page);
    const form = html.hasLeadForm(page);
    const fallback = /data-fallback-channel=["']whatsapp["']/i.test(page) || html.hasMailto(page);
    const bad = claims && wa && !form;
    record(report, {
      id: `whatsapp_not_conversation:${rel}`,
      campaign: "02",
      owner: "02",
      path: rel,
      status: bad ? FAIL : PASS,
      severity: bad ? SEVERITY.EXPOSURE : null,
      expected: "WhatsApp is a channel, not a persisted conversation/recibo",
      observed: { wa, claims, form, fallback },
    });
  }
}

export async function checkBrokenLinksAndCanonical(report, root) {
  const files = [...new Set(PURCHASE_PATHS.flatMap((p) => p.files))];
  for (const rel of files) {
    if (!existsInRoot(root, rel)) continue;
    const page = fs.readFileSync(path.join(root, rel), "utf8");
    const route = rel === "index.html" ? "/" : `/${rel.replace(/index\.html$/, "")}`;
    const canonical = html.canonicalOf(page);
    const expectedCanon = `https://confenge.com.br${route}`;
    if (canonical && canonical.replace(/\/$/, "") !== expectedCanon.replace(/\/$/, "")) {
      record(report, {
        id: `canonical.mismatch:${rel}`,
        campaign: "16",
        owner: "16",
        path: rel,
        url: route,
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: expectedCanon,
        observed: canonical,
        impact: "canonical indevido",
      });
    } else {
      record(report, {
        id: `canonical.match:${rel}`,
        campaign: "16",
        owner: "16",
        path: rel,
        status: PASS,
        detail: canonical || "missing_canonical",
      });
    }
    if (html.isNoindex(page) && !rel.includes("ferramentas/prontidao-tecnica-obra-privada")) {
      const journey = PURCHASE_PATHS.find((p) => p.files.includes(rel) && p.requested_indexability === "index");
      if (journey) {
        record(report, {
          id: `noindex.unexpected:${rel}`,
          campaign: journey.core,
          owner: journey.core,
          path: rel,
          status: FAIL,
          severity: SEVERITY.JOURNEY,
          expected: "index,follow for this purchase path",
          observed: html.robotsOf(page),
          impact: "noindex indevido",
        });
      }
    }
    if (rel.includes("ferramentas/prontidao-tecnica-obra-privada") && !html.isNoindex(page)) {
      record(report, {
        id: "noindex.tool_should_stay_noindex",
        campaign: "07",
        owner: "07",
        path: rel,
        status: FAIL,
        severity: SEVERITY.JOURNEY,
        expected: "tool remains noindex,follow",
        observed: html.robotsOf(page),
      });
    }
  }
}

export async function checkExpansionLeaks(report, root, included) {
  const includedSet = new Set(included || []);
  const scanFiles = [
    "index.html",
    "servicos/index.html",
    "servicos-obras-publicas/index.html",
    "triagem-tecnica/index.html",
    "quantitativos-orcamento-obras/index.html",
  ];
  for (const expansion of EXPANSION_CAMPAIGNS) {
    const present =
      includedSet.has(expansion.id) ||
      expansion.expected_producer_artifacts.some((p) => existsInRoot(root, p));
    if (present) {
      record(report, {
        id: `expansion.included:${expansion.id}`,
        campaign: expansion.id,
        owner: expansion.id,
        status: PASS,
        detail: "included in examined candidate",
      });
      continue;
    }
    let leaked = [];
    for (const rel of scanFiles) {
      if (!existsInRoot(root, rel)) continue;
      const page = fs.readFileSync(path.join(root, rel), "utf8");
      for (const needle of expansion.leak_href_needles || []) {
        if (page.includes(`href="${needle}`) || page.includes(`href='${needle}`)) leaked.push(`${rel}:${needle}`);
      }
    }
    record(report, {
      id: `expansion.omitted_no_leak:${expansion.id}`,
      campaign: expansion.id,
      owner: expansion.id,
      status: leaked.length ? FAIL : PASS,
      severity: leaked.length ? SEVERITY.JOURNEY : null,
      expected: "omitted expansion does not leak hrefs/promises on CORE pages",
      observed: leaked.length ? leaked : "no leak needles on CORE hubs",
      impact: leaked.length ? "expansão omitida vazou link" : null,
    });
  }
}

export async function checkOwnershipReceipt(report, root) {
  const { git } = await import("./lib/harness.mjs");
  let names = [];
  try {
    names = git(root, ["diff", "--name-only", "origin/main"]).split("\n").filter(Boolean);
  } catch {
    names = git(root, ["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  }
  const extras = names.filter((n) => !OWNED_TREES.some((prefix) => n.startsWith(prefix)));
  if (extras.length) {
    record(report, {
      id: "ownership.changed_outside_owned_trees",
      campaign: "15",
      owner: "15",
      status: FAIL,
      severity: SEVERITY.JOURNEY,
      expected: "only tests/campaigns/inb_20260911/15 and docs/campaigns/inb-20260911/15",
      observed: extras,
      impact: "arquivo fora da posse omitido do recibo",
    });
  } else {
    record(report, {
      id: "ownership.changed_outside_owned_trees",
      campaign: "15",
      owner: "15",
      status: PASS,
      detail: `owned_diff=${names.length}`,
    });
  }
}

export async function checkStructural(report, root) {
  const files = [...new Set(PURCHASE_PATHS.flatMap((p) => p.files))].filter((rel) => existsInRoot(root, rel));
  for (const rel of files) {
    const page = fs.readFileSync(path.join(root, rel), "utf8");
    const issues = [];
    if (!html.hasViewport(page)) issues.push("viewport");
    if (!html.hasSkipLink(page)) issues.push("skip-link");
    if (!/<main\b/i.test(page)) issues.push("main");
    const jsOnlyPrimary =
      /Ative o JavaScript/i.test(page) ||
      /<form\b[^>]*action=["']#["'][\s\S]*?\bdisabled\b/i.test(page);
    if (jsOnlyPrimary && !html.noscriptHonesty(page)) issues.push("nojs-fallback");
    const media = /@media\s*\((?:max|min)-width:\s*(?:360|390|400|480|640|800)/.test(page) || rel.includes("styles");
    record(report, {
      id: `structural:${rel}`,
      campaign: "15",
      owner: "15",
      path: rel,
      status: issues.length ? FAIL : PASS,
      severity: issues.length ? SEVERITY.JOURNEY : null,
      expected: "viewport, skip-link, main, honest no-JS on examined HTML",
      observed: issues.length ? issues : { viewport: true, skip: true, media_query_inline: media },
    });
  }
}

export async function checkCampaignPrivateContent(report, root) {
  const forbidden = [
    "docs/campaigns/inb-20260911/15/handoff.json",
    "tests/campaigns/inb_20260911/15/fixtures/adversarial/published-test-data.html",
  ];
  const sitemap = existsInRoot(root, "sitemap.xml")
    ? fs.readFileSync(path.join(root, "sitemap.xml"), "utf8")
    : "";
  for (const rel of forbidden) {
    if (sitemap.includes(rel) || sitemap.includes(rel.replace(/\.json$/, ""))) {
      record(report, {
        id: `private_campaign_published:${rel}`,
        campaign: "15",
        owner: "15",
        path: rel,
        status: FAIL,
        severity: SEVERITY.EXPOSURE,
        expected: "campaign private files stay out of public sitemap",
        observed: "sitemap hit",
      });
    }
  }
  record(report, {
    id: "private_campaign_published.sitemap",
    campaign: "15",
    owner: "15",
    status: PASS,
    detail: "handoff/fixtures not listed in sitemap.xml",
  });
}

export async function checkCoreCampaigns(report, root) {
  for (const campaign of CORE_CAMPAIGNS) {
    const producerHandoff = campaign.expected_producer_artifacts.find((p) => p.endsWith("handoff.json"));
    const hasHandoff = producerHandoff && existsInRoot(root, producerHandoff);
    const baselinePresent = campaign.baseline_sources.every((p) => existsInRoot(root, p));
    if (!hasHandoff) {
      record(report, {
        id: `core.producer_handoff:${campaign.id}`,
        campaign: campaign.id,
        owner: campaign.id,
        path: producerHandoff,
        status: MISSING_DEPENDENCY,
        expected: "producer handoff.json on examined tree",
        observed: "absent",
        impact: "MISSING_DEPENDENCY; does not grant complete-candidate pass",
      });
    } else {
      record(report, {
        id: `core.producer_handoff:${campaign.id}`,
        campaign: campaign.id,
        owner: campaign.id,
        path: producerHandoff,
        status: PASS,
      });
    }
    if (campaign.baseline_sources.length) {
      record(report, {
        id: `core.baseline_sources:${campaign.id}`,
        campaign: campaign.id,
        owner: campaign.id,
        status: baselinePresent ? PASS : FAIL,
        severity: baselinePresent ? null : SEVERITY.JOURNEY,
        expected: campaign.baseline_sources,
        observed: campaign.baseline_sources.map((p) => ({ p, exists: existsInRoot(root, p) })),
      });
    }
    report.matrix.core.push({
      id: campaign.id,
      title: campaign.title,
      producer_handoff: hasHandoff ? PASS : MISSING_DEPENDENCY,
      baseline: baselinePresent ? PASS : FAIL,
    });
  }
}

export async function checkHypotheticalPrice(report, root) {
  const files = [
    "quantitativos-orcamento-obras/index.html",
    "ferramentas/prontidao-tecnica-obra-privada/index.html",
    "servicos/index.html",
  ];
  for (const rel of files) {
    if (!existsInRoot(root, rel)) continue;
    const page = fs.readFileSync(path.join(root, rel), "utf8");
    const text = html.visibleText(page);
    const invented = /R\$\s*\d/.test(text) && /a partir de|investimento|por relat[oó]rio/i.test(text) && !/oferta publicada|preço autorizado/i.test(text);
    record(report, {
      id: `hypothetical_price:${rel}`,
      campaign: "16",
      owner: "16",
      path: rel,
      status: invented ? FAIL : PASS,
      severity: invented ? SEVERITY.EXPOSURE : null,
      expected: "no unauthorized hypothetical price on unpriced private journeys",
      observed: invented,
    });
  }
}

export async function runAllChecks(report, root, options = {}) {
  const included = options.includedCampaigns || [];
  await checkCoreCampaigns(report, root);
  await checkPersistBeforeReceipt(report, root);
  await checkDuplicateRetry(report, root);
  await checkPiiInEvent(report, root);
  await checkUnknownAsDefect(report, root);
  await checkFamilyAndIndex(report, root, included);
  await checkJourneys(report, root);
  await checkPublishedTestDataAndProof(report, root);
  await checkWhatsappNotConversation(report, root);
  await checkBrokenLinksAndCanonical(report, root);
  await checkExpansionLeaks(report, root, included);
  await checkOwnershipReceipt(report, root);
  await checkStructural(report, root);
  await checkCampaignPrivateContent(report, root);
  await checkHypotheticalPrice(report, root);
}
