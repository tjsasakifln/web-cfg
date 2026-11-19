import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { createApiKeysWorkflow, createSalesChannelsWorkflow, linkSalesChannelsToApiKeyWorkflow, updateStoresWorkflow } from '@medusajs/core-flows'

/** Idempotent infrastructure only. Never creates a fictional marketplace. */
export default async function setup({container}:ExecArgs) {
  const channels=container.resolve(Modules.SALES_CHANNEL)
  const stores=container.resolve(Modules.STORE)
  const keys=container.resolve(Modules.API_KEY)
  const query=container.resolve(ContainerRegistrationKeys.QUERY)
  let [channel]=await channels.listSalesChannels({name:'CONFENGE engineering'})
  if(!channel){const {result}=await createSalesChannelsWorkflow(container).run({input:{salesChannelsData:[{name:'CONFENGE engineering',description:'Contratações de serviços de engenharia'}]}});channel=result[0]}
  const [store]=await stores.listStores()
  if(!store) throw new Error('Run medusa db:migrate before setup')
  await updateStoresWorkflow(container).run({input:{selector:{id:store.id},update:{name:'CONFENGE',default_sales_channel_id:channel.id,supported_currencies:[{currency_code:'brl',is_default:true}]}}})
  let [key]=await keys.listApiKeys({title:'CONFENGE engineering gateway',type:'publishable'})
  if(!key){const {result}=await createApiKeysWorkflow(container).run({input:{api_keys:[{title:'CONFENGE engineering gateway',type:'publishable',created_by:''}]}});key=result[0]}
  const {data}=await query.graph({entity:'api_key',fields:['id','sales_channels.id'],filters:{id:key.id}})
  if(!(data[0]?.sales_channels||[]).some((item:any)=>item.id===channel.id))await linkSalesChannelsToApiKeyWorkflow(container).run({input:{id:key.id,add:[channel.id]}})
  // This key identifies the Store API. It is deliberately publishable, not a secret.
  console.log('MARKETPLACE_SETUP '+JSON.stringify({store_id:store.id,sales_channel_id:channel.id,publishable_key:key.token}))
}
