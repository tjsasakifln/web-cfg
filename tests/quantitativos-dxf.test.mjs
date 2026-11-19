import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quantify} from '../ferramentas/quantitativos-dxf/takeoff.mjs';
import {parseDrawing} from '../ferramentas/quantitativos-dxf/parser.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),a+' != '+b);
const model=entities=>({header:{$INSUNITS:6},entities});
const ascii=body=>'0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+body+'0\nENDSEC\n0\nEOF\n';
test('actual parser exposes excluded hatches, attributes and tilted OCS polylines',()=>{
 const d=parseDrawing(ascii('0\nHATCH\n8\nParedes\n0\nATTRIB\n1\nAtributo\n0\nLWPOLYLINE\n90\n2\n70\n0\n10\n0\n20\n0\n10\n1\n20\n0\n210\n0\n220\n1\n230\n0\n'));
 const q=quantify(d);assert.equal(q.layers.length,0);assert.deepEqual(q.warnings.map(r=>r.type),['HATCH','ATTRIB','LWPOLYLINE com plano OCS diferente do XY']);
});
test('line, circle and closed polyline use actual units and curved area',()=>{
 const q=quantify({header:{$INSUNITS:4},entities:[{type:'LINE',vertices:[{x:0,y:0},{x:3000,y:4000}]},{type:'CIRCLE',center:{x:0,y:0},radius:1000}]});
 near(q.layers[0].length,5+2*Math.PI);near(q.layers[0].area,Math.PI);
});
test('semicircle bulge includes curve length and enclosed area',()=>{
 const q=quantify(model([{type:'LWPOLYLINE',shape:true,vertices:[{x:0,y:0,bulge:1},{x:2,y:0}]}]));
 near(q.layers[0].length,Math.PI+2);near(q.layers[0].area,Math.PI/2);
});
test('nested scaled INSERT with layer zero inheritance',()=>{
 const d=model([{type:'INSERT',name:'A',layer:'Tubos',position:{x:10,y:8},rotation:90,xScale:2,yScale:2}]);
 d.blocks={A:{position:{x:4,y:2},entities:[{type:'INSERT',name:'B',layer:'0',position:{x:4,y:2},rotation:0,xScale:3,yScale:3}]},B:{position:{x:0,y:0},entities:[{type:'LINE',layer:'0',vertices:[{x:0,y:0},{x:1,y:0}]}]}};
 const q=quantify(d);near(q.layers[0].length,6);assert.equal(q.layers[0].layer,'Tubos');near(q.preview[0][0][0],10);near(q.preview[0][0][1],8);
});
test('nonuniform scales integrate ellipse rather than average radius',()=>{
 const d=model([{type:'INSERT',name:'A',position:{x:0,y:0},xScale:2,yScale:1}]);
 d.blocks={A:{entities:[{type:'CIRCLE',center:{x:0,y:0},radius:1}]}};
 const q=quantify(d);near(q.layers[0].length,9.688448220547675);near(q.layers[0].area,2*Math.PI);
});
test('unknown units, cycles, unsupported entities and spatial lines are explicit',()=>{
 assert.throws(()=>quantify({entities:[]}),/unidade/);
 const q=quantify(model([{type:'SPLINE'},{type:'LINE',vertices:[{x:0,y:0,z:0},{x:1,y:0,z:2}]}]));
 assert.equal(q.layers.length,0);assert.equal(q.warnings.length,2);
 const d=model([{type:'INSERT',name:'A',position:{x:0,y:0}}]);d.blocks={A:{entities:d.entities}};
 assert.throws(()=>quantify(d),/circular/);
});

