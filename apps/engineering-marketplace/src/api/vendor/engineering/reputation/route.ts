import { handler, requireOwner } from '../../../engineering'
import { getOwnerReputation, receiveEvidence, reputationEnabled } from '../../../../modules/engineering/reputation'
const { check } = require('../../../../../config/domain.cjs')

function authorizedSeller(req: any) {
  check(reputationEnabled(), 'NOT_FOUND', 404)
  requireOwner(req)
  const seller = req.seller_context?.seller_id
  check(seller, 'AUTH_REQUIRED', 401)
  return seller
}

export const GET = handler(async (req: any, res: any) => {
  res.json(await getOwnerReputation(req.scope, authorizedSeller(req)))
})

export const POST = handler(async (req: any, res: any) => {
  const document = await receiveEvidence(req.scope, authorizedSeller(req), req.body)
  res.status(req.body.action === 'submit' ? 201 : 200).json({ document })
})
