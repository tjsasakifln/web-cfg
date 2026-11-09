const form = document.querySelector("#market-radar-form");
const status = document.querySelector("#radar-status");
const results = document.querySelector("#radar-results");
const $ = (selector) => document.querySelector(selector);
$("#radar-fields")?.removeAttribute("disabled");
let latest = null;
let entity = null;
let controller = null;
let generation = 0;

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const timestampFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const text = (value) => String(value == null ? "" : value);
const escapeHtml = (value) => text(value).replace(/[&<>"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function money(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text(value));
  if (!match) return "Não informado";
  const cents = (match[2] || "").padEnd(2, "0");
  return moneyFormatter.formatToParts(BigInt(match[1])).map((part) => part.type === "fraction" ? cents : part.value).join("");
}
function date(value) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Não informado" : dateFormatter.format(parsed);
}
function timestamp(value) {
  const parsed = new Date(value);
  return !value || Number.isNaN(parsed.valueOf()) ? "Não informado" : `${timestampFormatter.format(parsed)} (Brasília)`;
}
function requestBody(page) {
  const values = new FormData(form);
  const request = { page };
  ["q", "uf", "months", "ending", "sort"].forEach((key) => { request[key] = text(values.get(key)).trim(); });
  if (entity) request[entity.kind] = entity.id;
  return request;
}
function safeSource(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "pncp.gov.br" && !parsed.port && !parsed.username && !parsed.password && /^\/app\/contratos\/\d{14}\/\d{4}\/[1-9]\d{0,9}$/.test(parsed.pathname) && !parsed.search && !parsed.hash
      ? `<a href="${escapeHtml(parsed.href)}" rel="noopener external" target="_blank">PNCP</a>` : "Não informado";
  } catch { return "Não informado"; }
}
function renderRanks(selector, items, absentCopy, kind) {
  const root = $(selector);
  root.innerHTML = items.length ? items.map((item) => `<li><button type="button" data-entity="${escapeHtml(item.id || "")}" data-kind="${kind}"><strong>${escapeHtml(item.name || "Não informado")}</strong><span>${Number(item.contracts || 0)} contratos observados${item.uf ? ` · ${escapeHtml(item.uf)}` : ""}</span></button></li>`).join("") : `<li>${absentCopy}</li>`;
  root.querySelectorAll("[data-entity]").forEach((button) => {
    button.addEventListener("click", () => {
      entity = { kind: button.dataset.kind, id: button.dataset.entity, name: button.querySelector("strong")?.textContent || "" };
      search(1);
    });
  });
}
function renderRecords(records) {
  $("#radar-records-body").innerHTML = records.length ? records.map((record) => `<tr>
    <td>${escapeHtml(record.object || "Objeto não informado")}<small>${escapeHtml(record.city || "")}${record.uf ? ` · ${escapeHtml(record.uf)}` : ""}</small></td>
    <td>${escapeHtml(record.buyer_name || "Não informado")}</td><td>${escapeHtml(record.supplier_name || "Não informado")}</td>
    <td>${money(record.value)}</td><td>${date(record.published_at)}</td><td>${date(record.ends_at)}</td><td>${safeSource(record.source_url)}</td></tr>`).join("") : '<tr><td colspan="7">Nenhum contrato corresponde a este recorte.</td></tr>';
}
function renderPagination(pagination) {
  const root = $("#radar-pagination");
  root.innerHTML = "";
  const current = Number(pagination.page || 1);
  const total = Number(pagination.pages || 1);
  [["Anterior", current - 1], [String(current), current], ["Próxima", current + 1]].forEach(([label, page]) => {
    if (page < 1 || page > total) return;
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label;
    if (page === current) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => search(page));
    root.append(button);
  });
}
function render(data) {
  latest = data;
  const summary = data.summary || {}, meta = data.meta || {}, records = data.records || [], pagination = data.pagination || {};
  results.hidden = false;
  $("#radar-clear-entity").hidden = !entity;
  $("#radar-result-title").textContent = entity ? `Contratos de ${entity.name}` : (data.filters?.q ? `Contratos relacionados a “${data.filters.q}”` : "Contratos do recorte");
  const freshness = [meta.generated_at ? `Projeção preparada em ${timestamp(meta.generated_at)}.` : "", meta.source_as_of ? `Base consultada em ${timestamp(meta.source_as_of)}.` : "", meta.ingestion_latest_at ? `Última observação registrada em ${timestamp(meta.ingestion_latest_at)}.` : "", `Janela: ${date(meta.window_start)} a ${date(meta.window_end)}.`].filter(Boolean).join(" ");
  $("#radar-meta").textContent = [freshness, meta.coverage_note, meta.excluded_count ? `${meta.excluded_count.toLocaleString("pt-BR")} registros fora da projeção após os critérios de seleção, validação e deduplicação.` : ""].filter(Boolean).join(" ");
  $("#kpi-contracts").textContent = Number(summary.contracts || 0).toLocaleString("pt-BR");
  $("#kpi-buyers").textContent = Number(summary.buyers || 0).toLocaleString("pt-BR");
  $("#kpi-suppliers").textContent = Number(summary.suppliers || 0).toLocaleString("pt-BR");
  $("#kpi-value").textContent = Number(summary.valued_contracts || 0).toLocaleString("pt-BR");
  $("#kpi-value-note").textContent = meta.value_note || "Valores não são totalizados como mercado ou pagamentos.";
  renderRanks("#radar-buyers", data.buyers || [], "Sem órgãos no recorte.", "buyer");
  renderRanks("#radar-suppliers", data.suppliers || [], "Sem fornecedores no recorte.", "supplier");
  renderRecords(records);
  $("#radar-record-count").textContent = `${Number(pagination.total || records.length)} registros no resultado${pagination.limited ? " · refine os filtros para ver um recorte menor." : ""}`;
  $("#radar-csv").textContent = `Exportar esta página (${records.length} linhas)`;
  renderPagination(pagination);
  status.textContent = `${records.length} contratos visíveis nesta página.`;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function search(page = 1) {
  const thisGeneration = ++generation;
  controller?.abort();
  controller = new AbortController();
  const requestController = controller;
  status.textContent = "Consultando contratos publicados…";
  results.hidden = true; latest = null;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, 65000);
  try {
    const response = await fetch("/api/web/market-radar", {
      method: "POST", credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(page)), signal: requestController.signal,
    });
    const data = await response.json();
    if (thisGeneration !== generation) return;
    if (data.error === "data_stale") { status.textContent = "A atualização do radar está atrasada. Consulte o PNCP para uma busca atual."; return; }
    if (!response.ok || !data.ok) throw new Error(data.message || "O radar não está disponível neste momento.");
    if (data.meta?.stale) { status.textContent = "A atualização do radar está atrasada. Consulte o PNCP para uma busca atual."; return; }
    render(data);
  } catch (error) {
    if (thisGeneration !== generation) return;
    status.textContent = timedOut ? "A consulta demorou demais. Tente novamente com um recorte menor." : "Não foi possível concluir a consulta agora. Tente novamente.";
  } finally { clearTimeout(timeout); }
}
form?.addEventListener("submit", (event) => { event.preventDefault(); entity = null; search(1); });
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => { $("#radar-q").value = button.dataset.example; entity = null; search(1); }));
$("#radar-clear-entity")?.addEventListener("click", () => { entity = null; search(1); });
$("#radar-copy")?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.origin + location.pathname); status.textContent = "Endereço da ferramenta copiado. A consulta não foi incluída no link."; }
  catch { status.textContent = "Não foi possível copiar o endereço neste navegador."; }
});
function csvCell(value) {
  const raw = text(value).replace(/[\u0000-\u001F\u007F]/g, " ");
  const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
$("#radar-csv")?.addEventListener("click", () => {
  if (!latest) return;
  const f = latest.filters || {}, m = latest.meta || {};
  const rows = [["radar_mercado_publico", "recorte", f.q || "", f.uf || "Brasil", f.months || "", entity?.name || "", m.generated_at || "", m.source_as_of || "", m.ingestion_latest_at || ""],
    ["objeto", "orgao", "fornecedor", "uf", "municipio", "valor_informado", "publicacao", "fim_vigencia", "fonte_pncp"],
    ...(latest.records || []).map((r) => [r.object, r.buyer_name, r.supplier_name, r.uf, r.city, r.value, r.published_at, r.ends_at, r.source_url])];
  const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "radar-mercado-publico.csv"; link.click(); URL.revokeObjectURL(url);
});
