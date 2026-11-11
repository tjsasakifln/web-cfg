const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const validIfcGuid=value=>typeof value==='string'&&/^[0-3][0-9A-Za-z_$]{21}$/.test(value);
const xml=value=>String(value??'').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
// BCF 2.1 permits a selection-only viewpoint. No invented camera transform is
// exported. Every referenced selected component retains its IFC GlobalId.
export function bcfFiles(topics,models) {
  if(!Array.isArray(topics)||topics.length<1||topics.length>200)throw Error('Registre entre 1 e 200 apontamentos.');
  const files={'bcf.version':'<?xml version="1.0" encoding="UTF-8"?><Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>'};
  const used=new Set();
  for(const t of topics){
    if(!uuid.test(t.id)||!uuid.test(t.viewpoint)||used.has(t.id))throw Error('Identificador de apontamento inválido ou repetido.');used.add(t.id);
    if(!t.title?.trim()||t.title.length>180||!t.author?.trim()||t.author.length>160||typeof t.description!=='string'||t.description.length>8000||!Number.isFinite(Date.parse(t.created)))throw Error('Confira título, autor, data e descrição do apontamento.');
    if(!Array.isArray(t.components)||t.components.length>500||t.components.some(c=>!validIfcGuid(c.guid)))throw Error('O apontamento contém identificador IFC inválido.');
    if(new Set(t.components.map(c=>c.guid)).size!==t.components.length)throw Error('O apontamento contém GlobalId repetido.');
    const header=models.length?'<Header>'+models.map(m=>'<File isExternal="true"><Filename>'+xml(m.name)+'</Filename></File>').join('')+'</Header>':'';
    const selection=t.components.length?'<Viewpoints Guid="'+t.viewpoint+'"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints>':'';
    const detail=t.description+(t.components.length?'\n\nElementos selecionados:\n'+t.components.map(c=>`${c.file} · #${c.expressId} · ${c.guid} · ${c.name||c.class}`).join('\n'):'');
    files[t.id+'/markup.bcf']='<?xml version="1.0" encoding="UTF-8"?><Markup>'+header+'<Topic Guid="'+t.id+'" TopicType="Issue" TopicStatus="Open"><Title>'+xml(t.title)+'</Title><CreationDate>'+xml(new Date(t.created).toISOString())+'</CreationDate><CreationAuthor>'+xml(t.author)+'</CreationAuthor><Description>'+xml(detail)+'</Description></Topic>'+selection+'</Markup>';
    if(t.components.length)files[t.id+'/viewpoint.bcfv']='<?xml version="1.0" encoding="UTF-8"?><VisualizationInfo Guid="'+t.viewpoint+'"><Components><Selection>'+t.components.map(c=>'<Component IfcGuid="'+xml(c.guid)+'"><OriginatingSystem>CONFENGE</OriginatingSystem><AuthoringToolId>'+xml(c.file+' #'+c.expressId)+'</AuthoringToolId></Component>').join('')+'</Selection><Visibility DefaultVisibility="true"/></Components></VisualizationInfo>';
  }
  return files;
}
