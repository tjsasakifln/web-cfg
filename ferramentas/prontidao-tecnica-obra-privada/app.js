(function () {
  "use strict";
  var api = window.ConfengePrivateProjectTechnicalReadiness;
  var form = document.getElementById("diagnostico");
  var statusEl = document.getElementById("runtime-status");
  var resultEl = document.getElementById("resultado");
  var resultBody = document.getElementById("resultado-corpo");
  var resultActions = document.getElementById("resultado-acoes");
  var cta = document.getElementById("cta-comercial");
  var ctaArtifact = document.getElementById("cta-artefato");
  var ctaPayload = document.getElementById("cta-payload");
  var lastText = "";
  var lastBridge = "";
  if (!api || !form || !resultBody) return;

  var fields = form.querySelectorAll(".pptr-runtime-fields");
  var run = form.querySelector("button.tool-run");
  var i;
  for (i = 0; i < fields.length; i += 1) fields[i].disabled = false;
  if (run) run.disabled = false;
  if (statusEl) statusEl.hidden = true;

  var T = window.ConfengeTools;
  if (T && T.bindToolLifecycle) T.bindToolLifecycle({ tool: api.ENGINE_ID });

  function emitComplete(result) {
    var event = api.buildAnalyticsEvent(result);
    if (T && T.scrubProps) event = T.scrubProps(event);
    if (T && T.track) T.track("tool_complete", event);
  }

  function readAnswers() {
    var answers = {};
    var ids = api.QUESTION_IDS;
    for (var n = 0; n < ids.length; n += 1) {
      var el = document.getElementById(ids[n]);
      answers[ids[n]] = el && el.value ? el.value : api.UNKNOWN;
    }
    return answers;
  }

  function statusLabel(status) {
    if (status === api.EVIDENCE_PRESENT) return "Evidência presente (autoavaliação)";
    if (status === api.GAP) return "Lacuna";
    return "Desconhecido";
  }

  function priorityLabel(priority) {
    if (priority === api.PRIORITY_BLOCKING) return "bloqueia a decisão declarada";
    if (priority === api.PRIORITY_ATTENTION) return "atenção (não bloqueia a decisão declarada)";
    if (priority === api.PRIORITY_UNKNOWN) return "desconhecido (não melhora nem piora)";
    return "sem lacuna neste domínio";
  }

  function add(parent, tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function render(result) {
    while (resultBody.firstChild) resultBody.removeChild(resultBody.firstChild);
    add(resultBody, "p", "", "Hash da leitura: " + result.result_hash + ". Sem percentual. Prioridade segue regra explícita por domínio.");
    add(resultBody, "p", "", result.method);
    add(resultBody, "p", "", result.limits);
    var list = add(resultBody, "div", "");
    var lines = ["Diagnóstico de prontidão técnica de obra privada", "Hash: " + result.result_hash, ""];
    for (var n = 0; n < result.domains.length; n += 1) {
      var domain = result.domains[n];
      var wrap = add(list, "article", "pptr-domain");
      add(wrap, "h3", "", domain.label);
      var st = add(wrap, "p", "pptr-status");
      st.setAttribute("data-status", domain.status);
      st.textContent = statusLabel(domain.status) + " · " + priorityLabel(domain.priority);
      add(wrap, "p", "", "Evidência que faltaria: " + domain.missing_evidence);
      add(wrap, "p", "", "Consequência decisória possível: " + domain.decision_consequence);
      add(wrap, "p", "", "Próxima verificação: " + domain.next_verification);
      if (domain.limits) add(wrap, "p", "", domain.limits);
      if (domain.candidate_offer) add(wrap, "p", "", "Oferta candidata: " + domain.candidate_offer);
      lines.push(domain.label);
      lines.push(statusLabel(domain.status));
      lines.push("Falta: " + domain.missing_evidence);
      lines.push("Consequência: " + domain.decision_consequence);
      lines.push("Próxima verificação: " + domain.next_verification);
      lines.push("");
    }
    lastText = lines.join("\n");
    lastBridge = JSON.stringify(result.commercial_bridge, null, 2);
    if (resultActions) resultActions.hidden = false;
    if (cta) {
      cta.hidden = false;
      if (ctaArtifact) {
        ctaArtifact.textContent = result.named_gap_artifact
          ? ("Artefato que poderia fechar a lacuna nomeada: " + result.named_gap_artifact + ".")
          : "Não há lacuna nomeada nesta autoavaliação. A conferência documental continua sendo o próximo passo se a decisão for crítica.";
      }
      if (ctaPayload) ctaPayload.textContent = lastBridge;
    }
    var handoff = document.getElementById("prontidao-handoff");
    if (handoff) handoff.hidden = false;
    if (resultEl && resultEl.focus) {
      try { resultEl.focus(); } catch (err) {}
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var result = api.diagnosePrivateProjectTechnicalReadiness(readAnswers(), {
      expected_engine_id: api.ENGINE_ID,
      expected_contract_hash: api.COORDINATION_FIXTURE_HASH,
    });
    render(result);
    emitComplete(result);
  });

  var reset = document.getElementById("btn-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      form.reset();
      while (resultBody.firstChild) resultBody.removeChild(resultBody.firstChild);
      add(resultBody, "p", "", "O resultado aparece aqui depois de classificar as respostas. Contato não é exigido.");
      if (resultActions) resultActions.hidden = true;
      if (cta) cta.hidden = true;
      var handoff = document.getElementById("prontidao-handoff");
      if (handoff) handoff.hidden = true;
    });
  }

  var copyBtn = document.getElementById("btn-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (T && T.copyText) T.copyText(lastText);
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastText);
    });
  }
  var printBtn = document.getElementById("btn-print");
  if (printBtn) {
    printBtn.addEventListener("click", function () { window.print(); });
  }
  var bridgeBtn = document.getElementById("btn-copy-bridge");
  if (bridgeBtn) {
    bridgeBtn.addEventListener("click", function () {
      if (T && T.copyText) T.copyText(lastBridge);
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastBridge);
    });
  }
})();
