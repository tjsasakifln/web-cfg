const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const { test } = require('node:test');

const root = resolve(__dirname, '../..');
// Execute the actual module body. Only browser imports are replaced with
// deterministic collaborators; the authorization and recovery code is unchanged.
const source = readFileSync(resolve(root, 'assets/js/tool-credits.mjs'), 'utf8')
  .replace(/^import .*tool-referral\.mjs';/m, 'const referralFirstTouch = () => undefined; const validReferral = () => false;')
  .replace("await import('/assets/tools-commerce/firebase-auth.mjs')", '__firebase')
  .replace(/^export /gm, '')
  + '\nglobalThis.walletModule = {createToolCredits, printToolResultSnapshot};';
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ initial = 'A', onRequest, beforeStylesLoad } = {}) {
  const requests = [], events = [], prints = [], frames = [], listeners = new Set();
  const storage = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}; };
  class Element {
    constructor(tag, owner) { this.tagName=tag.toUpperCase(); this.ownerDocument=owner; this.children=[]; this.dataset={}; this.attributes={}; this.className=''; this._text=''; this.listeners=new Map(); }
    get textContent() { return this._text + this.children.map(child=>typeof child==='string'?child:child.textContent).join(''); }
    set textContent(value) { this._text=String(value); this.children=[]; }
    get isConnected() { return this._root===true || Boolean(this.parentNode?.isConnected); }
    append(...nodes) { for (const node of nodes) { this.children.push(node); if (typeof node!=='string') { node.parentNode=this; if(node.tagName==='LINK')queueMicrotask(()=>{beforeStylesLoad?.(node);node.onload?.();}); } } }
    prepend(...nodes) { for(const node of nodes.reverse()){this.children.unshift(node);if(typeof node!=='string')node.parentNode=this;} }
    replaceChildren(...nodes) { for(const node of this.children)if(typeof node!=='string')node.parentNode=null;this.children=[];this._text='';this.append(...nodes); }
    remove() { if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null; }
    setAttribute(name,value) { this.attributes[name]=String(value); }
    addEventListener(name,handler) { this.listeners.set(name,handler); }
    showModal() { this.open=true; }
    close() { this.open=false;this.listeners.get('close')?.(); }
    focus() { this.ownerDocument.activeElement=this; }
    contains(node) { return node===this||this.children.some(child=>typeof child!=='string'&&child.contains(node)); }
    matches(selector) {
      if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));
      const tag=selector.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
      const cls=selector.match(/\.([\w-]+)/)?.[1];if(cls&&!this.className.split(/\s+/).includes(cls))return false;
      const attr=selector.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
      if(attr){const key=attr[1].replace(/^data-/,'').replace(/-([a-z])/g,(_,v)=>v.toUpperCase());const value=attr[1].startsWith('data-')?this.dataset[key]:this[attr[1]]??this.attributes[attr[1]];if(value===undefined)return false;if(attr[2]!==undefined&&String(value)!==attr[2])return false;}
      return true;
    }
    querySelectorAll(selector) { const found=[];for(const node of this.children)if(typeof node!=='string'){if(node.matches(selector))found.push(node);found.push(...node.querySelectorAll(selector));}return found; }
    querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  }
  function document() {
    const doc={activeElement:null};doc.documentElement=new Element('html',doc);doc.documentElement._root=true;
    doc.head=new Element('head',doc);doc.body=new Element('body',doc);doc.documentElement.append(doc.head,doc.body);
    doc.createElement=tag=>{
      const node=new Element(tag,doc);
      if(tag==='iframe'){
        node.contentDocument=document();const handlers=new Map();
        node.contentWindow={focus(){},addEventListener:(name,fn)=>handlers.set(name,fn),print(){prints.push(node.contentDocument.body.textContent);handlers.get('afterprint')?.();}};
        frames.push(node);
      }
      return node;
    };
    doc.querySelector=selector=>doc.documentElement.querySelector(selector);doc.querySelectorAll=selector=>doc.documentElement.querySelectorAll(selector);return doc;
  }
  const doc=document();
  const users={};
  for(const uid of ['A','B'])users[uid]={uid,email:`${uid}@example.test`,emailVerified:true,reload:async()=>{},getIdToken:async()=>`token-${uid}`};
  const auth={currentUser:initial?users[initial]:null,authStateReady:async()=>{}};
  const setUser=uid=>{auth.currentUser=uid?users[uid]:null;for(const listener of listeners)listener(auth.currentUser);};
  const firebase={getApps:()=>[{name:'confenge-tools'}],getAuth:()=>auth,onAuthStateChanged:(_auth,fn)=>{listeners.add(fn);fn(auth.currentUser);},signOut:async()=>setUser(null)};
  const config={enabled:true,sharedExportsEnabled:true,purchasesEnabled:true,checkoutEnabled:true,firebase:{apiKey:'fixture'},tools:['modela-memoria','calculadora-bdi'],authProviders:[],packages:[{id:'creditos-1',credits:1,amountCents:1490}]};
  const account={paid:1,promo:0,freeAvailable:false,blocked:false,recentOrders:[]};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const fetchImpl=async(url,options={})=>{
    const op=new URL(url,'https://fixture.test').searchParams.get('op');
    const request={op,method:options.method||'GET',headers:options.headers||{},body:options.body&&JSON.parse(options.body)};
    requests.push(request);
    const custom=await onRequest?.(request,{setUser,users,account,json});if(custom)return custom;
    if(op==='config')return json(config);
    if(op==='account')return json(account);
    if(op==='export-local')return json({schema:'confenge.tools.emission/v1',id:'a'.repeat(64),proof:'b'.repeat(64),toolId:request.body.toolId,...request.body.payload});
    if(op==='export')return new Response(JSON.stringify({value:request.body.payload.value}),{headers:{'content-disposition':'attachment; filename="report.json"'}});
    throw new Error(`Unexpected request ${op}`);
  };
  const context={__firebase:firebase,document:doc,Blob,Response,URL,crypto:webcrypto,Intl,Date,console,fetch:fetchImpl,
    localStorage:storage(),sessionStorage:storage(),navigator:{},setTimeout,clearTimeout,queueMicrotask,
    requestAnimationFrame:fn=>queueMicrotask(fn),confirm:()=>true,confengeTrack:(name,props)=>events.push({name,props})};
  context.window=context;vm.runInNewContext(source,context,{filename:'tool-credits.mjs'});
  return {...context.walletModule,auth,users,setUser,requests,events,prints,frames,doc,account,fetchImpl,listeners};
}

