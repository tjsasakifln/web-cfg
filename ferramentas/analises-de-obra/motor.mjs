import { secondWaveCalculators } from "./onda-2-motor.mjs";
import { getTool } from "./catalogo.mjs";

// Cálculos executados localmente. Dados e planilhas não são enviados ao servidor.
const br = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const money = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const pct = v => br.format(v) + "%";
const qty = v => br.format(v);
const round = v => Math.round((v + Number.EPSILON) * 100) / 100;

export function numberBR(input, name = "Valor") {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Math.abs(input) > 1e13) throw new Error(name + ": valor fora do intervalo.");
    return input;
  }
  const raw = String(input ?? "").trim().replace(/[\s\u00a0R$%]/g, "");
  if (!raw || !/^-?[\d.,]+$/.test(raw)) throw new Error(name + ": informe um número válido.");
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw) && !/^-?0\./.test(raw)) normalized = raw.replace(/\./g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || Math.abs(n) > 1e13) throw new Error(name + ": valor fora do intervalo.");
  return n;
}

export function parseSheet(source, papa, required = []) {
  const text = String(source ?? "");
  if (!text.trim()) throw new Error("Cole uma tabela com cabeçalho e linhas de dados.");
  if (text.length > 700000) throw new Error("A tabela ultrapassa 700 KB. Divida em lotes menores.");
  if (!papa || typeof papa.parse !== "function") throw new Error("O leitor de CSV não foi carregado.");
  const parsed = papa.parse(text, { header: true, skipEmptyLines: "greedy", delimiter: "", dynamicTyping: false });
  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error("CSV inválido: " + (first.message || "erro na leitura") + " na linha " + (Number(first.row || 0) + 2) + ".");
  }
  if (!parsed.data.length || parsed.data.length > 2500) throw new Error("Use entre 1 e 2.500 linhas por análise.");
  const key = name => String(name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const headers = parsed.meta.fields.map(key);
  if (new Set(headers).size !== headers.length || headers.some(name => !/^[a-z][a-z0-9_]{0,60}$/.test(name)))
    throw new Error("Cabeçalhos duplicados, vazios ou inválidos.");
  const absent = required.filter(name => !headers.includes(name));
  if (absent.length) throw new Error("Faltam colunas: " + absent.join(", ") + ".");
  // Só projetar campos declarados pelo motor. Nunca copiar chaves do CSV
  // para objetos convencionais, evitando alteração de protótipos.
  const fields = required.map(name => ({ name, source: parsed.meta.fields[headers.indexOf(name)] }));
  const rows = parsed.data.map((line, i) => {
    const row = Object.create(null);
    Object.defineProperty(row, "_linha", { value: i + 2, enumerable: true });
    for (const field of fields) {
      Object.defineProperty(row, field.name, {
        value: String(line[field.source] ?? "").trim(),
        enumerable: true,
      });
    }
    return row;
  });
  return rows;
}

const result = (title, metrics = [], lines = [], alerts = [], method = []) => ({ title, metrics, lines, alerts, method });
const metric = (label, value) => ({ label, value: String(value) });
const requiredText = (v, name) => {
  const text = String(v ?? "").trim();
  if (!text) throw new Error("Preencha " + name + ".");
  if (text.length > 350000) throw new Error(name + " excede o limite de tamanho.");
  return text;
};
const positive = (v, label, allowZero = true) => {
  const n = numberBR(v, label);
  if (n < 0 || (!allowZero && n === 0)) throw new Error(label + " deve ser maior " + (allowZero ? "ou igual a" : "que") + " zero.");
  return n;
};
const rate = (v, label, maximum = 100) => {
  const n = positive(v, label);
  if (n > maximum) throw new Error(label + " deve ser menor ou igual a " + maximum + "%.");
  return n / 100;
};
const safeDate = (value, name) => {
  const s = requiredText(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(name + " precisa estar no formato AAAA-MM-DD.");
  const d = new Date(s + "T00:00:00Z");
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== s) throw new Error(name + " não é uma data válida.");
  return s;
};
const daysTo = (date, now) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(now + "T00:00:00Z")) / 86400000);
const rowNum = (r, key, label, allowZero = true) => positive(r[key], "Linha " + r._linha + " (" + label + ")", allowZero);

