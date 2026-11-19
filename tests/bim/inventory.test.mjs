import test from 'node:test';
import assert from 'node:assert/strict';
import {readBimSource} from '../../scripts/bim/read-source.mjs';
const source=readBimSource('web/inventario-core.mjs');
const {extrairInventario}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const V=value=>({value});
function model(){
  const names=['IFCELEMENT','IFCSPACE','IFCRELAGGREGATES','IFCRELNESTS','IFCRELCONTAINEDINSPATIALSTRUCTURE','IFCRELDEFINESBYTYPE','IFCRELASSIGNSTOGROUP','IFCRELDEFINESBYPROPERTIES','IFCPROPERTYSET','IFCPROPERTYSINGLEVALUE','IFCWALLTYPE','IFCBUILDINGSTOREY','IFCSYSTEM'];
  const IFC=Object.fromEntries(names.map((name,i)=>[name,i+1]));
  const data=new Map();const put=(id,name,values)=>data.set(id,{type:IFC[name],...values});
  put(1,'IFCELEMENT',{Name:V('Parede A'),GlobalId:V('2nvdaQANHTmf62$TWsLWgo'),Tag:V('P1')});
  put(2,'IFCELEMENT',{Name:V('Sem propriedades')});
  put(3,'IFCSPACE',{Name:V('Sala')});
  put(10,'IFCBUILDINGSTOREY',{Name:V('Térreo')});
  put(11,'IFCRELCONTAINEDINSPATIALSTRUCTURE',{RelatedElements:[V(1),V(2)],RelatingStructure:V(3)});
  put(12,'IFCRELAGGREGATES',{RelatedObjects:[V(3)],RelatingObject:V(10)});
  put(20,'IFCPROPERTYSINGLEVALUE',{Name:V('Série'),NominalValue:V('OCORRÊNCIA')});
  put(21,'IFCPROPERTYSINGLEVALUE',{Name:V('Meses'),NominalValue:V(0)});
  put(22,'IFCPROPERTYSINGLEVALUE',{Name:V('Externo'),NominalValue:V(false)});
  put(23,'IFCPROPERTYSET',{Name:V('FM'),HasProperties:[V(20),V(21),V(22)]});
  put(24,'IFCRELDEFINESBYPROPERTIES',{RelatedObjects:[V(1)],RelatingPropertyDefinition:{value:[V(23)]}});
  put(30,'IFCPROPERTYSINGLEVALUE',{Name:V('Série'),NominalValue:V('TIPO')});
  put(31,'IFCPROPERTYSET',{Name:V('FM'),HasProperties:[V(30)]});
  put(32,'IFCWALLTYPE',{Name:V('Tipo A'),HasPropertySets:[V(31)]});
  put(33,'IFCRELDEFINESBYTYPE',{RelatedObjects:[V(1)],RelatingType:V(32)});
  put(40,'IFCSYSTEM',{Name:V('Sistema A')});
  put(41,'IFCRELASSIGNSTOGROUP',{RelatedObjects:[V(1)],RelatingGroup:V(40)});
  return {IFC,data,api:{GetLine:(_,id)=>data.get(id),GetNameFromTypeCode:code=>names[code-1],GetLineIDsWithType:(_,type)=>{const list=[...data].filter(([,l])=>l.type===type).map(([id])=>id);return {size:()=>list.length,get:i=>list[i],delete(){}};}}};
}
test('inventory preserves occurrence/type conflicts, zero/false, spaces and systems',()=>{
  const {api,IFC}=model(), result=extrairInventario(api,0,IFC);
  assert.equal(result.records.length,3);assert.equal(result.rows.length,6);
  const series=result.rows.filter(r=>r.property==='Série');
  assert.deepEqual(series.map(r=>[r.origin,r.value]),[['ocorrencia','OCORRÊNCIA'],['tipo','TIPO']]);
  assert.equal(result.rows.find(r=>r.property==='Meses').value,0);
  assert.equal(result.rows.find(r=>r.property==='Externo').value,false);
  assert.match(result.records[0].spatial,/Sala.*Térreo/);
  assert.equal(result.records[0].groups[0].name,'Sistema A');
  assert.equal(result.summary.withoutProperties,2);
});
test('cyclic spatial references terminate without dropping the element',()=>{
  const {api,IFC,data}=model();data.set(99,{type:IFC.IFCRELAGGREGATES,RelatedObjects:[V(10)],RelatingObject:V(3)});
  const result=extrairInventario(api,0,IFC);assert.equal(result.records.length,3);assert.ok(result.records[0].spatial.length<100);
});
