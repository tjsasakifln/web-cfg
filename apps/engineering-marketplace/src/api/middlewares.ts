import { defineMiddlewares, authenticate } from '@medusajs/framework/http'
import { timingSafeEqual } from 'node:crypto'

// The Mercur service is private. Only the same-origin gateway may enter its
// customer/vendor API. Admin access uses an authenticated loopback operator.
function gateway(req: any, res: any, next: any) {
  const expected = process.env.MARKETPLACE_GATEWAY_KEY || ''
  const actual = req.get('x-confenge-gateway-key') || ''
  if (expected.length<32 || actual.length!==expected.length || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) {
    return res.status(403).json({error:'PRIVATE_SERVICE'})
  }
  res.setHeader('Cache-Control','private, no-store')
  next()
}
const financialNative = (_req:any,res:any) => res.status(404).json({error:'NOT_AVAILABLE'})

export default defineMiddlewares({
  routes: [
    {matcher:'/store/*',middlewares:[gateway]},
    {matcher:'/vendor/*',middlewares:[gateway]},
    {matcher:'/auth/*',middlewares:[gateway]},
    {matcher:'/store/engineering/requests*',middlewares:[authenticate('customer',['bearer'])]},
    // Engineering uses an accepted service request and its own Checkout. The
    // native commerce checkout must not create another payment or transfer.
    ...['/store/carts*','/store/payment-collections*','/vendor/payments*','/vendor/payouts*'].map(matcher=>({matcher,middlewares:[financialNative]})),
    {matcher:'/hooks/engineering-stripe',bodyParser:{preserveRawBody:true}},
  ],
})
