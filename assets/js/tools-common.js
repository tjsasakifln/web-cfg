/**
 * Shared helpers for CONFENGE high-intent tools.
 * No PII collection unless user explicitly submits lead form elsewhere.
 */
(function () {
  function track(name, props) {
    try {
      if (typeof window.track === "function") window.track(name, props);
      else if (window.dataLayer) window.dataLayer.push({ event: name, ...props });
      // first-party collector path via global from script.js if exposed
      if (window.CONFENGE && typeof window.CONFENGE.track === "function") {
        window.CONFENGE.track(name, props);
      }
    } catch (_) { /* never break tool */ }
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
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function pct(n) {
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  }

  function num(el) {
    if (!el) return 0;
    const raw = String(el.value || "0").replace(/\./g, "").replace(",", ".");
    // accept both 1.234,56 and 1234.56
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

  window.ConfengeTools = { track, downloadText, brl, pct, num, waLink };
})();
