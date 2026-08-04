/**
 * Lead record_kind classification, commercial truth vs probes/QA/spam.
 *
 * Kinds: real | synthetic | qa | spam | internal
 *
 * Multi-signal detection for non-real. A single ambiguous signal alone
 * must not reclassify an existing commercial lead as synthetic.
 */

const RECORD_KINDS = Object.freeze(["real", "synthetic", "qa", "spam", "internal"]);
const RECORD_KIND_SET = new Set(RECORD_KINDS);

const RESERVED_TEST_EMAIL_DOMAINS = Object.freeze([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
  "invalid",
  "confenge.test",
  "mailinator.com",
]);

const SYNTHETIC_NAME_RE = /synthetic[-_ ]?probe|probe\s*daily|qa[-_ ]probe|test[-_ ]lead/i;
const QA_NAME_RE = /\bqa[-_ ]|test[-_ ]user|cypress|playwright|selenium/i;
const SYNTHETIC_UTM = new Set(["synthetic", "test", "probe", "qa", "e2e", "ci"]);
const SYNTHETIC_ORIGEM_RE =
  /\/synthetic-probe|\/probe-|synthetic-probe|test-mode|\/qa-probe/i;
const PROBE_UA_RE = /confenge-(daily-)?probe|confenge-synthetic-probe|synthetic-probe/i;
const PROBE_ACTORS = new Set(["daily-probe", "synthetic-probe", "probe", "system-probe"]);

function normalizeKind(raw) {
  const k = String(raw || "")
    .trim()
    .toLowerCase();
  return RECORD_KIND_SET.has(k) ? k : null;
}

/**
 * Collect multi-signal evidence that a record is non-commercial.
 * @returns {{ kind: string|null, signals: string[], score: number }}
 */
function detectNonRealSignals(input = {}, { headers } = {}) {
  const signals = [];
  const nome = String(input.nome || input.name || "");
  const email = String(input.email || "").toLowerCase();
  const utm = String(input.utm_source || "").toLowerCase();
  const medium = String(input.utm_medium || "").toLowerCase();
  const campaign = String(input.utm_campaign || "").toLowerCase();
  const origem = String(input.origem || "");
  const landing = String(input.landing_page || input.landing || "");
  const estagio = String(input.estagio || "");
  const mensagem = String(input.mensagem || input.message || "");
  const actor = String(input.actor || input._actor || "").toLowerCase();
  const jornada = String(input.jornada || "").toLowerCase();
  const explicit = normalizeKind(input.record_kind || input.kind);
  const testMode =
    input.test_mode === true ||
    input.test_mode === "1" ||
    input.test_mode === "true" ||
    input._test_mode === true;

  if (explicit && explicit !== "real") {
    signals.push(`explicit_kind:${explicit}`);
  }
  if (testMode) signals.push("test_mode");

  if (SYNTHETIC_NAME_RE.test(nome)) signals.push("name_synthetic_probe");
  else if (QA_NAME_RE.test(nome)) signals.push("name_qa");

  if (email) {
    const domain = email.split("@")[1] || "";
    if (RESERVED_TEST_EMAIL_DOMAINS.includes(domain)) signals.push("email_reserved_domain");
    if (/^probe(\+|$)|^qa(\+|$)|^test(\+|$)|synthetic/i.test(email.split("@")[0] || "")) {
      signals.push("email_local_probe");
    }
  }

  if (SYNTHETIC_UTM.has(utm)) signals.push(`utm_source:${utm || "empty"}`);
  if (SYNTHETIC_UTM.has(medium)) signals.push(`utm_medium:${medium}`);
  if (/synthetic|probe|qa|e2e/.test(campaign)) signals.push("utm_campaign_test");

  if (SYNTHETIC_ORIGEM_RE.test(origem) || SYNTHETIC_ORIGEM_RE.test(landing)) {
    signals.push("origem_or_landing_probe");
  }
  if (/synthetic\s*probe|discard|qa\s*only/i.test(estagio)) signals.push("estagio_probe");
  if (/\[qa\]|synthetic|do not contact|probe only/i.test(mensagem)) signals.push("mensagem_qa");

  if (PROBE_ACTORS.has(actor)) signals.push(`actor:${actor}`);

  const h = headers || input._headers || {};
  const ua = String(h["user-agent"] || h["User-Agent"] || input.user_agent || "");
  if (PROBE_UA_RE.test(ua)) signals.push("user_agent_probe");
  if (h["x-confenge-probe"] || h["X-Confenge-Probe"]) signals.push("probe_header");

  // Stage history actors (backfill)
  const hist = Array.isArray(input.stage_history) ? input.stage_history : [];
  for (const ev of hist) {
    const a = String(ev.actor || "").toLowerCase();
    if (PROBE_ACTORS.has(a)) {
      signals.push(`history_actor:${a}`);
      break;
    }
  }
  const notes = Array.isArray(input.ops_notes) ? input.ops_notes : [];
  for (const n of notes) {
    const t = `${n.actor || ""} ${n.note || ""}`.toLowerCase();
    if (/daily-probe|synthetic|qa only|probe/.test(t)) {
      signals.push("ops_note_probe");
      break;
    }
  }

  if (jornada === "synthetic") signals.push("jornada_synthetic");

  // Deduplicate
  const uniq = [...new Set(signals)];

  // Score: strong multi-signal requirement for reclassification of ambiguous cases
  let score = uniq.length;
  const strong = uniq.filter((s) =>
    /explicit_kind|test_mode|name_synthetic|email_reserved|utm_source:synthetic|utm_source:probe|origem_or_landing|user_agent_probe|probe_header|history_actor|actor:daily-probe/.test(
      s
    )
  );

  let kind = null;
  if (explicit && explicit !== "real") {
    kind = explicit;
  } else if (testMode || uniq.some((s) => s.startsWith("explicit_kind:synthetic") || s === "name_synthetic_probe")) {
    kind = "synthetic";
  } else if (uniq.some((s) => s === "name_qa" || s.startsWith("utm_source:qa"))) {
    kind = "qa";
  } else if (strong.length >= 2 || (strong.length >= 1 && uniq.length >= 2)) {
    // multi-signal synthetic/probe
    if (uniq.some((s) => /qa/.test(s))) kind = "qa";
    else kind = "synthetic";
  } else if (uniq.some((s) => s === "spam" || /spam/.test(s))) {
    kind = "spam";
  }

  // Internal: explicit only or utm_source=internal with staff domain later
  if (explicit === "internal") kind = "internal";
  if (utm === "internal" && strong.length >= 1) kind = "internal";

  return { kind, signals: uniq, score, strong_count: strong.length };
}

