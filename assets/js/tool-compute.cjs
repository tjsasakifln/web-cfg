/**
 * Pure compute modules for CONFENGE high-intent tools.
 * No DOM. Testable with known I/O.
 */
(function (root) {
  "use strict";

  function computeLimiteAditivo(input) {
    const V = Number(input.valorInicial);
    if (!Number.isFinite(V) || V <= 0) {
      return { ok: false, error: "valor_inicial_invalido" };
    }
    const tipo = input.tipo === "reforma" ? "reforma" : "geral";
    const acPrev = Math.max(0, Number(input.acrescimosPrevios) || 0);
    const suPrev = Math.max(0, Number(input.supressoesPrevias) || 0);
    const acNow = Math.max(0, Number(input.acrescimoProposto) || 0);
    const suNow = Math.max(0, Number(input.supressaoProposta) || 0);
    const limAc = tipo === "reforma" ? 0.5 : 0.25;
    const limSu = 0.25;
    const maxAc = V * limAc;
    const maxSu = V * limSu;
    const acTotal = acPrev + acNow;
    const suTotal = suPrev + suNow;
    const salAc = maxAc - acTotal;
    const salSu = maxSu - suTotal;
    const pctAc = acTotal / V;
    const pctSu = suTotal / V;
    let level = "ok";
    const msgs = [];
    if (acTotal > maxAc + 0.005) {
      level = "bad";
      msgs.push("acrescimos_acima_teto");
    } else if (salAc < V * 0.02) {
      level = "warn";
      msgs.push("saldo_acrescimo_baixo");
    } else {
      msgs.push("acrescimos_dentro_teto");
    }
    if (suTotal > maxSu + 0.005) {
      level = "bad";
      msgs.push("supressoes_acima_teto");
    } else if (salSu < V * 0.02) {
      if (level !== "bad") level = "warn";
      msgs.push("saldo_supressao_baixo");
    } else {
      msgs.push("supressoes_dentro_teto");
    }
    return {
      ok: true,
      level,
      msgs,
      V,
      tipo,
      limAc,
      limSu,
      maxAc,
      maxSu,
      acPrev,
      suPrev,
      acNow,
      suNow,
      acTotal,
      suTotal,
      salAc,
      salSu,
      pctAc,
      pctSu,
      withinAc: acTotal <= maxAc + 0.005,
      withinSu: suTotal <= maxSu + 0.005,
    };
  }

  function computeChecklistScore(doneKeys, allKeys, urgencia) {
    const all = allKeys || [];
    const done = (doneKeys || []).filter((k) => all.includes(k));
    const missing = all.filter((k) => !done.includes(k));
    const score = all.length ? done.length / all.length : 0;
    let level = "bad";
    if (score >= 0.75) level = "ok";
    else if (score >= 0.45) level = "warn";
    const next = [];
    if (missing.includes("comunicacao")) next.push("protocolo_formal");
    if (missing.includes("planilha") || missing.includes("composicoes")) next.push("memoria_calculo");
    if (missing.includes("cronologia")) next.push("cronologia");
    if (score >= 0.75) next.push("revisao_independente");
    if (urgencia === "alta" && score < 0.75) next.push("urgente_incompleto");
    return {
      ok: true,
      score,
      score_pct: Math.round(score * 100),
      done: done.length,
      total: all.length,
      missing,
      level,
      next,
      urgencia: urgencia || "media",
    };
  }

  const ATRASO_MAP = {
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
    outros_cont: { resp: "contratado", docs: "nexo_temporal" },
  };

  function computeMatrizAtraso(causes, dias, temMatriz) {
    const selected = (causes || []).filter((k) => ATRASO_MAP[k]);
    if (!selected.length) {
      return { ok: false, error: "nenhuma_causa" };
    }
    const rows = selected.map((k) => ({
      cause: k,
      resp: ATRASO_MAP[k].resp,
      docs: ATRASO_MAP[k].docs,
    }));
    const adm = rows.filter((r) => r.resp === "administracao").length;
    const cont = rows.filter((r) => r.resp === "contratado").length;
    let level = "warn";
    if (adm > cont) level = "ok";
    if (cont > adm && adm === 0) level = "bad";
    return {
      ok: true,
      level,
      dias: Number(dias) || 0,
      tem_matriz: temMatriz || "nao",
      rows,
      counts: {
        administracao: adm,
        contratado: cont,
        compartilhado: rows.filter((r) => r.resp === "compartilhado").length,
      },
      needs_critical_path: true,
    };
  }

  const api = {
    computeLimiteAditivo: computeLimiteAditivo,
    computeChecklistScore: computeChecklistScore,
    computeMatrizAtraso: computeMatrizAtraso,
    ATRASO_MAP: ATRASO_MAP,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ConfengeToolCompute = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
