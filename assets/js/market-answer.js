/* Market Answer canary events — no PII. Uses window.confengeTrack when present. */
(() => {
  const EVENTS = [
    "answer_view",
    "method_open",
    "evidence_drilldown",
    "analysis_click",
    "xray_start",
    "cta_view",
    "cta_click",
    "lead_receipt_correlated",
    "correction_open",
  ];
  const PII = new Set([
    "nome", "name", "email", "telefone", "phone", "tel", "whatsapp",
    "empresa", "company", "mensagem", "message", "cpf", "cnpj",
    "documento", "document", "query", "q", "search_query",
  ]);
  const body = document.body || {};
  const base = {
    asset_id: body.getAttribute && body.getAttribute("data-asset-id") || "valor-tipico-contratos-pavimentacao",
    asset_family: body.getAttribute && body.getAttribute("data-asset-family") || "market-answer",
    route_family: body.getAttribute && body.getAttribute("data-route-family") || "market-answer",
    asset_version: "1.0",
    content_hash: body.getAttribute && body.getAttribute("data-content-hash") || "",
    producer_status: body.getAttribute && body.getAttribute("data-producer-status") || "",
    index_state: body.getAttribute && body.getAttribute("data-index-state") || "",
    page_path: (window.location && window.location.pathname) || "/inteligencia/valor-tipico-contratos-pavimentacao/",
    source: "CONFENGE_WEB",
  };
  const correlation = `ma-${Date.now().toString(36)}`;
  const corrField = document.getElementById("ma-correlation");
  if (corrField) corrField.value = correlation;

  const emit = (name, extra) => {
    const props = { ...base, correlation_id: correlation, ...(extra || {}) };
    Object.keys(props).forEach((key) => {
      if (PII.has(String(key).toLowerCase())) delete props[key];
    });
    if (typeof window.confengeTrack === "function") {
      window.confengeTrack(name, props);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...props });
  };

  emit("answer_view");

  const method = document.getElementById("metodologia");
  if (method) {
    const once = () => emit("method_open");
    method.addEventListener("toggle", once, { once: true });
    method.addEventListener("click", once, { once: true });
  }

  document.querySelectorAll("[data-ma-event]").forEach((el) => {
    el.addEventListener("click", () => {
      const name = el.getAttribute("data-ma-event");
      if (!name || EVENTS.indexOf(name) < 0) return;
      emit(name, {
        cta_id: el.getAttribute("data-cta-id") || "",
        evidence_id: el.getAttribute("data-evidence-id") || "",
        analysis_id: el.getAttribute("data-analysis-id") || "",
        cta_position: el.getAttribute("data-cta-position") || "inline",
      });
    });
  });

  const cta = document.getElementById("cta");
  if (cta && typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          emit("cta_view", { cta_id: "market-answer-next", cta_position: "after-fold" });
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(cta);
  }
})();
