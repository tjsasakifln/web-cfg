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
let calls = [], registrations = [], attempts = [];
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
    if (JSON.parse(body).paymentFlow === 'checkout') return send({ id:'o2', status:'pending', paymentFlow:'checkout',
      checkoutUrl:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=TEST_ONLY' });
    return send({id:'o1',status:'pending',paymentFlow:'pix',qrCode:'pix-code',qrImage:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+7B4n2QAAAABJRU5ErkJggg=='});
  }
  if (url.searchParams.get('op') === 'order') return send({ id: url.searchParams.get('id'), status: 'paid' });
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
try {
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844});
  await page.goto(`http://127.0.0.1:${port}/?ref=${firstRef}`);
  await page.evaluate(async () => { const {createToolCredits}=await import('/assets/js/tool-credits.mjs'); createToolCredits({toolId:'modela-memoria'}); });
  await page.goto(`http://127.0.0.1:${port}/?ref=${secondRef}`);
  await page.evaluate(async () => { const {createToolCredits}=await import('/assets/js/tool-credits.mjs'); window.credits=createToolCredits({toolId:'modela-memoria'}); await window.credits.open(); });
  assert.equal(await page.$eval('dialog', d => d.open), true); assert.match(await page.$eval('dialog', d => d.textContent), /primeiro uso completo/i);
  await page.type('input[type=email]', 'a@b.com'); await page.type('input[type=password]', '123456'); await page.click('button[type=submit]');
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
  assert.match(await page.$eval('dialog', d => d.textContent), /3 créditos disponíveis/);
  assert.equal(registrations[0].referralCode, firstRef);
  assert.ok(await page.$eval('dialog', d => d.getBoundingClientRect().width <= innerWidth));
  const priceButton = await page.$$('button').then(async buttons => { for (const item of buttons) if ((await item.evaluate(n => n.textContent)).includes('R$')) return item; });
  await priceButton.click();
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Confirme que leu os termos'));
  assert.match(await page.$eval('dialog', d => d.textContent), /Confirme que leu os termos/);
  assert.equal(calls.includes('orders'), false);
  const checkbox = await page.$('input[type=checkbox]'); await checkbox.click(); const buttons = await page.$$('button'); for (const b of buttons) if ((await b.evaluate(n=>n.textContent)).includes('R$')) await b.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'pix-code'); assert.ok(await page.$('img[alt="QR Code Pix"]'));
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Pagamento confirmado'), { timeout: 15000 });
  assert.ok(calls.includes('orders') && calls.includes('order'));
  assert.equal(await page.evaluate(() => location.search), '', 'ref must be removed from visible URL');
  assert.equal(await page.$eval('dialog select', select => select.value), 'pix');
  await page.select('dialog select', 'checkout');
  await page.click('dialog input[type=checkbox]');
  assert.equal(await page.$eval('dialog input[type=checkbox]', checkbox => checkbox.checked), true);
  await page.click('dialog .tool-credits__packs button');
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Abrir pagamento no Mercado Pago'));
  assert.equal(await page.$('img[alt="QR Code Pix"]'), null);
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
  console.log('browser tool credits: ok');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
