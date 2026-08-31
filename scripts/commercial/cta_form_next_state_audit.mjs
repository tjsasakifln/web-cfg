#!/usr/bin/env node

/** Derived CTA/form inventory for issue #532. */

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveCoverage, visibleText } from "./value_first_copy_audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_SKIP_PARTS = new Set([
  ".git",
  ".github",
  ".claude",
  ".netlify",
  "_site",
  "data",
  "docs",
  "netlify",
  "node_modules",
  "ops",
  "scripts",
  "seo",
  "supabase",
  "tests",
]);

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function publicHtmlFiles() {
  return childProcess.execFileSync("git", ["ls-files", "*.html"], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/)
    .filter(Boolean)
    .filter((relative) => relative === "index.html" || relative.endsWith("/index.html"))
    .filter((relative) => !relative.split("/").some((part) => PUBLIC_SKIP_PARTS.has(part)))
    .sort();
}

function routeFromFile(relative) {
  return relative === "index.html" ? "/" : `/${relative.slice(0, -"index.html".length)}`;
}

function familyForRoute(route, families, bofuRoutes) {
  const candidates = families.filter((family) => {
    if ((family.match?.routes || []).includes(route)) return true;
    if (family.match?.prefix && route.startsWith(family.match.prefix)) return true;
    return family.match?.source && bofuRoutes.has(route);
  });
  const exact = candidates.find((family) => (family.match?.routes || []).includes(route));
  const prefixed = candidates
    .filter((family) => family.match?.prefix)
    .sort((left, right) => right.match.prefix.length - left.match.prefix.length)[0];
  return exact || prefixed || candidates.find((family) => family.match?.source) || null;
}

function attrValue(attrs, name) {
  return String(attrs || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function hasBooleanAttr(attrs, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|/|$)`, "i").test(String(attrs || ""));
}

function markerText(body, marker) {
  const match = String(body).match(new RegExp(
    `<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${marker}(?:\\s|=|>))[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i",
  ));
  return match ? visibleText(match[2]) : "";
}

