import type { MedusaContainer } from '@medusajs/framework/types'
import { purgeExpiredAttachments } from '../modules/engineering/reputation-attachments'

export default async function purgeReputationAttachments(container: MedusaContainer) {
  await purgeExpiredAttachments(container)
}

export const config = { name: 'engineering-reputation-attachment-expiry', schedule: '*/5 * * * *' }
