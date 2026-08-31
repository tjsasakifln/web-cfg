#!/usr/bin/env node

/** Render the derived issue #532 form contract into every active capture form. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "./cta_form_next_state_audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/cta-form-next-state.v1.json"), "utf8"));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attrValue(attrs, name) {
  return String(attrs || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function setAttr(tag, name, value) {
  const cleaned = tag.replace(new RegExp(`\\s${name}(?:=["'][^"']*["'])?`, "gi"), "");
  return cleaned.replace(/>$/, ` ${name}="${escapeHtml(value)}">`);
}

function setInputAttr(tag, name, value) {
  if (new RegExp(`\\b${name}=`, "i").test(tag)) {
    return tag.replace(new RegExp(`\\b${name}=["'][^"']*["']`, "i"), `${name}="${escapeHtml(value)}"`);
  }
  return tag.replace(/\s*\/?\s*>$/, (ending) => ` ${name}="${escapeHtml(value)}"${ending}`);
}

function profileFor(surface) {
  for (const rule of contract.profile_derivation || []) {
    if (rule.family_id && rule.family_id === surface.family_id) return rule.profile;
    if (rule.terminal_action && rule.terminal_action === surface.terminal_action) return rule.profile;
  }
  throw new Error(`CTA_FORM_PROFILE_UNRESOLVED: ${surface.route}`);
}

function runtimeProfile(open) {
  const id = attrValue(open, "id");
  if (id === "radar-params-form") return "inline_reference_v1";
  if (id === "handraise-diag") return "inline_receipt_v1";
  return "shared_lead_form_v1";
}

function replaceMarker(body, marker, text, className) {
  const pattern = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${marker}(?:\\s|=|>))[^>]*>[\\s\\S]*?<\\/\\1>\\s*`,
    "gi",
  );
  const cleaned = body.replace(pattern, "");
  return `<p class="${className}" ${marker}>${escapeHtml(text)}</p>\n${cleaned}`;
}

function appendBoundary(body, text) {
  const pattern = /<([a-z][a-z0-9:-]*)\b(?=[^>]*\bdata-form-boundary(?:\s|=|>))[^>]*>[\s\S]*?<\/\1>\s*/gi;
  const privacy = "Dados usados apenas para este retorno; retenção de até 730 dias. A exclusão pode ser pedida pelos canais da";
  return `${body.replace(pattern, "").trimEnd()}\n<p class="form-hint" data-form-boundary>${escapeHtml(text)} ${privacy} <a href="/privacidade/">Política de Privacidade</a>, com o protocolo.</p>\n`;
}

