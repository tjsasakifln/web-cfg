// Distributed lease complements systemd's host-local mutual exclusion.
async function acquireSweepLease(db,ref,owner,now,ttl) {
  return db.runTransaction(async tx=>{
    const prior=(await tx.get(ref)).data();
    if(prior?.leaseUntil>now)return false;
    tx.set(ref,{leaseOwner:owner,leaseUntil:now+ttl,lastAttemptAt:now},{merge:true});
    return true;
  });
}
async function releaseSweepLease(db,ref,owner,summary) {
  return db.runTransaction(async tx=>{
    const prior=(await tx.get(ref)).data();
    if(prior?.leaseOwner!==owner)return false;
    tx.set(ref,{leaseOwner:null,leaseUntil:0,lastResult:summary,
      ...(summary.failed===0?{lastSuccessAt:summary.finishedAt}:{lastFailureAt:summary.finishedAt})},{merge:true});
    return true;
  });
}
function retryAt(now,attempts) {
  return now+Math.min(3600000,60000*2**Math.min(6,Math.max(0,attempts-1)));
}
module.exports={acquireSweepLease,releaseSweepLease,retryAt};
