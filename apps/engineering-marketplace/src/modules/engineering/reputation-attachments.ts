import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { ATTACHMENTS, EVIDENCE, addEvent, reputationEnabled, sellerTransaction, sql } from './reputation'
const { attachmentConfig, openPdf, pdfBytes, scanPdf, sealPdf, sha256, TICKET } = require('../../../config/reputation-files.cjs')
const { check } = require('../../../config/domain.cjs')

const TICKETS = 'engineering_reputation_attachment_ticket'
const MAX_SELLER_BYTES = 8 * 1024 * 1024
const ATTACHABLE = ['submitted', 'correction_required']
const attachmentCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upload'), id: z.uuid(), content: z.string(), consent: z.literal(true) }).strict(),
  z.object({ action: z.literal('authorize'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('remove'), id: z.uuid() }).strict(),
])

function configured() {
  const config = reputationEnabled() && attachmentConfig()
  check(config, 'NOT_FOUND', 404)
  return config
}

function activeAttachment(tx: any, seller: string, evidence: string) {
  return tx(ATTACHMENTS).where({ seller_id: seller, evidence_id: evidence }).where('expires_at', '>', tx.fn.now())
}

export async function manageAttachment(scope: any, seller: string, raw: unknown) {
  const config = configured()
  const input = attachmentCommand.safeParse(raw)
  if (!input.success) {
    check(false, 'INVALID_REQUEST')
    return
  }
  const command = input.data
  const filter = { id: command.id, seller_id: seller }
  let file: Buffer | null = null
  if (command.action === 'upload') {
    file = pdfBytes(command.content)
    check(file, 'INVALID_DOCUMENT')
    const evidence = await sql(scope)(EVIDENCE).where(filter).first('status')
    check(evidence, 'NOT_FOUND', 404)
    check(ATTACHABLE.includes(evidence.status), 'REQUEST_CONFLICT', 409)
    check(await scanPdf(file!, config.scannerHost), 'DOCUMENT_REJECTED')
  }
  return sellerTransaction(scope, seller, async tx => {
    const record = await tx(EVIDENCE).where(filter).first()
    check(record, 'NOT_FOUND', 404)
    if (command.action === 'authorize') {
      const attachment = await activeAttachment(tx, seller, record.id).forUpdate().first('evidence_id')
      check(attachment, 'NOT_FOUND', 404)
      const token = randomBytes(32).toString('base64url')
      await tx(TICKETS).where({ seller_id: seller, evidence_id: record.id }).delete()
      await tx(TICKETS).insert({ digest: sha256(token), evidence_id: record.id, seller_id: seller,
        expires_at: new Date(Date.now() + 120_000) })
      return { token }
    }
    if (command.action === 'remove') {
      const removed = await tx(ATTACHMENTS).where({ seller_id: seller, evidence_id: record.id }).delete().returning('sha256')
      if (removed.length) await addEvent(tx, record, 'attachment_removed', record.status, { previous_sha256: removed[0].sha256 })
      return { has_attachment: false }
    }
    check(ATTACHABLE.includes(record.status), 'REQUEST_CONFLICT', 409)
    const current = await activeAttachment(tx, seller, record.id).first('sha256')
    if (current?.sha256 === sha256(file!)) return { has_attachment: true }
    const { total } = await tx(ATTACHMENTS).where({ seller_id: seller })
      .whereNot('evidence_id', record.id).where('expires_at', '>', tx.fn.now()).sum('bytes as total').first()
    check(Number(total || 0) + file!.length <= MAX_SELLER_BYTES, 'DOCUMENT_QUOTA', 409)
    const sealed = sealPdf(file!, config, seller, record.id)
    const expires_at = new Date(Date.now() + config.retentionDays * 86_400_000)
    await tx(TICKETS).where({ seller_id: seller, evidence_id: record.id }).delete()
    await tx(ATTACHMENTS).insert({ ...sealed, seller_id: seller, evidence_id: record.id, expires_at }).onConflict('evidence_id').merge()
    await addEvent(tx, record, 'attachment_uploaded', record.status,
      { sha256: sealed.sha256, bytes: sealed.bytes, expires_at, previous_sha256: current?.sha256, consent: true })
    return { has_attachment: true }
  })
}

export async function consumeAttachment(scope: any, seller: string, token: unknown) {
  const config = configured()
  check(typeof token === 'string' && TICKET.test(token), 'NOT_FOUND', 404)
  return sellerTransaction(scope, seller, async tx => {
    const claim = { digest: sha256(token), seller_id: seller }
    const ticket = await tx(TICKETS).where(claim).where('expires_at', '>', tx.fn.now()).first('evidence_id')
    check(ticket, 'NOT_FOUND', 404)
    const attachment = await activeAttachment(tx, seller, ticket.evidence_id).forUpdate().first()
    check(attachment, 'NOT_FOUND', 404)
    const used = await tx(TICKETS).where(claim).where('expires_at', '>', tx.fn.now()).delete()
    check(used === 1, 'NOT_FOUND', 404)
    const record = await tx(EVIDENCE).where({ id: ticket.evidence_id, seller_id: seller }).first()
    const bytes = openPdf(attachment, config, seller, ticket.evidence_id)
    await addEvent(tx, record, 'attachment_accessed', record.status, { actor: 'owner', sha256: attachment.sha256 })
    return bytes
  })
}

export async function exportReviewAttachment(scope: any, raw: unknown) {
  const config = configured()
  const command = z.object({ action: z.literal('attachment'), id: z.uuid(), reviewer: z.string().trim().min(1).max(120) }).strict().parse(raw)
  const original = await sql(scope)(EVIDENCE).where({ id: command.id }).first('seller_id')
  if (!original) throw new Error('Evidence not found')
  return sellerTransaction(scope, original.seller_id, async tx => {
    const record = await tx(EVIDENCE).where({ id: command.id, seller_id: original.seller_id }).first()
    const row = await activeAttachment(tx, original.seller_id, command.id).forUpdate().first()
    if (!row) throw new Error('Attachment not found')
    const bytes = openPdf(row, config, original.seller_id, command.id)
    await addEvent(tx, record, 'attachment_accessed', record.status, { actor: 'operator', reviewer: command.reviewer, sha256: row.sha256 })
    return { content: bytes.toString('base64'), sha256: row.sha256 }
  })
}

export async function purgeExpiredAttachments(scope: any) {
  const db = sql(scope)
  await db.transaction(async (tx: any) => {
    await tx(TICKETS).where('expires_at', '<=', tx.fn.now()).delete()
    const expired = await tx(ATTACHMENTS).where('expires_at', '<=', tx.fn.now()).orderBy('expires_at').limit(200)
      .forUpdate().skipLocked().select('evidence_id', 'sha256')
    for (const item of expired) {
      const evidence = await tx(EVIDENCE).where({ id: item.evidence_id }).first()
      await tx(ATTACHMENTS).where({ evidence_id: item.evidence_id }).delete()
      await addEvent(tx, evidence, 'attachment_expired', evidence.status, { sha256: item.sha256 })
    }
  })
}
