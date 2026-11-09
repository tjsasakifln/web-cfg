import {calculateBdiRate, Decimal} from "./vendor/precifica-bdi.js";
import {exportToolResult} from "/assets/js/tool-credits.mjs";

const field = id => document.getElementById(id);
const form = field("composicao");
const status = field("aviso");
const result = field("resultado");
const inputs = [...form.querySelectorAll("input")];
const example = ["100.000,00", "3", "0,5", "1", "0,5", "1", "7", "5"];
const br = (decimal, places) => {
  const [whole, frac] = decimal.toFixed(places).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + frac;
};
let lines = null;
function invalidate() {
  result.hidden = true;
  lines = null;
  status.textContent = "";
}
form.addEventListener("input", invalidate);
field("exemplo").addEventListener("click", () => {
  invalidate();
  inputs.forEach((input, index) => { input.value = example[index]; });
  status.textContent = "Exemplo didático preenchido. Use Calcular para conferir o resultado.";
});
function parse(input, isCost) {
  const raw = input.value.trim();
  const pattern = isCost ? /^(?:\d{1,12}|\d{1,3}(?:\.\d{3}){1,3})(?:,\d{1,2})?$/ : /^\d{1,3}(?:,\d{1,4})?$/;
  if (!pattern.test(raw)) {
    input.focus();
    throw new Error("Confira o campo " + input.labels[0].textContent + ". Use vírgula para separar os decimais.");
  }
  const value = new Decimal(raw.replaceAll(".", "").replace(",", "."));
  if (!isCost && (value.gt(100) || (input.id === "taxes" && value.gte(100)))) {
    input.focus();
    throw new Error(input.id === "taxes" ? "Os tributos devem somar menos de 100% do faturamento." : "O percentual deve estar entre zero e 100%.");
  }
  return value;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  invalidate();
  try {
    const base = parse(field("custo"), true);
    const params = Object.fromEntries(inputs.slice(1).map(input => [input.id, parse(input, false).toString()]));
    const rate = calculateBdiRate(params);
    const amount = base.times(rate);
    const final = base.plus(amount);
    const pct = rate.times(100);
    field("preco").textContent = "R$ " + br(final, 2);
    field("taxa").textContent = br(pct, 4) + "%";
    field("acrescimo").textContent = "R$ " + br(amount, 2);
    field("memoria").textContent = "Custo direto de R$ " + br(base, 2) + " × fator " + br(rate.plus(1), 8) + " (exibido com oito casas).";
    lines = [
      ["Composição do BDI", "Valor", "Unidade"], ["Custo direto", br(base, 2), "R$"],
      ...inputs.slice(1).map(input => [input.labels[0].textContent.replace(" em %", ""), br(new Decimal(params[input.id]), 4), "%"]),
      ["Taxa de BDI", br(pct, 8), "%"], ["BDI em reais", br(amount, 2), "R$"], ["Preço de venda", br(final, 2), "R$"]
    ];
    result.hidden = false;
    status.textContent = "Cálculo concluído.";
    field("preco-titulo").focus();
  } catch (error) {
    status.textContent = error.message;
  }
});
field("exportar").addEventListener("click", async () => {
  if (!lines) return;
  const content = "\uFEFF" + lines.map(row => row.join(";")).join("\r\n") + "\r\n";
  await exportToolResult({toolId:"calculadora-bdi",format:"csv",content,deliver(){
    const url = URL.createObjectURL(new Blob([content], {type:"text/csv;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "CONFENGE-composicao-BDI.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }});
});
field("campos").disabled = false;
