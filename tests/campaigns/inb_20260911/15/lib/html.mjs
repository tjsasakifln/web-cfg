/** HTML surface helpers for purchase-path review. Not a copy of inbound_gates. */

const SCRIPT_STYLE = /<(script|style|noscript)\b[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;

export function robotsOf(html) {
  const m = String(html).match(/<meta\b[^>]*name=["']robots["'][^>]*>/i);
  if (!m) return "MISSING";
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].toLowerCase() : "MISSING";
}

export function isNoindex(html) {
  return robotsOf(html).includes("noindex");
}

export function isIndexableHtml(html) {
  const rob = robotsOf(html);
  if (rob === "MISSING") return true;
  return !rob.includes("noindex");
}

export function canonicalOf(html) {
  const m = String(html).match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

export function mainHtml(html) {
  const m = String(html).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : "";
}

export function visibleText(html) {
  return String(html)
    .replace(SCRIPT_STYLE, " ")
    .replace(TAG, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHrefs(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

export function hasLeadForm(html) {
  return /<form\b[^>]+action=["']\/\.netlify\/functions\/lead["']/i.test(html);
}

export function hasWhatsapp(html) {
  return /(?:wa\.me|whatsapp\.com)/i.test(html);
}

export function hasMailto(html) {
  return /href=["']mailto:/i.test(html);
}

export function hasSkipLink(html) {
  return /class=["'][^"']*skip-link/i.test(html) || /href=["']#conteudo["']/i.test(html);
}

export function hasViewport(html) {
  return /<meta\b[^>]*name=["']viewport["']/i.test(html);
}

export function langOf(html) {
  const m = String(html).match(/<html\b[^>]*lang=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export function h1Of(html) {
  const m = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? visibleText(m[1]) : "";
}

export function internalHrefs(html) {
  return extractHrefs(html).filter((h) => h.startsWith("/") && !h.startsWith("//"));
}

export function utmOnInternal(html) {
  return internalHrefs(html).filter((h) => /[?&]utm_/i.test(h));
}

export function requiredCtaHrefs(html) {
  const main = mainHtml(html) || html;
  const hrefs = [];
  const re = /<(?:a|form)\b[^>]*(?:data-cta-id|data-receipt-required|data-value-first-cta)[^>]*>/gi;
  let m;
  while ((m = re.exec(main))) {
    const tag = m[0];
    const href = tag.match(/href=["']([^"']+)["']/i) || tag.match(/action=["']([^"']+)["']/i);
    if (href) hrefs.push(href[1]);
  }
  return hrefs;
}

export function claimsReceipt(html) {
  return /pedido (enviado|registrado|recebido)|recibo (emitido|confirmado)|lead_id|receipt_id/i.test(
    visibleText(html),
  );
}

export function labelsSampleAsClient(html) {
  const text = visibleText(html);
  const demo = /demonstrativ|n[aã]o [ée] (case|cliente|resultado de cliente)|dados sint[eé]ticos|hipot[eé]tic/i.test(
    text,
  );
  const client = /\b(cliente real|case de cliente|nosso cliente|depoimento de cliente)\b/i.test(text);
  return client && !demo;
}

export function publishedTestDataHits(html) {
  const hits = [];
  const patterns = [
    /qa[._-]?test@/i,
    /lead-store-dir/i,
    /fixture-lead/i,
    /CONFENGE_TEST_/i,
    /localhost:\d{4}/i,
    /lorem ipsum/i,
    /example\.invalid/i,
  ];
  for (const re of patterns) {
    const m = String(html).match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

export function hasCalculationIds(html) {
  const text = visibleText(html);
  const money = /R\$\s*\d/.test(text);
  const ids = /\b(item|ID|n[úu]mero|planilha|quantitativo|mem[oó]ria de c[aá]lculo)\b/i.test(text);
  return money && ids;
}

export function incompleteContextAccepted(html) {
  const text = visibleText(html);
  return /incomplet|desconhecid|ainda n[aã]o confirmad|sem (o )?documento|dados m[ií]nimos|n[aã]o impede/i.test(
    text,
  );
}

export function requiredCnpj(html) {
  return /<input[^>]+(name|id)=["'][^"']*cnpj[^"']*["'][^>]*required/i.test(html);
}

export function noscriptHonesty(html) {
  return /<noscript\b/i.test(html) || /class=["'][^"']*no-js/i.test(html);
}