function evalCompareDesoneracao(v) {
  const a = positive(v.materiais, "Materiais") + positive(v.mao_obra, "Mão de obra") * (1 + rate(v.encargos_a, "Encargos A", 500));
  const b = positive(v.materiais, "Materiais") + positive(v.mao_obra, "Mão de obra") * (1 + rate(v.encargos_b, "Encargos B", 500));
  const mult = 1 + rate(v.bdi, "BDI", 200);
  return result("Comparação dos cenários", [
    metric("Custo A", money(a)), metric("Custo B", money(b)),
    metric("Preço A com BDI", money(a * mult)), metric("Preço B com BDI", money(b * mult)),
    metric("Diferença absoluta", money(Math.abs(a - b) * mult))
  ], ["Menor cenário informado: " + (a <= b ? "A" : "B") + ".",
      "A fórmula é: (materiais + mão de obra × (1 + encargos)) × (1 + BDI)."],
    [], ["Não há vinculação automática a uma tabela SINAPI, mês-base, UF ou opção legal."]);
}
function evalAudit(v, papa) {
  const rows = parseSheet(v.tabela, papa, ["codigo","descricao","unidade","quantidade","preco_unitario","total"]);
  let sum = 0, failures = [], codes = new Map();
  rows.forEach(r => {
    const ref = r.codigo || "linha " + r._linha;
    if (!r.codigo || !r.descricao || !r.unidade) failures.push(ref + ": identificação ou unidade não preenchida.");
    const key = r.codigo.toLowerCase();
    if (key && codes.has(key)) failures.push(ref + ": código repetido na linha " + codes.get(key) + ".");
    else if (key) codes.set(key, r._linha);
    try {
      const calculated = rowNum(r, "quantidade", "quantidade") * rowNum(r, "preco_unitario", "preço unitário");
      const reported = numberBR(r.total, "Total da linha " + r._linha);
      if (Math.abs(calculated - reported) > Math.max(0.02, calculated * 0.000001)) failures.push(ref + ": subtotal informado " + money(reported) + ", calculado " + money(calculated) + ".");
      if (calculated === 0) failures.push(ref + ": item com valor zerado.");
      sum += calculated;
    } catch (e) { failures.push(ref + ": " + e.message); }
  });
  return result("Auditoria aritmética do orçamento",
    [metric("Linhas examinadas", rows.length), metric("Total calculado", money(sum)), metric("Apontamentos", failures.length)],
    failures.length ? failures.slice(0, 100) : ["Nenhuma divergência aritmética ou cadastral detectada nas colunas verificadas."],
    failures.length > 100 ? ["Há mais de 100 apontamentos. Analise a tabela em lotes."] : [],
    ["Total calculado pela multiplicação quantidade × preço unitário.", "Não substitui auditoria de projeto, preços de referência ou encargos."]);
}
function evalABC(v, papa) {
  const rows = parseSheet(v.tabela, papa, ["codigo","descricao","quantidade","preco_unitario"]);
  const items = rows.map(r => {
    const value = rowNum(r, "quantidade", "quantidade") * rowNum(r, "preco_unitario", "preço unitário");
    return { name: r.codigo + " " + r.descricao, value };
  }).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, x) => sum + x.value, 0);
  if (!total) throw new Error("A soma de todos os itens deve ser maior que zero.");
  let cumulative = 0, classes = { A:0, B:0, C:0 };
  const lines = items.slice(0, 80).map(x => {
    cumulative += x.value;
    const share = cumulative / total * 100;
    const grade = share <= 80 ? "A" : share <= 95 ? "B" : "C";
    classes[grade]++;
    return grade + " | " + x.name + " | " + money(x.value) + " | acumulado " + pct(share);
  });
  if (items.length > 80) lines.push("Visualização limitada aos 80 maiores itens, de " + items.length + " no total.");
  return result("Curva ABC por valor",
    [metric("Total", money(total)), metric("Serviços", items.length), metric("Maior item", pct(items[0].value / total * 100))], lines,
    [], ["Limites indicativos: A até 80%, B até 95% e C acima. Classificação depende da ordem e dos critérios internos."]);
}
function evalHonorarios(v) {
  const subtotal = positive(v.horas, "Horas", false) * positive(v.custo_hora, "Custo/hora") + positive(v.despesas, "Despesas");
  const tax = rate(v.tributos, "Tributos", 99), margin = rate(v.margem, "Margem", 99);
  if (tax + margin >= 1) throw new Error("A soma de tributos e margem deve ser inferior a 100%.");
  const price = subtotal / (1 - tax - margin);
  return result("Preço de referência dos honorários",
    [metric("Custo total", money(subtotal)), metric("Preço calculado", money(price)),
    metric("Tributos estimados", money(price * tax)), metric("Margem de contribuição", money(price * margin))],
    ["Preço = custo total ÷ (1 − alíquota sobre faturamento − margem desejada)."], [], ["Não inclui tributos e despesas que não foram informados."]);
}
function evalComprarLocar(v) {
  const purchase = positive(v.compra,"Aquisição") - positive(v.revenda,"Revenda") + positive(v.manutencao,"Manutenção");
  const hours = positive(v.horas,"Horas",false);
  const rental = hours * positive(v.locacao_hora,"Locação/hora");
  const p = purchase >= 0 ? purchase : 0;
  return result("Comparativo comprar ou locar",
    [metric("Comprar e operar", money(p)),metric("Locar",money(rental)),metric("Diferença",money(Math.abs(rental - p))),
     metric("Horas de equilíbrio aproximado",v.locacao_hora && positive(v.locacao_hora, "Locação/hora") ? qty(p / positive(v.locacao_hora,"Locação/hora")) : "Não definido")],
    ["Menor custo pelo modelo informado: " + (p <= rental ? "compra" : "locação") + "."],
    purchase < 0 ? ["Valor residual superior a aquisição e manutenção. Confira os dados."] : [],
    ["Desconsidera desconto no tempo, financiamento, seguro, mobilização e tributos."]);
}
function evalContingencia(v) {
  const revenue = positive(v.receita,"Receita");
  const base = positive(v.custo_direto,"Custo direto") + positive(v.custo_indireto,"Custo indireto");
  const provision = base * rate(v.contingencia,"Contingência",300);
  const delay = positive(v.dias_atraso,"Dias atraso") * positive(v.custo_dia,"Custo/dia");
  const resultValue = revenue - base - provision - delay;
  return result("Simulação de margem",
    [metric("Receita",money(revenue)),metric("Custos e reserva",money(base + provision + delay)),
     metric("Contribuição estimada",money(resultValue)),metric("Margem sobre receita",revenue ? pct(resultValue / revenue * 100) : "Não definida")],
    ["Reserva de contingência: " + money(provision) + ".", "Impacto adicional por atraso: " + money(delay) + "."],
    resultValue < 0 ? ["Cenário com resultado negativo."] : [],
    ["A reserva de contingência é tratada como gasto na simulação mais conservadora."]);
}
function evalCotacoes(v, papa) {
  const rows = parseSheet(v.tabela,papa,["fornecedor","item","quantidade","preco_unitario"]);
  const vendors = new Map(), items = new Map(), issues = [];
  rows.forEach(r => {
    if (!r.fornecedor || !r.item) { issues.push("Linha " + r._linha + ": fornecedor ou item ausente."); return; }
    const vendor = r.fornecedor, item = r.item;
    const cost = rowNum(r,"quantidade","quantidade") * rowNum(r,"preco_unitario","preço");
    const prices = vendors.get(vendor) || new Map();
    if (prices.has(item)) issues.push("Linha " + r._linha + ": item duplicado para " + vendor + ".");
    else prices.set(item,cost);
    vendors.set(vendor,prices);
    items.set(item,true);
  });
  const lines = [...vendors.entries()].map(([vendor, lines]) => vendor + ": " + lines.size + "/" + items.size +
    " itens | " + money([...lines.values()].reduce((a,b)=>a+b,0)) + (lines.size < items.size ? " | incompleta" : " | completa"));
  const complete = [...vendors.entries()].filter(([_,itemsQuoted]) => itemsQuoted.size === items.size);
  const cheapest = complete.sort((a,b)=>[...a[1].values()].reduce((x,y)=>x+y,0)-[...b[1].values()].reduce((x,y)=>x+y,0))[0];
  if (cheapest) lines.unshift("Menor valor entre propostas completas: " + cheapest[0] + ".");
  return result("Comparação de cotações",
    [metric("Fornecedores",vendors.size),metric("Itens distintos",items.size),metric("Propostas completas",complete.length)],
    lines, issues, ["Os itens são comparados pelo texto do nome. Quantidades devem estar normalizadas antes da análise."]);
}
function evalProductivity(v) {
  const units = positive(v.quantidade,"Quantidade",false);
  const hours = positive(v.trabalhadores,"Pessoas",false) * positive(v.horas_dia,"Horas/dia",false) * positive(v.dias,"Dias",false);
  const cost = hours * positive(v.custo_hora,"Custo/hora");
  return result("Produtividade média por equipe",
    [metric("Horas de trabalho totais",qty(hours)),metric("Produção por hora-pessoa",qty(units / hours)),
      metric("Horas-pessoa por unidade",qty(hours / units)),metric("Custo de mão de obra por unidade",money(cost / units))],
    ["Custo total de mão de obra: " + money(cost) + "."],[],["Quantidades e custos pressupõem unidade homogênea e atividades comparáveis."]);
}
function evalReajuste(v) {
  const base=positive(v.base,"Valor-base"), start=positive(v.indice_base,"Índice-base",false), last=positive(v.indice_atual,"Índice atual",false);
  const part=rate(v.elegivel,"Parcela elegível");
  const change=(last/start-1), delta=base*part*change;
  return result("Reajuste aritmético da parcela elegível",
    [metric("Variação do índice",pct(change*100)),metric("Parcela elegível",money(base*part)),
      metric("Diferença calculada",money(delta)),metric("Valor-base com diferença",money(base+delta))],
    ["Diferença = valor-base × percentual elegível × (índice atual ÷ índice-base − 1)."], [],
    ["A interpretação das cláusulas e a admissibilidade do reajuste não são calculadas."]);
}
function evalMedicao(v,papa) {
  const rows=parseSheet(v.tabela,papa,["codigo","quantidade_contratada","quantidade_anterior","quantidade_periodo","preco_unitario"]);
  let period=0,accumulated=0,remaining=0;const alerts=[];
  rows.forEach(r=>{
    const total=rowNum(r,"quantidade_contratada","quantidade contratada"),prev=rowNum(r,"quantidade_anterior","medição anterior");
    const current=rowNum(r,"quantidade_periodo","medição período"),price=rowNum(r,"preco_unitario","preço unitário");
    period+=current*price;accumulated+=(prev+current)*price;remaining+=Math.max(0,total-prev-current)*price;
    if(prev+current>total+1e-7)alerts.push("Item " + (r.codigo || r._linha) + ": medição acumulada excede quantidade contratada.");
  });
  return result("Conferência do boletim",
    [metric("Medição do período",money(period)),metric("Medição acumulada",money(accumulated)),
      metric("Saldo quantitativo não medido",money(remaining)),metric("Itens",rows.length)],
    ["Valores calculados por quantidades informadas × preços unitários."],alerts,
    ["Nenhuma glosa, retenção ou desconto contratual é aplicado automaticamente."]);
}
function evalCash(v,papa) {
  const rows=parseSheet(v.tabela,papa,["competencia","recebimentos","pagamentos","retencoes"]);
  let cash=positive(v.saldo_inicial,"Saldo inicial"), minimum=cash;
  const lines=[],alerts=[];
  rows.sort((a,b)=>a.competencia.localeCompare(b.competencia));
  rows.forEach(r=>{
    if(!/^\d{4}-\d{2}$/.test(r.competencia) || Number(r.competencia.slice(5)) > 12 || Number(r.competencia.slice(5)) < 1)
      throw new Error("Linha " + r._linha + ": competência inválida; use AAAA-MM.");
    const net=rowNum(r,"recebimentos","recebimentos")-rowNum(r,"pagamentos","pagamentos")-rowNum(r,"retencoes","retenções");
    cash+=net;minimum=Math.min(minimum,cash);
    lines.push(r.competencia + " | variação " + money(net) + " | saldo " + money(cash));
    if(cash<0)alerts.push("Caixa negativo em " + r.competencia + ".");
  });
  return result("Projeção de caixa por competência",
    [metric("Saldo final",money(cash)),metric("Menor saldo previsto",money(minimum)),
     metric("Necessidade mínima para não negativar",money(Math.max(0,-minimum)))],
    lines, alerts, ["Recebimentos não equivalem a faturamento e dependem de ingresso efetivo."]);
}
function evalCapital(v) {
  const receipt=positive(v.recebivel,"Recebível"), monthly=positive(v.despesas_mensais,"Despesas mensais");
  const days=positive(v.dias_atraso,"Dias atraso"),cash=positive(v.caixa,"Caixa");
  const required=monthly*days/30;
  return result("Reserva de caixa diante de atraso",
    [metric("Desembolsos no atraso",money(required)),metric("Caixa atual",money(cash)),
      metric("Necessidade adicional estimada",money(Math.max(0,required-cash))),
      metric("Recebível adiado",money(receipt))],
    ["O recebível não entra no caixa durante o intervalo de atraso."],
    required>cash?["O caixa informado não cobre o desembolso simulado."]:[],
    ["Hipótese linear de desembolso ao longo de " + qty(days) + " dias."]);
}
function lineDiff(a,b) {
  const x=a.replace(/\r/g,"").split("\n"),y=b.replace(/\r/g,"").split("\n");
  if(x.length>250 || y.length>250)throw new Error("Compare até 250 linhas por versão. Divida editais longos por seção.");
  let dp=Array.from({length:x.length+1},()=>new Uint16Array(y.length+1));
  for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)dp[i][j]=x[i]===y[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  let i=0,j=0,added=[],removed=[];
  while(i<x.length || j<y.length){
    if(i<x.length&&j<y.length&&x[i]===y[j]){i++;j++;}
    else if(j<y.length&&(i===x.length||dp[i][j+1]>=dp[i+1][j])){added.push("+ "+(j+1)+": "+y[j]);j++;}
    else{removed.push("- "+(i+1)+": "+x[i]);i++;}
  }
  return {added,removed};
}
function evalEdital(v) {
  const diff=lineDiff(requiredText(v.antes,"versão anterior"),requiredText(v.depois,"versão nova"));
  return result("Diferenças literais entre textos",
    [metric("Linhas adicionadas",diff.added.length),metric("Linhas removidas",diff.removed.length)],
    [...diff.removed,...diff.added].slice(0,120).length?[...diff.removed,...diff.added].slice(0,120):["Os textos comparados são iguais."],
    diff.removed.length+diff.added.length>120?["A visualização mostra apenas 120 alterações. Compare por seção."]:[],
    ["Comparação por linha com preservação do conteúdo; reordenações aparecem como remoção e adição."]);
}
function evalHabilitacao(v,papa,now) {
  const rows=parseSheet(v.tabela,papa,["requisito","documento","validade","situacao"]);
  let ok=0;const pending=[];
  rows.forEach(r=>{
    const status=r.situacao.toLowerCase();
    const presented=["apresentado","ok","conferido"].includes(status);
    let expired=false;
    if(r.validade){const date=safeDate(r.validade,"validade da linha "+r._linha);expired=daysTo(date,now)<0;}
    if(presented && !expired && r.documento)ok++;
    else pending.push(r.requisito+": "+(!r.documento?"comprovante ausente":expired?"documento vencido":"pendente de apresentação ou conferência"));
  });
  return result("Prontidão documental informada",
    [metric("Requisitos",rows.length),metric("Comprovados segundo a entrada",ok),metric("Pendências",pending.length)],
    pending.length?pending:["Todos os requisitos informados têm documento e situação apresentados."],[],
    ["O status apresentado não comprova autenticidade, suficiência nem compatibilidade do documento."]);
}
function evalPrazos(v,papa,now) {
  const rows=parseSheet(v.tabela,papa,["documento","validade","responsavel"]),threshold=positive(v.antecedencia,"Antecedência");
  let expired=0,near=0;const lines=[];
  rows.forEach(r=>{
    const left=daysTo(safeDate(r.validade,"validade da linha "+r._linha),now);
    const state=left<0?"vencido":left<=threshold?"a vencer":"vigente";
    if(left<0)expired++;else if(left<=threshold)near++;
    lines.push(r.documento+": "+state+" ("+left+" dias) | "+r.responsavel);
  });
  return result("Agenda de documentos",
    [metric("Vencidos",expired),metric("A vencer",near),metric("Total",rows.length)],
    lines,[],["Não envia alertas nem verifica emissor ou certidão."]);
}
function evalExposure(v) {
  const amount=positive(v.contrato,"Valor contrato");
  const ret=amount*rate(v.retencao,"Retenção",100),gua=amount*rate(v.garantia,"Garantia",100),fine=amount*rate(v.multa,"Multa",100);
  return result("Exposições contratuais hipotéticas",
    [metric("Retenção",money(ret)),metric("Garantia",money(gua)),metric("Multa simulada",money(fine)),metric("Valor-base",money(amount))],
    ["Os valores são independentes e não representam obrigação cumulativa certa."],[],
    ["Consulte cláusulas específicas e exigibilidade de cada evento."]);
}
function evalTimeline(v,papa) {
  const rows=parseSheet(v.tabela,papa,["data","evento","evidencia","responsavel"]);
  const noEvidence=[];rows.forEach(r=>{safeDate(r.data,"data da linha "+r._linha);if(!r.evidencia)noEvidence.push(r.evento+" ("+r.data+")");});
  rows.sort((a,b)=>a.data.localeCompare(b.data));
  return result("Linha do tempo documental",
    [metric("Eventos",rows.length),metric("Eventos sem evidência",noEvidence.length)],
    rows.map(r=>r.data+" | "+r.evento+" | "+(r.evidencia||"evidência não informada")+" | "+r.responsavel),noEvidence,
    ["O registro não atribui causa, culpa, direito a prazo ou direito a reequilíbrio."]);
}
function evalDiary(v) {
  const date=safeDate(v.data,"data");const fields=[["Obra e frente",v.local],["Equipe",v.equipe],
    ["Serviços executados",v.atividades],["Condições observadas",v.condicoes],
    ["Ocorrências",v.ocorrencias],["Referências de evidências",v.evidencias]];
  const missing=fields.filter(x=>!String(x[1]??"").trim()).map(x=>x[0]);
  return result("Rascunho de diário de obra",
    [metric("Data",date),metric("Campos preenchidos",fields.length-missing.length)],
    fields.map(x=>x[0]+": "+(String(x[1]??"").trim()||"Não informado")),
    missing.length?["Preencher ou justificar: "+missing.join(", ")+"."]:[],
    ["Documento sem assinatura nem certificação de autoria; fotos precisam ser anexadas ao dossiê fora desta ferramenta."]);
}
function evalInspection(v,papa) {
  const rows=parseSheet(v.tabela,papa,["ambiente","elemento","ocorrencia","prioridade","evidencia"]);
  const high=rows.filter(r=>["alta","critica","crítica","urgente"].includes(r.prioridade.toLowerCase()));
  const missing=rows.filter(r=>!r.evidencia);
  return result("Pendências de vistoria",
    [metric("Registros",rows.length),metric("Prioridade alta informada",high.length),metric("Sem evidência",missing.length)],
    rows.map(r=>r.ambiente+" | "+r.elemento+" | "+r.ocorrencia+" | "+r.prioridade),
    missing.map(r=>"Sem evidência: "+r.ambiente+" / "+r.elemento),
    ["Prioridade informada pelo usuário, sem avaliação independente de risco ou causa."]);
}
function evalAcervo(v,papa) {
  const rows=parseSheet(v.tabela,papa,["tipo","numero","atividade","data","comprovacao"]);
  let score=0,verified=0;const alerts=[],weight={CAT:5,ART:1,EXPERIENCIA:3};
  rows.forEach(r=>{
    if(r.data)safeDate(r.data,"data da linha "+r._linha);
    const type=r.tipo.toUpperCase();
    if(!Object.hasOwn(weight,type))alerts.push("Tipo não classificado: "+r.tipo);
    if(["sim","comprovado"].includes(r.comprovacao.toLowerCase()) && r.numero && Object.hasOwn(weight,type)){
      verified++;score+=weight[type];
    }else alerts.push("Comprovação pendente: "+(r.numero||r.atividade||"linha "+r._linha));
  });
  return result("Inventário de experiência documentada",
    [metric("Registros",rows.length),metric("Comprovação informada",verified),
      metric("Pontos indicativos internos",score)],
    rows.map(r=>r.tipo+" | "+r.numero+" | "+r.atividade),alerts,
    ["Peso indicativo: CAT 5, experiência formal 3, ART 1. Nenhum documento foi consultado no CREA ou validado pelo marketplace."]);
}
function evalBriefing(v) {
  const fields=[["Objetivo",v.objetivo],["Imóvel e local",v.imovel],["Documentos disponíveis",v.documentos],
    ["Entregas desejadas",v.entrega],["Prazo pretendido",v.prazo],["Restrições",v.restricoes]];
  const missing=fields.filter(x=>!String(x[1]??"").trim()).map(x=>x[0]);
  return result("Briefing inicial de projeto",[metric("Informações preenchidas",fields.length-missing.length)],
    fields.map(x=>x[0]+": "+(String(x[1]??"").trim()||"A levantar")),
    missing.length?["Informações a esclarecer: "+missing.join(", ")+"."]:[],
    ["Não substitui levantamento, proposta, análise de atribuições ou contratação."]);
}
function evalScope(v) {
  const fields=[["Objeto",v.objeto],["Escopo incluído",v.incluido],["Escopo excluído",v.excluido],
    ["Critérios de aceite",v.criterios],["Rodadas de revisão",v.revisoes]];
  const missing=fields.filter(x=>!String(x[1]??"").trim()).map(x=>x[0]);
  return result("Base de escopo técnico",
    [metric("Seções preenchidas",fields.length-missing.length)],
    fields.map(x=>x[0]+": "+(String(x[1]??"").trim()||"A definir")),
    missing.map(x=>"Falta definir: "+x),["Minuta não vinculante; aceite e condições comerciais devem ser confirmados formalmente."]);
}
function evalChange(v) {
  const prev=positive(v.preco_inicial,"Preço inicial"),cost=positive(v.custo_extra,"Custo adicional"),
    margin=rate(v.margem,"Margem",99),days=positive(v.dias,"Dias");
  const addition=cost/(1-margin);
  return result("Impacto econômico da mudança",
    [metric("Preço inicial",money(prev)),metric("Preço adicional estimado",money(addition)),
      metric("Novo total hipotético",money(prev+addition)),metric("Prazo adicional proposto",qty(days)+" dias")],
    ["Custo adicional ÷ (1 − margem desejada) = preço adicional estimado."],[],
    ["O novo preço e o prazo dependem de negociação e autorização. Não há aditivo automático."]);
}
function evalSST(v,papa) {
  const rows=parseSheet(v.tabela,papa,["atividade","perigo","controle","situacao","responsavel","evidencia"]);
  const pending=rows.filter(r=>!["atendido","concluido","concluído","ok"].includes(r.situacao.toLowerCase()));
  const noEvidence=rows.filter(r=>!r.evidencia);
  return result("Observações de segurança",
    [metric("Registros",rows.length),metric("Pendências informadas",pending.length),metric("Sem evidência",noEvidence.length)],
    pending.map(r=>r.atividade+" | "+r.perigo+" | controle: "+r.controle+" | "+r.responsavel),
    noEvidence.map(r=>"Comprovação ausente: "+r.atividade),
    ["Não atesta conformidade legal, aprovação de PGR ou liberação de atividade."]);
}
const CORE_CALCULATORS = Object.freeze({
  "comparar-desoneracao":evalCompareDesoneracao,
  "auditar-orcamento":evalAudit,
  "curva-abc":evalABC,
  "precificar-honorarios":evalHonorarios,
  "comprar-ou-locar":evalComprarLocar,
  "simular-contingencia":evalContingencia,
  "comparar-cotacoes":evalCotacoes,
  "produtividade-equipe":evalProductivity,
  "reajustar-contrato":evalReajuste,
  "conferir-medicao":evalMedicao,
  "fluxo-caixa-obra":evalCash,
  "capital-de-giro":evalCapital,
  "comparar-edital":evalEdital,
  "checar-habilitacao":evalHabilitacao,
  "prazos-documentais":evalPrazos,
  "exposicao-contratual":evalExposure,
  "linha-tempo-contratual":evalTimeline,
  "diario-obra":evalDiary,
  "vistoria-pendencias":evalInspection,
  "acervo-cat-art":evalAcervo,
  "briefing-projeto":evalBriefing,
  "escopo-tecnico":evalScope,
  "mudanca-escopo":evalChange,
  "inspecao-sst":evalSST
});
const CALCULATORS = Object.freeze({
  ...CORE_CALCULATORS,
  ...secondWaveCalculators({parseSheet,result,metric,positive,rate,rowNum,numberBR,money,pct,qty,safeDate,daysTo,round})
});
export function evaluateTool(id, values, { papa, now = new Date().toISOString().slice(0, 10) } = {}) {
  const tool = getTool(id);
  if (!tool || !Object.hasOwn(CALCULATORS, id)) throw new Error("Ferramenta não cadastrada.");
  safeDate(now, "data de referência");
  const output = CALCULATORS[id](values || {}, papa, now);
  return { ...output, toolId:id, description:tool.description, caveat:tool.caveat };
}
export function asText(report, now = new Date().toISOString().slice(0,10)) {
  if (!report || !report.toolId) throw new Error("Resultado inválido.");
  const lines=["CONFENGE | Engenharia, Perícias e Inteligência Técnica",report.title,
    "Ferramenta: "+report.toolId,"Data de referência: "+now,"",
    ...report.metrics.map(m=>m.label+": "+m.value),"","RESULTADO",
    ...report.lines,"","APONTAMENTOS",...(report.alerts.length?report.alerts:["Nenhum apontamento adicional."]),
    "","MÉTODO E LIMITES",...report.method,report.caveat,"",
    "Resultado preliminar preparado no navegador; não constitui aprovação ou responsabilidade técnica."];
  return lines.join("\n")+"\n";
}
