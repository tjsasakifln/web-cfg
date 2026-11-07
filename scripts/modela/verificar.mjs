// Exercise the same browser entrypoint the public page uses, with no real cases.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'https://confenge.com.br';
const route = new URL('/avaliacao-imoveis-urbanos/inferencia/', base);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.goto(route.href, {waitUntil: 'domcontentloaded'});
  const results = await page.evaluate(async () => {
    const engine = await import('./engine/client.mjs');
    const csv = Array.from({length: 24}, (_, i) => {
      const area = 45 + i * 7 % 61;
      const vagas = i % 3;
      const preco = 100000 + 4200 * area + 24000 * vagas + ((i * 17 + 3) % 13 - 6) * 1100;
      return [area, vagas, preco].join(';');
    }).join('\n');
    const file = new File(['area;vagas;preco\n' + csv], 'amostra.csv');
    const {rows} = await engine.readFile(file);
    const result = await engine.calculate({
      rows, features: ['area','vagas'], target: 'preco', subject: {area:75, vagas:1}, unit:'BRL',
    });
    return {n:result.n, point:result.point, ci:result.meanCI, pi:result.predictionInterval,
      docs:result.items.filter(i=>[1,3].includes(i.item)).map(i=>i.grade), residuals:result.residuals.length};
  });
  assert.equal(results.n, 24);
  assert.equal(results.residuals, 24);
  assert.deepEqual(results.docs, [null,null]);
  for (const [actual,expected] of [
    [results.point,438646.54], [results.ci[0],437482.83], [results.ci[1],439810.25],
    [results.pi[0],432914.90], [results.pi[1],444378.19],
  ]) assert.ok(Math.abs(actual-expected)<0.005, JSON.stringify({actual, expected}));
  console.log('Modela Pro: regressão, limites, resíduos e pendências documentais verificados no navegador.');
} finally {
  await browser.close();
}
