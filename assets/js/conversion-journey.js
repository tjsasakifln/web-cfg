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
  const INSTR = [];

  function showStatus(el, msg, kind) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("is-error", kind === "error");
    el.classList.toggle("is-ok", kind === "ok");
  }

  function track(name, payload) {
    const ev = { event: name, ...(payload || {}) };
    delete ev.cnpj;
    delete ev.email;
    delete ev.telefone;
    delete ev.nome;
    INSTR.push(ev);
    if (typeof window.gtag === "function") {
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
    fetch(form.getAttribute("action") || "/.netlify/functions/market-answer-intake", {
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
    handraise.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const fd = new FormData(handraise);
      const payload = {};
      fd.forEach(function (v, k) {
        payload[k] = v;
      });
      payload.action = "handraise";
      payload.consentimento = Boolean(document.getElementById("consentimento") && document.getElementById("consentimento").checked);
      fetch(handraise.getAttribute("action") || "/.netlify/functions/market-answer-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          const st = document.getElementById("handraise-status");
          if (!j.ok) {
            showStatus(st, j.message || "Nao foi possivel registrar.", "error");
            return;
          }
          showStatus(st, "Pedido registrado. Protocolo " + (j.receipt_id || j.lead_id) + ". Sem envio automatico.", "ok");
          track("handraise_complete", { handoff_status: j.handoff_status || "" });
        })
        .catch(function () {
          showStatus(document.getElementById("handraise-status"), "Falha de rede. Tente de novo.", "error");
        });
    });
  }

  window.__conversionJourney = { INSTR, clearCnpjFromUrl };
})();
