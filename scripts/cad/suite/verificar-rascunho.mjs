import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const url = new URL('/cad/aplicativos/', process.argv[2] || 'http://127.0.0.1:8765');
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH, args:['--no-sandbox']});
try {
  const page = await browser.newPage();
  const model = '#suite-modelo:not([disabled])';
  const engine = '#suite-calculos [data-engine]';
  const type = async text => page.$eval(model, (field, value) => {
    field.value = value;
    field.dispatchEvent(new Event('input', {bubbles:true}));
  }, text);
  const guarded = () => page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', {cancelable:true})));
  await page.goto(url.href);
  await page.$eval('#suite-calculos [aria-controls="suite-painel-calculo"]', button => button.click());
  await page.waitForSelector(model);
  assert.equal(await guarded(), false);
  await type('rascunho sintético de cronograma');
  await page.select(engine, 'network');
  await page.waitForSelector(model);
  await type('rascunho sintético de rede');
  await page.waitForFunction(() => document.querySelector('#suite-calculos [data-draft-status]').textContent.includes('atualizado'));
  await page.reload();
  await page.waitForSelector(model);
  assert.equal(await page.$eval(engine, field => field.value), 'network');
  assert.equal(await page.$eval(model, field => field.value), 'rascunho sintético de rede');
  await page.select(engine, 'schedule');
  await page.waitForSelector(model);
  assert.equal(await page.$eval(model, field => field.value), 'rascunho sintético de cronograma');
  assert.equal(await guarded(), false, 'O rascunho salvo deve permitir recarregar.');
  page.on('dialog', dialog => dialog.accept());
  await page.$eval('#suite-calculos [data-draft-clear]', button => button.click());
  await page.reload();
  assert.equal(await page.$eval('#suite-painel-calculo', panel => panel.hidden), true);
  console.log('CAD: modelos de dois motores recuperados e limpeza da aba confirmada.');
} finally {
  await browser.close();
}
