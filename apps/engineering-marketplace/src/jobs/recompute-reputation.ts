import type { MedusaContainer } from '@medusajs/framework/types'
import { rebuildReputation, reputationEnabled } from '../modules/engineering/reputation'

export default async function recomputeReputation(container: MedusaContainer) {
  if (reputationEnabled()) await rebuildReputation(container)
}

export const config = { name: 'engineering-reputation-projection', schedule: '*/2 * * * *' }
