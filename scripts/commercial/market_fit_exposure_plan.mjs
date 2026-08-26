#!/usr/bin/env node

/**
 * Gera a matriz congelada de exposição da pesquisa de market fit (#336).
 *
 * O plano usa slots sem identidade. Nenhum participante, contato, resposta ou
 * consentimento entra aqui. `--check` falha se o artefato versionado divergir.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const protocolPath = path.join(root, "data/commercial/market-fit-protocol.v1.json");
const doorsPath = path.join(root, "data/commercial/task-doors.v1.json");
const outputPath = path.join(root, "data/commercial/market-fit-exposure-plan.v1.json");
const PLAN_VERSION = "CFG-MARKET-FIT-EXPOSURE-2026-08-25-v1";
const PLAN_SEED = "confenge-market-fit-336-v1";
const CYCLIC_STARTS = [...Array.from({ length: 18 }, (_, index) => index * 3), 1, 28];

function id(number) {
  return `CFG-D${String(number).padStart(2, "0")}`;
}

function hashRank(value) {
  return crypto.createHash("sha256").update(`${PLAN_SEED}:${value}`).digest("hex");
}

function roleAssignment(blocks, roles, doorById) {
  let states = new Map([["0,0,0,0", { score: 0, assignments: [] }]]);
  for (const cards of blocks) {
    const next = new Map();
    for (const [key, state] of states) {
      const counts = key.split(",").map(Number);
      roles.forEach((role, roleIndex) => {
        if (counts[roleIndex] >= role.minimum) return;
        const candidateCounts = [...counts];
        candidateCounts[roleIndex] += 1;
        const candidateKey = candidateCounts.join(",");
        const focusScore = cards.filter((card) => role.focus_doors.includes(doorById.get(card))).length;
        const candidate = { score: state.score + focusScore, assignments: [...state.assignments, roleIndex] };
        const current = next.get(candidateKey);
        if (!current || candidate.score > current.score) next.set(candidateKey, candidate);
      });
    }
    states = next;
  }
  const target = roles.map((role) => role.minimum).join(",");
  const result = states.get(target);
  if (!result) throw new Error("EXPOSURE_ROLE_QUOTAS_UNSATISFIED");
  return result.assignments;
}

export function generateExposurePlan(protocol, taskDoors) {
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  const catalog = Array.from({ length: phase2.catalogue_size }, (_, index) => id(index + 1));
  const blocks = CYCLIC_STARTS.map((start) =>
    Array.from({ length: phase2.cards_per_participant }, (_, offset) => catalog[(start + offset) % catalog.length]));
  const doorById = new Map(taskDoors.doors.flatMap((door) =>
    door.members.map((member) => [member.deliverable_id, door.door])));
  const roles = phase1.quotas;
  const assignments = roleAssignment(blocks, roles, doorById);
  const boundaryIds = new Set(phase2.critical_boundaries.flatMap((boundary) => boundary.deliverable_ids));
  const roleCounters = Object.fromEntries(roles.map((role) => [role.role_id, 0]));

  const participantSlots = blocks.map((cards, index) => {
    const role = roles[assignments[index]];
    roleCounters[role.role_id] += 1;
    const slotId = `MF-P${String(index + 1).padStart(2, "0")}`;
    const displayOrder = [...cards].sort((left, right) =>
      hashRank(`${slotId}:${left}`).localeCompare(hashRank(`${slotId}:${right}`)));
    const boundaryCards = displayOrder.filter((card) => boundaryIds.has(card)).slice(0, phase2.boundary_cards_per_participant);
    if (boundaryCards.length !== phase2.boundary_cards_per_participant) {
      throw new Error(`EXPOSURE_BOUNDARY_CARDS_UNSATISFIED:${slotId}`);
    }
    return {
      slot_id: slotId,
      role_id: role.role_id,
      role_label_pt_br: role.role,
      role_slot: roleCounters[role.role_id],
      focus_doors: role.focus_doors,
      cards,
      boundary_cards: boundaryCards,
      display_order: displayOrder,
    };
  });

  const itemExposureCounts = Object.fromEntries(catalog.map((deliverableId) => [
    deliverableId,
    participantSlots.filter((slot) => slot.cards.includes(deliverableId)).length,
  ]));
  const boundaryJointCounts = Object.fromEntries(phase2.critical_boundaries.map((boundary) => [
    boundary.boundary_id,
    participantSlots.filter((slot) => boundary.deliverable_ids.every((deliverableId) => slot.cards.includes(deliverableId))).length,
  ]));

  return {
    schema: "confenge.market-fit-exposure-plan/1.0",
    plan_version: PLAN_VERSION,
    protocol_version: protocol.protocol_version,
    issue: "#336",
    seed: PLAN_SEED,
    source_contracts: [
      "data/commercial/market-fit-protocol.v1.json",
      "data/commercial/task-doors.v1.json",
    ],
    frozen_before_sessions: true,
    mutable_after_first_session: false,
    contains_participant_identity: false,
    catalogue_size: catalog.length,
    participant_slot_count: participantSlots.length,
    cards_per_participant: phase2.cards_per_participant,
    boundary_cards_per_participant: phase2.boundary_cards_per_participant,
    critical_boundaries: phase2.critical_boundaries,
    participant_slots: participantSlots,
    coverage: {
      minimum_item_exposures_required: phase2.min_exposures_per_item,
      minimum_item_exposures_observed: Math.min(...Object.values(itemExposureCounts)),
      item_exposure_counts: itemExposureCounts,
      minimum_joint_boundary_exposures_required: phase2.min_joint_exposures_per_critical_boundary,
      minimum_joint_boundary_exposures_observed: Math.min(...Object.values(boundaryJointCounts)),
      boundary_joint_counts: boundaryJointCounts,
    },
  };
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));
  const taskDoors = JSON.parse(fs.readFileSync(doorsPath, "utf8"));
  const rendered = canonical(generateExposurePlan(protocol, taskDoors));
  if (process.argv.includes("--write")) {
    fs.writeFileSync(outputPath, rendered);
    console.log("MARKET_FIT_EXPOSURE_PLAN_WRITTEN slots=20 cards=360");
  } else if (process.argv.includes("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== rendered) {
      console.error("MARKET_FIT_EXPOSURE_PLAN_DRIFT: run market_fit_exposure_plan.mjs --write");
      process.exit(1);
    }
    console.log("MARKET_FIT_EXPOSURE_PLAN_OK slots=20 cards=360");
  } else {
    console.error("usage: market_fit_exposure_plan.mjs --check|--write");
    process.exit(2);
  }
}
