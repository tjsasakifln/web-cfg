import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source='data/corporate/intent-family-matrix.v1.json';
const bytes=readFileSync(resolve(app,'../..',source));
// Scope authorized for the engineering participant marketplace. Names and
// canonical service families are always derived from the site's authority.
const ids=['projetar_revisar_compatibilizar','orcar_planejar_decidir','inspecionar_diagnosticar','receber_entregar_reformar','documentar_as_built_regularizar','avaliar_imovel','produzir_prova_tecnica','organizar_sst'];
const matrix=JSON.parse(bytes);
const intents=ids.map(id=>{const row=matrix.intent_families.find(row=>row.intent_family===id);if(!row)throw new Error('Unknown canonical intent '+id);return {intent_family:row.intent_family,public_wording:row.public_wording,canonical_service_family:row.canonical_service_family}});
const expected=JSON.stringify({source,sha256:createHash('sha256').update(bytes).digest('hex'),intents},null,2)+'\n';
const path=resolve(app,'config/intents.json');
if(process.argv.includes('--check')){
  if(readFileSync(path,'utf8')!==expected)throw new Error('Marketplace intents drifted from canonical matrix; run scripts/sync-intents.mjs');
  console.log('Canonical engineering intent subset verified');
}else writeFileSync(path,expected);
