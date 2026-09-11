/**
 * Partner reference kits and share-link builder for INB-11.
 * Pure resolution: no network, no send, no CRM.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

export const KIT_CATALOG_REL = "data/distribution/partner-reference-kits.v1.json";
export const PUBLIC_PAGE_REL = "parcerias-engenharia/index.html";
export const SHARE_SCRIPT_REL = "parcerias-engenharia/share.js";
export const SITE_ORIGIN = "https://confenge.com.br";

export const ALLOWED_DESTINATION_ORIGINS = Object.freeze([
  "https://confenge.com.br",
  "https://www.confenge.com.br",
]);

export const SENSITIVE_PARAM_KEYS = Object.freeze([
  "email",
  "nome",
  "name",
  "cpf",
  "cnpj",
  "telefone",
  "phone",
  "tel",
  "whatsapp",
  "partner",
  "partner_id",
  "partner_email",
  "partner_name",
  "destinatario",
  "destinatario_email",
  "destinatario_nome",
  "mensagem",
  "message",
]);

export const FORBIDDEN_PUBLIC_PHRASES = Object.freeze([
  "white-label",
  "white label",
  "comissao",
  "comissão",
  "exclusividade",
  "exclusivo",
  "sigilo contratual",
  "depoimento",
]);

const HASH_SPLIT = /[#?]/;

function leadCore(root = DEFAULT_ROOT) {
  return require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
}

function eventRegistry(root = DEFAULT_ROOT) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "netlify/functions/lib/event-registry.json"), "utf8"),
  );
}

export function loadKitCatalog(root = DEFAULT_ROOT) {
  const file = path.join(root, KIT_CATALOG_REL);
  const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
  if (catalog.auto_send !== false) {
    throw new Error("partner_reference_auto_send_must_be_false");
  }
  if (catalog.send_forbidden !== true) {
    throw new Error("partner_reference_send_must_be_forbidden");
  }
  if (!Array.isArray(catalog.kits) || catalog.kits.length !== 3) {
    throw new Error("partner_reference_requires_three_kits");
  }
  return catalog;
}

export function filesystemPathForRoute(routePath) {
  const raw = String(routePath || "");
  const withoutQuery = raw.split(HASH_SPLIT, 1)[0];
  if (!withoutQuery.startsWith("/")) return null;
  const trimmed = withoutQuery.replace(/\/+$/, "");
  if (!trimmed) return "index.html";
  return `${trimmed.replace(/^\//, "")}/index.html`;
}

export function routeExists(root, routePath) {
  const rel = filesystemPathForRoute(routePath);
  if (!rel) return false;
  return fs.existsSync(path.join(root, rel));
}

function discoverOptionalSample(root, catalog, kit) {
  const sample = kit.sample || {};
  if (sample.path && routeExists(root, sample.path)) {
    return {
      path: sample.path,
      id: sample.id,
      label: sample.label,
      kind: sample.kind,
      status: "present",
    };
  }
  if (sample.enrichment_campaign === "12" || kit.id === "complementares") {
    const candidates = catalog.optional_enrichment?.candidate_paths || [];
    for (const candidate of candidates) {
      if (routeExists(root, candidate)) {
        return {
          path: candidate,
          id: sample.id || "inb12-complementares",
          label: sample.label || "Amostra da disciplina complementar",
          kind: "optional_enrichment",
          status: "present",
          enrichment_campaign: "12",
        };
      }
    }
    return {
      path: null,
      id: null,
      label: null,
      kind: "optional_enrichment",
      status: "not_included",
      enrichment_campaign: "12",
    };
  }
  if (!sample.required) {
    return { path: null, id: null, label: null, kind: sample.kind || null, status: "not_included" };
  }
  return {
    path: sample.path || null,
    id: sample.id || null,
    label: sample.label || null,
    kind: sample.kind || null,
    status: sample.path ? "missing" : "not_included",
  };
}

export function resolveKits(root = DEFAULT_ROOT) {
  const catalog = loadKitCatalog(root);
  return catalog.kits.map((kit) => {
    const destPath = kit.destination?.path;
    const destExists = routeExists(root, destPath);
    const sample = discoverOptionalSample(root, catalog, kit);
    if (kit.destination?.required && !destExists) {
      throw new Error(`partner_kit_destination_missing:${kit.id}:${destPath}`);
    }
    if (kit.sample?.required && sample.status !== "present") {
      throw new Error(`partner_kit_sample_missing:${kit.id}:${kit.sample?.path}`);
    }
    return {
      id: kit.id,
      title: kit.title,
      purchase: kit.purchase,
      intent_family: kit.intent_family,
      offer_id: kit.offer_id,
      destination: {
        path: destPath,
        label: kit.destination.label,
        status: destExists ? "present" : "missing",
        canonical: canonicalDeliveryUrl(destPath, catalog.site_origin),
      },
      sample,
      conversation: kit.conversation,
      share: kit.share,
    };
  });
}

export function canonicalDeliveryUrl(routePath, origin = SITE_ORIGIN) {
  const raw = String(routePath || "");
  const hashIndex = raw.indexOf("#");
  const pathPart = (hashIndex === -1 ? raw : raw.slice(0, hashIndex)).split("?", 1)[0];
  const hash = hashIndex === -1 ? "" : raw.slice(hashIndex);
  if (!pathPart.startsWith("/")) return null;
  return `${origin.replace(/\/$/, "")}${pathPart}${hash}`;
}

export function isAllowedShareDestination(value, origin = SITE_ORIGIN) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/[\u0000-\u001f]/.test(raw)) return false;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("\\") || raw.includes("://")) return false;
    return true;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const allowed = new Set([...ALLOWED_DESTINATION_ORIGINS, origin.replace(/\/$/, "")]);
  const candidate = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  if (!allowed.has(candidate) && !allowed.has(`${parsed.protocol}//${parsed.hostname}`)) {
    return false;
  }
  return parsed.pathname.startsWith("/");
}

function dropSensitiveKeys(params) {
  const out = {};
  const src = params && typeof params === "object" ? params : {};
  for (const [key, value] of Object.entries(src)) {
    const lower = String(key).toLowerCase();
    if (SENSITIVE_PARAM_KEYS.includes(lower)) continue;
    if (SENSITIVE_PARAM_KEYS.some((token) => lower.includes(token))) continue;
    out[key] = value;
  }
  return out;
}

export function buildShareUrl(input = {}, root = DEFAULT_ROOT) {
  const core = leadCore(root);
  const mode = input.mode === "internal" ? "internal" : "external";
  const destination = String(input.destination || "");
  if (!isAllowedShareDestination(destination, input.siteOrigin || SITE_ORIGIN)) {
    return {
      ok: false,
      reason: "destination_not_allowlisted",
      url: null,
    };
  }

  const canonical = destination.startsWith("/")
    ? canonicalDeliveryUrl(destination, input.siteOrigin || SITE_ORIGIN)
    : (() => {
        const parsed = new URL(destination);
        return `${parsed.origin}${parsed.pathname}${parsed.hash}`;
      })();

  if (mode === "internal") {
    const parsed = new URL(canonical);
    return {
      ok: true,
      mode,
      url: `${parsed.pathname}${parsed.hash}`,
      params: {},
    };
  }

  const cleaned = dropSensitiveKeys(input.params);
  const picked = core.pickAttribution(cleaned);
  for (const key of SENSITIVE_PARAM_KEYS) {
    if (picked[key]) delete picked[key];
  }

  const parsed = new URL(canonical);
  for (const [key, value] of Object.entries(picked)) {
    parsed.searchParams.set(key, String(value));
  }
  return {
    ok: true,
    mode,
    url: parsed.toString(),
    params: picked,
  };
}

export function classifyShareAction(root = DEFAULT_ROOT) {
  const registry = eventRegistry(root);
  const event = registry.events?.cta_click;
  if (!event) throw new Error("cta_click_missing_from_event_registry");
  return {
    event: "cta_click",
    layer: event.layer,
    semantic: event.semantic,
    is_lead: false,
    is_relationship: false,
    is_partner_contact: false,
    requires_receipt: false,
    lead_events: ["lead_form_submit", "lead_persisted", "lead_form_success"],
  };
}

export function publicHtmlHasUtmOnInternalAnchors(html) {
  const matches = String(html || "").matchAll(/<a\b([^>]*)>/gi);
  for (const match of matches) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href=(["'])(.*?)\1/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[2];
    const isInternal = href.startsWith("/") && !href.startsWith("//");
    const isSite = href.startsWith("https://confenge.com.br/") || href.startsWith("https://www.confenge.com.br/");
    if ((isInternal || isSite) && /[?&]utm_/i.test(href)) return true;
  }
  return false;
}

export function publicHtmlForbiddenPhrases(html) {
  const text = String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  return FORBIDDEN_PUBLIC_PHRASES.filter((phrase) => text.includes(phrase));
}

export function shareScriptSendsOutreach(source) {
  const src = String(source || "");
  return /fetch\s*\(|XMLHttpRequest|mailto:.*bcc|smtp|nodemailer|auto_send\s*[:=]\s*true/i.test(src)
    && /lead|smtp|outreach|send/i.test(src);
}

export function send() {
  throw new Error("partner_reference_send_forbidden");
}

export function draftsLeakIntoPublicArtifact(root = DEFAULT_ROOT) {
  const docsDir = path.join(root, "docs/campaigns/inb-20260911/11");
  if (!fs.existsSync(docsDir)) return true;
  const site = path.join(root, "_site");
  if (!fs.existsSync(site)) return false;
  const leaked = [];
  for (const name of fs.readdirSync(docsDir)) {
    if (fs.existsSync(path.join(site, "docs/campaigns/inb-20260911/11", name))) {
      leaked.push(name);
    }
  }
  return leaked;
}
