/**
 * Honest "which fields are required" line for a capture form, derived from
 * the form markup itself (LAPIDACAO-COMERCIAL-20260918, revisao independente,
 * achado j5): the shared profile used to say "os campos marcados como
 * obrigatórios" while no label carried a mark. The hint now names the set the
 * form actually enforces (`required` controls, the WhatsApp-or-e-mail rule and
 * the consent) and every optional labelled control receives the visible mark
 * the page already styles (`optional-mark` on the home form, `field-optional`
 * on the contract-defense fields). No CSS is added.
 *
 * Both the next-state renderer and the contract-defense products renderer
 * call these helpers so their outputs agree byte for byte.
 */

const CONTROL_RE = /<(input|select|textarea)\b([^>]*)>/i;

function attr(attrs, name) {
  const match = String(attrs).match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function hasAttr(attrs, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|/|$)`, "i").test(String(attrs));
}

function isDataControl(control) {
  const match = String(control).match(CONTROL_RE);
  if (!match) return false;
  const type = (attr(match[2], "type") || match[1]).toLowerCase();
  if (["hidden", "checkbox", "radio", "submit", "button"].includes(type)) return false;
  // Honeypot: never a visitor field (same exclusion as the audit).
  if (attr(match[2], "name") === "empresa-site" || attr(match[2], "tabindex") === "-1") return false;
  return true;
}

function isRequired(control) {
  const match = String(control).match(CONTROL_RE);
  return Boolean(match) && hasAttr(match[2], "required");
}

function controlName(control) {
  const match = String(control).match(CONTROL_RE);
  return match ? attr(match[2], "name") : "";
}

function stripMark(text) {
  return String(text)
    .replace(/<span class="(?:optional-mark|field-optional)">[^<]*<\/span>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findById(body, id) {
  if (!id) return "";
  const match = String(body).match(new RegExp(`<(?:input|select|textarea)\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, "i"));
  return match ? match[0] : "";
}

/** Labelled data controls in DOM order: {text, control, wrapped}. */
export function labelledControls(body) {
  const out = [];
  const source = String(body);
  const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  for (const match of source.matchAll(labelRe)) {
    const attrs = match[1];
    const inner = match[2];
    const wrapped = inner.match(/^([\s\S]*?)(<(?:input|select|textarea)\b[^>]*>)/i);
    let text = "";
    let control = "";
    if (wrapped) {
      text = stripMark(wrapped[1]);
      control = wrapped[2];
    } else {
      text = stripMark(inner);
      control = findById(source, attr(attrs, "for"));
    }
    if (!control || !isDataControl(control) || !text) continue;
    out.push({ text, control, wrapped: Boolean(wrapped) });
  }
  return out;
}

function lowerFirst(text) {
  return text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
}

function joinPt(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/**
 * "Obrigatórios: nome do representante, um canal de retorno (WhatsApp ou
 * e-mail) e o consentimento; os demais campos são opcionais." Returns "" when
 * the form has no labelled required control (the caller keeps its fallback).
 */
export function deriveFieldPurpose(body) {
  const controls = labelledControls(body);
  const names = [];
  const hasEmail = controls.some((c) => controlName(c.control) === "email");
  const hasPhone = controls.some((c) => controlName(c.control) === "telefone");
  const channelRequired = controls.some((c) => ["email", "telefone"].includes(controlName(c.control)) && isRequired(c.control));
  let channelSaid = false;
  for (const entry of controls) {
    const name = controlName(entry.control);
    if (isRequired(entry.control)) {
      names.push(lowerFirst(entry.text));
      continue;
    }
    if (hasEmail && hasPhone && !channelRequired && ["email", "telefone"].includes(name) && !channelSaid) {
      names.push("um canal de retorno (WhatsApp ou e-mail)");
      channelSaid = true;
    }
  }
  if (!names.length) return "";
  const consent = /<input\b(?=[^>]*\bname=["']consentimento["'])(?=[^>]*\brequired\b)[^>]*>/i.test(String(body));
  const required = consent ? [...names, "o consentimento"] : names;
  const optional = controls.some((c) => !isRequired(c.control));
  return `Obrigatórios: ${joinPt(required)}${optional ? "; os demais campos são opcionais." : "."}`;
}

/** Add the visible optional mark to every unmarked optional labelled control. */
export function markOptionalLabels(body) {
  const source = String(body);
  const useFieldOptional = /class="field-optional"/.test(source);
  // WhatsApp-or-e-mail rule: when both exist and neither is required, one of
  // them is still mandatory, so neither label may say "opcional"; the hint
  // line carries the rule instead.
  const channelPair = /<(?:input|select|textarea)\b(?=[^>]*\bname=["']email["'])[^>]*>/i.test(source)
    && /<(?:input|select|textarea)\b(?=[^>]*\bname=["']telefone["'])[^>]*>/i.test(source)
    && !/<(?:input|select|textarea)\b(?=[^>]*\bname=["'](?:email|telefone)["'])(?=[^>]*\brequired\b)[^>]*>/i.test(source);
  const isChannel = (control) => channelPair && ["email", "telefone"].includes(controlName(control));
  const mark = useFieldOptional
    ? '<span class="field-optional">(opcional)</span>'
    : '<span class="optional-mark">opcional</span>';
  return source.replace(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi, (full, attrs, inner) => {
    if (/class="(?:optional-mark|field-optional)"/i.test(inner)) return full;
    const wrapped = inner.match(/^([^<]*?)(\s*)(<(?:input|select|textarea)\b[^>]*>)([\s\S]*)$/i);
    if (wrapped) {
      const [, text, , control, rest] = wrapped;
      if (!text.trim() || !isDataControl(control) || isRequired(control) || isChannel(control)) return full;
      return `<label${attrs}>${text.trim()} ${mark} ${control}${rest}</label>`;
    }
    const control = findById(source, attr(attrs, "for"));
    if (!control || !isDataControl(control) || isRequired(control) || isChannel(control) || !stripMark(inner)) return full;
    return `<label${attrs}>${inner.replace(/\s+$/, "")} ${mark}</label>`;
  });
}
