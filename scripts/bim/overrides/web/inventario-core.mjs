// Inventory declared IFC data. Occurrence and type properties remain separate
// so conflicting values are visible instead of silently applying a precedence.
const MAX_ROWS = 100000;
const value = x => x?.value ?? x;
const text = x => typeof value(x) === 'string' ? value(x) : '';
const refs = x => { const v=value(x); return Array.isArray(v) ? v.flatMap(refs) : Number.isInteger(v) ? [v] : []; };
export function extrairInventario(api, model, IFC) {
  const line = id => api.GetLine(model, id);
  const type = item => item ? api.GetNameFromTypeCode(item.type) : '';
  function ids(name, inherited=false) {
    if (!IFC[name]) return [];
    const list = api.GetLineIDsWithType(model, IFC[name], inherited);
    try { return Array.from({length:list.size()}, (_,i) => list.get(i)); }
    finally { list.delete?.(); }
  }
  const elements = [...new Set([...ids('IFCELEMENT',true), ...ids('IFCSPACE',true)])];
  if (elements.length > 50000) throw Error('O inventário aceita até 50.000 elementos e espaços por arquivo.');
  const parents = new Map(), contained = new Map(), types = new Map(), groups = new Map(), sets = new Map();
  function add(map,key,id) { if(!map.has(key)) map.set(key,new Set()); map.get(key).add(id); }
  for (const relation of ['IFCRELAGGREGATES','IFCRELNESTS']) for(const id of ids(relation)) {
    const rel=line(id); for(const child of refs(rel.RelatedObjects)) for(const parent of refs(rel.RelatingObject)) add(parents,child,parent);
  }
  for (const id of ids('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    const rel=line(id); for(const child of refs(rel.RelatedElements)) for(const parent of refs(rel.RelatingStructure)) add(contained,child,parent);
  }
  for(const id of ids('IFCRELDEFINESBYTYPE')) {
    const rel=line(id); for(const child of refs(rel.RelatedObjects)) for(const parent of refs(rel.RelatingType)) add(types,child,parent);
  }
  for(const id of ids('IFCRELASSIGNSTOGROUP')) {
    const rel=line(id); for(const child of refs(rel.RelatedObjects)) for(const parent of refs(rel.RelatingGroup)) add(groups,child,parent);
  }
  for(const id of ids('IFCRELDEFINESBYPROPERTIES')) {
    const rel=line(id); for(const child of refs(rel.RelatedObjects)) for(const pset of refs(rel.RelatingPropertyDefinition)) add(sets,child,pset);
  }
  function spatial(id) {
    const seen = new Set(), todo = [...(contained.get(id)||[]), ...(parents.get(id)||[])], names=[];
    for(let i=0;i<todo.length;i++) {
      const next=todo[i]; if(seen.has(next)) continue; seen.add(next);
      if(seen.size>200) throw Error('Relação espacial muito extensa ou inconsistente. Confira a estrutura do IFC.');
      const obj=line(next); names.push(type(obj)+': '+(text(obj?.Name)||'#'+next));
      todo.push(...(parents.get(next)||[]), ...(contained.get(next)||[]));
    }
    return names.join(' | ');
  }
  function unit(id) {
    const u=line(id); if(!u) return '';
    return [text(u.Prefix),text(u.Name),text(u.UnitType)].filter(Boolean).join(' ');
  }
  function scalar(v) {
    const x=value(v);
    return ['string','boolean'].includes(typeof x)||typeof x==='number'&&Number.isFinite(x) ? x : null;
  }
  const records=[], rows=[];
  function append(row) { if(rows.length>=MAX_ROWS) throw Error('A extração excede 100.000 linhas de propriedades. Exporte um recorte do modelo.'); rows.push(row); }
  function property(propId,base,trail='',seen=new Set()) {
    if(seen.has(propId)||seen.size>=10) { append({...base,propertyId:propId,state:'referencia_circular_ou_profunda'});return; }
    const prop=line(propId), kind=type(prop).toUpperCase();
    const name=trail+text(prop?.Name);
    if(kind==='IFCCOMPLEXPROPERTY') {
      const next=new Set(seen);next.add(propId);
      for(const id of refs(prop.HasProperties)) property(id,base,name+'.',next);
      return;
    }
    let val=null, state='tipo_nao_escalar';
    if(kind==='IFCPROPERTYSINGLEVALUE') {val=scalar(prop.NominalValue);state=val===null?'valor_ausente':'declarado';}
    else if(['IFCPROPERTYENUMERATEDVALUE','IFCPROPERTYLISTVALUE'].includes(kind)) {
      const list=prop.EnumerationValues??prop.ListValues;
      if(Array.isArray(list)&&list.every(v=>scalar(v)!==null)) {val=JSON.stringify(list.map(scalar));state='lista_declarada';}
    }
    const units=refs(prop?.Unit).map(unit).filter(Boolean).join(' | ');
    append({...base,property:name,propertyId:propId,propertyClass:kind,value:val,unit:units,state});
  }
  for(const id of elements) {
    const obj=line(id), typeIDs=[...(types.get(id)||[])];
    const record={id,guid:text(obj.GlobalId),class:type(obj),name:text(obj.Name),tag:text(obj.Tag),
      description:text(obj.Description),spatial:spatial(id),
      typeIds:typeIDs,typeNames:typeIDs.map(t=>text(line(t)?.Name)),
      groups:[...(groups.get(id)||[])].map(g=>({id:g,class:type(line(g)),name:text(line(g)?.Name)}))};
    records.push(record);
    const base={guid:record.guid,elementId:id,class:record.class,name:record.name,tag:record.tag,
      spatial:record.spatial,typeNames:record.typeNames.join(' | '),groups:record.groups.map(g=>g.name||g.class+' #'+g.id).join(' | ')};
    const before=rows.length;
    const candidates=[...[...(sets.get(id)||[])].map(setId=>({setId,origin:'ocorrencia',ownerId:id})),
      ...typeIDs.flatMap(t=>refs(line(t)?.HasPropertySets).map(setId=>({setId,origin:'tipo',ownerId:t})))];
    const used=new Set();
    for(const candidate of candidates) {
      const key=candidate.ownerId+':'+candidate.setId;if(used.has(key))continue;used.add(key);
      const ps=line(candidate.setId);if(type(ps).toUpperCase()!=='IFCPROPERTYSET')continue;
      const b={...base,...candidate,set:text(ps.Name)};
      const props=refs(ps.HasProperties);
      if(!props.length)append({...b,state:'conjunto_vazio'});
      for(const p of props)property(p,b);
    }
    if(rows.length===before)append({...base,state:'sem_propriedade'});
  }
  return {schema:'CONFENGE_IFC_INVENTORY/1',records,rows,
    summary:{elements:records.length,rows:rows.length,withoutGuid:records.filter(r=>!r.guid).length,
      withoutProperties:rows.filter(r=>r.state==='sem_propriedade').length}};
}
export const inventoryColumns=[['GlobalId','guid'],['ID STEP','elementId'],['Classe IFC','class'],['Nome','name'],['Tag','tag'],['Contexto espacial','spatial'],['Tipos','typeNames'],['Grupos e sistemas','groups'],['Origem','origin'],['ID do proprietário','ownerId'],['Conjunto','set'],['ID do conjunto','setId'],['Propriedade','property'],['ID da propriedade','propertyId'],['Classe da propriedade','propertyClass'],['Valor declarado','value'],['Unidade explícita','unit'],['Situação','state']];
