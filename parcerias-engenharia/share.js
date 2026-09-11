/**
 * Page-local share/copy for partner reference kits.
 * Clipboard and optional native share only. Never posts a lead or sends mail.
 */
(function () {
  "use strict";

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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return selectFallback(input);
      });
    }
    return Promise.resolve(selectFallback(input));
  }

  function selectFallback(input) {
    if (!input) return false;
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      if (typeof document.execCommand === "function") {
        return document.execCommand("copy");
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
    var copyBtn = root.querySelector("[data-share-copy]");
    var nativeBtn = root.querySelector("[data-share-native]");
    var attributed = root.getAttribute("data-share-attributed") || "";
    var canonical = (input && input.value) || root.getAttribute("data-share-canonical") || "";
    var ctaId = root.getAttribute("data-cta-id") || "share-copy-kit";
    var title = root.getAttribute("data-share-title") || "CONFENGE";

    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.addEventListener("click", function () {
        var text = attributed || canonical;
        copyWithFallback(text, input).then(function (ok) {
          if (ok) {
            setStatus(root, "Link copiado. Isso não envia mensagem nem registra um pedido.", false);
            emitCopy(ctaId);
            return;
          }
          setStatus(root, "Não foi possível copiar. Use o endereço visível ou abra a entrega.", true);
        });
      });
    }

    if (nativeBtn && typeof navigator.share === "function") {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        navigator.share({
          title: title,
          url: attributed || canonical,
        }).then(function () {
          setStatus(root, "Link compartilhado. Isso não envia um pedido em seu nome.", false);
          emitCopy(ctaId);
        }).catch(function () {
          setStatus(root, "O compartilhamento nativo não concluiu. O endereço continua visível.", true);
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance);
  } else {
    enhance();
  }
})();
