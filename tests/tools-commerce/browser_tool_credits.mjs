import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const root = new URL('../../', import.meta.url);
const source = await readFile(new URL('assets/js/tool-credits.mjs', root));
const referral = await readFile(new URL('assets/js/tool-referral.mjs', root));
const css = await readFile(new URL('assets/css/tool-credits.css', root));
const firstRef = 'first_______0001';
const secondRef = 'other_______0002';
const firebase = `let listener, user; const auth={authStateReady:async()=>{},currentUser:null};
export const getApps=()=>[]; export const initializeApp=x=>x; export const getAuth=()=>auth; export const initializeAuth=()=>auth; export const browserLocalPersistence={}; export const connectAuthEmulator=()=>{}; export const onAuthStateChanged=(a,fn)=>{listener=fn;fn(user)};
const set=u=>{user=u;auth.currentUser=u;listener?.(u)}; const make=(email,verified=false)=>({uid:'u1',email,emailVerified:verified,reload:async()=>{},getIdToken:async()=> 'token'});
export const signInWithEmailAndPassword=async(a,email)=>{set(make(email,true));return {user}}; export const createUserWithEmailAndPassword=async(a,email)=>{set(make(email,false));return {user}}; export const sendEmailVerification=async()=>{}; export const sendPasswordResetEmail=async()=>{}; export const signOut=async()=>set(null);`;
const pendingPix = {id:'o1',status:'pending',paymentFlow:'pix',qrCode:'pix-code',qrImage:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+7B4n2QAAAABJRU5ErkJggg=='};
const pendingCheckout = {id:'o2',status:'pending',paymentFlow:'checkout',checkoutUrl:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=TEST_ONLY'};
let fixtureMayConfirm = false;
const calls = [], registrations = [], orderRequests = [], attempts = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>fixture</title><link rel="stylesheet" href="/assets/css/tool-credits.css"><body></body>'); }
  if (url.pathname === '/assets/css/tool-credits.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
  if (url.pathname === '/assets/js/tool-credits.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(source); }
  if (url.pathname === '/assets/js/tool-referral.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(referral); }
  if (url.pathname === '/assets/tools-commerce/firebase-auth.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(firebase); }
  if (url.pathname !== '/api/web/tool-credits') { res.statusCode = 404; return res.end(); }
  calls.push(url.searchParams.get('op')); let body = ''; for await (const chunk of req) body += chunk;
  const send = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  if (url.searchParams.get('op') === 'config') return send({enabled:true,firebase:{apiKey:'fake'},tools:['modela-memoria','calculadora-bdi'],
    purchasesEnabled:true,checkoutEnabled:true,sharedExportsEnabled:true,termsVersion:'v2',termsUrl:'/termos-de-uso/#creditos-ferramentas',
    packages:[{id:'one',credits:1,amountCents:1490}]});
  if (url.searchParams.get('op') === 'account') {
    if (req.method === 'POST') registrations.push(JSON.parse(body));
    return send({paid:2,promo:1,freeAvailable:false,referralCode:firstRef,invites:{earned:1,pending:0},recentOrders:[]});
  }
  if (url.searchParams.get('op') === 'orders') {
    const request = JSON.parse(body);
    orderRequests.push(request);
    return send(request.paymentFlow === 'checkout' ? pendingCheckout : pendingPix);
  }
  if (url.searchParams.get('op') === 'order') {
    if (url.searchParams.get('id') === 'o2') return send(pendingCheckout);
    return send(fixtureMayConfirm ? {id:'o1',status:'paid'} : pendingPix);
  }
  if (url.searchParams.get('op') === 'export-local') {
    const request = JSON.parse(body);
    attempts.push(request);
    if (attempts.length === 1) { res.statusCode = 503; return send({ error: 'COMMERCE_UNAVAILABLE' }); }
    return send({ schema: 'confenge.tools.emission/v1', id: 'a'.repeat(64), proof: 'b'.repeat(64),
      toolId: request.toolId, ...request.payload });
  }
  res.statusCode = 400; send({error:'bad'});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome');
const browser = await puppeteer.launch({executablePath, headless:true,args:['--no-sandbox']});
async function openAndSignIn(page, { referral = false, shared = false } = {}) {
  const opened = await page.evaluate(async ({ referral, shared }) => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    const wallet = createToolCredits({ toolId: 'modela-memoria', shared });
    return referral ? wallet.openReferral() : wallet.open();
  }, { referral, shared });
  assert.equal(opened, true);
  assert.equal(await page.$eval('dialog', dialog => dialog.open), true);
  assert.match(await page.$eval('dialog', dialog => dialog.textContent), /primeiro uso completo/i);
  await page.type('input[type=email]', 'a@b.com');
  await page.type('input[type=password]', '123456');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
}

try {
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844});
  await page.goto(`http://127.0.0.1:${port}/?ref=${firstRef}`);
  await page.evaluate(async () => {
    window.events = [];
    window.confengeTrack = (name, properties) => window.events.push([name, properties]);
    const {createToolCredits}=await import('/assets/js/tool-credits.mjs');
    createToolCredits({toolId:'modela-memoria'});
  });
  const firstTouchEvents = await page.evaluate(() => window.events);
  assert.deepEqual(firstTouchEvents, [['tool_referral_visit', {touch_outcome:'accepted', storage_mode:'persistent'}]]);
  await page.goto(`http://127.0.0.1:${port}/?ref=${secondRef}`);
  await page.evaluate(() => {
    window.events = [];
    window.confengeTrack = (name, properties) => window.events.push([name, properties]);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancelled', 'AbortError'); } });
    window.open = destination => {
      if (destination !== 'about:blank') throw new Error('expected a blank popup');
      if (window.blockShare) return null;
      const popup = { opener: window, close() {}, document: {
        body: { append() {} },
        createElement: () => ({ click() {
          window.shareNavigation = { host: new URL(this.href).hostname,
            referrerPolicy: this.referrerPolicy, noOpener: popup.opener === null };
        } }),
      } };
      return popup;
    };
  });
  await openAndSignIn(page, { referral: true });
  assert.match(await page.$eval('dialog', d => d.textContent), /3 créditos disponíveis/);
  await page.waitForFunction(() => document.activeElement?.id === 'tool-credits-referral');
  assert.match(await page.$eval('#tool-credits-referral', node => node.textContent), /primeira exportação paga/i);
  assert.match(await page.$eval('#tool-credits-referral input', node => node.value), /^https:\/\/confenge\.com\.br\/avaliacao-imoveis-urbanos\/inferencia\/\?ref=/);
  assert.equal(registrations[0].referralCode, firstRef);
  assert.ok(await page.$eval('dialog', d => d.getBoundingClientRect().width <= innerWidth));
  const priceButton = await page.$$('button').then(async buttons => { for (const item of buttons) if ((await item.evaluate(n => n.textContent)).includes('R$')) return item; });
  await priceButton.click();
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Confirme que leu os termos'));
  assert.match(await page.$eval('dialog', d => d.textContent), /Confirme que leu os termos/);
  assert.equal(calls.includes('orders'), false);
  const checkbox = await page.$('input[type=checkbox]'); await checkbox.click();
  assert.equal(await checkbox.evaluate(node => node.checked), true, 'the real terms control must be accepted');
  // Stop walking handles before the real click. Continuing through stale
  // buttons afterwards could delay observation of the Pix state on a loaded
  // runner, while the automatic status poll kept advancing.
  const acceptedPriceButton = await page.$$('button').then(async buttons => {
    for (const item of buttons) if ((await item.evaluate(node => node.textContent)).includes('R$')) return item;
  });
  assert.ok(acceptedPriceButton, 'purchase button must remain available after accepting terms');
  await acceptedPriceButton.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'pix-code'); assert.ok(await page.$('img[alt="QR Code Pix"]'));
  assert.equal(orderRequests.length, 1);
  assert.equal(orderRequests[0].packageId, 'one');
  assert.equal(orderRequests[0].termsVersion, 'v2');
  assert.equal(orderRequests[0].paymentFlow, 'pix');
  assert.match(orderRequests[0].requestId, /^[0-9a-f-]{36}$/i);
  const persistedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('confenge-tool-orders-v1:u1'))?.o1);
  assert.equal(persistedOrder.id, 'o1'); assert.equal(persistedOrder.status, 'pending'); assert.ok(Number.isFinite(persistedOrder.at));
  // Release the fixture only after the pending Pix and durable request have
  // been observed. The production polling interval remains unchanged.
  fixtureMayConfirm = true;
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Pagamento confirmado'), { timeout: 15000 });
  assert.ok(calls.includes('orders') && calls.includes('order'));
  assert.equal(await page.evaluate(() => location.search), '', 'ref must be removed from visible URL');

  const clickByText = async text => page.evaluate(async value => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === value);
    if (!button) throw new Error(`button not found: ${value}`);
    await button.onclick();
  }, text);
  await clickByText('Copiar link pessoal');
  await page.evaluate(() => { window.blockShare = true; });
  await clickByText('Compartilhar no LinkedIn');
  await page.evaluate(() => { window.blockShare = false; });
  await clickByText('Compartilhar no WhatsApp');
  assert.deepEqual(await page.evaluate(() => window.shareNavigation), {host:'wa.me', referrerPolicy:'no-referrer', noOpener:true});
  await clickByText('Mais opções de compartilhamento');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await clickByText('Copiar link pessoal');
  const referralEvents = await page.evaluate(() => window.events);
  assert.equal(referralEvents.filter(([name]) => name === 'tool_referral_panel_view').length, 1);
  assert.deepEqual(referralEvents.filter(([name]) => name === 'tool_referral_action').map(([, props]) => [props.share_channel, props.action_outcome]), [
    ['copy', 'success'], ['linkedin', 'blocked'], ['whatsapp', 'success'], ['native', 'cancelled'], ['copy', 'failure']
  ]);
  const serializedEvents = JSON.stringify(referralEvents);
  assert.ok(!serializedEvents.includes(firstRef) && !serializedEvents.includes('a@b.com') && !serializedEvents.includes('confenge.com.br/'));

  const checkoutPage = await browser.newPage();
  await checkoutPage.setViewport({ width: 390, height: 844 });
  await checkoutPage.goto(`http://127.0.0.1:${port}/`);
  await checkoutPage.evaluate(() => {
    window.events = [];
    window.confengeTrack = (name, properties) => window.events.push([name, properties]);
  });
  await openAndSignIn(checkoutPage, { shared: true });
  assert.match(await checkoutPage.$eval('#tool-credits-referral input', node => node.value), /^https:\/\/confenge\.com\.br\/ferramentas\/\?ref=/);
  assert.deepEqual(await checkoutPage.evaluate(() => window.events), [['tool_referral_panel_view', { tool_id: 'shared-wallet', destination_kind: 'catalog' }]]);
  assert.equal(await checkoutPage.$eval('dialog select', select => select.value), 'pix');
  await checkoutPage.select('dialog select', 'checkout');
  await checkoutPage.click('dialog input[type=checkbox]');
  assert.equal(await checkoutPage.$eval('dialog input[type=checkbox]', checkbox => checkbox.checked), true);
  await checkoutPage.click('dialog .tool-credits__packs button');
  await checkoutPage.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Abrir pagamento no Mercado Pago'));
  assert.equal(orderRequests.length, 2);
  assert.equal(orderRequests[1].paymentFlow, 'checkout');
  assert.equal(await checkoutPage.$('img[alt="QR Code Pix"]'), null);
  assert.equal(await checkoutPage.$eval('dialog .tool-credits__close', button => button.disabled), false);
  await checkoutPage.click('dialog .tool-credits__close');
  await checkoutPage.waitForSelector('dialog[open]', { hidden: true });
  await checkoutPage.close();
  await page.evaluate(() => document.querySelector('dialog').close());
  await page.evaluate(async () => {
    window.confirm = () => true;
    const { exportToolResult } = await import('/assets/js/tool-credits.mjs');
    window.delivered = 0;
    await exportToolResult({ toolId: 'calculadora-bdi', format: 'csv', content: 'dado privado',
      deliver: () => { window.delivered++; } });
  });
  assert.equal(await page.evaluate(() => window.delivered), 0);
  await page.evaluate(() => [...document.querySelectorAll('.tool-credits__export-notice button')]
    .find(button => button.textContent === 'Retomar exportação').click());
  await page.waitForFunction(() => window.delivered === 1);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.deepEqual(Object.keys(attempts[0].payload).sort(), ['bytes', 'format', 'sha256']);
  assert.ok(!JSON.stringify(attempts[0]).includes('dado privado'));
  await page.waitForFunction(() => document.querySelector('.tool-credits__export-notice')?.textContent.includes('Baixar comprovante'));

  const gated = await browser.newPage();
  await gated.goto(`http://127.0.0.1:${port}/`);
  const gates = await gated.evaluate(async () => {
    const {createToolCredits}=await import('/assets/js/tool-credits.mjs');
    const response = value => ({ status: 200, ok: true, json: async () => value });
    const disabled = createToolCredits({toolId:'modela-memoria', fetchImpl: async () => response({enabled:false})});
    const paused = createToolCredits({toolId:'modela-memoria', fetchImpl: async () => response({enabled:true, firebase:{apiKey:'fake'}, tools:['modela-memoria'], purchasesEnabled:false})});
    return { disabled: await disabled.openReferral(), paused: await paused.openReferral(), dialogs: document.querySelectorAll('dialog').length };
  });
  assert.deepEqual(gates, {disabled:false, paused:false, dialogs:0});
  await gated.close();

  const malformed = await browser.newPage();
  await malformed.goto(`http://127.0.0.1:${port}/?ref=${firstRef}&ref=${secondRef}`);
  const malformedResult = await malformed.evaluate(async () => {
    window.events = [];
    window.confengeTrack = (name, properties) => window.events.push([name, properties]);
    const {referralFirstTouch}=await import('/assets/js/tool-referral.mjs');
    return {value: referralFirstTouch(), search: location.search, events: window.events};
  });
  assert.deepEqual(malformedResult, {value:firstRef, search:'', events:[]}, 'ambiguous URLs cannot replace the first accepted attribution');
  await malformed.close();

  const early = await browser.newPage();
  await early.goto(`http://127.0.0.1:${port}/`);
  await early.evaluate(() => localStorage.clear());
  await early.goto(`http://127.0.0.1:${port}/?ref=early_______0003`);
  const deferred = await early.evaluate(async () => {
    window.confengeDeferredEvents = [{event:'untrusted', props:{email:'private@example.com'}}];
    const {referralFirstTouch}=await import('/assets/js/tool-referral.mjs');
    referralFirstTouch();
    return window.confengeDeferredEvents;
  });
  assert.deepEqual(deferred, [{event:'tool_referral_visit', props:{touch_outcome:'accepted', storage_mode:'persistent'}}]);
  assert.ok(!JSON.stringify(deferred).includes('early_______0003'));
  const provisionStart = registrations.length;
  await early.evaluate(async () => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    await createToolCredits({ toolId: 'modela-memoria' }).open();
    const afterExpiry = Date.now() + 31 * 864e5;
    Date.now = () => afterExpiry;
    const form = document.querySelector('dialog form');
    form.querySelector('input[type=email]').value = 'expired@example.test';
    form.querySelector('input[type=password]').value = '123456';
    form.requestSubmit();
  });
  await early.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
  const afterExpiry = registrations.slice(provisionStart);
  assert.ok(afterExpiry.length && afterExpiry.every(request => !('referralCode' in request)));
  await early.close();
  console.log('browser tool credits: ok');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
