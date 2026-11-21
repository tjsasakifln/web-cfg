// Segunda onda de verificações e cálculos no dispositivo. Sem avaliações normativas automáticas.
export function secondWaveCalculators(h) {
  const {parseSheet,result,metric,positive,rate,rowNum,numberBR,money,pct,qty,safeDate,daysTo,round}=h;
  const currency=money, valid=x=>String(x??"").trim();
  const required=(x,name)=>{if(!valid(x))throw new Error("Preencha "+name+".");return valid(x)};
  const csv=(v,key,papa,columns)=>parseSheet(v[key],papa,columns);
  const num=(row,key,zero=true)=>rowNum(row,key,key,zero);
  const dates=(row,key)=>safeDate(row[key],"data da linha "+row._linha);
  const addDays=(date,days)=>{
    const d=new Date(date+"T00:00:00Z");
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  };
  const distinct=(rows,key)=>{
    const m=new Map();
    for(const r of rows){
      const label=required(r[key],"coluna "+key+" da linha "+r._linha);
      if(m.has(label))throw new Error("Chave duplicada: "+label+" (linhas "+m.get(label)._linha+" e "+r._linha+").");
      m.set(label,r);
    }
    return m;
  };
  const arr=(items)=>items.slice(0,80);
  const note=(items)=>items.length>80?["Resultados limitados aos 80 primeiros registros; divida o arquivo para conferir todos."]:[];
  const status=(v)=>valid(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const done=x=>["concluida","concluido","aceito","conforme","atendido","ok"].includes(status(x));
  const currencyDiff=(v)=> (v>=0?"+":"")+currency(v);

  function budgetDiff(v,papa) {
    const one=distinct(csv(v,"anterior",papa,["codigo","descricao","quantidade","preco_unitario"]),"codigo");
    const two=distinct(csv(v,"atual",papa,["codigo","descricao","quantidade","preco_unitario"]),"codigo");
    let before=0,after=0,changes=[],added=0,removed=0,changed=0;
    for(const [key,r] of one){
      const oldCost=num(r,"quantidade")*num(r,"preco_unitario");
      before+=oldCost;
      if(!two.has(key)){removed++;changes.push("Removido "+key+" | "+currency(oldCost));}
    }
    for(const [key,r] of two){
      const newQty=num(r,"quantidade"),newPrice=num(r,"preco_unitario");
      const current=newQty*newPrice;after+=current;
      if(!one.has(key)){added++;changes.push("Adicionado "+key+" | "+currency(current));continue;}
      const old=one.get(key),oq=num(old,"quantidade"),op=num(old,"preco_unitario");
      const delta=current-oq*op;
      if(Math.abs(delta)>=0.005 || newQty!==oq || newPrice!==op){changed++;changes.push("Alterado "+key+
        " | quantidade "+qty(oq)+" → "+qty(newQty)+" | preço "+currency(op)+" → "+currency(newPrice)+
        " | diferença "+currencyDiff(delta));}
    }
    return result("Alterações entre revisões de orçamento",
      [metric("Orçamento anterior",currency(before)),metric("Orçamento atual",currency(after)),
        metric("Diferença",currencyDiff(after-before)),metric("Serviços alterados",changed),
        metric("Incluídos",added),metric("Excluídos",removed)],
      arr(changes.length?changes:["Nenhuma alteração numérica ou de códigos identificada."]),
      note(changes),["Pareamento por código exato; memória do valor pela multiplicação de quantidade e preço."]);
  }

  function actualVsBudget(v,papa){
    const rows=csv(v,"tabela",papa,["codigo","descricao","valor_previsto","valor_realizado"]);
    distinct(rows,"codigo");
    let planned=0,real=0;const diffs=[];
    for(const r of rows){
      const p=num(r,"valor_previsto"),a=num(r,"valor_realizado");
      planned+=p;real+=a;
      diffs.push({label:r.codigo+" "+r.descricao,delta:a-p,base:p});
    }
    diffs.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const alerts=diffs.filter(x=>x.delta>0.009).map(x=>"Excesso de custo em "+x.label+": "+currency(x.delta));
    return result("Orçamento versus custo realizado",
      [metric("Previsto",currency(planned)),metric("Realizado",currency(real)),
        metric("Desvio",currencyDiff(real-planned)),metric("Desvio relativo",planned?pct((real-planned)/planned*100):"Indefinido")],
      arr(diffs.map(x=>x.label+" | "+currencyDiff(x.delta)+" | "+(x.base?pct(x.delta/x.base*100):"Base zero"))),
      arr(alerts),["Somente os custos efetivamente informados entram no comparativo."]);
  }

  function invoiceReconcile(v,papa){
    const one=csv(v,"pedidos",papa,["codigo","quantidade","preco_unitario"]);
    const two=csv(v,"notas",papa,["codigo","quantidade","preco_unitario"]);
    const group=rows=>{
      const m=new Map();
      for(const r of rows){
        const key=required(r.codigo,"código da linha "+r._linha);
        const n=num(r,"quantidade")*num(r,"preco_unitario");
        const a=m.get(key)||{q:0,total:0};
        a.q+=num(r,"quantidade");a.total+=n;m.set(key,a);
      }
      return m;
    };
    const a=group(one),b=group(two);let ordered=0,invoiced=0;const diffs=[];
    for(const val of a.values())ordered+=val.total;
    for(const val of b.values())invoiced+=val.total;
    for(const key of new Set([...a.keys(),...b.keys()])){
      const x=a.get(key)||{q:0,total:0},y=b.get(key)||{q:0,total:0};
      if(Math.abs(x.q-y.q)>1e-7||Math.abs(x.total-y.total)>0.015)diffs.push(
        key+": quantidade pedida "+qty(x.q)+", nota "+qty(y.q)+
        " | pedido "+currency(x.total)+", nota "+currency(y.total));
    }
    return result("Conciliação de pedidos e notas",
      [metric("Total pedido",currency(ordered)),metric("Total informado nas notas",currency(invoiced)),
       metric("Diferença",currencyDiff(invoiced-ordered)),metric("Códigos divergentes",diffs.length)],
      arr(diffs.length?diffs:["Nenhuma diferença em códigos, quantidades ou valores informados."]),
      note(diffs),["Soma itens repetidos pelo código. Não verifica impostos, XML fiscal, pagamento ou recebimento físico."]);
  }

  function unitPriceGap(v,papa) {
    const rows=csv(v,"tabela",papa,["codigo","descricao","quantidade","preco_referencia","preco_proposto"]);
    distinct(rows,"codigo");
    const gaps=rows.map(r=>{
      const q=num(r,"quantidade"),ref=num(r,"preco_referencia"),bid=num(r,"preco_proposto");
      return {label:r.codigo+" "+r.descricao,reference:q*ref,delta:q*(bid-ref)};
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const totalRef=gaps.reduce((s,x)=>s+x.reference,0),delta=gaps.reduce((s,x)=>s+x.delta,0);
    return result("Diferenças de preços unitários",
      [metric("Referência informada",currency(totalRef)),metric("Impacto líquido",currencyDiff(delta)),
       metric("Desvio relativo",totalRef?pct(delta/totalRef*100):"Não definido"),metric("Itens",rows.length)],
      arr(gaps.map(x=>x.label+": "+currencyDiff(x.delta))),
      note(gaps),["Impacto financeiro = quantidade × (preço proposto − preço de referência)."]);
  }

  function freight(v) {
    const due=positive(v.prazo_limite,"Prazo desejado");
    const costDay=positive(v.impacto_dia,"Custo por dia");
    const daysA=positive(v.dias_a,"Prazo A"),daysB=positive(v.dias_b,"Prazo B");
    const a=positive(v.materiais_a,"Materiais A")+positive(v.frete_a,"Frete A")+Math.max(0,daysA-due)*costDay;
    const b=positive(v.materiais_b,"Materiais B")+positive(v.frete_b,"Frete B")+Math.max(0,daysB-due)*costDay;
    return result("Alternativas de fornecimento",
      [metric("Custo simulado A",currency(a)),metric("Custo simulado B",currency(b)),
       metric("Diferença",currency(Math.abs(a-b))),metric("Menor custo informado",a<=b?"A":"B")],
      ["Cenário A: "+qty(Math.max(0,daysA-due))+" dias de atraso simulado.",
       "Cenário B: "+qty(Math.max(0,daysB-due))+" dias de atraso simulado."],
      [],["Custo simulado = materiais + frete + atraso além do prazo desejado × custo diário."]);
  }

  function volumePricing(v,papa){
    const need=positive(v.demanda,"Demanda",false);
    const rows=csv(v,"tabela",papa,["fornecedor","quantidade_minima","preco_unitario","frete"]);
    const quotes=rows.map(r=>{
      const minimum=num(r,"quantidade_minima"),qtyBuy=Math.max(need,minimum);
      const amount=qtyBuy*num(r,"preco_unitario")+num(r,"frete");
      return {seller:required(r.fornecedor,"fornecedor"),qtyBuy,amount,surplus:qtyBuy-need};
    }).sort((a,b)=>a.amount-b.amount);
    return result("Opções para compra por volume",
      [metric("Demanda",qty(need)),metric("Menor dispêndio",currency(quotes[0].amount)),
       metric("Fornecedor de menor dispêndio",quotes[0].seller)],
      arr(quotes.map(x=>x.seller+": comprar "+qty(x.qtyBuy)+" unidades | "+currency(x.amount)+
        " | excedente "+qty(x.surplus))),note(quotes),
      ["Quantidade comprada = maior entre demanda e lote mínimo. Não modela lotes múltiplos ou desconto escalonado."]);
  }

  function reorder(v){
    const stock=positive(v.estoque,"Estoque"),use=positive(v.consumo_dia,"Consumo/dia",false);
    const lead=positive(v.lead_time,"Prazo de reposição"),reserve=positive(v.seguranca,"Reserva de segurança");
    const trigger=(lead+reserve)*use;
    const toCover=Math.max(0,trigger-stock);
    return result("Planejamento de reposição",
      [metric("Autonomia atual",qty(stock/use)+" dias"),metric("Ponto de reposição",qty(trigger)+" unidades"),
        metric("Reposição mínima para atingir o ponto",qty(toCover)+" unidades"),
        metric("Estoque previsto na entrega",qty(stock-lead*use)+" unidades")],
      [stock<=trigger?"O estoque já alcançou o ponto de pedido calculado.":"Estoque acima do ponto de pedido calculado."],
      stock<lead*use?["A projeção indica falta de material antes do prazo de entrega."]:[],
      ["Ponto de pedido = consumo diário × (prazo de entrega + reserva em dias)."]);
  }

  function bidDiscount(v){
    const base=positive(v.valor_referencia,"Preço de referência");
    const discount=rate(v.desconto,"Desconto",99);
    const tax=rate(v.tributos,"Tributos",99);
    const revenue=base*(1-discount);
    const cost=positive(v.custo_direto,"Custo direto")+positive(v.indireto,"Custo indireto")+
      positive(v.contingencia,"Contingência");
    const taxes=revenue*tax,remaining=revenue-cost-taxes;
    return result("Resultado econômico simulado",
      [metric("Preço com desconto",currency(revenue)),metric("Custos e reserva",currency(cost)),
        metric("Tributos estimados",currency(taxes)),metric("Saldo de contribuição",currency(remaining)),
        metric("Margem sobre receita",revenue?pct(remaining/revenue*100):"Não definida")],
      ["Desconto aplicado somente ao preço de referência. Tributação proporcional à receita simulada."],
      remaining<0?["O cenário apresenta contribuição negativa."]:[],
      ["O valor não é proposta comercial, lance automático ou comprovação de exequibilidade."]);
  }

  function maintenance(v,papa,now){
    const rows=csv(v,"tabela",papa,["sistema","atividade","ultima_execucao","frequencia_dias","custo_previsto"]);
    let overdue=0,soon=0,cost=0;
    const jobs=rows.map(r=>{
      const last=dates(r,"ultima_execucao"),interval=num(r,"frequencia_dias",false);
      if(!Number.isSafeInteger(interval)||interval>36500)throw new Error("Periodicidade deve ser de 1 a 36.500 dias.");
      const next=addDays(last,interval),remain=daysTo(next,now);
      if(remain<0)overdue++;else if(remain<=30)soon++;
      if(remain<=30)cost+=num(r,"custo_previsto");
      return {next,remain,label:r.sistema+" | "+r.atividade+" | "+next+
        " | "+(remain<0?"vencida há "+qty(-remain)+" dias":qty(remain)+" dias restantes")};
    }).sort((a,b)=>a.next.localeCompare(b.next));
    return result("Agenda de manutenção por periodicidade",
      [metric("Atrasadas",overdue),metric("Próximas em até 30 dias",soon),
        metric("Despesa cadastrada com execução próxima",currency(cost))],
      arr(jobs.map(x=>x.label)),note(jobs),
      ["Próxima data = última execução informada + periodicidade em dias. A ausência de registro não atesta execução."]);
  }

  function reserveFund(v,papa) {
    const rows=csv(v,"tabela",papa,["competencia","despesa"]);
    const seen=new Set(), contrib=positive(v.contribuicao,"Contribuição mensal");
    let saldo=positive(v.saldo,"Saldo inicial"),minimum=saldo;
    const lines=rows.sort((a,b)=>a.competencia.localeCompare(b.competencia)).map(r=>{
      const period=required(r.competencia,"competência da linha "+r._linha);
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||seen.has(period))throw new Error("Competência inválida ou duplicada: "+period);
      seen.add(period);
      saldo+=contrib-num(r,"despesa");
      minimum=Math.min(minimum,saldo);
      return period+" | saldo acumulado "+currency(saldo);
    });
    return result("Projeção do fundo de manutenção",
      [metric("Saldo final",currency(saldo)),metric("Menor saldo",currency(minimum)),
        metric("Cobertura adicional necessária",currency(Math.max(0,-minimum)))],
      arr(lines),[...note(lines),...(minimum<0?["O fundo projetado fica negativo."]:[])],
      ["Cada competência acrescenta uma contribuição e desconta a despesa prevista. Meses omitidos não geram contribuição automática."]);
  }

  function warranty(v,papa,now){
    const rows=csv(v,"tabela",papa,["ambiente","elemento","prazo_final","situacao","documento"]);
    let overdue=0,missing=0,near=0;
    const lines=rows.map(r=>{
      const day=daysTo(dates(r,"prazo_final"),now);
      if(day<0)overdue++;else if(day<=30)near++;
      if(!r.documento)missing++;
      return r.ambiente+" / "+r.elemento+" | "+(day<0?"data cadastrada vencida":"faltam "+day+" dias")+
        " | "+(r.documento?"documento informado":"sem termo comprovado")+" | "+r.situacao;
    });
    return result("Controle de garantias cadastradas",
      [metric("Datas vencidas",overdue),metric("Até 30 dias",near),
        metric("Sem documento",missing),metric("Registros",rows.length)],
      arr(lines),note(lines),
      ["Datas não equivalem à determinação de prazo legal. O documento informado não foi verificado."]);
  }

  function fissure(v,papa){
    const rows=csv(v,"tabela",papa,["ponto","data","abertura_mm"]);
    const group=new Map();
    for(const r of rows){
      const key=required(r.ponto,"ponto de medição");
      const date=dates(r,"data");
      const opening=num(r,"abertura_mm");
      const a=group.get(key)||[];
      if(a.some(x=>x.date===date))throw new Error("Leitura duplicada para "+key+" em "+date);
      a.push({date,opening});group.set(key,a);
    }
    let growing=0,missing=0;const lines=[];
    for(const [key,readings] of group){
      readings.sort((a,b)=>a.date.localeCompare(b.date));
      if(readings.length<2){missing++;lines.push(key+": somente uma leitura, evolução indisponível.");continue;}
      const start=readings[0],end=readings[readings.length-1],delta=end.opening-start.opening;
      if(delta>0)growing++;
      lines.push(key+" | primeira "+qty(start.opening)+" mm | última "+qty(end.opening)+" mm | variação "+qty(round(delta))+" mm");
    }
    return result("Variações das aberturas cadastradas",
      [metric("Pontos",group.size),metric("Pontos com aumento medido",growing),
        metric("Pontos sem série comparável",missing)],
      arr(lines),note(lines),
      ["Comparação entre a primeira e a última leitura por ponto; não infere risco, causa ou estabilidade."]);
  }

  function pathology(v,papa){
    const rows=csv(v,"tabela",papa,["ambiente","elemento","manifestacao","gravidade","frequencia","evidencia"]);
    let missing=0;const list=rows.map(r=>{
      const severity=num(r,"gravidade",false),freq=num(r,"frequencia",false);
      if(!Number.isInteger(severity)||severity>5||!Number.isInteger(freq)||freq>5)throw new Error("Gravidade e frequência são inteiros de 1 a 5.");
      if(!r.evidencia)missing++;
      return {score:severity*freq,line:r.ambiente+" | "+r.elemento+" | "+r.manifestacao+
        " | escore "+(severity*freq)+(r.evidencia?"":" | evidência ausente")};
    }).sort((a,b)=>b.score-a.score);
    return result("Prioridades informadas de inspeção",
      [metric("Ocorrências",rows.length),metric("Sem evidência",missing),
        metric("Pontuação máxima informada",list[0].score+"/25")],
      arr(list.map(x=>x.line)),note(list),
      ["Escore de triagem = gravidade × frequência. As duas notas são subjetivas e não classificam segurança estrutural."]);
  }

  function renovation(v,papa){
    const rows=csv(v,"tabela",papa,["ambiente","area_m2","custo_m2","perda_pct"]);
    let subtotal=0,area=0;const lines=rows.map(r=>{
      const size=num(r,"area_m2"),unit=num(r,"custo_m2"),loss=rate(r.perda_pct,"perda da linha "+r._linha,100);
      const value=size*unit*(1+loss);
      subtotal+=value;area+=size;
      return r.ambiente+" | "+qty(size)+" m² | "+currency(value);
    });
    const reserve=subtotal*rate(v.contingencia,"Contingência",100);
    return result("Orçamento conceitual de reforma",
      [metric("Área informada",qty(area)+" m²"),metric("Custos com perdas",currency(subtotal)),
        metric("Reserva",currency(reserve)),metric("Total estimado",currency(subtotal+reserve))],
      arr(lines),note(lines),
      ["Custo por ambiente = área × custo/m² × (1 + perdas). Reserva geral incide sobre a soma."]);
  }

  function condoQuote(v,papa){
    const read=key=>{
      const rows=csv(v,key,papa,["servico","quantidade","unidade","preco_unitario"]);
      const m=new Map();
      for(const r of rows){
        const label=required(r.servico,"serviço da linha "+r._linha).toLowerCase().trim();
        if(m.has(label))throw new Error("Serviço duplicado na "+key+": "+label);
        m.set(label,{unit:required(r.unidade,"unidade"),qty:num(r,"quantidade"),cost:num(r,"quantidade")*num(r,"preco_unitario")});
      }
      return m;
    };
    const a=read("proposta_a"),b=read("proposta_b"),set=new Set([...a.keys(),...b.keys()]);
    let totalA=0,totalB=0,missing=0,unequal=0;const lines=[];
    for(const name of set){
      const x=a.get(name),y=b.get(name);
      if(x)totalA+=x.cost;if(y)totalB+=y.cost;
      if(!x||!y){missing++;lines.push(name+": presente somente na proposta "+(x?"A":"B"));continue;}
      if(x.unit!==y.unit||Math.abs(x.qty-y.qty)>1e-7){
        unequal++;lines.push(name+": quantidades/unidades não equivalentes ("+qty(x.qty)+" "+x.unit+" vs "+qty(y.qty)+" "+y.unit+")");
      } else lines.push(name+": "+currency(x.cost)+" (A) vs "+currency(y.cost)+" (B)");
    }
    return result("Conferência inicial de propostas",
      [metric("Total dos itens A",currency(totalA)),metric("Total dos itens B",currency(totalB)),
        metric("Serviços ausentes",missing),metric("Quantidades ou unidades divergentes",unequal)],
      arr(lines),[...note(lines),...(missing+unequal?["Comparação de preço não é conclusiva enquanto os escopos divergirem."]:[])],
      ["Correspondência pelo nome literal do serviço, sem inferência de equivalência técnica."]);
  }

  function handover(v,papa){
    const rows=csv(v,"tabela",papa,["ambiente","item","situacao","evidencia"]);
    let accepted=0,missing=0;const pending=[];
    for(const r of rows){
      if(done(r.situacao)&&r.evidencia){accepted++;continue;}
      if(!r.evidencia)missing++;
      pending.push(r.ambiente+" | "+r.item+" | "+r.situacao+" | "+(r.evidencia?"evidência informada":"sem evidência"));
    }
    return result("Pendências de entrega de imóvel",
      [metric("Itens",rows.length),metric("Conformes com evidência informada",accepted),
        metric("Pendentes ou incompletos",rows.length-accepted),metric("Sem evidência",missing)],
      arr(pending.length?pending:["Todos os itens cadastrados foram marcados conformes e possuem referência de evidência."]),
      note(pending),["Informação declaratória. O relatório não constitui termo de entrega, aceite ou vistoria realizada."]);
  }

  function riskMatrix(v,papa){
    const rows=csv(v,"tabela",papa,["atividade","perigo","probabilidade","gravidade","controle"]);
    let high=0,missing=0;const ranks=rows.map(r=>{
      const p=num(r,"probabilidade",false),g=num(r,"gravidade",false);
      if(!Number.isInteger(p)||p>5||!Number.isInteger(g)||g>5)throw new Error("Probabilidade e gravidade devem ser inteiros entre 1 e 5.");
      const score=p*g;
      if(score>=15)high++;
      if(!r.controle)missing++;
      return {score,line:r.atividade+" | "+r.perigo+" | "+score+"/25 | "+(r.controle||"controle a definir")};
    }).sort((a,b)=>b.score-a.score);
    return result("Inventário preliminar e classificação numérica",
      [metric("Perigos registrados",rows.length),metric("Pontuação 15 ou maior",high),metric("Controle não informado",missing)],
      arr(ranks.map(x=>x.line)),note(ranks),["Matriz numérica simplificada de 1 a 5. Não comprova exposição nem atende automaticamente ao PGR."]);
  }

  function epis(v,papa,now){
    const rows=csv(v,"tabela",papa,["profissional","epi","data_entrega","proxima_troca","comprovante"]);
    let expired=0,near=0,missing=0;const lines=[];
    for(const r of rows){
      const start=dates(r,"data_entrega"),end=dates(r,"proxima_troca");
      if(end<start)throw new Error("Data de troca anterior à entrega na linha "+r._linha);
      const days=daysTo(end,now);
      if(days<0)expired++;else if(days<=30)near++;
      if(!r.comprovante)missing++;
      lines.push(r.profissional+" | "+r.epi+" | troca cadastrada: "+end+
        " | "+(days<0?"vencida":"faltam "+days+" dias")+(r.comprovante?"":" | comprovante ausente"));
    }
    return result("Entregas de EPI registradas",
      [metric("Trocas com data vencida",expired),metric("Trocas em até 30 dias",near),metric("Sem comprovante",missing)],
      arr(lines),note(lines),["A data de troca é fornecida pelo usuário; não se presume validade de CA ou de vida útil do EPI."]);
  }

  function training(v,papa,now){
    const days=positive(v.aviso_dias,"Antecedência do alerta");
    const rows=csv(v,"tabela",papa,["profissional","curso","validade","comprovante"]);
    let overdue=0,near=0,missing=0;const lines=[];
    for(const r of rows){
      const remain=daysTo(dates(r,"validade"),now);
      if(remain<0)overdue++;else if(remain<=days)near++;
      if(!r.comprovante)missing++;
      lines.push(r.profissional+" | "+r.curso+" | "+(remain<0?"data cadastrada vencida":remain+" dias restantes")+
        (r.comprovante?"":" | certificado não informado"));
    }
    return result("Agenda de treinamentos cadastrados",
      [metric("Vencidos",overdue),metric("No prazo de alerta",near),metric("Sem certificado",missing)],
      arr(lines),note(lines),["Periodicidade ou validade dependem da exigência aplicável e dos registros da empresa."]);
  }

  function permit(v,papa){
    const rows=csv(v,"tabela",papa,["atividade","controle","situacao","responsavel","evidencia"]);
    let complete=0;const pending=[];
    for(const r of rows){
      if(done(r.situacao)&&r.evidencia&&r.responsavel)complete++;
      else pending.push(r.atividade+" | "+r.controle+" | "+r.situacao+
        " | "+(r.evidencia?"evidência informada":"evidência ausente"));
    }
    return result("Preparação documental da atividade",
      [metric("Controles",rows.length),metric("Informados como atendidos",complete),
        metric("Controles incompletos",rows.length-complete)],
      arr(pending.length?pending:["Os controles informados têm situação atendida, responsável e evidência."]),
      ["Esta ferramenta não libera trabalho nem emite permissão válida."],
      ["Liberação operacional requer inspeção, autorização, competência e assinaturas aplicáveis."]);
  }

  function actionTracker(v,papa,now){
    const rows=csv(v,"tabela",papa,["codigo","acao","prazo","responsavel","situacao","evidencia"]);
    distinct(rows,"codigo");
    let open=0,late=0,incomplete=0;const alerts=[];
    for(const r of rows){
      const delta=daysTo(dates(r,"prazo"),now);
      if(!done(r.situacao)){open++;if(delta<0)late++;alerts.push(r.codigo+" | "+r.acao+" | "+r.responsavel+
        " | "+(delta<0?"atraso "+(-delta)+" dias":"restam "+delta+" dias"));}
      else if(!r.evidencia){incomplete++;alerts.push(r.codigo+" | marcada concluída sem evidência.");}
    }
    return result("Acompanhamento de ações corretivas",
      [metric("Abertas",open),metric("Atrasadas",late),metric("Concluídas sem evidência",incomplete),metric("Total",rows.length)],
      arr(alerts.length?alerts:["Ações cadastradas marcadas como concluídas e com evidência informada."]),
      note(alerts),["O encerramento real depende de validação do responsável, não de campo marcado."]);
  }

  function revisionTracker(v,papa){
    const rows=csv(v,"tabela",papa,["disciplina","prancha","revisao","data","status"]);
    const unique=new Set(),bySheet=new Map();let duplicate=0;const conflicts=[];
    for(const r of rows){
      dates(r,"data");
      const sheet=required(r.disciplina,"disciplina")+" / "+required(r.prancha,"prancha");
      const revision=required(r.revisao,"revisão");
      const key=sheet+" / "+revision;
      if(unique.has(key)){duplicate++;conflicts.push("Revisão duplicada: "+key);}
      unique.add(key);
      const a=bySheet.get(sheet)||[];
      a.push(r);bySheet.set(sheet,a);
    }
    for(const [key,arr] of bySheet){
      const current=arr.filter(r=>["vigente","aprovado"].includes(status(r.status)));
      if(current.length!==1)conflicts.push(key+" | "+current.length+" versões marcadas vigentes/aprovadas.");
    }
    const lines=[...bySheet.entries()].map(([key,arr])=>{
      arr.sort((a,b)=>b.data.localeCompare(a.data));
      return key+" | "+arr.length+" revisões informadas | data mais recente "+arr[0].data+
        " | revisão "+arr[0].revisao;
    });
    return result("Inventário de revisões técnicas",
      [metric("Pranchas únicas",bySheet.size),metric("Revisões cadastradas",rows.length),
        metric("Duplicidades",duplicate),metric("Conflitos de vigência",conflicts.length-duplicate)],
      arr(lines),arr(conflicts),["Status declarado não demonstra a aprovação de órgão ou contratante."]);
  }

  function deliveryAcceptance(v,papa){
    const rows=csv(v,"tabela",papa,["etapa","entregavel","criterio","status","registro_aceite"]);
    let accepted=0,review=0,missing=0;const lines=[];
    for(const r of rows){
      const statusValue=status(r.status);
      if(statusValue==="aceito"&&r.registro_aceite)accepted++;
      else{review++;if(!r.registro_aceite)missing++;}
      lines.push(r.etapa+" | "+r.entregavel+" | "+r.status+" | "+(r.registro_aceite||"sem registro de aceite"));
    }
    return result("Controle documental de aceite",
      [metric("Entregáveis",rows.length),metric("Marcados aceitos com referência",accepted),
        metric("Em revisão ou incompletos",review),metric("Sem registro de aceite",missing)],
      arr(lines),note(lines),
      ["Registro de aceite não é nota fiscal, faturamento ou dinheiro recebido. Confirmação deve ser externa e autorizada."]);
  }

  function capacity(v,papa){
    const rows=csv(v,"tabela",papa,["profissional","tarefa","horas_previstas","horas_disponiveis"]);
    const people=new Map();
    for(const r of rows){
      const key=required(r.profissional,"profissional");
      const hours=num(r,"horas_previstas"),available=num(r,"horas_disponiveis",false);
      const person=people.get(key)||{planned:0,available};
      if(Math.abs(person.available-available)>0.001)throw new Error("Capacidade divergente para "+key+". Informe as mesmas horas disponíveis em todas as tarefas.");
      person.planned+=hours;people.set(key,person);
    }
    let overloaded=0;const lines=[...people].map(([who,p])=>{
      if(p.planned>p.available)overloaded++;
      return who+" | "+qty(p.planned)+"/"+qty(p.available)+" h | ocupação "+pct(p.planned/p.available*100)+
        (p.planned>p.available?" | sobrecarga":"");
    }).sort();
    return result("Capacidade alocada por profissional",
      [metric("Profissionais",people.size),metric("Com sobrecarga",overloaded),
        metric("Horas previstas",qty([...people.values()].reduce((s,p)=>s+p.planned,0)))],
      arr(lines),note(lines),["Capacidade informada por profissional é contada uma vez, não por tarefa."]);
  }

  return Object.freeze({
    "comparar-revisoes-orcamento":budgetDiff,
    "previsto-realizado-obra":actualVsBudget,
    "conciliar-pedidos-notas":invoiceReconcile,
    "desvios-precos-unitarios":unitPriceGap,
    "comparar-logistica-entregas":freight,
    "compra-por-volume":volumePricing,
    "reposicao-estoque-obra":reorder,
    "simular-desconto-proposta":bidDiscount,
    "manutencao-predial-agenda":maintenance,
    "fundo-reserva-predial":reserveFund,
    "garantias-construtivas":warranty,
    "monitorar-fissuras":fissure,
    "mapa-patologias-edificio":pathology,
    "orcamento-reforma-ambientes":renovation,
    "comparar-propostas-condominio":condoQuote,
    "recebimento-imovel":handover,
    "matriz-riscos-atividade":riskMatrix,
    "entrega-epi":epis,
    "agenda-treinamentos-sst":training,
    "checklist-permissao-trabalho":permit,
    "acoes-corretivas-sst":actionTracker,
    "controle-revisoes-pranchas":revisionTracker,
    "aceite-entregas-tecnicas":deliveryAcceptance,
    "capacidade-escritorio-projetos":capacity
  });
}
