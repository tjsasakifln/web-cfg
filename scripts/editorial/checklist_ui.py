"""Structured tri-state checklist HTML + JS for editorial pages."""
from __future__ import annotations
from typing import Any
from scripts.pseo.html_shell import e


def render_structured_checklist(page: dict[str, Any]) -> str:
    items = page.get("checklist_items") or []
    if not items:
        return ""
    cats = page.get("checklist_categories") or [
        {"id": "essential", "label": "Requisitos essenciais", "description": ""},
        {"id": "support", "label": "Documentos de suporte", "description": ""},
        {"id": "conditional", "label": "Verificações condicionais", "description": ""},
        {"id": "blocker", "label": "Sinais de bloqueio", "description": ""},
        {"id": "final", "label": "Revisão final", "description": ""},
    ]
    by_cat: dict[str, list] = {}
    for it in items:
        by_cat.setdefault(str(it.get("category") or "essential"), []).append(it)
    parts = [
        '<link rel="stylesheet" href="/styles-tools.css"/>',
        '<div class="tool-shell editorial-checklist" data-aditivo-checklist id="checklist-interativo">',
        '<div class="tool-progress"><div class="tool-progress-track" role="progressbar" aria-label="Prontidão documental dos requisitos essenciais" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progress-bar>'
        '<span class="tool-progress-fill" data-progress-fill style="width:0%"></span></div>',
        '<p class="tool-progress-label" data-progress-label role="status" aria-live="polite">'
        "Marque os requisitos essenciais para ver a prontidão.</p></div>",
        '<p class="tool-privacy-note">Respostas só neste navegador; não são enviadas à CONFENGE.</p>',
    ]
    for cat in cats:
        cid = str(cat.get("id") or "")
        cat_items = by_cat.get(cid) or []
        if not cat_items:
            continue
        parts.append(f'<section class="tool-category" data-category="{e(cid)}"><h3>{e(cat.get("label") or cid)}</h3>')
        if cat.get("description"):
            parts.append(f'<p>{e(cat["description"])}</p>')
        is_blocker = cid == "blocker"
        for it in cat_items:
            iid = str(it.get("id") or "")
            label = str(it.get("label") or "")
            parts.append(
                f'<div class="tool-req" data-req-id="{e(iid)}" data-category="{e(cid)}">'
                f'<div class="tool-req-label" id="lbl-{e(iid)}">{e(label)}</div>'
                f'<div class="tool-req-states" role="radiogroup" aria-labelledby="lbl-{e(iid)}">'
            )
            opts = (
                [("no", "Não"), ("yes", "Sim (alerta)"), ("na", "N/A")]
                if is_blocker
                else [("met", "Atendido"), ("pending", "Pendente"), ("na", "Não aplicável")]
            )
            for val, lab in opts:
                parts.append(
                    f'<label><input type="radio" name="req-{e(iid)}" value="{e(val)}" data-req-state/> {e(lab)}</label>'
                )
            parts.append("</div></div>")
        parts.append("</section>")
    parts.append(
        '<div class="tool-actions">'
        '<button type="button" class="button button-primary" data-checklist-diagnose>Atualizar diagnóstico</button>'
        '<button type="button" class="button button-secondary" data-checklist-copy data-tool-copy>Copiar resumo</button>'
        '<button type="button" class="button button-secondary" data-checklist-download data-tool-download>Baixar (.txt)</button>'
        '<button type="button" class="button button-secondary" data-checklist-reset data-tool-reset>Apagar respostas</button>'
        "</div>"
        '<div class="tool-result-panel" id="checklist-resultado" data-checklist-result hidden tabindex="-1" aria-live="polite"></div>'
        '<div class="tool-cta-contextual" data-checklist-cta hidden></div></div>'
    )
    parts.append(_SCRIPT)
    return "\n".join(parts)


