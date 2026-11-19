(function () {
  "use strict";

  function alignSinapiBase(edital, planilha, regime) {
    edital = String(edital || "").trim();
    planilha = String(planilha || "").trim();
    regime = String(regime || "").trim();
    if (["desonerado", "nao_desonerado", "silente", "contraditorio"].indexOf(edital) < 0 ||
        ["desonerado", "nao_desonerado", "mista"].indexOf(planilha) < 0 ||
        ["desonerado", "nao_desonerado", "incerto"].indexOf(regime) < 0) {
      return {
        verdict: "Entrada inválida. Use os valores do alinhador.",
        cannot: "Não se conclui enquadramento tributário nem um fator único de conversão."
      };
    }
    if (edital === "contraditorio" || planilha === "mista") {
      return {
        verdict: "Há pontos a esclarecer na referência ou na composição da planilha. Separe as bases, documente os ajustes e confira o edital antes de fechar preço.",
        cannot: "A seleção isolada não decide o enquadramento tributário nem a aceitação da proposta."
      };
    }
    if (regime === "incerto") {
      return {
        verdict: "Confirme o regime tributário da empresa antes de escolher os encargos da proposta. A base de referência do edital não define esse enquadramento.",
        cannot: "Ainda faltam dados para concluir a coerência entre encargos e BDI."
      };
    }
    if (planilha !== regime) {
      return {
        verdict: "A base informada para a proposta difere do regime declarado. Confira encargos, CPRB, ajustes das composições e BDI; copiar a referência do edital não resolve essa diferença.",
        cannot: "A divergência é um alerta para conferência, não uma decisão automática de desclassificação."
      };
    }
    if (edital === "silente") {
      return {
        verdict: "A proposta acompanha o regime declarado, mas a referência do órgão não foi identificada. Confira anexos, competência, UF e critérios de aceitabilidade; esclareça a omissão.",
        cannot: "Isso não demonstra exequibilidade nem aceitação da proposta."
      };
    }
    if (edital === planilha) {
      return {
        verdict: "Referência do órgão e proposta usam a mesma base, compatível com o regime declarado. Confira competência, UF, encargos e BDI.",
        cannot: "Alinhamento de base não prova exequibilidade da proposta."
      };
    }
    return {
      verdict: "A proposta acompanha o regime declarado e difere da referência do órgão. Essa diferença, por si só, não torna a proposta incorreta. Demonstre os custos e confira regras de apresentação, preços máximos e exequibilidade.",
      cannot: "O resultado não autoriza descumprir o edital nem garante a aceitação da proposta."
    };
  }

  function bindSinapi(root) {
    var form = root.querySelector('[data-breakout-tool="sinapi-aligner"]');
    var out = root.querySelector('[data-breakout-out="sinapi-aligner"]');
    var button = root.querySelector('[data-breakout-run="sinapi-aligner"]');
    if (!form || !out || !button) return;
    button.addEventListener("click", function () {
      var edital = form.querySelector('[name="edital"]').value;
      var planilha = form.querySelector('[name="planilha"]').value;
      var regime = form.querySelector('[name="regime"]').value;
      var result = alignSinapiBase(edital, planilha, regime);
      out.hidden = false;
      out.textContent = result.verdict + " " + result.cannot;
    });
  }

  document.querySelectorAll(".breakout-chassis").forEach(function (root) {
    bindSinapi(root);
  });
})();
