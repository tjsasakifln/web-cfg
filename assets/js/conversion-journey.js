/**
 * Canary journey client. POSTs CNPJ in the body. Never writes CNPJ to the URL.
 */
(function () {
  const form = document.getElementById("xray-form");
  if (!form) return;

  const cnpjEl = document.getElementById("cnpj");
  const statusEl = document.getElementById("xray-status");
  const resultEl = document.getElementById("xray-result");
  const nextEl = document.getElementById("next-actions");
  const handraise = document.getElementById("handraise-form");
  const handraiseSubmit = document.getElementById("handraise-submit");
  const handraiseStatus = document.getElementById("handraise-status");
  const INSTR = [];
  let lastXrayCnpj = "";
  let handraiseToken = "";
  let handraiseIdempotency = "";
  let handraiseSubmitting = false;
  let handraiseSubmitted = false;

  function showStatus(el, msg, kind) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("is-error", kind === "error");
    el.classList.toggle("is-ok", kind === "ok");
    el.setAttribute("role", kind === "error" && msg ? "alert" : "status");
  }

  function newIdempotencyKey() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return "xray-fe-" + window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const values = new Uint32Array(4);
        window.crypto.getRandomValues(values);
        return "xray-fe-" + Array.from(values, function (value) {
          return value.toString(36);
        }).join("-");
      }
    } catch (_) { /* fallback below */ }
    return "xray-fe-" + String(Date.now()) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function ensureHandraiseIdempotency() {
    if (!handraiseIdempotency) handraiseIdempotency = newIdempotencyKey();
    return handraiseIdempotency;
  }

  function clearTurnstileResponse() {
    handraiseToken = "";
    if (!handraise) return;
    handraise.querySelectorAll('[name="cf-turnstile-response"]').forEach(function (input) {
      input.value = "";
    });
  }

  function resetTurnstile(message) {
    clearTurnstileResponse();
    if (handraiseSubmit) handraiseSubmit.disabled = true;
    showStatus(handraiseStatus, message, "error");
    try {
      if (window.turnstile && typeof window.turnstile.reset === "function") {
        window.turnstile.reset("#handraise-turnstile-widget");
      }
    } catch (_) { /* the form remains fail-closed */ }
    if (handraiseStatus && typeof handraiseStatus.focus === "function") handraiseStatus.focus();
  }

  window.confengeXrayTurnstileVerified = function (token) {
    const value = String(token || "").trim();
    if (handraiseSubmitted) return;
    if (!value) {
      resetTurnstile("A verificacao antiabuso nao foi concluida. Tente novamente.");
      return;
    }
    handraiseToken = value;
    if (handraiseSubmit) handraiseSubmit.disabled = false;
    showStatus(handraiseStatus, "Verificacao antiabuso concluida. O pedido pode ser enviado.", "ok");
  };

  window.confengeXrayTurnstileExpired = function () {
    if (handraiseSubmitted) return;
    resetTurnstile("A verificacao antiabuso expirou. Conclua uma nova verificacao para enviar.");
  };

  window.confengeXrayTurnstileError = function () {
    if (handraiseSubmitted) return true;
    resetTurnstile("Nao foi possivel concluir a verificacao antiabuso. Tente novamente.");
    return true;
  };

  function track(name, payload) {
    const ev = { event: name, ...(payload || {}) };
    delete ev.cnpj;
    delete ev.email;
    delete ev.telefone;
    delete ev.nome;
    INSTR.push(ev);
    if (typeof window.confengeTrack === "function") {
      window.confengeTrack(name, ev);
    } else if (typeof window.gtag === "function") {
      window.gtag("event", name, ev);
    }
  }

  function clearCnpjFromUrl() {
    if (!window.location.search && !window.location.hash) return;
    const u = new URL(window.location.href);
    ["cnpj", "cnpj14", "email", "nome", "telefone", "phone"].forEach((k) => u.searchParams.delete(k));
    u.hash = "";
    window.history.replaceState({}, "", u.pathname);
  }

  clearCnpjFromUrl();

  if (cnpjEl) {
    cnpjEl.addEventListener("blur", function () {
      if (!(cnpjEl.value || "").trim()) {
        track("field_abandonment", { field: "cnpj" });
      }
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearCnpjFromUrl();
    const cnpj = (cnpjEl && cnpjEl.value) || "";
    track("form_start", { form: "xray" });
    const idem = "idk-" + String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
    const correlation = "c-" + Math.random().toString(36).slice(2, 12);
    fetch(form.getAttribute("action") || "/.netlify/functions/conversion-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": idem },
      body: JSON.stringify({
        action: "xray",
        cnpj: cnpj,
        market_answer_id: (form.querySelector('[name="market_answer_id"]') || {}).value,
        intent: "ver_propria_empresa",
        cta: "Veja sua empresa neste mercado",
        correlation_id: correlation,
        idempotency_key: idem,
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { http: r.status, body: j };
        });
      })
      .then(function (res) {
        if (!res.body || !res.body.ok) {
          showStatus(statusEl, (res.body && res.body.message) || "Nao foi possivel ler o recorte.", "error");
          track("xray_error", { error: (res.body && res.body.error) || "error" });
          return;
        }
        lastXrayCnpj = String(cnpj || "").replace(/\D/g, "").slice(0, 14);
        showStatus(statusEl, "Recorte registrado. Estado: " + (res.body.xray && res.body.xray.state), "ok");
        if (resultEl) {
          resultEl.hidden = false;
          const x = res.body.xray || {};
          resultEl.innerHTML =
            "<h2>Leitura factual</h2><p>Estado: " +
            String(x.state || "") +
            "</p><p>" +
            String((x.limitations || []).join(" ")) +
            "</p>";
        }
        if (nextEl) nextEl.hidden = false;
        track("xray_complete", { state: res.body.xray && res.body.xray.state });
      })
      .catch(function () {
        showStatus(statusEl, "Falha de rede. A solicitacao pode ter sido registrada. Tente de novo.", "error");
        track("xray_timeout", {});
      });
  });

  const second = document.getElementById("action-second-reading");
  if (second && handraise) {
    second.addEventListener("click", function () {
      handraise.hidden = false;
      ensureHandraiseIdempotency();
      if (handraiseSubmit) handraiseSubmit.disabled = !handraiseToken;
      if (!handraiseToken) {
        showStatus(handraiseStatus, "Conclua a verificacao antiabuso para habilitar o envio.", "");
      }
      const nome = document.getElementById("nome");
      if (nome) nome.focus();
      track("cta_click", { cta: "segunda_leitura" });
    });
  }

  const none = document.getElementById("action-none");
  if (none) {
    none.addEventListener("click", function () {
      if (handraise) handraise.hidden = true;
      track("cta_click", { cta: "nenhuma" });
    });
  }

  if (handraise) {
    const handraiseEmail = document.getElementById("email");
    const handraisePhone = document.getElementById("telefone");
    function validateHandraiseContact() {
      if (!handraiseEmail) return true;
      const hasContact = Boolean(
        String(handraiseEmail.value || "").trim() || String((handraisePhone && handraisePhone.value) || "").trim(),
      );
      handraiseEmail.setCustomValidity(hasContact ? "" : "Informe WhatsApp ou e-mail para retorno.");
      return hasContact;
    }
    [handraiseEmail, handraisePhone].forEach(function (input) {
      if (input) input.addEventListener("input", validateHandraiseContact);
    });
    handraise.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (handraiseSubmitting || handraiseSubmitted) return;
      const responseInput = handraise.querySelector('[name="cf-turnstile-response"]');
      const token = String(handraiseToken || (responseInput && responseInput.value) || "").trim();
      if (!token) {
        if (handraiseSubmit) handraiseSubmit.disabled = true;
        showStatus(handraiseStatus, "Conclua a verificacao antiabuso antes de enviar.", "error");
        return;
      }
      validateHandraiseContact();
      if (!handraise.checkValidity()) {
        handraise.reportValidity();
        return;
      }
      const fd = new FormData(handraise);
      const payload = {};
      fd.forEach(function (v, k) {
        payload[k] = v;
      });
      payload.action = "handraise";
      payload.consentimento = Boolean(document.getElementById("consentimento") && document.getElementById("consentimento").checked);
      payload.source = "CONFENGE_WEB";
      payload.route_family = "market-answer-xray";
      payload.cnpj = lastXrayCnpj;
      payload.idempotency_key = ensureHandraiseIdempotency();
      payload.turnstile_token = token;
      payload["cf-turnstile-response"] = token;
      handraiseSubmitting = true;
      if (handraiseSubmit) handraiseSubmit.disabled = true;
      showStatus(handraiseStatus, "Registrando o pedido...", "");
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const configuredTimeout = Number(handraise.getAttribute("data-submit-timeout-ms") || 15000);
      const timeoutMs = Number.isFinite(configuredTimeout)
        ? Math.min(30000, Math.max(1000, configuredTimeout))
        : 15000;
      const timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      fetch(handraise.getAttribute("action") || "/.netlify/functions/conversion-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": payload.idempotency_key,
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { http: r.status, body: body };
          });
        })
        .then(function (res) {
          const j = res.body || {};
          const receipt = j.receipt_id || j.lead_id;
          if ((res.http !== 200 && res.http !== 201) || !j.ok || !receipt) {
            if (res.http === 403 || j.error === "anti_abuse") {
              resetTurnstile("A verificacao antiabuso foi recusada ou expirou. Conclua uma nova verificacao e tente novamente.");
            } else if (j.ok && !receipt) {
              resetTurnstile("O servidor nao confirmou o registro com um protocolo. Conclua uma nova verificacao e tente novamente.");
            } else {
              resetTurnstile(j.message || "Nao foi possivel registrar. Conclua uma nova verificacao e tente novamente.");
            }
            return;
          }
          handraiseSubmitted = true;
          clearTurnstileResponse();
          if (handraiseSubmit) handraiseSubmit.disabled = true;
          showStatus(handraiseStatus, "Pedido registrado. Protocolo " + receipt + ". Sem envio automatico.", "ok");
          track("handraise_complete", { handoff_status: j.handoff_status || "" });
        })
        .catch(function (error) {
          const reason = error && error.name === "AbortError" ? "tempo limite" : "falha de rede";
          resetTurnstile("Houve " + reason + ". O pedido pode ter sido registrado; conclua uma nova verificacao e tente novamente. A mesma identificacao evita duplicidade.");
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          handraiseSubmitting = false;
          if (handraiseSubmit && !handraiseSubmitted) handraiseSubmit.disabled = !handraiseToken;
        });
    });
  }

  window.__conversionJourney = { INSTR, clearCnpjFromUrl, resetTurnstile };
})();
