const { test }=require('node:test');
const assert=require('node:assert/strict');
const { readFileSync }=require('node:fs');
const { join }=require('node:path');
const vm=require('node:vm');
const { EventEmitter }=require('node:events');

function isolated() {
  let calls=0, last;
  const source=readFileSync(join(__dirname,'../../..','netlify/functions/science-tools.cjs'),'utf8');
  const sandbox={exports:{},__dirname:join(__dirname,'../../..','netlify/functions'),Buffer,URL,process:{env:{NODE_ENV:'production'},once(){}},setTimeout,clearTimeout,
    require(name){if(name==='node:child_process')return{spawn(){calls++;last=new EventEmitter();last.stdin=new EventEmitter();last.stdout=new EventEmitter();last.stderr=new EventEmitter();last.stdin.end=()=>{};last.kill=()=>last.emit('close',137);return last;}};if(name==='node:fs')return{existsSync:()=>true,mkdtempSync:()=>'/tmp/science-test',rmSync:()=>{}};return require(name);}};
  vm.runInNewContext(source,sandbox);
  return{handler:sandbox.exports.handler,calls:()=>calls,finish(){last.stdout.emit('data',Buffer.from(JSON.stringify({ok:true,result:{schema:'confenge.science-result/v1'}})));last.emit('close',0);}};
}
const event=(data={},ip='198.51.100.1')=>({httpMethod:'POST',headers:{'content-type':'application/json','client-ip':ip},body:JSON.stringify({operation:'memory',data})});

test('rejects hostile origins, methods, payloads and deep JSON before spawn',async()=>{
 const m=isolated();
 for(const [request,status] of [[{httpMethod:'GET'},405],[{...event(),headers:{'content-type':'text/plain'}},415],[{...event(),headers:{'content-type':'application/json',origin:'https://evil.invalid'}},403],[{...event(),body:'x'.repeat(481*1024)},413],[{...event(),body:'{"operation":"memory","data":{"x":'+'['.repeat(10000)+'0'+']'.repeat(10000)+'}}'},422],[{...event(),body:'{"operation":"memory","data":{"x":1e999}}'},422],[{...event(),body:'{"operation":"run","data":{}}'},422]])assert.equal((await m.handler(request)).statusCode,status);
 assert.equal(m.calls(),0);
});
test('keeps a single worker active, releases it on close, and enforces per-client rate',async()=>{
 const m=isolated();const first=m.handler(event());assert.equal(m.calls(),1);
 const busy=await m.handler(event({},'198.51.100.2'));assert.equal(busy.statusCode,429);assert.equal(JSON.parse(busy.body).error,'CALCULATION_BUSY');assert.equal(m.calls(),1);
 m.finish();assert.equal((await first).statusCode,200);
 for(let i=0;i<11;i++){const p=m.handler(event());m.finish();assert.equal((await p).statusCode,200);}
 assert.equal(JSON.parse((await m.handler(event())).body).error,'RATE_LIMIT');assert.equal(m.calls(),12);
 const next=m.handler(event({},'198.51.100.3'));m.finish();assert.equal((await next).statusCode,200);
});
