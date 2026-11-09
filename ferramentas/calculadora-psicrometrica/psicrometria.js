(() => {
  "use strict";
  const credits = import('/assets/js/tool-credits.mjs');
  const lib = window.psychrolib;
  const byId = id => document.getElementById(id);
  const form = byId("ambiente");
  const result = byId("resultado");
  const status = byId("aviso");
  const mode = byId("modo");
  const pressureInput = byId("pressao");
  const pressureValues = {pressao: "101,325", altitude: "0"};
  let previousMode = mode.value;
  let csvRows;

  if (!lib) {
    status.textContent = "Não foi possível carregar a calculadora. Recarregue a página.";
    return;
  }
  lib.SetUnitSystem(lib.SI);
  const nearZero = (value, digits) => Math.abs(value) < 0.5 * 10 ** -digits;
  const format = (value, digits = 2) => (nearZero(value, digits) ? 0 : value).toLocaleString("pt-BR", {
    maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping: false
  });
  function read(id, min, max, label) {
    const input = byId(id);
    const raw = input.value.trim();
    const value = Number(raw.replace(",", "."));
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw) || !Number.isFinite(value) || value < min || value > max) {
      input.focus();
      throw new Error(label + " deve estar entre " + min + " e " + max + ".");
    }
    return value;
  }
  function invalidate() {
    const hadResult = !result.hidden;
    result.hidden = true;
    csvRows = undefined;
    if (hadResult || status.textContent) status.textContent = "Use o botão Calcular para atualizar o resultado.";
  }
  form.addEventListener("input", invalidate);
  mode.addEventListener("change", () => {
    pressureValues[previousMode] = pressureInput.value;
    previousMode = mode.value;
    pressureInput.value = pressureValues[mode.value];
    const altitude = mode.value === "altitude";
    byId("rotulo-pressao").textContent = altitude ? "Altitude do local (m)" : "Pressão absoluta (kPa)";
    byId("dica-pressao").textContent = altitude ? "A pressão será estimada a partir da altitude, pela atmosfera padrão." :
      "Use a pressão absoluta local. Boletins meteorológicos também podem informar a pressão corrigida ao nível do mar.";
    invalidate();
  });

  function drawChart(dry, ratio, pressure) {
    const group = byId("curvas");
    group.replaceChildren();
    function add(tag, attrs, text) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text !== undefined) el.textContent = text;
      group.append(el);
    }
    const low = Math.max(0, Math.floor((dry - 8) / 5) * 5);
    const high = Math.min(50, low + 25);
    const maxRatio = Math.ceil(lib.GetHumRatioFromRelHum(high, 1, pressure) * 1000 / 5) * 5;
    const x = t => 58 + (t - low) * 436 / (high - low);
    const y = w => 209 - w * 172 / maxRatio;
    add("text", {x: 12, y: 17, fill: "#12344c"}, "Razão de umidade (g/kg de ar seco)");
    add("text", {x: 290, y: 254, fill: "#12344c", "text-anchor": "middle"}, "Temperatura de bulbo seco (°C)");
    for (let i = 0; i <= 4; i++) {
      const w = maxRatio * i / 4;
      add("line", {x1: x(low), x2: x(high), y1: y(w), y2: y(w), stroke: "#ccd9d6"});
      add("text", {x: 50, y: y(w) + 4, "text-anchor": "end", fill: "#274539"}, format(w, Number.isInteger(w) ? 0 : 1));
    }
    for (let t = low; t <= high; t += 5) {
      add("line", {x1: x(t), x2: x(t), y1: 37, y2: 209, stroke: "#e0e8e3"});
      add("text", {x: x(t), y: 229, fill: "#274539", "text-anchor": "middle"}, t);
    }
    for (let rh = 20; rh <= 100; rh += 20) {
      const points = [];
      for (let t = low; t <= high; t += .5) {
        points.push(x(t) + "," + y(lib.GetHumRatioFromRelHum(t, rh / 100, pressure) * 1000));
      }
      add("polyline", {points: points.join(" "), stroke: rh === 100 ? "#193958" : "#497858", fill: "none", "stroke-width": rh === 100 ? 2.5 : 1.3});
    }
    add("circle", {cx: x(dry), cy: y(ratio), r: 5.5, fill: "#082742", stroke: "white", "stroke-width": 1.5});
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    result.hidden = true;
    csvRows = undefined;
    try {
      const dry = read("temperatura", 0, 50, "A temperatura do ar (°C)");
      const rh = read("umidade", 1, 100, "A umidade relativa (%)");
      const altitude = mode.value === "altitude" ? read("pressao", -420, 5000, "A altitude (m)") : null;
      const pressure = altitude === null ? read("pressao", 50, 110, "A pressão absoluta (kPa)") * 1000 : lib.GetStandardAtmPressure(altitude);
      const surface = byId("superficie").value.trim() ? read("superficie", -40, 80, "A temperatura da superfície (°C)") : null;
      const [ratio, wet, dew, vapor, enthalpy, volume] = lib.CalcPsychrometricsFromRelHum(dry, rh / 100, pressure);
      const dewLabel = nearZero(dew, 2) ? "Limite de saturação" : dew < 0 ? "Ponto de geada" : "Ponto de orvalho";
      const metrics = [
        [dewLabel, dew, "°C"], ["Bulbo úmido", wet, "°C"], ["Razão de umidade", ratio * 1000, "g/kg de ar seco"],
        ["Entalpia", enthalpy / 1000, "kJ/kg de ar seco"], ["Pressão de vapor", vapor / 1000, "kPa"],
        ["Volume específico", volume, "m³/kg de ar seco", 3]
      ];
      const list = byId("propriedades");
      list.replaceChildren();
      for (const [label, value, unit, digits] of metrics) {
        const group = document.createElement("div");
        const term = document.createElement("dt");
        const definition = document.createElement("dd");
        term.textContent = label;
        definition.textContent = format(value, digits) + " " + unit;
        group.append(term, definition);
        list.append(group);
      }
      const pressureSource = altitude === null ? "pressão informada" : "pressão estimada a " + format(altitude, 1) + " m";
      byId("condicoes").textContent = format(dry, 1) + " °C · " + format(rh, 1) + "% de umidade relativa · " + format(pressure / 1000, 3) + " kPa (" + pressureSource + ").";
      const delta = surface === null ? null : surface - dew;
      const reading = delta === null ? "Compare o limite de " + format(dew) + " °C com a temperatura medida na superfície." :
        Math.abs(delta) < .01 ? "A superfície está no limite de saturação, dentro de 0,01 °C." :
        delta < 0 ? "A superfície está " + format(-delta) + " °C abaixo do limite de saturação. Há condição para " + (surface < 0 ? "formação de gelo." : "condensação.") :
        "A superfície está " + format(delta) + " °C acima do limite de saturação nas condições informadas.";
      byId("leitura").textContent = reading;
      drawChart(dry, ratio * 1000, pressure);
      csvRows = [["Grandeza", "Valor", "Unidade"], ["Temperatura do ar", format(dry, 3), "°C"], ["Umidade relativa", format(rh, 3), "%"],
        ["Pressão absoluta (" + pressureSource + ")", format(pressure / 1000, 3), "kPa"],
        ...metrics.map(([label, value, unit]) => [label, format(value, 4), unit])];
      if (surface !== null) csvRows.push(["Superfície", format(surface, 3), "°C"], ["Superfície menos limite de saturação", format(delta, 3), "°C"]);
      result.hidden = false;
      status.textContent = "Cálculo concluído.";
      byId("titulo-resultado").focus();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  byId("csv").addEventListener("click", async () => {
    if (!csvRows) return;
    const csv = "\uFEFF" + csvRows.map(row => row.join(";")).join("\r\n") + "\r\n";
    const { exportToolResult } = await credits;
    await exportToolResult({ toolId: 'calculadora-psicrometrica', format: 'csv', content: csv, deliver() {
      const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = "CONFENGE-psicrometria.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }});
  });
  byId("controles").disabled = false;
})();
