#!/usr/bin/env node
const fs = require("fs");
const { loadMatrix, validateMatrixShape, firstCanaryCta, matrixVersion } = require("./matrix.cjs");

const matrix = loadMatrix();
const shape = validateMatrixShape(matrix);
const out = {
  ...matrixVersion(),
  first_canary_cta: firstCanaryCta(),
  shape,
  routes: matrix.routes.map((r) => ({
    id: r.id,
    intent: r.intent,
    eligibility: r.eligibility,
    promised_outcome: r.promised_outcome,
    minimum_fields: r.minimum_fields,
    owner: r.owner,
    channel: r.channel,
    sla: r.sla,
    privacy_consent: r.privacy_consent,
    fallback: r.fallback,
    kill_gate: r.kill_gate,
    offer_id: r.offer_id,
    service_id: r.service_id,
  })),
};
const dest = process.argv[2];
const text = JSON.stringify(out, null, 2);
if (dest) fs.writeFileSync(dest, text + "\n", "utf8");
process.stdout.write(text + "\n");
if (!shape.ok) process.exit(1);
