(function () {
  "use strict";

  var form = document.querySelector("[data-adaptive-intake-form]") ||
    document.getElementById("triagem-tecnica-form");
  if (!form) return;

  var endpoint = form.getAttribute("data-config-endpoint");
  var steps = Array.prototype.slice.call(form.querySelectorAll("[data-intake-step]"));
  var need = form.querySelector("[name=need_code]");
  var next = form.querySelector("[data-intake-next]");
  var back = form.querySelector("[data-intake-back]");
  var submit = form.querySelector("[type=submit]");
  var status = form.querySelector("[data-intake-status]");
  var channel = form.querySelector("[name=preferred_channel]");
  var emailWrap = form.querySelector("[data-contact=email]");
  var phoneWrap = form.querySelector("[data-contact=phone]");
  var email = form.querySelector("[name=email]");
  var phone = form.querySelector("[name=telefone]");
  var locationWrap = form.querySelector("[data-location]");
  var city = form.querySelector("[name=location_city]");
  var uf = form.querySelector("[name=location_uf]");
  var receipt = document.querySelector("[data-intake-receipt]");
  var protocol = document.querySelector("[data-intake-protocol]");
  var fallbackLinks = Array.prototype.slice.call(document.querySelectorAll("[data-fallback-channel]"));
  var pagePath = form.getAttribute("data-page-path") || "/triagem-tecnica/";
  var routeFamily = form.querySelector("[name=route_family]")?.value || "triagem-tecnica";
  var assetId = form.querySelector("[name=asset_id]")?.value || "technical_triage_v1";
  var ctaId = form.getAttribute("data-cta-id") || "technical-triage-submit";
  var defaultNeed = form.getAttribute("data-default-need") || "";
  var hashNeeds = {
    projetos: "obra_edificacao_ou_documentacao",
    "obra-imovel": "obra_edificacao_ou_documentacao",
    "pericia-avaliacao": "pericia_ou_disputa_tecnica",
    sst: "seguranca_do_trabalho",
    "planejamento-publico": "licitacao_obra_ou_contrato_publico"
  };
  // Deadlines. Configuration is a page-load read: 5s, after which the visitor is
  // sent to the static channels instead of staring at a placeholder. Submission is
  // 15s and covers READING the body, not just the arrival of the headers — a
  // response whose body never ends is exactly the case that used to hang forever.
  var CONFIG_TIMEOUT_MS = 5000;
  var SUBMIT_TIMEOUT_MS = 15000;
  // Once the visitor has been handed to the alternative contact, the attempt is
  // over. A late response must not move focus, change a selection, overwrite what
  // was typed, or rewrite a channel link under the visitor's hands.
  var handedOver = false;
  var submitGeneration = 0;
  var configured = false;
  var started = false;
  var pendingFingerprint = "";
  var volatileKey = "";
  var retryStorageKey = "confenge_triagem_retry_v3";
  var attributionStorageKey = "confenge_pseo_attribution";
  var attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  // One deadline for the whole exchange, including the body read. There is no
  // automatic retry and no polling here by design: a retry is the visitor's
  // explicit act, and it reuses the same idempotency key.
  function fetchWithDeadline(input, init, ms) {
    var controller = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, ms);
    var options = Object.assign({}, init || {}, { signal: controller.signal });
    return fetch(input, options)
      .then(function (response) {
        // Read the body under the SAME deadline; only then stand the timer down.
        return response.text().then(function (text) {
          clearTimeout(timer);
          return { response: response, text: text };
        });
      })
      .catch(function (error) {
        clearTimeout(timer);
        if (timedOut) {
          var deadline = new Error("deadline_exceeded");
          deadline.deadlineExceeded = true;
          throw deadline;
        }
        throw error;
      });
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return {};
    }
  }

  function track(eventName, props) {
    if (typeof window.confengeTrack !== "function") return;
    window.confengeTrack(eventName, Object.assign({
      page_path: pagePath,
      route_family: routeFamily,
      asset_id: assetId,
      cta_id: ctaId,
      source: "CONFENGE_WEB"
    }, props || {}));
  }

  function showStatus(text, kind) {
    status.hidden = !text;
    status.textContent = text || "";
    status.className = "intake-status" + (kind ? " is-" + kind : "");
    status.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  function setStep(index, interactive) {
    steps.forEach(function (step, current) {
      step.hidden = current !== index;
    });
    form.setAttribute("data-current-step", String(index + 1));
    var current = form.querySelector("[data-current-step-label]");
    if (current) current.textContent = String(index + 1);
    if (interactive) {
      var heading = steps[index] && steps[index].querySelector("legend");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      track("lead_form_step", { form_step: index + 1 });
    }
  }

  function setHidden(name, value) {
    var field = form.querySelector("[name='" + name + "']");
    if (field) field.value = value || "";
  }

  function configure(data) {
    if (!data || data.ok !== true || !data.intake_version || !data.intake_pin_hash || !Array.isArray(data.options)) {
      throw new Error("invalid_config");
    }
    while (need.options.length > 1) need.remove(1);
    data.options.forEach(function (option) {
      var item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      item.setAttribute("data-location-required", option.location_required ? "true" : "false");
      need.appendChild(item);
    });
    var hashNeed = hashNeeds[decodeURIComponent((window.location.hash || "").slice(1))] || "";
    var requestedNeed = defaultNeed || hashNeed;
    if (requestedNeed && Array.prototype.some.call(need.options, function (option) {
      return option.value === requestedNeed;
    })) {
      need.value = requestedNeed;
    }
    setHidden("intake_version", data.intake_version);
    setHidden("intake_pin_hash", data.intake_pin_hash);
    configured = data.options.length > 0;
    if (configured) available();
    next.disabled = !configured;
    submit.disabled = !configured;
    updateLocation();
    updateFallbackChannels();
    showStatus(configured ? "" : "O formulário não está disponível agora.", configured ? "" : "error");
  }

  function unavailable() {
    configured = false;
    handedOver = true;
    submitGeneration += 1;
    next.disabled = true;
    submit.disabled = true;
    // Take the dead controls out of the accessible tree AND out of the focus
    // order, so a keyboard or screen-reader visitor is not walked through a
    // form that cannot accept anything. `inert` does both. The status message
    // and the WhatsApp/e-mail/telephone links live outside these containers and
    // stay readable and focusable — the explanation must survive, only the dead
    // controls go away.
    steps.forEach(function (step) {
      step.setAttribute("inert", "");
      step.setAttribute("aria-hidden", "true");
    });
    showStatus(
      "O formulário não está disponível agora. Use WhatsApp, e-mail ou telefone abaixo para falar com a CONFENGE.",
      "error"
    );
  }

  // Reaching a valid configuration must clear the loading placeholder and let the
  // visitor progress for real.
  function available() {
    handedOver = false;
    steps.forEach(function (step) {
      step.removeAttribute("inert");
      step.removeAttribute("aria-hidden");
    });
  }

  function locationRequired() {
    var option = need.options[need.selectedIndex];
    return Boolean(option && option.getAttribute("data-location-required") === "true");
  }

  function updateLocation() {
    var required = locationRequired();
    locationWrap.hidden = !required;
    city.disabled = !required;
    uf.disabled = !required;
    city.required = required;
    uf.required = required;
    if (!required) {
      city.value = "";
      uf.value = "";
    }
  }

  function updateFallbackChannels() {
    var option = need.options[need.selectedIndex];
    var situation = option && option.value ? option.textContent.trim() : "demanda técnica";
    fallbackLinks.forEach(function (link) {
      var selectedChannel = link.getAttribute("data-fallback-channel");
      if (selectedChannel === "whatsapp") {
        link.href = "https://wa.me/5548988344559?text=" + encodeURIComponent(
          "Olá, Tiago. Quero iniciar uma triagem técnica. Situação: " + situation + "."
        );
      } else if (selectedChannel === "email") {
        link.href = "mailto:tiago.sasaki@confenge.com.br?subject=" + encodeURIComponent(
          "Triagem técnica CONFENGE — " + situation
        );
      }
    });
  }

  function updateChannel() {
    var selected = channel.value;
    var emailActive = selected === "email";
    var phoneActive = selected === "whatsapp" || selected === "phone";
    emailWrap.hidden = !emailActive;
    phoneWrap.hidden = !phoneActive;
    email.disabled = !emailActive;
    phone.disabled = !phoneActive;
    email.required = emailActive;
    phone.required = phoneActive;
    if (!emailActive) email.value = "";
    if (!phoneActive) phone.value = "";
  }

  function markStart() {
    if (started) return;
    started = true;
    track("lead_form_start");
  }

  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "triage-" + window.crypto.randomUUID();
    }
    return "triage-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function safeAttribution(value) {
    var text = String(value || "").slice(0, 80);
    var compactDigits = text.replace(/[\s()./+\-]/g, "");
    if (/@/.test(text) || /^\d{10,15}$/.test(compactDigits)) return "";
    return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(text) ? text : "";
  }

  function storedAttribution() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(attributionStorageKey) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  async function idempotencyKeyFor(currentFingerprint) {
    if (window.crypto && window.crypto.subtle && typeof window.TextEncoder === "function") {
      try {
        var bytes = new window.TextEncoder().encode(currentFingerprint);
        var digestBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
        var digest = Array.prototype.map.call(new Uint8Array(digestBuffer), function (value) {
          return value.toString(16).padStart(2, "0");
        }).join("");
        var stored = JSON.parse(sessionStorage.getItem(retryStorageKey) || "null");
        if (stored && stored.digest === digest && /^triage-[A-Za-z0-9-]+$/.test(stored.key || "")) {
          return stored.key;
        }
        var boundKey = newKey();
        sessionStorage.setItem(retryStorageKey, JSON.stringify({ digest: digest, key: boundKey }));
        return boundKey;
      } catch (_) {
        /* Session storage is optional; in-page retry remains idempotent below. */
      }
    }
    if (!pendingFingerprint || pendingFingerprint !== currentFingerprint) {
      pendingFingerprint = currentFingerprint;
      volatileKey = newKey();
    }
    return volatileKey;
  }

  function publicPayload() {
    var body = {};
    new FormData(form).forEach(function (value, key) {
      if (typeof value === "string") body[key] = value;
    });
    body.landing_page = body.landing_page || pagePath;
    var query = new URLSearchParams(window.location.search);
    var stored = storedAttribution();
    attributionKeys.forEach(function (key) {
      var value = safeAttribution(query.get(key) || stored[key]);
      if (value) body[key] = value;
    });
    var sourceAsset = safeAttribution(stored.asset_id);
    var sourceFamily = safeAttribution(stored.route_family);
    if (sourceAsset && sourceAsset !== "technical_triage_v1" && !body.source_origin_asset_id) {
      body.source_origin_asset_id = sourceAsset;
    }
    if (sourceFamily && sourceFamily !== "triagem-tecnica" && !body.source_origin_route_family) {
      body.source_origin_route_family = sourceFamily;
    }
    var token = form.querySelector("[name=cf-turnstile-response]");
    if (token && token.value) {
      body.turnstile_token = token.value;
      body["cf-turnstile-response"] = token.value;
    }
    return body;
  }

  function fingerprint(body) {
    var copy = Object.assign({}, body);
    delete copy.turnstile_token;
    delete copy["cf-turnstile-response"];
    delete copy.idempotency_key;
    return JSON.stringify(copy);
  }

  fetchWithDeadline(
    endpoint,
    { headers: { Accept: "application/json" }, credentials: "same-origin" },
    CONFIG_TIMEOUT_MS
  )
    .then(function (reply) {
      if (!reply.response.ok) throw new Error("config_unavailable");
      return parseJson(reply.text);
    })
    .then(configure)
    .catch(unavailable);

  // Programmatic focus (browser restore, accessibility tooling or navigation)
  // is not a visitor interaction and must not inflate funnel starts.
  ["pointerdown", "keydown"].forEach(function (eventName) {
    form.addEventListener(eventName, markStart, { once: true });
  });
  need.addEventListener("change", function () {
    updateLocation();
    updateFallbackChannels();
    showStatus("");
  });
  channel.addEventListener("change", function () {
    updateChannel();
    showStatus("");
  });
  next.addEventListener("click", function () {
    markStart();
    if (!configured) return unavailable();
    if (!need.value) {
      need.setCustomValidity("Selecione a situação que mais se aproxima da sua demanda.");
      need.reportValidity();
      need.setCustomValidity("");
      return;
    }
    updateLocation();
    setStep(1, true);
  });
  back.addEventListener("click", function () {
    setStep(0, true);
  });
  fallbackLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.__confengeTracked = true;
      var selectedChannel = link.getAttribute("data-fallback-channel");
      var source = storedAttribution();
      track(selectedChannel === "whatsapp" ? "whatsapp_click" : selectedChannel === "email" ? "email_click" : "outbound_click", {
        channel: selectedChannel,
        destination_type: selectedChannel,
        need_category: need.value || "not_selected",
        route_family: link.getAttribute("data-route-family") || "triagem-tecnica",
        asset_id: link.getAttribute("data-asset-id") || "technical_triage_v1",
        cta_id: link.getAttribute("data-cta-id") || "technical-triage-alternative-" + selectedChannel,
        source_asset_id: safeAttribution(source.asset_id)
      });
    }, true);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    markStart();
    if (!configured) return unavailable();
    updateChannel();
    updateLocation();
    if (!form.checkValidity()) {
      form.reportValidity();
      showStatus("Revise os campos indicados. Basta um canal de retorno.", "error");
      track("lead_form_error", { validation_category: "required", form_step: 2 });
      return;
    }

    var body = publicPayload();
    var currentFingerprint = fingerprint(body);
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    showStatus("Registrando seu pedido…");
    body.idempotency_key = await idempotencyKeyFor(currentFingerprint);
    track("lead_form_submit", {
      form_step: 2,
      need_category: need.value,
      channel: channel.value,
      location_required: locationRequired()
    });

    // Identity of THIS attempt. A response that arrives after the visitor has been
    // handed to the alternative contact, or after a newer attempt started, is
    // discarded: it must not steal focus or overwrite the page underneath them.
    var generation = ++submitGeneration;
    function stale() {
      return handedOver || generation !== submitGeneration;
    }

    fetchWithDeadline(
      form.action,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": body.idempotency_key
        },
        body: JSON.stringify(body),
        credentials: "same-origin"
      },
      SUBMIT_TIMEOUT_MS
    )
      .then(function (raw) {
        return { response: raw.response, data: parseJson(raw.text) };
      })
      .then(function (reply) {
        if (stale()) return;
        var receiptId = reply.data && (reply.data.receipt_id || reply.data.lead_id);
        if (![200, 201].includes(reply.response.status) || reply.data.ok !== true || !receiptId) {
          var error = new Error(reply.data.error || "receipt_unconfirmed");
          error.status = reply.response.status;
          throw error;
        }
        form.hidden = true;
        receipt.hidden = false;
        protocol.textContent = String(receiptId);
        receipt.setAttribute("tabindex", "-1");
        receipt.focus();
        pendingFingerprint = "";
        volatileKey = "";
        try { sessionStorage.removeItem(retryStorageKey); } catch (_) {}
        track("lead_form_success");
        track("lead_persisted");
      })
      .catch(function (error) {
        if (stale()) return;
        var rateLimited = error && error.status === 429;
        var timedOut = Boolean(error && error.deadlineExceeded);
        // The request left this browser. A deadline, an unreadable body or a proxy
        // error do NOT prove the record was not written, so the wording stays
        // uncertain and the typed fields are preserved. Trying again with the same
        // data reuses the same idempotency key and converges on ONE logical record.
        showStatus(
          rateLimited
            ? "Muitas tentativas em sequência. Aguarde um pouco ou use um dos canais abaixo."
            : timedOut
              ? "Não recebemos a confirmação a tempo. O seu pedido pode ter sido registrado — não reescreva os dados: tente enviar de novo, ou fale pelos canais abaixo."
              : "Ainda não foi possível confirmar o registro. Tente novamente com os mesmos dados ou use um dos canais abaixo.",
          "error"
        );
        track("lead_form_backend_error", {
          error_code: rateLimited ? "rate_limited" : timedOut ? "deadline_exceeded" : "receipt_unconfirmed"
        });
      })
      .finally(function () {
        if (stale()) return;
        form.removeAttribute("aria-busy");
        if (!form.hidden) submit.disabled = false;
      });
  });

  updateChannel();
  updateLocation();
  updateFallbackChannels();
  setStep(0, false);
})();
