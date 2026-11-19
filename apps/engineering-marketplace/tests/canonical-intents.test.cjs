const test=require('node:test');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('engineering families remain derived from the canonical site matrix',()=>{
  execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/sync-intents.mjs'),'--check'],{stdio:'pipe'});
});
