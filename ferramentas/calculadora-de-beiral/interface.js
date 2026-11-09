import { simular, paraCentimetro } from './calculo.js';

const el = id => document.getElementById(id);
const numeros = ['latitude', 'longitude', 'fuso', 'fachada', 'vao', 'distancia', 'avanco'];
const formatos = [0, 1, 2].map(digitos => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: digitos, maximumFractionDigits: digitos
}));
const fmt = (valor, digitos = 1) => formatos[digitos].format(valor);
const angulo = graus => fmt(graus) + '°';
const medida = metros => fmt(paraCentimetro(metros), 2) + ' m';
const cobertura = fracao => fmt(Math.floor(fracao * 1000 + 1e-10) / 10) + '%';
const formulario = el('simulador');

function atualizar() {
  const dados = { data: el('data').value };
  for (const id of numeros) {
    const campo = el(id);
    const texto = campo.value.trim().replace('−', '-').replace(',', '.');
    const valor = Number(texto);
    const valido = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(texto) &&
      valor >= Number(campo.dataset.min) && valor <= Number(campo.dataset.max);
    campo.setAttribute('aria-invalid', String(!valido));
    campo.setCustomValidity(valido ? '' : 'Informe um número entre ' + campo.dataset.min + ' e ' + campo.dataset.max + '.');
    dados[id] = valor;
  }
  const valido = formulario.checkValidity();
  el('resultado').hidden = !valido;
  el('ver-sombra').hidden = !valido;
  el('aviso').textContent = valido ? '' : 'Confira os campos indicados para atualizar o estudo.';
  if (!valido) return;

  const r = simular(dados, el('hora').value);
  const recebeSol = r.estado === 'Sol na fachada';
  el('percentual').textContent = recebeSol ? cobertura(r.fracao) : r.estado;
  el('medida').textContent = recebeSol ? medida(r.minimo) : 'Dispensável neste instante';
  el('posicao').textContent = 'Altura solar ' + angulo(r.altitude) + ' · Azimute ' + angulo(r.azimuth) +
    (recebeSol ? ' · Ângulo de perfil ' + angulo(r.perfil) : '');
  el('faixa').setAttribute('height', recebeSol ? String(100 * r.fracao) : '100');
  el('legenda').textContent = recebeSol
    ? 'A faixa azul mostra a altura do vão protegida pelo beiral.'
    : 'A janela inteira está sem incidência solar direta.';
  const linhas = [];
  for (let h = 0; h < 24; h++) {
    const item = simular(dados, String(h).padStart(2, '0') + ':00');
    const tr = document.createElement('tr');
    const sol = item.estado === 'Sol na fachada';
    for (const [i, valor] of [item.hora, item.estado, sol ? cobertura(item.fracao) : 'N/A', sol ? medida(item.minimo) : 'N/A'].entries()) {
      const celula = document.createElement(i ? 'td' : 'th');
      if (!i) celula.scope = 'row';
      celula.textContent = valor;
      tr.append(celula);
    }
    linhas.push(tr);
  }
  el('horarios').replaceChildren(...linhas);
}

el('local').addEventListener('change', () => {
  if (el('local').value) {
    const [lat, lon, fuso] = el('local').value.split('|');
    el('latitude').value = lat;
    el('longitude').value = lon;
    el('fuso').value = fuso;
  }
  atualizar();
});
for (const id of ['latitude', 'longitude', 'fuso']) {
  el(id).addEventListener('input', () => { el('local').value = ''; });
}
formulario.addEventListener('input', atualizar);
formulario.addEventListener('submit', evento => { evento.preventDefault(); atualizar(); });
el('campos').disabled = false;
el('carregando').hidden = true;
atualizar();
