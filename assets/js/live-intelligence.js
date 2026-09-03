/* Live-intelligence surfaces (Surface A: /oportunidades/, Surface B: /analise-cnpj/).
 *
 * No PII, ever. The CNPJ the visitor types is sent to the analysis function and
 * nowhere else: it never enters an event payload, the URL, sessionStorage or a
 * log line. Events carry fixed state labels and identifiers only — never a
 * company fact, a computed value or free text.
 *
 * Events emitted here (registered in netlify/functions/lib/event-registry.json):
 *   intel_view, company_analysis_start, company_analysis_complete,
 *   fit_result_shown, monitor_cta_click, monitor_request_persisted,
 *   deep_dive_request_persisted
 */
(() => {
  const ANALYZE_ENDPOINT = "/.netlify/functions/live-intelligence-analyze";
  const LEAD_ENDPOINT = "/api/web/lead";
  // Only a same-origin result address minted by the analyze function is ever
  // navigated to. The token shape is pinned so no other value the response
  // carries could be used as a redirect target.
  const RESULT_TOKEN_RE = /^li_[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/;
  const RESULT_PATH_RE = /^\/analise-cnpj\/r\/\?t=li_[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/;
  // Mirrors the server-side allowlist in netlify/functions/lib/lead-core.cjs.
  // A value outside this set is dropped there; refusing it here too means the
  // visitor gets an error instead of a silently intent-less lead.
  const INTENT_KINDS = {
    MONITOR_OPPORTUNITY: "monitor",
    MONITOR_COMPANY: "monitor",
    REQUEST_DEEP_DIVE: "deep_dive",
    REQUEST_HUMAN_REVIEW: "deep_dive",
  };
  const body = document.body;
  if (!body) return;
  const surface = body.getAttribute("data-intel-surface");
  if (!surface) return;

  const base = {
    asset_id: body.getAttribute("data-asset-id") || "",
    asset_family: body.getAttribute("data-asset-family") || "",
    route_family: body.getAttribute("data-route-family") || "",
    index_state: body.getAttribute("data-index-state") || "NOINDEX",
    page_path: (window.location && window.location.pathname) || "/",
    source: "CONFENGE_WEB",
  };
  const correlation = `li-${Date.now().toString(36)}`;

  /**
   * One analytics policy, not two.
   *
   * `window.confengeTrack` (js/modules/analytics.js, compiled into script.js) is
   * the only sanitizer: it applies the canonical PII key pattern, the value-level
   * scan and the event-contract admission before anything reaches dataLayer or
   * the registry-declared consumer netlify/functions/collect.cjs.
   *
   * There is deliberately no fallback. A local key-only filter here would be a
   * second, weaker policy — it would miss substring key matches and every
   * value-level rule — and it would bypass admission entirely by pushing
   * straight to dataLayer. When the canonical bus is unavailable the event is
   * dropped: losing an event is correct, leaking one is not.
   */
  const emit = (name, extra) => {
    if (typeof window.confengeTrack !== "function") return;
    window.confengeTrack(name, { ...base, correlation_id: correlation, ...(extra || {}) });
  };

  emit("intel_view", { surface_kind: surface });

  const el = (id) => document.getElementById(id);
  const show = (node) => { if (node) node.hidden = false; };
  const hide = (node) => { if (node) node.hidden = true; };
  const setStatus = (node, text) => {
    if (!node) return;
    node.textContent = text;
    node.hidden = !text;
  };

  const escapeText = (value) => String(value == null ? "" : value);

  // --- Surface A: opportunity page ------------------------------------------
  if (surface === "opportunity") {
    // The "monitor" CTA links to the homepage's shared contact form
    // (/#formulario-contato) — a full navigation, so no in-page JS state
    // survives it. js/modules/nav.js already reads a small, allowlisted
    // attribution object from this exact sessionStorage key on page load and
    // applies it to the shared form's hidden fields (analysis_id and
    // route_family are already on that allowlist; intent_kind is added to it
    // alongside this change). Writing here, not a new mechanism, is what
    // makes intent_kind and the opportunity id actually reach the lead and
    // the Warmbly handoff instead of being lost at navigation.
    const PSEO_STORAGE_KEY = "confenge_pseo_attribution";
    document.querySelectorAll('[data-intel-cta]').forEach((node) => {
      node.addEventListener("click", () => {
        const kind = node.getAttribute("data-intent-kind") || "";
        const validKind = Object.prototype.hasOwnProperty.call(INTENT_KINDS, kind) ? kind : "";
        emit("monitor_cta_click", {
          cta_id: node.getAttribute("data-cta-id") || "",
          cta_position: node.getAttribute("data-cta-position") || "",
          intent_kind: validKind,
          surface_kind: surface,
        });
        if (!validKind) return;
        try {
          const prior = JSON.parse(sessionStorage.getItem(PSEO_STORAGE_KEY) || "{}") || {};
          const merged = {
            ...(prior && typeof prior === "object" ? prior : {}),
            intent_kind: validKind,
            analysis_id: node.getAttribute("data-analysis-id") || "",
            route_family: "live-opportunity-monitor",
            saved_at: String(Date.now()),
          };
          sessionStorage.setItem(PSEO_STORAGE_KEY, JSON.stringify(merged));
        } catch (_) {
          /* private mode: the CTA still navigates, just without prefill */
        }
      });
    });
    return;
  }

  if (surface !== "company") return;

  // --- Surface B: CNPJ analysis ---------------------------------------------
  const cnpjForm = el("cnpj-form");
  const cnpjInput = el("cnpj");
  const analiseStatus = el("analise-status");
  const resultado = el("resultado");
  const resultadoTitulo = el("resultado-titulo");
  const resultadoExplicacao = el("resultado-explicacao");
  const resultadoCorpo = el("resultado-corpo");
  const limitacoesSection = el("limitacoes");
  const limitacoesList = el("resultado-limitacoes");
  const disclaimerNode = el("resultado-disclaimer");
  const proximoPasso = el("proximo-passo");
  const pedido = el("pedido");
  const pedidoTitulo = el("pedido-titulo");
  const pedidoStatus = el("pedido-status");
  const leadForm = el("intel-lead-form");
  const intentInput = el("intel-intent-kind");
  const analysisInput = el("intel-analysis-id");
  const ctaInput = el("intel-cta-id");
  const consentCheckbox = el("intel-consentimento");
  const consentAtInput = el("intel-consent-at");
  const cadenceField = el("intel-cadence-field");
  const consentCheckTime = {}; // Store when consent was checked

  // On the shareable result page the analysis is already known: the server
  // rendered its opaque token into the document. Seeding from there is what
  // lets the next-action CTAs work on a page opened cold from a shared link,
  // with no closure state and no CNPJ anywhere.
  let currentAnalysisId = body.getAttribute("data-analysis-id") || "";

  const list = (values) => {
    const ul = document.createElement("ul");
    (values || []).forEach((value) => {
      const li = document.createElement("li");
      li.textContent = escapeText(value);
      ul.appendChild(li);
    });
    return ul;
  };

  const block = (heading, values) => {
    if (!values || !values.length) return null;
    const wrapper = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.textContent = heading;
    wrapper.appendChild(h3);
    wrapper.appendChild(list(values));
    return wrapper;
  };

  const renderResult = (result) => {
    currentAnalysisId = result.analysis_id || "";
    if (resultadoTitulo) resultadoTitulo.textContent = escapeText(result.titulo);
    if (resultadoExplicacao) resultadoExplicacao.textContent = escapeText(result.explicacao);
    if (disclaimerNode) disclaimerNode.textContent = escapeText(result.disclaimer);
    if (resultadoCorpo) {
      resultadoCorpo.textContent = "";
      const perfil = result.perfil;
      if (perfil) {
        const dl = document.createElement("dl");
        Object.keys(perfil).forEach((key) => {
          const dt = document.createElement("dt");
          dt.textContent = key.replace(/_/g, " ");
          const dd = document.createElement("dd");
          const raw = perfil[key];
          dd.textContent = raw === null || raw === "" ? "UNKNOWN" : escapeText(raw);
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        resultadoCorpo.appendChild(dl);
      }
      [
        ["Categorias declaradas", result.categorias],
        ["Faixas de valor declaradas", result.faixas],
        ["Geografias declaradas", result.geografias],
        ["Compradores declarados", result.compradores],
        ["Dimensões da aderência", result.dimensoes_da_aderencia],
        ["Lacunas declaradas", result.gaps],
        ["UNKNOWN nas fontes", result.unknowns],
      ].forEach(([heading, values]) => {
        const node = block(heading, values);
        if (node) resultadoCorpo.appendChild(node);
      });
      if ((result.oportunidades_aderentes || []).length) {
        const h3 = document.createElement("h3");
        h3.textContent = "Oportunidades aderentes";
        resultadoCorpo.appendChild(h3);
        const ul = document.createElement("ul");
        result.oportunidades_aderentes.forEach((row) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `/oportunidades/${encodeURIComponent(row.opportunity_id)}/`;
          a.textContent = escapeText(row.opportunity_id);
          li.appendChild(a);
          li.appendChild(document.createTextNode(` — dimensões: ${(row.dimensoes || []).join(", ") || "UNKNOWN"}`));
          ul.appendChild(li);
        });
        resultadoCorpo.appendChild(ul);
      }
      const provH3 = document.createElement("h3");
      provH3.textContent = "Procedência técnica";
      resultadoCorpo.appendChild(provH3);
      const provDl = document.createElement("dl");
      [
        ["Identificador estável", result.analysis_id],
        ["Origem dos dados", result.fonte_kind],
        ["Elegível a indexação", "não"],
      ].forEach(([label, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value === null || value === undefined || value === "" ? "UNKNOWN" : escapeText(value);
        provDl.appendChild(dt);
        provDl.appendChild(dd);
      });
      resultadoCorpo.appendChild(provDl);
    }
    if (limitacoesList) {
      limitacoesList.textContent = "";
      (result.limitations || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = escapeText(item);
        limitacoesList.appendChild(li);
      });
      if ((result.limitations || []).length) show(limitacoesSection);
      else hide(limitacoesSection);
    }
    show(resultado);
    show(proximoPasso);
    hide(pedido);

    // This in-place render is the degraded path only: it runs when the result
    // has no shareable address because the store was unavailable. The normal
    // path navigates to `result_path`, where the server renders the same result
    // from the stored record. Either way the address bar holds an opaque token
    // or nothing at all — never the CNPJ.

    emit("company_analysis_complete", { result_state: escapeText(result.state), surface_kind: surface });
    emit("fit_result_shown", {
      result_state: escapeText(result.state),
      has_adherent_opportunities: (result.oportunidades_aderentes || []).length > 0 ? "yes" : "no",
      surface_kind: surface,
    });
  };

  // --- The shareable result shell -------------------------------------------
  // /analise-cnpj/r/<token>/ is one static page for every result. It reads the
  // opaque token out of its own address and asks the analyze function for the
  // stored record. That is what makes a result survive a hard refresh,
  // back/forward, and being opened cold from a link in another browser session:
  // nothing is held in a closure, and the address is the only state.
  //
  // The token is random and carries no CNPJ, so this address is safe to share.
  if (body.getAttribute("data-intel-result-shell") === "true") {
    const search = (window.location && window.location.search) || "";
    const raw = (search.match(/[?&]t=([^&]*)/) || [])[1] || "";
    let token = "";
    try {
      token = decodeURIComponent(raw);
    } catch (err) {
      token = "";
    }
    if (!RESULT_TOKEN_RE.test(token)) {
      setStatus(analiseStatus, "Endereço de resultado inválido.");
    } else {
      currentAnalysisId = token;
      if (analysisInput) analysisInput.value = token;
      setStatus(analiseStatus, "Carregando o resultado…");
      // The token is opaque; putting it in the query of an internal API call
      // exposes nothing about the company that was looked up.
      fetch(`${ANALYZE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      })
        .then((res) => res.json().then((payload) => ({ res, payload })))
        .then(({ res, payload }) => {
          if (!res.ok || !payload.ok) {
            setStatus(
              analiseStatus,
              payload.message || "Este resultado não existe mais. Faça uma nova análise.",
            );
            return;
          }
          setStatus(analiseStatus, "");
          renderResult(payload);
        })
        .catch(() => {
          setStatus(analiseStatus, "Não foi possível carregar o resultado. Tente novamente.");
        });
    }
  }

  if (cnpjForm) {
    cnpjForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = cnpjInput ? cnpjInput.value : "";
      setStatus(analiseStatus, "Consultando as fontes públicas…");
      // The CNPJ is never a property here — only the fact that a lookup began.
      emit("company_analysis_start", { surface_kind: surface });
      try {
        const res = await fetch(ANALYZE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ cnpj: value }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) {
          setStatus(analiseStatus, payload.message || "Não foi possível concluir a consulta.");
          emit("company_analysis_complete", { result_state: "ERRO", surface_kind: surface });
          return;
        }
        setStatus(analiseStatus, "");
        // The result has a real address. Navigating to it — rather than holding
        // the payload in this closure — is what makes it survive a refresh,
        // back/forward, and being opened from a shared link in another session.
        // The address carries only the opaque token; the CNPJ is not in it.
        if (payload.result_path && RESULT_PATH_RE.test(payload.result_path)) {
          window.location.assign(payload.result_path);
          return;
        }
        // No shareable address (the store was unavailable). The answer still
        // stands, so it is rendered in place rather than withheld.
        renderResult(payload);
      } catch (err) {
        setStatus(analiseStatus, "Não foi possível concluir a consulta. Tente novamente.");
        emit("company_analysis_complete", { result_state: "ERRO", surface_kind: surface });
      }
    });
  }

  // Capture consent timestamp when checkbox is checked
  if (consentCheckbox) {
    consentCheckbox.addEventListener("change", () => {
      if (consentCheckbox.checked && !consentCheckTime.at) {
        consentCheckTime.at = new Date().toISOString();
        if (consentAtInput) {
          consentAtInput.value = consentCheckTime.at;
        }
      }
    });
  }

  // Show/hide cadence field based on intent_kind
  function updateCadenceVisibility() {
    const kind = intentInput ? intentInput.value : "";
    const isMonitor = kind === "MONITOR_COMPANY" || kind === "MONITOR_OPPORTUNITY";
    if (cadenceField) {
      cadenceField.hidden = !isMonitor;
    }
  }

  document.querySelectorAll('[data-intel-cta="request"]').forEach((node) => {
    node.addEventListener("click", () => {
      const kind = node.getAttribute("data-intent-kind") || "";
      if (!Object.prototype.hasOwnProperty.call(INTENT_KINDS, kind)) return;
      const ctaId = node.getAttribute("data-cta-id") || "";
      emit("monitor_cta_click", {
        cta_id: ctaId,
        cta_position: node.getAttribute("data-cta-position") || "",
        intent_kind: kind,
        surface_kind: surface,
      });
      if (intentInput) intentInput.value = kind;
      if (analysisInput) analysisInput.value = currentAnalysisId;
      if (ctaInput) ctaInput.value = ctaId;
      if (pedidoTitulo) pedidoTitulo.textContent = node.textContent.trim();
      updateCadenceVisibility();
      show(pedido);
      const firstField = el("intel-nome");
      if (firstField && typeof firstField.focus === "function") firstField.focus();
    });
  });

  if (leadForm) {
    leadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const kind = intentInput ? intentInput.value : "";
      if (!Object.prototype.hasOwnProperty.call(INTENT_KINDS, kind)) {
        setStatus(pedidoStatus, "Escolha primeiro qual pedido você quer registrar.");
        return;
      }
      const data = new FormData(leadForm);
      const payload = {};
      data.forEach((value, key) => { payload[key] = value; });
      payload.consentimento = leadForm.querySelector("#intel-consentimento").checked ? "on" : "";
      const turnstile = leadForm.querySelector('[name="cf-turnstile-response"]');
      if (turnstile && turnstile.value) {
        payload.turnstile_token = turnstile.value;
        payload["cf-turnstile-response"] = turnstile.value;
      }
      setStatus(pedidoStatus, "Registrando o pedido…");
      try {
        const res = await fetch(LEAD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok || !result.ok) {
          setStatus(pedidoStatus, result.message || "Não foi possível registrar o pedido.");
          return;
        }
        setStatus(
          pedidoStatus,
          `Pedido registrado. Protocolo: ${escapeText(result.lead_id || "")}.`,
        );
        leadForm.reset();
        const eventName = INTENT_KINDS[kind] === "monitor"
          ? "monitor_request_persisted"
          : "deep_dive_request_persisted";
        emit(eventName, {
          intent_kind: kind,
          cta_id: ctaInput ? ctaInput.value : "",
          surface_kind: surface,
        });
      } catch (err) {
        setStatus(pedidoStatus, "Não foi possível registrar o pedido. Tente novamente.");
      }
    });
  }
})();