function constrainContact(body, runtime) {
  const update = (source, field, attributes) => source.replace(
    new RegExp(`<input\\b(?=[^>]*\\bname=["']${field}["'])[^>]*>`, "gi"),
    (tag) => {
      let next = tag;
      if (!/\bid=["']/i.test(next) && runtime === "shared_lead_form_v1") next = setInputAttr(next, "id", field);
      for (const [name, value] of Object.entries(attributes)) next = setInputAttr(next, name, value);
      return next;
    },
  );
  let next = update(body, "email", {
    type: "email",
    inputmode: "email",
    maxlength: "180",
    pattern: "[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}",
    title: "Informe um e-mail completo, como nome@empresa.com.br.",
    autocomplete: "email",
  });
  next = update(next, "telefone", {
    type: "tel",
    inputmode: "tel",
    maxlength: "20",
    pattern: "(\\+?55[\\s.\\-]?)?\\(?\\d{2}\\)?[\\s.\\-]?9?\\d{4}[\\s.\\-]?\\d{4}",
    title: "Informe DDD e número, com 10 ou 11 dígitos.",
    autocomplete: "tel",
  });
  return next;
}

function constrainSharedSelectors(body, runtime) {
  if (runtime !== "shared_lead_form_v1") return body;
  let next = body.replace(
    /<input\b(?=[^>]*\bname=["']jornada["'])[^>]*>/i,
    (tag) => /\bid=["']/i.test(tag) ? tag : setInputAttr(tag, "id", "jornada-hidden"),
  );
  next = next.replace(
    /<(?:input|select)\b(?=[^>]*\bname=["']estagio["'])[^>]*>/i,
    (tag) => /\bid=["']/i.test(tag) ? tag : setInputAttr(tag, "id", "estagio"),
  );
  return next;
}

function usefulSubmitLabel(profileId, current) {
  if (/^Enviar pedido de enquadramento$/i.test(current)) return "Registrar pedido para revisão de enquadramento";
  if (/^Quero uma segunda leitura deste contrato$/i.test(current)) return "Registrar pedido de segunda leitura deste contrato";
  if (!/^(?:Enviar solicitação|Enviar para análise)$/i.test(current)) return current;
  const labels = {
    general_triage: "Registrar situação para triagem",
    service_fit_review: "Registrar contexto para revisão de encaixe",
    case_evidence_review: "Registrar evento e identificar a prova faltante",
    delivery_selection: "Registrar decisão para indicar a entrega",
  };
  return labels[profileId] || current;
}

function updateSubmit(body, profileId) {
  return body.replace(
    /<button\b([^>]*)>([\s\S]*?)<\/button>/gi,
    (full, attrs, content) => {
      const type = attrValue(attrs, "type") || "submit";
      if (type !== "submit") return full;
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const nextLabel = usefulSubmitLabel(profileId, text);
      if (nextLabel === text) return full;
      const suffix = content.match(/\s*(<svg\b[\s\S]*)$/i)?.[1] || "";
      return `<button${attrs}>${escapeHtml(nextLabel)}${suffix ? ` ${suffix}` : ""}</button>`;
    },
  ).replace(
    /<button\b([^>]*\bdata-form-next=["'][^"']+["'][^>]*)>[\s\S]*?<\/button>/i,
    (full, attrs) => `<button${attrs}>Adicionar contexto opcional</button>`,
  );
}

function updateMainActions(html) {
  const replacements = new Map([
    ["enviar dados para análise", "Registrar contexto para revisão"],
    ["falar sobre minha operação", "Pedir revisão de encaixe da operação"],
    ["falar com tiago", "Pedir revisão de encaixe pelo WhatsApp"],
    ["prefiro whatsapp", "Pedir triagem pelo WhatsApp"],
    ["conversar pelo whatsapp", "Pedir revisão de encaixe pelo WhatsApp"],
    ["analisar meu caso", "Registrar situação para triagem"],
    ["análise inicial", "Registrar evento para identificar a prova faltante"],
    ["enviar dados pelo formulário", "Registrar operação para revisão de encaixe"],
    ["conheça nossas entregas", "Comparar entregas e artefatos"],
    ["analisar meu contrato", "Registrar contrato para triagem"],
  ]);
  return html.replace(/<main\b([\s\S]*?)<\/main>/i, (main) => main.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs, content) => {
      const current = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const label = replacements.get(current.toLocaleLowerCase("pt-BR"));
      if (!label) return full;
      const suffix = content.match(/\s*(<svg\b[\s\S]*)$/i)?.[1] || "";
      return `<a${attrs}>${escapeHtml(label)}${suffix ? ` ${suffix}` : ""}</a>`;
    },
  ));
}

function renderForm(full, open, body, surface) {
  const profileId = profileFor(surface);
  const profile = contract.profiles[profileId];
  const runtime = runtimeProfile(open);
  let nextOpen = open;
  nextOpen = setAttr(nextOpen, "data-form-contract", "next-state/v1");
  nextOpen = setAttr(nextOpen, "data-next-state-profile", profileId);
  nextOpen = setAttr(nextOpen, "data-runtime-profile", runtime);
  nextOpen = setAttr(nextOpen, "data-receipt-required", "true");
  let nextBody = constrainSharedSelectors(constrainContact(body, runtime), runtime);
  const hasStandardEmail = /\bname=["']email["']/i.test(nextBody);
  const hasStandardPhone = /\bname=["']telefone["']/i.test(nextBody);
  const formatHint = hasStandardEmail && hasStandardPhone
    ? " WhatsApp aceita DDD e 10 ou 11 dígitos; e-mail precisa de domínio e extensão completos."
    : hasStandardEmail
      ? " O e-mail precisa de domínio e extensão completos."
      : hasStandardPhone
        ? " O WhatsApp aceita DDD e 10 ou 11 dígitos."
        : "";
  nextBody = replaceMarker(nextBody, "data-field-purpose", `${profile.field_purpose}${formatHint}`, "form-hint");
  nextBody = replaceMarker(nextBody, "data-form-value", profile.pre_form_value, "form-hint");
  nextBody = updateSubmit(nextBody, profileId);
  nextBody = appendBoundary(nextBody, profile.boundary);
  return `${nextOpen}${nextBody}</form>`;
}

function renderFile(html, surface) {
  let matched = 0;
  const next = html.replace(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi, (full, attrs, body) => {
    const open = `<form${attrs}>`;
    const action = attrValue(attrs, "action");
    const id = attrValue(attrs, "id");
    if (!["/.netlify/functions/lead", "/api/web/lead"].includes(action) && id !== "formulario-contato") return full;
    matched += 1;
    return renderForm(full, open, body, surface);
  });
  if (matched !== 1) throw new Error(`CTA_FORM_RENDER_COUNT: ${surface.route} count=${matched}`);
  return updateMainActions(next);
}

const inventory = buildInventory();
const updates = inventory.surfaces.map((surface) => {
  const absolute = path.join(root, surface.file);
  const current = fs.readFileSync(absolute, "utf8");
  return { absolute, current, next: renderFile(current, surface) };
});

if (process.argv.includes("--check")) {
  const drift = updates.filter((entry) => entry.current !== entry.next).map((entry) => path.relative(root, entry.absolute));
  if (drift.length) {
    console.error(`CTA_FORM_NEXT_STATE_DRIFT: ${drift.join(", ")}`);
    process.exit(1);
  }
  console.log(`CTA_FORM_NEXT_STATE_OK routes=${updates.length}`);
} else if (process.argv.includes("--write")) {
  for (const entry of updates) fs.writeFileSync(entry.absolute, entry.next);
  console.log(`CTA_FORM_NEXT_STATE_WRITTEN routes=${updates.length}`);
} else {
  console.error("usage: render_cta_form_next_state.mjs --check|--write");
  process.exit(2);
}
