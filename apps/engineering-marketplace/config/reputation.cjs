'use strict';

const { createHash } = require('node:crypto');
const { z } = require('zod');
const defaults = require('./reputation-policy.json');

const positive = z.number().finite().positive();
const signalThreshold = z.number().int().min(2).max(1000);
const weightTable = keys => z.object(Object.fromEntries(keys.map(key => [key, positive]))).strict();
const curve = keys => z.object({ weights: weightTable(keys), halfSaturation: positive }).strict();
const technicalKinds = Object.keys(defaults.technical.weights);
const policySchema = z.object({
  version: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,63}$/),
  limits: weightTable(Object.keys(defaults.limits)),
  technical: curve(technicalKinds),
  experienceHalfSaturationDays: positive,
  education: curve(Object.keys(defaults.education.weights)),
  training: curve(Object.keys(defaults.training.weights)).extend({
    hoursPerUnit: positive, maxHoursPerRecord: positive,
  }),
  services: z.object({
    halfSaturation: positive, ratingPrior: z.number().min(1).max(5),
    ratingPriorCount: positive, minimumReviewBrlCents: z.number().int().min(0),
  }).strict(),
  integrity: z.object({
    windowDays: z.number().int().min(1).max(365),
    minimumRepeatedBuyer: signalThreshold,
    minimumLowValue: signalThreshold,
    minimumFiveStarBurst: signalThreshold,
    fiveStarBurstHours: z.number().int().min(1).max(168),
  }).strict(),
}).strict().refine(policy => policy.limits.technical === 30 &&
  Object.values(policy.limits).reduce((sum, max) => sum + max, 0) === 100 &&
  Object.entries(policy.limits).every(([key, max]) => key === 'services' || max < policy.limits.services),
'Reputation limits must total 100, preserve the 30-point technical limit and prioritize services')
  .refine(({ technical: { weights } }) => weights.cat_with_attestation > weights.cat_without_attestation &&
    weights.cat_without_attestation > weights.art, 'Technical evidence weights must preserve CAT / ART precedence');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function readPolicy(raw = process.env.MARKETPLACE_REPUTATION_POLICY) {
  const policy = policySchema.parse(raw ? JSON.parse(raw) : defaults);
  const canonicalPolicy = JSON.stringify(canonical(policy));
  return { policy, digest: createHash('sha256').update(canonicalPolicy).digest('hex') };
}

const time = value => typeof value === 'string' && value ? Date.parse(value) : NaN;
const dayLength = 86_400_000;
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return NaN;
  const parsed = time(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
}
const scale = (value, halfSaturation, maximum) => maximum * value / (halfSaturation + value);
const round = value => Math.round(value * 100) / 100;
const validGrade = value => Number.isInteger(value) && value > 0 && value <= 4;
const isVerified = (record, cutoff) => {
  const verifiedAt = time(record.verification?.at);
  const expiresAt = record.expires_at ? time(record.expires_at) : Infinity;
  return record.status === 'verified' && record.verification?.reviewer && record.verification?.source_ref &&
    Number.isFinite(verifiedAt) && verifiedAt <= cutoff && expiresAt > cutoff;
};

function relevance(record, specialty) {
  const grades = record.verification?.specialties;
  if (!grades) return 0;
  if (specialty) return validGrade(grades[specialty]) ? grades[specialty] / 4 : 0;
  return Math.max(0, ...Object.values(grades).filter(validGrade)) / 4;
}

