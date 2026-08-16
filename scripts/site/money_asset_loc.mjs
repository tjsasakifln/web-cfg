/**
 * Sitemap loc membership for the Diagnóstico money asset.
 * Parses each <loc> with the WHATWG URL parser. Substring / includes()
 * host checks are not membership.
 */

export const CONFENGE_HOST = "confenge.com.br";
export const MONEY_ASSET_PATH = "/ferramentas/diagnostico-defesa-margem/";
export const MONEY_ASSET_CANONICAL = `https://${CONFENGE_HOST}${MONEY_ASSET_PATH}`;

const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function isConfengeMoneyAssetLoc(value) {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw || !ABSOLUTE_SCHEME.test(raw)) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname !== CONFENGE_HOST) return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "") return false;
  if (url.pathname !== MONEY_ASSET_PATH) return false;
  if (url.search !== "" || url.hash !== "") return false;
  return true;
}

export function parseSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(String(xml))) !== null) {
    locs.push(match[1].trim());
  }
  return locs;
}

export function sitemapHasMoneyAssetLoc(xml) {
  return parseSitemapLocs(xml).some(isConfengeMoneyAssetLoc);
}

export const MONEY_ASSET_LOC_SPOOFS = Object.freeze([
  "https://evil.tld/https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "https://confenge.com.br.evil.tld/ferramentas/diagnostico-defesa-margem/",
  "https://confenge.com.br@evil.tld/ferramentas/diagnostico-defesa-margem/",
  "https://user@confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "https://user:pass@confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "//evil.tld/https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "//confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "http://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "https://www.confenge.com.br/ferramentas/diagnostico-defesa-margem/",
  "https://confenge.com.br:8443/ferramentas/diagnostico-defesa-margem/",
  "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/?q=1",
  "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/#x",
]);
