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
  for (const width of [360, 390]) {
    await page.setViewport({width, height: 844, isMobile: true, hasTouch: true});
    for (const id of ['sample-file', 'project-file']) {
      const size = await page.$eval('#' + id, el => {
        const {width, height} = el.getBoundingClientRect();
        return [width, height];
      });
      assert(size.every(side => side >= 44), id + ' sem área de toque de 44 px em ' + width);
    }
  }
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
    // NBR 14653-2 Anexo A.5: a two-valued variable cannot be interpolated or extrapolated.
    const dummyCsv = Array.from({length: 24}, (_, i) => {
      const area = 45 + i * 7 % 61;
      const piscina = i % 2;
      const preco = 100000 + 4200 * area + 30000 * piscina + ((i * 17 + 3) % 13 - 6) * 1100;
      return [area, piscina, preco].join(';');
    }).join('\n');
    const dummyRows = (await engine.readFile(new File(['area;piscina;preco\n' + dummyCsv], 'dicotomica.csv'))).rows;
    const dummyItem4 = async piscina => (await engine.calculate({
      rows: dummyRows, features: ['area','piscina'], target: 'preco', subject: {area:75, piscina}, unit:'BRL',
    })).items.find(i => i.item === 4).grade;
    return {n:result.n, point:result.point, ci:result.meanCI, pi:result.predictionInterval,
      docs:result.items.filter(i=>[1,3].includes(i.item)).map(i=>i.grade), residuals:result.residuals.length,
      dummy:[await dummyItem4(0.5), await dummyItem4(2), await dummyItem4(1)]};
  });
  assert.equal(results.n, 24);
  assert.equal(results.residuals, 24);
  assert.deepEqual(results.docs, [null,null]);
  assert.deepEqual(results.dummy, [0, 0, 3], 'Anexo A.5: dicotômica 0,5 e 2 não admitidas; 1 dentro da amostra');
  for (const [actual,expected] of [
    [results.point,438646.54], [results.ci[0],437482.83], [results.ci[1],439810.25],
    [results.pi[0],432914.90], [results.pi[1],444378.19],
  ]) assert.ok(Math.abs(actual-expected)<0.005, JSON.stringify({actual, expected}));
  console.log('Modela Pro: regressão, limites, resíduos e pendências documentais verificados no navegador.');
} finally {
  await browser.close();
}
