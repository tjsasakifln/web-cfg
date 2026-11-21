import { randomUUID } from 'node:crypto'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
const { calculateReputation, readPolicy } = require('../../../config/reputation.cjs')
const { submissionSchema, reviewSchema, validTransition, validateVerifiedEvidence } = require('../../../config/reputation-evidence.cjs')
const { check } = require('../../../config/domain.cjs')

const EVIDENCE = 'engineering_reputation_evidence'
const EVENTS = 'engineering_reputation_event'
const POLICY = 'engineering_reputation_policy'
const PROJECTIONS = 'engineering_reputation_projection'
const HISTORY = 'engineering_reputation_history'
const QUEUE = 'engineering_reputation_queue'
const sql = (scope: any) => scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
const asJson = (value: unknown) => JSON.stringify(value)
const canonicalDate = (value: unknown) => new Date(value as string).toISOString()

export const reputationEnabled = () => process.env.MARKETPLACE_REPUTATION_ENABLED === 'true'
export const publicRankingEnabled = () => reputationEnabled() && process.env.MARKETPLACE_REPUTATION_PUBLIC_ENABLED === 'true'

async function sellerTransaction(scope: any, seller: string, action: (tx: any) => Promise<any>) {
  return sql(scope).transaction(async (tx: any) => {
    await tx.raw('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`engineering-reputation:${seller}`])
    return action(tx)
  })
}

async function queue(tx: any, seller: string) {
  await tx(QUEUE).insert({ seller_id: seller }).onConflict('seller_id').merge({ queued_at: tx.fn.now() })
}

async function addEvent(tx: any, record: any, action: string, next: string, decision: unknown) {
  await tx(EVENTS).insert({
    seller_id: record.seller_id, evidence_id: record.id, action,
    previous_status: record.status || null, next_status: next, decision: asJson(decision),
  })
}

function ownerEvidence(row: any) {
  return {
    id: row.id, kind: row.kind, issuer: row.issuer, status: row.status,
    issued_on: typeof row.issued_on === 'string' ? row.issued_on.slice(0, 10) : canonicalDate(row.issued_on).slice(0, 10),
  }
}

export function publicReputation(row: any) {
  if (!row || !row.payload?.total || (row.valid_until && Date.parse(row.valid_until) <= Date.now())) return null
  const { total, qualification, points, version, details } = row.payload
  return { total, qualification, points, version, verified_activities: details.technical.activities,
    completed_services: details.services.completed, experience_days: details.experience.days,
    verified_education: details.education.records, verified_training: details.training.records,
    as_of: canonicalDate(row.computed_at) }
}

function eligibleProjection(db: any, specialty: string) {
  return db(PROJECTIONS + ' as r').where({ 'r.specialty': specialty, 'r.eligible': true })
    .where('r.valid_until', '>', db.fn.now())
    .whereNotExists(db(QUEUE + ' as q').select(db.raw('1')).whereColumn('q.seller_id', 'r.seller_id'))
}

export async function findRankedSellers(scope: any, input: {
  specialty: string, search: string, uf: string, city: string, modality: string, verifiedOnly: boolean,
  minScore: number, offset: number, limit: number,
}) {
  const db = sql(scope)
  const query = eligibleProjection(db, input.specialty).join('seller as s', 's.id', 'r.seller_id')
    .where('s.status', 'open').whereNull('s.deleted_at')
    .whereRaw("s.metadata->>'engineering_verified' = ?", ['true'])
  if (input.specialty) query.whereRaw("s.metadata->'engineering_profile'->'specialties' @> ?::jsonb", [JSON.stringify([input.specialty])])
  if (input.search) query.where((nested: any) => {
    nested.whereILike('s.name', `%${input.search}%`).orWhereILike('s.description', `%${input.search}%`)
  })
  if (input.uf) query.whereRaw("s.metadata->'engineering_profile'->>'uf' = ?", [input.uf])
  if (input.city) query.whereRaw("lower(s.metadata->'engineering_profile'->>'city') = lower(?)", [input.city])
  if (input.modality) query.whereRaw("s.metadata->'engineering_profile'->'modalities' @> ?::jsonb", [JSON.stringify([input.modality])])
  if (input.verifiedOnly) query.whereNotNull('r.qualification')
  if (input.minScore) query.where('r.total', '>=', input.minScore)
  const [result, totals] = await Promise.all([
    query.clone().select('s.id', 's.name', 's.handle', 's.description', 's.website_url', 's.status', 's.metadata',
      'r.payload', 'r.computed_at', 'r.valid_until').orderBy('r.qualification', 'desc', 'last')
      .orderBy('r.total', 'desc', 'last').orderBy('s.id').offset(input.offset).limit(input.limit),
    query.clone().count('* as count').first(),
  ])
  return { result, count: Number(totals.count) }
}

export async function getPublicReputation(scope: any, seller: string, specialty = '') {
  const db = sql(scope)
  const row = await eligibleProjection(db, specialty).where('r.seller_id', seller).first()
  return { eligible: !!row, score: publicReputation(row) }
}

export async function getOwnerReputation(scope: any, seller: string) {
  const db = sql(scope)
  const [current, records, history, pending] = await Promise.all([
    db(PROJECTIONS).where({ seller_id: seller, specialty: '' }).first(),
    db(EVIDENCE).where({ seller_id: seller }).orderBy('created_at', 'desc').limit(150),
    db(HISTORY).where({ seller_id: seller }).orderBy('id', 'desc').limit(24),
    db(QUEUE).where({ seller_id: seller }).first('seller_id'),
  ])
  return {
    score: publicReputation(current), pending_calculation: !!pending,
    documents: records.map(ownerEvidence),
    history: history.map((row: any) => ({ total: row.payload?.total ?? null, as_of: canonicalDate(row.computed_at) })),
  }
}

export async function receiveEvidence(scope: any, seller: string, raw: unknown) {
  const parsed = submissionSchema.safeParse(raw)
  check(parsed.success, 'INVALID_REQUEST')
  const body = parsed.data
  return sellerTransaction(scope, seller, async tx => {
    if (body.action === 'appeal') {
      const record = await tx(EVIDENCE).where({ seller_id: seller, id: body.id }).first()
      check(record, 'NOT_FOUND', 404)
      const last = await tx(EVENTS).where({ evidence_id: record.id }).orderBy('id', 'desc').first('action')
      check(last?.action !== 'appeal', 'REQUEST_CONFLICT', 409)
      await addEvent(tx, record, 'appeal', record.status, { reason: body.reason })
      return ownerEvidence(record)
    }
    const duplicate = await tx(EVIDENCE).where({
      seller_id: seller, kind: body.kind, issuer: body.issuer, official_id: body.official_id,
    }).first()
    if (duplicate) return ownerEvidence(duplicate)
    const { count } = await tx(EVIDENCE).where({ seller_id: seller }).count('* as count').first()
    check(Number(count) < 150, 'REQUEST_CONFLICT', 409)
    check(body.issued_on <= new Date().toISOString().slice(0, 10), 'INVALID_REQUEST')
    const [record] = await tx(EVIDENCE).insert({
      id: randomUUID(), seller_id: seller, kind: body.kind, issuer: body.issuer,
      official_id: body.official_id, issued_on: body.issued_on, status: 'submitted',
    }).returning('*')
    await addEvent(tx, { ...record, status: null }, 'submitted', 'submitted', { consent: body.consent, policy: 'reputation-evidence-v1' })
    return ownerEvidence(record)
  })
}

export async function reviewEvidence(scope: any, raw: unknown) {
  const review = reviewSchema.parse(raw)
  const db = sql(scope)
  const original = await db(EVIDENCE).where({ id: review.id }).first('seller_id')
  if (!original) throw new Error('Evidence not found')
  return sellerTransaction(scope, original.seller_id, async tx => {
    const record = await tx(EVIDENCE).where({ id: review.id, seller_id: original.seller_id }).first()
    if (!record || !validTransition(record.status, review.status)) throw new Error('Invalid evidence transition')
    const now = new Date().toISOString()
    let update: any = { status: review.status }
    if (review.status === 'verified') {
      const kind = validateVerifiedEvidence(record, review, now)
      if (review.platform_request_id) {
        const related = await tx('engineering_request').where({
          id: review.platform_request_id, seller_id: record.seller_id,
        }).whereNull('deleted_at').first('id')
        if (!related) throw new Error('Linked contract does not belong to the evidence owner')
      }
      const { id, status, verified_kind, sha256, expires_at, ...facts } = review
      update = { ...update, kind, sha256, expires_at: expires_at || null,
        verification: asJson({ ...facts, at: now, official_id: record.official_id }) }
    }
    await tx(EVIDENCE).where({ id: record.id, seller_id: record.seller_id }).update(update)
    await addEvent(tx, record, 'review', review.status, { ...review, at: now })
    await queue(tx, record.seller_id)
    return { id: record.id, status: review.status }
  })
}

export async function reviewQueue(scope: any, status: string) {
  const allowed = ['submitted','in_review','verified','rejected','correction_required','revoked','expired']
  if (!allowed.includes(status)) throw new Error('Invalid review queue state')
  return sql(scope)(EVIDENCE).where({ status }).orderBy('created_at').limit(50)
    .select('id','seller_id','kind','issuer','official_id','issued_on','status')
}

export async function evidenceCase(scope: any, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid case identifier')
  const db = sql(scope)
  const record = await db(EVIDENCE).where({ id }).first()
  if (!record) throw new Error('Evidence not found')
  const events = await db(EVENTS).where({ evidence_id: id }).orderBy('id','desc').limit(50)
  return { record, events }
}

export async function rebuildReputation(scope: any, max = 30) {
  const db = sql(scope)
  const configuration = readPolicy()
  const { policy, digest } = configuration
  await db(POLICY).insert({ version: policy.version, digest, policy: asJson(policy) }).onConflict('version').ignore()
  const stored = await db(POLICY).where({ version: policy.version }).first('digest')
  if (stored?.digest !== digest) throw new Error('Reputation policy version already has different parameters')
  const [queued, stale] = await Promise.all([
    db(QUEUE).orderBy('queued_at').limit(max).select('seller_id'),
    db(PROJECTIONS).where({ specialty: '' }).andWhere(function (this: any) {
      this.whereNot('digest', digest).orWhere('valid_until', '<=', db.fn.now())
    }).limit(max).select('seller_id'),
  ])
  const sellers = [...new Set<string>([...queued, ...stale].map((row: any) => row.seller_id))].slice(0, max)
  for (const seller of sellers) {
    await sellerTransaction(scope, seller, async tx => {
      // Lock the dirty marker before reading contracts. A concurrent payment
      // event queues a fresh marker after this transaction commits.
      await tx(QUEUE).insert({ seller_id: seller }).onConflict('seller_id').ignore()
      await tx(QUEUE).where({ seller_id: seller }).forUpdate().first()
      const now = new Date().toISOString()
      const [evidence, contracts, prior] = await Promise.all([
        tx(EVIDENCE).where({ seller_id: seller }).select('id','seller_id','kind','status','verification','sha256','expires_at'),
        tx('engineering_request').where({ seller_id: seller, status: 'completed' }).whereNull('deleted_at')
          .select('id','customer_id','status','intent_family','payment','acceptance','delivery','review','events','proposal'),
        tx(PROJECTIONS).where({ seller_id: seller, specialty: '' }).first('payload'),
      ])
      const specialties = new Set<string>(contracts.map((row: any) => row.intent_family))
      const eligibility = new Set<string>()
      const expiry: string[] = []
      for (const record of evidence) {
        if (record.status !== 'verified') continue
        if (record.expires_at) {
          const until = canonicalDate(record.expires_at)
          if (until <= now) {
            await tx(EVIDENCE).where({ id: record.id, seller_id: seller }).update({ status: 'expired' })
            await addEvent(tx, record, 'expire', 'expired', { at: now })
            record.status = 'expired'
            continue
          }
          expiry.push(until)
          record.expires_at = until
        }
        for (const key of Object.keys(record.verification?.specialties || {})) {
          specialties.add(key)
          if (record.kind === 'professional_license' && record.expires_at) eligibility.add(key)
        }
      }
      const validUntil = expiry.sort()[0] || null
      const rows = ['', ...specialties].map(specialty => {
        const result = calculateReputation({ evidence, contracts, specialty: specialty || null, asOf: now }, configuration)
        return { seller_id: seller, specialty, payload: asJson(result), digest, computed_at: now, valid_until: validUntil,
          eligible: specialty ? eligibility.has(specialty) : eligibility.size > 0, total: result.total, qualification: result.qualification }
      })
      const current = JSON.parse(rows[0].payload)
      const pointsChanged = Object.keys(current.points).some(key => prior?.payload?.points?.[key] !== current.points[key])
      if (pointsChanged || prior?.payload?.version !== current.version) {
        await tx(HISTORY).insert({ seller_id: seller, payload: asJson({ total: current.total, points: current.points, version: current.version }), computed_at: now })
      }
      await tx(PROJECTIONS).where({ seller_id: seller }).delete()
      await tx(PROJECTIONS).insert(rows)
      await tx(QUEUE).where({ seller_id: seller }).delete()
    })
  }
  return sellers.length
}
