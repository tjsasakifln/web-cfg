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
  return String(attrs || "").match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function setAttr(tag, name, value) {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`(\\b${name}=["'])[^"']*(["'])`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, `$1${escaped}$2`);
  return tag.replace(/>$/, ` ${name}="${escaped}">`);
}

function setInputAttr(tag, name, value) {
  if (new RegExp(`\\b${name}=`, "i").test(tag)) {
    return tag.replace(new RegExp(`\\b${name}=["'][^"']*["']`, "i"), `${name}="${escapeHtml(value)}"`);
  }
  return tag.replace(/\s*\/?\s*>$/, (ending) => ` ${name}="${escapeHtml(value)}"${ending}`);
}

function ensureInlineStyle(tag, property, value) {
  const current = attrValue(tag, "style");
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:`, "i");
  if (pattern.test(current)) return tag;
  const separator = current.trim() && !current.trim().endsWith(";") ? ";" : "";
  return setInputAttr(tag, "style", `${current}${separator}${property}:${value}`);
}

function removeInlineStyle(tag, property, value) {
  const current = attrValue(tag, "style");
  if (!current) return tag;
  const exact = new RegExp(`^${property}\\s*:\\s*${value}$`, "i");
  const declarations = current.split(";").map((entry) => entry.trim()).filter(Boolean);
  const kept = declarations.filter((entry) => !exact.test(entry));
  if (kept.length === declarations.length) return tag;
  if (!kept.length) return tag.replace(/\sstyle=["'][^"']*["']/i, "");
  return setInputAttr(tag, "style", kept.join(";"));
}

function profileFor(surface) {
  for (const rule of contract.profile_derivation || []) {
    if (rule.family_id && rule.family_id === surface.family_id) return rule.profile;
  }
  for (const rule of contract.profile_derivation || []) {
    if (rule.terminal_action && rule.terminal_action === surface.terminal_action) return rule.profile;
  }
  throw new Error(`CTA_FORM_PROFILE_UNRESOLVED: ${surface.route}`);
}

function runtimeProfile(open) {
  const id = attrValue(open, "id");
  if (id === "radar-params-form") return "inline_reference_v1";
  if (id === "handraise-diag") return "inline_receipt_v1";
  if (id === "triagem-tecnica-form") return "adaptive_intake_standalone_v1";
  return "shared_lead_form_v1";
}

function replaceMarker(body, marker, text, className, extraAttrs = "") {
  const pattern = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${marker}(?:\\s|=|>))[^>]*>[\\s\\S]*?<\\/\\1>\\s*`,
    "gi",
  );
  const cleaned = body.replace(pattern, "");
  const attrs = extraAttrs ? ` ${extraAttrs}` : "";
  return `<p class="${className}"${attrs} ${marker}>${escapeHtml(text)}</p>\n${cleaned}`;
}

function removeMarker(body, marker) {
  return body.replace(new RegExp(
    `<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${marker}(?:\\s|=|>))[^>]*>[\\s\\S]*?<\\/\\1>\\s*`,
    "gi",
  ), "");
}

function appendBoundary(body, text) {
  const pattern = /<([a-z][a-z0-9:-]*)\b(?=[^>]*\bdata-form-boundary(?:\s|=|>))[^>]*>[\s\S]*?<\/\1>\s*/gi;
  const privacy = "Dados usados apenas para este retorno; retenção de até 730 dias. A exclusão pode ser pedida pelos canais da";
  return `${body.replace(pattern, "").trimEnd()}\n<p class="form-hint" data-form-boundary>${escapeHtml(text)} ${privacy} <a href="/privacidade/">Política de Privacidade</a>, com o protocolo.</p>\n`;
}

