'use strict';

const { z } = require('zod');
const { intents } = require('./intents.json');
const defaults = require('./reputation-policy.json');

const kinds = [
  ...Object.keys(defaults.technical.weights), 'experience', 'professional_license',
  ...Object.keys(defaults.education.weights), ...Object.keys(defaults.training.weights),
];
const grade = z.number().int().min(1).max(4);
const short = z.string().trim().min(1).max(120);
const officialId = short.regex(/^[A-Za-z0-9./_-]+$/).transform(value => value.toUpperCase());
const sourceRef = z.string().trim().min(12).max(360).regex(/^[^\u0000-\u001F]+$/);
const date = z.iso.date();
const status = ['in_review', 'verified', 'rejected', 'correction_required', 'revoked', 'expired'];
const specialties = z.partialRecord(z.enum(intents.map(row => row.intent_family)), grade)
  .refine(grades => Object.keys(grades).length > 0, 'A verified specialty is required');
const relationship = z.enum(['employment', 'independent', 'other']);
const experienceClaim = z.object({
  role: short, started_on: date, ended_on: date, relationship,
  activities: z.string().trim().min(15).max(800).regex(/^[^\u0000-\u001F]+$/),
}).strict().refine(claim => claim.started_on <= claim.ended_on, 'Invalid experience period');
const credentialClaim = z.object({
  title: short, completed_on: date, hours: z.number().int().positive().max(10000).optional(),
}).strict();

const submissionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'), kind: z.enum(kinds), issuer: short.transform(value => value.toUpperCase()),
    official_id: officialId, issued_on: date, consent: z.literal(true),
    claim: z.union([experienceClaim, credentialClaim]).optional(),
  }).strict().refine(({ kind, claim }) => !claim ||
    (kind === 'experience' && 'role' in claim) ||
    ((Object.hasOwn(defaults.education.weights, kind) || Object.hasOwn(defaults.training.weights, kind)) && 'title' in claim),
  'Claim does not match the evidence type'),
  z.object({
    action: z.literal('appeal'), id: z.uuid(),
    reason: z.string().trim().min(15).max(700).regex(/^[^\u0000-\u001F]+$/),
  }).strict(),
]);
const reviewSchema = z.object({
  id: z.uuid(), reviewer: short, status: z.enum(status), reason: sourceRef,
  verified_kind: z.enum(kinds).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  source_ref: sourceRef.optional(), expires_at: z.iso.datetime().optional(),
  specialties: specialties.optional(), activity_id: officialId.optional(),
  platform_request_id: z.string().regex(/^(engr|ereq)_[A-Za-z0-9]+$/).optional(),
  linked_arts: z.array(officialId).max(80).optional(),
  art_status: z.enum(['registered','closed']).optional(),
  execution_confirmed: z.boolean().optional(),
  attestation_registered: z.boolean().optional(),
  complexity: grade.optional(), responsibility: grade.optional(), scope: grade.optional(),
  started_on: date.optional(), ended_on: date.optional(),
  relationship: relationship.optional(),
  qualification_id: officialId.optional(), hours: z.number().positive().max(10000).optional(),
}).strict();

function validTransition(from, next) {
  const transitions = {
    submitted: ['in_review'],
    in_review: ['verified', 'rejected', 'correction_required'],
    verified: ['revoked','expired'],
    correction_required: ['in_review'],
    rejected: ['in_review'],
    revoked: ['in_review'],
    expired: ['in_review'],
  };
  return (transitions[from] || []).includes(next);
}

function validateVerifiedEvidence(record, review, now) {
  const kind = review.verified_kind || record.kind;
  const technical = Object.hasOwn(defaults.technical.weights, kind);
  if (!review.sha256 || !review.specialties || !review.source_ref) throw new Error('Verification requires hash, source and specialty.');
  if (new Date(record.issued_on) > new Date(now) || (review.expires_at && Date.parse(review.expires_at) <= Date.parse(now))) {
    throw new Error('Verified documents must have effective issue and expiration dates.');
  }
  if (technical && (!/^CREA(?:[- ]|$)/.test(record.issuer) ||
      !review.activity_id || !review.complexity || !review.responsibility || !review.scope ||
      (kind === 'art' && !review.art_status) ||
      (kind === 'cat_with_attestation' && review.attestation_registered !== true))) {
    throw new Error('CREA evidence requires confirmed type, activity and scope.');
  }
  if (kind === 'experience' && (!review.started_on || !review.ended_on || !review.relationship ||
      review.ended_on < review.started_on || review.ended_on > now.slice(0, 10))) {
    throw new Error('Professional experience requires a valid verified interval and relationship.');
  }
  if (kind === 'professional_license') {
    if (!/^(CREA|CAU|CFT|CRT)(?:[- /]|$)/.test(record.issuer) || !review.expires_at) {
      throw new Error('Professional eligibility requires council confirmation with a review deadline.');
    }
  } else if (!technical && kind !== 'experience' && (!review.qualification_id ||
      (Object.hasOwn(defaults.training.weights, kind) && !review.hours))) {
    throw new Error('Qualification requires a canonical reference and any applicable hours.');
  }
  return kind;
}

module.exports = { kinds, submissionSchema, reviewSchema, validTransition, validateVerifiedEvidence };
