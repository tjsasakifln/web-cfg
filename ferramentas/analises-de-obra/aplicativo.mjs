import { TOOLS, getTool } from "./catalogo.mjs";
import { evaluateTool, asText } from "./motor.mjs";
import { createToolCredits } from "/assets/js/tool-credits.mjs";

const element = id => document.getElementById(id);
const select = element("filtro");
const search = element("buscar");
const catalog = element("lista-ferramentas");
const form = element("formulario");
const fields = element("campos");
const status = element("aviso");
const resultBlock = element("resultado");
const toolId = "analises-de-obra";
const credits = createToolCredits({ toolId, shared: true });
let active = null, report = null, output = "", preparedExport = null;

function node(tag, text, className = "") {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function notify(message, error = false) {
  status.textContent = message;
  status.dataset.error = error ? "true" : "false";
}
function resetResult() {
  report = null;
  preparedExport = null;
  output = "";
  resultBlock.hidden = true;
  element("exportar").disabled = true;
  element("copiar").disabled = true;
}
function download(text, filename) {
  // Dados de origem não confiável são oferecidos exclusivamente como arquivo:
  // o conteúdo não ganha um tipo de mídia renderizável pelo navegador.
  const filenameSafe = /^CONFENGE-[a-z0-9-]+-(?:analise\.txt|dados\.json)$/.test(filename);
  if (!filenameSafe) throw new Error("Nome de arquivo de exportação não autorizado.");
  const blob = new Blob([String(text)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("download", filename);
  link.setAttribute("href", url);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function listItem(parent, value) {
  parent.append(node("li", value));
}
function renderCatalog() {
  const needle = search.value.trim().toLocaleLowerCase("pt-BR");
  const chosen = select.value;
  const visible = TOOLS.filter(t => (!chosen || t.category === chosen) &&
      (t.title + " " + t.description + " " + t.category).toLocaleLowerCase("pt-BR").includes(needle));
  const buttons = visible.map(t => {
    const button = node("button", undefined, "portfolio-tool");
    button.type = "button";
    button.dataset.id = t.id;
    button.setAttribute("aria-pressed", String(t.id === active?.id));
    button.setAttribute("aria-label", t.title + ", " + t.category);
    button.append(node("strong", t.title), node("small", t.description));
    button.addEventListener("click", () => activate(t.id));
    return button;
  });
  catalog.replaceChildren(...(buttons.length ? buttons : [node("p", "Nenhuma ferramenta encontrada. Altere os filtros.")]));
  element("quantas-ferramentas").textContent = visible.length + (visible.length === 1 ? " opção" : " opções");
}
function renderInput(field) {
  const wrap = node("div", undefined, "portfolio-field" + (field.kind !== "number" ? " portfolio-field--long" : ""));
  const id = "campo-" + field.key;
  const label = node("label", field.label);
  label.htmlFor = id;
  const input = field.kind === "number" ? node("input") : node("textarea");
  input.id = id;
  input.name = field.key;
  input.value = field.example;
  if (field.kind === "number") {
    input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off";
  } else {
    input.rows = field.kind === "sheet" ? 6 : 3;
    input.spellcheck = field.kind === "text";
  }
  input.addEventListener("input", () => { resetResult(); notify("Dados alterados. Execute novamente para atualizar o resultado."); });
  wrap.append(label, input);
  if (field.kind === "sheet") {
    const fileLabel = node("label", "Ou abrir arquivo CSV do dispositivo");
    const file = node("input");
    file.type = "file";file.accept = ".csv,.txt,text/csv,text/plain";
    file.setAttribute("aria-label", "Importar CSV para " + field.label);
    file.addEventListener("change", async () => {
      try {
        const chosen = file.files?.[0];
        if (!chosen) return;
        if (chosen.size > 700000) throw new Error("Arquivo muito grande. Limite de 700 KB.");
        input.value = await chosen.text();
        resetResult(); notify("CSV carregado no formulário. Os dados não foram enviados.");
      } catch (error) { notify(error.message, true); }
      finally { file.value = ""; }
    });
    wrap.append(fileLabel,file,node("p","Use cabeçalho e separador ponto e vírgula. Verifique os dados após importar.","portfolio-file-hint"));
  }
  return wrap;
}
function activate(id, initial = false) {
  const found = getTool(id);
  if (!found) return;
  active = found;resetResult();
  element("ferramenta-area").textContent = found.category.toUpperCase();
  element("ferramenta-titulo").textContent = found.title;
  element("ferramenta-descricao").textContent = found.description;
  element("limites").textContent = found.caveat;
  fields.replaceChildren(node("legend","Dados para " + found.title,"visually-hidden"),...found.fields.map(renderInput));
  fields.disabled = false;
  for (const name of ["calcular","salvar","abrir"]) element(name).disabled = false;
  notify("Exemplo demonstrativo carregado. Substitua pelos dados do seu caso e clique em Conferir e calcular.");
  renderCatalog();
  const url = new URL(window.location.href);
  if (url.searchParams.get("ferramenta") !== id) {
    url.searchParams.set("ferramenta",id);
    history.replaceState(null,"",url.pathname+url.search);
  }
  if (!initial && window.matchMedia("(max-width:960px)").matches) {
    element("ferramenta-titulo").scrollIntoView({behavior:"smooth",block:"start"});
  }
}
function values() {
  if (!active) return {};
  const out = {};
  for (const field of active.fields) out[field.key] = element("campo-" + field.key).value;
  return out;
}
function renderList(id, values) {
  const list = element(id);
  list.replaceChildren(...values.slice(0, 120).map(line => node("li",line)));
  if (!values.length) list.append(node("li","Nenhum apontamento adicional."));
}
function renderResult(r) {
  element("resultado-titulo").textContent = r.title;
  element("metricas").replaceChildren(...r.metrics.map(m => {
    const box = node("div",undefined,"portfolio-metric");
    box.append(node("small",m.label),node("strong",m.value));
    return box;
  }));
  renderList("linhas",r.lines);
  renderList("apontamentos",r.alerts);
  renderList("metodo",[...r.method,r.caveat]);
  resultBlock.hidden = false;
  element("copiar").disabled = false;
  element("exportar").disabled = false;
}
form.addEventListener("submit",event => {
  event.preventDefault();
  if (!active) return notify("Escolha uma ferramenta.",true);
  try {
    const r = evaluateTool(active.id, values(), {papa:window.Papa});
    const text = asText(r);
    report = r; output = text;
    // A emissão conserva exatamente os bytes da análise, mesmo durante retomada de login.
    const snapshot = text;
    preparedExport = { toolId, format:"txt", content:new Blob([snapshot],{type:"text/plain;charset=utf-8"}),
      deliver: async () => download(snapshot, "CONFENGE-"+r.toolId+"-analise.txt") };
    renderResult(r);
    notify("Análise concluída no navegador. Confira os apontamentos e o método.");
    try { window.confengeTrack?.("tool_complete",{tool_id:toolId}); } catch {}
  } catch (error) {
    resetResult();
    notify(error?.message || "Não foi possível realizar a análise. Confira as informações.",true);
  }
});
element("salvar").addEventListener("click",() => {
  if (!active) return;
  const draft = { schema:"confenge.analises-de-obra.draft/v1", ferramenta:active.id, campos:values() };
  download(JSON.stringify(draft,null,2)+"\n","CONFENGE-"+active.id+"-dados.json");
  notify("Dados de trabalho salvos no dispositivo. O arquivo não contém resultado calculado.");
});
element("abrir").addEventListener("click",()=>element("abrir-arquivo").click());
element("abrir-arquivo").addEventListener("change",async event => {
  try {
    const file=event.target.files?.[0];
    if(!file)return;
    if(file.size>750000)throw new Error("O arquivo de dados excede 750 KB.");
    const data=JSON.parse(await file.text());
    if(data.schema!=="confenge.analises-de-obra.draft/v1" || !getTool(data.ferramenta) ||
        !data.campos || typeof data.campos!=="object" || Array.isArray(data.campos))
      throw new Error("Este arquivo não pertence às ferramentas de análise CONFENGE.");
    activate(data.ferramenta,true);
    const fieldsAllowed=new Set(active.fields.map(f=>f.key));
    for(const [name,value] of Object.entries(data.campos)){
      if(!fieldsAllowed.has(name) || typeof value!=="string" || value.length>700000)throw new Error("Dados salvos incompatíveis.");
      element("campo-"+name).value=value;
    }
    resetResult();notify("Dados recuperados. Execute a ferramenta para atualizar o resultado.");
  }catch(error){notify(error?.message||"Não foi possível abrir os dados.",true);}
  finally{event.target.value="";}
});
element("copiar").addEventListener("click",async()=>{
  if(!output)return;
  try{await navigator.clipboard.writeText(output);notify("Resultado copiado para a área de transferência.");}
  catch{notify("O navegador não permitiu copiar. Você pode selecionar o resultado exibido.",true);}
});
element("exportar").addEventListener("click",async()=>{
  if(!preparedExport)return notify("Calcule antes de exportar.",true);
  const button=element("exportar");button.disabled=true;
  notify("Consultando autorização para a exportação. Nenhuma cobrança é feita antes da confirmação na carteira.");
  try {
    if (!await credits.ready()) throw new Error("A emissão de arquivos está indisponível neste momento.");
    const delivered=await credits.deliverLocal(preparedExport);
    if(delivered)notify("Arquivo emitido e disponibilizado no dispositivo.");
    else notify("A emissão não foi concluída. Consulte a carteira para continuar.");
  }catch{notify("A exportação não foi autorizada. Seu resultado continua visível.",true);}
  finally{button.disabled=false;}
});
const groups=[...new Set(TOOLS.map(t=>t.category))];
groups.forEach(group=>{const option=node("option",group);option.value=group;select.append(option);});
search.addEventListener("input",renderCatalog);
select.addEventListener("change",renderCatalog);
renderCatalog();
const requested=new URLSearchParams(window.location.search).get("ferramenta");
activate(getTool(requested)?.id || TOOLS[0].id,true);
