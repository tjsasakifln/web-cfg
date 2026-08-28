/**
 * Pure compute modules for CONFENGE high-intent tools. No DOM.
 * Keep in lockstep with tool-compute.cjs.
 *
 * Primary sources:
 * - Lei 14.133/2021 art. 125 (acréscimo 25% geral / 50% reforma de edifício ou
 *   equipamento; supressão 25%; eixos independentes).
 * - Lei 14.133 + TCU (reequilíbrio): prontidão documental, sem direito.
 * - Matriz de atraso: hipótese preliminar, sem veredito.
 */
(function (root) {
  "use strict";

  var MAX_BRL = 1e12;
  var ART125_AC_GERAL = 0.25;
  var ART125_AC_REFORMA = 0.5;
  var ART125_SU = 0.25;

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

  function toCents(n) {
    return Math.round(n * 100);
  }
  function fromCents(c) {
    return c / 100;
  }
  function roundBRL(n) {
    if (!Number.isFinite(n)) return NaN;
    return fromCents(toCents(n));
  }

  function nonFinitePaths(obj, prefix) {
    var bad = [];
    function walk(v, p) {
      if (typeof v === "number") {
        if (!Number.isFinite(v)) bad.push(p);
      } else if (Array.isArray(v)) {
        v.forEach(function (x, i) { walk(x, p + "[" + i + "]"); });
      } else if (v && typeof v === "object") {
        Object.keys(v).forEach(function (k) { walk(v[k], p + "." + k); });
      }
    }
    walk(obj, prefix || "root");
    return bad;
  }

  function readMoney(v, field, opts) {
    opts = opts || {};
    if (v === null || v === undefined || v === "") {
      if (opts.required) return { ok: false, error: field + "_obrigatorio" };
      return { ok: true, cents: 0, value: 0, rounded: false };
    }
    if (typeof v === "string") {
      var p = parseBRL(v);
      if (!p.ok) return { ok: false, error: field + "_invalido", cause: p.error };
      v = p.value;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, error: field + "_invalido" };
    }
    if (v < 0) return { ok: false, error: field + "_negativo" };
    if (v > MAX_BRL) return { ok: false, error: field + "_overflow" };
    var cents = toCents(v);
    if (!Number.isSafeInteger(cents) || cents < 0) return { ok: false, error: field + "_overflow" };
    var value = fromCents(cents);
    return { ok: true, cents: cents, value: value, rounded: Math.abs(value - v) > 1e-9 };
  }

  function formatBRL(n) {
    if (!Number.isFinite(n)) return "n/d";
    var cents = toCents(n);
    var neg = cents < 0;
    cents = Math.abs(cents);
    var whole = String(Math.floor(cents / 100));
    var frac = String(cents % 100);
    if (frac.length < 2) frac = "0" + frac;
    var grouped = "";
    while (whole.length > 3) {
      grouped = "." + whole.slice(-3) + grouped;
      whole = whole.slice(0, -3);
    }
    grouped = whole + grouped;
    return (neg ? "-R$ " : "R$ ") + grouped + "," + frac;
  }

  function formatPctRatio(ratio) {
    if (!Number.isFinite(ratio)) return "n/d";
    var x = Math.round(ratio * 10000) / 100;
    return String(x).replace(".", ",") + "%";
  }

  function computeLimiteAditivo(input) {
    input = input || {};
    var V = readMoney(input.valorInicial, "valor_inicial", { required: true });
    if (!V.ok) return { ok: false, error: V.error };
    if (V.cents <= 0) return { ok: false, error: "valor_inicial_invalido" };
    var tipoRaw = input.tipo;
    var tipo;
    if (tipoRaw == null || tipoRaw === "") tipo = "geral";
    else if (tipoRaw === "reforma" || tipoRaw === "geral") tipo = tipoRaw;
    else return { ok: false, error: "tipo_invalido" };
    var acPrev = readMoney(input.acrescimosPrevios, "acrescimos_previos");
    var suPrev = readMoney(input.supressoesPrevias, "supressoes_previas");
    var acNow = readMoney(input.acrescimoProposto, "acrescimo_proposto");
    var suNow = readMoney(input.supressaoProposta, "supressao_proposta");
    var moneyErr = [acPrev, suPrev, acNow, suNow].filter(function (x) { return !x.ok; })[0];
    if (moneyErr) return { ok: false, error: moneyErr.error };
    var limAc = tipo === "reforma" ? ART125_AC_REFORMA : ART125_AC_GERAL;
    var limSu = ART125_SU;
    var maxAcCents = Math.round(V.cents * limAc);
    var maxSuCents = Math.round(V.cents * limSu);
    var acTotalCents = acPrev.cents + acNow.cents;
    var suTotalCents = suPrev.cents + suNow.cents;
    if (!Number.isSafeInteger(acTotalCents) || !Number.isSafeInteger(suTotalCents)) {
      return { ok: false, error: "overflow" };
    }
    var salAcCents = maxAcCents - acTotalCents;
    var salSuCents = maxSuCents - suTotalCents;
    var pctAc = acTotalCents / V.cents;
    var pctSu = suTotalCents / V.cents;
    var withinAc = acTotalCents <= maxAcCents;
    var withinSu = suTotalCents <= maxSuCents;
    var roundedFields = [];
    if (V.rounded) roundedFields.push("valor_inicial");
    if (acPrev.rounded) roundedFields.push("acrescimos_previos");
    if (suPrev.rounded) roundedFields.push("supressoes_previas");
    if (acNow.rounded) roundedFields.push("acrescimo_proposto");
    if (suNow.rounded) roundedFields.push("supressao_proposta");
    var alerts = [];
    if (tipo === "reforma") alerts.push({ code: "reforma_selecionada", severity: "info", text: "Limite de acréscimo de 50% aplica-se a reforma de edifício ou equipamento." });
    if (acNow.cents > 0 && suNow.cents > 0) alerts.push({ code: "acrescimo_e_supressao", severity: "warn", text: "Há acréscimo e supressão propostos. Trate os saldos de forma independente." });
    if (V.value > 0 && V.value < 1000) alerts.push({ code: "valor_base_suspeito", severity: "warn", text: "O valor inicial informado é muito baixo. Confira o valor inicial atualizado." });
    if (!withinAc) alerts.push({ code: "acrescimos_acima_teto", severity: "bad", text: "Total de acréscimos ultrapassa o limite numérico calculado com os dados informados." });
    else if (salAcCents < Math.round(V.cents * 0.02)) alerts.push({ code: "saldo_acrescimo_baixo", severity: "warn", text: "Saldo residual de acréscimo inferior a 2% do valor inicial." });
    if (!withinSu) alerts.push({ code: "supressoes_acima_teto", severity: "bad", text: "Total de supressões ultrapassa o limite numérico de 25%." });
    else if (salSuCents < Math.round(V.cents * 0.02)) alerts.push({ code: "saldo_supressao_baixo", severity: "warn", text: "Saldo residual de supressão inferior a 2%." });
    if (roundedFields.length) alerts.push({ code: "arredondamento_centavos", severity: "info", text: "Valores foram arredondados para centavos. O arredondamento ficou visível nas premissas." });
    var level = "ok";
    if (alerts.some(function (a) { return a.severity === "bad"; })) level = "bad";
    else if (alerts.some(function (a) { return a.severity === "warn"; })) level = "warn";
    var msgs = [withinAc ? "acrescimos_dentro_teto" : "acrescimos_acima_teto", withinSu ? "supressoes_dentro_teto" : "supressoes_acima_teto"];
    var labelOk = "Dentro do limite numérico calculado com os dados informados.";
    var labelBad = "Acima do limite numérico calculado com os dados informados.";
    var acrescimos = {
      anteriores: acPrev.value, proposto: acNow.value, total: fromCents(acTotalCents),
      limite: fromCents(maxAcCents), saldo: fromCents(salAcCents), percentualUtilizado: pctAc,
      dentroDoLimite: withinAc, labelStatus: withinAc ? labelOk : labelBad
    };
    var supressoes = {
      anteriores: suPrev.value, proposta: suNow.value, total: fromCents(suTotalCents),
      limite: fromCents(maxSuCents), saldo: fromCents(salSuCents), percentualUtilizado: pctSu,
      dentroDoLimite: withinSu, labelStatus: withinSu ? labelOk : labelBad
    };
    var out = {
      ok: true, level: level, msgs: msgs, alerts: alerts, V: V.value, tipo: tipo,
      limAc: limAc, limSu: limSu, maxAc: fromCents(maxAcCents), maxSu: fromCents(maxSuCents),
      acPrev: acPrev.value, suPrev: suPrev.value, acNow: acNow.value, suNow: suNow.value,
      acTotal: fromCents(acTotalCents), suTotal: fromCents(suTotalCents),
      salAc: fromCents(salAcCents), salSu: fromCents(salSuCents), pctAc: pctAc, pctSu: pctSu,
      withinAc: withinAc, withinSu: withinSu, roundedFields: roundedFields,
      source: "Lei 14.133/2021 art. 125",
      acrescimos: acrescimos, supressoes: supressoes
    };
    if (nonFinitePaths(out).length) return { ok: false, error: "nao_finito", paths: nonFinitePaths(out) };
    return out;
  }

  function explainLimite(r) {
    var job = "Conferir se o próximo acréscimo ou a próxima supressão ainda cabe no limite numérico do art. 125.";
    var decision = "Seguir com o aditivo só no recorte numérico informado, ou enquadrar o excesso antes de protocolar.";
    if (!r || !r.ok) {
      return {
        job: job, decision: "Não calcular com dados inválidos.",
        premises: ["O cálculo só ocorre com valor inicial maior que zero e valores não negativos, em reais."],
        layers: {
          fato: "Os valores informados não puderam ser lidos como reais.",
          calculo: "Nenhum percentual do art. 125 foi aplicado.",
          inferencia: "Sem inferência: o cálculo não foi feito.",
          unknown: "Não sabemos o valor inicial atualizado real nem a natureza jurídica do objeto no contrato concreto."
        },
        cta: { branch: "invalido", href: "/aditivos-obras-publicas/", label: "Enquadrar o aditivo", offer: "aditivos-obras-publicas" },
        legalDisclaimer: "Ferramenta orientativa. Não é parecer jurídico e não valida o aditivo concreto."
      };
    }
    var tipoLab = r.tipo === "reforma"
      ? "reforma de edifício ou equipamento (acréscimo 50%, supressão 25%)"
      : "obra ou serviço em geral (acréscimo 25%, supressão 25%)";
    var premises = [
      "Fonte: Lei nº 14.133/2021, art. 125.",
      "Base informada: " + formatBRL(r.V) + " como valor inicial atualizado.",
      "Tipo informado: " + tipoLab + ".",
      "Acréscimo e supressão são eixos independentes; compensação no mesmo aditivo não zera os saldos neste cálculo.",
      "Valores arredondados para centavos." + (r.roundedFields && r.roundedFields.length ? " Campos arredondados: " + r.roundedFields.join(", ") + "." : "")
    ];
    var fato = "Você informou base " + formatBRL(r.V) + ", acréscimos anteriores " + formatBRL(r.acPrev) +
      " e proposto " + formatBRL(r.acNow) + "; supressões anteriores " + formatBRL(r.suPrev) +
      " e proposta " + formatBRL(r.suNow) + ".";
    var calculo = "Teto de acréscimo " + formatPctRatio(r.limAc) + " = " + formatBRL(r.maxAc) +
      "; utilizado " + formatPctRatio(r.pctAc) + " (" + formatBRL(r.acTotal) + "); saldo " + formatBRL(r.salAc) +
      ". Teto de supressão " + formatPctRatio(r.limSu) + " = " + formatBRL(r.maxSu) +
      "; utilizado " + formatPctRatio(r.pctSu) + " (" + formatBRL(r.suTotal) + "); saldo " + formatBRL(r.salSu) + ".";
    var inferencia = (!r.withinAc || !r.withinSu)
      ? "Com os dados informados, pelo menos um eixo ultrapassa o teto numérico do art. 125. Isso não decide sozinho a validade jurídica do aditivo."
      : "Com os dados informados, os dois eixos cabem no teto numérico. A validade ainda depende do objeto, da instrução e do contrato concreto.";
    var unknown = "Não classifica reforma versus obra nova, não lê o processo e não sabe se o valor inicial informado já inclui reajuste.";
    var cta = (!r.withinAc || !r.withinSu)
      ? { branch: "excedido", href: "/aditivos-obras-publicas/", label: "Enquadrar o aditivo", offer: "aditivos-obras-publicas" }
      : { branch: "dentro", href: "/aditivos-obras-publicas/", label: "Validar objeto e instrução", offer: "aditivos-obras-publicas" };
    return {
      job: job, decision: decision, premises: premises,
      layers: { fato: fato, calculo: calculo, inferencia: inferencia, unknown: unknown },
      cta: cta,
      legalDisclaimer: "Ferramenta orientativa. Não é parecer jurídico e não valida o aditivo concreto."
    };
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
  var REEQ_BLOCKER_CRITICALITY = { fato_gerador: 0, nexo: 1, memoria: 2, cronologia: 3, comunicacao: 4, contrato: 5 };

  function computeReequilibrio(states, opts) {
    opts = opts || {};
    var urgencia = opts.urgencia || "media", materialidade = opts.materialidade || "nao_informada", statesMap = states || {};
    var missingBlockers = [], missingImportant = [], missingProcess = [], naKeys = [], weighted = 0, weightDenom = 0;
    Object.keys(REEQ_CATEGORIES).forEach(function (catId) {
      var cat = REEQ_CATEGORIES[catId], met = 0, applicable = 0;
      cat.items.forEach(function (item) {
        var st = statesMap[item.key] || "missing";
        if (st === "na") {
          naKeys.push(item.key);
          return;
        }
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
    if (!Number.isFinite(score)) score = 0;
    var hasCentralBlocker = missingBlockers.length > 0;
    var level = "bad", readiness = "baixa";
    if (!hasCentralBlocker && score >= 0.85) { level = "ok"; readiness = "alta"; }
    else if (!hasCentralBlocker && score >= 0.55) { level = "warn"; readiness = "media"; }
    else if (hasCentralBlocker) { level = "bad"; readiness = score >= 0.4 ? "media_com_bloqueio" : "baixa"; }
    else { level = "warn"; readiness = "media"; }
    if (hasCentralBlocker && (level === "ok" || readiness === "alta")) { level = "bad"; readiness = "media_com_bloqueio"; }
    var blockersOrdered = missingBlockers.slice();
    if (urgencia === "alta") {
      blockersOrdered.sort(function (a, b) {
        var ca = REEQ_BLOCKER_CRITICALITY[a.key], cb = REEQ_BLOCKER_CRITICALITY[b.key];
        return (ca != null ? ca : 9) - (cb != null ? cb : 9);
      });
    }
    var buckets;
    if (urgencia === "baixa") {
      buckets = [
        { items: blockersOrdered, priority: 1, reason: "bloqueador" },
        { items: missingProcess, priority: 2, reason: "organizacao" },
        { items: missingImportant, priority: 3, reason: "suporte_economico" }
      ];
    } else if (urgencia === "alta") {
      buckets = [
        { items: blockersOrdered, priority: 1, reason: "bloqueador_urgente" },
        { items: missingImportant, priority: 2, reason: "suporte_economico_urgente" },
        { items: missingProcess, priority: 3, reason: "organizacao" }
      ];
    } else {
      buckets = [
        { items: blockersOrdered, priority: 1, reason: "bloqueador" },
        { items: missingImportant, priority: 2, reason: "suporte_economico" },
        { items: missingProcess, priority: 3, reason: "organizacao" }
      ];
    }
    var order = [];
    buckets.forEach(function (b) {
      b.items.forEach(function (i) {
        order.push({ key: i.key, label: i.label, priority: b.priority, reason: b.reason, urgencia: urgencia });
      });
    });
    var ressalvas = [];
    if (hasCentralBlocker) ressalvas.push("Há bloqueador(es) central(is) em aberto.");
    if (materialidade === "alta") ressalvas.push("Materialidade alta: organize revisão técnica antes de protocolar.");
    if (urgencia === "alta" && hasCentralBlocker) ressalvas.push("Urgência alta com bloqueadores abertos.");
    var readinessLabel = readiness === "alta" ? "Prontidão documental alta" : readiness === "media" ? "Prontidão documental média" : readiness === "media_com_bloqueio" ? "Prontidão documental limitada por bloqueadores" : "Prontidão documental baixa";
    var synthesis = readiness === "alta" ? "Os bloqueadores centrais estão cobertos." : "O dossiê ainda não está pronto para protocolar com segurança documental.";
    if (missingBlockers.length) synthesis += " Bloqueadores em aberto: " + missingBlockers.map(function (i) { return i.label; }).join(", ") + ".";
    var out = {
      ok: true, score: score, score_pct: Math.round(score * 100), level: level, readiness: readiness,
      readinessLabel: readinessLabel, hasCentralBlocker: hasCentralBlocker,
      missingBlockers: missingBlockers.map(function (i) { return i.key; }),
      missingImportant: missingImportant.map(function (i) { return i.key; }),
      missingProcess: missingProcess.map(function (i) { return i.key; }),
      naKeys: naKeys, correctionOrder: order, ressalvas: ressalvas, urgencia: urgencia,
      materialidade: materialidade, synthesis: synthesis
    };
    if (nonFinitePaths(out).length) return { ok: false, error: "nao_finito", paths: nonFinitePaths(out) };
    return out;
  }

  function explainReequilibrio(r) {
    var job = "Ver se o dossiê documental do pedido de reequilíbrio está pronto ou se há bloqueadores centrais.";
    var decision = "Corrigir lacunas na ordem indicada, ou avançar para leitura contratual se a prontidão documental já for alta.";
    if (!r || !r.ok) {
      return {
        job: job, decision: "Não diagnosticar com estados ilegíveis.",
        premises: ["Marcações em aberto entram como pendentes. N/A não conta como bloqueio."],
        layers: {
          fato: "Não foi possível ler as marcações do checklist.",
          calculo: "Nenhum escore foi aplicado.",
          inferencia: "Sem inferência.",
          unknown: "A ferramenta não lê o processo real nem julga se existe direito ao reequilíbrio."
        },
        cta: { branch: "invalido", href: "/reequilibrio-obras-publicas/", label: "Enquadrar o dossiê de reequilíbrio", offer: "reequilibrio-obras-publicas" },
        legalDisclaimer: "Diagnóstico documental orientativo. Cobertura alta não significa direito ao reequilíbrio."
      };
    }
    var fato = "Cobertura ponderada " + r.score_pct + "%. Bloqueadores: " + (r.missingBlockers || []).length +
      ". Suporte econômico pendente: " + (r.missingImportant || []).length +
      ". Organização pendente: " + (r.missingProcess || []).length +
      ". Não aplicáveis: " + (r.naKeys ? r.naKeys.length : 0) + ".";
    var calculo = "O escore pondera bloqueadores (55%), suporte econômico (30%) e organização (15%). Itens N/A saem do denominador e não forçam bloqueio.";
    var inferencia = r.hasCentralBlocker
      ? "Há bloqueador central em aberto; prontidão alta fica impedida. Isso não conclui se o crédito existe."
      : (r.readiness === "alta"
        ? "Os bloqueadores centrais estão cobertos neste recorte documental. Ainda falta leitura do contrato concreto."
        : "A prontidão documental ainda é parcial, sem bloqueador central marcado.");
    var unknown = "Não sabemos se o fato gerador é de reequilíbrio, não quantificamos valor a receber e não lemos o processo real.";
    var cta = r.hasCentralBlocker
      ? { branch: "bloqueado", href: "/reequilibrio-obras-publicas/", label: "Enquadrar o dossiê de reequilíbrio", offer: "reequilibrio-obras-publicas" }
      : { branch: "pronto", href: "/reequilibrio-obras-publicas/", label: "Validar o enquadramento", offer: "reequilibrio-obras-publicas" };
    return {
      job: job, decision: decision,
      premises: [
        "Fonte: Lei nº 14.133/2021 (alocação de riscos e art. 124) e Manual de Licitações e Contratos do TCU, capítulo de reequilíbrio.",
        "Urgência informada: " + r.urgencia + ". Materialidade: " + r.materialidade + ".",
        "O escore mede prontidão documental, não direito."
      ],
      layers: { fato: fato, calculo: calculo, inferencia: inferencia, unknown: unknown },
      cta: cta,
      legalDisclaimer: "Diagnóstico documental orientativo. Cobertura alta não significa direito ao reequilíbrio."
    };
  }

  function normalizeParte(p) {
    var s = String(p || "").toLowerCase();
    if (s.indexOf("adm") === 0) return "administracao";
    if (s.indexOf("cont") === 0) return "contratado";
    if (s.indexOf("comp") === 0) return "compartilhado";
    return "indefinida";
  }

  function parseISODate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
    var t = Date.parse(String(s) + "T00:00:00Z");
    return Number.isFinite(t) ? t : null;
  }

  function readDuration(raw) {
    if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
    var n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: "duracao_invalida" };
    if (n < 0) return { ok: false, error: "duracao_negativa" };
    if (n > 36500) return { ok: false, error: "duracao_overflow" };
    return { ok: true, value: n };
  }

  function computeMatrizEventos(events, opts) {
    opts = opts || {};
    var list = (events || []).filter(function (ev) { return ev && (ev.causa || ev.cause); });
    if (!list.length) return { ok: false, error: "nenhum_evento" };
    var invalid = [];
    var rows = list.map(function (ev, idx) {
      var causa = String(ev.causa || ev.cause || "").trim();
      var parte = normalizeParte(ev.parte || ev.resp);
      var temCom = !!ev.comunicacaoContemporanea, temDoc = !!ev.documentoDisponivel;
      var crit = ev.impactoCaminhoCritico || "incerto", conc = !!ev.concorrencia;
      var dur = readDuration(ev.duracaoDias);
      if (!dur.ok) invalid.push({ id: ev.id || ("ev-" + (idx + 1)), error: dur.error });
      var start = parseISODate(ev.dataInicio);
      var end = parseISODate(ev.dataFim);
      if (ev.dataInicio && !start) invalid.push({ id: ev.id || ("ev-" + (idx + 1)), error: "data_inicio_invalida" });
      if (ev.dataFim && !end) invalid.push({ id: ev.id || ("ev-" + (idx + 1)), error: "data_fim_invalida" });
      if (start != null && end != null && end < start) invalid.push({ id: ev.id || ("ev-" + (idx + 1)), error: "periodo_invertido" });
      var missingDocs = [];
      if (!temCom) missingDocs.push("comunicação contemporânea do evento");
      if (!temDoc) missingDocs.push("documento de suporte localizado");
      if (!ev.atividadeAfetada) missingDocs.push("vínculo com atividade do cronograma");
      var hipotese = "responsabilidade não determinada";
      if (parte === "administracao") hipotese = "hipótese preliminar de imputação à Administração (depende de prova)";
      else if (parte === "contratado") hipotese = "hipótese preliminar de imputação ao contratado (depende de prova)";
      else if (parte === "compartilhado") hipotese = "possível concorrência de causas / responsabilidade compartilhada";
      var precisaNexo = !start || (!end && dur.value == null);
      var precisaCritico = crit === "incerto" || !ev.atividadeAfetada;
      return {
        id: ev.id || "ev-" + (idx + 1), causa: causa, parte: parte, hipotese: hipotese,
        documentosExistentes: temDoc ? ["documento indicado"] : [], documentosFaltantes: missingDocs,
        precisaNexoTemporal: precisaNexo,
        precisaImpactoCritico: precisaCritico,
        possivelConcorrencia: conc || parte === "compartilhado",
        impactoCaminhoCritico: crit, atividadeAfetada: ev.atividadeAfetada || "",
        dataInicio: ev.dataInicio || "", dataFim: ev.dataFim || "",
        startMs: start, endMs: end != null ? end : start,
        duracaoDias: dur.ok ? dur.value : null, observacao: ev.observacao || ""
      };
    });
    if (invalid.length) return { ok: false, error: "evento_invalido", invalid: invalid };
    var overlapIds = {};
    var overlapCount = 0;
    var i, j;
    for (i = 0; i < rows.length; i++) {
      for (j = i + 1; j < rows.length; j++) {
        var a = rows[i], b = rows[j];
        if (a.startMs == null || b.startMs == null) continue;
        var aEnd = a.endMs != null ? a.endMs : a.startMs;
        var bEnd = b.endMs != null ? b.endMs : b.startMs;
        if (a.startMs <= bEnd && b.startMs <= aEnd) {
          overlapCount += 1;
          overlapIds[a.id] = true;
          overlapIds[b.id] = true;
          a.possivelConcorrencia = true;
          b.possivelConcorrencia = true;
        }
      }
    }
    rows.forEach(function (r) {
      delete r.startMs;
      delete r.endMs;
    });
    var semProva = rows.filter(function (r) { return r.documentosFaltantes.length > 0; }).length;
    var semPeriodo = rows.filter(function (r) { return r.precisaNexoTemporal; }).length;
    var semCritico = rows.filter(function (r) { return r.precisaImpactoCritico; }).length;
    var comConc = rows.filter(function (r) { return r.possivelConcorrencia; }).length;
    var nextRecords = [];
    if (semProva) nextRecords.push("Registrar comunicação contemporânea e anexar documentos por evento.");
    if (semPeriodo) nextRecords.push("Definir data inicial e final (ou duração) de cada evento.");
    if (semCritico) nextRecords.push("Vincular eventos à atividade e ao impacto no caminho crítico.");
    if (comConc || overlapCount) nextRecords.push("Analisar sobreposição temporal entre eventos concorrentes.");
    var out = {
      ok: true, level: "hypothesis", events: rows, temMatriz: opts.temMatriz || "",
      summary: {
        totalEventos: rows.length, semProvaContemporanea: semProva, semPeriodoDefinido: semPeriodo,
        semVinculoCritico: semCritico, possiveisSobreposicoes: comConc,
        sobrepostosPorData: Object.keys(overlapIds).length, paresSobrepostos: overlapCount,
        proximosRegistros: nextRecords
      },
      synthesis: "Foram analisados " + rows.length + " evento(s). As imputações abaixo são hipóteses preliminares e tendências que dependem de prova. Não há veredito de responsabilidade nem soma automática de dias.",
      disclaimer: "Resultado orientativo. Não constitui laudo pericial nem conclusão de culpa."
    };
    if (nonFinitePaths(out).length) return { ok: false, error: "nao_finito", paths: nonFinitePaths(out) };
    return out;
  }

  var ATRASO_MAP = {
    chuva: { resp: "compartilhado", docs: "pluviometria_diario" },
    projeto: { resp: "administracao", docs: "versoes_projeto_os" },
    desaprop: { resp: "administracao", docs: "liberacao_area" },
    pagamento: { resp: "administracao", docs: "medicoes_comprovantes" },
    material: { resp: "compartilhado", docs: "cotacoes_lead_time" },
    mao_obra: { resp: "contratado", docs: "escalas_subcontratos" },
    equip: { resp: "contratado", docs: "manutencao_backup" },
    ordem: { resp: "administracao", docs: "os_paralisacao" },
    medicao: { resp: "administracao", docs: "protocolos_medicao" },
    outros_adm: { resp: "administracao", docs: "nexo_temporal" },
    outros_cont: { resp: "contratado", docs: "nexo_temporal" }
  };

  function computeMatrizAtraso(causes, dias, temMatriz) {
    var selected = (causes || []).filter(Boolean);
    if (!selected.length) return { ok: false, error: "nenhuma_causa" };
    var dur = readDuration(dias);
    if (!dur.ok) return { ok: false, error: dur.error };
    var events = selected.map(function (k) {
      var m = ATRASO_MAP[k] || { resp: "indefinida", docs: "nexo_temporal" };
      return { causa: k, parte: m.resp, comunicacaoContemporanea: false, documentoDisponivel: false, impactoCaminhoCritico: "incerto", duracaoDias: selected.length === 1 ? dur.value : null };
    });
    var base = computeMatrizEventos(events, { temMatriz: temMatriz });
    if (!base.ok) return base;
    var rows = base.events.map(function (r) { return { cause: r.causa, resp: r.parte, docs: (ATRASO_MAP[r.causa] || {}).docs || "nexo_temporal" }; });
    var adm = rows.filter(function (r) { return r.resp === "administracao"; }).length;
    var cont = rows.filter(function (r) { return r.resp === "contratado"; }).length;
    return {
      ok: true, level: "hypothesis", dias: dur.value == null ? 0 : dur.value, tem_matriz: temMatriz || "nao", rows: rows,
      counts: { administracao: adm, contratado: cont, compartilhado: rows.filter(function (r) { return r.resp === "compartilhado"; }).length },
      needs_critical_path: true, events: base.events, summary: base.summary, synthesis: base.synthesis
    };
  }

  function explainMatriz(r) {
    var job = "Registrar eventos de atraso e ver hipóteses preliminares e lacunas de prova.";
    var decision = "Completar prova e período, ou enquadrar cronograma e nexo antes de pedir prazo ou custo.";
    if (!r || !r.ok) {
      return {
        job: job, decision: "Adicionar ao menos um evento com causa.",
        premises: ["Sem evento descrito não há hipótese."],
        layers: {
          fato: "Nenhum evento válido foi registrado.",
          calculo: "A ferramenta não soma dias.",
          inferencia: "Sem hipótese.",
          unknown: "Não há diário de obra nem processo nesta leitura."
        },
        cta: { branch: "vazio", href: "/atrasos-prorrogacao-obras-publicas/", label: "Enquadrar cronograma e prova", offer: "atrasos-prorrogacao-obras-publicas" },
        legalDisclaimer: "Resultado orientativo. Não constitui laudo pericial nem conclusão de culpa."
      };
    }
    var s = r.summary || {};
    var fato = "Eventos: " + (s.totalEventos || 0) + ". Sem prova contemporânea: " + (s.semProvaContemporanea || 0) +
      ". Sem período: " + (s.semPeriodoDefinido || 0) + ". Sobreposições por data: " + (s.sobrepostosPorData || 0) + ".";
    var calculo = "Não há soma automática de dias nem teto legal aplicado. Sobreposição é interseção de datas, não culpa.";
    var inferencia = "As imputações por evento permanecem hipótese. Sobreposição ou ausência de prova não vira veredito.";
    var unknown = "Não lemos o diário de obra, o caminho crítico real nem a matriz de riscos assinada, salvo o que você marcou.";
    var needs = (s.semProvaContemporanea || 0) + (s.semPeriodoDefinido || 0);
    var cta = needs
      ? { branch: "lacunas", href: "/atrasos-prorrogacao-obras-publicas/", label: "Enquadrar cronograma e prova", offer: "atrasos-prorrogacao-obras-publicas" }
      : { branch: "completa", href: "/atrasos-prorrogacao-obras-publicas/", label: "Validar causa e caminho crítico", offer: "atrasos-prorrogacao-obras-publicas" };
    return {
      job: job, decision: decision,
      premises: [
        "Força maior e fato da Administração não se presumem: demonstram-se.",
        "Nível do resultado: hipótese, nunca ok/bad por contagem de dias."
      ],
      layers: { fato: fato, calculo: calculo, inferencia: inferencia, unknown: unknown },
      cta: cta,
      legalDisclaimer: r.disclaimer || "Resultado orientativo. Não constitui laudo pericial nem conclusão de culpa."
    };
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

  var TOOL_JOBS = {
    hub: { job: "Escolher o recorte certo para a decisão do contrato agora.", decision: "Não misturar limite numérico, prontidão documental, hipótese de atraso e fato público." },
    limite: { job: "Conferir se o próximo acréscimo ou a próxima supressão ainda cabe no limite numérico do art. 125.", decision: "Seguir no recorte numérico ou enquadrar o excesso." },
    reequilibrio: { job: "Ver se o dossiê documental do pedido de reequilíbrio está pronto ou se há bloqueadores centrais.", decision: "Corrigir lacunas na ordem indicada, sem tratar escore como direito." },
    matriz: { job: "Registrar eventos de atraso e ver hipóteses preliminares e lacunas de prova.", decision: "Completar prova e período antes de pedir prazo ou custo." },
    diagnostico: { job: "Ler o que o recorte público já mostra sobre um contrato e o que continua sem informação.", decision: "Separar fato oficial, derivado e desconhecido antes de pedir segunda leitura humana." }
  };

  var api = {
    parseBRL: parseBRL, readMoney: readMoney, roundBRL: roundBRL, formatBRL: formatBRL,
    nonFinitePaths: nonFinitePaths, MAX_BRL: MAX_BRL,
    computeLimiteAditivo: computeLimiteAditivo, explainLimite: explainLimite,
    computeChecklistScore: computeChecklistScore, computeReequilibrio: computeReequilibrio,
    explainReequilibrio: explainReequilibrio, computeMatrizAtraso: computeMatrizAtraso,
    computeMatrizEventos: computeMatrizEventos, explainMatriz: explainMatriz,
    computeAditivoReadiness: computeAditivoReadiness,
    REEQ_CATEGORIES: REEQ_CATEGORIES, ATRASO_MAP: ATRASO_MAP, TOOL_JOBS: TOOL_JOBS,
    ART125_AC_GERAL: ART125_AC_GERAL, ART125_AC_REFORMA: ART125_AC_REFORMA, ART125_SU: ART125_SU
  };
  root.ConfengeToolCompute = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
