/**
 * Allowlisted fictional Sandbox identities. Reject any other CPF/CNPJ/email/phone.
 */
const fs = require("fs");
const path = require("path");

const ALLOWLIST_FILE = path.join(__dirname, "../../../data/offers/fixtures/asaas-sandbox/allowlist.json");

function digits(raw) {
  return String(raw == null ? "" : raw).replace(/\D/g, "");
}

function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
  return {
    schema: raw.schema,
    customers: Array.isArray(raw.customers) ? raw.customers : [],
  };
}

function matchFixture(payload, fixtures) {
  const list = fixtures || loadAllowlist();
  const cpfCnpj = digits(payload.cpfCnpj || payload.cnpj || payload.cpf);
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = digits(payload.phone || payload.telefone || payload.mobilePhone);
  const fixtureId = String(payload.fixture_id || payload.sandbox_fixture_id || "").trim();

  let match = null;
  if (fixtureId) match = list.customers.find((item) => item.fixture_id === fixtureId) || null;
  if (!match && cpfCnpj) {
    match = list.customers.find((item) => digits(item.cpfCnpj) === cpfCnpj) || null;
  }
  if (!match && email) {
    match = list.customers.find((item) => String(item.email).toLowerCase() === email) || null;
  }
  if (!match && phone) {
    match = list.customers.find((item) => digits(item.phone) === phone) || null;
  }
  if (!match && payload.sandbox_test === true && payload.offer_id) {
    match = list.customers.find((item) => item.offer_id === payload.offer_id) || list.customers[0] || null;
  }
  if (!match) return { ok: false, error: "pii_not_allowlisted" };

  if (cpfCnpj && digits(match.cpfCnpj) !== cpfCnpj) return { ok: false, error: "pii_not_allowlisted" };
  if (email && String(match.email).toLowerCase() !== email) return { ok: false, error: "pii_not_allowlisted" };
  if (phone && digits(match.phone) !== phone) return { ok: false, error: "pii_not_allowlisted" };
  return { ok: true, fixture: match };
}

function isSandboxTestPayload(payload) {
  return payload && (payload.sandbox_test === true || Boolean(payload.fixture_id) || Boolean(payload.sandbox_fixture_id));
}

module.exports = {
  ALLOWLIST_FILE,
  digits,
  loadAllowlist,
  matchFixture,
  isSandboxTestPayload,
};
