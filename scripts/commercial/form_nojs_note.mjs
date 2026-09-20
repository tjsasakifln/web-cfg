/**
 * Nota sem JavaScript de todo formulário de captura (CONTEXTO-CAPTURA-05,
 * BOFU-FECHAMENTO-20260919).
 *
 * O formulário compartilhado só envia, devolve protocolo e evita duplicidade
 * com o runtime carregado (`js/modules/form.js`). Sem JavaScript, o POST
 * nativo cai no fallback text/html do servidor (CONTEXTO-CAPTURA-02) e o
 * visitante não recebe recibo. Os 16 formulários manuais já publicavam a nota
 * dentro de `<noscript>` (`scripts/site/apply_form_nojs_note.py`); os 14
 * gerados não. Este módulo é a única fonte da nota para o normalizador
 * (`render_cta_form_next_state.mjs`) e para os geradores que escrevem o
 * `<form>` inteiro com paridade byte a byte (`render_contract_defense_products.mjs`),
 * de modo que os dois concordem.
 *
 * Canais: o `wa.me` e o `mailto:` que a própria página já publica, fora de
 * `<noscript>`, os mais próximos do formulário. Sem `mailto:` na página, o e-mail canônico
 * de `data/site/brand.json`. Sem `wa.me` na página, a nota fica só com o
 * e-mail: uma rota que não publica WhatsApp (p. ex. o modelo D01, cuja ação
 * comercial é /comercial/radar-decisorio/) não ganha um canal novo por aqui.
 * O texto da nota é o mesmo do aplicador Python, para que `--check` dele não
 * volte a acusar pendência.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const NOTE_CLASS = "form-nojs-note";
const NOTE_TEXT_BEFORE = "Sem JavaScript, este formulário não envia. Use o ";
const NOTE_TEXT_MIDDLE = " ou o ";
const NOTE_TEXT_AFTER = " ao lado.";
const NOTE_TEXT_EMAIL_ONLY = "Sem JavaScript, este formulário não envia. Use o ";

let brandEmail = "tiago.sasaki@confenge.com.br";
try {
  const brand = JSON.parse(fs.readFileSync(path.join(root, "data/site/brand.json"), "utf8"));
  brandEmail = String((brand.contact && brand.contact.email) || brandEmail);
} catch {
  /* canal canônico acima */
}

function stripNoscript(html) {
  return String(html || "").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
}

/**
 * Canais publicados pela página (fora de noscript), os mais próximos do
 * formulário de captura: o último `wa.me` / `mailto:` antes do formulário ou,
 * sem nenhum antes, o primeiro depois. No hub de obras públicas o primeiro
 * WhatsApp da página é o do bloco do órgão; o vizinho do formulário é o
 * genérico de contrato, que serve a quem chega de qualquer situação.
 */
export function pageChannels(html) {
  const visible = stripNoscript(html);
  const formAt = (() => {
    const match = visible.match(/<form\b[^>]*\baction="(?:\/\.netlify\/functions\/lead|\/api\/web\/lead)"[^>]*>/i);
    return match ? match.index : visible.length;
  })();
  const nearest = (pattern) => {
    let before = "";
    let after = "";
    for (const match of visible.matchAll(pattern)) {
      if (match.index < formAt) before = match[1];
      else if (!after) after = match[1];
    }
    return before || after;
  };
  return {
    wa_href: nearest(/href="(https:\/\/wa\.me\/[^"]+)"/g),
    mail_href: nearest(/href="(mailto:[^"]+)"/g) || `mailto:${brandEmail}`,
  };
}

export function buildNojsNote({ wa_href: waHref, mail_href: mailHref }) {
  if (!waHref) {
    return `<noscript><p class="form-hint ${NOTE_CLASS}">${NOTE_TEXT_EMAIL_ONLY}<a href="${mailHref}">e-mail</a>${NOTE_TEXT_AFTER}</p></noscript>`;
  }
  return `<noscript><p class="form-hint ${NOTE_CLASS}">${NOTE_TEXT_BEFORE}<a href="${waHref}">WhatsApp</a>${NOTE_TEXT_MIDDLE}<a href="${mailHref}">e-mail</a>${NOTE_TEXT_AFTER}</p></noscript>`;
}

/** A página já explica o caso sem JavaScript por conta própria (home: `.form-nojs-note` alternada por CSS)? */
export function pageHasOwnNojsNote(html) {
  return new RegExp(`<p class="${NOTE_CLASS}"`).test(stripNoscript(html));
}

/**
 * Insere a nota no corpo de um formulário que ainda não a tem: depois dos
 * `form-hint` de abertura (data-form-value / data-field-purpose, que o
 * normalizador escreve no início do corpo) ou, sem eles, no início do corpo.
 * Idempotente: um corpo com a nota não muda.
 */
export function ensureNojsNote(body, pageHtml) {
  const source = String(body);
  if (source.includes(NOTE_CLASS)) return source;
  const note = buildNojsNote(pageChannels(pageHtml));
  const opening = source.match(/^(?:\s*<p class="form-hint"[^>]*\bdata-(?:form-value|field-purpose)\b[^>]*>[\s\S]*?<\/p>\s*){1,2}/i);
  if (!opening) {
    const lead = source.match(/^\s*/)[0];
    return `${lead}${note}\n${source.slice(lead.length)}`;
  }
  const head = opening[0].replace(/\s*$/, "\n");
  return `${head}${note}\n${source.slice(opening[0].length)}`;
}
