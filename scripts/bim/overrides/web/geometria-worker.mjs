import {comModelo} from './ifc-runtime.mjs';
import {extrairCena} from './visualizador-worker.mjs';
import {limitesCena,cortarCena,gerarSvg} from './cortes-core.mjs';
let scene;
self.onmessage=async ({data})=>{
  try {
    if(data.action==='load') {
      scene=null;scene=await comModelo(new Uint8Array(await data.file.arrayBuffer()),extrairCena,{coordinateToOrigin:false});
      self.postMessage({action:'loaded',bounds:limitesCena(scene),elements:scene.elements.length});
    } else if(data.action==='cut') {
      if(!scene)throw Error('Abra um IFC antes de gerar o corte.');
      const cut=cortarCena(scene,data.axis,data.coordinate);self.postMessage({action:'cut',svg:gerarSvg(cut,{scale:data.scale,title:data.title}),segments:cut.segments.length,elements:new Set(cut.segments.map(s=>s.id)).size});
    }
  }catch(error){self.postMessage({error:error.message||'Não foi possível gerar o corte.',action:data.action});}
};
