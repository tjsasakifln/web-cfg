"""Structured tri-state checklist HTML + JS for editorial pages.

Visitor-facing progressive workflow (4 steps). Preserves all checklist items
and legal compute logic; does not invent readiness scores beyond computeAditivoReadiness.

Step assignment is an explicit item_id map (not old category passthrough).
"""
from __future__ import annotations

from typing import Any

from scripts.pseo.html_shell import e

# Four visitor-facing stages. Titles must cover every item assigned via ITEM_STEP.
STEP_DEFS: list[dict[str, Any]] = [
    {
        "id": "identificacao",
        "num": 1,
        "title": "Identificação e fundamento",
        "summary": "Contrato, processo, órgão, regime, valor, descrição, motivo, local, determinação e enquadramento.",
    },
    {
        "id": "planilha",
        "num": 2,
        "title": "Planilha, preço e impacto",
        "summary": "Memória de saldo, planilha, itens novos, composições, desconto, data-base, índices e impacto no cronograma.",
    },
    {
        "id": "provas",
        "num": 3,
        "title": "Provas e comunicações",
        "summary": "Projetos, diário, fotos, OS, atas, pareceres, anexos, protocolo e responsáveis.",
    },
    {
        "id": "bloqueios",
        "num": 4,
        "title": "Exceções, bloqueios e revisão",
        "summary": "Reforma, art. 127, antecipação do art. 132, sinais de bloqueio e conferência final.",
    },
]

# Explicit item_id → step number (1..4). Exactly the 36 aditivo IDs; no category passthrough.
ITEM_STEP: dict[str, int] = {
    # Etapa 1 — Identificação e fundamento
    "ad-01": 1,  # Número do contrato e processo
    "ad-02": 1,  # Órgão e regime de execução
    "ad-03": 1,  # Valor inicial e atualizado
    "ad-04": 1,  # Descrição da alteração
    "ad-05": 1,  # Motivo documentado
    "ad-06": 1,  # Local na obra
    "ad-07": 1,  # Data e autor da determinação
    "ad-08": 1,  # Enquadramento art. 124
    "ad-13": 1,  # Requerimento objetivo
    "ad-15": 1,  # Gestor e fiscal
    "ad-16": 1,  # Cláusulas de alteração
    "ad-17": 1,  # Checagem art. 126
    # Etapa 2 — Planilha, preço e impacto
    "ad-09": 2,  # Teste art. 125 com memória de saldo
    "ad-10": 2,  # Planilha do aditivo
    "ad-11": 2,  # Composições de itens novos
    "ad-12": 2,  # Impacto no cronograma
    "ad-14": 2,  # Data-base e índices
    "ad-18": 2,  # Desconto da proposta se aplicável
    # Etapa 3 — Provas e comunicações
    "ad-19": 3,  # Projetos antes/depois
    "ad-20": 3,  # Diário de obra
    "ad-21": 3,  # Fotos
    "ad-22": 3,  # OS e atas
    "ad-23": 3,  # Pareceres internos
    "ad-24": 3,  # Anexos indexados
    "ad-25": 3,  # Protocolo com data
    # Etapa 4 — Exceções, bloqueios e revisão
    "ad-26": 4,  # Reforma: limite 50%
    "ad-27": 4,  # Art. 127 preço
    "ad-28": 4,  # Antecipação art. 132
    "ad-29": 4,  # Bloqueio: item novo sem composição
    "ad-30": 4,  # Bloqueio: execução antes da formalização
    "ad-31": 4,  # Bloqueio: falta determinação
    "ad-32": 4,  # Bloqueio: memória de saldo ausente
    "ad-33": 4,  # Bloqueio: justificativa genérica
    "ad-34": 4,  # Final: índice confere
    "ad-35": 4,  # Final: nexo relido
    "ad-36": 4,  # Final: pendências tratadas
}

