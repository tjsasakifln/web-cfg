/**
 * Pure versioned tool-state helpers (no DOM). Keep in sync with tool-persist.cjs.
 */
(function (root) {
  "use strict";
  var DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;
  function packState(schemaVersion, data, now) {
    return { v: schemaVersion == null ? 1 : Number(schemaVersion), savedAt: now == null ? Date.now() : Number(now), data: data };
  }
  function unpackState(raw, expectedVersion, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : Number(opts.now);
    var ttl = opts.ttlMs == null ? DEFAULT_TTL_MS : Number(opts.ttlMs);
    if (raw == null || raw === "") return { ok: false, reason: "empty" };
    var payload = raw;
    if (typeof raw === "string") {
      try { payload = JSON.parse(raw); } catch (e) { return { ok: false, reason: "invalid_json" }; }
    }
    if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid_shape" };
    if (expectedVersion != null && payload.v !== expectedVersion) {
      return { ok: false, reason: "schema_mismatch", found: payload.v, expected: expectedVersion };
    }
    if (payload.savedAt != null && now - Number(payload.savedAt) > ttl) return { ok: false, reason: "expired" };
    return { ok: true, data: payload.data, migrated: false, v: payload.v, savedAt: payload.savedAt };
  }
  function buildReportText(sections, meta) {
    meta = meta || {};
    var lines = [];
    (sections || []).forEach(function (sec) {
      if (!sec) return;
      if (sec.title) { lines.push(sec.title); lines.push(new Array(Math.min(60, sec.title.length + 1)).join("=")); }
      if (sec.body) lines.push(sec.body);
      if (sec.lines && sec.lines.length) sec.lines.forEach(function (l) { lines.push(l); });
      lines.push("");
    });
    lines.push("Gerado em: " + (meta.generatedAt || new Date().toISOString()));
    lines.push(meta.footer || "Dados apenas neste navegador. Ferramenta orientativa da CONFENGE.");
    return lines.join("\n").trim() + "\n";
  }
  var api = { DEFAULT_TTL_MS: DEFAULT_TTL_MS, packState: packState, unpackState: unpackState, buildReportText: buildReportText };
  root.ConfengeToolPersist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
