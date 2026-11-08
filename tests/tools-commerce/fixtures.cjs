const payload = {
  exemplo_ficticio: true,
  parametros: { target: 'Preço', features: ['Área'], subject: { 'Área': 95 }, unit: 'BRL', targetScale: 'identity', logFeatures: [] },
  resultado: { point: 380000, n: 3, k: 1, unit: 'BRL', targetScale: 'identity', r2: 0.98,
    coefficients: [{ name: 'const', value: 1000, p: null }, { name: 'Área', value: 3990, p: 0.02 }],
    usedRows: ['1', '2', '3'], excludedRows: [], residuals: ['1', '2', '3'].map((id, i) =>
      ({ id, observed: 380000 + i * 1000, predicted: 379000 + i * 1000, residual: 1000, cook: 0.001, leverage: null })) },
};
module.exports = { payload };
