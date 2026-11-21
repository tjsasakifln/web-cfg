import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IfcDocument,parseIfc,decodeStep,encodeStep} from '../../ferramentas/editor-ifc/ifc-document.mjs';

const fixture=readFileSync(new URL('../../scripts/bim/overrides/examples/inventario-piloto.ifc',import.meta.url),'utf8');

test('abrir IFC4 com geometria e propriedades existentes',()=>{
  const doc=new IfcDocument(fixture);
  assert(doc.count>=70);
  assert.equal(doc.record(27).type,'IFCWALL');
  assert.equal(doc.elements().find(x=>x.id===27).name,'Parede norte');
  const props=doc.properties(27);
  assert.equal(props.find(x=>x.name==='Manufacturer').value,'Fabricante da ocorrencia');
  assert.equal(props.find(x=>x.name==='WarrantyMonths').value,'0');
  assert.equal(props.find(x=>x.name==='IsExternal').value,'false');
  assert.equal(props.find(x=>x.name==='Manufacturer').editable,true);
});
test('alteracoes nao reserializam a geometria nem outros registros',()=>{
  const doc=new IfcDocument(fixture);
  doc.setName(27,"Parede d'água");
  doc.setDescription(27,'Uso interno');
  doc.setProperty(27,100,'Fabricante CONFENGE');
  doc.setProperty(27,101,'24');
  doc.setProperty(27,102,'true');
  const text=doc.exportText();
  const updated=new IfcDocument(text);
  assert.equal(updated.elements().find(x=>x.id===27).name,"Parede d'água");
  assert.equal(updated.elements().find(x=>x.id===27).description,'Uso interno');
  assert.equal(updated.properties(27).find(p=>p.id===100).value,'Fabricante CONFENGE');
  assert.equal(updated.properties(27).find(p=>p.id===101).value,'24');
  assert.equal(updated.properties(27).find(p=>p.id===102).value,'true');
  for(const id of [1,5,13,18,21,22,23,26,28,31,47,53,59,64,107,110]){
    const a=parseIfc(fixture).records.get(id),b=parseIfc(text).records.get(id);
    assert.equal(fixture.slice(a.start,a.end),text.slice(b.start,b.end),'registro intocado #'+id);
  }
});
test('desfazer e refazer preservam alteracoes em memoria',()=>{
  const doc=new IfcDocument(fixture);
  doc.setName(27,'Editado');doc.setProperty(27,101,'12');
  assert.equal(doc.edits.size,2);
  doc.undo();assert.equal(doc.edits.size,1);
  doc.undo();assert.equal(doc.changed,false);
  doc.redo();doc.redo();assert.equal(doc.edits.size,2);
  doc.setName(27,'Parede norte');assert.equal(doc.edits.size,1);
  assert.equal(doc.canRedo,false);
});
test('propriedade compartilhada ou de tipo nao e editada',()=>{
  const shared=fixture.replace("(#27),#103);","(#27,#47),#103);");
  const doc=new IfcDocument(shared);
  assert.equal(doc.properties(27).find(p=>p.id===100).editable,false);
  assert.throws(()=>doc.setProperty(27,100,'invasao'),/compartilhada/);
  assert(!doc.properties(27).some(p=>p.id===105),'Pset de tipo nao se apresenta como ocorrencia');
});
test('validacao estrita de tipo, limite e sintaxe',()=>{
  const doc=new IfcDocument(fixture);
  assert.throws(()=>doc.setProperty(27,101,'2.5'),/inteiro/);
  assert.throws(()=>doc.setProperty(27,102,'talvez'),/verdadeiro/);
  assert.throws(()=>doc.setName(27,'X'.repeat(201)),/200/);
  assert.throws(()=>parseIfc('abc'),/Arquivo IFC/);
  assert.throws(()=>parseIfc(fixture.replace('IFC4','XYZ')),/Esquema IFC/);
  assert.throws(()=>parseIfc(fixture.replace('#110=IFCRELASSIGNSTOGROUP','#27=IFCRELASSIGNSTOGROUP')),/repetido/);
});
test('STEP codifica acentos e aspas sem perder valor',()=>{
  const text="São José d'Água";
  const encoded=encodeStep(text);
  assert(!encoded.includes('José'));
  assert.equal(decodeStep(encoded),text);
});

test('STEP preserva barras literais e não transforma escapes Unicode escritos pelo usuário',()=>{
  for (const value of [String.raw`C:\Projetos\Hospital`, String.raw`\X2\0041\X0\`]) {
    assert.equal(decodeStep(encodeStep(value)),value);
    const doc=new IfcDocument(fixture);
    doc.setName(27,value);
    assert.equal(new IfcDocument(doc.exportText()).elements().find(x=>x.id===27).name,value);
  }
});
