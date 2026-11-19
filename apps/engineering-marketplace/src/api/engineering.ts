import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { MercurModules } from '@mercurjs/types'
import { createPayoutAccountWorkflow, createOnboardingWorkflow } from '@mercurjs/core/workflows'
import Stripe from 'stripe'
const domain = require('../../config/domain.cjs')
const { createCheckoutAdapter } = require('../../config/checkout.cjs')
const { reconcileEngineeringPayment } = require('../../config/finance-state.cjs')

const service = (req:any):any => req.scope.resolve('engineering')
const graph = (req:any):any => req.scope.resolve(ContainerRegistrationKeys.QUERY)
const lock = (req:any,key:string,job:any) => req.scope.resolve(Modules.LOCKING).execute(`engineering:${key}`,job,{timeout:10,expire:60})
const actor = (req:any,role:string) => ({role,id:req.auth_context?.actor_id,sellerId:req.seller_context?.seller_id,commissionBps:domain.configuredCommission(process.env.MARKETPLACE_COMMISSION_BPS)})
function requireOwner(req:any){domain.check(req.seller_context?.seller_member?.role_id==='role_seller_administration','OWNER_REQUIRED',403)}
const privateFields = ['id','name','handle','email','description','website_url','phone','status','metadata','members.email']

export function handler(fn:any) {
  return async(req:any,res:any) => {
    res.setHeader('Cache-Control','private, no-store')
    try { return await fn(req,res) }
    catch(e:any) {
      if(e instanceof domain.DomainError) return res.status(e.status).json({error:e.message})
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(process.env.NODE_ENV==='test'?'engineering test operation failed: '+e.stack:'engineering operation failed')
      return res.status(503).json({error:'SERVICE_UNAVAILABLE'})
    }
  }
}
export const configuration=handler(async(req:any,res:any)=>{
  await service(req).listEngineeringRequests({}, {take:1})
  const commission=domain.configuredCommission(process.env.MARKETPLACE_COMMISSION_BPS)
  res.json({schema:'confenge-engineering/v1',service:'confenge-engineering-marketplace',version:'0.1.0',terms_version:domain.TERMS,
    payment_mode:process.env.MARKETPLACE_PAYMENT_MODE||'test',
    paymentsEnabled:process.env.MARKETPLACE_PAYMENTS_ENABLED==='true',commission_bps:commission!==null&&Number.isInteger(commission)&&commission>=0&&commission<=5000?commission:null})
})
async function seller(req:any,id:string) {
  const {data}=await graph(req).graph({entity:'seller',fields:privateFields,filters:{id}})
  domain.check(data[0],'NOT_FOUND',404);return data[0]
}
async function publicReviewSummary(req:any,sellerId:string){
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  // A valid historical review remains visible after a later refund/dispute.
  // New reviews still require a paid, completed contract in applyAction.
  const rows=()=>db('engineering_request').where({seller_id:sellerId}).whereNull('deleted_at').whereRaw("review ->> 'status' = ?",['published'])
  const totals=await rows().select(db.raw("count(*)::int as count, avg((review ->> 'rating')::numeric)::float8 as rating")).first()
  const recent=await rows().select('review').orderBy('created_at','desc').limit(30)
  return {rating:totals?.rating===null?null:Number(totals?.rating),review_count:Number(totals?.count||0),reviews:recent.map((r:any)=>({rating:r.review.rating,note:r.review.note,created_at:r.review.created_at}))}
}
function safeSeller(s:any,summary:any={rating:null,review_count:0,reviews:[]}){
  const profile=s.metadata?.engineering_profile || null
  return {id:s.id,name:s.name,handle:s.handle,description:s.description,website_url:s.website_url,status:s.status,profile,verified:s.metadata?.engineering_verified===true,
    ...summary}
}
export const providers=handler(async(req:any,res:any)=>{
  const q=String(req.query.q||'').trim().slice(0,100)
  const offset=Math.max(0,Math.min(10000,Number(req.query.offset)||0)),limit=Math.max(1,Math.min(24,Number(req.query.limit)||12))
  const {data,metadata}=await graph(req).graph({entity:'seller',fields:privateFields,filters:{status:'open',metadata:{engineering_verified:true},...(q?{$or:[{name:{$ilike:`%${q}%`}},{description:{$ilike:`%${q}%`}}]}:{})},pagination:{skip:offset,take:limit,order:{created_at:'DESC'}}})
  const providers:any[]=[]
  for(const s of data){ if(!s.metadata?.engineering_profile || s.metadata?.engineering_verified!==true)continue
    providers.push(safeSeller(s,await publicReviewSummary(req,s.id)))
  }
  res.json({providers,count:metadata?.count||0,offset,limit})
})
export const provider=handler(async(req:any,res:any)=>{
  const s=await seller(req,req.params.id)
  domain.check(s.status==='open'&&s.metadata?.engineering_verified===true&&s.metadata?.engineering_profile,'NOT_FOUND',404)
  res.json({provider:safeSeller(s,await publicReviewSummary(req,s.id))})
})
export const getProfile=handler(async(req:any,res:any)=>{const s=await seller(req,req.seller_context.seller_id);res.json({provider:{...safeSeller(s,await publicReviewSummary(req,s.id)),phone:s.phone,website_url:s.website_url}})})
export const updateProfile=handler(async(req:any,res:any)=>{
  requireOwner(req)
  const clean=domain.validateProfile(req.body)
  await lock(req,`profile:${req.seller_context.seller_id}`,async()=>{
    const current=await seller(req,req.seller_context.seller_id)
    // Any edited professional information requires a new operator review.
    const updated=await req.scope.resolve(MercurModules.SELLER).updateSellers({id:current.id,name:clean.name,description:clean.description,website_url:clean.website_url,phone:clean.phone,
      metadata:{...current.metadata,engineering_profile:clean.profile,engineering_verified:false,engineering_terms:{version:domain.TERMS,accepted_at:new Date().toISOString()}}})
    res.json({provider:{...safeSeller(updated),phone:updated.phone,website_url:updated.website_url}})
  })
})
export const listRequests=(role:string)=>handler(async(req:any,res:any)=>{
  const who=actor(req,role);domain.check(who.id,'AUTH_REQUIRED',401)
  const [requests,count]=await service(req).listAndCountEngineeringRequests(role==='customer'?{customer_id:who.id}:{seller_id:who.sellerId},{take:100,order:{created_at:'DESC'}})
  res.json({requests:requests.map(domain.publicRequest),count})
})
export const createRequest=handler(async(req:any,res:any)=>{
  const clean=domain.validateRequest(req.body), s=await seller(req,clean.seller_id)
  domain.check(s.status==='open'&&s.metadata?.engineering_verified===true,'PROVIDER_UNAVAILABLE',409)
  domain.check(s.metadata.engineering_profile?.specialties?.includes(clean.intent_family),'SPECIALTY_UNAVAILABLE',409)
  const customer=await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
  const email=customer.email?.toLowerCase()
  domain.check(email && email!==s.email?.toLowerCase() && !(s.members||[]).some((m:any)=>m.email?.toLowerCase()===email),'SELF_CONTRACT_FORBIDDEN',403)
  const record=await service(req).createEngineeringRequests({...clean,customer_id:customer.id,events:{entries:[{action:'request',role:'customer',at:new Date().toISOString()}]}})
  res.status(201).json({request:domain.publicRequest(record)})
})
export const requestAction=(role:string)=>handler(async(req:any,res:any)=>{
  if(role==='provider') requireOwner(req)
  await lock(req,req.params.id,async()=>{
    const record=await service(req).retrieveEngineeringRequest(req.params.id)
    const who:any=actor(req,role)
    if(role==='provider') {
      const s=await seller(req,record.seller_id)
      domain.check(s.status==='open'&&(req.body.action!=='quote'||s.metadata?.engineering_verified===true),'PROVIDER_UNAVAILABLE',409)
      who.providerProfile={id:s.id,name:s.name,registration_board:s.metadata?.engineering_profile?.registration_board,registration:s.metadata?.engineering_profile?.registration}
    }
    const patch=domain.applyAction(record,who,req.body)
    const changed=await service(req).updateEngineeringRequests({id:record.id,...patch})
    res.json({request:domain.publicRequest(changed)})
  })
})
function paymentAdapter(){
  return createCheckoutAdapter({stripe:new Stripe(process.env.STRIPE_SECRET_KEY||'disabled'),mode:process.env.MARKETPLACE_PAYMENT_MODE||'test',webhookSecret:process.env.STRIPE_OPERATOR_WEBHOOK_SECRET||'',paymentsEnabled:process.env.MARKETPLACE_PAYMENTS_ENABLED==='true',publicBaseUrl:'https://confenge.com.br'})
}
function checkoutRequest(r:any){return {id:r.id,revision:r.revision,title:r.title,amountCents:r.proposal?.amount_cents,currency:'brl',customerId:r.customer_id,sellerId:r.seller_id,customerAcceptedRevision:r.acceptance?.revision,providerAcceptedRevision:r.revision}}
function expectedPayment(r:any){return {...checkoutRequest(r),request:checkoutRequest(r),accountId:r.payment?.account_id,feeCents:r.payment?.fee_cents,customerId:r.customer_id}}
export const checkout=handler(async(req:any,res:any)=>{
  domain.check(process.env.MARKETPLACE_PAYMENTS_ENABLED==='true','PAYMENTS_UNAVAILABLE',503)
  await lock(req,req.params.id,async(signal:any)=>{
    const r=await service(req).retrieveEngineeringRequest(req.params.id)
    domain.check(r.customer_id===req.auth_context.actor_id,'NOT_FOUND',404)
    domain.check(r.status==='accepted'&&r.acceptance?.revision===r.revision&&r.acceptance?.proposal_hash===r.proposal?.hash,'ACCEPTANCE_REQUIRED',409)
    domain.ensureDeadline(r.proposal)
    const s=await seller(req,r.seller_id);domain.check(s.status==='open'&&s.metadata?.engineering_verified===true,'PROVIDER_UNAVAILABLE',409)
    if(r.payment){domain.check(r.payment.status==='pending'&&r.payment.url&&r.payment.expires_at*1000>Date.now(),'PAYMENT_RECONCILIATION_REQUIRED',409);return res.json({url:r.payment.url})}
    domain.check(Number.isInteger(r.proposal.commission_bps)&&Number.isSafeInteger(r.proposal.fee_cents),'COMMISSION_UNCONFIGURED',503)
    const {data:[account]}=await graph(req).graph({entity:'payout_account',fields:['id','external_id','status','charges_enabled','payouts_enabled'],filters:{seller:{id:r.seller_id}}})
    domain.check(account?.status==='active'&&account?.charges_enabled&&account?.payouts_enabled&&/^acct_/.test(account.external_id),'PROVIDER_PAYMENT_UNAVAILABLE',409)
    const payment={status:'creating',account_id:account.external_id,amount_cents:r.proposal.amount_cents,fee_cents:r.proposal.fee_cents,started_at:new Date().toISOString()}
    await service(req).updateEngineeringRequests({id:r.id,payment})
    // A timeout leaves `creating`; no second session is invented on retry.
    const session=await paymentAdapter().createCheckout({request:checkoutRequest(r),accountId:payment.account_id,feeCents:payment.fee_cents,customerId:r.customer_id})
    domain.check(!signal?.aborted,'LOCK_LOST',503)
    await service(req).updateEngineeringRequests({id:r.id,payment:{...payment,status:'pending',session_id:session.id||session.sessionId,url:session.url,expires_at:session.expiresAt}})
    res.json({url:session.url})
  })
})
export const connect=handler(async(req:any,res:any)=>{
  requireOwner(req)
  domain.check(process.env.MARKETPLACE_PAYMENTS_ENABLED==='true','PAYMENTS_UNAVAILABLE',503)
  await lock(req,`connect:${req.seller_context.seller_id}`,async()=>{
    const {data:[account]}=await graph(req).graph({entity:'payout_account',fields:['id'],filters:{seller:{id:req.seller_context.seller_id}}})
    let accountId=account?.id
    if(!accountId){const {result}=await createPayoutAccountWorkflow(req.scope).run({input:{seller_id:req.seller_context.seller_id}});accountId=result.id}
    const {result}=await createOnboardingWorkflow(req.scope).run({input:{account_id:accountId,data:{return_url:'https://confenge.com.br/profissionais/#minha-conta',refresh_url:'https://confenge.com.br/profissionais/#minha-conta'}}})
    const url=(result as any).data?.url
    domain.check(typeof url==='string'&&new URL(url).hostname==='connect.stripe.com','ONBOARDING_UNAVAILABLE',503)
    res.json({url})
  })
})
export const webhook=handler(async(req:any,res:any)=>{
  const adapter=paymentAdapter();let event:any
  try{event=adapter.verifyEvent(req.rawBody,req.get('stripe-signature'))}catch{return res.status(400).json({error:'INVALID_SIGNATURE'})}
  const identity=await adapter.readPaymentEvent(event)
  if(!identity?.requestId)return res.json({received:true})
  await lock(req,identity.requestId,async()=>{
    const r=await service(req).retrieveEngineeringRequest(identity.requestId)
    if(!r.payment?.session_id)return res.status(409).json({error:'RECONCILIATION_REQUIRED'})
    domain.check(identity.revision===r.revision,'PAYMENT_MISMATCH',409)
    // An authenticated adverse event suspends eligibility even if the later
    // Stripe read temporarily fails. A retry still uses authoritative facts.
    if(/^(charge\.(refunded|dispute\.)|refund\.)/.test(event.type)) {
      await service(req).updateEngineeringRequests({id:r.id,payment:{...r.payment,status:'reconciling'}})
    }
    const fact=await adapter.retrieveCheckout(r.payment.session_id,expectedPayment(r))
    const {status,paymentStatus}=reconcileEngineeringPayment(r,fact)
    await service(req).updateEngineeringRequests({id:r.id,status,payment:{...r.payment,status:paymentStatus,checked_at:new Date().toISOString(),payment_intent_id:fact.paymentIntentId||r.payment.payment_intent_id}})
    res.json({received:true})
  })
})
