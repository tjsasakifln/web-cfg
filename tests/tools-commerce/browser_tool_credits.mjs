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
const pendingPix = {id:'o1',status:'pending',qrCode:'pix-code',qrImage:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+7B4n2QAAAABJRU5ErkJggg=='};
let fixtureMayConfirm = false, calls = [], registrations = [], orderRequests = [];
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
  if (url.searchParams.get('op') === 'config') return send({enabled:true,firebase:{apiKey:'fake'},tools:['modela-memoria'],purchasesEnabled:true,termsVersion:'v1',termsUrl:'/termos-de-uso/#creditos-ferramentas',packages:[{id:'one',credits:1,amountCents:1490}]});
  if (url.searchParams.get('op') === 'account') {
    if (req.method === 'POST') registrations.push(JSON.parse(body));
    return send({paid:2,promo:1,freeAvailable:false,referralCode:firstRef,invites:{earned:1,pending:0},recentOrders:[]});
  }
  if (url.searchParams.get('op') === 'orders') { orderRequests.push(JSON.parse(body)); return send(pendingPix); }
  if (url.searchParams.get('op') === 'order') return send(fixtureMayConfirm ? {id:'o1',status:'paid'} : pendingPix);
  res.statusCode = 400; send({error:'bad'});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome');
const browser = await puppeteer.launch({executablePath, headless:true,args:['--no-sandbox']});
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
  await page.evaluate(async () => {
    window.events = [];
    window.confengeTrack = (name, properties) => window.events.push([name, properties]);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancelled', 'AbortError'); } });
    window.open = destination => new URL(destination).hostname === 'www.linkedin.com' ? null : {};
    const {createToolCredits}=await import('/assets/js/tool-credits.mjs');
    window.credits=createToolCredits({toolId:'modela-memoria'});
    window.referralOpened = await window.credits.openReferral();
  });
  assert.equal(await page.evaluate(() => window.referralOpened), true);
  assert.equal(await page.$eval('dialog', d => d.open), true); assert.match(await page.$eval('dialog', d => d.textContent), /primeiro uso completo/i);
  await page.type('input[type=email]', 'a@b.com'); await page.type('input[type=password]', '123456'); await page.click('button[type=submit]');
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
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
  assert.equal(orderRequests[0].termsVersion, 'v1');
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
  await clickByText('Compartilhar no LinkedIn');
  await clickByText('Compartilhar no WhatsApp');
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
  await early.close();
  console.log('browser tool credits: ok');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
