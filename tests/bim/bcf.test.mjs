import test from 'node:test';import assert from 'node:assert/strict';
import {readBimSource} from '../../scripts/bim/read-source.mjs';
const source=readBimSource('web/bcf-core.mjs');
const {bcfFiles,validIfcGuid}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const topic={id:'12345678-1234-1234-1234-123456789abc',viewpoint:'abcdef01-1234-1234-1234-123456789abc',title:'Conferir <parede>',author:'Engenheiro & equipe',description:'Abertura de 1,20 m',created:'2026-11-10T12:00:00Z',components:[{guid:'2nvdaQANHTmf62$TWsLWgo',file:'modelo.ifc',expressId:27,name:'Parede norte',class:'IfcWall'}]};
test('BCF 2.1 has a valid topic and selection-only viewpoint structure',()=>{
  const files=bcfFiles([topic],[{name:'modelo.ifc'}]);
  assert.equal(Object.keys(files).length,3);assert.match(files['bcf.version'],/VersionId="2.1"/);
  const markup=files[topic.id+'/markup.bcf'];assert.match(markup,/<Title>Conferir &lt;parede&gt;<\/Title>/);assert.match(markup,/<CreationDate>.*<\/CreationDate><CreationAuthor>Engenheiro &amp; equipe/);
  assert.match(markup,new RegExp('<Viewpoints Guid="'+topic.viewpoint+'">'));
  const view=files[topic.id+'/viewpoint.bcfv'];assert.ok(view.includes('IfcGuid="'+topic.components[0].guid+'"'));assert.match(view,/<\/Selection><Visibility DefaultVisibility="true"\/>/);assert.ok(!view.includes('Camera'));
});
test('general issue omits viewpoint rather than inventing selected components',()=>{
  const files=bcfFiles([{...topic,components:[]}],[]);assert.equal(Object.keys(files).length,2);assert.ok(!files[topic.id+'/markup.bcf'].includes('<Viewpoints'));
});
test('malformed/duplicate identifiers and empty authors cannot produce BCF',()=>{
  assert.ok(validIfcGuid(topic.components[0].guid));assert.equal(validIfcGuid('x'.repeat(22)),false);
  assert.throws(()=>bcfFiles([{...topic,author:''}],[]));assert.throws(()=>bcfFiles([{...topic,id:'../../x'}],[]));
  assert.throws(()=>bcfFiles([{...topic,components:[...topic.components,...topic.components]}],[]));
  assert.throws(()=>bcfFiles([topic,topic],[]));
});
test('invalid XML characters from model names are removed without dropping valid Unicode',()=>{
  const files=bcfFiles([{...topic,title:'Assunto\uFFFF 🧱',components:[{...topic.components[0],name:'Parede\u0001\uD800 🧱'}]}],[]);
  const xml=files[topic.id+'/markup.bcf'];assert.ok(!/[\u0001\uFFFF\uD800]/.test(xml));assert.ok(xml.includes('🧱'));
});