function technicalScore(records, policy, specialty, creditedContracts) {
  // Keep all verified technical records in the connected component even if a
  // record is unrelated to this search. It can link two ARTs to one activity.
  const rows = records.filter(record => technicalKinds.includes(record.kind) &&
    typeof record.verification.activity_id === 'string' && record.verification.activity_id &&
    (record.kind !== 'art' || record.verification.art_status === 'closed' ||
      (record.verification.art_status === 'registered' && record.verification.execution_confirmed === true)));
  const parents = rows.map((_, index) => index);
  const keys = new Map();
  const root = index => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  rows.forEach((record, index) => {
    const review = record.verification;
    const links = [`activity:${review.activity_id}`, ...(review.linked_arts || []).map(art => `art:${art}`)];
    if (record.kind === 'art' && review.official_id) links.push(`art:${review.official_id}`);
    if (record.sha256) links.push(`sha:${record.sha256}`);
    if (review.platform_request_id) links.push(`contract:${review.platform_request_id}`);
    for (const key of links) {
      if (keys.has(key)) parents[root(index)] = root(keys.get(key));
      else keys.set(key, index);
    }
  });
  const weights = policy.technical.weights;
  const winners = new Map();
  const alreadyCredited = new Set(rows.flatMap((row, index) =>
    creditedContracts.has(row.verification.platform_request_id) ? [root(index)] : []));
  rows.forEach((record, index) => {
    const { complexity, responsibility, scope } = record.verification;
    const fit = relevance(record, specialty);
    if (!fit || ![complexity, responsibility, scope].every(validGrade)) return;
    const weight = weights[record.kind];
    const value = weight * fit * complexity * responsibility * scope / 64;
    const group = root(index);
    if (alreadyCredited.has(group)) return;
    const current = winners.get(group);
    if (!current || weight > current.weight || (weight === current.weight && value > current.value)) {
      winners.set(group, { weight, value });
    }
  });
  const values = [...winners.values()].map(row => row.value).sort((a, b) => a - b);
  const raw = values.reduce((sum, value) => sum + value, 0);
  return {
    points: scale(raw, policy.technical.halfSaturation, policy.limits.technical),
    activities: winners.size,
  };
}

function experienceScore(records, policy, specialty, cutoff) {
  const ranges = records.filter(record => record.kind === 'experience').map(record => ({
    from: date(record.verification.started_on),
    to: Math.min(date(record.verification.ended_on) + dayLength, cutoff + dayLength),
    fit: relevance(record, specialty),
  })).filter(({ from, to, fit }) => fit > 0 && Number.isFinite(from) && to > from);
  const dates = [...new Set(ranges.flatMap(({ from, to }) => [from, to]))].sort((a, b) => a - b);
  let days = 0;
  for (let index = 1; index < dates.length; index++) {
    const from = dates[index - 1], to = dates[index];
    const fit = Math.max(0, ...ranges.filter(range => range.from <= from && range.to >= to).map(range => range.fit));
    days += (to - from) / dayLength * fit;
  }
  return { points: scale(days, policy.experienceHalfSaturationDays, policy.limits.experience), days: round(days) };
}

function credentials(records, policy, specialty, dimension) {
  const { weights, halfSaturation, hoursPerUnit, maxHoursPerRecord } = policy[dimension];
  const unique = new Map();
  for (const record of records) {
    if (!Object.hasOwn(weights, record.kind)) continue;
    const ref = record.verification.qualification_id;
    const fit = relevance(record, specialty);
    if (!ref || !fit) continue;
    const hours = record.verification.hours;
    if (dimension === 'training' && (!Number.isFinite(hours) || hours <= 0)) continue;
    const units = dimension === 'training' ? Math.min(hours, maxHoursPerRecord) / hoursPerUnit : 1;
    const value = weights[record.kind] * fit * units;
    unique.set(ref, Math.max(value, unique.get(ref) || 0));
  }
  const raw = [...unique.values()].sort((a, b) => a - b).reduce((sum, value) => sum + value, 0);
  return { points: scale(raw, halfSaturation, policy.limits[dimension]), records: unique.size };
}

