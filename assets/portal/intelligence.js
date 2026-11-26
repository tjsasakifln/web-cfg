(() => {
  "use strict";
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === "text") node.textContent = value;
      else if (key === "click") node.addEventListener("click", value);
      else if (key === "change") node.addEventListener("change", value);
      else node.setAttribute(key, value);
    }
    node.append(...[children].flat().filter(Boolean));
    return node;
  };
  const p = (txt, className) => el("p", { text: txt, class: className });
  const action = (txt, click, className = "extra-action") => el("button", { type: "button", text: txt, click, class: className });
  const anchor = (txt, href) => el("a", { text: txt, href, target: "_blank", rel: "noopener noreferrer" });
  const dates = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const stamp = (iso) => iso ? dates.format(new Date(iso)) : "Não confirmada";
  const day = (iso) => iso ? iso.split("-").reverse().join("/") : "Não informada";
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const label = (title, detail) => [el("strong", { text: title }), detail ? el("small", { text: detail }) : null];
  const cities = (row) => [...new Set(row.sites.map(({ city }) => city + "/SC"))].join(", ");
  const valueLabel = (row) => row.amount ? label(brl.format(row.amount.cents / 100), row.amount.label)
    : label("Não informado", "Sem documento que confirme o tipo de valor.");
  const tabs = {
    decidir: ["Decidir agora", "Onde investir tempo nesta semana?", "Editais com prazo e local da obra confirmados, do prazo mais próximo ao mais distante."],
    antecipar: ["Antecipar demanda", "O que acompanhar antes da publicação?", "Vigências com confirmação recente, em até 180 dias. Não indicam nova licitação."],
    preparar: ["Preparar proposta", "O que serve de referência para a proposta?", "Histórico documentado por tipo de obra. Confira as diferenças de escopo antes de comparar."],
  };
  const reasonNames = {
    registro_invalido: "Registro incompleto",
    escopo_sem_prova: "Escopo de obra sem comprovação",
    local_sem_prova: "Local da execução não comprovado",
    limite_sem_prova: "Obra próxima ao limite, sem coordenada segura",
    edital_nao_confirmado: "Prazo ou situação do edital não confirmados",
    identidade_em_conflito: "Identidade duplicada ou conflitante",
  };
  function table(headers, records) {
    return el("table", { class: "extra-data", role: "table" }, [
      el("thead", { role: "rowgroup" }, el("tr", { role: "row" }, headers.map((title) => el("th", { role: "columnheader", scope: "col", text: title })))),
      el("tbody", { role: "rowgroup" }, records.map((cells) => el("tr", { role: "row" },
        cells.map((cell, i) => el("td", { role: "cell", "data-label": headers[i] }, cell))))),
    ]);
  }
  function evidence(row, originText = "Documento de origem") {
    const entries = [
      [originText, { url: row.official, locator: "Registro oficial" }],
      ["Escopo", row.scopeEvidence], ["Situação e prazo", row.statusEvidence],
      ["Fim de vigência", row.endEvidence], ["Valor", row.amount?.evidence],
      ...row.sites.map((s) => ["Local da execução · " + s.city, s.evidence]),
    ];
    return el("ul", { class: "extra-evidence" }, entries.filter(([, value]) => value).map(([name, { url, locator }]) =>
      el("li", {}, [anchor(name, url), p(locator, "extra-note")])));
  }
  function lead(title, desc, control) {
    return el("div", { class: "extra-section-head" }, [
      el("div", {}, [el("h2", { text: title }), p(desc, "extra-note")]), control,
    ]);
  }
  function coverage(data) {
    const { notices: n, contracts: c, pending } = data.coverage;
    return el("details", { class: "extra-coverage" }, [
      el("summary", { text: "Cobertura e registros em verificação" }),
      p("A cobertura é da consulta à base, não de todo o mercado. Sem documento do local de execução, o registro não entra nas listas."),
      p(`Editais na consulta: ${n.scanned} · sem revisão: ${n.unreviewed} · janela de prazos: ${day(n.windowStart)} a ${day(n.windowEnd)}.`),
      p(`Contratos na consulta: ${c.scanned} · sem revisão: ${c.unreviewed} · janela de publicação: ${day(c.windowStart)} a ${day(c.windowEnd)}.`),
      n.truncated || c.truncated ? p("A consulta atingiu o limite de processamento. Os números são um mínimo observado.") : null,
      ...Object.entries(pending).map(([key, count]) => p(`${reasonNames[key] || "Verificação pendente"}: ${count}.`)),
    ]);
  }
  function watchProof(row) {
    return el("section", {}, [
      lead(row.buyer, "Histórico no mesmo tipo de obra e local. Confira o escopo de cada registro."),
      ...(row.history.length ? [el("div", { class: "extra-chart" }, [
        el("h3", { text: "Publicações históricas e vigência registrada" }),
        p("Eventos na ordem das datas. Espaçamento não representa duração.", "extra-note"),
        el("ol", { class: "extra-axis" }, [
          ...row.history.map((h) => el("li", {}, [el("strong", { text: day(h.publishedOn) }), anchor("Contrato", h.official)])),
          el("li", {}, [el("strong", { text: day(row.endsOn) }), el("small", { text: "Fim observado" })]),
        ]),
      ])] : [p("Sem outros contratos confirmados neste recorte. Não é possível inferir recorrência.", "extra-note")]),
      evidence(row),
    ]);
  }
  function detail(tab, row) {
    if (tab === "antecipar") return watchProof(row);
    const notes = tab === "decidir" ? [
      ["Local da obra", cities(row)], ["Prazo de proposta", stamp(row.closesAt) + " · Brasília"],
      ["Habilitação e capacidade", "A verificar com a equipe da Extra. A ficha não determina habilitação."],
      ["Primeira verificação", row.firstCheck],
    ] : [
      ["Local da obra", cities(row)], ["Comprador", row.buyer], ["Contratado", row.contractor || "Não confirmado"],
      ["Diferenças que importam", row.comparison || "Comparar parcelas, quantidades, unidades e data-base nos documentos."],
    ];
    return el("section", {}, [
      lead(row.title, tab === "decidir" ? "Ficha de decisão" : "Evidências do contrato"),
      el("ul", { class: "extra-evidence" }, notes.map(([key, value]) =>
        el("li", {}, [el("strong", { text: key }), p(value, "extra-note")]))),
      evidence(row),
    ]);
  }
  const state = { family: "", tab: "decidir" };
  async function render(host, { api, operationError }) {
    host.classList.add("extra-intel");
    const source = el("div", { class: "extra-source" }, el("strong", { text: "Fonte dos dados · CONFENGE" }));
    const outlet = el("div", { class: "extra-panel" });
    const controls = el("div", { class: "extra-scope" }, [
      el("strong", { text: "Santa Catarina · até 200 km de São José" }),
      p("Pelo local da execução, não pela sede do órgão."),
    ]);
    const nav = el("nav", { class: "extra-view-nav", "aria-label": "Decisões de licitação" });
    const feedback = el("p", { class: "extra-note", role: "status" });
    const head = el("header", { class: "extra-head" }, [
      el("div", {}, [
        p("Obras públicas · Inteligência CONFENGE", "eyebrow"),
        el("h1", { text: "Radar de licitações da Extra", tabindex: "-1" }),
        p("Priorize o que merece análise de proposta e separe os sinais de demanda que ainda não são editais."),
      ]),
      source,
    ]);
    host.append(head, controls, nav, feedback, outlet);
    let data;
    let sequence = 0;
    let page = 0;
    const pageSize = 15;
    let focusedRow = null;
    const isCurrent = (id) => head.isConnected && id === sequence;
    const spec = () => new URLSearchParams(state.family ? { family: state.family } : {});
    function selectTab(tab) {
      state.tab = tab;
      page = 0;
      update();
    }
    for (const [id, [name]] of Object.entries(tabs)) {
      const button = action(name, () => selectTab(id), "extra-tab");
      button.dataset.tab = id;
      nav.append(button);
    }
    const filters = el("select", { change: () => { state.family = filters.value; page = 0; load(); } });
    controls.append(el("label", {}, ["Tipo de obra", filters]));
    const refresh = action("Atualizar consulta", () => load(false));
    controls.append(refresh);
    const open = (kind, row) => {
      const back = action("Voltar à lista", () => update(true));
      const section = detail(kind, row);
      focusedRow = { kind, id: row.id };
      outlet.replaceChildren(back, section);
      const title = section.querySelector("h2");
      title.tabIndex = -1;
      title.focus();
    };
    async function download(tab, trigger) {
      const item = data;
      trigger.disabled = true;
      try {
        const params = spec();
        params.set("tab", tab);
        params.set("revision", item.revision);
        const response = await fetch("/api/portal/intelligence.csv?" + params, { credentials: "same-origin" });
        if (!head.isConnected || item !== data) return;
        if (response.status === 409) {
          await load();
          if (head.isConnected) feedback.textContent = "A consulta mudou. Confira os dados atualizados e solicite a planilha novamente.";
          return;
        }
        if (!response.ok) {
          const error = new Error();
          error.status = response.status;
          if (response.status === 401) return operationError(error);
          feedback.textContent = "A planilha não ficou disponível. Tente novamente em instantes.";
          return;
        }
        const blob = await response.blob();
        if (!head.isConnected || item !== data) return;
        const url = URL.createObjectURL(blob);
        const link = el("a", { href: url, download: "confenge-extra-" + tab + ".csv" });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15_000);
        feedback.textContent = "Planilha pronta.";
      } catch {
        if (head.isConnected) feedback.textContent = "Não foi possível baixar a planilha.";
      } finally { trigger.disabled = false; }
    }
    function update(focus = false) {
      focusedRow = null;
      const tab = state.tab;
      for (const button of nav.children) {
        if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      if (!data) return;
      const items = data[tab];
      const [, title, desc] = tabs[tab];
      const exportButton = items.length ? action("Baixar em CSV", () => download(tab, exportButton)) : null;
      const openItem = (row, txt) => action(txt, () => open(tab, row), "extra-link");
      const identification = (row) => label(row.title, cities(row) + " · " + row.buyer);
      const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);
      const headers = {
        decidir: ["Edital e local da obra", "Prazo de proposta", "Valor estimado", "O que verificar primeiro", "Ação"],
        antecipar: ["Contrato e local", "Fim de vigência", "Histórico observado", "Ação"],
        preparar: ["Obra de referência", "Natureza do valor", "Diferenças a conferir", "Ação"],
      };
      const rows = pageItems.map((row) => {
        if (tab === "decidir") return [identification(row), label(stamp(row.closesAt), "Verificado em " + stamp(row.statusVerifiedAt)),
          valueLabel(row), row.firstCheck, openItem(row, "Abrir ficha")];
        if (tab === "antecipar") return [identification(row), label(day(row.endsOn), row.daysUntilEnd + " dias"),
          row.history.length + " registro(s) no mesmo recorte", openItem(row, "Ver evidências")];
        return [identification(row), valueLabel(row), row.comparison || "Conferir equivalência de escopo e data-base.",
          openItem(row, "Ver contrato")];
      });
      const changePage = (step) => { page += step; update(true); };
      const pager = items.length > pageSize ? el("div", { class: "extra-pagination" }, [
        p(`Exibindo ${page * pageSize + 1}–${page * pageSize + pageItems.length} de ${items.length}`, "extra-note"),
        page > 0 ? action("Anterior", () => changePage(-1)) : null,
        page * pageSize + pageItems.length < items.length ? action("Próxima", () => changePage(1)) : null,
      ]) : null;
      const peek = tab === "decidir" && data.antecipar.length ? el("section", {}, [
        lead("O que acompanhar sem edital?", "Sinais separados das licitações abertas."),
        table(["Comprador", "Fato observado", "Próximo passo"], data.antecipar.slice(0, 3).map((row) => [
          label(row.buyer, cities(row)), label("Fim de vigência registrado em " + day(row.endsOn), row.title),
          action("Ver agenda", () => selectTab("antecipar"), "extra-link"),
        ])),
      ]) : null;
      outlet.replaceChildren(
        data.stale ? p("A consulta está atrasada. Editais abertos e vigências recentes aguardam nova verificação.", "extra-coverage") : "",
        lead(title, desc, exportButton),
        items.length ? table(headers[tab], rows) : p("Nenhum registro confirmado neste recorte. Consulte a cobertura abaixo.", "extra-note"),
        ...[pager, peek, coverage(data)].filter(Boolean),
      );
      if (focus) { const h = outlet.querySelector("h2"); h.tabIndex = -1; h.focus(); }
    }
    async function load(background = false) {
      const id = ++sequence;
      if (!background) {
        data = null;
        focusedRow = null;
        source.replaceChildren(el("strong", { text: "Fonte dos dados · CONFENGE" }));
        feedback.textContent = "Consultando a base…";
        outlet.replaceChildren();
      }
      refresh.disabled = true;
      try {
        const result = await api("/intelligence?" + spec());
        if (!isCurrent(id)) return;
        const previous = data;
        const selection = focusedRow;
        data = result;
        if (!previous) filters.replaceChildren(el("option", { value: "", text: "Todos os tipos" }),
          ...Object.entries(data.families).map(([value, text]) => el("option", { value, text })));
        filters.value = state.family;
        source.replaceChildren(el("strong", { text: "Fonte dos dados · CONFENGE" }),
          p("Corte da consulta · " + stamp(data.sourceCut) + " · Brasília"));
        feedback.textContent = "";
        if (previous?.revision === data.revision) return;
        page = Math.min(page, Math.max(0, Math.ceil(data[state.tab].length / pageSize) - 1));
        if (selection) {
          const row = data[selection.kind].find((item) => item.id === selection.id);
          const before = previous?.[selection.kind].find((item) => item.id === selection.id);
          if (row && JSON.stringify(row) === JSON.stringify(before)) return;
        }
        update();
      } catch (err) {
        if (!isCurrent(id)) return;
        if (err.status === 401) return operationError(err);
        data = null;
        focusedRow = null;
        source.replaceChildren(el("strong", { text: "Fonte dos dados · CONFENGE" }));
        outlet.replaceChildren();
        feedback.textContent = "A inteligência de mercado está indisponível no momento. Tente atualizar a consulta.";
      } finally { if (isCurrent(id)) refresh.disabled = false; }
    }
    update();
    await load();
    const timer = setInterval(() => {
      if (!head.isConnected) clearInterval(timer);
      else if (document.visibilityState === "visible" && !refresh.disabled) load(true);
    }, 60_000);
  }
  window.ConfengeExtraIntelligence = { render };
})();