test('a user change during reload aborts before account registration or export',async()=>{
  const h=harness();const wallet=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});
  await wallet.ready();h.users.A.reload=async()=>h.setUser('B');let delivered=0;
  assert.equal(await wallet.deliverLocal({format:'csv',content:'prepared A',deliver:()=>{delivered++;}}),false);
  assert.equal(delivered,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('a user change while obtaining the token never submits with the other account',async()=>{
  const h=harness();const wallet=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});
  await wallet.ready();h.users.A.getIdToken=async force=>{if(!force)h.setUser('B');return 'token-A';};let delivered=0;
  assert.equal(await wallet.deliverLocal({format:'csv',content:'prepared A',deliver:()=>{delivered++;}}),false);
  assert.equal(delivered,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('an account change after POST preserves the same request for recovery by its original owner',async()=>{
  let switched=false;const h=harness({onRequest(request,{setUser}){if(request.op==='export-local'&&!switched){switched=true;setUser('B');}}});
  const wallet=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});await wallet.ready();let delivered=0;
  const result={format:'csv',content:'original private result',deliver:()=>{delivered++;}};
  assert.equal(await wallet.deliverLocal(result),false);assert.equal(delivered,0);
  const first=h.requests.find(r=>r.op==='export-local');assert.equal(first.headers.Authorization,'Bearer token-A');
  assert.equal(await wallet.deliverLocal(result),false,'account B cannot recover A emission');
  assert.equal(h.requests.filter(r=>r.op==='export-local').length,1);
  h.setUser('A');assert.equal(await wallet.deliverLocal(result),true);assert.equal(delivered,1);
  const attempts=h.requests.filter(r=>r.op==='export-local');assert.equal(attempts.length,2);
  assert.equal(attempts[0].body.requestId,attempts[1].body.requestId);assert.deepEqual(attempts[0].body.payload,attempts[1].body.payload);
  assert.ok(attempts.every(r=>r.headers.Authorization==='Bearer token-A'));
});

test('anonymous preparation resumes only after login and an explicit action',async()=>{
  const h=harness({initial:null});const wallet=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});let delivered=0;
  assert.equal(await wallet.deliverLocal({format:'csv',content:'guest result',deliver:()=>{delivered++;}}),false);
  h.setUser('A');await flush();assert.equal(delivered,0);assert.equal(h.requests.filter(r=>r.op==='export-local').length,0);
  const resume=h.doc.querySelector('[data-resume-export]');assert.ok(resume);await resume.onclick();
  assert.equal(delivered,1);assert.equal(h.requests.filter(r=>r.op==='export-local').length,1);
});

test('resuming pins the user before closing the wallet, including close-event identity changes',async()=>{
  const h=harness({initial:null});const wallet=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});let delivered=0;
  await wallet.deliverLocal({format:'csv',content:'prepared result',deliver:()=>{delivered++;}});
  h.setUser('A');await flush();h.doc.querySelector('dialog').addEventListener('close',()=>h.setUser('B'));
  await h.doc.querySelector('[data-resume-export]').onclick();
  assert.equal(delivered,0);assert.equal(h.requests.filter(r=>r.op==='export-local').length,0);
});

