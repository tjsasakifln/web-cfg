(() => {
  "use strict";

  document.querySelector("link[data-catalog-css]")?.setAttribute("media", "all");

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

  const EXPECTED_FIELDS = [
    "id", "name", "trigger", "decision", "unit", "input", "inputKinds",
    "inputCount", "decisionBusinessDays", "output", "sla", "price",
    "exclusion", "stepUp", "publicState", "contractHtml",
  ];
  const EXPECTED_CONTRACT_CLAUSES = [
    "decision_oriented_name", "observable_trigger", "cost_of_inaction",
    "decision_that_changes", "concrete_result_and_artifact_example", "scope_in",
    "client_inputs_and_sla_start", "method_and_provenance", "price_and_sla_same_block",
    "exclusions_and_third_party", "fit_and_misfit", "proof_matching_real_state",
    "specific_objections", "cta_with_post_click_expectation", "neighbor_alternative_and_step_up",
  ];
  const hasExactContract = (value) => {
    if (typeof value !== "string" || /<(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:/i.test(value)) return false;
    const clauses = [...value.matchAll(/data-copy-clause="([^"]+)"/g)].map((match) => match[1]);
    return clauses.length === EXPECTED_CONTRACT_CLAUSES.length &&
      clauses.every((clause, index) => clause === EXPECTED_CONTRACT_CLAUSES[index]);
  };
  const payload = window.CONFENGE_CATALOG_DATA;
  if (
    payload?.schema !== "confenge.public-deliverable-catalog/1.1" ||
    !Array.isArray(payload.fields) ||
    payload.fields.length !== EXPECTED_FIELDS.length ||
    !payload.fields.every((field, index) => field === EXPECTED_FIELDS[index]) ||
    !Array.isArray(payload.items) ||
    payload.items.length !== cards.length ||
    !payload.items.every((row) => (
      Array.isArray(row) &&
      row.length === EXPECTED_FIELDS.length &&
      row.slice(0, 6).every((value) => typeof value === "string") &&
      Array.isArray(row[6]) &&
      row[6].every((value) => typeof value === "string") &&
      Number.isInteger(row[7]) && row[7] > 0 &&
      (row[8] === "" || (Number.isInteger(row[8]) && row[8] > 0)) &&
      row.slice(9, 14).every((value) => typeof value === "string") &&
      ["PUBLISHED", "VALIDATE", "BLOCKED"].includes(row[14]) &&
      hasExactContract(row[15])
    ))
  ) return;
  const records = new Map(payload.items.map((row) => {
    const record = Object.fromEntries(payload.fields.map((field, index) => [field, row[index]]));
    return [record.id, record];
  }));
  if (records.size !== cards.length || cards.some((card) => !records.has(card.dataset.deliverableId))) return;
  const recordFor = (card) => records.get(card.dataset.deliverableId);

  function enhanceCard(card) {
    const record = recordFor(card);
    const action = card.lastElementChild;
    if (!record || !action) return;

    const details = document.createElement("details");
    details.className = "catalog-item__contract";
    details.dataset.copyContractId = record.id;
    const summary = document.createElement("summary");
    summary.textContent = "Ver escopo, aderência e alternativa";
    const body = document.createElement("div");
    body.dataset.copyContractBody = "";
    details.append(summary, body);
    details.addEventListener("toggle", () => hydrateContract(details));

    const compare = document.createElement("label");
    compare.className = "catalog-item__compare";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = record.id;
    checkbox.dataset.compareItem = "";
    compare.append(checkbox, " Comparar esta entrega");

    card.insertBefore(details, action);
    card.insertBefore(compare, action);
  }

  cards.forEach(enhanceCard);

  function hydrateContract(details) {
    if (!details.open || details.dataset.copyContractHydrated === "true") return;
    const card = details.closest("article.catalog-item[data-deliverable-id]");
    const body = details.querySelector("[data-copy-contract-body]");
    const contractHtml = card ? recordFor(card)?.contractHtml : "";
    if (!body || !contractHtml) return;
    // `contractHtml` is generated from the versioned registry with every
    // registry value escaped before this trusted local asset is committed.
    body.innerHTML = contractHtml;
    details.dataset.copyContractHydrated = "true";
  }

  document.querySelectorAll("details[data-copy-contract-id][open]").forEach(hydrateContract);

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
      const matchesQuery = !query || normalize(card.textContent).includes(query);
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

  function matchesInput(card, input) {
    return recordFor(card).inputKinds.includes(input);
  }

  function businessDaysUntil(value) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!parts) return null;
    const deadline = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    if (
      deadline.getFullYear() !== Number(parts[1]) ||
      deadline.getMonth() !== Number(parts[2]) - 1 ||
      deadline.getDate() !== Number(parts[3])
    ) return null;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() + 1);
    let days = 0;
    while (cursor <= deadline) {
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function requiredBusinessDays(card) {
    const parsed = Number.parseInt(recordFor(card).decisionBusinessDays || "", 10);
    return Number.isInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
  }

  function renderRecommendations(matches, context = {}) {
    if (!recommendation) return;
    recommendation.replaceChildren();
    if (!matches.length) {
      const noMatch = context.deadline && context.excludedForDeadline
        ? `Nenhum caminho disponível cabe nos ${context.deadlineDays} dias úteis informados. Aumente o prazo ou peça revisão humana; a recomendação não encurta o SLA publicado.`
        : "Nenhum caminho disponível combina com esse enquadramento. Ajuste objeto, tarefa ou insumo; ofertas indisponíveis não são elevadas pela recomendação.";
      appendText(recommendation, "p", noMatch);
      recommendation.hidden = false;
      return;
    }

    appendText(recommendation, "h4", "Caminhos para revisão humana");
    const list = document.createElement("div");
    list.className = "catalog-recommendation__items";
    matches.forEach((card, index) => {
      const record = recordFor(card);
      const item = document.createElement("article");
      appendText(item, "p", index === 0 ? "Caminho principal" : "Alternativa");
      appendText(item, "h5", record.name);
      appendText(item, "p", `Motivo: ${record.trigger}`);
      appendText(item, "p", `${record.price} · ${record.sla} · ${record.publicState === "PUBLISHED" ? "publicada" : "em validação"}`);
      if (context.input === "apenas a pergunta") {
        appendText(item, "p", `Você ainda precisará reunir: ${record.input}.`);
      } else if (context.input) {
        const inputNote = matchesInput(card, context.input)
          ? `O insumo informado (${context.input}) aparece nas entradas publicadas.`
          : `Além de ${context.input}, este caminho ainda exige: ${record.input}.`;
        appendText(item, "p", inputNote);
      } else {
        appendText(item, "p", `Insumo inicial: ${record.input}`);
      }
      if (context.deadline) {
        appendText(item, "p", `Prazo: requer até ${requiredBusinessDays(card)} dias úteis e cabe nos ${context.deadlineDays} dias úteis informados.`);
      }
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
    const input = frameInput?.value || "";
    const deadline = frameDeadline?.value || "";
    const deadlineDays = deadline ? businessDaysUntil(deadline) : null;
    if (filters.task) filters.task.value = task;
    if (filters.object) filters.object.value = object;
    applyFilters(false);

    const candidates = cards
      .filter((card) => card.dataset.publicState !== "BLOCKED")
      .filter((card) => !task || card.dataset.taskDoor === task)
      .filter((card) => !object || card.dataset.object === object);
    const excludedForDeadline = deadlineDays !== null
      ? candidates.filter((card) => requiredBusinessDays(card) > deadlineDays).length
      : 0;
    const matches = candidates
      .filter((card) => deadlineDays === null || requiredBusinessDays(card) <= deadlineDays)
      .sort((left, right) => {
        if (input === "apenas a pergunta") {
          return Number(recordFor(left).inputCount || 0) - Number(recordFor(right).inputCount || 0);
        }
        if (!input) return 0;
        return Number(matchesInput(right, input)) - Number(matchesInput(left, input));
      })
      .slice(0, MAX_RECOMMENDATIONS);
    renderRecommendations(matches, { input, deadline, deadlineDays, excludedForDeadline });
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
      const record = recordFor(card);
      const block = document.createElement("article");
      block.className = "catalog-comparison__item";
      const header = document.createElement("header");
      appendText(header, "h4", record.name);
      appendText(header, "strong", record.price);
      block.append(header);
      const facts = document.createElement("dl");
      for (const [key, label] of CRITERIA) {
        const row = document.createElement("div");
        appendText(row, "dt", label);
        appendText(row, "dd", record[key]);
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
