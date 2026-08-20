"use strict";

const emptyComplete = require("../../data/public-integrity-consumer/envelopes/empty-complete.json");
const ceisMatch = require("../../data/public-integrity-consumer/envelopes/ceis-match.json");
const cnepMatch = require("../../data/public-integrity-consumer/envelopes/cnep-match.json");
const multiPage = require("../../data/public-integrity-consumer/envelopes/multi-page.json");
const timeout = require("../../data/public-integrity-consumer/envelopes/timeout.json");
const rateLimit = require("../../data/public-integrity-consumer/envelopes/rate-limit-429.json");
const http5xx = require("../../data/public-integrity-consumer/envelopes/http-5xx.json");
const schemaDrift = require("../../data/public-integrity-consumer/envelopes/schema-drift.json");
const parsePartial = require("../../data/public-integrity-consumer/envelopes/parse-partial.json");
const incompletePagination = require("../../data/public-integrity-consumer/envelopes/incomplete-pagination.json");
const sourceDegraded = require("../../data/public-integrity-consumer/envelopes/source-degraded.json");
const staleExpired = require("../../data/public-integrity-consumer/envelopes/stale-expired.json");
const invalidCnpj = require("../../data/public-integrity-consumer/envelopes/invalid-cnpj.json");
const coverageLieIncompletePages = require("../../data/public-integrity-consumer/envelopes/coverage-lie-incomplete-pages.json");
const manifest = require("../../data/public-integrity-consumer/envelopes/MANIFEST.json");

const ENVELOPES = Object.freeze({
  "empty-complete": emptyComplete,
  "ceis-match": ceisMatch,
  "cnep-match": cnepMatch,
  "multi-page": multiPage,
  timeout,
  "rate-limit-429": rateLimit,
  "http-5xx": http5xx,
  "schema-drift": schemaDrift,
  "parse-partial": parsePartial,
  "incomplete-pagination": incompletePagination,
  "source-degraded": sourceDegraded,
  "stale-expired": staleExpired,
  "invalid-cnpj": invalidCnpj,
  "coverage-lie-incomplete-pages": coverageLieIncompletePages,
});

const FAILURE_IDS = Object.freeze([
  "timeout",
  "rate-limit-429",
  "http-5xx",
  "schema-drift",
  "parse-partial",
  "incomplete-pagination",
  "source-degraded",
  "stale-expired",
  "invalid-cnpj",
  "coverage-lie-incomplete-pages",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadEnvelope(id) {
  const key = String(id || "").replace(/\.json$/, "");
  const env = ENVELOPES[key];
  if (!env) return null;
  return clone(env);
}

function listEnvelopeIds() {
  return Object.keys(ENVELOPES);
}

function failureIds() {
  return FAILURE_IDS.slice();
}

module.exports = {
  ENVELOPES,
  FAILURE_IDS,
  loadEnvelope,
  listEnvelopeIds,
  failureIds,
  manifest,
};
