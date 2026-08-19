(function () {
  "use strict";

  function alignSinapiBase(edital, planilha, regime) {
    var allowed = {
      desonerado: true,
      nao_desonerado: true,
      silente: true,
      contraditorio: true,
      mista: true,
      incerto: true
    };
    if (!allowed[edital] || !allowed[planilha] || !allowed[regime]) {
      return {
        verdict: "Entrada inválida. Use os valores do alinhador.",
        cannot: "Não se conclui enquadramento tributário nem um fator único de conversão."
      };
    }
    if (edital === "contraditorio" || planilha === "mista") {
      return {
        verdict: "Há contradição ou mistura de bases. Não feche preço sem memória e sem a regra do órgão.",
        cannot: "Não se conclui qual tabela prevalece só pela página."
      };
    }
    if (edital === "silente") {
      return {
        verdict: "O edital não fixou a base. Confirme planilha modelo, comunicação do órgão e data-base antes de escolher tabela.",
        cannot: "Silêncio do edital não autoriza default nacional."
      };
    }
    var aligned = edital === planilha && (edital === "desonerado" || edital === "nao_desonerado");
    if (aligned && regime === edital) {
      return {
        verdict: "Edital, planilha e regime apontam a mesma base. Ainda confira data-base e BDI na mesma referência.",
        cannot: "Alinhamento de base não prova exequibilidade da proposta."
      };
    }
    if (aligned && regime !== edital) {
      return {
        verdict: "A planilha segue o edital, mas o regime da empresa não coincide com a base. Trate a diferença na margem real, não trocando a tabela do certame.",
        cannot: "Não se conclui que a empresa deva mudar de regime só para caber na tabela."
      };
    }
    return {
      verdict: "Planilha e edital não estão na mesma base. Corrija antes de enviar. Trocar tabela para baratear unitário é o erro clássico.",
      cannot: "Não se conclui um fator único para converter uma tabela na outra."
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
