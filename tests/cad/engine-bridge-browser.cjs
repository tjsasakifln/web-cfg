// Uses the actual compiled editor and actual start.js bridge, with a deliberately
// controlled same-origin parent standing in for the wallet. No real credit spend.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
// node tests/cad/engine-bridge-browser.cjs [http://127.0.0.1:8765|site-directory]
const endpoint = process.argv[2] || '';
let origin = /^https?:\/\//.test(endpoint) ? new URL(endpoint).origin : null;
const siteRoot = path.resolve(process.argv[3] || (origin ? '.' : endpoint || '.'));
const output = path.resolve(process.env.CAD_BRIDGE_REPORT_DIR || 'build/reports/cad/bridge');
const passed = [];
const diagnostics = [];
const contractFailures = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
function pass(name, detail = {}) { const item = { name, ...detail }; passed.push(item); console.log(JSON.stringify({passed:item})); }
function hasDialog(state, kind) { return state.modal===kind || state.tool_windows?.includes(kind)===true; }
function assertDialog(state, kind, open=true) {
  assert.equal(hasDialog(state,kind),open,`${kind} must be ${open?'open':'closed'} in both modal/tool-window state: ${JSON.stringify(state)}`);
}
const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#111827}iframe{width:100%;height:100%;border:0}</style></head><body>
<iframe id="editor" src="/cad/editor/frame.htm"></iframe><script>
window.harness={ready:false,exports:[],acks:[],fail:null};
window.addEventListener('message',e=>{const frame=document.getElementById('editor');if(e.source!==frame.contentWindow||e.origin!==location.origin)return;const d=e.data;if(d?.type==='confenge-cad:ready')harness.ready=true;if(d?.type==='confenge-cad:failed')harness.fail=d.error;if(d?.type==='confenge-cad:export'){if(!(d.bytes instanceof Uint8Array))throw new Error('Export bytes lost typed array');harness.exports.push({id:d.id,name:d.name,bytes:d.bytes,acked:false});}});
harness.ack=(index,ok,error)=>{const x=harness.exports[index];if(!x||x.acked)throw new Error('Export absent/already acknowledged');x.acked=true;harness.acks.push({id:x.id,ok,error});document.getElementById('editor').contentWindow.postMessage({type:'confenge-cad:export-result',id:x.id,ok,error},location.origin);};
</script></body></html>`;

async function openFixture(browser, format) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  const errors=[]; const downloads=[];
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('console',m=>{if(/panicked|Buffer is not mapped/i.test(m.text()))errors.push(m.text());});
  page.on('requestfailed',req=>diagnostics.push({format,url:req.url(),failure:req.failure()?.errorText}));
  page.on('response',res=>{if(res.status()>=400)diagnostics.push({format,url:res.url(),status:res.status()});});
  await page.evaluateOnNewDocument(format=>{
    localStorage.setItem('confenge.cad.settings',JSON.stringify({settings:{language:'en-US',default_save_format:format,savetime_min:0}}));
  },format);
  const fixtureCdp=await page.createCDPSession();
  await fixtureCdp.send('Fetch.enable',{patterns:[{urlPattern:'*/cad/__bridge_smoke',requestStage:'Request'}]});
  fixtureCdp.on('Fetch.requestPaused',event=>{
    void fixtureCdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'text/html'}],
      body:Buffer.from(fixture).toString('base64')}).catch(error=>errors.push(String(error)));
  });
  const cdp=await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior',{behavior:'deny',eventsEnabled:true,browserContextId:context.id});
  cdp.on('Browser.downloadWillBegin',e=>downloads.push(e.url));
  await page.goto(origin+'/cad/__bridge_smoke',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.harness?.ready || window.harness?.fail,{timeout:240000});
  assert.equal(await page.evaluate(()=>harness.fail),null,'Editor failed to initialize');
  const frame=page.frames().find(f=>f.url().includes('/cad/editor/frame.htm'));
  assert(frame,'Editor iframe missing');
  let serial=0;
  let lastOperation=null;
  let graphicsNoticeAcknowledged=false;
  async function raw(req) {
    return frame.evaluate(async req=>{
      const api=window.wasmBindings;
      const ticket=api.ocs_control_submit(JSON.stringify(req));
      const deadline=Date.now()+30000;
      while(Date.now()<deadline){const value=api.ocs_control_take(ticket);if(value)return JSON.parse(value);await new Promise(r=>setTimeout(r,25));}
      throw new Error('No control response: '+JSON.stringify(req));
    },req);
  }
  const state=()=>raw({op:'state'});
  async function submit(req){
    const s=await state();
    const doc=req.document_id===undefined?s.document_id:req.document_id;
    const rev=s.documents.find(x=>x.id===doc)?.revision;
    const payload={protocol:1,request_id:'bridge-smoke-'+(++serial),document_id:doc,revision:rev,...req};
    const reply=await raw(payload);
    lastOperation={request:{op:payload.op,cmd:payload.cmd,name:payload.name,request_id:payload.request_id,document_id:payload.document_id,revision:payload.revision},reply};
    return reply;
  }
  const hasGraphicsWarning=s=>s.modal==='GpuWarning'||s.tool_windows?.includes('GpuWarning');
  async function acknowledgeGraphicsWarning(waitForNotice=false){
    const deadline=Date.now()+20000;
    const requireNotice=waitForNotice&&!graphicsNoticeAcknowledged;
    let s=await state();
    while(requireNotice&&!hasGraphicsWarning(s)&&Date.now()<deadline){
      await pause(50);s=await state();
    }
    if(requireNotice)assert(hasGraphicsWarning(s),'The forced SwiftShader fixture did not show its graphics notice: '+JSON.stringify(s));
    if(!hasGraphicsWarning(s))return;
    // The real OK button emits CloseModal. A native-style tool window can
    // hold this notice even when state.modal is null. Do not dismiss a
    // different dialog or silence the device warning in production settings.
    assert(s.modal==='GpuWarning'||(!s.modal&&s.tool_windows?.at(-1)==='GpuWarning'),'Graphics notice is behind another dialog: '+JSON.stringify(s));
    await page.screenshot({path:path.join(output,'graphics-warning-'+format.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png')});
    const reply=await settle(await submit({op:'action',name:'close_modal'}));
    assert.equal(reply.ok,true,JSON.stringify(reply));
    const closeDeadline=Date.now()+5000;
    do {await pause(40);s=await state();}while(hasGraphicsWarning(s)&&Date.now()<closeDeadline);
    assert(!hasGraphicsWarning(s),'Graphics notice did not close: '+JSON.stringify(s));
    graphicsNoticeAcknowledged=true;
    diagnostics.push({format,event:'acknowledged_graphics_warning',action:'close_modal',modal:s.modal,tool_windows:s.tool_windows});
  }
  async function begin(req){
    if(!(req.op==='action'&&req.name==='close_modal'))await acknowledgeGraphicsWarning();
    return submit(req);
  }
  async function settle(reply){
    const deadline=Date.now()+120000;
    while(['accepted','running'].includes(reply.status)){
      assert(Date.now()<deadline,'Operation did not settle: '+JSON.stringify(reply));
      await pause(30); reply=await raw({op:'operation',request_id:reply.request_id});
    }
    return reply;
  }
  async function act(req){ const reply=await settle(await begin(req)); assert.equal(reply.ok,true,JSON.stringify({req,reply}));return reply; }
  async function waitExport(index){
    try{
      assert.notEqual(lastOperation?.reply?.ok,false,'Export operation was refused: '+JSON.stringify(lastOperation));
      await page.waitForFunction(i=>harness.exports.length>i,{timeout:120000},index);
      return page.evaluate(i=>({id:harness.exports[i].id,name:harness.exports[i].name,size:harness.exports[i].bytes.length}),index);
    }catch(error){
      const snapshot=await state().catch(error=>({read_error:String(error)}));
      const operation=lastOperation?.request?.request_id
        ?await raw({op:'operation',request_id:lastOperation.request.request_id}).catch(error=>({read_error:String(error)})):null;
      const exports=await page.evaluate(()=>harness.exports.map(({id,name,bytes,acked})=>({id,name,size:bytes.length,acked}))).catch(error=>({read_error:String(error)}));
      const detail={format,event:'export_not_received',index,lastOperation,operation,state:snapshot,exports,errors};
      diagnostics.push(detail);
      throw new Error('Export did not reach the host: '+JSON.stringify(detail),{cause:error});
    }
  }
  const ack=(index,ok,error)=>page.evaluate(({index,ok,error})=>harness.ack(index,ok,error),{index,ok,error});
  const count=()=>page.evaluate(()=>harness.exports.length);
  const bytes=async index=>Buffer.from(await page.evaluate(i=>Array.from(harness.exports[i].bytes),index));
  const active=(s)=>s.documents.find(d=>d.id===s.document_id);
  async function makeDrawing(){
    await acknowledgeGraphicsWarning();
    const s=await state();assert.equal(s.modal,null,'Unexpected startup modal: '+JSON.stringify(s));
    await act({op:'new'});
    // GPU detection happens only after the first viewport frame. Wait for
    // and acknowledge the software-renderer warning before issuing CAD work.
    await acknowledgeGraphicsWarning(true);
    await act({op:'entities_create',entities:[
      {type:'Line',start:[0,0],end:[10,0],layer:'CONFENGE-WALLS'},
      {type:'Circle',center:[5,5],radius:2,layer:'CONFENGE-CIRCLES'},
      {type:'LwPolyline',vertices:[[0,0],[10,0],[10,10]],closed:true},
      {type:'Text',value:'CONFENGE: Revisão São José, cota 2,50 m',position:[1,1],height:2.5},
      {type:'Arc',center:[0,0],radius:5,start_angle_deg:0,end_angle_deg:90}
    ]});
    const lines=await raw({op:'query',type:'Line',detail:'geometry'});
    await act({op:'entities_transform',handles:[lines.entities[0].handle],action:'move',vector:[5,0]});
    await act({op:'action',name:'zoom_extents'});
    await acknowledgeGraphicsWarning();
    assert.equal((await raw({op:'entities'})).total,5);
  }
  async function semantics(){
    const entities=await raw({op:'query',detail:'geometry',limit:1000});assert(entities.ok,JSON.stringify(entities));
    assert.equal(entities.entities.length,5,'Roundtrip entity count changed');
    assert.deepEqual(entities.entities.map(e=>e.type).sort(),['Arc','Circle','Line','Polyline','Text']);
    const polyline=entities.entities.find(e=>e.type==='Polyline');
    const measure=await raw({op:'measure',handles:[polyline.handle]});
    assert.equal(measure.ok,true,JSON.stringify(measure));
    assert.equal(measure.measurements.length,1);
    assert.equal(measure.measurements[0].curve.closed,true,'Polyline lost its closing segment');
    assert.equal(measure.measurements[0].curve.area,50,'Closed triangle area changed');
    return entities.entities.map(({handle,owner,display_type,...e})=>e).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return {context,page,frame,raw,state,begin,settle,act,waitExport,ack,count,bytes,active,makeDrawing,semantics,errors,downloads};
}

(async()=>{
  await fs.mkdir(output,{recursive:true});
  let server;
  if(!origin){const {serveCad}=await import('./server.mjs');({server,base:origin}=await serveCad(siteRoot));}
  const executablePath=[process.env.CHROME_PATH,process.env.CHROMIUM_PATH,process.env.PUPPETEER_EXECUTABLE_PATH,'/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(p=>p&&existsSync(p));
  let browser;
  try{
    assert(executablePath,'Set CHROME_PATH to an installed Chromium browser');
    browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const h=await openFixture(browser,'DWG 2018');
    await h.makeDrawing();
    const original=await h.semantics();
    pass('Create and edit real geometry',{entities:original.length});
    const initial=await h.state();
    let blocked=await h.begin({op:'save',name:'bypass.dwg'});
    assert.equal(blocked.code,'host_export_required',JSON.stringify(blocked));
    assert.equal(await h.count(),0);assert.equal(h.active(await h.state()).dirty,true);
    pass('Raw save cannot bypass host or clean drawing');

    let op=await h.begin({op:'run',cmd:'QSAVE'});let e=await h.waitExport(0);
    assert(e.size>1000);assert.equal(h.active(await h.state()).dirty,true);
    assert.deepEqual(h.active(await h.state()).path,h.active(initial).path);
    await h.frame.evaluate(id=>window.postMessage({type:'confenge-cad:export-result',id,ok:true},location.origin),e.id);
    await h.page.evaluate(()=>document.getElementById('editor').contentWindow.postMessage({type:'confenge-cad:export-result',id:'unknown-id',ok:true},location.origin));
    await pause(150);assert.equal(h.active(await h.state()).dirty,true);
    pass('Pending and forged acknowledgements preserve unsaved state');
    await h.ack(0,false);const rejected=await h.settle(op);
    if(rejected.ok===true&&rejected.status==='completed'){
      contractFailures.push({scenario:'QSAVE cancellation',expected:{ok:false},actual:{ok:rejected.ok,status:rejected.status,request_id:rejected.request_id}});
    }else assert.equal(rejected.ok,false,JSON.stringify(rejected));
    assert.equal(h.active(await h.state()).dirty,true);assert.deepEqual(h.active(await h.state()).path,h.active(initial).path);
    assert.deepEqual(await h.semantics(),original);
    pass('Cancellation preserves drawing, path and dirty state');

    op=await h.begin({op:'run',cmd:'QSAVE'});await h.waitExport(1);await h.ack(1,false,'Intentional wallet failure');
    const failed=await h.settle(op);
    if(failed.ok===true&&failed.status==='completed'){
      contractFailures.push({scenario:'QSAVE host failure',expected:{ok:false},actual:{ok:failed.ok,status:failed.status,request_id:failed.request_id}});
    }else assert.equal(failed.ok,false,JSON.stringify(failed));
    assert.equal(h.active(await h.state()).dirty,true);
    assert.deepEqual(h.active(await h.state()).path,h.active(initial).path);
    assert.deepEqual(await h.semantics(),original);
    if(failed.ok===false)pass('Host failure never becomes save success');

    op=await h.begin({op:'run',cmd:'QSAVE'});e=await h.waitExport(2);const saved=await h.bytes(2);
    assert.equal(saved.subarray(0,6).toString(),'AC1032');
    await h.ack(2,true);const accepted=await h.settle(op);assert.equal(accepted.ok,true,JSON.stringify(accepted));
    assert.equal(h.active(await h.state()).dirty,false);
    await fs.writeFile(path.join(output,'roundtrip.dwg'),saved);
    const oldId=(await h.state()).document_id;
    await h.act({op:'close'});
    await h.act({op:'open',name:'roundtrip.dwg',data_base64:saved.toString('base64')});
    assert.notEqual((await h.state()).document_id,oldId);
    assert.deepEqual(await h.semantics(),original);
    pass('DWG 2018 saved, closed and reopened with matching entity geometry/layers/text',{bytes:saved.length});

    // Save-before-close must never discard the drawing if the wallet declines.
    const line=(await h.raw({op:'query',type:'Line',detail:'geometry'})).entities[0];
    await h.act({op:'entities_transform',handles:[line.handle],action:'move',vector:[1,0]});
    const closingId=(await h.state()).document_id;
    await h.act({op:'action',name:'close_document'});assertDialog(await h.state(),'Unsaved');
    op=await h.begin({op:'action',name:'dialog_ok'});await h.waitExport(3);await h.ack(3,false);await h.settle(op);
    let s=await h.state();assert(s.documents.some(d=>d.id===closingId&&d.dirty));assertDialog(s,'Unsaved');
    pass('Declined save-before-close keeps tab and unsaved prompt');
    await h.act({op:'action',name:'dialog_cancel'});
    assertDialog(await h.state(),'Unsaved',false);
    await h.act({op:'action',name:'close_document'});
    assertDialog(await h.state(),'Unsaved');
    op=await h.begin({op:'action',name:'dialog_ok'});await h.waitExport(4);await h.ack(4,true);await h.settle(op);
    assert(!(await h.state()).documents.some(d=>d.id===closingId));
    assertDialog(await h.state(),'Unsaved',false);
    pass('Acknowledged save-before-close completes close');

    await h.act({op:'open',name:'batch-one.dwg',data_base64:saved.toString('base64')});const id1=(await h.state()).document_id;
    let l=(await h.raw({op:'query',type:'Line',detail:'geometry'})).entities[0];
    await h.act({op:'entities_transform',handles:[l.handle],action:'move',vector:[1,0]});
    await h.act({op:'open',name:'batch-two.dwg',data_base64:saved.toString('base64')});const id2=(await h.state()).document_id;
    l=(await h.raw({op:'query',type:'Line',detail:'geometry'})).entities[0];
    await h.act({op:'entities_transform',handles:[l.handle],action:'move',vector:[2,0]});
    op=await h.begin({op:'run',cmd:'SAVEALL'});const first=await h.waitExport(5);await h.ack(5,true);
    const second=await h.waitExport(6);await h.ack(6,false);await h.settle(op);
    s=await h.state();
    const d1=s.documents.find(d=>d.id===id1),d2=s.documents.find(d=>d.id===id2);
    assert.deepEqual([first.name,second.name].sort(),['batch-one.dwg','batch-two.dwg']);
    assert(d1&&d2,'SAVEALL removed a drawing');
    assert.equal(d1.dirty,first.name!=='batch-one.dwg');assert.equal(d2.dirty,first.name!=='batch-two.dwg');
    assert.equal([d1,d2].filter(d=>!d.dirty).length,1);
    pass('SAVEALL cleans only the acknowledged document',{accepted:first.name,cancelled:second.name});

    // The wizard emits its settings and output as one sequenced operation.
    // The second file must wait for the first acknowledgement, and a decline
    // must leave the wizard available to retry with all its input intact.
    const beforeExtraction=await h.semantics();
    await h.act({op:'run',cmd:'DATAEXTRACTION'});
    assertDialog(await h.state(),'DataExtraction');
    for(const value of ['settings=bridge-extraction.dxex','next','next','next','next','next','file=on','path=bridge-extraction.csv','table=off','next']){
      await h.act({op:'action',name:'data_extraction',value});
    }
    let offset=await h.count();
    op=await h.begin({op:'action',name:'data_extraction',value:'finish'});
    let config=await h.waitExport(offset);assert(config.name.endsWith('.dxex'),config.name);
    await pause(150);assert.equal(await h.count(),offset+1,'Extraction exported both files concurrently');
    assertDialog(await h.state(),'DataExtraction');
    await h.ack(offset,true);
    let table=await h.waitExport(offset+1);assert(table.name.endsWith('.csv'),table.name);
    assert((await h.bytes(offset+1)).length>10,'Empty extraction table');
    await h.ack(offset+1,false);assert.equal((await h.settle(op)).ok,false);
    assertDialog(await h.state(),'DataExtraction');
    assert.deepEqual(await h.semantics(),beforeExtraction);
    pass('Extraction sequences settings and CSV and retains wizard after second-file cancellation');
    offset=await h.count();
    op=await h.begin({op:'action',name:'data_extraction',value:'finish'});
    config=await h.waitExport(offset);await h.ack(offset,true);
    table=await h.waitExport(offset+1);const csv=await h.bytes(offset+1);await h.ack(offset+1,true);
    const extractionAccepted=await h.settle(op);assert.equal(extractionAccepted.ok,true);
    const extractionState=await h.state();
    const extractionClosed=!hasDialog(extractionState,'DataExtraction');
    if(!extractionClosed){
      contractFailures.push({scenario:'Acknowledged extraction wizard remained open',expected:{dialog_open:false},actual:{ok:extractionAccepted.ok,status:extractionAccepted.status,request_id:extractionAccepted.request_id,modal:extractionState.modal,tool_windows:extractionState.tool_windows}});
      assert(extractionState.modal==='DataExtraction'||(!extractionState.modal&&extractionState.tool_windows?.at(-1)==='DataExtraction'),'Refusing to close a different dialog: '+JSON.stringify(extractionState));
      await h.act({op:'action',name:'close_modal'});
    }
    assert.equal((await h.state()).modal,null);
    assertDialog(await h.state(),'DataExtraction',false);
    assert.deepEqual(await h.semantics(),beforeExtraction);
    await fs.writeFile(path.join(output,'extraction.csv'),csv);
    if(extractionClosed)pass('Extraction closes only after settings and CSV are acknowledged',{bytes:csv.length});

    // Programmatic PDF output uses the same transaction and exposes
    // no completed success before the real host decision.
    offset=await h.count();
    op=await h.begin({op:'run',cmd:'EXPORTPDF bridge-test.pdf'});
    await h.waitExport(offset);const pdf=await h.bytes(offset);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    assert(['accepted','running'].includes((await h.raw({op:'operation',request_id:op.request_id})).status));
    await h.ack(offset,false);assert.equal((await h.settle(op)).ok,false);
    offset=await h.count();op=await h.begin({op:'run',cmd:'EXPORTPDF bridge-test.pdf'});
    await h.waitExport(offset);await h.ack(offset,true);assert.equal((await h.settle(op)).ok,true);
    await fs.writeFile(path.join(output,'drawing.pdf'),await h.bytes(offset));
    pass('Direct PDF export reports success only after acknowledgement');
    await h.page.screenshot({path:path.join(output,'engine-dwg.png')});

    const dirtyBeforeQuit=(await h.state()).documents.filter(doc=>doc.dirty).map(doc=>doc.id);
    assert(dirtyBeforeQuit.length>0,'QUIT fixture must have unsaved work');
    await h.act({op:'run',cmd:'QUIT'});assertDialog(await h.state(),'Unsaved');
    offset=await h.count();op=await h.begin({op:'action',name:'dialog_ok'});
    await h.waitExport(offset);await h.ack(offset,false);await h.settle(op);
    s=await h.state();assertDialog(s,'Unsaved');
    assert(s.documents.some(doc=>dirtyBeforeQuit.includes(doc.id)&&doc.dirty));
    await h.act({op:'action',name:'dialog_cancel'});
    assertDialog(await h.state(),'Unsaved',false);
    pass('QUIT respects unsaved prompt and declined host export');
    await h.act({op:'run',cmd:'EXIT'});
    for(let attempt=0;attempt<10&&hasDialog(await h.state(),'Unsaved');attempt++){
      await h.act({op:'action',name:'dialog_discard'});
    }
    s=await h.state();assert.equal(s.ok,true);assert(s.documents.every(doc=>doc.start),'EXIT did not finish closing documents');
    assertDialog(s,'Unsaved',false);
    await h.page.screenshot({path:path.join(output,'engine-exit-start.png')});
    pass('EXIT closes confirmed throwaway drawings and leaves the hosted editor running');
    assert.deepEqual(h.downloads,[],'Editor attempted a direct browser download outside parent');
    assert.deepEqual(h.errors,[]);await h.context.close();

    const d=await openFixture(browser,'DXF 2018');await d.makeDrawing();const expect=await d.semantics();
    op=await d.begin({op:'run',cmd:'QSAVE'});e=await d.waitExport(0);const dxf=await d.bytes(0);assert(e.name.toLowerCase().endsWith('.dxf'),e.name);
    assert(dxf.toString().includes('AC1032'));await d.ack(0,true);await d.settle(op);await d.act({op:'close'});
    await d.act({op:'open',name:'roundtrip.dxf',data_base64:dxf.toString('base64')});assert.deepEqual(await d.semantics(),expect);
    assert.deepEqual(d.downloads,[]);assert.deepEqual(d.errors,[]);await fs.writeFile(path.join(output,'roundtrip.dxf'),dxf);
    await d.page.screenshot({path:path.join(output,'engine-dxf.png')});
    pass('DXF 2018 saved, closed and reopened with matching entity geometry/layers/text',{bytes:dxf.length});
    // Keep the graphics capture separate from the drawing save and close checks.
    offset=await d.count();op=await d.begin({op:'capture',path:'bridge-capture.png',view:'viewport'});
    await d.waitExport(offset);assert.deepEqual((await d.bytes(offset)).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert(['accepted','running'].includes((await d.raw({op:'operation',request_id:op.request_id})).status));
    await d.ack(offset,false);assert.equal((await d.settle(op)).ok,false);
    pass('PNG capture cancellation is a failed export, not a completed capture');
    offset=await d.count();op=await d.begin({op:'capture',path:'bridge-capture.png',view:'viewport'});
    e=await d.waitExport(offset);const png=await d.bytes(offset);
    assert(e.name.toLowerCase().endsWith('.png'),e.name);
    assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert(png.length>24,'PNG capture must include its image header');
    assert.equal(png.subarray(12,16).toString('ascii'),'IHDR');
    const pngWidth=png.readUInt32BE(16),pngHeight=png.readUInt32BE(20);
    assert(pngWidth>0&&pngHeight>0,'PNG capture must have nonzero image dimensions');
    assert(['accepted','running'].includes((await d.raw({op:'operation',request_id:op.request_id})).status));
    await d.ack(offset,true);const captureResult=await d.settle(op);
    assert.equal(captureResult.ok,true,JSON.stringify(captureResult));
    assert.equal(captureResult.status,'completed',JSON.stringify(captureResult));
    await fs.writeFile(path.join(output,'capture.png'),png);
    pass('PNG capture succeeds only after acknowledgement and preserves its image',{bytes:png.length,width:pngWidth,height:pngHeight,image:'capture.png'});
    assert.deepEqual(d.downloads,[]);assert.deepEqual(d.errors,[]);await d.context.close();
    assert.deepEqual(contractFailures,[],'Known save-contract failures must be fixed before this run can pass');
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({ok:true,fixture:'same-origin controlled host; actual engine and bridge; wallet replaced explicitly, no credits spent',passed,diagnostics,contractFailures},null,2));
  }catch(error){
    if(browser){let i=0;for(const page of await browser.pages()){try{await page.screenshot({path:path.join(output,'failure-'+(++i)+'.png')});}catch{}}}
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({ok:false,passed,diagnostics,contractFailures,error:String(error),stack:error.stack},null,2));
    console.error(error);process.exitCode=1;
  }finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})();
