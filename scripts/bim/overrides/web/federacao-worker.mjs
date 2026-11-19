import {comModelo} from './ifc-runtime.mjs';
import {extrairCena} from './visualizador-worker.mjs';
import {limitesCena} from './cortes-core.mjs';
self.onmessage=async ({data})=>{
  try{
    if(!Array.isArray(data)||!data.length||data.length>5)throw Error('Escolha de 1 a 5 modelos IFC.');
    const merged={buffers:[],elements:[]},files=[];let triangles=0,bytes=0,instances=0;
    for(let index=0;index<data.length;index++){
      const file=data[index];if(!file.size||file.size>25*1024*1024)throw Error('Cada modelo deve ter conteúdo e até 25 MiB.');
      const scene=await comModelo(new Uint8Array(await file.arrayBuffer()),extrairCena,{coordinateToOrigin:false});
      const geometry=new Map(scene.buffers.map(b=>[b.key,b]));
      for(const b of scene.buffers){bytes+=b.vertices.byteLength+b.indices.byteLength;merged.buffers.push({...b,key:index+':'+b.key});}
      for(const el of scene.elements){for(const p of el.parts){triangles+=geometry.get(p.key).indices.length/3;instances++;}
        merged.elements.push({...el,id:index+':'+el.id,expressId:el.id,model:index,file:file.name,parts:el.parts.map(p=>({...p,key:index+':'+p.key}))});}
      if(bytes>128*1024*1024||triangles>2000000||instances>6000)throw Error('A federação ultrapassa o limite de geometria. Abra recortes por pavimento ou disciplina.');
      files.push({name:file.name,size:file.size});
    }
    self.postMessage({scene:merged,files,bounds:limitesCena(merged)},merged.buffers.flatMap(b=>[b.vertices.buffer,b.indices.buffer]));
  }catch(error){self.postMessage({error:error.message||'Não foi possível federar estes IFCs.'});}
};