test('multiple wallets receive identity changes and discard uncharged actions bound to the prior account',async()=>{
  const h=harness({onRequest(request,{json}){if(request.op==='export-local')return json({error:'NO_CREDITS'},402);}});
  const one=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});const two=h.createToolCredits({toolId:'modela-memoria',shared:true,fetchImpl:h.fetchImpl});
  await one.ready();await two.ready();assert.equal(h.listeners.size,2);
  await one.deliverLocal({format:'csv',content:'account A result',deliver(){throw new Error('must not deliver');}});
  assert.ok(h.doc.querySelector('[data-resume-export]'));h.setUser('B');await flush();
  assert.equal(h.doc.querySelector('[data-resume-export]'),null);
});

test('Modela preserves its original body and request ID after an account change during the response',async()=>{
  let switched=false;const h=harness({onRequest(request,{setUser}){if(request.op==='export'&&!switched){switched=true;setUser('B');}}});
  const wallet=h.createToolCredits({toolId:'modela-memoria',fetchImpl:h.fetchImpl});await wallet.ready();
  const payload={value:'original report'};const delivered=[];
  await assert.rejects(wallet.exportReport({payload,requestId:'00000000-0000-4000-8000-000000000001',deliver:async blob=>delivered.push(await blob.text())}),error=>error.error==='ACCOUNT_CHANGED');
  assert.equal(delivered.length,0);payload.value='changed report';h.setUser('A');await wallet.open();
  await h.doc.querySelector('[data-resume-export]').onclick();assert.equal(delivered.length,1);assert.match(delivered[0],/original report/);
  const attempts=h.requests.filter(r=>r.op==='export');assert.equal(attempts.length,2);assert.deepEqual(attempts[0].body,attempts[1].body);assert.ok(attempts.every(r=>r.headers.Authorization==='Bearer token-A'));
});

test('Modela aborts before POST when its original identity changes during reload',async()=>{
  const h=harness();const wallet=h.createToolCredits({toolId:'modela-memoria',fetchImpl:h.fetchImpl});await wallet.ready();
  h.users.A.reload=async()=>h.setUser('B');let delivered=0;
  await assert.rejects(wallet.exportReport({payload:{value:'original'},deliver:()=>{delivered++;}}),error=>error.error==='ACCOUNT_CHANGED');
  assert.equal(delivered,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('two wallets observing the same paid order emit one confirmation for the page',async()=>{
  const h=harness({onRequest(request,{json}){if(request.op==='order')return json({id:'paid-order',status:'paid',packageId:'creditos-1',paymentFlow:'pix'});}});
  h.account.recentOrders=[{id:'paid-order',status:'paid',packageId:'creditos-1'}];
  const one=h.createToolCredits({toolId:'calculadora-bdi',shared:true,fetchImpl:h.fetchImpl});const two=h.createToolCredits({toolId:'modela-memoria',shared:true,fetchImpl:h.fetchImpl});
  await one.open();let dialog=h.doc.querySelectorAll('dialog').at(-1);
  await dialog.querySelectorAll('button').find(node=>node.textContent==='Consultar pedido paid-order').onclick();await flush();dialog.close();
  await two.open();dialog=h.doc.querySelectorAll('dialog').at(-1);
  await dialog.querySelectorAll('button').find(node=>node.textContent==='Consultar pedido paid-order').onclick();await flush();dialog.close();
  assert.equal(h.events.filter(event=>event.name==='tool_commerce_step'&&event.props.step==='payment_confirmed').length,1);
});

test('printing uses immutable plain text in a temporary frame and removes it afterwards',async()=>{
  const h=harness();const text='<img src=x onerror=alert(1)>\nResultado original: 12,34';
  await h.printToolResultSnapshot(text);assert.equal(h.prints.length,1);assert.equal(h.prints[0],`CONFENGE${text}`);
  const frame=h.frames[0];assert.equal(frame.contentDocument.body.querySelector('img'),null);assert.equal(frame.isConnected,false);
});

test('printing rechecks the account after asynchronous stylesheet loading',async()=>{
  let current=true;const h=harness({beforeStylesLoad:()=>{current=false;}});
  await assert.rejects(h.printToolResultSnapshot('original',{assertCurrent(){if(!current)throw new Error('account changed');}}),/account changed/);
  assert.equal(h.prints.length,0);assert.equal(h.frames[0].isConnected,false);
});

for(const slug of ['limite-acrescimos-supressoes','checklist-reequilibrio','matriz-atraso-obra']){
  test(`${slug} download callback retains the prepared text after a later recalculation`,async()=>{
    const page=readFileSync(resolve(root,`ferramentas/${slug}/index.html`),'utf8');
    const line=page.split('\n').find(line=>line.includes('getElementById("btn-dl").onclick'));
    const handler=line.match(/\.onclick\s*=\s*(async function\(\)\s*\{.+\});/)[1];
    const observed=await vm.runInNewContext(`(async()=>{let lastText='prepared text',result,delivered;const T={downloadText:(name,value)=>{delivered=value;}};const exportToolResult=async value=>{result=value;};const handler=${handler};await handler();lastText='new calculation';await result.deliver();return {content:result.content,delivered};})()`);
    assert.equal(observed.content,'prepared text');assert.equal(observed.delivered,'prepared text');
  });
}
