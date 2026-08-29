/** Canonical events: tool_view, tool_start, tool_complete, tool_copy, tool_download, tool_reset, tool_to_content, tool_to_offer, tool_to_whatsapp, tool_to_form */
(function () {
  "use strict";
  var P = "confenge.tool.", TTL = 864e5 * 30;
  var PII_KEYS = ["email","phone","valor","valorinicial","valorInicial","raw","nome","cnpj","cpf","q","query","qid","mensagem","message","causa","observacao","telefone","tel","whatsapp","name","empresa","documento","identificador","contrato","freetext","free_text","search_query","edital"];
  var SAFE_STRING_KEYS = ["tool","level","offer","tipo","cta_branch","readiness","urgencia","materialidade"];
  var SAFE_NUMBER_KEYS = ["events","sem_prova","blockers","unknown_count","official_count"];
  var SAFE_BOOLEAN_KEYS = ["within_ac","within_su"];
  function sensitiveKey(k) {
    var s = String(k || "").toLowerCase();
    if (PII_KEYS.indexOf(k) >= 0 || PII_KEYS.indexOf(s) >= 0) return true;
    return /email|phone|tel|nome|name|mensagem|message|whatsapp|cpf|cnpj|document|valor|causa|observ|qid|query|raw|identificador/.test(s);
  }
  function scrubProps(props) {
    var input = props && typeof props === "object" ? props : {};
    var safe = {};
    Object.keys(input).forEach(function (k) {
      if (sensitiveKey(k)) return;
      var value = input[k];
      if (SAFE_STRING_KEYS.indexOf(k) >= 0 && typeof value === "string" && /^[a-z0-9][a-z0-9._:/-]{0,79}$/i.test(value)) safe[k] = value;
      else if (SAFE_NUMBER_KEYS.indexOf(k) >= 0 && Number.isSafeInteger(value) && value >= 0 && value <= 100000) safe[k] = value;
      else if (SAFE_BOOLEAN_KEYS.indexOf(k) >= 0 && typeof value === "boolean") safe[k] = value;
    });
    return safe;
  }
  function emit(name, props) {
    var safe = scrubProps(props);
    try {
      if (typeof window.confengeTrack === "function") return void window.confengeTrack(name, safe);
      if (typeof window.track === "function") return void window.track(name, safe);
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, safe));
    } catch (_) {}
  }
  function parseMoney(raw) {
    var C = window.ConfengeToolCompute;
    return C && C.parseBRL ? C.parseBRL(raw) : { ok: false, error: "na" };
  }
  function setFieldError(el, message) {
    if (!el) return;
    el.setAttribute("aria-invalid", message ? "true" : "false");
    el.classList.toggle("is-invalid", !!message);
    var wrap = el.closest(".tool-field") || el.parentElement;
    var err = wrap && wrap.querySelector(".tool-field-error");
    if (!err && wrap) { err = document.createElement("p"); err.className = "tool-field-error"; err.setAttribute("role", "alert"); wrap.appendChild(err); }
    if (err) { err.textContent = message || ""; err.hidden = !message; }
  }
  function bindToolLifecycle(opts) {
    var tool = opts.tool || "unknown";
    emit("tool_view", { tool: tool });
    var started = false;
    function onStart() { if (started) return; started = true; emit("tool_start", { tool: tool }); }
    document.querySelectorAll(opts.startSelectors || "input, select, textarea, button.tool-run").forEach(function (el) {
      el.addEventListener("focus", onStart, { once: true });
      el.addEventListener("change", onStart, { once: true });
    });
    document.querySelectorAll("[data-tool-download]").forEach(function (el) { el.addEventListener("click", function () { emit("tool_download", { tool: tool }); }); });
    document.querySelectorAll("[data-tool-copy]").forEach(function (el) { el.addEventListener("click", function () { emit("tool_copy", { tool: tool }); }); });
    document.querySelectorAll("[data-tool-reset]").forEach(function (el) { el.addEventListener("click", function () { emit("tool_reset", { tool: tool }); }); });
    document.addEventListener("click", function (event) {
      var target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      var offer = target.closest("[data-tool-to-offer]");
      if (offer) { emit("tool_to_offer", { tool: tool, offer: offer.getAttribute("data-tool-to-offer") || "" }); return; }
      if (target.closest("[data-tool-to-whatsapp], a[href*='wa.me']")) { emit("tool_to_whatsapp", { tool: tool }); return; }
      if (target.closest("[data-tool-to-form], a[href*='#contato']")) { emit("tool_to_form", { tool: tool }); return; }
      if (target.closest("[data-tool-to-content]")) emit("tool_to_content", { tool: tool });
    });
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  window.ConfengeTools = {
    track: emit, emit: emit, scrubProps: scrubProps, bindToolLifecycle: bindToolLifecycle, parseMoney: parseMoney, setFieldError: setFieldError,
    escapeHtml: escapeHtml,
    moneyFromField: function (el) { return el ? parseMoney(el.value) : { ok: false, error: "vazio" }; },
    num: function (el) { var p = el ? parseMoney(el.value) : { ok: false }; return p.ok ? p.value : 0; },
    brl: function (n) { return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "n/d"; },
    pct: function (n) { return Number.isFinite(n) ? (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%" : "n/d"; },
    waLink: function (t) { return "https://wa.me/5548988344559?text=" + encodeURIComponent(t); },
    localNow: function () { try { return new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (_) { return new Date().toISOString(); } },
    saveState: function (id, v, d) { try { var packed = (typeof ConfengeToolPersist !== "undefined" && ConfengeToolPersist.packState) ? ConfengeToolPersist.packState(v, d) : (window.ConfengeToolPersist && window.ConfengeToolPersist.packState ? window.ConfengeToolPersist.packState(v, d) : { v: v || 1, savedAt: Date.now(), data: d }); localStorage.setItem(P + id, JSON.stringify(packed)); } catch (_) {} },
    loadState: function (id, v) {
      try {
        var r = localStorage.getItem(P + id); if (!r) return null;
        var p = JSON.parse(r); if (v != null && p.v !== v) { localStorage.removeItem(P + id); return null; }
        if (p.savedAt && Date.now() - p.savedAt > TTL) { localStorage.removeItem(P + id); return null; }
        return p.data;
      } catch (_) { return null; }
    },
    clearState: function (id) { try { localStorage.removeItem(P + id); } catch (_) {} },
    copyText: function (t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }); return Promise.resolve(false); },
    buildReport: function (secs) {
      var lines = [];
      (secs || []).forEach(function (s) { if (!s) return; if (s.title) lines.push(s.title); if (s.body) lines.push(s.body); if (s.lines) s.lines.forEach(function (l) { lines.push(l); }); lines.push(""); });
      lines.push("Gerado em: " + window.ConfengeTools.localNow());
      lines.push("Dados apenas neste navegador. Ferramenta orientativa da CONFENGE.");
      return lines.join("\n").trim() + "\n";
    },
    downloadText: function (f, t) { var b = new Blob([t], { type: "text/plain;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = f; a.click(); },
    focusResult: function (el) { if (!el) return; el.hidden = false; if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); try { el.focus(); } catch (_) {} },
    focusFirstError: function (r) { var el = (r || document).querySelector('[aria-invalid="true"]'); if (el) el.focus(); }
  };
})();