function serviceScore(contracts, policy, specialty, cutoff) {
  const completed = new Map();
  const customers = new Map();
  const { halfSaturation, ratingPrior, ratingPriorCount, minimumReviewBrlCents } = policy.services;
  for (const record of contracts) {
    if (specialty && record.intent_family !== specialty) continue;
    if (record.status !== 'completed' || record.payment?.status !== 'paid' ||
        !record.acceptance || !record.delivery || !record.id || !record.customer_id ||
        record.integrity_review === 'excluded' || record.integrity_review === 'pending' ||
        !Number.isSafeInteger(record.payment.amount_cents) || record.payment.amount_cents <= 0) continue;
    const confirmed = (record.events?.entries || []).find(event => event.action === 'complete');
    if (!confirmed || !(time(confirmed.at) <= cutoff)) continue;
    if (!completed.has(record.id)) completed.set(record.id, record);
  }
  // Count one source of independent feedback per buyer. Repeated deals still
  // qualify for the completed work curve but cannot multiply rating influence.
  const receipts = [...completed.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
  let lowValue = 0;
  let onTime = 0, timed = 0;
  for (const record of receipts) {
    const { rating, status, created_at } = record.review || {};
    if (record.payment.amount_cents < minimumReviewBrlCents) lowValue++;
    const due = date(record.proposal?.deadline), delivered = time(record.delivery?.delivered_at);
    if (Number.isFinite(due) && Number.isFinite(delivered)) {
      timed++;
      if (delivered < due + dayLength) onTime++;
    }
    if (record.payment.amount_cents >= minimumReviewBrlCents && status === 'published' &&
        Number.isInteger(rating) && rating >= 1 && rating <= 5 && time(created_at) <= cutoff) {
      const existing = customers.get(record.customer_id);
      if (!existing || created_at > existing.at) customers.set(record.customer_id, { rating, at: created_at });
    }
  }
  const ratings = [...customers.values()];
  const rating = ratings.length ? (ratings.reduce((sum, item) => sum + item.rating, 0) + ratingPrior * ratingPriorCount) /
    (ratings.length + ratingPriorCount) : null;
  const quantity = scale(completed.size, halfSaturation, policy.limits.services);
  // A missing review or deadline is treated neutrally. An unresolved dispute
  // never creates a negative balance, and integrity flags require human review.
  const quality = (rating === null ? ratingPrior : rating) / 5;
  const timeliness = timed ? 0.85 + 0.15 * onTime / timed : 1;
  return {
    credited: new Set(completed.keys()),
    detail: { points: quantity * quality * timeliness, completed: completed.size,
      rating: rating === null ? null : round(rating), independentReviews: ratings.length, lowValue },
  };
}

function calculateReputation({ evidence, contracts, asOf, specialty = null }, configuration = readPolicy()) {
  const cutoff = time(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('Reputation requires an explicit calculation time');
  const { policy, digest } = configuration;
  const accepted = evidence.filter(record => isVerified(record, cutoff));
  const services = serviceScore(contracts, policy, specialty, cutoff);
  const details = {
    services: services.detail,
    technical: technicalScore(accepted, policy, specialty, services.credited),
    experience: experienceScore(accepted, policy, specialty, cutoff),
    education: credentials(accepted, policy, specialty, 'education'),
    training: credentials(accepted, policy, specialty, 'training'),
  };
  const points = Object.fromEntries(Object.entries(details).map(([key, value]) => [key, round(value.points)]));
  const technicalQualification = round(points.technical + points.experience + points.education + points.training);
  const total = round(Object.values(points).reduce((sum, value) => sum + value, 0));
  return {
    version: policy.version, policy_digest: digest, specialty, points, details,
    total: total > 0 ? total : null,
    qualification: technicalQualification > 0 ? technicalQualification : null,
  };
}

function integritySignals(contracts, asOf, { policy } = readPolicy()) {
  const cutoff = time(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('Integrity triage requires an explicit calculation time');
  const rules = policy.integrity;
  const start = cutoff - rules.windowDays * dayLength;
  const recent = new Map();
  for (const contract of contracts) {
    const completed = time((contract.events?.entries || []).find(event => event.action === 'complete')?.at);
    if (contract.status === 'completed' && contract.payment?.status === 'paid' && contract.acceptance &&
        contract.delivery && contract.id && contract.customer_id && completed >= start && completed <= cutoff) {
      recent.set(contract.id, contract);
    }
  }
  const byBuyer = new Map();
  const lowValue = [];
  const topRatings = [];
  for (const { id, customer_id, payment, review } of recent.values()) {
    if (!byBuyer.has(customer_id)) byBuyer.set(customer_id, []);
    byBuyer.get(customer_id).push(id);
    if (Number.isSafeInteger(payment.amount_cents) && payment.amount_cents > 0 &&
        payment.amount_cents < policy.services.minimumReviewBrlCents) lowValue.push(id);
    const reviewedAt = time(review?.created_at);
    if (review?.status === 'published' && review.rating === 5 && reviewedAt >= cutoff - rules.fiveStarBurstHours * 3600000 &&
        reviewedAt <= cutoff) topRatings.push({ id, customer_id });
  }
  const signals = [...byBuyer.values()].filter(ids => ids.length >= rules.minimumRepeatedBuyer)
    .map(ids => ({ signal: 'repeated_buyer', contracts: ids.sort() }));
  if (lowValue.length >= rules.minimumLowValue) signals.push({ signal: 'repeated_low_value', contracts: lowValue.sort() });
  if (new Set(topRatings.map(item => item.customer_id)).size >= rules.minimumFiveStarBurst) {
    signals.push({ signal: 'concentrated_top_ratings', contracts: topRatings.map(item => item.id).sort() });
  }
  return signals.sort((left, right) => left.signal.localeCompare(right.signal, 'en') ||
    left.contracts[0].localeCompare(right.contracts[0], 'en'));
}

module.exports = { calculateReputation, integritySignals, readPolicy };