assert len(ITEM_STEP) == 36, f"ITEM_STEP must cover 36 ids, got {len(ITEM_STEP)}"
assert len(set(ITEM_STEP.values())) == 4
assert set(ITEM_STEP.keys()) == {f"ad-{i:02d}" for i in range(1, 37)}


def _req_html(it: dict[str, Any], cid: str) -> str:
    iid = str(it.get("id") or "")
    label = str(it.get("label") or "")
    hint = str(it.get("hint") or it.get("description") or "").strip()
    is_blocker = cid == "blocker"
    parts = [
        f'<div class="tool-req" data-req-id="{e(iid)}" data-category="{e(cid)}">',
        f'<div class="tool-req-label" id="lbl-{e(iid)}">{e(label)}</div>',
    ]
    if hint:
        parts.append(f'<p class="tool-req-hint" id="hint-{e(iid)}">{e(hint)}</p>')
    aria = f'aria-labelledby="lbl-{e(iid)}"'
    if hint:
        aria = f'aria-labelledby="lbl-{e(iid)}" aria-describedby="hint-{e(iid)}"'
    parts.append(f'<div class="tool-req-states" role="radiogroup" {aria}>')
    opts = (
        [("no", "Não"), ("yes", "Sim (alerta)"), ("na", "N/A")]
        if is_blocker
        else [("met", "Atendido"), ("pending", "Pendente"), ("na", "Não aplicável")]
    )
    for val, lab in opts:
        parts.append(
            f'<label class="tool-req-option">'
            f'<input type="radio" name="req-{e(iid)}" value="{e(val)}" data-req-state/>'
            f"<span>{e(lab)}</span></label>"
        )
    parts.append("</div></div>")
    return "".join(parts)