function fieldContract(body) {
  const fields = [...String(body).matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
    .map((match) => {
      const attrs = match[2];
      return {
        name: attrValue(attrs, "name"),
        type: attrValue(attrs, "type") || match[1].toLowerCase(),
        required: hasBooleanAttr(attrs, "required"),
      };
    })
    .filter((field) => field.name && !["hidden", "submit", "button"].includes(field.type))
    .filter((field) => field.name !== "empresa-site");
  const required = fields.filter((field) => field.required).map((field) => field.name);
  const optional = fields.filter((field) => !field.required).map((field) => field.name);
  if (fields.some((field) => ["email", "telefone"].includes(field.name))
    && !required.some((name) => ["email", "telefone", "radar_email_entrega"].includes(name))) {
    required.push("email_or_whatsapp");
  }
  return { required: [...new Set(required)], optional: [...new Set(optional)] };
}

function actionHtml(html) {
  const body = String(html).match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || String(html);
  return body
    .replace(/<header\b(?=[^>]*\bclass=["'][^"']*\bsite-header\b)[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b(?=[^>]*\bclass=["'][^"']*\bcontact-float\b)[^>]*>[\s\S]*?<\/aside>/gi, " ");
}

function commercialActions(html, profile) {
  const aliases = {
    service_cta_click: "cta_click",
    offer_cta_click: "cta_click",
    diagnostic_cta_click: "cta_click",
    critical_decision_cta_click: "cta_click",
    pseo_cta_click: "cta_click",
    pseo_whatsapp_click: "whatsapp_click",
    editorial_whatsapp_click: "whatsapp_click",
    pseo_email_click: "email_click",
    editorial_email_click: "email_click",
  };
  return [...actionHtml(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const attrs = match[1];
      const href = attrValue(attrs, "href");
      const label = visibleText(match[2]);
      const position = attrValue(attrs, "data-cta-position");
      const className = attrValue(attrs, "class");
      const whatsapp = /^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(href);
      const email = /^mailto:/i.test(href);
      const formAnchor = /#(?:captura|formulario|pedido|segunda-leitura|contato)/i.test(href);
      const declared = Boolean(attrValue(attrs, "data-next-action-id") || attrValue(attrs, "data-cta-id") || position);
      const primary = /\bbutton-(?:primary|light)\b/i.test(className);
      if (!label || !(whatsapp || email || formAnchor || declared || primary)) return null;
      const explicitEvent = attrValue(attrs, "data-event-name");
      const events = [];
      if (explicitEvent) events.push(aliases[explicitEvent] || explicitEvent);
      let stage = "compare";
      let commitment = "low";
      let nextState = `Abre o destino declarado por “${label}” para continuar a decisão.`;
      let actualReceipt = "Destino renderizado; esta ação isolada não emite receipt.";
      if (whatsapp) {
        stage = "talk";
        commitment = "medium";
        nextState = "Abre uma conversa no WhatsApp com o contexto desta rota para continuar o enquadramento.";
        actualReceipt = "Protocolo CFG-WA anexado no clique; não simula o receipt do formulário.";
        events.push("whatsapp_click");
      } else if (email) {
        stage = "talk";
        commitment = "medium";
        nextState = "Abre o cliente de e-mail com assunto e contexto para continuar o enquadramento.";
        actualReceipt = "Rascunho local de e-mail; não existe receipt do servidor antes do envio.";
        events.push("email_click");
      } else if (formAnchor) {
        stage = profile.stage || "register_context";
        commitment = profile.commitment || "medium";
        nextState = "Leva ao formulário que registra o contexto mínimo e só confirma depois da persistência.";
        actualReceipt = profile.actual_receipt || "Receipt emitido somente após persistência.";
        if (/#formulario-contato/i.test(href)) events.push("cta_view");
      } else if (/^\/comercial\//i.test(href)) {
        stage = "configure_scope";
        commitment = "commercial_configuration";
        nextState = "Abre a configuração comercial do pedido antes de qualquer instrução de pagamento.";
      } else if (/^\/ferramentas\//i.test(href)) {
        stage = "calculate";
        nextState = "Abre a ferramenta pública para calcular ou inspecionar a situação antes do contato.";
      } else if (/^\/casos\//i.test(href)) {
        stage = "inspect";
        nextState = "Abre o demonstrativo sintético para inspecionar formato, método e limites.";
      }
      const uniqueEvents = [...new Set(events)];
      if (!uniqueEvents.length) uniqueEvents.push("no_direct_event_declared");
      return {
        cta_id: attrValue(attrs, "data-cta-id"),
        position,
        href,
        stage,
        commitment,
        current_label: label,
        useful_next_state: nextState,
        actual_receipt: actualReceipt,
        field_purpose: "not_applicable",
        boundary: profile.boundary || "A ação preserva a fronteira declarada pela família pública.",
        event_semantics: uniqueEvents,
      };
    })
    .filter(Boolean);
}

function captureForms(html, contract) {
  return [...String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .map((match) => ({ attrs: match[1], body: match[2] }))
    .filter(({ attrs }) => {
      const action = attrValue(attrs, "action");
      const id = attrValue(attrs, "id");
      return ["/.netlify/functions/lead", "/api/web/lead"].includes(action)
        || id === "formulario-contato";
    })
    .map(({ attrs, body }) => {
      const submit = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
        .find((match) => (attrValue(match[1], "type") || "submit") === "submit");
      const profileId = attrValue(attrs, "data-next-state-profile");
      const runtimeProfileId = attrValue(attrs, "data-runtime-profile");
      const profile = contract?.profiles?.[profileId] || {};
      const runtime = contract?.runtime_profiles?.[runtimeProfileId] || {};
      const fields = fieldContract(body);
      if (profileId === "paid_offer_parameters") {
        fields.optional = fields.optional.filter((name) => ![
          "radar_cidade_base",
          "radar_raio_km",
          "radar_segmentos",
        ].includes(name));
        fields.required.push(
          "radar_segmentos",
          "radar_cidade_base_when_city_base",
          "radar_raio_km_when_city_base",
        );
        fields.required = [...new Set(fields.required)];
      }
      const captureEligible = ["/.netlify/functions/lead", "/api/web/lead"].includes(attrValue(attrs, "action"))
        || attrValue(attrs, "id") === "formulario-contato";
      const tokenForwarding = runtimeProfileId === "shared_lead_form_v1"
        || (/cf-turnstile-response/.test(html) && /turnstile_token/.test(html));
      const hasWhatsapp = /https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(html);
      const sharedEmail = /<(?:input)\b(?=[^>]*\bid=["']email["'])[^>]*>/i.test(body);
      const sharedPhone = /<(?:input)\b(?=[^>]*\bid=["']telefone["'])[^>]*>/i.test(body);
      const sharedJourney = /<input\b(?=[^>]*\bid=["']jornada-hidden["'])[^>]*>/i.test(body);
      const sharedStage = /<(?:input|select)\b(?=[^>]*\bid=["']estagio["'])[^>]*>/i.test(body);
      const emailTag = body.match(/<input\b(?=[^>]*\bname=["']email["'])[^>]*>/i)?.[0] || "";
      const phoneTag = body.match(/<input\b(?=[^>]*\bname=["']telefone["'])[^>]*>/i)?.[0] || "";
      const emailConstrained = !emailTag || (
        attrValue(emailTag, "type") === "email"
        && attrValue(emailTag, "inputmode") === "email"
        && Number(attrValue(emailTag, "maxlength")) > 0
        && Boolean(attrValue(emailTag, "pattern"))
        && Boolean(attrValue(emailTag, "title"))
      );
      const phoneConstrained = !phoneTag || (
        attrValue(phoneTag, "type") === "tel"
        && attrValue(phoneTag, "inputmode") === "tel"
        && Number(attrValue(phoneTag, "maxlength")) > 0
        && Boolean(attrValue(phoneTag, "pattern"))
        && Boolean(attrValue(phoneTag, "title"))
      );
      return {
        action: attrValue(attrs, "action"),
        cta_id: attrValue(attrs, "data-cta-id"),
        form_contract: attrValue(attrs, "data-form-contract"),
        profile: profileId,
        runtime_profile: runtimeProfileId,
        stage: profile.stage || "",
        commitment: profile.commitment || "",
        submit_label: submit ? visibleText(submit[2]) : "",
        current_label: submit ? visibleText(submit[2]) : "",
        useful_next_state: profile.next_useful_state || "",
        actual_receipt: profile.actual_receipt || "",
        pre_form_value: markerText(body, "data-form-value") || markerText(html, "data-form-value"),
        pre_form_value_visible: Boolean(markerText(body, "data-form-value") || markerText(html, "data-form-value")),
        field_purpose: {
          visible_text: markerText(body, "data-field-purpose") || markerText(html, "data-field-purpose"),
          visible: Boolean(markerText(body, "data-field-purpose") || markerText(html, "data-field-purpose")),
          required: fields.required,
          optional: fields.optional,
        },
        boundary: markerText(body, "data-form-boundary") || markerText(html, "data-form-boundary"),
        boundary_visible: Boolean(markerText(body, "data-form-boundary") || markerText(html, "data-form-boundary")),
        privacy_link_visible: /<p\b(?=[^>]*\bdata-form-boundary(?:\s|=|>))[^>]*>[\s\S]*?href=["']\/privacidade\/["'][\s\S]*?<\/p>/i.test(body)
          || /<p\b(?=[^>]*\bdata-form-boundary(?:\s|=|>))[^>]*>[\s\S]*?href=["']\/privacidade\/["'][\s\S]*?<\/p>/i.test(html),
        event_semantics: [...(contract?.event_semantics || [])],
        runtime_states: {
          initial: runtime.initial || "",
          validation_error: runtime.validation_error || "",
          turnstile_error: runtime.turnstile_error || "",
          loading: runtime.loading || "",
          error: runtime.error || "",
          success: runtime.success || "",
          receipt: runtime.receipt || "",
        },
        turnstile_ready: captureEligible && tokenForwarding,
        turnstile_token_forwarding: tokenForwarding,
        receipt_required: attrValue(attrs, "data-receipt-required") === "true",
        contact_constraints_ready: Boolean((emailTag || phoneTag) && emailConstrained && phoneConstrained),
        form_whatsapp_relationship: hasWhatsapp ? "parallel_talk_path" : "form_only",
        shared_runtime_selectors_ready: runtimeProfileId !== "shared_lead_form_v1"
          || sharedEmail
          || sharedPhone,
        shared_runtime_journey_ready: runtimeProfileId !== "shared_lead_form_v1"
          || sharedJourney
          || sharedStage,
      };
    });
}

export function buildInventory() {
  const contract = readJson("data/commercial/cta-form-next-state.v1.json");
  const familyRegistry = readJson("data/organic/public-family-registry.json");
  const bofu = readJson("data/organic/bofu-intent-matrix.json");
  const firstFold = readJson("data/commercial/first-fold-contract.v1.json");
  const unlock = readJson("data/bofu-dominance/frozen-specs/unlock-plan.v1.json");
  const files = publicHtmlFiles();
  const derived = deriveCoverage({
    familyRegistry,
    bofu,
    firstFold,
    files,
    readFile: (relative) => fs.readFileSync(path.join(root, relative), "utf8"),
  });
  const protectedRoutes = new Set((unlock.protected_pillars || []).map((slug) => `/${slug}/`));
  const routeEntries = new Map(derived.routes.map((entry) => [entry.route, entry]));
  const bofuRoutes = new Set((bofu.rows || []).map((row) => row.canonical_service_route).filter(Boolean));
  // Commercial requests can intentionally be noindex (for example, a
  // configuration step). They still belong to the declared family registry
  // and must not disappear from the conversion inventory.
  for (const relative of files) {
    const html = fs.readFileSync(path.join(root, relative), "utf8");
    if (!captureForms(html, contract).length) continue;
    const route = routeFromFile(relative);
    if (routeEntries.has(route)) continue;
    const family = familyForRoute(route, familyRegistry.families || [], bofuRoutes);
    if (!family) continue;
    routeEntries.set(route, {
      route,
      relative,
      html,
      family_id: family.id,
      family_profile: family.profile,
      terminal_action: family.terminal_action,
    });
  }
  const surfaces = [...routeEntries.values()]
    .map((entry) => {
      const forms = captureForms(entry.html, contract);
      const profile = contract.profiles?.[forms[0]?.profile] || {};
      return {
        route: entry.route,
        file: entry.relative,
        family_id: entry.family_id,
        family_profile: entry.family_profile,
        terminal_action: entry.terminal_action,
        forms,
        actions: commercialActions(entry.html, profile),
      };
    })
    .filter((entry) => entry.forms.length > 0);
  const routes = [...new Set(surfaces.map((entry) => entry.route))].sort();
  const protectedWithCapture = routes.filter((route) => protectedRoutes.has(route));
  const problems = [...derived.problems];
  for (const entry of surfaces) {
    if (entry.forms.length !== 1) {
      problems.push({ kind: "multiple_commercial_capture_forms", route: entry.route, count: entry.forms.length });
    }
  }
  return {
    schema: "confenge.cta-form-next-state-inventory/1.0",
    issue: "#532",
    contract: {
      schema: contract.schema,
      version: contract.contract_version,
      source: contract.source,
      analytics_pii_allowlist: contract.analytics_pii_allowlist,
      executive_front: contract.executive_front,
      time_to_evidence: contract.time_to_evidence,
      leverage: contract.leverage,
      allowed_stages: contract.allowed_stages,
      allowed_commitments: contract.allowed_commitments,
      baseline_sha: contract.baseline_sha,
      expected_declared_ctas: contract.coverage.expected_declared_ctas,
    },
    coverage: {
      authority: "data/organic/public-family-registry.json",
      manual_route_allowlist: false,
      active_capture_routes: routes.length,
      declared_ctas: surfaces.reduce((total, surface) => total + surface.actions.length, 0),
      protected_routes_with_capture: protectedWithCapture,
      problems,
    },
    surfaces,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = buildInventory();
  const writeIndex = process.argv.indexOf("--write");
  if (writeIndex >= 0) {
    const relative = process.argv[writeIndex + 1];
    if (!relative) throw new Error("CTA_FORM_INVENTORY_WRITE_PATH_REQUIRED");
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`CTA_FORM_INVENTORY_OUTSIDE_ROOT: ${absolute}`);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`CTA_FORM_INVENTORY_WRITTEN routes=${report.coverage.active_capture_routes} path=${path.relative(root, absolute)}`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
