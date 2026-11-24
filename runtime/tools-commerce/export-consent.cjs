const {timingSafeEqual}=require('node:crypto');
const {check,mac}=require('./policy.cjs');
const buckets=new Set(['free','promo','paid','subscription','experiment']);
const ttl=5*60*1000;
function encode(key,claim) {
  const body=Buffer.from(JSON.stringify(claim)).toString('base64url');
  return body+'.'+mac(key,'export-consent-v1',body);
}
function decode(key,token) {
  check(typeof token==='string'&&token.length<=2048&&/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token),'EXPORT_CONFIRMATION_REQUIRED',409);
  const [body,signature]=token.split('.');
  check(timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(key,'export-consent-v1',body),'hex')),'EXPORT_CONFIRMATION_REQUIRED',409);
  let data;try{data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{check(false,'EXPORT_CONFIRMATION_REQUIRED',409);}
  check(data?.version===1&&buckets.has(data.bucket)&&data.credits===1&&Number.isSafeInteger(data.expiresAt),'EXPORT_CONFIRMATION_REQUIRED',409);
  return data;
}
function issue(key,{accountId,exportId,toolId,digest,bucket,source,validUntil,now,recovery=false}) {
  const expiresAt=Math.min(now+ttl,validUntil??Infinity);
  const token=encode(key,{version:1,accountId,exportId,toolId,digest,bucket,source,credits:1,expiresAt});
  return {token,bucket,credits:1,expiresAt,recovery,sourceValidUntil:validUntil??null};
}
function verify(key,token,expected,now) {
  const claim=decode(key,token);
  check(claim.accountId===expected.accountId&&claim.exportId===expected.exportId&&claim.toolId===expected.toolId&&
    claim.digest===expected.digest,'EXPORT_CONFIRMATION_REQUIRED',409);
  check(claim.expiresAt>now&&claim.bucket===expected.bucket&&claim.source===expected.source,'EXPORT_CONFIRMATION_CHANGED',409);
  return claim;
}
module.exports={issue,verify};
