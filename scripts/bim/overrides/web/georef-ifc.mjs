const value=item=>item?.value ?? item;
const reference=item=>Number(item?.value ?? item?.expressID ?? item);
const vector=items=>Array.isArray(items)?items.map(value):[];
const ids=(api,model,type,inherited=false)=>{
  const list=api.GetLineIDsWithType(model,type,inherited);
  return Array.from({length:list.size()},(_,i)=>list.get(i));
};
const unitFactors={'':1,MILLI:.001,CENTI:.01,DECI:.1};

function lengthUnit(line,IFC) {
  const prefix=value(line?.Prefix)??'';
  if(line?.type!==IFC.IFCSIUNIT||value(line.UnitType)!=='LENGTHUNIT'||value(line.Name)!=='METRE'||!(prefix in unitFactors)) {
    throw Error('A unidade de comprimento deve ser metro, decímetro, centímetro ou milímetro SI, declarada no projeto.');
  }
  return {metresPerUnit:unitFactors[prefix],label:prefix?({MILLI:'mm',CENTI:'cm',DECI:'dm'})[prefix]:'m'};
}

function sameDirection(actual,expected) {
  const size=Math.hypot(...actual);
  return actual.length===3&&size>0&&actual.every((v,i)=>Number.isFinite(v)&&Math.abs(v/size-expected[i])<1e-10);
}

