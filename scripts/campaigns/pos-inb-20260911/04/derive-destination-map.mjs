/**
 * Build point of the private-readiness destination map.
 * Derives dests from CONFENGE_PURCHASE_ROUTE_MAP by purchase_id / function.
 * Shared offer_id complementary_engineering_project_review is never resolved
 * by first catalog row: review of received material uses revisao-tecnica-projetos.
 *
 * Campaign 04 embeds the result in the owned landing. Campaign 10 may wire a
 * canonical global from this same function; do not invent a second taxonomy.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(here, "../../../..");
export const AUTHORITY_REL = "data/bofu-dominance/core/purchase-route-map.v1.json";
export const LANDING_REL = "ferramentas/prontidao-tecnica-obra-privada/index.html";
export const MAP_SCHEMA = "confenge.canonical-destination-map/1.0";
export const AUTHORITY_CONTRACT = "CONFENGE_PURCHASE_ROUTE_MAP/1.0.0";

export const TOOL_PURCHASES = Object.freeze([
  Object.freeze({
    purchase_id: "quantitativos-orcamento",
    route_id: "orcamento",
    offer_id: "quantity_takeoff_budgeting",
    function_includes: ["quantitativo", "orçamento"],
  }),
  Object.freeze({
    purchase_id: "compatibilizacao-projetos",
    route_id: "compatibilizacao",
    offer_id: "bim_coordination_clash_register",
    function_includes: ["interfaces", "interferências"],
  }),
  Object.freeze({
    purchase_id: "revisao-tecnica-projetos",
    route_id: "revisao",
    offer_id: "complementary_engineering_project_review",
    function_includes: ["revisão de um projeto já existente"],
    forbidden_owner_purchase_ids: ["projetos-complementares"],
  }),
]);

export const ELABORATION_PURCHASE_ID = "projetos-complementares";
export const SHARED_REVIEW_OFFER_ID = "complementary_engineering_project_review";

export function loadPurchaseRouteMap(root = DEFAULT_ROOT) {
  const path = resolve(root, AUTHORITY_REL);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || !Array.isArray(raw.purchases)) {
    throw new Error("purchase_route_map_missing_purchases");
  }
  return raw;
}

export function normalizePublicPath(value) {
  if (typeof value !== "string" || !value) return null;
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  if (!path.startsWith("/") || path.includes("://") || path.includes("#")) return null;
  if (!path.endsWith("/")) path += "/";
  return path;
}

export function htmlExistsForPath(publicPath, root = DEFAULT_ROOT) {
  const norm = normalizePublicPath(publicPath);
  if (!norm) return false;
  return existsSync(resolve(root, norm.replace(/^\//, ""), "index.html"));
}

export function purchaseById(authority, purchaseId) {
  return (authority.purchases || []).find((row) => row.purchase_id === purchaseId) || null;
}

export function purchasesSharingOffer(authority, offerId) {
  return (authority.purchases || []).filter((row) => row.offer_id === offerId);
}

export function ownerPurchaseOfPath(authority, publicPath) {
  const want = normalizePublicPath(publicPath);
  if (!want) return null;
  const hits = [];
  for (const row of authority.purchases || []) {
    const candidates = [
      row.proposed_primary_url,
      row.requested_alias,
      row.primary_url,
      row.canonical,
    ];
    for (const candidate of candidates) {
      if (normalizePublicPath(candidate) === want) {
        hits.push(row);
        break;
      }
    }
  }
  if (hits.length === 1) return hits[0];
  const exactProposed = hits.find((row) => normalizePublicPath(row.proposed_primary_url) === want);
  return exactProposed || hits[0] || null;
}

export function releasedPathForPurchase(purchase, root = DEFAULT_ROOT) {
  if (!purchase) return null;
  const candidates = [
    purchase.proposed_primary_url,
    purchase.requested_alias,
    purchase.primary_url,
  ];
  for (const candidate of candidates) {
    const path = normalizePublicPath(candidate);
    if (path && htmlExistsForPath(path, root)) return path;
  }
  return null;
}

function functionText(purchase) {
  return String(purchase && purchase.function_differentiation ? purchase.function_differentiation : "").toLowerCase();
}

export function functionMatchesSpec(purchase, spec) {
  const text = functionText(purchase);
  if (!text) return false;
  for (const token of spec.function_includes || []) {
    if (!text.includes(String(token).toLowerCase())) return false;
  }
  return true;
}

export function deriveToolDestinationMap(authority, root = DEFAULT_ROOT) {
  const by_purchase_id = {};
  const by_route_id = {};
  const derived = [];
  const missing = [];

  for (const spec of TOOL_PURCHASES) {
    const purchase = purchaseById(authority, spec.purchase_id);
    if (!purchase) {
      missing.push({ purchase_id: spec.purchase_id, reason: "absent_from_authority" });
      continue;
    }
    const path = releasedPathForPurchase(purchase, root);
    if (!path) {
      missing.push({ purchase_id: spec.purchase_id, reason: "released_html_absent" });
      continue;
    }
    const entry = {
      path,
      purchase_id: spec.purchase_id,
      route_id: spec.route_id,
      offer_id: spec.offer_id,
      intent_family: purchase.intent_family || null,
      function_differentiation: purchase.function_differentiation || null,
    };
    by_purchase_id[spec.purchase_id] = entry;
    by_route_id[spec.route_id] = { ...entry };
    derived.push({ spec, purchase, entry });
  }

  const by_offer_id = {};
  const shared_offer_ids = {};
  const offerIds = new Set(derived.map((row) => row.spec.offer_id));
  for (const offerId of offerIds) {
    const owners = purchasesSharingOffer(authority, offerId);
    if (owners.length > 1) {
      shared_offer_ids[offerId] = owners.map((row) => row.purchase_id);
      continue;
    }
    const row = derived.find((item) => item.spec.offer_id === offerId);
    if (row) {
      by_offer_id[offerId] = {
        path: row.entry.path,
        purchase_id: row.entry.purchase_id,
        route_id: row.entry.route_id,
        intent_family: row.entry.intent_family,
      };
    }
  }

  return {
    schema: MAP_SCHEMA,
    derived_from: AUTHORITY_CONTRACT,
    authority_path: AUTHORITY_REL,
    by_purchase_id,
    by_route_id,
    by_offer_id,
    shared_offer_ids,
    missing,
  };
}

export function parseEmbeddedMap(html) {
  const match = String(html || "").match(/id="pptr-destination-map">([^<]+)</);
  if (!match) return null;
  return JSON.parse(match[1]);
}

export function readEmbeddedMapFromLanding(root = DEFAULT_ROOT) {
  const html = readFileSync(resolve(root, LANDING_REL), "utf8");
  return { html, map: parseEmbeddedMap(html) };
}

function fail(failures, code, detail) {
  failures.push({ code, detail });
}

export function assertReleasedComposition(map, authority, root = DEFAULT_ROOT) {
  const failures = [];
  if (!map || typeof map !== "object") {
    fail(failures, "map_missing", "published map is not an object");
    return failures;
  }
  const byPurchase = map.by_purchase_id && typeof map.by_purchase_id === "object" ? map.by_purchase_id : {};
  const byOffer = map.by_offer_id && typeof map.by_offer_id === "object" ? map.by_offer_id : {};

  for (const spec of TOOL_PURCHASES) {
    const purchase = purchaseById(authority, spec.purchase_id);
    if (!purchase) {
      fail(failures, "authority_purchase_missing", spec.purchase_id);
      continue;
    }
    if (!functionMatchesSpec(purchase, spec)) {
      fail(
        failures,
        "function_mismatch",
        spec.purchase_id + ": " + (purchase.function_differentiation || ""),
      );
    }
    const expectedPath = releasedPathForPurchase(purchase, root);
    if (!expectedPath) {
      fail(failures, "released_html_absent", spec.purchase_id);
      continue;
    }
    const entry = byPurchase[spec.purchase_id];
    if (!entry || !entry.path) {
      fail(failures, "purchase_key_missing", spec.purchase_id);
      continue;
    }
    const got = normalizePublicPath(entry.path);
    if (got !== expectedPath) {
      fail(
        failures,
        "path_mismatch",
        spec.purchase_id + " expected " + expectedPath + " got " + String(entry.path),
      );
    }
    if (!htmlExistsForPath(got, root)) {
      fail(failures, "path_html_absent", spec.purchase_id + " " + got);
    }
    const owner = ownerPurchaseOfPath(authority, got);
    if (!owner) {
      fail(failures, "path_not_in_authority", spec.purchase_id + " " + got);
    } else if (owner.purchase_id !== spec.purchase_id) {
      fail(
        failures,
        "purchase_function_semantics",
        spec.purchase_id +
          " path " +
          got +
          " belongs to " +
          owner.purchase_id +
          " (" +
          (owner.function_differentiation || "") +
          ")",
      );
    }
    for (const forbiddenId of spec.forbidden_owner_purchase_ids || []) {
      const forbidden = purchaseById(authority, forbiddenId);
      const forbiddenPath = forbidden ? releasedPathForPurchase(forbidden, root) : null;
      if (forbiddenPath && got === forbiddenPath) {
        fail(
          failures,
          "purchase_function_semantics",
          spec.purchase_id +
            " must not use " +
            forbiddenPath +
            " (purchase " +
            forbiddenId +
            ")",
        );
      }
    }
    if (entry.offer_id && entry.offer_id !== spec.offer_id) {
      fail(failures, "offer_id_mismatch", spec.purchase_id);
    }
  }

  const sharedOwners = purchasesSharingOffer(authority, SHARED_REVIEW_OFFER_ID);
  if (sharedOwners.length > 1 && byOffer[SHARED_REVIEW_OFFER_ID] && byOffer[SHARED_REVIEW_OFFER_ID].path) {
    fail(
      failures,
      "shared_offer_unique_mapping",
      SHARED_REVIEW_OFFER_ID +
        " is shared by " +
        sharedOwners.map((row) => row.purchase_id).join(",") +
        " and must not be a unique by_offer_id path",
    );
  }

  const reviewEntry = byPurchase["revisao-tecnica-projetos"];
  const elab = purchaseById(authority, ELABORATION_PURCHASE_ID);
  const elabPath = elab ? releasedPathForPurchase(elab, root) : null;
  if (reviewEntry && elabPath && normalizePublicPath(reviewEntry.path) === elabPath) {
    fail(
      failures,
      "purchase_function_semantics",
      "revisao-tecnica-projetos path is the elaboration landing " + elabPath,
    );
  }

  return failures;
}

export function embedMapScript(map) {
  const json = JSON.stringify({
    schema: map.schema || MAP_SCHEMA,
    derived_from: map.derived_from || AUTHORITY_CONTRACT,
    by_purchase_id: map.by_purchase_id || {},
    by_route_id: map.by_route_id || {},
    by_offer_id: map.by_offer_id || {},
    shared_offer_ids: map.shared_offer_ids || {},
  });
  return '<script type="application/json" id="pptr-destination-map">' + json + "</script>";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = DEFAULT_ROOT;
  const authority = loadPurchaseRouteMap(root);
  const map = deriveToolDestinationMap(authority, root);
  const failures = assertReleasedComposition(map, authority, root);
  const payload = { map, failures, missing: map.missing };
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  if (failures.length || (map.missing && map.missing.length)) process.exit(1);
}
