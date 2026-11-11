// Engineering coordinates -> projected coordinates. No datum transformation.
// Physical scale stays one; IfcMapConversion.Scale converts the source unit to m.
export const crsSirgas = [
  ...Array.from({length:8}, (_, i) => ({code:31978+i,zone:18+i,hemisphere:'S'})),
  ...Array.from({length:5}, (_, i) => ({code:31972+i,zone:18+i,hemisphere:'N'})),
];

export function crsFromCode(code) {
  const crs = crsSirgas.find(item => item.code === code);
  if (!crs) throw Error('Selecione um EPSG SIRGAS 2000 / UTM da lista.');
  return crs;
}

export function finiteNumber(value, low, high, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw Error(`${label}: informe um número entre ${low} e ${high}.`);
  }
  return value;
}

export function validateParameters(input) {
  const crs = crsFromCode(input.epsg);
  const easting = finiteNumber(input.easting,100000,900000,'E da origem (m)');
  const northing = finiteNumber(input.northing,0,10000000,'N da origem (m)');
  const height = finiteNumber(input.height,-2000,10000,'H da origem (m)');
  const rotation = finiteNumber(input.rotation,-180,180,'Rotação (graus)');
  const verticalDatum = input.verticalDatum ?? '';
  if (typeof verticalDatum !== 'string' || verticalDatum.length > 100 || /[\u0000-\u001f\u007f]/.test(verticalDatum)) {
    throw Error('A referência vertical deve ter até 100 caracteres sem controles.');
  }
  return {...crs,epsg:crs.code,easting,northing,height,rotation,verticalDatum:verticalDatum.trim(),physicalScale:1};
}

export function mapPoint(point, parameters, metresPerUnit=1) {
  const angle=parameters.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const [x,y,z]=point.map(v=>v*metresPerUnit);
  return [parameters.easting+c*x-s*y,parameters.northing+s*x+c*y,parameters.height+z];
}

export function readControlPoints(text) {
  if (typeof text !== 'string' || text.length > 12000) throw Error('Use até 30 pontos de controle.');
  const lines=text.trim().split(/\r?\n/);
  if (lines.length<3 || lines.length>30) throw Error('Informe de 3 a 30 pontos não colineares.');
  return lines.map((line,index)=>{
    const values=line.trim().split(/[;\t]/).map(value=>value.trim());
    if(values.length!==6 || values.some(value=>!/^[-+]?\d+(?:[.,]\d+)?$/.test(value))) {
      throw Error(`Linha ${index+1}: use x; y; z; E; N; H, sem cabeçalho nem separador de milhar.`);
    }
    return values.map(value=>Number(value.replace(',','.')));
  });
}

export function fitControlPoints(points, metresPerUnit) {
  finiteNumber(metresPerUnit,0.001,1,'Unidade do IFC');
  if (!Array.isArray(points) || points.length<3 || points.length>30) throw Error('Use de 3 a 30 pontos de controle.');
  const pairs=points.map((row,index)=>{
    if(!Array.isArray(row)||row.length!==6) throw Error(`Ponto ${index+1}: informe as seis coordenadas.`);
    const local=row.slice(0,3).map(v=>finiteNumber(v,-50000/metresPerUnit,50000/metresPerUnit,'Coordenada local')*metresPerUnit);
    const target=[finiteNumber(row[3],100000,900000,'E (m)'),finiteNumber(row[4],0,10000000,'N (m)'),finiteNumber(row[5],-2000,10000,'H (m)')];
    return {local,target};
  });
  if(new Set(pairs.map(p=>p.local.join(','))).size!==pairs.length) throw Error('Há pontos locais repetidos.');
  const mean=key=>[0,1,2].map(axis=>pairs.reduce((sum,p)=>sum+p[key][axis],0)/pairs.length);
  const pbar=mean('local'),qbar=mean('target');
  let dot=0,cross=0,xx=0,xy=0,yy=0;
  for(const {local:p,target:q} of pairs) {
    const x=p[0]-pbar[0],y=p[1]-pbar[1],e=q[0]-qbar[0],n=q[1]-qbar[1];
    dot+=x*e+y*n;cross+=x*n-y*e;xx+=x*x;xy+=x*y;yy+=y*y;
  }
  const spread=xx+yy;
  if(spread<1 || xx*yy-xy*xy<=spread*spread*1e-10 || Math.hypot(dot,cross)<1e-12) {
    throw Error('Distribua os pontos em duas direções, com afastamento de pelo menos 1 m. Pontos colineares não são aceitos.');
  }
  const angle=Math.atan2(cross,dot),c=Math.cos(angle),s=Math.sin(angle);
  const parameters={easting:qbar[0]-c*pbar[0]+s*pbar[1],northing:qbar[1]-s*pbar[0]-c*pbar[1],height:qbar[2]-pbar[2],rotation:angle*180/Math.PI,physicalScale:1};
  const residuals=pairs.map(({local,target},index)=>{
    const predicted=mapPoint(local,parameters),residual=predicted.map((v,i)=>v-target[i]);
    return {point:index+1,localMetres:local,target,predicted,residual,horizontal:Math.hypot(residual[0],residual[1])};
  });
  return {parameters,residuals,
    rmsHorizontal:Math.sqrt(residuals.reduce((sum,r)=>sum+r.horizontal**2,0)/pairs.length),
    rmsHeight:Math.sqrt(residuals.reduce((sum,r)=>sum+r.residual[2]**2,0)/pairs.length),
    maxHorizontal:Math.max(...residuals.map(r=>r.horizontal)),
    maxHeight:Math.max(...residuals.map(r=>Math.abs(r.residual[2]))),
  };
}
