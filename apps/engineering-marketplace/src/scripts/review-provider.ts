import type { ExecArgs } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { MercurModules } from '@mercurjs/types'
const {validateProfile,TERMS}=require('../../config/domain.cjs')

/** Trusted operator CLI. Credentials and access are supplied by the host operator. */
export default async function review({container}:ExecArgs) {
  const id=process.env.MARKETPLACE_REVIEW_SELLER_ID
  const decision=process.env.MARKETPLACE_REVIEW_DECISION
  const operator=process.env.MARKETPLACE_REVIEW_OPERATOR?.trim()
  const evidence=process.env.MARKETPLACE_REVIEW_EVIDENCE?.trim()
  if(!/^sel_[A-Za-z0-9]+$/.test(id||'')||!['approve','withdraw'].includes(decision||'')||!operator||operator.length>160||!evidence||evidence.length<15||evidence.length>2000) throw new Error('Set review seller, decision (approve/withdraw), operator and evidence reference')
  const sellers:any=container.resolve(MercurModules.SELLER)
  await container.resolve(Modules.LOCKING).execute(`engineering:profile:${id}`,async()=>{
    const current:any=await sellers.retrieveSeller(id!)
    if(decision==='approve') {
      if(current.metadata?.engineering_terms?.version!==TERMS)throw new Error('Current profile terms must be accepted')
      validateProfile({name:current.name,description:current.description,website_url:current.website_url,phone:current.phone,profile:current.metadata?.engineering_profile,consent:true,terms_version:TERMS})
    }
    await sellers.updateSellers({id:id!,status:decision==='approve'?'open':'suspended',metadata:{...current.metadata,engineering_verified:decision==='approve',engineering_review:{decision,operator,evidence,at:new Date().toISOString()}}})
    console.log(JSON.stringify({seller_id:id,decision,verified:decision==='approve'}))
  },{timeout:10,expire:60})
}
