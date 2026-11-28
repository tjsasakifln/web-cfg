// The same locally bundled CAD implementation is used by the scan and model tools.
const bytes = input => input instanceof Uint8Array ? input : new Uint8Array(input);
const limite = 25 * 1024 * 1024;
function validar(input) {
  const data=bytes(input);
  if (!data.length || data.length>limite) throw new Error('Use um desenho de até 25 MiB.');
  return data;
}
function monitorar(avisar) {
  return (_,evento)=>{
    if ([-1,1,3].includes(evento.notificationType)||/not supported|unsupported|skipping|skipped/i.test(evento.message)) throw new Error(String(evento.message).slice(0,300));
    if (evento.notificationType!==0) {
      if (!avisar) throw new Error('Conversão CAD com restrição: '+String(evento.message).slice(0,210));
      avisar(String(evento.message).slice(0,210));
    }
  };
}
function escreverDxf(lib,doc,notificar) {
  // Modern DXF uses UTF-8. Older code-page DXF would corrupt accented text here.
  doc.header.version=lib.ACadVersion.AC1027;
  const partes=[];
  let total=0;
  lib.DxfWriter.writeToStream({write(parte){
    total+=parte.length;
    if(total>64*1024*1024) throw new Error('O DXF supera o limite de saída.');
    partes.push(parte);
  }},doc,false,undefined,notificar);
  return new TextEncoder().encode(partes.join(''));
}
export function escreverDocumento(lib,doc,formato,avisar) {
  if(!['dwg','dxf'].includes(formato))throw new Error('Formato CAD inválido.');
  doc.header.version=formato==='dwg'?lib.ACadVersion.AC1015:lib.ACadVersion.AC1027;
  const n=monitorar(avisar);
  return formato==='dwg'?lib.DwgWriter.writeToBuffer(doc,null,n):escreverDxf(lib,doc,n);
}
// Reject drawings that depend on geometry outside the supported model-space subset.
export function conferirDesenho(doc){
  const simples=new Set(['LINE','LWPOLYLINE','POLYLINE','TEXT','MTEXT','ARC','CIRCLE','ELLIPSE','POINT']);
  if(!doc.modelSpace?.entities.count)throw new Error('O espaço do modelo está vazio.');
  const folhas=Array.from(doc.layouts || []).filter(l=>l.name?.toLowerCase()!=='model');
  if(folhas.length>1)throw new Error('Desenho com múltiplas folhas. Exporte a vista separadamente.');
  for(const bloco of doc.blockRecords || []){
    if((bloco.combinedFlags & 12)||bloco.blockEntity?.xRefPath)throw new Error('Desenho com referência externa (XREF). Incorpore a referência antes de converter.');
    if(/^\*Paper_Space/i.test(bloco.name)&&(bloco.entities.count||/\d$/.test(bloco.name)))throw new Error('Layouts de impressão com conteúdo pedem conferência em CAD. Exporte apenas o espaço do modelo.');
    for(const e of bloco.entities)if(!simples.has(e.objectName))throw new Error('A conversão de desenhos aceita traçados 2D simples. Entidade sem homologação: '+e.objectName);
  }
}
export async function dxfParaDwg(input,avisar) {
  const data=validar(input),lib=await import('./vendor-cad/acad.mjs'),n=monitorar(avisar);
  const doc=lib.DxfReader.readFromStream(data,n);
  conferirDesenho(doc);
  doc.header.version=lib.ACadVersion.AC1015;
  return lib.DwgWriter.writeToBuffer(doc,null,n);
}
export async function dwgParaDxf(input,avisar) {
  const data=validar(input),lib=await import('./vendor-cad/acad.mjs'),n=monitorar(avisar);
  if(!/^AC10\d{2}$/.test(new TextDecoder().decode(data.subarray(0,6)))) throw new Error('Assinatura DWG inválida.');
  const doc=lib.DwgReader.readFromStream(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),n);
  conferirDesenho(doc);
  return escreverDxf(lib,doc,n);
}
function cor(lib,rgb,preenchimento){
  if(typeof rgb!=='string')return null;
  const s=rgb.match(/^#([0-9a-f]{6})$/i)?.[1];
  if(!s)return null;
  if(!preenchimento&&s==='000000')return new lib.Color(7); // readable on a light or dark CAD canvas
  return new lib.Color(...[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)));
}
function conferirPrancha(doc,verificado){
  const ex=Array.from(doc.modelSpace.entities),ob=Array.from(verificado.modelSpace.entities);
  const falha=()=>{throw new Error('O arquivo gerado não passou na conferência de linhas, textos e hachuras. Nenhum arquivo foi liberado.');};
  if(ex.length!==ob.length||verificado.header.insUnits!==4)falha();
  const perto=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-7+1e-9*Math.abs(a);
  const xy=(a,b)=>a&&b&&perto(a.x,b.x)&&perto(a.y,b.y);
  for(let i=0;i<ex.length;i++){
    const a=ex[i],b=ob[i];if(a.objectName!==b.objectName||!a.color.equals(b.color))falha();
    switch(a.objectName){
      case 'LINE':
        if(!xy(a.startPoint,b.startPoint)||!xy(a.endPoint,b.endPoint))falha();
        break;
      case 'TEXT':
        if(a.value!==b.value||!xy(a.insertPoint,b.insertPoint)||!perto(a.height,b.height)||
          Math.abs(Math.atan2(Math.sin(a.rotation-b.rotation),Math.cos(a.rotation-b.rotation)))>1e-8||
          !perto(a.widthFactor,b.widthFactor)||a.mirror!==b.mirror)falha();
        break;
      case 'HATCH':
        if(!b.isSolid||a.paths.length!==b.paths.length)falha();
        for(let k=0;k<a.paths.length;k++){
          const p=a.paths[k].edges[0],q=b.paths[k].edges[0];
          if(a.paths[k].flags!==b.paths[k].flags||!q?.isClosed||p.vertices.length!==q.vertices.length||
            p.vertices.some((v,j)=>!xy(v,q.vertices[j])))falha();
        }
        break;
      default: falha();
    }
  }
}
export async function escreverPrancha(pagina,formato,fator,avisar) {
  if(!['dwg','dxf'].includes(formato))throw new Error('Formato CAD inválido.');
  if(!Number.isFinite(fator)||fator<1e-6||fator>1e6)throw new Error('Informe uma escala positiva dentro do intervalo indicado.');
  const lib=await import('./vendor-cad/acad.mjs'),doc=new lib.CadDocument();
  doc.header.version=lib.ACadVersion.AC1027; // DWG 2013 preserves Unicode; do not downconvert to 2000.
  doc.header.insUnits=4;
  if(formato==='dxf')doc.header.codePage='UTF-8';
  function xyz(p){return new lib.XYZ(p[0]*fator,p[1]*fator,0);}
  for(const e of pagina.entidades){
    let item;
    if(e.tipo==='linha'){
      item=new lib.Line();item.startPoint=xyz(e.a);item.endPoint=xyz(e.b);
    }else if(e.tipo==='texto'){
      item=new lib.TextEntity(e.valor);item.insertPoint=xyz(e.origem);
      item.height=e.altura*fator;item.rotation=e.rotacao;item.widthFactor=e.largura;
      item.mirror=(e.espelhado?lib.TextMirrorFlag.Backward:0)|(e.invertido?lib.TextMirrorFlag.UpsideDown:0);
    }else if(e.tipo==='hachura'){
      item=new lib.Hatch();item.isSolid=true;item.isAssociative=false;item.patternType=lib.HatchPatternType.SolidFill;
      item.paths=e.aneis.map((a,i)=>{
        const loop=new lib.HatchBoundaryPathPolyline();loop.isClosed=true;loop.vertices=a.map(xyz);
        const path=new lib.HatchBoundaryPath([loop]);
        path.flags=i?lib.BoundaryPathFlags.Default:lib.BoundaryPathFlags.External;
        return path;
      });
    }else throw new Error('O PDF contém uma entidade não reconhecida.');
    const c=cor(lib,e.rgb,e.tipo==='hachura');if(c)item.color=c;
    doc.modelSpace.entities.add(item);
  }
  if(!doc.modelSpace.entities.count)throw new Error('Nenhuma entidade vetorial para exportar.');
  const n=monitorar(avisar);
  const pronto=bytes(formato==='dwg'?lib.DwgWriter.writeToBuffer(doc,null,n):escreverDxf(lib,doc,n));
  if(!pronto.length||pronto.byteLength>64*1024*1024)throw new Error('O arquivo CAD supera o limite de saída.');
  const reaberto=formato==='dwg'
    ?lib.DwgReader.readFromStream(pronto.buffer.slice(pronto.byteOffset,pronto.byteOffset+pronto.byteLength),n)
    :lib.DxfReader.readFromStream(pronto,n);
  conferirPrancha(doc,reaberto);
  return pronto;
}
