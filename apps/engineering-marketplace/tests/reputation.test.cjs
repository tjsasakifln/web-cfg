'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateReputation, readPolicy } = require('../config/reputation.cjs');
const policy = require('../config/reputation-policy.json');
const AS_OF = '2026-11-21T00:00:00Z';
const STRUCTURES = 'projetar_revisar_compatibilizar';
const SPECIALTIES = { [STRUCTURES]: 4 };

function evidence(kind, id, verification = {}, fields = {}) {
  return { kind, status: 'verified', ...fields,
    verification: { at: '2026-01-01T00:00:00Z', reviewer: 'reviewer', source_ref: 'source',
      activity_id: id, official_id: id, art_status: 'closed', complexity: 4,
      responsibility: 4, scope: 4, specialties: SPECIALTIES, ...verification } };
}

function score(records = [], contracts = [], specialty = STRUCTURES, config) {
  return calculateReputation({ evidence: records, contracts, specialty, asOf: AS_OF }, config);
}

function contract(id, changes = {}) {
  return { id, customer_id: 'customer', intent_family: STRUCTURES, status: 'completed',
    payment: { status: 'paid', amount_cents: 20000 }, acceptance: { revision: 1 },
    proposal: { deadline: '2026-11-05' }, delivery: { delivered_at: '2026-11-05T14:00:00Z' },
    review: { status: 'published', rating: 5, created_at: '2026-11-07T00:00:00Z' },
    events: { entries: [{ action: 'complete', at: '2026-11-06T00:00:00Z' }] }, ...changes };
}

test('uses 5:3:1 and normalizes independently of submission order', () => {
  assert.deepEqual(policy.technical.weights, { cat_with_attestation: 5, cat_without_attestation: 3, art: 1 });
  const points = [5, 3, 1].map(weight => Math.round(100 * 30 * weight / (12 + weight)) / 100);
  for (const [index, kind] of Object.keys(policy.technical.weights).entries()) {
    assert.equal(score([evidence(kind, 'one')]).points.technical, points[index]);
  }
});

test('deduplicates linked ARTs and CAT, including transitive links and different activity keys', () => {
  const art = evidence('art', 'activity-1', { official_id: 'ART-1' });
  const cat = evidence('cat_with_attestation', 'activity-2', { linked_arts: ['ART-1', 'ART-2'] });
  const second = evidence('art', 'activity-3', { official_id: 'ART-2' });
  const expected = score([cat]);
  assert.deepEqual(score([art, cat, second]), expected);
  assert.deepEqual(score([second, art, cat]), expected);
});

test('pending, expired and revoked records have no effect, even when linked to verified evidence', () => {
  const art = evidence('art', 'work');
  const others = ['submitted', 'in_review', 'rejected', 'correction_required', 'revoked', 'expired']
    .map(status => evidence('cat_with_attestation', 'work', {}, { status }));
  others.push(evidence('cat_with_attestation', 'work', {}, { expires_at: '2026-11-20T00:00:00Z' }));
  assert.deepEqual(score([art, ...others]), score([art]));
  assert.equal(score(others).total, null);
  assert.equal(score([evidence('art', 'registered', { art_status: 'registered' })]).total, null);
});

test('specific technical fit and demonstrated responsibility affect the score', () => {
  const full = evidence('cat_with_attestation', 'work');
  const limited = evidence('cat_with_attestation', 'work', {
    complexity: 2, responsibility: 3, scope: 2, specialties: { [STRUCTURES]: 2 },
  });
  assert.ok(score([limited]).points.technical < score([full]).points.technical);
  assert.equal(score([full], [], 'another-specialty').total, null);
  assert.equal(score([evidence('cat_with_attestation', 'other', { responsibility: 0 })]).total, null);
});

test('applies diminishing returns and caps technical evidence at 30 points', () => {
  const docs = Array.from({ length: 300 }, (_, i) => evidence('cat_with_attestation', String(i)));
  const points = count => score(docs.slice(0, count)).points.technical;
  assert.ok(points(2) - points(1) > points(12) - points(11));
  assert.ok(points(300) <= 30);
});

test('counts overlapping CLT and autonomous work as the strongest relevance for each day', () => {
  const jobs = [
    evidence('experience', 'a', { started_on: '2025-01-01', ended_on: '2025-01-10', relationship: 'employment' }),
    evidence('experience', 'b', { started_on: '2025-01-05', ended_on: '2025-01-15', relationship: 'independent' }),
  ];
  assert.equal(score(jobs).details.experience.days, 15);
  assert.equal(score(jobs.slice(1)).details.experience.days, 11);
});

test('qualified assessed courses beat attendance and duplicate qualifications are counted once', () => {
  const attendance = evidence('attendance', 'a', { qualification_id: 'A', hours: 40 });
  const course = evidence('assessed_course', 'a', { qualification_id: 'A', hours: 40 });
  assert.ok(score([course]).points.training > score([attendance]).points.training);
  assert.deepEqual(score([attendance, course, course]), score([course]));
});

test('credits only confirmed completed contracts and tempers ratings from one buyer', () => {
  const first = contract('paid-a');
  const second = contract('paid-b');
  const valid = score([], [first, second]);
  assert.equal(valid.details.services.completed, 2);
  assert.equal(valid.details.services.independentReviews, 1);
  assert.ok(valid.details.services.rating > 4 && valid.details.services.rating < 5);
  const ignored = [
    contract('attempt', { status: 'accepted', payment: { status: 'creating' } }),
    contract('refund', { status: 'refunded', payment: { status: 'refunded' } }),
    contract('dispute', { status: 'disputed' }),
    contract('unconfirmed', { events: { entries: [] } }),
    contract('review', { integrity_review: 'pending' }),
  ];
  assert.deepEqual(score([], [first, second, first, ...ignored]), valid);
  assert.equal(score([], ignored).total, null);
});

test('versioned policy is auditable and a verified newcomer has a separate qualification', () => {
  const custom = { ...policy, version: 'confenge-trust-2', technical: {
    ...policy.technical, weights: { cat_with_attestation: 6, cat_without_attestation: 3, art: 1 },
  } };
  const next = readPolicy(JSON.stringify(custom));
  assert.notEqual(next.digest, readPolicy().digest);
  const user = score([evidence('cat_with_attestation', 'one')], [], STRUCTURES, next);
  assert.equal(user.total, user.qualification);
  assert.equal(user.points.services, 0);
  assert.throws(() => readPolicy(JSON.stringify({ ...custom, limits: { ...custom.limits, technical: 29 } })), /30-point/);
});
