import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../../ferramentas/analises-de-obra/catalogo.mjs";
import { SECOND_WAVE } from "../../ferramentas/analises-de-obra/onda-2.mjs";
import { evaluateTool, asText } from "../../ferramentas/analises-de-obra/motor.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const script=readFileSync(resolve(root,"ferramentas/analises-de-obra/vendor/papaparse.min.js"),"utf8");
const context={};runInNewContext(script,context);
const papa=context.Papa;
const referenceDate="2026-11-21";
const tool=id=>SECOND_WAVE.find(x=>x.id===id);
const values=id=>Object.fromEntries(tool(id).fields.map(f=>[f.key,f.example]));
const execute=(id,params=values(id))=>evaluateTool(id,params,{papa,now:referenceDate});
const has=(r,v)=>r.metrics.some(x=>String(x.value).includes(v)||String(x.label).includes(v))||r.lines.some(x=>String(x).includes(v))||
  r.alerts.some(x=>String(x).includes(v));

test("a segunda onda adiciona exatamente 24 ferramentas exclusivas, sem duplicar a primeira",()=>{
  assert.equal(SECOND_WAVE.length,24);
  assert.equal(TOOLS.length,48);
  assert.equal(new Set(TOOLS.map(x=>x.id)).size,48);
  for(const item of SECOND_WAVE){
    assert.match(item.id,/^[a-z0-9-]+$/);
    assert.ok(item.title.length>12);
    assert.ok(item.caveat.length>42);
    assert.ok(item.fields.some(x=>x.kind==="sheet"||x.kind==="number"));
    for(const field of item.fields)assert.ok(typeof field.example==="string");
  }
});
test("as 24 amostras sintéticas executam e geram resultados completos sem não-finitos",()=>{
  for(const item of SECOND_WAVE){
    const r=execute(item.id);
    assert.equal(r.toolId,item.id);
    assert.ok(r.lines.length>0,item.id+" sem conclusões");
    assert.ok(r.metrics.length>0,item.id+" sem métricas");
    const body=asText(r,referenceDate);
    assert.match(body,/CONFENGE/);
    assert.match(body,/não constitui aprovação ou responsabilidade técnica/);
    assert.doesNotMatch(body,/\b(?:NaN|Infinity|undefined)\b/,item.id);
  }
});
test("revisão orçamentária apresenta valor e mudanças de inclusões ou exclusões",()=>{
  const r=execute("comparar-revisoes-orcamento");
  assert.ok(has(r,"1.160,00"));
  assert.ok(has(r,"Removido 02"));
  assert.ok(has(r,"Adicionado 03"));
  assert.throws(()=>execute("comparar-revisoes-orcamento",{
    anterior:"codigo;descricao;quantidade;preco_unitario\n01;A;1;10\n01;A;1;10",
    atual:values("comparar-revisoes-orcamento").atual
  }),/duplicada/);
});
test("desvio econômico por serviço preserva o sinal, e despesas reais não são tratadas como faturamento",()=>{
  const r=execute("previsto-realizado-obra");
  assert.ok(has(r,"1.600,00"));
  assert.ok(r.alerts.some(x=>x.includes("Concreto")));
  assert.ok(has(execute("desvios-precos-unitarios"),"1.500,00"));
});
test("conciliação de pedido e nota registra diferença de quantidade e preço",()=>{
  const r=execute("conciliar-pedidos-notas");
  assert.ok(has(r,"54,00"));
  assert.ok(r.lines.some(x=>x.includes("MAT-1")));
  assert.ok(r.lines.some(x=>x.includes("MAT-2")));
});
test("lote mínimo e logística avaliam efetivamente custo total de alternativas",()=>{
  let r=execute("compra-por-volume");
  assert.ok(has(r,"2.180,00"));
  assert.ok(has(r,"Fornecedor de menor dispêndio"));
  r=execute("comparar-logistica-entregas");
  assert.ok(has(r,"850,00"));
  assert.match(r.lines[1],/dias/);
  assert.throws(()=>execute("compra-por-volume",{demanda:"0",tabela:values("compra-por-volume").tabela}),/maior que zero/);
});
test("ponto de pedido, autonomia e falta antes da entrega são consistentes",()=>{
  const r=execute("reposicao-estoque-obra");
  assert.ok(has(r,"132 unidades"));
  const low=values("reposicao-estoque-obra");low.estoque="10";
  const a=execute("reposicao-estoque-obra",low);
  assert.ok(a.alerts.some(x=>/falta/.test(x)));
  assert.throws(()=>execute("reposicao-estoque-obra",{...low,consumo_dia:"0"}),/maior que zero/);
});
test("desconto excessivo revela contribuição negativa sem sugerir preço inexequível legalmente",()=>{
  const r=execute("simular-desconto-proposta");
  assert.ok(r.alerts.some(x=>/negativa/.test(x)));
  assert.ok(r.metrics.some(x=>x.label==="Margem sobre receita"));
});
test("manutenção e garantia usam calendário real, sem inventar periodicidades normativas",()=>{
  const maintenance=execute("manutencao-predial-agenda");
  assert.ok(has(maintenance,"Atrasadas"));
  const warranty=execute("garantias-construtivas");
  assert.ok(has(warranty,"Sem documento"));
  assert.throws(()=>execute("manutencao-predial-agenda",{
    tabela:"sistema;atividade;ultima_execucao;frequencia_dias;custo_previsto\nE;Teste;2026-02-30;30;2"
  }),/data válida/);
});
test("fundo de reserva soma contribuições sem supor recebimentos fora do horizonte",()=>{
  const r=execute("fundo-reserva-predial");
  assert.ok(has(r,"14.500,00"));
  assert.throws(()=>execute("fundo-reserva-predial",{
    ...values("fundo-reserva-predial"),tabela:"competencia;despesa\n2027-01;5\n2027-01;7"
  }),/duplicada/);
});
test("monitor de fissuras usa somente medições numéricas e aponta série incompleta",()=>{
  const r=execute("monitorar-fissuras");
  assert.ok(has(r,"0,15 mm"));
  assert.ok(has(r,"somente uma leitura"));
  assert.throws(()=>execute("monitorar-fissuras",{
    tabela:"ponto;data;abertura_mm\nF01;2026-11-01;0,1\nF01;2026-11-01;0,2"
  }),/duplicada/);
});
test("triagem de patologias rejeita escores fora da escala e não afirma diagnóstico",()=>{
  const r=execute("mapa-patologias-edificio");
  assert.ok(has(r,"12/25"));
  assert.throws(()=>execute("mapa-patologias-edificio",{
    tabela:"ambiente;elemento;manifestacao;gravidade;frequencia;evidencia\nA;B;C;9;2;IMG"
  }),/inteiros/);
});
test("orçamento de reforma inclui perdas e reserva sem inventar preços de referência",()=>{
  const r=execute("orcamento-reforma-ambientes");
  assert.ok(has(r,"20.150,50"));
  assert.ok(has(r,"21.762,54"));
});
test("comparador de propostas recusa interpretação de equivalência entre unidades",()=>{
  const v=values("comparar-propostas-condominio");
  v.proposta_b=v.proposta_b.replace("Rufos;20;m;72","Rufos;20;m2;72");
  const r=execute("comparar-propostas-condominio",v);
  assert.ok(r.alerts.some(x=>/não é conclusiva/.test(x)));
  assert.ok(r.lines.some(x=>/unidades não equivalentes/.test(x)));
});
test("recebimento de imóvel e permissão de trabalho nunca são aceites ou autorizações formais",()=>{
  const a=execute("recebimento-imovel"),b=execute("checklist-permissao-trabalho");
  assert.ok(has(a,"Pendentes ou incompletos"));
  assert.ok(b.alerts.some(x=>/não libera trabalho/.test(x)));
  assert.match(asText(a,referenceDate),/aceite/);
});
test("matriz de riscos e controles são triagem numérica, não PGR homologado",()=>{
  const r=execute("matriz-riscos-atividade");
  assert.ok(r.lines.some(x=>/\/25/.test(x)));
  assert.match(r.caveat,/PGR/);
  assert.throws(()=>execute("matriz-riscos-atividade",{
    tabela:"atividade;perigo;probabilidade;gravidade;controle\nA;B;4;6;C"
  }),/inteiros/);
});
test("EPI, treinamentos e ações corretivas distinguem prazo e prova documental",()=>{
  for(const id of ["entrega-epi","agenda-treinamentos-sst","acoes-corretivas-sst"]){
    const r=execute(id);
    assert.ok(r.metrics.some(x=>/vencid|atrasad|trocas/i.test(x.label)),id);
    assert.ok(r.lines.length);
  }
});
test("revisões de pranchas rejeitam duplicidade e conflito de status",()=>{
  const a=values("controle-revisoes-pranchas");
  a.tabela+="\nHID;H-01;R01;2026-11-01;vigente";
  const r=execute("controle-revisoes-pranchas",a);
  assert.ok(r.alerts.some(x=>/duplicada/.test(x)));
});
test("aceite, contratação e faturamento permanecem conceitos diferentes",()=>{
  const r=execute("aceite-entregas-tecnicas");
  assert.ok(has(r,"Marcados aceitos com referência"));
  assert.match(r.method.join(" "),/faturamento/);
  assert.doesNotMatch(r.title,/pago|recebido/);
});
test("capacidade por profissional soma horas de tarefas uma única vez",()=>{
  const r=execute("capacidade-escritorio-projetos");
  assert.ok(has(r,"78"));
  assert.ok(r.lines.some(x=>/sobrecarga/.test(x)));
  const v=values("capacidade-escritorio-projetos");
  v.tabela=v.tabela.replace("Compatibilização;20;40","Compatibilização;20;30");
  assert.throws(()=>execute("capacidade-escritorio-projetos",v),/Capacidade divergente/);
});
test("a segunda onda compartilha carteira de créditos e não adiciona dependências ou dados a analytics",()=>{
  const app=readFileSync(resolve(root,"ferramentas/analises-de-obra/aplicativo.mjs"),"utf8");
  const page=readFileSync(resolve(root,"ferramentas/analises-de-obra/index.html"),"utf8");
  const first=readFileSync(resolve(root,"ferramentas/analises-de-obra/vendor/LICENSE-PAPAPARSE.txt"),"utf8");
  assert.match(app,/credits\.deliverLocal/);
  assert.match(page,/48 ferramentas/);
  assert.match(page,/noindex,follow/);
  assert.match(first,/MIT License/);
  assert.doesNotMatch(app,/innerHTML\s*=/);
  assert.equal(TOOLS.filter(x=>x.category==="Segurança e qualidade").length,5);
});
