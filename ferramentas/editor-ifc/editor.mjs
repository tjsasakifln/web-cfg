import {IfcDocument, MAX_BYTES} from './ifc-document.mjs';
import * as THREE from '/bim/web/vendor/three/three.module.js';
import {OrbitControls} from '/bim/web/vendor/three/addons/controls/OrbitControls.js';
import {exportToolResult} from '/assets/js/tool-credits.mjs';

const $=id=>document.getElementById(id);
const ui={file:$('ifce-file'),open:$('ifce-open'),sample:$('ifce-sample'),save:$('ifce-save'),undo:$('ifce-undo'),redo:$('ifce-redo'),search:$('ifce-search'),tree:$('ifce-tree'),count:$('ifce-count'),status:$('ifce-status'),model:$('ifce-model'),empty:$('ifce-empty'),inspector:$('ifce-inspector'),placeholder:$('ifce-placeholder'),title:$('ifce-selection'),guid:$('ifce-guid'),type:$('ifce-type'),fields:$('ifce-fields'),props:$('ifce-props'),fit:$('ifce-fit'),reset:$('ifce-reset'),busy:$('ifce-busy'),editCount:$('ifce-edit-count'),shell:$('ifce-shell'),viewport:$('ifce-viewport')};
let doc=null, elements=[], current=null, currentFile='', renderer, scene, camera, controls, raycaster, meshGroup, meshes=new Map(), highlight=null, running=false, loadSeq=0, selectedTab='all';
function status(message,error=false) {ui.status.textContent=message;ui.status.dataset.state=error?'error':'ok';}
function active(button,enabled) {button.disabled=!enabled;}
function buttonState() {
  active(ui.save,!!doc?.changed && !running);active(ui.undo,!!doc?.canUndo && !running);active(ui.redo,!!doc?.canRedo && !running);
  active(ui.fit,!!doc && meshes.size>0 && !running);active(ui.reset,!!doc && !running);
  ui.editCount.textContent=doc?.changed?doc.edits.size+' alteração'+(doc.edits.size===1?'':'ões'):'Sem alterações';
  ui.save.title=doc?.changed?'Baixar IFC com alterações autorizadas':'Altere um atributo antes de salvar';
}
function busy(value,message) {
  running=value;ui.busy.hidden=!value;ui.busy.textContent=message||'Processando IFC...';
  active(ui.open,!value);active(ui.sample,!value);ui.file.disabled=value;ui.search.disabled=value;
  buttonState();
}
function flash(message,error=false) {status(message,error);if(error)console.warn('CONFENGE IFC Editor:',message);}
function safeName(filename) {return (filename||'modelo').replace(/\.ifc$/i,'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,90);}
function detectName(el) {return el.name||el.type.replace(/^IFC/,'')+' #'+el.id;}
function newScene() {
  if(!renderer) {
    scene=new THREE.Scene();scene.background=new THREE.Color('#0a1b2b');
    camera=new THREE.PerspectiveCamera(48,1,.01,200000);camera.up.set(0,0,1);
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label','Visualização interativa 3D do modelo IFC');
    renderer.domElement.setAttribute('tabindex','0');ui.viewport.append(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.screenSpacePanning=true;
    controls.addEventListener('change',draw);raycaster=new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xf1faff,0x3a6373,2.2));
    const directional=new THREE.DirectionalLight(0xffffff,2.1);directional.position.set(30,-40,90);scene.add(directional);
    const grid=new THREE.GridHelper(120,30,0x3c7784,0x244659);grid.rotation.x=Math.PI/2;scene.add(grid);
    let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
    renderer.domElement.addEventListener('pointerup',e=>{
      if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();
      const pointer=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects(meshGroup?.children||[],true);
      if(hits.length)select(hits[0].object.userData.elementId);
    });
    new ResizeObserver(draw).observe(ui.viewport);
  }
  if(meshGroup) {
    meshGroup.traverse(object=>{if(object.isMesh) {object.geometry.dispose();object.material.dispose();}});
    scene.remove(meshGroup);
  }
  if(highlight) {scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}
  meshGroup=new THREE.Group();scene.add(meshGroup);meshes.clear();
}
function draw(){
  if(!renderer)return;
  const w=ui.viewport.clientWidth,h=ui.viewport.clientHeight;
  if(w<1||h<1)return;
  if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  renderer.render(scene,camera);
}
function fit(){
  if(!meshGroup||!meshGroup.children.length)return;
  const box=new THREE.Box3().setFromObject(meshGroup), size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.length()) || size.length()<1e-6)return;
  const radius=Math.max(size.length(),1),dist=radius/(2*Math.tan(camera.fov*Math.PI/360))*1.65;
  camera.position.copy(center).add(new THREE.Vector3(dist*.75,-dist*.8,dist*.63));
  camera.near=Math.max(.001,dist/10000);camera.far=Math.max(1000,dist*50);
  camera.updateProjectionMatrix();controls.target.copy(center);controls.update();draw();
}
function trackMeshes(api,model,limit=200000) {
  let triangles=0,instances=0;const geomCache=new Map();
  api.StreamAllMeshes(model,flat=>{
    if(instances>6500||triangles>limit)return;
    const id=flat.expressID;
    if(!doc?.record(id))return;
    for(let i=0;i<flat.geometries.size();i++){
      const placed=flat.geometries.get(i),gid=placed.geometryExpressID;
      let geometry=geomCache.get(gid);
      if(!geometry) {
        const raw=api.GetGeometry(model,gid);
        const v=api.GetVertexArray(raw.GetVertexData(),raw.GetVertexDataSize());
        const indices=api.GetIndexArray(raw.GetIndexData(),raw.GetIndexDataSize());
        if(!v.length||!indices.length)continue;
        triangles+=indices.length/3;
        if(triangles>limit)break;
        const position=new Float32Array(v.length/6*3),normal=new Float32Array(position.length);
        for(let n=0,j=0;n<v.length;n+=6,j+=3) {
          position[j]=v[n];position[j+1]=v[n+1];position[j+2]=v[n+2];
          normal[j]=v[n+3];normal[j+1]=v[n+4];normal[j+2]=v[n+5];
        }
        geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
        geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));geometry.setIndex(Array.from(indices));
        geomCache.set(gid,geometry);
        raw.delete?.();
      }
      const color=placed.color||{x:.75,y:.83,z:.87,w:1};
      const material=new THREE.MeshStandardMaterial({color:new THREE.Color(color.x,color.y,color.z),transparent:color.w<.99,opacity:Math.max(.18,color.w||1),metalness:.02,roughness:.8,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);
      const t=placed.flatTransformation;
      if(t&&t.length===16) {mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(t);}
      mesh.userData.elementId=id;meshGroup.add(mesh);
      if(!meshes.has(id))meshes.set(id,[]);meshes.get(id).push(mesh);
      instances++;
    }
  });
  return {triangles,instances};
}
async function drawModel(bytes){
  try {
    newScene();
    const IFC=await import('/bim/web/vendor/web-ifc/web-ifc-api.js');
    const api=new IFC.IfcAPI();let model=-1;
    try {
      await api.Init(filename=>'/bim/web/vendor/web-ifc/'+filename,true);
      model=api.OpenModel(bytes,{COORDINATE_TO_ORIGIN:true,MEMORY_LIMIT:512*1024*1024});
      if(model<0)throw Error('O visualizador nao reconheceu este IFC.');
      const result=trackMeshes(api,model);
      ui.empty.hidden=!!result.instances;
      fit();
      if(result.triangles>200000)flash('Prévia limitada aos primeiros 200 mil triângulos. Os dados IFC permanecem editáveis.');
      else if(result.instances)flash('Arquivo aberto. Selecione um elemento em 3D ou na lista.');
      else flash('O IFC foi lido, mas não há sólidos compatíveis para a prévia. Os atributos continuam acessíveis.');
    } finally {if(model>=0)api.CloseModel(model);api.Dispose?.();}
  } catch(e) {
    ui.empty.hidden=false;ui.empty.querySelector('p').textContent='A prévia 3D não abriu neste navegador. A edição dos atributos continua disponível.';
    flash('Modelo aberto para edição. Prévia 3D indisponível: '+(e.message||e),true);
  }
}
function renderTree() {
  const q=ui.search.value.trim().toLocaleLowerCase('pt-BR');
  const filtered=elements.filter(el=>(selectedTab==='all'||el.type===selectedTab)&&
    (!q||[el.name,el.type,el.guid,String(el.id)].join(' ').toLocaleLowerCase('pt-BR').includes(q)));
  ui.tree.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const el of filtered.slice(0,2500)){
    const li=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.className='ifce-entity'+(el.id===current?' is-active':'');
    button.dataset.id=String(el.id);button.setAttribute('aria-current',el.id===current?'true':'false');
    const name=document.createElement('strong');name.textContent=detectName(el);
    const meta=document.createElement('small');meta.textContent=el.type.replace(/^IFC/,'')+'  ·  #'+el.id;
    button.append(name,meta);button.onclick=()=>select(el.id);li.append(button);fragment.append(li);
  }
  ui.tree.append(fragment);
  ui.count.textContent=filtered.length+' elementos'+(filtered.length>2500?' (primeiros 2.500 exibidos)':'');
}
function createField(label,value,onCommit,options={}){
  const wrap=document.createElement('label');wrap.className='ifce-field';
  const title=document.createElement('span');title.textContent=label;wrap.append(title);
  const input=options.boolean?document.createElement('select'):document.createElement('input');
  if(options.boolean){for(const [v,t] of [['true','Verdadeiro'],['false','Falso']]){const o=document.createElement('option');o.value=v;o.textContent=t;input.append(o);}}
  else {input.type=options.number?'number':'text';input.step=options.number?'any':undefined;input.maxLength=options.long?400:200;}
  input.value=String(value);
  if(options.readonly){input.disabled=true;wrap.title='Propriedade de leitura ou compartilhada por outros objetos';}
  else {
    const save=()=>{if(input.value===String(value))return;
      try{onCommit(input.value);refresh();}catch(error){flash(error.message,true);input.value=String(value);}
    };
    input.addEventListener('change',save);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}});
  }
  wrap.append(input);return wrap;
}
function renderInspector() {
  const el=elements.find(x=>x.id===current);
  ui.placeholder.hidden=!!el;ui.inspector.hidden=!el;
  if(!el)return;
  ui.title.textContent=detectName(el);ui.type.textContent=el.type;ui.guid.textContent=el.guid;
  ui.fields.replaceChildren();ui.props.replaceChildren();
  ui.fields.append(
    createField('Nome do elemento',el.name,value=>doc.setName(el.id,value)),
    createField('Descrição',el.description,value=>doc.setDescription(el.id,value),{long:true})
  );
  const properties=doc.properties(el.id),grouped=new Map();
  for(const p of properties){if(!grouped.has(p.group))grouped.set(p.group,[]);grouped.get(p.group).push(p);}
  if(!grouped.size){const msg=document.createElement('p');msg.className='ifce-muted';msg.textContent='Sem propriedades simples de ocorrência neste objeto.';ui.props.append(msg);}
  for(const [group,rows] of grouped){
    const block=document.createElement('section');block.className='ifce-pset';
    const heading=document.createElement('h3');heading.textContent=group||'Propriedades';block.append(heading);
    for(const p of rows)block.append(createField(p.name,p.value,value=>doc.setProperty(el.id,p.id,value),{
      boolean:p.kind==='IFCBOOLEAN',number:/MEASURE|IFCREAL|IFCINTEGER/.test(p.kind),readonly:!p.editable
    }));
    if(rows.some(p=>p.shared)){
      const note=document.createElement('small');note.textContent='Algumas propriedades são compartilhadas com outros objetos e estão protegidas nesta versão.';block.append(note);
    }
    ui.props.append(block);
  }
}
function select(id) {
  current=Number(id);renderTree();renderInspector();
  if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}
  const items=meshes.get(current);
  if(items?.length) {
    const box=new THREE.Box3();for(const mesh of items)box.expandByObject(mesh);
    const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(size.length()>0) {
      highlight=new THREE.Box3Helper(box,0x58f5ca);scene.add(highlight);
      // A seleção é assinalada sem modificar o material original da peça.
      if(!box.containsPoint(controls.target) && size.length()>0){/* preserve current camera */ }
    }
  }
  draw();
}
function refresh(){elements=doc.elements();renderTree();renderInspector();buttonState();status('Alterações locais. Salve uma cópia IFC para compartilhar.');}
async function load(file) {
  if(!file)return;const seq=++loadSeq;
  if(doc?.changed&&!confirm('As alterações atuais ainda não foram exportadas. Abrir outro IFC e descartá-las?'))return;
  if(file.size>MAX_BYTES){flash('Arquivo acima do limite de 25 MiB.',true);return;}
  busy(true,'Lendo e preparando o modelo...');
  try {
    const bytes=new Uint8Array(await file.arrayBuffer());
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const parsed=new IfcDocument(text);if(seq!==loadSeq)return;
    doc=parsed;current=null;currentFile=file.name||'exemplo.ifc';elements=doc.elements();
    ui.model.textContent=currentFile;ui.shell.classList.add('is-loaded');ui.search.value='';renderTree();renderInspector();
    await drawModel(bytes);
    if(!elements.length)flash('IFC sem elementos identificáveis para edição.',true);
    buttonState();
  } catch(e) {flash('Não foi possível abrir o IFC: '+(e.message||e),true);}
  finally {busy(false);}
}
async function loadExample() {
  try {
    busy(true,'Abrindo exemplo...');
    const response=await fetch('/bim/examples/inventario-piloto.ifc',{cache:'no-store'});
    if(!response.ok)throw Error('Exemplo indisponível (HTTP '+response.status+').');
    const data=await response.blob();
    busy(false);await load(new File([data],'modelo-exemplo-confenge.ifc',{type:'application/x-step'}));
  } catch(e){busy(false);flash(e.message,true);}
}
async function save(){
  if(!doc?.changed||running)return;
  busy(true,'Validando a cópia IFC...');
  try {
    const output=doc.exportText(),bytes=new TextEncoder().encode(output);
    // Uma segunda leitura no motor IFC verifica a interpretação sintática da cópia.
    const IFC=await import('/bim/web/vendor/web-ifc/web-ifc-api.js');
    const api=new IFC.IfcAPI();let model=-1;
    try{
      await api.Init(filename=>'/bim/web/vendor/web-ifc/'+filename,true);
      model=api.OpenModel(bytes,{COORDINATE_TO_ORIGIN:true,MEMORY_LIMIT:512*1024*1024});
      if(model<0)throw Error('O motor IFC recusou o arquivo editado.');
    } finally{if(model>=0)api.CloseModel(model);api.Dispose?.();}
    const blob=new Blob([bytes],{type:'application/x-step'});
    const filename=safeName(currentFile)+'-editado.ifc';
    const delivered=await exportToolResult({
      toolId:'bim-editor-ifc',format:'ifc',content:blob,
      deliver:()=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    });
    if(delivered!==false)flash('Cópia IFC autorizada e download iniciado. O original não foi alterado.');
    else flash('A exportação foi cancelada. Alterações preservadas.',true);
  } catch(e){flash('Exportação não concluída: '+(e.message||e),true);}
  finally {busy(false);}
}
ui.open.onclick=()=>ui.file.click();
ui.file.onchange=async()=>{const file=ui.file.files?.[0];ui.file.value='';await load(file);};
ui.sample.onclick=loadExample;ui.save.onclick=save;
ui.undo.onclick=()=>{doc?.undo();if(doc)refresh();};
ui.redo.onclick=()=>{doc?.redo();if(doc)refresh();};
ui.search.oninput=renderTree;ui.fit.onclick=fit;
ui.reset.onclick=()=>{if(doc?.changed&&confirm('Descartar todas as alterações deste arquivo?')){const text=doc.source.text;doc=new IfcDocument(text);refresh();}};
for(const button of document.querySelectorAll('[data-ifce-filter]')){
  button.addEventListener('click',()=>{
    selectedTab=button.dataset.ifceFilter;
    for(const b of document.querySelectorAll('[data-ifce-filter]'))b.setAttribute('aria-pressed',String(b===button));
    renderTree();
  });
}
addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&doc){
    if(e.key.toLowerCase()==='s'){e.preventDefault();save();}
    if(e.key.toLowerCase()==='z'&&document.activeElement?.tagName!=='INPUT'){
      e.preventDefault();if(e.shiftKey)doc.redo();else doc.undo();refresh();
    }
  }
});
addEventListener('beforeunload',e=>{if(doc?.changed){e.preventDefault();e.returnValue='';}});
buttonState();status('Abra seu arquivo IFC ou experimente o modelo de exemplo.');
