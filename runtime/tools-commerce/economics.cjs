const {readFileSync,lstatSync}=require('node:fs');
const {check,sha,TOOL}=require('./policy.cjs');
const {LOCAL_FORMATS}=require('./exports.cjs');
const VERSION='tools-economics-v1';
const BASIC_OPERATIONS=new Set(['calculadora-bdi:csv','calculadora-de-beiral:txt','conversor-utm-sirgas-2000:csv']);
// The existing LOCAL_FORMATS registry is the complete authorization allowlist.
// No unsupported CPU/RAM/cost estimate is represented as a measured value.
const operations=Object.freeze(Object.fromEntries([
  ...Object.entries(LOCAL_FORMATS).flatMap(([tool,formats])=>formats.map(format=>[tool+':'+format,{
    tool,format,execution:'browser',serverProcessing:'authorization-metadata-only',
    cpuMs:null,peakMemoryBytes:null,storageBytes:null,transferBytes:null,externalApiCents:null,
    estimatedVariableCents:null,observedVariableCents:null,maxPayloadBytes:null,
    experimentalCandidate:BASIC_OPERATIONS.has(tool+':'+format),confidence:'unknown'
  }])),
  [TOOL+':json',{tool:TOOL,format:'json',execution:'server',serverProcessing:'report-render',
    cpuMs:null,peakMemoryBytes:null,storageBytes:null,transferBytes:null,externalApiCents:null,
    estimatedVariableCents:null,observedVariableCents:null,maxPayloadBytes:4*1024*1024,
    experimentalCandidate:false,confidence:'unknown'}]
].map(([key,value])=>[key,Object.freeze(value)])));
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const documented=x=>typeof x==='string'&&x.trim().length>=8&&x.length<=500;
function verifyEvidence(record,offer,now=Date.now()) {
  const unknown=[];
  if(record?.schema!==VERSION||record?.offerId!==offer.id||record?.amountCents!==offer.amountCents||
    record?.credits!==offer.credits||!nonnegative(record?.observedAt)||record.observedAt>now||
    now-record.observedAt>90*86400000||!documented(record?.approvedBy)||!documented(record?.sourceRef))
    return {approved:false,unknown:['commercial_evidence_missing_or_stale'],worstCaseCents:null,operationLimits:{}};
  const parts=record.cycleCosts||{}, categories=['recurringPaymentFees','taxes','refundProvision','support','fixedVariableInfrastructure'];
  for(const k of categories)if(!nonnegative(parts[k]?.upperCents)||!documented(parts[k]?.sourceRef)||
    !['observed','contracted','conservative_estimate'].includes(parts[k]?.basis))unknown.push(k);
  const operationLimits={};let worst=0;
  for(const [id,op] of Object.entries(operations)) {
    const e=record.operations?.[id];
    // This is a complete conservative upper bound for six arbitrary exports,
    // not a mean across observed users or a sample with unknown costs.
    if(!e||!nonnegative(e.upperVariableCents)||!documented(e.sourceRef)||
      !['observed','conservative_estimate'].includes(e.basis)||
      !nonnegative(e.cpuMs)||!nonnegative(e.peakMemoryBytes)||!nonnegative(e.storageBytes)||
      !nonnegative(e.transferBytes)||!nonnegative(e.externalApiCents)||!positive(e.maxPayloadBytes)||
      !positive(e.maxDailyExports)||e.maxDailyExports>10000) {unknown.push(id);continue;}
    if(e.upperVariableCents<e.externalApiCents){unknown.push(id+':inconsistent');continue;}
    operationLimits[id]={maxPayloadBytes:e.maxPayloadBytes,maxDailyExports:e.maxDailyExports,
      upperVariableCents:e.upperVariableCents,experimentalApproved:op.experimentalCandidate&&e.experimentalApproved===true};
    worst=Math.max(worst,e.upperVariableCents);
  }
  if(unknown.length)return {approved:false,unknown,worstCaseCents:null,operationLimits:{}};
  const worstCaseCents=worst*offer.credits+categories.reduce((n,k)=>n+parts[k].upperCents,0);
  if(!Number.isSafeInteger(worstCaseCents))return {approved:false,unknown:['cost_overflow'],worstCaseCents:null,operationLimits:{}};
  return {approved:worstCaseCents*10<=offer.amountCents*3,unknown:[],worstCaseCents,
    marginBasisPoints:Math.floor(10000*(offer.amountCents-worstCaseCents)/offer.amountCents),operationLimits};
}
function loadEvidence(env,offer,mode,now=Date.now()) {
  const empty={approved:false,unknown:['economic_evidence_not_configured'],worstCaseCents:null,operationLimits:{}};
  const path=env.TOOLS_COMMERCE_ECONOMICS_FILE,digest=env.TOOLS_COMMERCE_ECONOMICS_SHA256;
  if(!path||!digest)return empty;
  try {
    check(/^\/[A-Za-z0-9_./-]+$/.test(path)&&!path.includes('..')&&
      (mode!=='live'||path.startsWith('/etc/confenge-web/')),'ECONOMIC_EVIDENCE_INVALID');
    const stat=lstatSync(path);
    check(stat.isFile()&&stat.size<=1024*1024&&(mode!=='live'||(stat.mode&0o022)===0),'ECONOMIC_EVIDENCE_INVALID');
    const bytes=readFileSync(path);
    check(/^[a-f0-9]{64}$/.test(digest)&&sha(bytes)===digest,'ECONOMIC_EVIDENCE_INVALID');
    return verifyEvidence(JSON.parse(bytes.toString('utf8')),offer,now);
  }catch{return {...empty,unknown:['economic_evidence_invalid']};}
}
module.exports={VERSION,operations,BASIC_OPERATIONS,verifyEvidence,loadEvidence};
