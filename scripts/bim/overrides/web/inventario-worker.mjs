import {comModelo} from './ifc-runtime.mjs';
import {extrairInventario} from './inventario-core.mjs';
self.onmessage=async ({data})=>{
  try { const result=await comModelo(new Uint8Array(await data.arrayBuffer()),extrairInventario);self.postMessage({result}); }
  catch(error) {self.postMessage({error:error.message||'Não foi possível ler este modelo IFC.'});}
};
