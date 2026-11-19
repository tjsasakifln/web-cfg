// A bounded STEP index. Comments and quoted strings cannot masquerade as
// entity records. Export replaces only coordinate-reference records; every
// geometric record and the original header remain byte-for-byte identical.
export function indexStep(text) {
  if(typeof text!=='string'||!text.startsWith('ISO-10303-21;')||text.length>25*1024*1024) throw Error('Use um IFC STEP UTF-8 de até 25 MiB.');
  const records=new Map();let quote=false,comment=false,start=0,syntax='',phase='start',endData=-1,maxId=0;
  for(let i=0;i<text.length;i++) {
    const ch=text[i],next=text[i+1];
    if(comment) {syntax+=' ';if(ch==='*'&&next==='/'){syntax+=' ';i++;comment=false;}continue;}
    if(quote) {syntax+=' ';if(ch==="'"){if(next==="'"){syntax+=' ';i++;}else quote=false;}continue;}
    if(ch==='/'&&next==='*'){syntax+='  ';i++;comment=true;continue;}
    if(ch==="'"){syntax+=' ';quote=true;continue;}
    syntax+=ch;
    if(ch!==';')continue;
    const statement=syntax.trim();const offset=syntax.search(/\S/),recordStart=start+offset;
    if(statement==='ISO-10303-21;'&&phase==='start')phase='envelope';
    else if(statement==='HEADER;'&&phase==='envelope')phase='header';
    else if(statement==='ENDSEC;'&&phase==='header')phase='afterHeader';
    else if(statement==='DATA;'&&phase==='afterHeader')phase='data';
    else if(statement==='ENDSEC;'&&phase==='data'){phase='afterData';endData=recordStart;}
    else if(statement==='END-ISO-10303-21;'&&phase==='afterData')phase='done';
    else if(phase==='data') {
      const match=statement.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\([\s\S]*\)\s*;$/);
      if(!match)throw Error('O bloco DATA contém um registro STEP não reconhecido.');
      const id=Number(match[1]);
      if(!Number.isSafeInteger(id)||id<1||id>2147483600||records.has(id))throw Error('O IFC contém identificadores inválidos ou repetidos.');
      const refs=[...statement.matchAll(/#(\d+)/g)].slice(1).map(m=>Number(m[1]));
      records.set(id,{id,type:match[2],start:recordStart,end:i+1,refs});maxId=Math.max(maxId,id);
      if(records.size>250000)throw Error('O IFC ultrapassa 250.000 registros. Exporte um recorte do projeto.');
    } else if(phase!=='header')throw Error('Use um arquivo IFC com um único bloco DATA.');
    start=i+1;syntax='';
  }
  if(quote||comment||phase!=='done'||syntax.trim()||!records.size||endData<0)throw Error('O arquivo STEP está incompleto ou contém conteúdo fora do envelope.');
  return {text,records,maxId,endData};
}

function stepNumber(value) {
  if(!Number.isFinite(value))throw Error('Coordenada não finita.');
  const text=(Object.is(value,-0)?0:value).toPrecision(16);
  return text.replace('e','E');
}

function stepString(value) {
  if(!value)return '$';
  // UTF-16 is explicit in STEP. Do not allow user text to escape its string.
  const hex=Array.from({length:value.length},(_,i)=>value.charCodeAt(i).toString(16).padStart(4,'0').toUpperCase()).join('');
  return "'\\X2\\"+hex+"\\X0\\'";
}

export function patchGeoreference(index,info,parameters) {
  const {records}=index;
  if(records.get(info.contextId)?.type!=='IFCGEOMETRICREPRESENTATIONCONTEXT')throw Error('Contexto de origem ausente.');
  const replacements=new Map(),additions=[];let next=index.maxId+1;
  const unitId=info.metreUnitId||next++;
  if(!info.metreUnitId)additions.push(`#${unitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  const crsId=info.existing?.crsId||next++,operationId=info.existing?.operationId||next++;
  const crs=`#${crsId}=IFCPROJECTEDCRS('EPSG:${parameters.epsg}','Georreferencia definida na CONFENGE','SIRGAS 2000',${stepString(parameters.verticalDatum)},'Transverse Mercator','${parameters.zone}${parameters.hemisphere}',#${unitId});`;
  const angle=parameters.rotation*Math.PI/180;
  const operation=`#${operationId}=IFCMAPCONVERSION(#${info.contextId},#${crsId},${[parameters.easting,parameters.northing,parameters.height,Math.cos(angle),Math.sin(angle),info.metresPerUnit].map(stepNumber).join(',')});`;
  if(info.existing) {
    if(records.get(crsId)?.type!=='IFCPROJECTEDCRS'||records.get(operationId)?.type!=='IFCMAPCONVERSION')throw Error('Referência existente não pode ser alterada com segurança.');
    for(const record of records.values())if(record.id!==operationId&&record.refs.includes(crsId))throw Error('O CRS existente é compartilhado com outra entidade. Reexporte um contexto isolado.');
    replacements.set(crsId,crs);replacements.set(operationId,operation);
  } else additions.push(crs,operation);
  const edits=[...replacements].map(([id,text])=>({...records.get(id),text}));
  edits.push({start:index.endData,end:index.endData,text:additions.length?additions.join('\n')+'\n':''});
  edits.sort((a,b)=>b.start-a.start);
  let output=index.text;
  for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  return {text:output,crsId,operationId,unitId,replacedIds:[...replacements.keys()],addedCount:additions.length};
}
