import {comModelo} from './ifc-runtime.mjs';
import {extrairCena} from './visualizador-worker.mjs';
import {describeScene,compareScenes,checkTolerance} from './geometry-diff-core.mjs';
import {cartographicReferences} from './geometry-reference.mjs';

const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data})=>{
  try {
    const tolerance=checkTolerance(data.tolerance),files=data.files;
    if(!Array.isArray(files)||files.length!==2||files.some(f=>!f?.size||f.size>25*1024*1024))throw Error('Escolha dois arquivos IFC de até 25 MiB cada.');
    const scenes=[],sources=[];
    for(let i=0;i<2;i++) {
      self.postMessage({progress:`Lendo ${i===0?'a versão anterior':'a versão revisada'} e calculando a assinatura da malha…`});
      const bytes=new Uint8Array(await files[i].arrayBuffer());
      const result=await comModelo(bytes,async(api,model,IFC)=>({
        scene:await describeScene(extrairCena(api,model),tolerance),
        schema:api.GetModelSchema(model),references:cartographicReferences(api,model,IFC)
      }),{coordinateToOrigin:false});
      scenes.push(result.scene);
      sources.push({name:files[i].name,size:files[i].size,sha256:await hash(bytes),schema:result.schema,
        cartographicOperations:result.references,elements:result.scene.elements.size,triangles:result.scene.triangleCount});
    }
    self.postMessage({progress:'Conferindo correspondência dos triângulos e diferenças de posicionamento…'});
    const comparison=compareScenes(scenes[0],scenes[1],tolerance);
    const report={schema:'confenge.ifc-geometry-diff/v1',createdAt:new Date().toISOString(),sources,...comparison,
      referenceChanged:JSON.stringify(sources[0].cartographicOperations)!==JSON.stringify(sources[1].cartographicOperations),
      method:{reader:'web-ifc 0.0.77',identity:'IfcRoot.GlobalId',coordinates:'IFC engineering coordinates in metres; COORDINATE_TO_ORIGIN=false',
        cartographicOperationsApplied:false,signature:'SHA-256 of sorted triangles with quantized vertices; mesh and Express IDs excluded',
        tolerance:'Euclidean distance per corresponding vertex, with bijective triangle matching when hashes differ',
        transform:'Equal local mesh with changed world mesh indicates changes in placement, rotation or reflection of parts',
        limits:['Only elements with triangulated geometry are compared.','Properties, quantities and names do not determine geometric status.',
          'Different triangulations may be marked modified even if they describe the same surface.',
          'No Boolean solid subtraction, clash detection, volume of change or automatic alignment.',
          'A changed cartographic reference is reported separately and is not applied to the coordinates.']}};
    self.postMessage({report});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:'Não foi possível comparar a geometria destes IFCs.'});}
};
