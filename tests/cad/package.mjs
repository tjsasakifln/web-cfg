import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '_site');
const manifest = JSON.parse(await readFile('scripts/cad/opencad/manifest.json','utf8'));
const editor = path.join(root,'cad/editor');
const digest = async file => {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const receipt=JSON.parse(await readFile(path.join(editor,'runtime.json'),'utf8'));
assert.equal(receipt.engine,'OpenCAD Studio');
assert.equal(receipt.version,manifest.version);
assert.equal(receipt.upstream.commit,manifest.upstream.commit);
assert.equal(await digest('scripts/cad/opencad/build/confenge.patch'),manifest.build.patch_sha256,
  'The source patch changed without rebuilding the pinned runtime');
assert.equal(await digest(path.join(editor,'licencas/corresponding-source.tar.gz')),manifest.source.sha256);
for(const [name,sha] of Object.entries(manifest.runtime.files)) {
  const file=path.join(editor,name);
  assert((await stat(file)).size>0,name);
  // Reverse only the two authorized URL versions, then verify the original bytes.
  if(name==='ocs-parse-worker.js') {
    const original=(await readFile(file,'utf8')).replace(
      /(\.\/worker_pkg\/ocs_web_worker(?:_bg\.wasm|\.js))\?v=[a-f0-9]{16}/g,'$1?v=5');
    assert.equal(createHash('sha256').update(original).digest('hex'),sha,name);
  } else assert.equal(await digest(file),sha,name);
  if(name.endsWith('.wasm')) assert.deepEqual((await readFile(file)).subarray(0,8),Buffer.from([0,97,115,109,1,0,0,0]));
}
const start=await readFile(path.join(editor,'start.js'),'utf8');
const worker=await readFile(path.join(editor,'ocs-parse-worker.js'),'utf8');
assert.match(start,/openCadStudioSaveFile/);
assert.match(start,/confenge-cad\.js\?v=[a-f0-9]{16}/);
assert.match(worker,/ocs_web_worker_bg\.wasm\?v=[a-f0-9]{16}/);
assert(!start.includes('serviceWorker.register'));
for(const file of ['cad/editor.js','cad/editor/start.js','cad/editor/frame.htm']) {
  assert(!/cadcraft[:_]|acad\.mjs|open-aec\.com/.test(await readFile(path.join(root,file),'utf8')),file+' retains obsolete integration');
}
assert.match(await readFile(path.join(editor,'licencas/GPL-3.0.txt'),'utf8'),/GNU GENERAL PUBLIC LICENSE/);
console.log('CAD: OpenCAD runtime, WASM modules, local worker, source archive and license hashes verified.');
