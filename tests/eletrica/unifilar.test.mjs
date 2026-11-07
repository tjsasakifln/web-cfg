import {test} from 'node:test';import assert from 'node:assert/strict';
import {compilar,normalizar,svgDiagrama,exemplo,portas} from '../../ferramentas/diagrama-unifilar/modelo.js';
test('quadro de dois ramais: seis ligações e quatro nós, inclusive derivações no barramento',()=>{
 const d=exemplo(),m=compilar(d);assert.deepEqual(m.diagnostics,[]);assert.equal(m.nodes.size,4);assert.equal(m.wireRenders.size,6);
 assert.equal(m.terminalToNode.get('E3'),m.terminalToNode.get('E5.t1'));assert.notEqual(m.terminalToNode.get('E3'),m.terminalToNode.get('E5.t2'));
 assert.deepEqual(normalizar(JSON.parse(JSON.stringify(d))),d);
});
test('símbolo ligado segue a posição ao editar e exportar',()=>{
 const d=exemplo();const before=compilar(d);d.equipamentos[0].x+=25;
 assert.equal(compilar(d).terminals.get('E1.t_bottom').world[0]-before.terminals.get('E1.t_bottom').world[0],25);
 assert.notDeepEqual(compilar(d).wireRenders.get('W1').path,before.wireRenders.get('W1').path);
 assert.equal((svgDiagrama(d).match(/<polyline data-ligacao=/g)||[]).length,6);
});
test('projeto rejeita conexão inválida, duplicada, ID repetido, símbolo desconhecido ou posição fora da folha',()=>{
 for(const change of [d=>d.ligacoes.push(['E2.x','E3']),d=>d.ligacoes.push(['E3','E2.t2']),d=>d.ligacoes.push(['E2.t1','E2.t2']),d=>d.equipamentos[0].id='E2',d=>d.equipamentos[0].tipo='script',d=>d.equipamentos[0].x=NaN]){
 const d=exemplo();change(d);assert.throws(()=>normalizar(d));}
 assert.equal(portas(exemplo().equipamentos[1]).length,2);
});
test('rótulos e título permanecem texto no SVG exportado',()=>{
 const d=exemplo();d.titulo='<img src=x>';d.equipamentos[0].nome='<script>alert(1)</script>';
 const s=svgDiagrama(d);assert.ok(!s.includes('<script>'));assert.match(s,/&lt;script&gt;/);assert.match(s,/&lt;img/);
});
