/**
 * Partner reference kits and share-link builder.
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
export const REQUIRED_KIT_COUNT = 4;

export const REQUIRED_KIT_IDS = Object.freeze([
  "orcamento-quantitativos",
  "revisao-tecnica",
  "compatibilizacao-interfaces",
  "elaboracao-complementar",
]);

export const DEDICATED_PURCHASE_PATHS = Object.freeze({
  "orcamento-quantitativos": "/quantitativos-orcamento-obras/",
  "revisao-tecnica": "/revisao-tecnica-projetos-engenharia/",
  "compatibilizacao-interfaces": "/compatibilizacao-projetos-engenharia/",
  "elaboracao-complementar": "/projetos-complementares-engenharia/",
});

export const SUBSTITUTE_DESTINATION = "/servicos/#servico-projeto";

export const KIT_SAMPLE_CONTRACT = Object.freeze({
  "orcamento-quantitativos": {
    purchase: "orcamento",
    allowedKinds: ["quantitativos_planilha"],
    forbiddenSamplePathPrefixes: ["/casos/modelo-base-quantitativa-canonica/"],
  },
  "revisao-tecnica": {
    purchase: "revisao",
    allowedKinds: ["review_findings"],
    forbiddenSampleKinds: ["illustrative_schema", "clash_interfaces"],
    mismatchAgainstKit: "elaboracao-complementar",
  },
  "compatibilizacao-interfaces": {
    purchase: "compatibilizacao",
    allowedKinds: ["clash_interfaces"],
    forbiddenSampleKinds: ["quantitativos_planilha", "illustrative_schema"],
  },
  "elaboracao-complementar": {
    purchase: "elaboracao",
    allowedKinds: ["illustrative_schema"],
    forbiddenSampleKinds: ["clash_interfaces", "quantitativos_planilha", "review_findings"],
    illustrationLabelRequired: true,
  },
});

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
  "cada conjunto aponta à entrega",
  "cada conjunto aponta a entrega",
  "não à home",
  "nao a home",
  "garantia de não competição",
  "garantia de nao competicao",
  "não competição",
  "nao competicao",
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
  if (!Array.isArray(catalog.kits) || catalog.kits.length !== REQUIRED_KIT_COUNT) {
    throw new Error("partner_reference_requires_four_kits");
  }
  const ids = catalog.kits.map((kit) => kit.id);
  for (const required of REQUIRED_KIT_IDS) {
    if (!ids.includes(required)) {
      throw new Error(`partner_reference_missing_kit:${required}`);
    }
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

export function pathOnly(routePath) {
  const raw = String(routePath || "");
  const hashIndex = raw.indexOf("#");
  return (hashIndex === -1 ? raw : raw.slice(0, hashIndex)).split("?", 1)[0];
}

export function fragmentOf(routePath, explicit) {
  if (explicit) {
    const frag = String(explicit);
    return frag.startsWith("#") ? frag : `#${frag}`;
  }
  const raw = String(routePath || "");
  const hashIndex = raw.indexOf("#");
  return hashIndex === -1 ? "" : raw.slice(hashIndex);
}

export function hrefWithFragment(routePath, fragment) {
  const pathPart = pathOnly(routePath);
  const frag = fragmentOf(routePath, fragment || undefined);
  if (!pathPart.startsWith("/")) return null;
  return `${pathPart}${frag}`;
}

function defaultFileExists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

export function normalizeDestinationKey(routePath) {
  return hrefWithFragment(pathOnly(routePath), fragmentOf(routePath)) || "";
}

export function isSubstituteDestination(routePath) {
  const key = normalizeDestinationKey(routePath);
  return key === SUBSTITUTE_DESTINATION || pathOnly(routePath) === "/servicos/" && fragmentOf(routePath) === "#servico-projeto";
}

export function pairingReason(kit, catalog) {
  const contract = KIT_SAMPLE_CONTRACT[kit.id];
  if (!contract) {
    return { ok: false, reason: "unknown_kit_id" };
  }
  const destPath = pathOnly(kit.destination?.path);
  const samplePath = pathOnly(kit.sample?.path);
  const sampleKind = kit.sample?.kind || null;
  const dedicated = DEDICATED_PURCHASE_PATHS[kit.id];

  if (dedicated && isSubstituteDestination(kit.destination?.path)) {
    return { ok: false, reason: "destination_is_substitute" };
  }

  if (contract.mismatchAgainstKit && catalog) {
    const other = catalog.kits.find((item) => item.id === contract.mismatchAgainstKit);
    if (other) {
      const otherDest = pathOnly(other.destination?.path);
      const otherSample = pathOnly(other.sample?.path);
      if (destPath && destPath === otherDest) {
        return { ok: false, reason: "kit_sample_mismatch" };
      }
      if (samplePath && otherSample && samplePath === otherSample && sampleKind === other.sample?.kind) {
        return { ok: false, reason: "kit_sample_mismatch" };
      }
    }
  }

  if (contract.allowedKinds && sampleKind && !contract.allowedKinds.includes(sampleKind)) {
    return { ok: false, reason: "kit_sample_mismatch" };
  }
  if (contract.forbiddenSampleKinds && sampleKind && contract.forbiddenSampleKinds.includes(sampleKind)) {
    return { ok: false, reason: "kit_sample_mismatch" };
  }
  if (contract.forbiddenSamplePathPrefixes) {
    const sampleHref = String(kit.sample?.path || "");
    if (contract.forbiddenSamplePathPrefixes.some((prefix) => sampleHref === prefix || sampleHref.startsWith(prefix))) {
      return { ok: false, reason: "kit_sample_mismatch" };
    }
  }
  if (contract.illustrationLabelRequired) {
    const labeled = kit.sample?.labeled_as_illustration === true
      || /ilustra/i.test(String(kit.sample?.label || ""));
    if (sampleKind === "illustrative_schema" && !labeled) {
      return { ok: false, reason: "kit_sample_mismatch" };
    }
  }
  return { ok: true, reason: null };
}

function discoverSample(root, catalog, kit, fileExists) {
  const sample = kit.sample || {};
  const pairing = pairingReason(kit, catalog);
  if (!pairing.ok) {
    return {
      path: sample.path || null,
      fragment: fragmentOf(sample.path, sample.fragment) || "",
      id: sample.id || null,
      label: sample.label || null,
      kind: sample.kind || null,
      status: "refused",
      reason: pairing.reason,
      labeled_as_illustration: Boolean(sample.labeled_as_illustration),
    };
  }

  const files = Array.isArray(sample.files) ? sample.files : [];
  const missingFiles = files.filter((rel) => !fileExists(root, rel));
  if (files.length && missingFiles.length) {
    return {
      path: sample.path || null,
      fragment: fragmentOf(sample.path, sample.fragment) || "",
      id: sample.id || null,
      label: sample.label || null,
      kind: sample.kind || null,
      status: "missing",
      reason: "sample_file_missing",
      missing_files: missingFiles,
      labeled_as_illustration: Boolean(sample.labeled_as_illustration),
    };
  }

  if (sample.path && routeExists(root, sample.path)) {
    return {
      path: pathOnly(sample.path),
      fragment: fragmentOf(sample.path, sample.fragment) || "",
      href: hrefWithFragment(sample.path, sample.fragment),
      id: sample.id,
      label: sample.label,
      kind: sample.kind,
      status: "present",
      labeled_as_illustration: Boolean(sample.labeled_as_illustration) || /ilustra/i.test(String(sample.label || "")),
    };
  }

  if (!sample.required) {
    return {
      path: null,
      fragment: "",
      id: null,
      label: null,
      kind: sample.kind || null,
      status: "not_included",
    };
  }

  return {
    path: sample.path || null,
    fragment: fragmentOf(sample.path, sample.fragment) || "",
    id: sample.id || null,
    label: sample.label || null,
    kind: sample.kind || null,
    status: sample.path ? "missing" : "not_included",
    labeled_as_illustration: Boolean(sample.labeled_as_illustration),
  };
}

export function resolveKits(root = DEFAULT_ROOT, options = {}) {
  const catalog = options.catalog || loadKitCatalog(root);
  const fileExists = options.fileExists || defaultFileExists;
  return catalog.kits.map((kit) => {
    const destPath = kit.destination?.path;
    const destExists = routeExists(root, destPath);
    const pairing = pairingReason(kit, catalog);
    const sample = discoverSample(root, catalog, kit, fileExists);
    const shareFragment = kit.share?.fragment
      || (pathOnly(sample.path) === pathOnly(destPath) ? sample.fragment : "");
    const shareHref = hrefWithFragment(destPath, shareFragment);
    let status = "ok";
    let reason = null;
    if (!pairing.ok) {
      status = "refused";
      reason = pairing.reason;
    } else if (kit.destination?.required && !destExists) {
      status = "refused";
      reason = "destination_missing";
    }

    return {
      id: kit.id,
      title: kit.title,
      purchase: kit.purchase,
      intent_family: kit.intent_family,
      offer_id: kit.offer_id,
      status,
      reason,
      destination: {
        path: destPath,
        label: kit.destination.label,
        status: destExists ? "present" : "missing",
        canonical: canonicalDeliveryUrl(destPath, catalog.site_origin),
        proposal_fragment: kit.destination.proposal_fragment || "",
        proposal_href: hrefWithFragment(destPath, kit.destination.proposal_fragment || ""),
        proposal_label: kit.destination.proposal_label || "Solicitar proposta",
      },
      sample,
      conversation: kit.conversation,
      share: {
        ...kit.share,
        href: shareHref,
        fragment: shareFragment || "",
        title: kit.share?.title || kit.destination.label,
        copyable_summary: kit.share?.copyable_summary || "",
      },
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

export function kitShareBundle(kit, catalog, root = DEFAULT_ROOT) {
  const origin = catalog.site_origin || SITE_ORIGIN;
  const shareHref = kit.share?.href || hrefWithFragment(kit.destination.path, kit.share?.fragment);
  const sampleHref = kit.sample?.href || hrefWithFragment(kit.sample?.path, kit.sample?.fragment);
  const internal = buildShareUrl({ destination: shareHref, mode: "internal" }, root);
  const external = buildShareUrl({
    destination: shareHref,
    mode: "external",
    params: {
      utm_source: "partner_kit",
      utm_medium: "referral",
      utm_campaign: kit.share?.utm_campaign,
      cta_id: kit.share?.cta_id,
      asset_id: catalog.id,
      route_family: "parcerias-engenharia",
    },
  }, root);
  const destinationCanonical = canonicalDeliveryUrl(pathOnly(kit.destination.path), origin);
  const shareCanonical = canonicalDeliveryUrl(shareHref, origin);
  const sampleCanonical = sampleHref ? canonicalDeliveryUrl(sampleHref, origin) : null;
  return {
    id: kit.id,
    title: kit.share?.title || kit.destination.label,
    destinationHref: pathOnly(kit.destination.path),
    sampleHref,
    proposalHref: kit.destination.proposal_href,
    shareHref,
    internal,
    external,
    destinationCanonical,
    shareCanonical,
    sampleCanonical,
    copyable_summary: kit.share?.copyable_summary || "",
  };
}

export function publicSurfaces(root = DEFAULT_ROOT, options = {}) {
  const catalog = options.catalog || loadKitCatalog(root);
  const kits = resolveKits(root, { ...options, catalog });
  return kits.map((kit) => kitShareBundle(kit, catalog, root));
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
  const hits = FORBIDDEN_PUBLIC_PHRASES.filter((phrase) => text.includes(phrase));
  if (/\bsla\b/i.test(text)) hits.push("sla");
  return hits;
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
  const docsDirs = [
    path.join(root, "docs/campaigns/inb-20260911/11"),
    path.join(root, "docs/campaigns/pos-inb-20260911/05"),
  ];
  const site = path.join(root, "_site");
  if (!fs.existsSync(site)) return false;
  const leaked = [];
  for (const docsDir of docsDirs) {
    if (!fs.existsSync(docsDir)) continue;
    for (const name of fs.readdirSync(docsDir)) {
      const rel = path.relative(root, path.join(docsDir, name));
      if (fs.existsSync(path.join(site, rel))) leaked.push(rel);
    }
  }
  return leaked;
}

export function htmlAgreesWithSurfaces(html, surfaces) {
  const failures = [];
  for (const surface of surfaces) {
    if (!html.includes(`id="kit-${surface.id}"`)) {
      failures.push(`missing_kit_article:${surface.id}`);
    }
    if (!html.includes(`href="${surface.destinationHref}"`)) {
      failures.push(`missing_destination_href:${surface.id}:${surface.destinationHref}`);
    }
    if (surface.sampleHref && !html.includes(`href="${surface.sampleHref}"`)) {
      failures.push(`missing_sample_href:${surface.id}:${surface.sampleHref}`);
    }
    if (surface.proposalHref && !html.includes(`href="${surface.proposalHref}"`)) {
      failures.push(`missing_proposal_href:${surface.id}:${surface.proposalHref}`);
    }
    if (surface.title && !html.includes(surface.title)) {
      failures.push(`missing_title:${surface.id}`);
    }
    if (surface.shareCanonical && !html.includes(surface.shareCanonical)) {
      failures.push(`missing_share_canonical:${surface.id}`);
    }
    if (surface.copyable_summary) {
      const snippet = surface.copyable_summary.split("\n")[0];
      if (!html.includes(snippet)) {
        failures.push(`missing_copyable_summary:${surface.id}`);
      }
    }
    if (surface.external?.ok) {
      const encoded = surface.external.url.replaceAll("&", "&amp;");
      if (!html.includes(`data-share-attributed="${encoded}"`) && !html.includes(surface.external.url)) {
        failures.push(`missing_attributed:${surface.id}`);
      }
    }
  }
  return failures;
}
