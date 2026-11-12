import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'
const { buildStripeConnectConfig } = require('./config/stripe-connect.cjs')
const { configuredCommission } = require('./config/domain.cjs')

loadEnv(process.env.NODE_ENV || 'development', process.cwd())
const required = (key: string, min = 1) => {
  const value = process.env[key]
  if (!value || value.length < min) throw new Error(`Configure ${key}`)
  return value
}
const redis = process.env.REDIS_URL
if (process.env.NODE_ENV === 'production' && !redis) throw new Error('Configure REDIS_URL')
const origin = process.env.MARKETPLACE_PUBLIC_ORIGIN || 'https://confenge.com.br'
const payment = buildStripeConnectConfig(process.env)
if (payment.paymentsEnabled && configuredCommission(process.env.MARKETPLACE_COMMISSION_BPS)===null) throw new Error('Configure MARKETPLACE_COMMISSION_BPS explicitly')

module.exports = withMercur({
  projectConfig: {
    mercur: { telemetry: false },
    databaseUrl: required('DATABASE_URL'),
    ...(redis ? {redisUrl: redis} : {}),
    workerMode: (process.env.MEDUSA_WORKER_MODE || 'shared') as 'shared' | 'server' | 'worker',
    http: { storeCors: origin, adminCors: origin, vendorCors: origin, authCors: origin,
      jwtSecret: required('JWT_SECRET',32), cookieSecret: required('COOKIE_SECRET',32) },
  },
  admin: { disable: true },
  featureFlags: { seller_registration: true },
  plugins: payment.plugins,
  modules: [
    // This application serves its own customer/provider UI in confenge.com.br.
    // Explicit options also keep native dashboard middleware inert in tests.
    { resolve: '@mercurjs/core/modules/admin-ui', options: {disable:true,appDir:process.cwd(),path:'/dashboard'} },
    { resolve: '@mercurjs/core/modules/vendor-ui', options: {disable:true,appDir:process.cwd(),path:'/seller'} },
    { resolve: './src/modules/engineering' },
    ...payment.modules,
    ...(redis ? [
      {resolve:'@medusajs/medusa/cache-redis',options:{redisUrl:redis}},
      {resolve:'@medusajs/medusa/event-bus-redis',options:{redisUrl:redis}},
      {resolve:'@medusajs/medusa/workflow-engine-redis',options:{redis:{url:redis}}},
      {resolve:'@medusajs/medusa/locking',options:{providers:[{resolve:'@medusajs/medusa/locking-redis',id:'locking-redis',is_default:true,options:{redisUrl:redis}}]}},
    ] : []),
  ],
})
