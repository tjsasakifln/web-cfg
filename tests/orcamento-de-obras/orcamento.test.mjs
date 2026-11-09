import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exemplo, novaPlanilha, validarPlanilha, calcular, formatar, numeroBR, csv, lerComposicao} from '../../ferramentas/orcamento-de-obras/orcamento.js';
const it=()=>exemplo().itens[0], p=(items,bdi='0')=>({...novaPlanilha(),itens:items,bdi});
test('orçamento por etapa, composições, BDI em reais e fechamento',()=>{
 const p=exemplo(),r=calcular(p);
 assert.deepEqual(r.etapas,[{nome:'Preparação',total:'340.00'},{nome:'Acabamento',total:'1653.20'}]);
 assert.equal(r.linhas[1].unitario,'16.0000');assert.equal(r.direto,'1993.20');assert.equal(r.acrescimo,'398.64');assert.equal(r.total,'2391.84');assert.match(csv(p,r),/"1\.993,20"/);
});
test('arredonda uma única vez cada linha e fecha subtotais',()=>{
 const a={...it(),quantidade:'0.01',preco:'0.495'};const b={...it(),quantidade:'0.01',preco:'0.5'};
 const r=calcular(p([a,b,b], '25'));assert.deepEqual(r.linhas.map(x=>x.total),['0.00','0.01','0.01']);assert.equal(r.acrescimo,'0.01');assert.equal(r.total,'0.03');
});
test('decimal PT-BR, precisão, limites de nome, quantidade e decimais',()=>{
 assert.equal(numeroBR('1.234.567,8901','quantidade'), '1234567.8901');assert.equal(formatar('1234567.89',4),'1.234.567,8900');
 for(const s of ['', '-1','1.0','1e2','1,23456','1.20,01'])assert.throws(()=>numeroBR(s,'preço'));
 for(const k of [{...it(),quantidade:'0'},{...it(),fonte:'teste\tplanilha'},{...it(),preco:'-5'}])assert.throws(()=>calcular(p([k])));
 assert.throws(()=>validarPlanilha({...exemplo(),versao:999}));assert.throws(()=>calcular(p([it()],'1000')));
 assert.equal(calcular(novaPlanilha()).total,'0.00');
});
test('preserva código/referência SINAPI e composição em JSON, protege CSV',()=>{
 const linha={...it(),codigo:'001',fonte:'SINAPI SC · 09/2026 · sem desoneração',descricao:'=A1*2',preco:'0'};
 const saved=validarPlanilha(JSON.parse(JSON.stringify(p([linha,...exemplo().itens]))));
 assert.equal(saved.itens[0].fonte,linha.fonte);assert.equal(saved.itens[0].codigo,'001');assert.deepEqual(saved.itens[2].composicao,exemplo().itens[1].composicao);
 const s=csv(saved,calcular(saved));assert.ok(s.includes('"\'=A1*2"'));assert.ok(s.includes('"001"'));assert.ok(s.includes(linha.fonte));
 assert.equal(lerComposicao('material;Areia;m³;0,5;120,00')[0].coef,'0.5');
 assert.throws(()=>lerComposicao('material;faltam campos'));assert.throws(()=>validarPlanilha(p([{...linha,composicao:[]}])));
});
