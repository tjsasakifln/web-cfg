import { readFileSync } from 'node:fs'
import type { ExecArgs } from '@medusajs/framework/types'
import { evidenceCase, rebuildReputation, reviewEvidence, reviewIntegritySignals, reviewQueue } from '../modules/engineering/reputation'
import { exportReviewAttachment } from '../modules/engineering/reputation-attachments'

export default async function run({ container }: ExecArgs) {
  const input = readFileSync(0, 'utf8')
  if (Buffer.byteLength(input, 'utf8') > 16_384) throw new Error('Review input exceeds 16 KiB')
  const command = JSON.parse(input)
  if (command?.action === 'queue') {
    console.log(JSON.stringify(await reviewQueue(container, command.status || 'submitted')))
    return
  }
  if (command?.action === 'case') {
    console.log(JSON.stringify(await evidenceCase(container, command.id)))
    return
  }
  if (command?.action === 'integrity') {
    console.log(JSON.stringify(await reviewIntegritySignals(container, command.seller_id)))
    return
  }
  if (command?.action === 'attachment') {
    if (process.env.MARKETPLACE_ATTACHMENT_EXPORT !== 'true') throw new Error('Export requires the private attachment reader')
    console.log('CONFENGE_PRIVATE_ATTACHMENT ' + JSON.stringify(await exportReviewAttachment(container, command)))
    return
  }
  if (command?.action === 'recompute' && Object.keys(command).length === 1) {
    console.log(JSON.stringify({ recalculated: await rebuildReputation(container) }))
    return
  }
  const reviewed = await reviewEvidence(container, command)
  await rebuildReputation(container)
  console.log(JSON.stringify(reviewed))
}
