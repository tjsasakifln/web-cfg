import { handler, requireOwner } from '../../../../engineering'
import { consumeAttachment, manageAttachment } from '../../../../../modules/engineering/reputation-attachments'
const { check } = require('../../../../../../config/domain.cjs')

function owner(req: any) {
  requireOwner(req)
  const seller = req.seller_context?.seller_id
  check(seller, 'AUTH_REQUIRED', 401)
  return seller
}

export const GET = handler(async (req: any, res: any) => {
  const bytes = await consumeAttachment(req.scope, owner(req), req.query.ticket)
  res.json({ content: bytes.toString('base64') })
})

export const POST = handler(async (req: any, res: any) => {
  res.json(await manageAttachment(req.scope, owner(req), req.body))
})
