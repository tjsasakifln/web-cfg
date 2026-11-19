import {pontoIfc} from './cortes-core.mjs';

const MAX_TRIANGLES=200000,MAX_ELEMENTS=6000;
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
const validGuid=value=>typeof value==='string'&&/^[0-3][0-9A-Za-z_$]{21}$/.test(value);
const key3=point=>point.join(',');
const sha256=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');

export function checkTolerance(value) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<.00001||value>.1)throw Error('Use tolerância entre 0,01 e 100 mm.');
  return value;
}

export async function meshHash(triangles,tolerance) {
  // A shared quantization cell implies a Euclidean distance <= tolerance.
  // Different hashes still pass through explicit tolerance matching below.
  const cell=checkTolerance(tolerance)/Math.sqrt(3),keys=[];
  for(let i=0;i<triangles.length;i+=9) {
    const vertices=[];
    for(let v=0;v<3;v++)vertices.push([0,1,2].map(a=>Math.round(triangles[i+3*v+a]/cell)).join(','));
    keys.push(vertices.sort().join(';'));
  }
  keys.sort();return sha256(keys.join('\n'));
}

export async function describeScene(scene,tolerance) {
  checkTolerance(tolerance);
  if(!scene.elements.length||scene.elements.length>MAX_ELEMENTS)throw Error('A comparação aceita de 1 a 6.000 elementos com geometria por arquivo.');
  const buffers=new Map(scene.buffers.map(b=>[b.key,b])),elements=new Map();let triangleCount=0;
  for(const element of scene.elements) {
    if(!validGuid(element.guid))throw Error(`O elemento #${element.id} não tem GlobalId IFC válido. Corrija a identidade antes de comparar.`);
    if(elements.has(element.guid))throw Error(`GlobalId repetido no modelo: ${element.guid}. A comparação não usa IDs de malha como substitutos.`);
    let count=0;
    for(const part of element.parts) {
      const buffer=buffers.get(part.key);
      if(!buffer||buffer.indices.length%3)throw Error('A malha contém índices de triângulos inválidos.');
      count+=buffer.indices.length/3;
    }
    triangleCount+=count;
    if(triangleCount>MAX_TRIANGLES)throw Error('A comparação ultrapassa 200.000 triângulos por arquivo. Exporte recortes por pavimento ou disciplina.');
    const world=new Float64Array(count*9),local=new Float64Array(count*9);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let cursor=0;
    for(const part of element.parts) {
      const buffer=buffers.get(part.key),m=part.matrix;
      if(!Array.isArray(m)||m.length!==16||m.some(v=>!Number.isFinite(v)))throw Error('Transformação geométrica inválida.');
      // Remove rotation/translation for the local-mesh comparison while
      // retaining each axis scale, including the IFC length-unit conversion.
      const scales=[0,1,2].map(axis=>Math.hypot(m[axis*4],m[axis*4+1],m[axis*4+2]));
      if(scales.some(v=>v<=0))throw Error('Transformação com eixo de escala nula.');
      for(const index of buffer.indices) {
        if(!Number.isInteger(index)||index<0||index*6+2>=buffer.vertices.length)throw Error('Índice de vértice inválido.');
        const placed=pontoIfc(buffer.vertices,index,m);
        for(let a=0;a<3;a++) {
          const value=buffer.vertices[index*6+a]*scales[a];
          if(!Number.isFinite(value)||Math.abs(value)>1e9)throw Error('Coordenada local inválida.');
          world[cursor+a]=placed[a];local[cursor+a]=value;
          min[a]=Math.min(min[a],placed[a]);max[a]=Math.max(max[a],placed[a]);
        }
        cursor+=3;
      }
    }
    if(!count)throw Error(`O elemento #${element.id} não contém triângulos comparáveis.`);
    const [worldHash,localHash]=await Promise.all([meshHash(world,tolerance),meshHash(local,tolerance)]);
    elements.set(element.guid,{guid:element.guid,id:element.id,name:element.name,class:element.ifcClass,
      triangles:count,world,local,worldHash,localHash,min,max});
  }
  return {elements,triangleCount};
}