/**
 * Resolve record_kind for a new public lead.
 * Defaults to real unless multi-signal or explicit non-real.
 */
function resolveRecordKind(input = {}, options = {}) {
  const explicit = normalizeKind(input.record_kind || input.kind);
  if (explicit) {
    return {
      record_kind: explicit,
      signals: explicit === "real" ? [] : [`explicit_kind:${explicit}`],
      classified_at: new Date().toISOString(),
      classifier: "explicit",
    };
  }
  const det = detectNonRealSignals(input, options);
  if (det.kind) {
    return {
      record_kind: det.kind,
      signals: det.signals,
      classified_at: new Date().toISOString(),
      classifier: "multi_signal",
    };
  }
  return {
    record_kind: "real",
    signals: det.signals,
    classified_at: new Date().toISOString(),
    classifier: "default_real",
  };
}

/**
 * Backfill classification: only mark non-real when multi-signal (or explicit).
 * Single ambiguous signal → leave as real (safe).
 */
function classifyForBackfill(record) {
  const existing = normalizeKind(record.record_kind);
  if (existing && existing !== "real") {
    return {
      record_kind: existing,
      signals: ["already_classified"],
      action: "keep",
      reason: "already_non_real",
    };
  }
  const det = detectNonRealSignals(record);
  // Require ≥2 signals OR one very strong explicit probe name + another class
  const strongEnough =
    det.strong_count >= 2 ||
    (det.strong_count >= 1 && det.signals.length >= 2) ||
    det.signals.some((s) => s.startsWith("explicit_kind:"));
  if (det.kind && strongEnough) {
    return {
      record_kind: det.kind,
      signals: det.signals,
      action: "mark",
      reason: "multi_signal",
    };
  }
  return {
    record_kind: existing || "real",
    signals: det.signals,
    action: "keep",
    reason: det.signals.length ? "insufficient_signals" : "no_signals",
  };
}

/**
 * Effective commercial kind for a stored record.
 * Explicit non-real wins. Missing kind is re-scanned with multi-signal rules so
 * pre-migration SYNTHETIC-PROBE rows never inflate commercial totals.
 */
function effectiveRecordKind(record) {
  if (!record) return "real";
  const explicit = normalizeKind(record.record_kind);
  if (explicit && explicit !== "real") return explicit;
  // Re-detect even when kind is missing or "real", multi-signal only demotes
  const det = classifyForBackfill({
    ...record,
    record_kind: explicit || undefined,
  });
  if (det.action === "mark" && det.record_kind && det.record_kind !== "real") {
    return det.record_kind;
  }
  // Also run detect for brand-new multi-signal without existing kind
  if (!explicit) {
    const d = detectNonRealSignals(record);
    const strongEnough =
      d.strong_count >= 2 || (d.strong_count >= 1 && d.signals.length >= 2);
    if (d.kind && strongEnough) return d.kind;
  }
  return explicit || "real";
}

function isCommercialReal(record) {
  return effectiveRecordKind(record) === "real";
}

function filterCommercialLeads(leads) {
  return (leads || []).filter(isCommercialReal);
}

function countByKind(leads) {
  const counts = { real: 0, synthetic: 0, qa: 0, spam: 0, internal: 0, unknown: 0 };
  for (const l of leads || []) {
    const k = effectiveRecordKind(l);
    if (counts[k] == null) counts.unknown += 1;
    else counts[k] += 1;
  }
  return counts;
}

/**
 * Audit entry when kind is set or changed (immutable history).
 */
function kindAuditEntry({ from, to, signals, actor, note }) {
  return {
    at: new Date().toISOString(),
    event: "record_kind",
    from: from || null,
    to,
    signals: signals || [],
    actor: String(actor || "system").slice(0, 80),
    note: note ? String(note).slice(0, 200) : undefined,
  };
}

module.exports = {
  RECORD_KINDS,
  RESERVED_TEST_EMAIL_DOMAINS,
  normalizeKind,
  detectNonRealSignals,
  resolveRecordKind,
  classifyForBackfill,
  effectiveRecordKind,
  isCommercialReal,
  filterCommercialLeads,
  countByKind,
  kindAuditEntry,
};