_SCRIPT = r"""
<script src="/assets/js/tool-compute.js" defer></script>
<script src="/assets/js/tools-common.js" defer></script>
<script>
(function () {
  function boot() {
    var root = document.querySelector("[data-aditivo-checklist]");
    if (!root) return;
    var T = window.ConfengeTools || {};
    var C = window.ConfengeToolCompute || {};
    var TOOL = "checklist-aditivo";
    var SCHEMA = 2;
    if (T.bindToolLifecycle) T.bindToolLifecycle({ tool: TOOL, startSelectors: "[data-aditivo-checklist] input" });
    function collect() {
      var items = [];
      root.querySelectorAll(".tool-req").forEach(function (el) {
        var id = el.getAttribute("data-req-id");
        var cat = el.getAttribute("data-category") || "essential";
        var checked = el.querySelector("input[data-req-state]:checked");
        var raw = checked ? checked.value : "pending";
        var state = "pending";
        if (cat === "blocker") state = raw === "yes" ? "met" : raw === "na" ? "na" : "pending";
        else state = raw === "met" ? "met" : raw === "na" ? "na" : "pending";
        var lab = el.querySelector(".tool-req-label");
        items.push({ id: id, category: cat, state: state, label: lab ? lab.textContent.trim() : id });
      });
      return items;
    }
    function diagnose() {
      var items = collect();
      var mapped = items.map(function (it) {
        if (it.category === "blocker") return { id: it.id, category: "blocker", state: it.state === "met" ? "met" : "pending", label: it.label };
        return it;
      });
      var r = C.computeAditivoReadiness ? C.computeAditivoReadiness(mapped) : null;
      if (!r) return;
      var fill = root.querySelector("[data-progress-fill]");
      if (fill) fill.style.width = r.progressPct + "%";
      var bar = root.querySelector("[data-progress-bar]");
      if (bar) bar.setAttribute("aria-valuenow", String(r.progressPct));
      var lab = root.querySelector("[data-progress-label]");
      if (lab) {
        lab.textContent =
          r.readinessLabel +
          ". Essenciais atendidos: " +
          r.essentialMet +
          (r.essentialPending ? "; pendências: " + r.essentialPending : "") +
          (r.blockersHit && r.blockersHit.length ? "; bloqueios: " + r.blockersHit.length : "") +
          ".";
      }
      var out = root.querySelector("[data-checklist-result]");
      if (out) {
        out.hidden = false;
        out.className = "tool-result-panel " + (r.level || "warn");
        out.innerHTML =
          '<p class="tool-result-summary"><strong>' +
          r.readinessLabel +
          "</strong>" +
          r.synthesis +
          '</p><ul class="tool-evidence-list"><li>Analisados: ' +
          r.analyzed +
          "</li><li>Essenciais: " +
          r.essentialMet +
          "</li><li>Pendências essenciais: " +
          r.essentialPending +
          "</li><li>Sinais de bloqueio: " +
          (r.blockersHit ? r.blockersHit.length : 0) +
          '</li></ul><p class="tool-disclaimer">Diagnóstico documental orientativo.</p>';
        if (T.focusResult) T.focusResult(out);
      }
      var cta = root.querySelector("[data-checklist-cta]");
      if (cta) {
        if (r.essentialPending > 0 || (r.blockersHit && r.blockersHit.length)) {
          cta.hidden = false;
          var wa = T.waLink
            ? T.waLink(
                "Olá, Tiago. Checklist aditivo CONFENGE. Prontidão: " +
                  r.readinessLabel +
                  ". Pendências: " +
                  r.essentialPending +
                  ". Bloqueios: " +
                  (r.blockersHit ? r.blockersHit.length : 0) +
                  "."
              )
            : "/#contato";
          cta.innerHTML =
            "<p>Há pendências ou sinais de bloqueio. Envie a planilha e comunicações para revisão técnica inicial.</p>" +
            '<div class="tool-actions"><a class="button button-primary" data-tool-to-form href="/#contato?jornada=contrato">Revisão técnica inicial</a>' +
            '<a class="button button-secondary" data-tool-to-whatsapp target="_blank" rel="noopener" href="' +
            wa +
            '">WhatsApp</a></div>';
        } else {
          cta.hidden = true;
          cta.innerHTML = "";
        }
      }
      if (T.track)
        T.track("tool_complete", {
          tool: TOOL,
          readiness: r.readiness,
          essential_pending: r.essentialPending,
          blockers: (r.blockersHit || []).length,
        });
      if (T.saveState) {
        var map = {};
        root.querySelectorAll(".tool-req").forEach(function (el) {
          var id = el.getAttribute("data-req-id");
          var c = el.querySelector("input:checked");
          if (c) map[id] = c.value;
        });
        T.saveState(TOOL, SCHEMA, map);
      }
      window.__aditivoLast = r;
    }
    root.addEventListener("change", function (ev) {
      if (ev.target && ev.target.hasAttribute("data-req-state")) diagnose();
    });
    var b = root.querySelector("[data-checklist-diagnose]");
    if (b) b.addEventListener("click", diagnose);
    var cp = root.querySelector("[data-checklist-copy]");
    if (cp)
      cp.addEventListener("click", function () {
        diagnose();
        if (T.copyText && T.buildReport)
          T.copyText(T.buildReport([{ title: "Checklist aditivo", body: (window.__aditivoLast || {}).synthesis || "" }]));
      });
    var dl = root.querySelector("[data-checklist-download]");
    if (dl)
      dl.addEventListener("click", function () {
        diagnose();
        if (T.downloadText && T.buildReport)
          T.downloadText(
            "checklist-aditivo.txt",
            T.buildReport([{ title: "Checklist aditivo", body: (window.__aditivoLast || {}).synthesis || "" }])
          );
      });
    var rs = root.querySelector("[data-checklist-reset]");
    if (rs)
      rs.addEventListener("click", function () {
        if (!confirm("Apagar respostas?")) return;
        root.querySelectorAll("input[data-req-state]").forEach(function (i) {
          i.checked = false;
        });
        if (T.clearState) T.clearState(TOOL);
        var out = root.querySelector("[data-checklist-result]");
        if (out) {
          out.hidden = true;
          out.innerHTML = "";
        }
      });
    if (T.loadState) {
      var map = T.loadState(TOOL, SCHEMA);
      if (map) {
        Object.keys(map).forEach(function (id) {
          var input = root.querySelector('.tool-req[data-req-id="' + id + '"] input[value="' + map[id] + '"]');
          if (input) input.checked = true;
        });
        if (root.querySelector("input:checked")) diagnose();
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>
"""
