/**
 * Persist-before-transport ordering. Pure trace helpers + orchestration steps.
 */
const STEPS = {
  VALIDATED: "validated",
  PERSISTED: "persisted",
  HANDOFF_ATTEMPTED: "handoff_attempted",
  HANDOFF_RESULT: "handoff_result",
  FACTUAL_LOADED: "factual_loaded",
  EXCEPTION: "exception",
};

function createTrace() {
  return { steps: [], persist_before_handoff: null };
}

function recordStep(trace, step, extra) {
  const t = trace || createTrace();
  t.steps.push({ step, at: new Date().toISOString(), ...(extra || {}) });
  return t;
}

function persistBeforeHandoff(trace) {
  const steps = (trace && trace.steps) || [];
  const persistIdx = steps.findIndex((s) => s.step === STEPS.PERSISTED);
  const handoffIdx = steps.findIndex((s) => s.step === STEPS.HANDOFF_ATTEMPTED);
  if (persistIdx < 0) return false;
  if (handoffIdx < 0) return true;
  return persistIdx < handoffIdx;
}

function receiptSurvivedException(trace) {
  const steps = (trace && trace.steps) || [];
  const persisted = steps.some((s) => s.step === STEPS.PERSISTED);
  const excepted = steps.some((s) => s.step === STEPS.EXCEPTION || (s.step === STEPS.HANDOFF_RESULT && s.status && s.status !== "DELIVERED" && s.status !== "SKIPPED"));
  return persisted && excepted;
}

module.exports = {
  STEPS,
  createTrace,
  recordStep,
  persistBeforeHandoff,
  receiptSurvivedException,
};
