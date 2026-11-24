// Mercado Pago's debit_date may change on retries; date_created is NOT
// the contractual start. Use the provider's auto_recurring.start_date as
// immutable anchor, and first-observed scheduled debit as corroboration.
// The rollout is gated on external proof of this contract for BRL.
const offset=3*3600000;
const local=t=>new Date(t-offset);
const dateKey=t=>local(t).toISOString().slice(0,10);
function parse(value) {
  return typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
}
function periodAt(anchor,index) {
  if(!Number.isSafeInteger(anchor)||!Number.isSafeInteger(index)||index<0||index>12000)return null;
  const d=local(anchor), y=d.getUTCFullYear(),m=d.getUTCMonth()+index;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return Date.UTC(y,m,Math.min(d.getUTCDate(),last),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds())+offset;
}
function calendarPeriod(subscription,invoice,previous=null) {
  const anchor=parse(subscription?.auto_recurring?.start_date);
  if(!Number.isFinite(anchor))return {reason:'contract_anchor_missing'};
  if(previous?.calendarAnchor!=null&&previous.calendarAnchor!==anchor)return {reason:'contract_anchor_changed'};
  const debit=parse(invoice?.debit_date);
  if(!Number.isFinite(debit))return {reason:'scheduled_debit_missing'};
  if(previous?.cycleIndex!=null) {
    const startsAt=periodAt(anchor,previous.cycleIndex),expiresAt=periodAt(anchor,previous.cycleIndex+1);
    if(startsAt!==previous.startsAt||expiresAt!==previous.expiresAt)return {reason:'contract_period_changed'};
    if(dateKey(debit)!==dateKey(startsAt)) {
      // Official retry window is ten days. It must not define a new cycle.
      if(!Number.isInteger(invoice.retry_attempt)||invoice.retry_attempt<=0||debit<startsAt-86400000||debit>=startsAt+11*86400000)
        return {reason:'scheduled_debit_changed'};
    }
    return {calendarAnchor:anchor,cycleIndex:previous.cycleIndex,startsAt,expiresAt};
  }
  const a=local(anchor),d=local(debit);
  const index=(d.getUTCFullYear()-a.getUTCFullYear())*12+d.getUTCMonth()-a.getUTCMonth();
  // For a first-seen retried invoice a mutable debit date is not sufficient
  // to prove a period. Keep the financial fact in review, never guess.
  if(!Number.isInteger(invoice.retry_attempt)||invoice.retry_attempt>0)return {reason:'first_seen_retry_or_unknown'};
  const startsAt=periodAt(anchor,index),expiresAt=periodAt(anchor,index+1);
  if(startsAt===null||expiresAt===null||dateKey(debit)!==dateKey(startsAt))return {reason:'schedule_mismatch'};
  return {calendarAnchor:anchor,cycleIndex:index,startsAt,expiresAt};
}
module.exports={periodAt,calendarPeriod};
