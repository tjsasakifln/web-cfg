#!/usr/bin/env node

/**
 * Gera a matriz congelada de exposicao da pesquisa unica #336.
 *
 * O plano usa slots sem identidade. Nenhum participante, contato, resposta ou
 * consentimento entra aqui. --check falha se o artefato versionado divergir.
 *
 * A composicao 8/3/3/3/3 e amostragem qualitativa predeclarada, nao verdade
 * de mercado. O canario privado ocupa oito slots; B2G permanece com tres.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const protocolPath = path.join(root, "data/commercial/market-fit-protocol.v1.json");
const outputPath = path.join(root, "data/commercial/market-fit-exposure-plan.v1.json");
const PLAN_VERSION = "CFG-MARKET-FIT-EXPOSURE-2026-09-04-v3";
const PLAN_SEED = "confenge-market-fit-336-v3-multivertical";

function hashRank(value) {
  return crypto.createHash("sha256").update(`${PLAN_SEED}:${value}`).digest("hex");
}

export function generateExposurePlan(protocol, _taskDoors = null) {
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  const sample = protocol.sample_design;
  const tasks = phase2.tasks.map((task) => task.id);
  const quotas = phase1.quotas;
  const slots = [];
  let index = 0;
  for (const quota of quotas) {
    for (let roleSlot = 1; roleSlot <= quota.minimum; roleSlot += 1) {
      index += 1;
      const slotId = `MF-P${String(index).padStart(2, "0")}`;
      const displayOrder = [...tasks].sort((left, right) =>
        hashRank(`${slotId}:${left}`).localeCompare(hashRank(`${slotId}:${right}`)));
      slots.push({
        slot_id: slotId,
        role_id: quota.role_id,
        nucleus_id: quota.nucleus_id,
        role_label_pt_br: quota.role,
        role_slot: roleSlot,
        canary_priority: quota.canary_priority === true,
        b2g_presence_check: true,
        task_ids: tasks,
        display_order: displayOrder,
        repeat_change_stop: ["REPEAT", "CHANGE", "STOP"],
      });
    }
  }

  const taskExposureCounts = Object.fromEntries(tasks.map((taskId) => [
    taskId,
    slots.filter((slot) => slot.task_ids.includes(taskId)).length,
  ]));
  const nucleusCounts = Object.fromEntries(quotas.map((quota) => [
    quota.nucleus_id,
    slots.filter((slot) => slot.nucleus_id === quota.nucleus_id).length,
  ]));

  return {
    schema: "confenge.market-fit-exposure-plan/1.1",
    plan_version: PLAN_VERSION,
    protocol_version: protocol.protocol_version,
    issue: "#336",
    seed: PLAN_SEED,
    unique_human_protocol: true,
    sample_kind: sample.kind,
    not_market_share: true,
    not_statistical_significance: true,
    source_contracts: [
      "data/commercial/market-fit-protocol.v1.json",
    ],
    frozen_before_sessions: true,
    mutable_after_first_session: false,
    contains_participant_identity: false,
    participant_slot_count: slots.length,
    tasks_per_participant: tasks.length,
    participant_slots: slots,
    coverage: {
      nucleus_slot_counts: nucleusCounts,
      task_exposure_counts: taskExposureCounts,
      every_slot_has_all_tasks: slots.every((slot) => slot.task_ids.length === tasks.length),
      b2g_slots: nucleusCounts.public_works_b2g,
      canary_slots: nucleusCounts.building_engineering_documentation,
    },
  };
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));
  const rendered = canonical(generateExposurePlan(protocol));
  if (process.argv.includes("--write")) {
    fs.writeFileSync(outputPath, rendered);
    console.log("MARKET_FIT_EXPOSURE_PLAN_WRITTEN slots=20 tasks=12");
  } else if (process.argv.includes("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== rendered) {
      console.error("MARKET_FIT_EXPOSURE_PLAN_DRIFT: run market_fit_exposure_plan.mjs --write");
      process.exit(1);
    }
    console.log("MARKET_FIT_EXPOSURE_PLAN_OK slots=20 tasks=12");
  } else {
    console.error("usage: market_fit_exposure_plan.mjs --check|--write");
    process.exit(2);
  }
}
