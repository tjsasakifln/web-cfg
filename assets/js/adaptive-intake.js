/* Route-local intake behavior. The shared script supplies analytics and Turnstile only. */
(function () {
  "use strict";
  var form = document.getElementById("triagem-tecnica-form");
  if (!form) return;
  var submit = form.querySelector('[type="submit"]');
  var status = document.getElementById("form-status");
  var nucleus = form.querySelector('[name="nucleus_id"]');
  var configEndpoint = form.getAttribute("data-authority-config-endpoint");
  var configured = false;
  var started = false;
  var volatileRetryKey = "";
  var pendingPayload = "";
  var retryKey = "confenge_triagem_idempotency_v1";
  var enumDraftKey = "confenge_triagem_enums_v1";
  var forbidden = /^(nome|email|telefone|cpf|rg|mensagem|message|upload|file|arquivo|processo|conflict_parties|partes)$/i;

  function message(text, kind) {
    status.hidden = !text;
    status.textContent = text || "";
    status.className = "form-status" + (kind ? " " + kind : "");
  }
  function track(event) {
    if (typeof window.confengeTrack === "function") {
      window.confengeTrack(event, { page_path: "/triagem-tecnica/", source: "CONFENGE_WEB" });
    }
  }
  function setHidden(name, value) {
    var el = form.querySelector('[name="' + name + '"]');
    if (el) el.value = String(value || "");
  }
  function branches() {
    var selected = nucleus.value;
    form.querySelectorAll("[data-nucleus-branch]").forEach(function (panel) {
      var active = panel.getAttribute("data-nucleus-branch") === selected;
      panel.hidden = !active;
      panel.querySelectorAll("select,input").forEach(function (field) {
        field.disabled = !active;
        field.required = active && field.hasAttribute("data-branch-required");
      });
    });
    saveEnums();
  }
  function saveEnums() {
    try {
      var out = {};
      form.querySelectorAll("select,input[type=checkbox]").forEach(function (field) {
        if (!field.name || forbidden.test(field.name) || field.type === "hidden") return;
        out[field.name] = field.type === "checkbox" ? field.checked : field.value;
      });
      sessionStorage.setItem(enumDraftKey, JSON.stringify(out));
    } catch (_) {}
  }
  function restoreEnums() {
    try {
      var values = JSON.parse(sessionStorage.getItem(enumDraftKey) || "{}");
      Object.keys(values).forEach(function (name) {
        if (!/^[a-z_]+$/.test(name) || forbidden.test(name)) return;
        var field = form.querySelector('[name="' + name + '"]');
        if (!field) return;
        if (field.type === "checkbox") field.checked = values[name] === true;
        else field.value = String(values[name] || "");
      });
    } catch (_) {}
  }
  function idempotency() {
    try {
      var existing = sessionStorage.getItem(retryKey) || volatileRetryKey;
      if (existing) return existing;
      var key = "triagem-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(retryKey, key);
      volatileRetryKey = key;
      return key;
    } catch (_) {
      volatileRetryKey = volatileRetryKey || ("triagem-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
      return volatileRetryKey;
    }
  }
  function configure(data) {
    if (!data || data.ok !== true || !Array.isArray(data.nuclei) || !data.intake_contract_version || !data.intake_pin_hash) throw new Error("config_invalid");
    var allowed = data.nuclei;
    nucleus.querySelectorAll("option[value]").forEach(function (opt) {
      opt.hidden = allowed.indexOf(opt.value) === -1;
      opt.disabled = allowed.indexOf(opt.value) === -1;
    });
    setHidden("intake_contract_version", data.intake_contract_version);
    setHidden("intake_pin_hash", data.intake_pin_hash);
    setHidden("source_asset_id", data.source_asset_id);
    setHidden("asset_id", data.source_asset_id);
    setHidden("offer_candidate_id", data.offer_candidate_id);
    configured = true;
    submit.disabled = false;
    message("");
  }
  submit.disabled = true;
  message("Verificando a disponibilidade do recebimento…");
  if (configEndpoint !== "/.netlify/functions/adaptive-intake-config") {
    message("Recebimento indisponível enquanto a autoridade do intake não for confirmada.", "error");
    return;
  }
  fetch(configEndpoint, { headers: { Accept: "application/json" } })
    .then(function (res) { if (!res.ok) throw new Error("config_unavailable"); return res.json(); })
    .then(configure)
    .catch(function () { message("Recebimento temporariamente indisponível. Você pode revisar as opções, mas o envio permanece bloqueado até a confirmação do serviço.", "error"); });
  restoreEnums(); branches();
  function start() { if (!started) { started = true; track("lead_form_start"); } }
  form.addEventListener("focusin", start);
  form.addEventListener("change", start);
  nucleus.addEventListener("change", branches);
  form.addEventListener("change", saveEnums);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!configured) return;
    if (!form.checkValidity() || !(form.email.value || form.telefone.value)) {
      message("Informe nome, e-mail ou WhatsApp, as confirmações e as opções obrigatórias.", "error");
      form.reportValidity(); return;
    }
    var body = {};
    new FormData(form).forEach(function (value, key) { if (typeof value === "string") body[key] = value; });
    var fingerprint = JSON.stringify(body);
    if (pendingPayload && pendingPayload !== fingerprint) {
      message("Esta tentativa ainda não teve recebimento confirmado. Para evitar duplicidade, mantenha as mesmas opções e tente novamente.", "error");
      return;
    }
    pendingPayload = fingerprint;
    body.idempotency_key = idempotency();
    var token = form.querySelector('[name="cf-turnstile-response"]');
    if (token && token.value) body.turnstile_token = token.value;
    submit.disabled = true; form.setAttribute("aria-busy", "true"); message("Registrando triagem…"); track("lead_form_submit");
    fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": body.idempotency_key }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (reply) {
        var receipt = reply.data && (reply.data.lead_id || reply.data.receipt_id);
        if (!reply.res.ok || !reply.data.ok || !receipt) throw new Error("receipt_not_persisted");
        form.hidden = true;
        var confirmation = document.querySelector("[data-adaptive-confirmation]");
        confirmation.hidden = false;
        confirmation.querySelector("[data-receipt-protocol]").textContent = String(receipt);
        confirmation.focus();
        pendingPayload = ""; volatileRetryKey = "";
        try { sessionStorage.removeItem(retryKey); sessionStorage.removeItem(enumDraftKey); } catch (_) {}
        track("lead_form_success");
        track("lead_persisted");
      })
      .catch(function () { message("Não foi possível confirmar o recebimento. Tente novamente com as mesmas opções: a mesma chave de tentativa será mantida.", "error"); track("lead_form_backend_error"); })
      .finally(function () { form.removeAttribute("aria-busy"); if (!form.hidden) submit.disabled = false; });
  });
})();
