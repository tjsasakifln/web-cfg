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
  var status = document.querySelector("[data-intake-status]");
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
  // Structural presentation anchors. The served HTML starts on the contact
  // alternative, so a blocked or broken bundle can never leave a dead form as
  // the dominant action.
  var formBlock = document.querySelector("[data-intake-form-block]");
  var alternative = document.querySelector("[data-intake-alternative]");
  var pagePath = form.getAttribute("data-page-path") || "/triagem-tecnica/";
  var routeFamily = form.querySelector("[name=route_family]")?.value || "triagem-tecnica";
  var assetId = form.querySelector("[name=asset_id]")?.value || "technical_triage_v1";
  var ctaId = form.getAttribute("data-cta-id") || "technical-triage-submit";
  var defaultNeed = form.getAttribute("data-default-need") || "";
  // Per-route contact context. Never derived from visitor input, never from the
  // URL, never from another route: only from this route's own markup plus the
  // label the server returned for the selected option.
  var whatsappIntent = form.getAttribute("data-channel-intent") || "";
  var emailSubject = form.getAttribute("data-channel-subject") || "";
  var hashNeeds = {
    projetos: "obra_edificacao_ou_documentacao",
    "obra-imovel": "obra_edificacao_ou_documentacao",
    "pericia-avaliacao": "pericia_ou_disputa_tecnica",
    sst: "seguranca_do_trabalho",
    "planejamento-publico": "licitacao_obra_ou_contrato_publico"
  };
  var CONFIG_TIMEOUT_MS = 5000;
  var SUBMIT_TIMEOUT_MS = 15000;
  var configured = false;
  var started = false;
  var settled = false;
  var pendingFingerprint = "";
  var volatileKey = "";
  var retryStorageKey = "confenge_triagem_retry_v3";
  var attributionStorageKey = "confenge_pseo_attribution";
  var attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var staticChannelHrefs = fallbackLinks.map(function (link) { return link.getAttribute("href") || ""; });

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
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || "";
    status.className = "intake-status" + (kind ? " is-" + kind : "");
    status.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  // Two main presentations. "form" promotes the form block above the contact
  // alternative and returns it to the accessible tree; "alternative" removes the
  // whole form block from both the accessible tree and the focus order, while
  // the status line and the standing limit notice stay outside it and visible.
  // Marks where the form block sits in the served HTML, so returning to the
  // alternative presentation restores that exact slot. Moving the channel card
  // instead would drag it past the status line and the limit notice, which sit
  // between the card and the form block, and the limit would end up ABOVE the
  // action instead of below it.
  var formBlockSlot = null;
  if (formBlock && formBlock.parentNode) {
    formBlockSlot = document.createComment("intake-form-block-slot");
    formBlock.parentNode.insertBefore(formBlockSlot, formBlock);
  }

  function setPresentation(mode) {
    if (!formBlock) return;
    var showForm = mode === "form";
    formBlock.hidden = !showForm;
    if (showForm) {
      formBlock.removeAttribute("inert");
      formBlock.removeAttribute("aria-hidden");
      if (alternative && alternative.parentNode && formBlock.parentNode === alternative.parentNode) {
        alternative.parentNode.insertBefore(formBlock, alternative);
      }
    } else {
      formBlock.setAttribute("inert", "");
      formBlock.setAttribute("aria-hidden", "true");
      // Back to the served slot: alternative, status, limit, then the form block.
      if (formBlockSlot && formBlockSlot.parentNode && formBlock.previousSibling !== formBlockSlot) {
        formBlockSlot.parentNode.insertBefore(formBlock, formBlockSlot.nextSibling);
      }
    }
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

  function validOptions(options) {
    return options.every(function (option) {
      return option && typeof option.value === "string" && option.value !== "" &&
        typeof option.label === "string" && option.label !== "";
    });
  }

  function configure(data) {
    if (!data || data.ok !== true || !data.intake_version || !data.intake_pin_hash || !Array.isArray(data.options)) {
      throw new Error("invalid_config");
    }
    if (!validOptions(data.options)) throw new Error("invalid_options");
    // Empty the select completely. The previous loop started at index 1 and left
    // the "Carregando opções…" placeholder alive in the READY state.
    while (need.options.length) need.remove(0);
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione a situação";
    need.appendChild(placeholder);
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
    if (!configured) throw new Error("empty_options");
    next.disabled = false;
    submit.disabled = false;
    setPresentation("form");
    updateLocation();
    updateFallbackChannels();
    showStatus("");
  }

  // Policy withholding and technical failure share this presentation on purpose:
  // the visitor does not need the difference. The diagnosis stays in the
  // internal error code, never in two different screens, and the copy never
  // blames the visitor. No directional word ("abaixo"/"acima") is used, because
  // the reading order changes with the state.
  function unavailable(reason) {
    configured = false;
    next.disabled = true;
    submit.disabled = true;
    setPresentation("alternative");
    showStatus(
      "O formulário não está disponível agora. WhatsApp, e-mail e telefone continuam valendo para falar com a CONFENGE.",
      "error"
    );
    track("lead_form_backend_error", { error_code: configErrorCode(reason) });
  }

  function configErrorCode(reason) {
    var name = reason && (reason.code || reason.message) ? String(reason.code || reason.message) : "config_unknown";
    var allowed = [
      "config_timeout", "config_network", "config_unavailable", "config_context_unknown",
      "config_method_not_allowed", "invalid_config", "invalid_options", "empty_options",
      "invalid_body", "config_unknown"
    ];
    return allowed.indexOf(name) === -1 ? "config_unknown" : name;
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

  // The static href of each route already carries that route's own context.
  // Overwriting it unconditionally destroyed the money page's context with
  // technical-triage wording. The only variable content allowed here is the
  // label of the option the server returned, and only once the visitor has
  // actually chosen one.
  function updateFallbackChannels() {
    var option = need.options[need.selectedIndex];
    var situation = option && option.value ? String(option.textContent || "").trim() : "";
    fallbackLinks.forEach(function (link, index) {
      var selectedChannel = link.getAttribute("data-fallback-channel");
      var original = staticChannelHrefs[index];
      if (selectedChannel !== "whatsapp" && selectedChannel !== "email") return;
      if (!situation || (!whatsappIntent && !emailSubject)) {
        if (original) link.setAttribute("href", original);
        return;
      }
      if (selectedChannel === "whatsapp" && whatsappIntent) {
        link.href = "https://wa.me/5548988344559?text=" + encodeURIComponent(
          whatsappIntent + " Situação: " + situation + "."
        );
      } else if (selectedChannel === "email" && emailSubject) {
        link.href = "mailto:tiago.sasaki@confenge.com.br?subject=" + encodeURIComponent(
          emailSubject + " — " + situation
        );
      } else if (original) {
        link.setAttribute("href", original);
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

  // Single attempt, hard deadline, AbortController. The deadline covers the
  // asynchronous read of the body too: headers alone do not end the operation.
  // A late response can never reach configure(), so it cannot repopulate the
  // select, move focus or rewrite the channel hrefs under a visitor who has
  // already been taken to the contact alternative.
  function loadConfiguration() {
    if (!endpoint) return unavailable(new Error("config_unavailable"));
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timedOut = false;
    var timer = window.setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, CONFIG_TIMEOUT_MS);
    var options = { headers: { Accept: "application/json" }, credentials: "same-origin" };
    if (controller) options.signal = controller.signal;
    fetch(endpoint, options)
      .then(function (response) {
        if (!response.ok) {
          var error = new Error(
            response.status === 422 ? "config_context_unknown"
              : response.status === 405 ? "config_method_not_allowed"
                : "config_unavailable"
          );
          error.status = response.status;
          throw error;
        }
        return response.json().catch(function () { throw new Error("invalid_body"); });
      })
      .then(function (data) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        // configure() throws on an invalid contract. Because `settled` is
        // already true, the .catch below would swallow it and the page would
        // sit on "Verificando a disponibilidade…" forever — the exact defect
        // this issue exists to remove. Handle it here instead.
        try {
          configure(data);
        } catch (error) {
          unavailable(error);
        }
      })
      .catch(function (error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unavailable(timedOut ? new Error("config_timeout") : error);
      });
  }

  loadConfiguration();

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
    if (!configured) return unavailable(new Error("config_unavailable"));
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
    if (!configured) return unavailable(new Error("config_unavailable"));
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
    // Everything from here to the fetch used to be a one-way door: the control
    // is disabled, but the ONLY re-enable lives in the fetch chain's .finally.
    // Anything that threw in between -- payload assembly, the analytics call --
    // left the visitor on a permanently dead button with "Registrando seu
    // pedido…" frozen and no request ever sent, which is the worst of both
    // states: it looks like something is happening and nothing is. Nothing
    // observed has thrown here; the point is that the failure mode must not
    // exist, because the visitor cannot recover from it.
    try {
      body.idempotency_key = await idempotencyKeyFor(currentFingerprint);
      track("lead_form_submit", {
        form_step: 2,
        need_category: need.value,
        channel: channel.value,
        location_required: locationRequired()
      });
    } catch (setupError) {
      // No request left the page, so "not sent" is the truthful message and the
      // direct channels stay the way forward.
      form.removeAttribute("aria-busy");
      if (!form.hidden) submit.disabled = false;
      showStatus(
        "O pedido não foi enviado. Verifique a conexão e tente novamente com os mesmos dados, ou use um dos canais diretos.",
        "error"
      );
      track("lead_form_backend_error", { error_code: "not_sent" });
      return;
    }

    // Once the POST has left, the request may already have been persisted. From
    // this point a 503, a timeout, unreadable JSON or an unexpected shape mean
    // "receipt not confirmed" — never "not sent". Claiming "not sent" requires
    // certainty that the attempt never started.
    var postStarted = false;
    var postController = typeof AbortController === "function" ? new AbortController() : null;
    var postTimedOut = false;
    var postTimer = window.setTimeout(function () {
      postTimedOut = true;
      if (postController) postController.abort();
    }, SUBMIT_TIMEOUT_MS);
    var request = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": body.idempotency_key
      },
      body: JSON.stringify(body),
      credentials: "same-origin"
    };
    if (postController) request.signal = postController.signal;

    fetch(form.action, request)
      .then(function (response) {
        postStarted = true;
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { response: response, data: data };
        });
      })
      .then(function (reply) {
        var receiptId = reply.data && (reply.data.receipt_id || reply.data.lead_id);
        if (![200, 201].includes(reply.response.status) || reply.data.ok !== true || !receiptId) {
          var error = new Error(reply.data.error || "receipt_unconfirmed");
          error.status = reply.response.status;
          throw error;
        }
        window.clearTimeout(postTimer);
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
        window.clearTimeout(postTimer);
        var rateLimited = error && error.status === 429;
        // postTimedOut means the request was already in flight when the deadline
        // hit, so it belongs to the "started" branch too.
        var attemptStarted = postStarted || postTimedOut;
        var message;
        if (rateLimited) {
          message = "Muitas tentativas em sequência. Aguarde um pouco e tente novamente com os mesmos dados, ou use um dos canais diretos.";
        } else if (attemptStarted) {
          message = "Ainda não foi possível confirmar o recebimento. Seu pedido pode ter sido gravado. Tente novamente com os mesmos dados, sem alterá-los, ou use um dos canais diretos.";
        } else {
          message = "O pedido não foi enviado. Verifique a conexão e tente novamente com os mesmos dados, ou use um dos canais diretos.";
        }
        showStatus(message, "error");
        track("lead_form_backend_error", {
          error_code: rateLimited ? "rate_limited" : attemptStarted ? "receipt_unconfirmed" : "not_sent"
        });
      })
      .finally(function () {
        form.removeAttribute("aria-busy");
        if (!form.hidden) submit.disabled = false;
      });
  });

  updateChannel();
  updateLocation();
  updateFallbackChannels();
  setStep(0, false);
})();
