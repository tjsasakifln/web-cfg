const crypto = require("crypto");

const QA_OPT_IN_HEADER = "x-confenge-qa-email";
const QA_OPS_TOKEN_HEADER = "x-confenge-ops-token";
const QA_EXPECTED_SHA_HEADER = "x-confenge-expected-sha";
const QA_RECIPIENT_HEADERS = Object.freeze([
  "x-confenge-qa-recipient",
  "x-confenge-email-recipient",
]);
const FULL_SHA = /^[0-9a-f]{40}$/;

function header(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value == null ? "" : value).trim();
  }
  return "";
}

function constantTimeEqual(provided, expected, minLength = 1) {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(String(expected || ""));
  if (a.length < minLength || b.length < minLength || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function runtimeReleaseSha(env = process.env) {
  const value = String(env.RUNTIME_RELEASE_SHA || env.COMMIT_REF || "").trim().toLowerCase();
  return FULL_SHA.test(value) ? value : "";
}

function qaEmailIdempotencyKey(record) {
  const id = String((record && record.lead_id) || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(id)) return null;
  return `qa-email/${id}`.slice(0, 256);
}

function sanitizeProviderId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}

/**
 * Fail-closed authorization for the one-shot inbox verification branch.
 * Nothing here enables a persistent environment flag: the caller must prove
 * every request with the probe credential (originCheck.probe), the ops token,
 * an exact release SHA and the explicit request header.
 */
function authorizeQaEmailRequest({ event, originCheck, record, env = process.env }) {
  const requested = header(event, QA_OPT_IN_HEADER) === "1";
  if (!requested) return { requested: false, ok: false, reason: "not_requested" };

  if (QA_RECIPIENT_HEADERS.some((name) => header(event, name))) {
    return { requested: true, ok: false, status: 400, reason: "recipient_override_forbidden" };
  }
  if (header(event, "x-confenge-probe-persist-only") === "1") {
    return { requested: true, ok: false, status: 400, reason: "persist_only_incompatible" };
  }
  if (!originCheck || originCheck.probe !== true) {
    return { requested: true, ok: false, status: 403, reason: "authenticated_probe_required" };
  }
  if (
    !record ||
    record.record_kind !== "synthetic" ||
    record.synthetic_probe_authenticated !== true ||
    record.next_action !== "exclude_from_commercial"
  ) {
    return { requested: true, ok: false, status: 403, reason: "synthetic_record_required" };
  }

  const configuredOpsToken = String(env.OPS_TOKEN || env.REVOPS_TOKEN || "");
  const providedOpsToken = header(event, QA_OPS_TOKEN_HEADER);
  if (!constantTimeEqual(providedOpsToken, configuredOpsToken, 16)) {
    return { requested: true, ok: false, status: 403, reason: "ops_token_invalid" };
  }

  const expectedSha = header(event, QA_EXPECTED_SHA_HEADER).toLowerCase();
  const liveSha = runtimeReleaseSha(env);
  if (!FULL_SHA.test(expectedSha)) {
    return { requested: true, ok: false, status: 400, reason: "expected_release_sha_required" };
  }
  if (!liveSha) {
    return { requested: true, ok: false, status: 503, reason: "runtime_release_sha_unavailable" };
  }
  if (!constantTimeEqual(expectedSha, liveSha, 40)) {
    return { requested: true, ok: false, status: 409, reason: "release_sha_mismatch" };
  }
  if (!String(env.LEAD_NOTIFY_EMAIL || "").trim()) {
    return { requested: true, ok: false, status: 503, reason: "qa_recipient_not_configured" };
  }

  return { requested: true, ok: true, expected_sha: expectedSha };
}

module.exports = {
  QA_OPT_IN_HEADER,
  QA_OPS_TOKEN_HEADER,
  QA_EXPECTED_SHA_HEADER,
  authorizeQaEmailRequest,
  constantTimeEqual,
  header,
  qaEmailIdempotencyKey,
  runtimeReleaseSha,
  sanitizeProviderId,
};
