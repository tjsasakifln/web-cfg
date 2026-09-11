/**
 * Page-local share/copy for partner reference kits.
 * Clipboard and optional native share only. Never posts a lead or sends mail.
 */
(function () {
  "use strict";

  var COPY_LINK_OK = "Link copiado. Isso não envia mensagem nem registra um pedido.";
  var COPY_SUMMARY_OK = "Resumo copiado. Isso não envia mensagem nem registra um pedido.";
  var COPY_FAIL = "Não foi possível copiar. O texto continua visível para você selecionar.";
  var SHARE_OK = "Link compartilhado. Isso não envia um pedido em seu nome.";
  var SHARE_FAIL = "O compartilhamento nativo não concluiu. O endereço continua visível.";

  function classifyShareAction() {
    return {
      event: "cta_click",
      layer: "engagement",
      is_lead: false,
      is_relationship: false,
      is_partner_contact: false,
    };
  }

  function emitCopy(ctaId) {
    var classified = classifyShareAction();
    if (classified.is_lead || classified.is_partner_contact) return;
    var payload = {
      event: classified.event,
      cta_id: String(ctaId || "share-copy-kit").slice(0, 80),
      cta_position: "partner_kit_share",
      route_family: "parcerias-engenharia",
      asset_id: "partner-reference-kits-v1",
    };
    try {
      if (typeof window.confengeTrack === "function") {
        window.confengeTrack("cta_click", payload);
        return;
      }
      if (typeof window.track === "function") {
        window.track("cta_click", payload);
        return;
      }
      if (window.dataLayer) window.dataLayer.push(payload);
    } catch (_) {}
  }

  function copyWithFallback(text, input) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return selectFallback(input, text);
      });
    }
    return Promise.resolve(selectFallback(input, text));
  }

  function selectFallback(input, text) {
    if (!input) return false;
    try {
      if (typeof text === "string" && input.value !== text) {
        input.value = text;
      }
      input.focus();
      input.select();
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(0, input.value.length);
      }
      if (typeof document.execCommand === "function") {
        return document.execCommand("copy") === true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  function setStatus(root, message, isError) {
    var status = root.querySelector("[data-share-status]");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.setAttribute("role", isError ? "alert" : "status");
  }

  function bindRoot(root) {
    var input = root.querySelector("[data-share-url]");
    var summary = root.querySelector("[data-share-summary]");
    var copyBtn = root.querySelector("[data-share-copy]");
    var copySummaryBtn = root.querySelector("[data-share-copy-summary]");
    var nativeBtn = root.querySelector("[data-share-native]");
    var attributed = root.getAttribute("data-share-attributed") || "";
    var canonical = (input && input.value) || root.getAttribute("data-share-canonical") || "";
    var ctaId = root.getAttribute("data-cta-id") || "share-copy-kit";
    var title = root.getAttribute("data-share-title") || "CONFENGE";
    var summaryText = (summary && summary.value) || root.getAttribute("data-share-summary-text") || "";

    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.addEventListener("click", function () {
        var text = attributed || canonical;
        return copyWithFallback(text, input).then(function (ok) {
          if (ok) {
            setStatus(root, COPY_LINK_OK, false);
            emitCopy(ctaId);
            return false;
          }
          setStatus(root, COPY_FAIL, true);
          return false;
        });
      });
    }

    if (copySummaryBtn) {
      copySummaryBtn.hidden = false;
      copySummaryBtn.addEventListener("click", function () {
        var text = summaryText || (summary && summary.value) || "";
        return copyWithFallback(text, summary || input).then(function (ok) {
          if (ok) {
            setStatus(root, COPY_SUMMARY_OK, false);
            emitCopy(ctaId + "-summary");
            return false;
          }
          setStatus(root, COPY_FAIL, true);
          return false;
        });
      });
    }

    if (nativeBtn && typeof navigator.share === "function") {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        var payload = {
          title: title,
          url: attributed || canonical,
        };
        if (summaryText) payload.text = summaryText;
        navigator.share(payload).then(function () {
          setStatus(root, SHARE_OK, false);
          emitCopy(ctaId);
        }).catch(function () {
          setStatus(root, SHARE_FAIL, true);
        });
      });
    }
  }

  function enhance() {
    document.querySelectorAll("[data-share-root]").forEach(bindRoot);
  }

  window.confengePartnerShare = {
    classifyShareAction: classifyShareAction,
    enhance: enhance,
    bindRoot: bindRoot,
    copyWithFallback: copyWithFallback,
    setStatus: setStatus,
    COPY_LINK_OK: COPY_LINK_OK,
    COPY_SUMMARY_OK: COPY_SUMMARY_OK,
    COPY_FAIL: COPY_FAIL,
    SHARE_OK: SHARE_OK,
    SHARE_FAIL: SHARE_FAIL,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance);
  } else {
    enhance();
  }
})();
