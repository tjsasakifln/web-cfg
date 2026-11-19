import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {loadRuntimeConfig} from '../../lib/config.mjs';
import {createFunctionRegistry} from '../../lib/functions.mjs';
import {createPortableRuntime} from '../../lib/server.mjs';
import {createStructuredLogger} from '../../lib/logger.mjs';

test('production HTTP adapter discovers science-tools, preserves aliases and reaches the bundled calculation',async t=>{
  assert.ok(existsSync(new URL('../python/bin/python3.12',import.meta.url)),'Build the pinned scientific runtime before this integration gate.');
  const config=loadRuntimeConfig({env:{NODE_ENV:'test',RUNTIME_PORT:'0',RUNTIME_TRUST_PROXY:'none'}});
  const registry=createFunctionRegistry({functionsDir:config.functionsDir,netlifyTomlPath:config.netlifyTomlPath});
  assert.deepEqual(registry.getDefinition('science-tools').http_routes,['/.netlify/functions/science-tools','/api/web/science-tools']);
  const runtime=createPortableRuntime({config,registry,logger:createStructuredLogger({sink:()=>{}})});
  const address=await runtime.listen();t.after(()=>runtime.shutdown('science-http-integration'));
  const base='http://127.0.0.1:'+address.port;
  for(const path of registry.getDefinition('science-tools').http_routes){
    const get=await fetch(base+path);assert.equal(get.status,405);assert.equal((await get.json()).error,'METHOD_NOT_ALLOWED');
    const invalid=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://confenge.com.br'},body:'{"operation":"run-code","data":{}}'});
    assert.equal(invalid.status,422);assert.equal((await invalid.json()).error,'INVALID_MODEL');
    if(existsSync(new URL('../operations/memory.py',import.meta.url))){
      const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://confenge.com.br'},body:JSON.stringify({operation:'memory',data:{template:'beam',length:5,load:10,modulus:30,inertia:160000}})});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.match(response.headers.get('cache-control'),/no-store/);
      assert.equal(body.result.operation,'memory');assert.equal(body.result.summary[0].value,25);assert.equal(body.result.summary[1].value,31.25);
    }
  }
});