def render_structured_checklist(page: dict[str, Any]) -> str:
    items = page.get("checklist_items") or []
    if not items:
        return ""

    # Preserve original categories for compute (blocker vs essential etc.);
    # UI step comes only from ITEM_STEP by item_id.
    by_step: dict[int, list[dict]] = {1: [], 2: [], 3: [], 4: []}
    seen_ids: set[str] = set()
    for it in items:
        iid = str(it.get("id") or "")
        if not iid:
            continue
        if iid in seen_ids:
            raise ValueError(f"Duplicate checklist item_id: {iid}")
        seen_ids.add(iid)
        step_num = ITEM_STEP.get(iid)
        if step_num is None:
            raise ValueError(f"checklist item_id not in ITEM_STEP map: {iid}")
        by_step[step_num].append(it)

    missing = set(ITEM_STEP) - seen_ids
    if missing:
        raise ValueError(f"checklist missing item_ids from ITEM_STEP: {sorted(missing)}")
    if len(seen_ids) != 36:
        raise ValueError(f"expected 36 unique checklist items, got {len(seen_ids)}")

    total = len(items)
    parts: list[str] = [
        '<link rel="stylesheet" href="/styles-tools.css"/>',
        '<div class="tool-shell editorial-checklist tool-workflow" '
        'data-aditivo-checklist data-tool-workflow id="checklist-interativo">',
        # Intro (visible before start; with JS becomes gate)
        '<div class="tool-intro" data-tool-intro>',
        '<p class="tool-kicker">Diagnóstico documental</p>',
        "<h3 class=\"tool-intro-title\">O que este checklist avalia</h3>",
        "<ul class=\"tool-intro-list\">",
        f"<li><strong>{total} requisitos</strong> de pedido de aditivo em obra pública "
        "(identificação, planilha, provas e bloqueios).</li>",
        "<li><strong>Tempo típico:</strong> 8 a 15 minutos se os documentos estiverem à mão.</li>",
        "<li><strong>Privacidade:</strong> respostas ficam só neste navegador; "
        "nada é enviado à CONFENGE até você copiar, baixar ou abrir o contato.</li>",
        "<li><strong>Ao final:</strong> classificação em linguagem simples, pendências, "
        "bloqueios e próximos passos orientativos.</li>",
        "</ul>",
        '<button type="button" class="button button-primary button-lg" data-tool-start>'
        "Iniciar diagnóstico</button>",
        "</div>",
        # noscript: plain language only (no technical pipeline jargon)
        "<noscript><p class=\"tool-noscript-note\">Para usar o diagnóstico interativo, "
        "habilite o JavaScript do navegador. Os requisitos do checklist permanecem "
        "listados abaixo para consulta.</p></noscript>",
        # Progress (form completion vs readiness are separate)
        '<div class="tool-progress-panel" data-tool-progress hidden>',
        '<p class="tool-step-status" data-step-status role="status" aria-live="polite">'
        "Etapa 1 de 4</p>",
        '<p class="tool-answer-status" data-answer-status>0 de '
        f"{total} itens respondidos</p>",
        '<p class="tool-ready-status" data-ready-status>'
        "Prontidão documental: ainda não avaliada (use Ver diagnóstico).</p>",
        '<div class="tool-progress-track" role="progressbar" '
        'aria-label="Itens respondidos do formulário" aria-valuemin="0" '
        f'aria-valuemax="{total}" aria-valuenow="0" data-progress-bar>'
        '<span class="tool-progress-fill" data-progress-fill style="width:0%"></span>'
        "</div>",
        '<p class="tool-progress-label" data-progress-label>'
        "Progresso do preenchimento (não é prontidão jurídica).</p>",
        "</div>",
    ]

    # Steps from explicit item_id map
    parts.append('<div class="tool-steps" data-tool-steps>')
    for step in STEP_DEFS:
        step_items = by_step.get(step["num"]) or []
        if not step_items:
            continue
        parts.append(
            f'<section class="tool-step tool-category" data-tool-step="{step["num"]}" '
            f'data-step-id="{e(step["id"])}" aria-labelledby="step-title-{step["num"]}">'
            f'<header class="tool-step-head">'
            f'<p class="tool-kicker">Etapa {step["num"]} de 4</p>'
            f'<h3 id="step-title-{step["num"]}">{e(step["title"])}</h3>'
            f'<p class="tool-step-summary">{e(step["summary"])}</p>'
            f"</header>"
        )
        for it in step_items:
            cid = str(it.get("category") or "essential")
            parts.append(_req_html(it, cid))
        parts.append(
            '<div class="tool-step-nav">'
            f'<button type="button" class="button button-secondary" data-step-prev '
            f'{"hidden" if step["num"] == 1 else ""}>Anterior</button>'
        )
        if step["num"] < 4:
            parts.append(
                '<button type="button" class="button button-primary" data-step-next>'
                "Continuar</button>"
            )
        else:
            parts.append(
                '<button type="button" class="button button-primary" data-checklist-diagnose>'
                "Ver diagnóstico</button>"
            )
        parts.append("</div></section>")
    parts.append("</div>")  # tool-steps

    # Mobile sticky bar during fill
    parts.append(
        '<div class="tool-sticky-bar" data-tool-sticky hidden>'
        '<p class="tool-sticky-meta" data-sticky-meta>Etapa 1 · 0 respondidos</p>'
        '<button type="button" class="button button-primary" data-sticky-next>Continuar</button>'
        "</div>"
    )

    # Secondary actions (never compete with primary diagnose)
    parts.append(
        '<div class="tool-actions tool-actions-secondary" data-tool-secondary-actions>'
        '<button type="button" class="button button-secondary" data-checklist-copy data-tool-copy>'
        "Copiar resumo</button>"
        '<button type="button" class="button button-secondary" data-checklist-download data-tool-download>'
        "Baixar (.txt)</button>"
        '<button type="button" class="tool-text-action" data-checklist-reset data-tool-reset>'
        "Apagar respostas</button>"
        "</div>"
        '<div class="tool-result-panel" id="checklist-resultado" data-checklist-result '
        'hidden tabindex="-1" aria-live="polite"></div>'
        '<div class="tool-cta-contextual" data-checklist-cta hidden></div>'
        "</div>"  # tool-shell
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
    var SCHEMA = 3;
    var steps = Array.prototype.slice.call(root.querySelectorAll("[data-tool-step]"));
    var current = 1;
    var started = false;
    var totalItems = root.querySelectorAll(".tool-req").length;

    if (T.bindToolLifecycle) {
      T.bindToolLifecycle({ tool: TOOL, startSelectors: "[data-aditivo-checklist] input" });
    }

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
        items.push({
          id: id,
          category: cat,
          state: state,
          label: lab ? lab.textContent.trim() : id,
          answered: !!checked,
        });
      });
      return items;
    }

    function answeredCount(items) {
      return items.filter(function (it) { return it.answered; }).length;
    }

    function updateProgress() {
      var items = collect();
      var answered = answeredCount(items);
      var fill = root.querySelector("[data-progress-fill]");
      var bar = root.querySelector("[data-progress-bar]");
      var pct = totalItems ? Math.round((answered / totalItems) * 100) : 0;
      if (fill) fill.style.width = pct + "%";
      if (bar) {
        bar.setAttribute("aria-valuenow", String(answered));
        bar.setAttribute("aria-valuemax", String(totalItems));
      }
      var stepStatus = root.querySelector("[data-step-status]");
      if (stepStatus) stepStatus.textContent = "Etapa " + current + " de 4";
      var ans = root.querySelector("[data-answer-status]");
      if (ans) {
        ans.textContent = answered + " de " + totalItems + " itens respondidos";
      }
      var sticky = root.querySelector("[data-sticky-meta]");
      if (sticky) {
        sticky.textContent = "Etapa " + current + " · " + answered + " de " + totalItems + " respondidos";
      }
      // Lightweight essential count without full diagnose label
      var essMet = items.filter(function (it) {
        return it.category === "essential" && it.state === "met";
      }).length;
      var essTot = items.filter(function (it) {
        return it.category === "essential" && it.state !== "na";
      }).length;
      var ready = root.querySelector("[data-ready-status]");
      if (ready && !window.__aditivoDiagnosed) {
        ready.textContent =
          essMet +
          " requisito" +
          (essMet === 1 ? "" : "s") +
          " essencial" +
          (essMet === 1 ? "" : "is") +
          " atendido" +
          (essMet === 1 ? "" : "s") +
          " (de " +
          essTot +
          " aplicáveis). Diagnóstico completo: botão Ver diagnóstico.";
      }
      if (T.saveState) {
        var map = {};
        root.querySelectorAll(".tool-req").forEach(function (el) {
          var id = el.getAttribute("data-req-id");
          var c = el.querySelector("input:checked");
          if (c) map[id] = c.value;
        });
        map.__step = current;
        map.__started = started ? 1 : 0;
        T.saveState(TOOL, SCHEMA, map);
      }
    }

    function showStep(n) {
      current = Math.max(1, Math.min(4, n));
      steps.forEach(function (sec) {
        var num = parseInt(sec.getAttribute("data-tool-step"), 10);
        var active = num === current;
        sec.classList.toggle("is-active", active);
        sec.hidden = started ? !active : false;
      });
      updateProgress();
      if (started) {
        var activeSec = root.querySelector('[data-tool-step="' + current + '"]');
        if (activeSec) {
          var focusable = activeSec.querySelector("h3, .tool-req-label");
          if (focusable && focusable.focus) {
            try { focusable.setAttribute("tabindex", "-1"); focusable.focus({ preventScroll: false }); } catch (e) {}
          }
        }
      }
    }

    function startWorkflow() {
      started = true;
      var intro = root.querySelector("[data-tool-intro]");
      if (intro) intro.hidden = true;
      var prog = root.querySelector("[data-tool-progress]");
      if (prog) prog.hidden = false;
      var sticky = root.querySelector("[data-tool-sticky]");
      if (sticky) sticky.hidden = false;
      root.classList.add("is-started");
      showStep(current || 1);
    }

    function diagnose() {
      var items = collect();
      var mapped = items.map(function (it) {
        if (it.category === "blocker") {
          return {
            id: it.id,
            category: "blocker",
            state: it.state === "met" ? "met" : "pending",
            label: it.label,
          };
        }
        return it;
      });
      var r = C.computeAditivoReadiness ? C.computeAditivoReadiness(mapped) : null;
      if (!r) return;
      window.__aditivoDiagnosed = true;
      window.__aditivoLast = r;

      var ready = root.querySelector("[data-ready-status]");
      if (ready) {
        ready.textContent =
          r.readinessLabel +
          ". Essenciais atendidos: " +
          r.essentialMet +
          (r.essentialPending ? "; pendências: " + r.essentialPending : "") +
          (r.blockersHit && r.blockersHit.length ? "; bloqueios: " + r.blockersHit.length : "") +
          ".";
      }

      var pendingLabels = items
        .filter(function (it) {
          return it.category === "essential" && it.state === "pending";
        })
        .slice(0, 5)
        .map(function (it) { return it.label; });
      var blockerLabels = r.blockerLabels || [];
      var nextSteps = [];
      if (r.blockersHit && r.blockersHit.length) {
        nextSteps.push("Tratar os sinais de bloqueio antes de protocolar.");
      }
      if (r.essentialPending > 0) {
        nextSteps.push("Completar os requisitos essenciais ainda pendentes.");
      }
      if (r.supportPending > 0) {
        nextSteps.push("Anexar planilha, composições e prova de nexo faltantes.");
      }
      if (!nextSteps.length) {
        nextSteps.push("Montar o índice de anexos e o texto do requerimento.");
        nextSteps.push("Conferir ritos e formulários específicos do órgão.");
        nextSteps.push("Se o valor for material para a margem, pedir revisão técnica.");
      }
      while (nextSteps.length < 3) {
        nextSteps.push("Revisar o contrato e a Lei nº 14.133/2021 no caso concreto.");
      }
      nextSteps = nextSteps.slice(0, 3);

      var out = root.querySelector("[data-checklist-result]");
      if (out) {
        out.hidden = false;
        out.className = "tool-result-panel " + (r.level || "warn");
        var pendHtml = pendingLabels.length
          ? "<ol class=\"tool-result-list\">" +
            pendingLabels.map(function (l) { return "<li>" + l + "</li>"; }).join("") +
            "</ol>"
          : "<p>Nenhuma pendência essencial marcada como pendente.</p>";
        var blockHtml = blockerLabels.length
          ? "<ul class=\"tool-alert-list\">" +
            blockerLabels
              .map(function (l) {
                return '<li data-severity="bad">' + l + "</li>";
              })
              .join("") +
            "</ul>"
          : "<p>Nenhum sinal de bloqueio assinalado.</p>";
        var stepsHtml =
          "<ol class=\"tool-result-list\">" +
          nextSteps.map(function (s) { return "<li>" + s + "</li>"; }).join("") +
          "</ol>";
        out.innerHTML =
          '<p class="tool-result-summary"><strong>' +
          r.readinessLabel +
          "</strong>" +
          r.synthesis +
          "</p>" +
          "<h4>Principais pendências</h4>" +
          pendHtml +
          "<h4>Bloqueios</h4>" +
          blockHtml +
          "<h4>Próximos três passos</h4>" +
          stepsHtml +
          '<p class="tool-disclaimer">Diagnóstico documental orientativo. Não cria direito, não substitui a leitura do contrato nem do edital, e não é parecer jurídico.</p>';
        if (T.focusResult) T.focusResult(out);
        try {
          out.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (e2) {}
      }

      var cta = root.querySelector("[data-checklist-cta]");
      if (cta) {
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
        var primaryLabel =
          r.essentialPending > 0 || (r.blockersHit && r.blockersHit.length)
            ? "Solicitar revisão técnica do dossiê"
            : "Validar o dossiê com a CONFENGE";
        cta.innerHTML =
          "<p>Se o valor em jogo afeta a margem ou há notificação em curso, uma leitura técnica do dossiê reduz o risco de protocolar incompleto.</p>" +
          '<div class="tool-actions"><a class="button button-primary" data-tool-to-form href="/#contato" data-journey="contrato">' +
          primaryLabel +
          '</a></div>' +
          '<p class="tool-secondary-link"><a data-tool-to-whatsapp target="_blank" rel="noopener" href="' +
          wa +
          '">Ou falar pelo WhatsApp</a></p>';
      }

      if (T.track) {
        T.track("tool_complete", {
          tool: TOOL,
          readiness: r.readiness,
          essential_pending: r.essentialPending,
          blockers: (r.blockersHit || []).length,
        });
      }
      updateProgress();
    }

    // Progressive enhancement: with JS hide non-active steps until start
    root.classList.add("js-tool-ready");
    steps.forEach(function (sec) {
      sec.hidden = false; // no-js fallback: all visible until start
    });

    var startBtn = root.querySelector("[data-tool-start]");
    if (startBtn) startBtn.addEventListener("click", startWorkflow);

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var prev = t.closest("[data-step-prev]");
      var next = t.closest("[data-step-next]");
      var stickyNext = t.closest("[data-sticky-next]");
      var diag = t.closest("[data-checklist-diagnose]");
      if (prev) {
        showStep(current - 1);
      } else if (next || stickyNext) {
        if (current >= 4) diagnose();
        else showStep(current + 1);
      } else if (diag) {
        diagnose();
      }
    });

    root.addEventListener("change", function (ev) {
      if (ev.target && ev.target.hasAttribute("data-req-state")) {
        updateProgress();
      }
    });

    var cp = root.querySelector("[data-checklist-copy]");
    if (cp) {
      cp.addEventListener("click", function () {
        if (!window.__aditivoLast) diagnose();
        if (T.copyText && T.buildReport) {
          var body =
            ((window.__aditivoLast || {}).readinessLabel || "") +
            ": " +
            ((window.__aditivoLast || {}).synthesis || "");
          T.copyText(T.buildReport([{ title: "Checklist aditivo", body: body }]));
        }
      });
    }
    var dl = root.querySelector("[data-checklist-download]");
    if (dl) {
      dl.addEventListener("click", function () {
        if (!window.__aditivoLast) diagnose();
        if (T.downloadText && T.buildReport) {
          var body =
            ((window.__aditivoLast || {}).readinessLabel || "") +
            ": " +
            ((window.__aditivoLast || {}).synthesis || "");
          T.downloadText(
            "checklist-aditivo.txt",
            T.buildReport([{ title: "Checklist aditivo", body: body }])
          );
        }
      });
    }
    var rs = root.querySelector("[data-checklist-reset]");
    if (rs) {
      rs.addEventListener("click", function () {
        if (!confirm("Apagar todas as respostas deste checklist?")) return;
        root.querySelectorAll("input[data-req-state]").forEach(function (i) {
          i.checked = false;
        });
        window.__aditivoLast = null;
        window.__aditivoDiagnosed = false;
        if (T.clearState) T.clearState(TOOL);
        var out = root.querySelector("[data-checklist-result]");
        if (out) {
          out.hidden = true;
          out.innerHTML = "";
        }
        var cta = root.querySelector("[data-checklist-cta]");
        if (cta) {
          cta.hidden = true;
          cta.innerHTML = "";
        }
        current = 1;
        updateProgress();
        if (started) showStep(1);
      });
    }

    if (T.loadState) {
      var map = T.loadState(TOOL, SCHEMA);
      if (map) {
        Object.keys(map).forEach(function (id) {
          if (id === "__step" || id === "__started") return;
          var input = root.querySelector(
            '.tool-req[data-req-id="' + id + '"] input[value="' + map[id] + '"]'
          );
          if (input) input.checked = true;
        });
        if (map.__step) current = parseInt(map.__step, 10) || 1;
        if (map.__started || root.querySelector("input:checked")) {
          startWorkflow();
        } else {
          updateProgress();
        }
      }
    } else {
      updateProgress();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>
"""