const centroid=(mesh,id)=>[0,1,2].map(a=>(mesh[id*9+a]+mesh[id*9+3+a]+mesh[id*9+6+a])/3);
function sameTriangle(a,ia,b,ib,epsilon2) {
  for(const permutation of permutations) {
    let matches=true;
    for(let vertex=0;vertex<3;vertex++) {
      let distance=0;
      for(let axis=0;axis<3;axis++){const d=a[ia*9+vertex*3+axis]-b[ib*9+permutation[vertex]*3+axis];distance+=d*d;}
      if(distance>epsilon2){matches=false;break;}
    }
    if(matches)return true;
  }
  return false;
}

export function meshesWithinTolerance(a,b,tolerance,budget={checks:0}) {
  checkTolerance(tolerance);
  if(a.length!==b.length)return false;
  const count=a.length/9,grid=new Map(),cache=new Map(),epsilon2=tolerance*tolerance*(1+1e-12);
  const spend=()=>{if(++budget.checks>2000000)throw Error('A correspondência por tolerância ficou muito densa. Use uma tolerância menor ou um recorte do modelo.');};
  for(let i=0;i<count;i++) {
    const key=key3(centroid(b,i).map(v=>Math.floor(v/tolerance)));
    if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
  }
  const candidates=id=>{
    if(cache.has(id))return cache.get(id);
    const cell=centroid(a,id).map(v=>Math.floor(v/tolerance)),found=[];
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
      for(const other of grid.get(key3([cell[0]+x,cell[1]+y,cell[2]+z]))||[]) {
        spend();if(sameTriangle(a,id,b,other,epsilon2))found.push(other);
      }
    }
    cache.set(id,found);return found;
  };
  // A bijective matching avoids greedy false differences when several nearby
  // triangles fall within tolerance. Iterative augmentation has no recursion.
  const matchA=new Int32Array(count).fill(-1),matchB=new Int32Array(count).fill(-1);
  for(let root=0;root<count;root++) {
    const queue=[root],seenA=new Set([root]),parentB=new Map();let free=-1;
    for(let head=0;head<queue.length&&free<0;head++) {
      const current=queue[head];
      for(const target of candidates(current)) {
        spend();if(parentB.has(target))continue;parentB.set(target,current);
        if(matchB[target]<0){free=target;break;}
        if(!seenA.has(matchB[target])){seenA.add(matchB[target]);queue.push(matchB[target]);}
      }
    }
    if(free<0)return false;
    for(let target=free;target>=0;) {
      const current=parentB.get(target),previous=matchA[current];
      matchA[current]=target;matchB[target]=current;target=previous;
    }
  }
  return true;
}

const record=element=>element?{id:element.id,name:element.name,class:element.class,triangles:element.triangles,
  min:element.min,max:element.max,worldHash:element.worldHash,localHash:element.localHash}:null;

export function compareScenes(before,after,tolerance) {
  checkTolerance(tolerance);const budget={checks:0},rows=[],counts={added:0,removed:0,modified:0,same:0};
  const guids=[...new Set([...before.elements.keys(),...after.elements.keys()])].sort();
  for(const guid of guids) {
    const a=before.elements.get(guid),b=after.elements.get(guid);let status,change='',worldEquivalent=false;
    if(!a)status='added';
    else if(!b)status='removed';
    else {
      worldEquivalent=a.worldHash===b.worldHash||meshesWithinTolerance(a.world,b.world,tolerance,budget);
      if(worldEquivalent)status='same';
      else {
        status='modified';
        const localEquivalent=a.localHash===b.localHash||meshesWithinTolerance(a.local,b.local,tolerance,budget);
        change=localEquivalent?'transform':'mesh';
      }
    }
    counts[status]++;
    const centerDelta=a&&b?[0,1,2].map(i=>(b.min[i]+b.max[i]-a.min[i]-a.max[i])/2):null;
    rows.push({guid,status,change,before:record(a),after:record(b),centerDelta,worldEquivalent});
  }
  return {counts,rows,toleranceMetres:tolerance,candidateChecks:budget.checks};
}
