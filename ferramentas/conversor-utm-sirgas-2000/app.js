import { fromGeographic, fromUtm, readPoints, values, columns } from './conversor.js';
import { exportToolResult } from '/assets/js/tool-credits.mjs';

const get = id => document.getElementById(id);
const direction = get('sentido');
const zoneSelect = get('fuso');
const input = get('pontos');
const status = get('aviso');
const result = get('resultado');
const direct = () => direction.value === 'direta';
let points = [];

for (const hemisphere of ['S', 'N']) {
  for (let zone = 18; zone <= (hemisphere === 'S' ? 25 : 22); zone++) {
    zoneSelect.add(new Option(zone + (hemisphere === 'S' ? ' Sul' : ' Norte'), zone + hemisphere));
  }
}
zoneSelect.value = '22S';

function reset() {
  points = [];
  status.textContent = '';
  result.hidden = true;
  get('linhas').replaceChildren();
}
function setMode() {
  input.value = '';
  get('fuso-campo').hidden = direct();
  get('ordem').textContent = direct() ? 'Latitude;Longitude' : 'E (Leste);N (Norte)';
  input.placeholder = direct() ? '-27,6;-48,55' : '741816,185;6944710,158';
  reset();
}
function calculate() {
  reset();
  try {
    const zone = Number(zoneSelect.value.slice(0, -1));
    const hemisphere = zoneSelect.value.slice(-1);
    points = readPoints(input.value, direct() ? fromGeographic : (e, n) => fromUtm(e, n, zone, hemisphere));
    const order = direct() ? [3, 4, 5, 6, 0, 1, 2] : [1, 2, 0, 3, 4, 5, 6];
    const headers = order.map(index => {
      const header = document.createElement('th');
      header.scope = 'col';
      header.textContent = columns[index];
      return header;
    });
    get('cabecalho').replaceChildren(...headers);
    const rows = points.slice(0, 25).map((point, i) => {
      const row = document.createElement('tr');
      const fields = values(point, i);
      for (const index of order) row.insertCell().textContent = fields[index];
      return row;
    });
    get('linhas').replaceChildren(...rows);
    result.hidden = false;
    const count = points.length;
    status.textContent = count === 1 ? '1 ponto convertido.' : count + ' pontos convertidos.';
    if (count > rows.length) status.textContent += ' A tabela mostra os primeiros 25. Baixe o CSV para obter o lote completo.';
  } catch (error) {
    status.textContent = error.message;
  }
}

direction.addEventListener('change', setMode);
input.addEventListener('input', reset);
zoneSelect.addEventListener('change', reset);
get('converter').addEventListener('click', calculate);
get('exemplo').addEventListener('click', () => {
  zoneSelect.value = '22S';
  input.value = direct() ? '-27,6;-48,55\n2,82;-60,67' : '741816,185;6944710,158\n741915,300;6944860,350';
  calculate();
});
get('baixar').addEventListener('click', async () => {
  if (!points.length) return;
  const lines = [columns, ...points.map(values)].map(row => row.join(';'));
  const content = '\uFEFF' + lines.join('\r\n');
  await exportToolResult({ toolId: 'conversor-utm-sirgas-2000', format: 'csv', content, deliver() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coordenadas-sirgas-2000.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }});
});
setMode();
get('controles').disabled = false;