export function inspectGeoreference(api,model,IFC,index) {
  const schema=api.GetModelSchema(model);
  if(!/^IFC4(?:$|X3(?:_|$))/.test(schema)) throw Error('Esta ferramenta grava IFC4 e IFC4.3. Exporte novamente em um desses esquemas; IFC2x3 não é alterado.');
  const projects=ids(api,model,IFC.IFCPROJECT);
  if(projects.length!==1)throw Error('O arquivo deve conter exatamente um IfcProject.');
  if(api.GetAllLines(model).size()!==index.records.size)throw Error('O leitor não reconheceu todos os registros do IFC. A gravação foi interrompida.');
  const get=id=>api.GetLine(model,id);
  const project=get(projects[0]),units=get(reference(project.UnitsInContext));
  const lengths=(units?.Units||[]).map(ref=>get(reference(ref))).filter(line=>value(line?.UnitType)==='LENGTHUNIT');
  if(lengths.length!==1)throw Error('A unidade de comprimento do projeto está ausente ou é ambígua.');
  const sourceUnit=lengthUnit(lengths[0],IFC);
  const contexts=ids(api,model,IFC.IFCGEOMETRICREPRESENTATIONCONTEXT).map(get).filter(c=>value(c?.CoordinateSpaceDimension)===3);
  if(contexts.length!==1)throw Error('Use um IFC com um único contexto geométrico 3D. Múltiplas origens não são combinadas automaticamente.');
  const context=contexts[0];
  if(!(project.RepresentationContexts||[]).some(ref=>reference(ref)===context.expressID))throw Error('O contexto 3D não está vinculado ao projeto.');
  const placement=get(reference(context.WorldCoordinateSystem));
  const origin=vector(get(reference(placement?.Location))?.Coordinates);
  const axis=placement?.Axis?vector(get(reference(placement.Axis))?.DirectionRatios):[0,0,1];
  const direction=placement?.RefDirection?vector(get(reference(placement.RefDirection))?.DirectionRatios):[1,0,0];
  if(placement?.type!==IFC.IFCAXIS2PLACEMENT3D||origin.length!==3||origin.some(n=>!Number.isFinite(n)||Math.abs(n*sourceUnit.metresPerUnit)>1e-9)||!sameDirection(axis,[0,0,1])||!sameDirection(direction,[1,0,0])) {
    throw Error('WorldCoordinateSystem não é a origem XYZ padrão. Reexporte um contexto local sem rotação ou deslocamento nesse atributo.');
  }
  for(const subId of ids(api,model,IFC.IFCGEOMETRICREPRESENTATIONSUBCONTEXT)) {
    const sub=get(subId);
    if(reference(sub.ParentContext)!==context.expressID)throw Error('Há subcontextos associados a outras origens. Reexporte o modelo com um contexto 3D único.');
  }
  // Reject baked map coordinates instead of adding a second map translation.
  let coordinateCount=0;
  for(const type of [IFC.IFCCARTESIANPOINT,IFC.IFCCARTESIANPOINTLIST2D,IFC.IFCCARTESIANPOINTLIST3D]) {
    for(const pointId of ids(api,model,type)) {
      const point=get(pointId),rows=point.Coordinates?[point.Coordinates]:point.CoordList||[];
      for(const row of rows)for(const coordinate of vector(row)) {
        const n=Number(coordinate);
        if(!Number.isFinite(n)||Math.abs(n*sourceUnit.metresPerUnit)>50000)throw Error('Há coordenadas maiores que 50 km ou inválidas na geometria/posicionamento. O arquivo pode ter coordenadas cartográficas embutidas; corrija a origem no autor antes de acrescentar MapConversion.');
        if(++coordinateCount>5000000)throw Error('Há coordenadas demais para conferir a origem. Exporte um recorte do IFC.');
      }
    }
  }
  const operations=ids(api,model,IFC.IFCCOORDINATEOPERATION,true);
  if(operations.length>1)throw Error('O IFC contém mais de uma operação de coordenadas. Não é possível escolher uma delas automaticamente.');
  let existing=null;
  if(operations.length) {
    const operation=get(operations[0]);
    if(operation.type!==IFC.IFCMAPCONVERSION||reference(operation.SourceCRS)!==context.expressID)throw Error('A operação existente usa outro contexto, IfcRigidOperation ou escala por eixo. Esta edição aceita apenas IfcMapConversion simples.');
    const target=get(reference(operation.TargetCRS));
    if(target?.type!==IFC.IFCPROJECTEDCRS||!target.MapUnit)throw Error('O CRS existente não é projetado ou não declara MapUnit. Reexporte uma referência inequívoca.');
    const mapUnit=lengthUnit(get(reference(target.MapUnit)),IFC);
    if(mapUnit.metresPerUnit!==1)throw Error('O CRS projetado existente deve declarar MapUnit METRE, sem prefixo.');
    const scale=Number(value(operation.Scale)??1);
    if(!Number.isFinite(scale)||Math.abs(scale/sourceUnit.metresPerUnit-1)>1e-9)throw Error('A operação existente inclui escala física ou escala de unidade inconsistente. Esta edição preserva a escala física 1:1.');
    const a=Number(value(operation.XAxisAbscissa)??1),b=Number(value(operation.XAxisOrdinate)??0);
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.hypot(a,b)<1e-12)throw Error('Eixo horizontal inválido na referência existente.');
    const east=Number(value(operation.Eastings)),north=Number(value(operation.Northings)),height=Number(value(operation.OrthogonalHeight));
    if(![east,north,height].every(Number.isFinite))throw Error('A referência existente tem coordenadas inválidas.');
    const name=value(target.Name)||'',epsgMatch=/^EPSG:(\d+)$/i.exec(name);
    existing={operationId:operation.expressID,crsId:target.expressID,name,epsg:epsgMatch?Number(epsgMatch[1]):null,
      easting:east,northing:north,height,rotation:Math.atan2(b,a)*180/Math.PI,verticalDatum:value(target.VerticalDatum)||''};
  }
  const metreUnitId=ids(api,model,IFC.IFCSIUNIT).find(id=>{
    const u=get(id);return value(u.UnitType)==='LENGTHUNIT'&&value(u.Name)==='METRE'&&!value(u.Prefix);
  })||null;
  return {schema,projectId:project.expressID,contextId:context.expressID,unit:sourceUnit.label,metresPerUnit:sourceUnit.metresPerUnit,metreUnitId,
    existing,entities:index.records.size,trueNorth:context.TrueNorth?vector(get(reference(context.TrueNorth))?.DirectionRatios):null};
}