function constrainContact(body, runtime, ensurePhoneTouchTarget) {
  const update = (source, field, attributes) => source.replace(
    new RegExp(`<input\\b(?=[^>]*\\bname=["']${field}["'])[^>]*>`, "gi"),
    (tag) => {
      let next = tag;
      if (!/\bid=["']/i.test(next) && runtime === "shared_lead_form_v1") next = setInputAttr(next, "id", field);
      for (const [name, value] of Object.entries(attributes)) next = setInputAttr(next, name, value);
      if (field === "telefone") {
        next = ensurePhoneTouchTarget
          ? ensureInlineStyle(next, "min-height", "44px")
          : removeInlineStyle(next, "min-height", "44px");
      }
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
  // O rótulo do botão diz o que o clique faz. Ele não promete contratação, nem
  // resposta em prazo, nem parecer -- e também não descreve o processamento
  // interno para o visitante.
  if (/^(?:Enviar pedido de enquadramento|Enviar meu pedido)$/i.test(current)) return "Pedir retorno da CONFENGE";
  if (/^(?:Registrar parâmetros e abrir o pagamento|Enviar e pedir instruções de pagamento)$/i.test(current)) return "Confirmar e pedir instruções de pagamento";
  if (/^Quero uma segunda leitura deste contrato$/i.test(current)) return "Pedir uma segunda leitura do contrato";
  // Aceitar tambem os rotulos que este gerador escreveu antes, senao eles
  // ficam presos no HTML e nenhuma passagem futura os alcanca.
  if (/^Registrar pedido para revisão de enquadramento$/i.test(current)) return "Pedir retorno da CONFENGE";
  if (/^Registrar parâmetros e pedir instrução de pagamento$/i.test(current)) return "Confirmar e pedir instruções de pagamento";
  if (/^Registrar pedido de segunda leitura deste contrato$/i.test(current)) return "Pedir uma segunda leitura do contrato";
  if (!/^(?:Enviar solicitação|Enviar para análise|Registrar situação para triagem|Registrar contexto para revisão de encaixe|Registrar evento e identificar a prova faltante|Registrar decisão para indicar a entrega|Enviar minha situação|Enviar meu contexto|Enviar o que aconteceu|Enviar e ver a entrega indicada)$/i.test(current)) return current;
  const labels = {
    general_triage: "Descrever minha situação",
    service_fit_review: "Descrever meu caso",
    case_evidence_review: "Contar o que aconteceu",
    delivery_selection: "Ver a entrega indicada para o meu caso",
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
    (full, attrs) => `<button${attrs}>Adicionar mais detalhes</button>`,
  );
}

function updateMainActions(html) {
  const replacements = new Map([
    ["enviar dados para análise", "Enviar meus dados"],
    ["falar sobre minha operação", "Falar sobre a operação"],
    ["falar com tiago", "Falar pelo WhatsApp"],
    ["prefiro whatsapp", "Falar pelo WhatsApp"],
    ["conversar pelo whatsapp", "Falar pelo WhatsApp"],
    ["analisar meu caso", "Contar minha situação"],
    ["análise inicial", "Contar minha situação"],
    ["enviar dados pelo formulário", "Enviar pelo formulário"],
    ["conheça nossas entregas", "Ver o que a CONFENGE entrega"],
    ["analisar meu contrato", "Enviar meu contrato"],
    // Normalizacao dos rotulos que uma passagem anterior deste mesmo gerador
    // gravou nas paginas. Sem estas linhas o jargao nao tem caminho de volta.
    ["pedir revisão de encaixe pelo whatsapp", "Falar pelo WhatsApp"],
    ["pedir revisão de encaixe da operação", "Falar sobre a operação"],
    ["pedir triagem pelo whatsapp", "Falar pelo WhatsApp"],
    ["registrar situação para triagem", "Contar minha situação"],
    ["registrar contexto para revisão", "Enviar meus dados"],
    ["registrar operação para revisão de encaixe", "Enviar pelo formulário"],
    ["registrar contrato para triagem", "Enviar meu contrato"],
    ["registrar evento para identificar a prova faltante", "Contar o que aconteceu"],
    ["comparar entregas e artefatos", "Ver o que a CONFENGE entrega"],
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

function relocateDeliveryContract(html) {
  const valueAndPurpose = "Descreva a decisão; a resposta indica entrega, ordem e insumos. Obrigatórios: nome, consentimento e contato. Demais campos opcionais. WhatsApp: DDD + 10/11 dígitos; e-mail completo.";
  const boundary = "O pedido fica registrado, sem cobrança ou contratação. Preço e escopo exigem aceite. Uso só para retorno; retenção: 730 dias. Exclusão com protocolo pela";
  const replacement = `$1\n<p data-form-value data-field-purpose>${escapeHtml(valueAndPurpose)}</p>\n<p data-form-boundary>${escapeHtml(boundary)} <a href="/privacidade/">Política de Privacidade</a>.</p>\n$2`;
  return html.replace(
    /(<div class="pillar-capture-copy">[\s\S]*?<h2\b[^>]*>[\s\S]*?<\/h2>)\s*<p\b[^>]*>[\s\S]*?<\/p>\s*<p\b[^>]*>[\s\S]*?<\/p>\s*(<\/div>)/i,
    replacement,
  );
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
  const ensurePhoneTouchTarget = profileId === "configured_delivery_request";
  let nextBody = constrainSharedSelectors(constrainContact(body, runtime, ensurePhoneTouchTarget), runtime);
  if (profileId === "delivery_selection") {
    nextBody = removeMarker(removeMarker(removeMarker(nextBody, "data-form-value"), "data-field-purpose"), "data-form-boundary");
    nextBody = updateSubmit(nextBody, profileId);
    return `${nextOpen}${nextBody}</form>`;
  }
  const hasStandardEmail = /\bname=["']email["']/i.test(nextBody);
  const hasStandardPhone = /\bname=["']telefone["']/i.test(nextBody);
  const formatHint = profile.format_hint || (hasStandardEmail && hasStandardPhone
    ? " WhatsApp aceita DDD e 10 ou 11 dígitos; e-mail precisa de domínio e extensão completos."
    : hasStandardEmail
      ? " O e-mail precisa de domínio e extensão completos."
      : hasStandardPhone
        ? " O WhatsApp aceita DDD e 10 ou 11 dígitos."
        : "");
  nextBody = replaceMarker(
    nextBody,
    "data-field-purpose",
    `${profile.field_purpose}${formatHint}`,
    "form-hint",
    runtime === "adaptive_intake_standalone_v1" ? 'id="contato-hint"' : "",
  );
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
  const actions = updateMainActions(next);
  return profileFor(surface) === "delivery_selection" ? relocateDeliveryContract(actions) : actions;
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
