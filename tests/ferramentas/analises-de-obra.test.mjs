import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TOOLS } from "../../ferramentas/analises-de-obra/catalogo.mjs";
import { evaluateTool, numberBR, parseSheet, asText } from "../../ferramentas/analises-de-obra/motor.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const vendor=readFileSync(resolve(root,"ferramentas/analises-de-obra/vendor/papaparse.min.js"),"utf8");
const context={};
runInNewContext(vendor,context);
const papa=context.Papa;
const today="2026-11-21";
const report=(id,values)=>evaluateTool(id,values,{papa,now:today});
const values=tool=>Object.fromEntries(tool.fields.map(f=>[f.key,f.example]));

test("48 serviços independentes, identificadores únicos e amostras executáveis",()=>{
  assert.equal(TOOLS.length,48);
  assert.equal(new Set(TOOLS.map(t=>t.id)).size,48);
  assert.equal(new Set(TOOLS.map(t=>t.title)).size,48);
  for(const tool of TOOLS){
    const result=report(tool.id,values(tool));
    assert.equal(result.toolId,tool.id);
    assert.ok(result.metrics.length>0,tool.id+" sem métricas");
    assert.ok(result.lines.length>0,tool.id+" sem conclusão");
    assert.ok(result.caveat.length>25,tool.id+" sem limites");
    assert.match(asText(result,today),/CONFENGE/);
    assert.doesNotMatch(asText(result,today),/undefined|NaN|Infinity/);
  }
});
test("preço de honorários respeita margem sobre receita",()=>{
  const r=report("precificar-honorarios",values(TOOLS.find(t=>t.id==="precificar-honorarios")));
  assert.match(r.metrics[1].value,/5\.714,29/);
  assert.match(r.metrics[3].value,/1\.428,57/);
});
test("reajuste não incide sobre a parcela inelegível",()=>{
  const v=values(TOOLS.find(t=>t.id==="reajustar-contrato"));
  v.elegivel="50";
  const r=report("reajustar-contrato",v);
  assert.match(r.metrics[2].value,/5\.000,00/);
});
test("medição identifica extrapolação e calcula período",()=>{
  let v=values(TOOLS.find(t=>t.id==="conferir-medicao"));
  let r=report("conferir-medicao",v);
  assert.match(r.metrics[0].value,/8\.700,00/);
  assert.equal(r.alerts.length,0);
  v.tabela=v.tabela.replace("100;25;15","100;90;15");
  r=report("conferir-medicao",v);
  assert.match(r.alerts[0],/excede/);
});
test("auditoria de orçamento detecta subtotal, duplicidade e item zerado",()=>{
  const v={tabela:"codigo;descricao;unidade;quantidade;preco_unitario;total\n01;Concreto;m3;10;500;4000\n01;Concreto;m3;0;500;0"};
  const r=report("auditar-orcamento",v);
  assert.ok(r.lines.some(x=>/subtotal/.test(x)));
  assert.ok(r.lines.some(x=>/repetido/.test(x)));
  assert.ok(r.lines.some(x=>/zerado/.test(x)));
});
test("CSV com vírgula decimal e descrições entre aspas",()=>{
  const rows=parseSheet('codigo;descricao;quantidade;preco_unitario\n01;"Argamassa; colante";1.234,50;7,20',papa,["codigo","descricao","quantidade","preco_unitario"]);
  assert.equal(rows[0].descricao,"Argamassa; colante");
  assert.equal(numberBR(rows[0].quantidade),1234.50);
  assert.equal(numberBR(rows[0].preco_unitario),7.2);
});
test("CSV não injeta chaves extras nem altera protótipos",()=>{
  const rows=parseSheet("codigo;__proto__;quantidade;preco_unitario\\nA;polluted;2;3".replace("\\n","\n"),
    papa,["codigo","quantidade","preco_unitario"]);
  assert.equal(Object.getPrototypeOf(rows[0]),null);
  assert.equal(Object.hasOwn(rows[0],"proto"),false);
  assert.equal(rows[0].quantidade,"2");
  assert.equal({}.polluted,undefined);
});
test("comparador de edital não confunde alteração com igualdade",()=>{
  const r=report("comparar-edital",{antes:"CAT exigida\nPrazo 30",depois:"CAT exigida\nPrazo 45"});
  assert.equal(r.metrics[0].value,"1");
  assert.equal(r.metrics[1].value,"1");
  assert.ok(r.lines.some(line=>line.includes("Prazo 45")));
});
test("CSV truncado, datas ruins e percentuais impraticáveis são rejeitados",()=>{
  assert.throws(()=>report("auditar-orcamento",{tabela:"codigo;descricao\n01;A"}),/Faltam colunas/);
  assert.throws(()=>report("precificar-honorarios",{horas:"1",custo_hora:"1",despesas:"0",tributos:"70",margem:"40"}),/inferior a 100/);
  assert.throws(()=>report("prazos-documentais",{tabela:"documento;validade;responsavel\nA;2026-02-30;B",antecedencia:"30"}),/data válida/);
});
test("a saída não reivindica revisão profissional nem expõe dados em analytics",()=>{
  const app=readFileSync(resolve(root,"ferramentas/analises-de-obra/aplicativo.mjs"),"utf8");
  const html=readFileSync(resolve(root,"ferramentas/analises-de-obra/index.html"),"utf8");
  assert.match(html,/CONFENGE/);
  assert.match(html,/noindex,follow/);
  assert.match(html,/logo-confenge-500-f8a83f6d/);
  assert.match(html,/id="formulario" method="post"/);
  assert.match(app,/credits\.deliverLocal\(preparedExport\)/);
  assert.match(app,/if \(!await credits\.ready\(\)\)/);
  assert.match(html,/header class="site-header"/);
  assert.match(html,/footer class="site-footer"/);
  assert.doesNotMatch(app,/innerHTML\s*=/);
  assert.doesNotMatch(app,/localStorage|sessionStorage/);
  assert.match(app,/tool_complete/);
  const reportText=asText(report("reajustar-contrato",values(TOOLS.find(t=>t.id==="reajustar-contrato"))),today);
  assert.match(reportText,/não constitui aprovação ou responsabilidade técnica/);
});
