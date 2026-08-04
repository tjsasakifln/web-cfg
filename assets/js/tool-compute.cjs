/**
 * Pure compute modules for CONFENGE high-intent tools. No DOM.
 */
(function (root) {
  "use strict";
  function parseBRL(raw) {
    if (raw === null || raw === undefined) return { ok: false, error: "vazio" };
    var s = String(raw).trim().replace(/\s/g, "").replace(/^R\$\s?/i, "");
    if (!s) return { ok: false, error: "vazio" };
    if (!/^[\d.,]+$/.test(s)) return { ok: false, error: "caracteres_invalidos" };
    var hasComma = s.indexOf(",") >= 0, hasDot = s.indexOf(".") >= 0;
    if (hasComma && hasDot) {
      var lastComma = s.lastIndexOf(",");
      var intPart = s.slice(0, lastComma).replace(/\./g, "");
      var decPart = s.slice(lastComma + 1);
      if (!/^\d+$/.test(intPart) || !/^\d{1,2}$/.test(decPart)) return { ok: false, error: "formato_invalido" };
      var n = Number(intPart + "." + decPart);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: "numero_invalido" };
    }
    if (hasComma) {
      var parts = s.split(",");
      if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return { ok: false, error: "formato_invalido" };
      var n2 = Number(parts[0] + "." + parts[1]);
      return Number.isFinite(n2) ? { ok: true, value: n2 } : { ok: false, error: "numero_invalido" };
    }
    if (hasDot) {
      var p = s.split(".");
      var after = p.slice(1);
      var isThousands = after.length >= 1 && after.every(function (x) { return /^\d{3}$/.test(x); }) && /^\d{1,3}$/.test(p[0]);
      if (isThousands) {
        var n3 = Number(p.join(""));
        return Number.isFinite(n3) ? { ok: true, value: n3 } : { ok: false, error: "numero_invalido" };
      }
      if (p.length === 2 && /^\d+$/.test(p[0]) && /^\d{1,2}$/.test(p[1])) {
        var n4 = Number(p[0] + "." + p[1]);
        return Number.isFinite(n4) ? { ok: true, value: n4 } : { ok: false, error: "numero_invalido" };
      }
      return { ok: false, error: "formato_invalido" };
    }
    if (!/^\d+$/.test(s)) return { ok: false, error: "formato_invalido" };
    var n5 = Number(s);
    return Number.isFinite(n5) ? { ok: true, value: n5 } : { ok: false, error: "numero_invalido" };
  }
  function computeLimiteAditivo(input) {
    var V = Number(input.valorInicial);
    if (!Number.isFinite(V) || V <= 0) return { ok: false, error: "valor_inicial_invalido" };
    var tipo = input.tipo === "reforma" ? "reforma" : "geral";
    var acPrev = Math.max(0, Number(input.acrescimosPrevios) || 0);
    var suPrev = Math.max(0, Number(input.supressoesPrevias) || 0);
    var acNow = Math.max(0, Number(input.acrescimoProposto) || 0);
    var suNow = Math.max(0, Number(input.supressaoProposta) || 0);
    var limAc = tipo === "reforma" ? 0.5 : 0.25, limSu = 0.25;
    var maxAc = V * limAc, maxSu = V * limSu;
    var acTotal = acPrev + acNow, suTotal = suPrev + suNow;
    var salAc = maxAc - acTotal, salSu = maxSu - suTotal;
    var pctAc = acTotal / V, pctSu = suTotal / V;
    var withinAc = acTotal <= maxAc + 0.005, withinSu = suTotal <= maxSu + 0.005;
    var alerts = [];
    if (tipo === "reforma") alerts.push({ code: "reforma_selecionada", severity: "info", text: "Limite de acréscimo de 50% aplica-se a reforma de edifício ou equipamento." });
    if (acNow > 0 && suNow > 0) alerts.push({ code: "acrescimo_e_supressao", severity: "warn", text: "Há acréscimo e supressão propostos. Trate os saldos de forma independente." });
    if (V > 0 && V < 1000) alerts.push({ code: "valor_base_suspeito", severity: "warn", text: "O valor inicial informado é muito baixo. Confira o valor inicial atualizado." });
    if (!withinAc) alerts.push({ code: "acrescimos_acima_teto", severity: "bad", text: "Total de acréscimos ultrapassa o limite numérico calculado com os dados informados." });
    else if (salAc < V * 0.02) alerts.push({ code: "saldo_acrescimo_baixo", severity: "warn", text: "Saldo residual de acréscimo inferior a 2% do valor inicial." });
    if (!withinSu) alerts.push({ code: "supressoes_acima_teto", severity: "bad", text: "Total de supressões ultrapassa o limite numérico de 25%." });
    else if (salSu < V * 0.02) alerts.push({ code: "saldo_supressao_baixo", severity: "warn", text: "Saldo residual de supressão inferior a 2%." });
    var level = "ok";
    if (alerts.some(function (a) { return a.severity === "bad"; })) level = "bad";
    else if (alerts.some(function (a) { return a.severity === "warn"; })) level = "warn";
    var msgs = [withinAc ? "acrescimos_dentro_teto" : "acrescimos_acima_teto", withinSu ? "supressoes_dentro_teto" : "supressoes_acima_teto"];
    var labelOk = "Dentro do limite numérico calculado com os dados informados.";
    var labelBad = "Acima do limite numérico calculado com os dados informados.";
    return { ok: true, level: level, msgs: msgs, alerts: alerts, V: V, tipo: tipo, limAc: limAc, limSu: limSu, maxAc: maxAc, maxSu: maxSu, acPrev: acPrev, suPrev: suPrev, acNow: acNow, suNow: suNow, acTotal: acTotal, suTotal: suTotal, salAc: salAc, salSu: salSu, pctAc: pctAc, pctSu: pctSu, withinAc: withinAc, withinSu: withinSu,
      acrescimos: { anteriores: acPrev, proposto: acNow, total: acTotal, limite: maxAc, saldo: salAc, percentualUtilizado: pctAc, dentroDoLimite: withinAc, labelStatus: withinAc ? labelOk : labelBad },
      supressoes: { anteriores: suPrev, proposta: suNow, total: suTotal, limite: maxSu, saldo: salSu, percentualUtilizado: pctSu, dentroDoLimite: withinSu, labelStatus: withinSu ? labelOk : labelBad } };
  }
  function computeChecklistScore(doneKeys, allKeys, urgencia) {
    var all = allKeys || [];
    var done = (doneKeys || []).filter(function (k) { return all.indexOf(k) >= 0; });
    var missing = all.filter(function (k) { return done.indexOf(k) < 0; });
    var score = all.length ? done.length / all.length : 0;
    var level = score >= 0.75 ? "ok" : score >= 0.45 ? "warn" : "bad";
    var next = [];
    if (missing.indexOf("comunicacao") >= 0) next.push("protocolo_formal");
    if (missing.indexOf("planilha") >= 0 || missing.indexOf("composicoes") >= 0) next.push("memoria_calculo");
    if (missing.indexOf("cronologia") >= 0) next.push("cronologia");
    if (score >= 0.75) next.push("revisao_independente");
    if (urgencia === "alta" && score < 0.75) next.push("urgente_incompleto");
    return { ok: true, score: score, score_pct: Math.round(score * 100), done: done.length, total: all.length, missing: missing, level: level, next: next, urgencia: urgencia || "media" };
  }
  var REEQ_CATEGORIES = {
    blockers: { id: "blockers", label: "Potenciais bloqueadores", weight: 0.55, items: [
      { key: "fato_gerador", label: "Fato gerador definido" }, { key: "cronologia", label: "Cronologia" },
      { key: "nexo", label: "Nexo causal" }, { key: "comunicacao", label: "Comunicação tempestiva" },
      { key: "memoria", label: "Memória de cálculo" }, { key: "contrato", label: "Cláusulas contratuais e matriz de riscos" }
    ]},
    economic: { id: "economic", label: "Suporte econômico", weight: 0.3, items: [
      { key: "planilha", label: "Planilhas" }, { key: "composicoes", label: "Composições" },
      { key: "series", label: "Séries de preços" }, { key: "indices", label: "Índices" }, { key: "medicoes", label: "Medições afetadas" }
    ]},
    process: { id: "process", label: "Organização processual", weight: 0.15, items: [
      { key: "pedido", label: "Pedido objetivo" }, { key: "anexos", label: "Índice de anexos" },
      { key: "refs", label: "Referências cruzadas" }, { key: "revisao", label: "Revisão interna" }
    ]}
  };
  function computeReequilibrio(states, opts) {
    opts = opts || {};
    var urgencia = opts.urgencia || "media", materialidade = opts.materialidade || "nao_informada", statesMap = states || {};
    var missingBlockers = [], missingImportant = [], missingProcess = [], weighted = 0, weightDenom = 0;
    Object.keys(REEQ_CATEGORIES).forEach(function (catId) {
      var cat = REEQ_CATEGORIES[catId], met = 0, applicable = 0;
      cat.items.forEach(function (item) {
        var st = statesMap[item.key] || "missing";
        if (st === "na") return;
        applicable += 1;
        if (st === "met") met += 1;
        else {
          if (catId === "blockers") missingBlockers.push(item);
          else if (catId === "economic") missingImportant.push(item);
          else missingProcess.push(item);
        }
      });
      var ratio = applicable ? met / applicable : 1;
      if (applicable > 0) { weighted += ratio * cat.weight; weightDenom += cat.weight; }
    });
    var score = weightDenom ? weighted / weightDenom : 0;
    var hasCentralBlocker = missingBlockers.length > 0;
    var level = "bad", readiness = "baixa";
    if (!hasCentralBlocker && score >= 0.85) { level = "ok"; readiness = "alta"; }
    else if (!hasCentralBlocker && score >= 0.55) { level = "warn"; readiness = "media"; }
    else if (hasCentralBlocker) { level = "bad"; readiness = score >= 0.4 ? "media_com_bloqueio" : "baixa"; }
    else { level = "warn"; readiness = "media"; }
    if (hasCentralBlocker && (level === "ok" || readiness === "alta")) { level = "bad"; readiness = "media_com_bloqueio"; }
    var order = [];
    missingBlockers.forEach(function (i) { order.push({ key: i.key, label: i.label, priority: 1, reason: "bloqueador" }); });
    missingImportant.forEach(function (i) { order.push({ key: i.key, label: i.label, priority: 2, reason: "suporte_economico" }); });
    missingProcess.forEach(function (i) { order.push({ key: i.key, label: i.label, priority: 3, reason: "organizacao" }); });
    var ressalvas = [];
    if (hasCentralBlocker) ressalvas.push("Há bloqueador(es) central(is) em aberto.");
    if (materialidade === "alta") ressalvas.push("Materialidade alta: organize revisão técnica antes de protocolar.");
    if (urgencia === "alta" && hasCentralBlocker) ressalvas.push("Urgência alta com bloqueadores abertos.");
    var readinessLabel = readiness === "alta" ? "Prontidão documental alta" : readiness === "media" ? "Prontidão documental média" : readiness === "media_com_bloqueio" ? "Prontidão documental limitada por bloqueadores" : "Prontidão documental baixa";
    var synthesis = readiness === "alta" ? "Os bloqueadores centrais estão cobertos." : "O dossiê ainda não está pronto para protocolar com segurança documental.";
    if (missingBlockers.length) synthesis += " Bloqueadores em aberto: " + missingBlockers.map(function (i) { return i.label; }).join(", ") + ".";
    return { ok: true, score: score, score_pct: Math.round(score * 100), level: level, readiness: readiness, readinessLabel: readinessLabel, hasCentralBlocker: hasCentralBlocker,
      missingBlockers: missingBlockers.map(function (i) { return i.key; }), missingImportant: missingImportant.map(function (i) { return i.key; }),
      missingProcess: missingProcess.map(function (i) { return i.key; }), correctionOrder: order, ressalvas: ressalvas, urgencia: urgencia, materialidade: materialidade, synthesis: synthesis };
  }
  function normalizeParte(p) {
    var s = String(p || "").toLowerCase();
    if (s.indexOf("adm") === 0) return "administracao";
    if (s.indexOf("cont") === 0) return "contratado";
    if (s.indexOf("comp") === 0) return "compartilhado";
    return "indefinida";
  }
  function computeMatrizEventos(events) {
    var list = (events || []).filter(function (ev) { return ev && (ev.causa || ev.cause); });
    if (!list.length) return { ok: false, error: "nenhum_evento" };
    var rows = list.map(function (ev, idx) {
      var causa = String(ev.causa || ev.cause || "").trim();
      var parte = normalizeParte(ev.parte || ev.resp);
      var temCom = !!ev.comunicacaoContemporanea, temDoc = !!ev.documentoDisponivel;
      var crit = ev.impactoCaminhoCritico || "incerto", conc = !!ev.concorrencia;
      var missingDocs = [];
      if (!temCom) missingDocs.push("comunicação contemporânea do evento");
      if (!temDoc) missingDocs.push("documento de suporte localizado");
      if (!ev.atividadeAfetada) missingDocs.push("vínculo com atividade do cronograma");
      var hipotese = "responsabilidade não determinada";
      if (parte === "administracao") hipotese = "hipótese preliminar de imputação à Administração (depende de prova)";
      else if (parte === "contratado") hipotese = "hipótese preliminar de imputação ao contratado (depende de prova)";
      else if (parte === "compartilhado") hipotese = "possível concorrência de causas / responsabilidade compartilhada";
      return { id: ev.id || "ev-" + (idx + 1), causa: causa, parte: parte, hipotese: hipotese, documentosExistentes: temDoc ? ["documento indicado"] : [], documentosFaltantes: missingDocs,
        precisaNexoTemporal: !ev.dataInicio || (!ev.dataFim && !ev.duracaoDias), precisaImpactoCritico: crit === "incerto" || !ev.atividadeAfetada || crit === "sim",
        possivelConcorrencia: conc || parte === "compartilhado", impactoCaminhoCritico: crit, atividadeAfetada: ev.atividadeAfetada || "", dataInicio: ev.dataInicio || "", dataFim: ev.dataFim || "", duracaoDias: Number(ev.duracaoDias) || null, observacao: ev.observacao || "" };
    });
    var semProva = rows.filter(function (r) { return r.documentosFaltantes.length > 0; }).length;
    var semPeriodo = rows.filter(function (r) { return r.precisaNexoTemporal; }).length;
    var semCritico = rows.filter(function (r) { return r.precisaImpactoCritico; }).length;
    var comConc = rows.filter(function (r) { return r.possivelConcorrencia; }).length;
    var nextRecords = [];
    if (semProva) nextRecords.push("Registrar comunicação contemporânea e anexar documentos por evento.");
    if (semPeriodo) nextRecords.push("Definir data inicial e final (ou duração) de cada evento.");
    if (semCritico) nextRecords.push("Vincular eventos à atividade e ao impacto no caminho crítico.");
    if (comConc) nextRecords.push("Analisar sobreposição temporal entre eventos concorrentes.");
    return { ok: true, level: "hypothesis", events: rows,
      summary: { totalEventos: rows.length, semProvaContemporanea: semProva, semPeriodoDefinido: semPeriodo, semVinculoCritico: semCritico, possiveisSobreposicoes: comConc, proximosRegistros: nextRecords },
      synthesis: "Foram analisados " + rows.length + " evento(s). As imputações abaixo são hipóteses preliminares e tendências que dependem de prova. Não há veredito de responsabilidade nem soma automática de dias.",
      disclaimer: "Resultado orientativo. Não constitui laudo pericial nem conclusão de culpa." };
  }
  var ATRASO_MAP = { chuva: { resp: "compartilhado", docs: "pluviometria_diario" }, projeto: { resp: "administracao", docs: "versoes_projeto_os" }, desaprop: { resp: "administracao", docs: "liberacao_area" }, pagamento: { resp: "administracao", docs: "medicoes_comprovantes" }, material: { resp: "compartilhado", docs: "cotacoes_lead_time" }, mao_obra: { resp: "contratado", docs: "escalas_subcontratos" }, equip: { resp: "contratado", docs: "manutencao_backup" }, ordem: { resp: "administracao", docs: "os_paralisacao" }, medicao: { resp: "administracao", docs: "protocolos_medicao" }, outros_adm: { resp: "administracao", docs: "nexo_temporal" }, outros_cont: { resp: "contratado", docs: "nexo_temporal" } };
  function computeMatrizAtraso(causes, dias, temMatriz) {
    var selected = (causes || []).filter(Boolean);
    if (!selected.length) return { ok: false, error: "nenhuma_causa" };
    var events = selected.map(function (k) {
      var m = ATRASO_MAP[k] || { resp: "indefinida", docs: "nexo_temporal" };
      return { causa: k, parte: m.resp, comunicacaoContemporanea: false, documentoDisponivel: false, impactoCaminhoCritico: "incerto", duracaoDias: selected.length === 1 ? Number(dias) || null : null };
    });
    var base = computeMatrizEventos(events);
    if (!base.ok) return base;
    var rows = base.events.map(function (r) { return { cause: r.causa, resp: r.parte, docs: (ATRASO_MAP[r.causa] || {}).docs || "nexo_temporal" }; });
    var adm = rows.filter(function (r) { return r.resp === "administracao"; }).length;
    var cont = rows.filter(function (r) { return r.resp === "contratado"; }).length;
    return { ok: true, level: "hypothesis", dias: Number(dias) || 0, tem_matriz: temMatriz || "nao", rows: rows,
      counts: { administracao: adm, contratado: cont, compartilhado: rows.filter(function (r) { return r.resp === "compartilhado"; }).length },
      needs_critical_path: true, events: base.events, summary: base.summary, synthesis: base.synthesis };
  }
  function computeAditivoReadiness(items) {
    var list = items || [], analyzed = 0, essentialMet = 0, essentialPending = 0, essentialNa = 0, supportPending = 0, finalPending = 0, blockersHit = [];
    list.forEach(function (it) {
      var cat = it.category || "essential", st = it.state || "pending";
      if (cat === "blocker") { if (st === "met" || st === "yes") blockersHit.push(it); return; }
      if (st === "na") { if (cat === "essential" || cat === "conditional") essentialNa += 1; analyzed += 1; return; }
      analyzed += 1;
      if (st === "met") { if (cat === "essential") essentialMet += 1; }
      else {
        if (cat === "essential") essentialPending += 1;
        else if (cat === "support") supportPending += 1;
        else if (cat === "final") finalPending += 1;
      }
    });
    var essentialTotal = list.filter(function (i) { return i.category === "essential" && i.state !== "na"; }).length;
    var readiness = "baixa", level = "bad";
    if (blockersHit.length > 0 || essentialPending > 0) { readiness = essentialPending >= 3 || blockersHit.length >= 2 ? "baixa" : "media_com_bloqueio"; level = "bad"; }
    else if (supportPending > 2 || finalPending > 0) { readiness = "media"; level = "warn"; }
    else if (essentialPending === 0 && blockersHit.length === 0) { readiness = supportPending === 0 ? "alta" : "media"; level = supportPending === 0 ? "ok" : "warn"; }
    if (blockersHit.length || essentialPending) { if (readiness === "alta") readiness = "media_com_bloqueio"; if (level === "ok") level = "bad"; }
    var readinessLabel = readiness === "alta" ? "Prontidão documental alta" : readiness === "media" ? "Prontidão documental média" : readiness === "media_com_bloqueio" ? "Prontidão documental limitada" : "Prontidão documental baixa";
    var blockerLabels = blockersHit.map(function (b) { return b.label || b.id; });
    var synthesis = "Foram analisados " + analyzed + " requisitos. " + essentialMet + " essenciais atendidos";
    if (essentialPending) synthesis += ", " + essentialPending + " pendência(s) essencial(is)";
    if (blockersHit.length) synthesis += " e " + blockersHit.length + " sinal(is) de bloqueio: " + blockerLabels.slice(0, 3).join("; ");
    synthesis += ".";
    return { ok: true, level: level, readiness: readiness, readinessLabel: readinessLabel, analyzed: analyzed, essentialMet: essentialMet, essentialPending: essentialPending, essentialTotal: essentialTotal, essentialNa: essentialNa, supportPending: supportPending, finalPending: finalPending, blockersHit: blockersHit.map(function (b) { return b.id; }), blockerLabels: blockerLabels, progressPct: essentialTotal > 0 ? Math.round((essentialMet / essentialTotal) * 100) : 0, synthesis: synthesis };
  }
  var api = { parseBRL: parseBRL, computeLimiteAditivo: computeLimiteAditivo, computeChecklistScore: computeChecklistScore, computeReequilibrio: computeReequilibrio, computeMatrizAtraso: computeMatrizAtraso, computeMatrizEventos: computeMatrizEventos, computeAditivoReadiness: computeAditivoReadiness, REEQ_CATEGORIES: REEQ_CATEGORIES, ATRASO_MAP: ATRASO_MAP };
  root.ConfengeToolCompute = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