// Execute the shipped UI and status helpers. Only network/worker scheduling
// and DOM storage are controlled here; geometry still uses the actual example.
const exampleDxf=readFileSync(new URL('../ferramentas/quantitativos-dxf/exemplo.dxf',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../assets/js/engineering-ui.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const appSource=readFileSync(new URL('../ferramentas/quantitativos-dxf/app.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('import.meta.url',JSON.stringify('https://confenge.com.br/ferramentas/quantitativos-dxf/app.mjs'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function dxfUi({workerError}={}){
 const nodes=new Map(),requests=[],workers=[],timers=new Map();let nextTimer=0;
 const element=()=>{
  const classes=new Set(),listeners=new Map();
  return{value:'',files:[],hidden:false,disabled:false,textContent:'',children:[],
   classList:{contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
   append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(){},
   addEventListener(type,listener){listeners.set(type,listener);},dispatch(type){return listeners.get(type)?.({target:this});}};
 };
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={getElementById:node,createElement:element,createElementNS:element};
 class Worker{constructor(){if(workerError)throw workerError;workers.push(this);}postMessage(input){this.input=input;}terminate(){this.terminated=true;}}
 const fetch=()=>{const request=deferred();requests.push(request);return request.promise;};
 const setTimeout=callback=>{const id=++nextTimer;timers.set(id,callback);return id;};
 const clearTimeout=id=>timers.delete(id);
 node('resultado').hidden=true;
 new Function('document','Worker','URL','fetch','setTimeout','clearTimeout','exportToolResult',uiSource+'\n'+appSource)(document,Worker,URL,fetch,setTimeout,clearTimeout,()=>{throw Error('Unexpected export');});
 return{node,requests,workers,timers,click:id=>node(id).dispatch('click'),complete:worker=>worker.onmessage({data:{ok:true,result:quantify(parseDrawing(exampleDxf))}})};
}
const exampleResponse=()=>({ok:true,text:async()=>exampleDxf});

test('DXF retry clears the previous error before awaiting the new example',async()=>{
 const e=dxfUi(),first=e.click('exemplo');e.requests[0].resolve({ok:false});await first;
 assert.equal(e.node('estado').classList.contains('is-error'),true);assert.equal(e.node('analisar').disabled,false);
 const retry=e.click('exemplo');
 assert.equal(e.node('estado').classList.contains('is-error'),false);assert.match(e.node('estado').textContent,/Carregando/);
 assert.equal(e.node('resultado').hidden,true);assert.equal(e.node('analisar').disabled,true);
 e.requests[1].resolve(exampleResponse());await retry;assert.equal(e.workers.length,1);
 e.complete(e.workers[0]);assert.equal(e.node('resultado').hidden,false);assert.equal(e.node('estado').classList.contains('is-error'),false);
 const next=e.click('exemplo');assert.equal(e.node('resultado').hidden,true,'a new attempt invalidates the completed result immediately');
 e.requests[2].resolve({ok:false});await next;
 assert.equal(e.node('resultado').hidden,true);assert.equal(e.node('analisar').disabled,false);
});

for(const failure of ['http','network','body'])test(`obsolete DXF ${failure} failure cannot replace the newer result`,async()=>{
 const e=dxfUi(),old=e.click('exemplo'),body=deferred();
 if(failure==='body'){e.requests[0].resolve({ok:true,text:()=>body.promise});await Promise.resolve();}
 const latest=e.click('exemplo');e.requests[1].resolve(exampleResponse());await latest;e.complete(e.workers[0]);
 const status=e.node('estado').textContent;
 if(failure==='http')e.requests[0].resolve({ok:false});
 else if(failure==='network')e.requests[0].reject(Error('obsolete network failure'));
 else body.reject(Error('obsolete response body failure'));
 await old;
 assert.equal(e.node('estado').textContent,status);assert.equal(e.node('estado').classList.contains('is-error'),false);
 assert.equal(e.node('resultado').hidden,false);assert.equal(e.workers.length,1);
});

test('a slower previous DXF success cannot start a worker for the latest attempt',async()=>{
 const e=dxfUi(),old=e.click('exemplo'),latest=e.click('exemplo');
 e.requests[0].resolve(exampleResponse());await old;
 assert.equal(e.workers.length,0);assert.match(e.node('estado').textContent,/Carregando/);assert.equal(e.node('analisar').disabled,true);
 e.requests[1].resolve(exampleResponse());await latest;assert.equal(e.workers.length,1);
});

for(const field of ['arquivo','unidade'])test(`changing ${field} cancels the pending example without resetting the chosen unit`,async()=>{
 const e=dxfUi(),pending=e.click('exemplo');e.node('unidade').value='0.01';e.node(field).dispatch('change');
 e.requests[0].resolve(exampleResponse());await pending;
 assert.equal(e.node('unidade').value,'0.01');assert.equal(e.node('analisar').disabled,false);
 assert.equal(e.workers.length,0);assert.equal(e.node('resultado').hidden,true);
});

test('cancelled DXF worker errors and queued timeouts leave the newer worker untouched',async()=>{
 const e=dxfUi(),first=e.click('exemplo');e.requests[0].resolve(exampleResponse());await first;
 const old=e.workers[0],oldTimeout=[...e.timers.values()][0];
 const next=e.click('exemplo');assert.equal(old.terminated,true);
 old.onerror();oldTimeout();assert.equal(e.node('estado').classList.contains('is-error'),false);
 e.requests[1].resolve(exampleResponse());await next;const current=e.workers[1];
 old.onerror();oldTimeout();assert.notEqual(current.terminated,true);assert.equal(e.node('analisar').disabled,true);
 e.complete(current);assert.equal(e.node('resultado').hidden,false);
});

test('a current DXF worker startup error remains observable after the fetch succeeds',async()=>{
 const e=dxfUi({workerError:Error('current worker startup failure')}),pending=e.click('exemplo');
 e.requests[0].resolve(exampleResponse());await pending;
 assert.equal(e.node('estado').classList.contains('is-error'),true);assert.equal(e.node('estado').textContent,'current worker startup failure');
 assert.equal(e.node('resultado').hidden,true);
});
