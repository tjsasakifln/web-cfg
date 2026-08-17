/**
 * Commercial feature flags. Defaults are fail-closed / money off.
 */
const path = require("path");
const fs = require("fs");

const DEFAULTS = Object.freeze({
  CONFENGE_OFFER_CATALOG_PUBLIC: false,
  ASAAS_MODE: "disabled",
  production_checkout_enabled: false,
  production_webhook_enabled: false,
  real_money_mutation_enabled: false,
});

function loadFileFlags() {
  const file = path.join(__dirname, "../../data/offers/flags.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function boolFromEnv(name, fallback, env = process.env) {
  const value = env[name];
  if (value == null || value === "") return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function loadFlags(env = process.env) {
  const file = loadFileFlags();
  return {
    CONFENGE_OFFER_CATALOG_PUBLIC: boolFromEnv(
      "CONFENGE_OFFER_CATALOG_PUBLIC",
      file.CONFENGE_OFFER_CATALOG_PUBLIC === true ? true : DEFAULTS.CONFENGE_OFFER_CATALOG_PUBLIC,
      env,
    ),
    ASAAS_MODE: env.ASAAS_MODE || file.ASAAS_MODE || DEFAULTS.ASAAS_MODE,
    production_checkout_enabled: boolFromEnv(
      "CONFENGE_PRODUCTION_CHECKOUT",
      file.production_checkout_enabled === true ? true : DEFAULTS.production_checkout_enabled,
      env,
    ),
    production_webhook_enabled: boolFromEnv(
      "CONFENGE_PRODUCTION_WEBHOOK",
      file.production_webhook_enabled === true ? true : DEFAULTS.production_webhook_enabled,
      env,
    ),
    real_money_mutation_enabled: boolFromEnv(
      "CONFENGE_REAL_MONEY",
      file.real_money_mutation_enabled === true ? true : DEFAULTS.real_money_mutation_enabled,
      env,
    ),
  };
}

function catalogPublic(env) {
  return loadFlags(env).CONFENGE_OFFER_CATALOG_PUBLIC === true;
}

function moneyEnabled(env) {
  const flags = loadFlags(env);
  return flags.real_money_mutation_enabled === true && flags.ASAAS_MODE !== "disabled";
}

function checkoutEnabled(env) {
  const flags = loadFlags(env);
  return flags.production_checkout_enabled === true && moneyEnabled(env);
}

module.exports = {
  DEFAULTS,
  loadFlags,
  catalogPublic,
  moneyEnabled,
  checkoutEnabled,
};
