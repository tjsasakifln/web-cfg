// Semantic signatures deliberately omit STEP record numbers. The engineering
// geometry is compared separately; these cartographic operations are not applied.
export function cartographicReferences(api,model,IFC) {
  let nodes=0;
  const normalize=(value,seen=new Set(),depth=0)=>{
    if(++nodes>1000||depth>12)throw Error('A referência cartográfica é muito complexa para esta comparação.');
    if(value===null||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(v=>normalize(v,seen,depth+1));
    // web-ifc uses token type 5 for a STEP reference (Handle).
    if(value.type===5&&Number.isInteger(value.value)) {
      if(seen.has(value.value))throw Error('Referência cartográfica circular no IFC.');
      const next=new Set(seen);next.add(value.value);
      return normalize(api.GetLine(model,value.value,false),next,depth+1);
    }
    const out={};
    for(const key of Object.keys(value).sort()) {
      if(key==='expressID')continue;
      out[key]=normalize(value[key],seen,depth+1);
    }
    return out;
  };
  const operations=[];
  for(const type of ['IFCMAPCONVERSION','IFCMAPCONVERSIONSCALED','IFCRIGIDOPERATION']) {
    if(typeof IFC[type]!=='number')continue;
    let ids;try{ids=api.GetLineIDsWithType(model,IFC[type]);}catch{continue;}
    if(!ids)continue;
    for(let i=0;i<ids.size();i++) {
      if(operations.length>=1)throw Error('O arquivo possui mais de uma operação cartográfica. Compare um recorte de um único contexto para evitar uma referência ambígua.');
      const line=api.GetLine(model,ids.get(i),false),operation={type};
      for(const key of Object.keys(line).sort()) {
        if(['expressID','type','SourceCRS'].includes(key))continue;
        // Includes all target-CRS metadata and its recursively expanded MapUnit,
        // as well as rigid-operation coordinates, measures and scaled factors.
        operation[key]=normalize(line[key]);
      }
      operations.push(operation);
    }
  }
  return operations.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
}
