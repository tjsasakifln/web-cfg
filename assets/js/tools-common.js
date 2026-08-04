/**
 * Shared helpers for CONFENGE high-intent tools.
 * No PII collection unless user explicitly submits lead form elsewhere.
 *
 * Canonical tool events (real-only analytics, no PII):
 *   tool_view, tool_start, tool_complete, tool_download,
 *   tool_to_offer, tool_to_whatsapp, tool_to_form, nurture_opt_in
 */
(function () {
  function emit(name, props) {
    const safe = props && typeof props === "object" ? props : {};
    try {
      if (typeof window.confengeTrack === "function") {
        window.confengeTrack(name, safe);
        return;
      }
      if (typeof window.track === "function") {
        window.track(name, safe);
        return;
      }
      if (window.CONFENGE && typeof window.CONFENGE.track === "function") {
        window.CONFENGE.track(name, safe);
        return;
      }
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, safe));
    } catch (_) {
      /* never break tool */
    }
  }

  function track(name, props) {
    emit(name, props);
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function brl(n) {
    if (!Number.isFinite(n)) return "n/d";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function pct(n) {
    if (!Number.isFinite(n)) return "n/d";
    return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  }

  function num(el) {
    if (!el) return 0;
    let v = String(el.value || "0").trim();
    if (v.includes(",") && v.includes(".")) {
      v = v.replace(/\./g, "").replace(",", ".");
    } else if (v.includes(",")) {
      v = v.replace(",", ".");
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function waLink(text) {
    const msg = encodeURIComponent(text);
    return "https://wa.me/5548988344559?text=" + msg;
  }

  /**
   * Wire standard tool lifecycle on a page.
   * @param {{ tool: string, startSelectors?: string, completeSelector?: string }} opts
   */
  function bindToolLifecycle(opts) {
    const tool = opts.tool || "unknown";
    emit("tool_view", { tool });
    let started = false;
    function onStart() {
      if (started) return;
      started = true;
      emit("tool_start", { tool });
    }
    document.querySelectorAll(opts.startSelectors || "input, select, textarea, button.tool-run").forEach((el) => {
      el.addEventListener("focus", onStart, { once: true });
      el.addEventListener("change", onStart, { once: true });
    });
    document.querySelectorAll("[data-tool-download]").forEach((el) => {
      el.addEventListener("click", () => emit("tool_download", { tool }));
    });
    document.querySelectorAll("[data-tool-to-whatsapp], a[href*='wa.me']").forEach((el) => {
      el.addEventListener("click", () => emit("tool_to_whatsapp", { tool }));
    });
    document.querySelectorAll("[data-tool-to-form], a[href*='#contato']").forEach((el) => {
      el.addEventListener("click", () => emit("tool_to_form", { tool }));
    });
    document.querySelectorAll("[data-tool-to-offer]").forEach((el) => {
      el.addEventListener("click", () =>
        emit("tool_to_offer", { tool, offer: el.getAttribute("data-tool-to-offer") || "" })
      );
    });
    document.querySelectorAll("[data-nurture-opt-in]").forEach((el) => {
      el.addEventListener("click", () => emit("nurture_opt_in", { tool, source: "tool_page" }));
    });
  }

  window.ConfengeTools = {
    track,
    emit,
    downloadText,
    brl,
    pct,
    num,
    waLink,
    bindToolLifecycle,
  };
})();
