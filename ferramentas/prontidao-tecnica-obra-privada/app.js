(function () {
  "use strict";
  var api = window.ConfengePrivateProjectTechnicalReadiness;
  var form = document.getElementById("diagnostico");
  var statusEl = document.getElementById("runtime-status");
  var resultEl = document.getElementById("resultado");
  var resultBody = document.getElementById("resultado-corpo");
  var resultActions = document.getElementById("resultado-acoes");
  var cta = document.getElementById("cta-comercial");
  var lastText = "";
  var lastResult = null;
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

  function readDestinationMap() {
    var el = document.getElementById("pptr-destination-map");
    if (!el) return { by_offer_id: {}, by_purchase_id: {}, by_route_id: {} };
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return { by_offer_id: {}, by_purchase_id: {}, by_route_id: {} };
    }
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
    return "sem lacuna neste tema";
  }

  function add(parent, tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function addLink(parent, href, className, text, attrs) {
    var el = document.createElement("a");
    if (className) el.className = className;
    el.href = href;
    el.textContent = text;
    var keys = attrs ? Object.keys(attrs) : [];
    for (var n = 0; n < keys.length; n += 1) el.setAttribute(keys[n], attrs[keys[n]]);
    parent.appendChild(el);
    return el;
  }

  function destinationFor(route) {
    return api.resolveCommercialDestination({
      offer_id: route.offer_id,
      purchase_id: route.purchase_id,
      route_id: route.id,
    }, readDestinationMap());
  }

  function renderRoute(parent, route, kind, justification) {
    if (!route) return;
    var wrap = add(parent, "article", "pptr-route");
    wrap.setAttribute("data-route-id", route.id);
    wrap.setAttribute("data-route-kind", kind);
    add(wrap, "h3", "", route.public_name);
    add(wrap, "p", "", route.why);
    add(wrap, "p", "", "Por que importa: " + (justification || route.why));
    add(wrap, "p", "", "Próximo passo: " + route.next);
    var dest = destinationFor(route);
    if (dest.present && dest.href) {
      addLink(wrap, dest.href, "button", "Ver " + route.public_name, {
        "data-tool-to-offer": route.offer_id,
        "data-tool-to-purchase": route.purchase_id || "",
      });
    }
  }

  function render(result) {
    lastResult = result;
    while (resultBody.firstChild) resultBody.removeChild(resultBody.firstChild);
    var summary = result.summary || { present: [], gaps: [], unknowns: [] };
    var routing = result.routing || {};

    add(resultBody, "p", "", "O que está disponível, o que falta esclarecer e o próximo passo concreto. Sem percentual e sem nota de risco. Contato não é exigido.");
    add(resultBody, "p", "", result.limits);

    var overview = add(resultBody, "section", "pptr-summary");
    add(overview, "h3", "", "Leitura resumida");
    add(overview, "p", "", "Disponível (autoavaliação): " + summary.present.length + " tema(s). Falta esclarecer: " + summary.gaps.length + " lacuna(s) e " + summary.unknowns.length + " desconhecido(s). Desconhecido não vira lacuna e não piora a leitura.");
    add(overview, "p", "", "Próximo passo: " + (routing.summary_next || ""));

    if (summary.present.length) {
      var presentList = add(overview, "ul", "pptr-summary-list");
      presentList.setAttribute("data-summary", "present");
      var p;
      for (p = 0; p < summary.present.length; p += 1) {
        add(presentList, "li", "", summary.present[p].label + ": evidência declarada como presente.");
      }
    }
    if (summary.gaps.length) {
      var gapList = add(overview, "ul", "pptr-summary-list");
      gapList.setAttribute("data-summary", "gap");
      var g;
      for (g = 0; g < summary.gaps.length; g += 1) {
        add(gapList, "li", "", summary.gaps[g].label + ": " + summary.gaps[g].next);
      }
    }
    if (summary.unknowns.length) {
      var unkList = add(overview, "ul", "pptr-summary-list");
      unkList.setAttribute("data-summary", "unknown");
      var u;
      for (u = 0; u < summary.unknowns.length; u += 1) {
        add(unkList, "li", "", summary.unknowns[u].label + ": ainda desconhecido; não soma lacuna.");
      }
    }

    var routeBox = add(resultBody, "section", "pptr-routing");
    routeBox.setAttribute("data-routing-table", routing.table_id || "private_project_readiness_routing_v1");
    add(routeBox, "h3", "", "Encaminhamento");
    if (routing.primary) {
      add(routeBox, "p", "", routing.justification);
      renderRoute(routeBox, routing.primary, "primary", routing.justification);
      if (routing.alternatives && routing.alternatives.length) {
        add(routeBox, "h4", "", "Outros caminhos possíveis");
        add(routeBox, "p", "", "Não é necessário contratar dois serviços de uma vez. Os caminhos abaixo continuam coerentes com as lacunas declaradas.");
        var a;
        for (a = 0; a < routing.alternatives.length; a += 1) {
          renderRoute(routeBox, routing.alternatives[a], "alternative", routing.alternatives[a].why);
        }
      }
    } else {
      add(routeBox, "p", "", routing.justification || routing.summary_next || "");
      if (routing.scope_conversation) {
        add(routeBox, "p", "", "Esta leitura não fecha um diagnóstico. Uma conversa de escopo é opcional e não substitui documentos originais.");
      } else {
        add(routeBox, "p", "", "Nenhuma contratação é sugerida. O resultado completo permanece acima.");
      }
    }

    var list = add(resultBody, "div", "");
    var lines = ["Prontidão técnica de obra privada", "Hash: " + result.result_hash, ""];
    var n;
    for (n = 0; n < result.domains.length; n += 1) {
      var domain = result.domains[n];
      var wrap = add(list, "article", "pptr-domain");
      add(wrap, "h3", "", domain.label);
      var st = add(wrap, "p", "pptr-status");
      st.setAttribute("data-status", domain.status);
      st.textContent = statusLabel(domain.status) + " · " + priorityLabel(domain.priority);
      add(wrap, "p", "", "O que está disponível: " + (domain.declared_evidence || "Nada declarado como presente neste tema."));
      add(wrap, "p", "", "O que falta esclarecer: " + domain.missing_evidence);
      add(wrap, "p", "", "Por que importa: " + domain.decision_consequence);
      add(wrap, "p", "", "Próximo passo: " + domain.next_verification);
      if (domain.limits) add(wrap, "p", "", domain.limits);
      lines.push(domain.label);
      lines.push(statusLabel(domain.status));
      lines.push("Disponível: " + (domain.declared_evidence || "nada declarado"));
      lines.push("Esclarecer: " + domain.missing_evidence);
      lines.push("Por que importa: " + domain.decision_consequence);
      lines.push("Próximo passo: " + domain.next_verification);
      lines.push("");
    }
    lastText = lines.join("\n");

    if (cta) {
      var contactLink = document.getElementById("cta-triagem");
      if (contactLink && api.buildContactHref) {
        contactLink.href = api.buildContactHref(result.contact_context);
      }
      cta.hidden = false;
    }
    if (resultActions) resultActions.hidden = false;
    if (resultEl && resultEl.focus) {
      try { resultEl.focus(); } catch (err) {}
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var result = api.diagnosePrivateProjectTechnicalReadiness(readAnswers(), {
      expected_engine_id: api.ENGINE_ID,
    });
    render(result);
    emitComplete(result);
  });

  var reset = document.getElementById("btn-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      form.reset();
      lastResult = null;
      while (resultBody.firstChild) resultBody.removeChild(resultBody.firstChild);
      add(resultBody, "p", "", "O resultado aparece aqui depois de classificar as respostas. Contato não é exigido.");
      if (resultActions) resultActions.hidden = true;
      if (cta) cta.hidden = true;
    });
  }

  var edit = document.getElementById("btn-edit");
  if (edit) {
    edit.addEventListener("click", function () {
      var first = form.querySelector("select");
      if (form.scrollIntoView) form.scrollIntoView({ block: "start" });
      if (first && first.focus) first.focus();
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
})();
