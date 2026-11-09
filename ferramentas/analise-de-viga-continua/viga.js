// Rotational terms of beam1e and quartic recovery from beam1s, adapted from
// CALFEM for Python (Lund University), core.py, dc7d250bb7502a45f1b407b9cbc9c7bcc1a00b90.
// See LICENSE-CALFEM.txt. Upward displacement and counterclockwise rotation are positive.
function noIntervalo(x, L) { return Number.isFinite(x) && x > 0 && x < L; }

// A monotone interval has at most one sign-changing root. Stationary boundaries
// are retained by the caller, including the degenerate case of a repeated root.
function raizesPorIntervalos(f, limites) {
  const raizes = [];
  for (let i = 1; i < limites.length; i++) {
    let a = limites[i - 1], b = limites[i];
    const fa = f(a), fb = f(b);
    if (fa === 0) raizes.push(a);
    if (fb === 0) raizes.push(b);
    if (fa * fb >= 0) continue;
    for (let k = 0; k < 52; k++) {
      const meio = (a + b) / 2;
      if (fa * f(meio) <= 0) b = meio;
      else a = meio;
    }
    raizes.push((a + b) / 2);
  }
  return raizes;
}

function secao({ L, q, EI }, esquerda, direita) {
  const a = -q / (24 * EI);
  const b = (esquerda + direita) / L ** 2 - 2 * L * a;
  const c = -(2 * esquerda + direita) / L + L * L * a;
  const deslocamento = x => x * (((a * x + b) * x + c) * x + esquerda);
  const rotacao = x => ((4 * a * x + 3 * b) * x + 2 * c) * x + esquerda;
  const momento = x => EI * ((12 * a * x + 6 * b) * x + 2 * c);
  const cortante = x => EI * (24 * a * x + 6 * b); // V = dM/dx
  const pontoV = cortante(0) / q;
  const extremosM = [0, ...(noIntervalo(pontoV, L) ? [pontoV] : []), L];
  const pontosM0 = raizesPorIntervalos(momento, extremosM).filter(x => noIntervalo(x, L));
  const extremosY = raizesPorIntervalos(rotacao, [0, ...pontosM0, L]);
  const pontos = [...new Set([...extremosM, ...pontosM0, ...extremosY])].sort((u, v) => u - v);
  const avaliar = x => ({ x, M: momento(x), V: cortante(x), flecha: 1000 * deslocamento(x) });
  const criticos = pontos.map(avaliar);
  const flechaMax = criticos.reduce((atual, novo) => Math.abs(novo.flecha) > Math.abs(atual.flecha) ? novo : atual);
  return { L, q, EI, avaliar, criticos, flechaMax,
    Mmin: Math.min(...criticos.map(p => p.M)), Mmax: Math.max(...criticos.map(p => p.M)) };
}

export function analisar(vaos, E, fixoE = false, fixoD = false) {
  const faixa = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  if (!Array.isArray(vaos) || vaos.length < 1 || vaos.length > 6 ||
      !faixa(E, 0.1, 350) || vaos.some(t => !faixa(t.L, 0.1, 100) ||
        !faixa(t.q, -10000, 10000) || !faixa(t.I, 1, 1e9))) {
    throw new RangeError('Confira os limites de comprimentos, cargas e propriedades.');
  }
  const n = vaos.length + 1;
  const diagonal = Array(n).fill(0), ligacao = Array(n - 1).fill(0), termo = Array(n).fill(0);
  const elementos = vaos.map(({ L, q, I }, i) => {
    const EI = E * I * 0.01; // GPa × cm⁴ → kN·m²
    diagonal[i] += 4 * EI / L;
    diagonal[i + 1] += 4 * EI / L;
    ligacao[i] = 2 * EI / L;
    termo[i] -= q * L ** 2 / 12;
    termo[i + 1] += q * L ** 2 / 12;
    return { L, q, EI };
  });
  if (fixoE) { diagonal[0] = 1; termo[0] = 0; ligacao[0] = 0; }
  if (fixoD) { diagonal[n - 1] = 1; termo[n - 1] = 0; ligacao[n - 2] = 0; }
  for (let i = 1; i < n; i++) {
    const fator = ligacao[i - 1] / diagonal[i - 1];
    diagonal[i] -= fator * ligacao[i - 1];
    termo[i] -= fator * termo[i - 1];
  }
  const giros = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    giros[i] = (termo[i] - (i < n - 1 ? ligacao[i] * giros[i + 1] : 0)) / diagonal[i];
  }
  const trechos = elementos.map((t, i) => secao(t, giros[i], giros[i + 1]));
  let posicao = 0;
  const apoios = giros.map((giro, i) => {
    const antes = i ? trechos[i - 1].avaliar(trechos[i - 1].L) : { V: 0, M: 0 };
    const depois = i < n - 1 ? trechos[i].avaliar(0) : { V: 0, M: 0 };
    if (i) posicao += trechos[i - 1].L;
    return { x: posicao, R: depois.V - antes.V, M: antes.M - depois.M, giro };
  });
  return { apoios, trechos };
}
