(() => {
  "use strict";

  const cards = [...document.querySelectorAll("article.catalog-item[data-deliverable-id]")];
  const terminalSelect = document.querySelector('#captura-entregas select[name="deliverable_id"]');

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('a[data-deliverable-id][href="#captura-entregas"]');
    if (!trigger || !terminalSelect) return;
    const deliverableId = trigger.getAttribute("data-deliverable-id") || "";
    if ([...terminalSelect.options].some((option) => option.value === deliverableId && !option.disabled)) {
      terminalSelect.value = deliverableId;
    }
  });

  if (!cards.length) return;

  const MAX_COMPARE = 4;
  const MIN_COMPARE = 2;
  const MAX_RECOMMENDATIONS = 3;
  const FILTER_KEYS = ["task", "object", "urgency", "price", "billing", "state"];
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, document.querySelector(`[data-filter="${key}"]`)]));
  const queryInput = document.querySelector("[data-filter-query]");
  const filterPanel = document.querySelector("[data-catalog-filters]");
  const filterStatus = document.querySelector("[data-filter-status]");
  const emptyState = document.querySelector("[data-catalog-empty]");
  const taskView = document.querySelector("[data-task-view]");
  const alphaView = document.querySelector("[data-alpha-view]");
  const viewButtons = [...document.querySelectorAll("[data-view]")];
  const compareTray = document.querySelector("[data-compare-tray]");
  const compareCount = document.querySelector("[data-compare-count]");
  const compareOpen = document.querySelector("[data-compare-open]");
  const comparison = document.querySelector("[data-comparison]");
  const comparisonItems = document.querySelector("[data-comparison-items]");
  const recommendation = document.querySelector("[data-catalog-recommendation]");
  const frameTask = document.querySelector("[data-frame-task]");
  const frameObject = document.querySelector("[data-frame-object]");
  const frameInput = document.querySelector("[data-frame-input]");
  const frameDeadline = document.querySelector("[data-frame-deadline]");
  const selected = new Set();
  let activeView = "task";

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

  function cardById(id) {
    return cards.find((card) => card.dataset.deliverableId === id);
  }

  function setUrlState() {
    const url = new URL(window.location.href);
    const query = queryInput?.value.trim() || "";
    if (query) url.searchParams.set("q", query.slice(0, 80));
    else url.searchParams.delete("q");

    for (const key of FILTER_KEYS) {
      const value = filters[key]?.value || "";
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }

    if (activeView === "alpha") url.searchParams.set("view", "alpha");
    else url.searchParams.delete("view");
    if (selected.size) url.searchParams.set("compare", [...selected].join(","));
    else url.searchParams.delete("compare");

    const framing = {
      frame_task: frameTask?.value || "",
      frame_object: frameObject?.value || "",
      frame_input: frameInput?.value || "",
      deadline: frameDeadline?.value || "",
    };
    for (const [key, value] of Object.entries(framing)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function setView(nextView, updateUrl = true) {
    activeView = nextView === "alpha" ? "alpha" : "task";
    if (taskView) taskView.hidden = activeView !== "task";
    if (alphaView) {
      alphaView.hidden = activeView !== "alpha";
      if (activeView === "alpha") alphaView.open = true;
    }
    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.view === activeView));
    }
    if (updateUrl) setUrlState();
  }

  function applyFilters(updateUrl = true) {
    const query = normalize(queryInput?.value);
    let visible = 0;
    for (const card of cards) {
      const matchesQuery = !query || normalize(card.dataset.search).includes(query);
      const matchesDimensions = FILTER_KEYS.every((key) => {
        const value = filters[key]?.value || "";
        if (!value) return true;
        const attribute = key === "task"
          ? card.dataset.taskDoor
          : key === "price"
            ? card.dataset.priceBand
            : key === "state"
              ? card.dataset.publicState
              : card.dataset[key];
        return attribute === value;
      });
      card.hidden = !(matchesQuery && matchesDimensions);
      if (!card.hidden) visible += 1;
      const alphaItem = document.querySelector(`[data-alpha-item="${card.dataset.deliverableId}"]`);
      if (alphaItem) alphaItem.hidden = card.hidden;
    }

    for (const subgroup of document.querySelectorAll(".catalog-subgroup")) {
      subgroup.hidden = !subgroup.querySelector("article.catalog-item:not([hidden])");
    }
    for (const door of document.querySelectorAll(".catalog-door")) {
      door.hidden = !door.querySelector("article.catalog-item:not([hidden])");
    }
    if (filterStatus) filterStatus.textContent = `${visible} de ${cards.length} entregáveis encontrados.`;
    if (emptyState) emptyState.hidden = visible !== 0;
    if (updateUrl) setUrlState();
  }

  function clearFilters() {
    if (queryInput) queryInput.value = "";
    for (const key of FILTER_KEYS) if (filters[key]) filters[key].value = "";
    applyFilters();
  }

  const appendText = (parent, tagName, value, className) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  };

  function renderRecommendations(matches) {
    if (!recommendation) return;
    recommendation.replaceChildren();
    if (!matches.length) {
      appendText(recommendation, "p", "Nenhum caminho disponível combina com esse enquadramento. Ajuste objeto ou tarefa; ofertas indisponíveis não são elevadas pela recomendação.");
      recommendation.hidden = false;
      return;
    }

    appendText(recommendation, "h4", "Caminhos para revisão humana");
    const list = document.createElement("div");
    list.className = "catalog-recommendation__items";
    matches.forEach((card, index) => {
      const item = document.createElement("article");
      appendText(item, "p", index === 0 ? "Caminho principal" : "Alternativa");
      appendText(item, "h5", card.dataset.name);
      appendText(item, "p", `Motivo: ${card.dataset.trigger}`);
      appendText(item, "p", `${card.dataset.price} · ${card.dataset.sla} · ${card.dataset.publicState === "PUBLISHED" ? "publicada" : "em validação"}`);
      appendText(item, "p", `Insumo inicial: ${card.dataset.input}`);
      const link = appendText(item, "a", "Ver escopo e diferenças");
      link.href = `#${card.id}`;
      list.append(item);
    });
    recommendation.append(list);
    recommendation.hidden = false;
  }

  function recommend(event) {
    event.preventDefault();
    const task = frameTask?.value || "";
    const object = frameObject?.value || "";
    if (filters.task) filters.task.value = task;
    if (filters.object) filters.object.value = object;
    applyFilters(false);

    const matches = cards
      .filter((card) => card.dataset.publicState !== "BLOCKED")
      .filter((card) => !task || card.dataset.taskDoor === task)
      .filter((card) => !object || card.dataset.object === object)
      .slice(0, MAX_RECOMMENDATIONS);
    renderRecommendations(matches);
    setUrlState();
    recommendation?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function updateCompareTray(updateUrl = true) {
    for (const checkbox of document.querySelectorAll("[data-compare-item]")) {
      checkbox.checked = selected.has(checkbox.value);
    }
    if (compareCount) compareCount.textContent = String(selected.size);
    if (compareOpen) compareOpen.disabled = selected.size < MIN_COMPARE;
    if (compareTray) compareTray.hidden = selected.size === 0;
    if (!selected.size && comparison) comparison.hidden = true;
    if (updateUrl) setUrlState();
  }

  function changeComparison(event) {
    const checkbox = event.target.closest("[data-compare-item]");
    if (!checkbox) return;
    if (checkbox.checked && selected.size >= MAX_COMPARE) {
      checkbox.checked = false;
      if (filterStatus) filterStatus.textContent = "A comparação aceita no máximo 4 entregáveis.";
      return;
    }
    if (checkbox.checked) selected.add(checkbox.value);
    else selected.delete(checkbox.value);
    updateCompareTray();
  }

  const CRITERIA = [
    ["trigger", "Compre quando"],
    ["decision", "Decisão"],
    ["unit", "Unidade"],
    ["input", "Insumo"],
    ["output", "Saída"],
    ["sla", "SLA"],
    ["price", "Preço"],
    ["exclusion", "Não inclui"],
    ["stepUp", "Próximo passo"],
  ];

  function openComparison() {
    if (selected.size < MIN_COMPARE || !comparisonItems || !comparison) return;
    comparisonItems.replaceChildren();
    for (const id of selected) {
      const card = cardById(id);
      if (!card) continue;
      const block = document.createElement("article");
      block.className = "catalog-comparison__item";
      const header = document.createElement("header");
      appendText(header, "h4", card.dataset.name);
      appendText(header, "strong", card.dataset.price);
      block.append(header);
      const facts = document.createElement("dl");
      for (const [key, label] of CRITERIA) {
        const row = document.createElement("div");
        appendText(row, "dt", label);
        appendText(row, "dd", card.dataset[key]);
        facts.append(row);
      }
      block.append(facts);
      comparisonItems.append(block);
    }
    comparison.hidden = false;
    comparison.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearComparison() {
    selected.clear();
    if (comparisonItems) comparisonItems.replaceChildren();
    updateCompareTray();
  }

  function restoreUrlState() {
    const params = new URLSearchParams(window.location.search);
    if (queryInput) queryInput.value = params.get("q") || "";
    for (const key of FILTER_KEYS) {
      if (filters[key] && [...filters[key].options].some((option) => option.value === params.get(key))) {
        filters[key].value = params.get(key) || "";
      }
    }
    const framing = [
      [frameTask, "frame_task"],
      [frameObject, "frame_object"],
      [frameInput, "frame_input"],
      [frameDeadline, "deadline"],
    ];
    for (const [control, key] of framing) {
      const value = params.get(key) || "";
      if (!control) continue;
      if (control.tagName !== "SELECT" || [...control.options].some((option) => option.value === value)) control.value = value;
    }
    for (const id of (params.get("compare") || "").split(",").slice(0, MAX_COMPARE)) {
      if (cardById(id)) selected.add(id);
    }
    setView(params.get("view"), false);
    applyFilters(false);
    updateCompareTray(false);
  }

  document.body.classList.add("catalog-enhanced");
  if (filterPanel) filterPanel.hidden = false;
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-filter-query], [data-filter], [data-frame-task], [data-frame-object], [data-frame-input], [data-frame-deadline]")) {
      if (event.target.matches("[data-filter-query], [data-filter]")) applyFilters();
      else setUrlState();
    }
  });
  document.addEventListener("change", changeComparison);
  document.querySelector("[data-catalog-recommend]")?.addEventListener("click", recommend);
  for (const button of viewButtons) button.addEventListener("click", () => setView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-clear-filters]")) button.addEventListener("click", clearFilters);
  compareOpen?.addEventListener("click", openComparison);
  document.querySelector("[data-compare-clear]")?.addEventListener("click", clearComparison);
  restoreUrlState();
})();
