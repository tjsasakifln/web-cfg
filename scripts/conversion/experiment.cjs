/**
 * Sequential / manual single-variable experiment harness.
 * Does not compute significance.
 */
const SPEC = require("../../data/conversion/experiment/cta-copy-sequential.v1.json");

function loadExperiment() {
  return SPEC;
}

function isolatedVariable() {
  return SPEC.isolated_variable;
}

function hypothesis() {
  return SPEC.hypothesis;
}

function primaryMetric() {
  return SPEC.primary_metric;
}

function significanceClaimed() {
  return SPEC.significance_claimed === true;
}

function ranksQualifiedPipeline() {
  return /qualified/.test(SPEC.primary_metric) && SPEC.do_not.includes("optimize for raw lead count");
}

function recordObservation(side, { xray_starts, xray_ready, qualified_handraises, raw_leads } = {}) {
  return {
    experiment_id: SPEC.id,
    side,
    cta_copy: side === "variant" ? SPEC.variant.cta_copy : SPEC.control.cta_copy,
    xray_starts: Number(xray_starts) || 0,
    xray_ready: Number(xray_ready) || 0,
    qualified_handraises: Number(qualified_handraises) || 0,
    raw_leads: Number(raw_leads) || 0,
    qualified_handraise_per_xray_ready:
      Number(xray_ready) > 0 ? Number(qualified_handraises) / Number(xray_ready) : null,
    significance_claimed: false,
    note: "Sequential observation only. No p-value.",
  };
}

module.exports = {
  loadExperiment,
  isolatedVariable,
  hypothesis,
  primaryMetric,
  significanceClaimed,
  ranksQualifiedPipeline,
  recordObservation,
};
