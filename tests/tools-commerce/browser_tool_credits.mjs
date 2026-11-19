import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { PUPPETEER_REVISIONS } from 'puppeteer-core';

const root = new URL('../../', import.meta.url);
const source = await readFile(new URL('assets/js/tool-credits.mjs', root));
const referral = await readFile(new URL('assets/js/tool-referral.mjs', root));
const css = await readFile(new URL('assets/css/tool-credits.css', root));
const firstRef = 'first_______0001';
const secondRef = 'other_______0002';
const fixtureEmail = 'wallet-browser-fixture@example.test';
// A fresh high-entropy fixture secret prevents Chrome's compromised-password
// UI from intercepting the browser-trusted purchase click under test.
const fixturePassword = `${randomBytes(24).toString('base64url')}Aa1!`;
const firebase = `let listener, user; const auth={authStateReady:async()=>{},currentUser:null};
export const getApps=()=>[]; export const initializeApp=x=>x; export const getAuth=()=>auth; export const initializeAuth=()=>auth; export const browserLocalPersistence={}; export const browserPopupRedirectResolver={}; export const connectAuthEmulator=()=>{}; export const onAuthStateChanged=(a,fn)=>{listener=fn;fn(user)};
const set=u=>{user=u;auth.currentUser=u;listener?.(u)}; const make=(email,verified=false,providerId='password')=>({uid:'u1',email,emailVerified:verified,providerData:[{providerId}],reload:async()=>{},getIdToken:async()=> 'token'});
class Provider { constructor(providerId){this.providerId=providerId} } export class GoogleAuthProvider extends Provider { constructor(){super('google.com')} } export class FacebookAuthProvider extends Provider { constructor(){super('facebook.com')} } export class GithubAuthProvider extends Provider { constructor(){super('github.com')} } export class TwitterAuthProvider extends Provider { constructor(){super('twitter.com')} } export class OAuthProvider extends Provider {};
export const signInWithEmailAndPassword=async(a,email)=>{set(make(email,true));return {user}}; export const createUserWithEmailAndPassword=async(a,email)=>{set(make(email,false));return {user}}; export const signInWithPopup=async(a,provider,resolver)=>{if(resolver!==browserPopupRedirectResolver)throw new Error('popup resolver missing');globalThis.popupResolverSeen=true;set(make('social@example.test',true,provider.providerId));return {user}}; export const sendEmailVerification=async()=>{}; export const sendPasswordResetEmail=async()=>{}; export const signOut=async()=>set(null);`;
const pendingPix = {id:'o1',status:'pending',paymentFlow:'pix',qrCode:'pix-code',qrImage:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+7B4n2QAAAABJRU5ErkJggg=='};
const pendingCheckout = {id:'o2',status:'pending',paymentFlow:'checkout',checkoutUrl:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=TEST_ONLY'};
let fixtureMayConfirm = false;
const fixtureRejectsOrder = process.env.TOOL_CREDITS_FIXTURE_REJECT_ORDER === '1';
const calls = [], registrations = [], orderRequests = [], attempts = [];
const sharedEnabledConfig = {enabled:true,firebase:{apiKey:'fake'},tools:['modela-memoria','calculadora-bdi'],
  purchasesEnabled:true,checkoutEnabled:true,sharedExportsEnabled:true,termsVersion:'v2',termsUrl:'/termos-de-uso/#creditos-ferramentas',
  authProviders:['google.com','linkedin.com','invalid.example'], packages:[{id:'one',credits:1,amountCents:1490}]};
let toolCreditsConfig = sharedEnabledConfig;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { if (url.searchParams.has('isolated')) { res.setHeader('cross-origin-opener-policy', 'same-origin'); res.setHeader('cross-origin-embedder-policy', 'require-corp'); } res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>fixture</title><link rel="stylesheet" href="/assets/css/tool-credits.css"><body></body>'); }
  if (url.pathname === '/assets/css/tool-credits.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
  if (url.pathname === '/assets/js/tool-credits.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(source); }
  if (url.pathname === '/assets/js/tool-referral.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(referral); }
  if (url.pathname === '/assets/tools-commerce/firebase-auth.mjs') { res.setHeader('content-type', 'text/javascript'); return res.end(firebase); }
  if (url.pathname !== '/api/web/tool-credits') { res.statusCode = 404; return res.end(); }
  calls.push(url.searchParams.get('op')); let body = ''; for await (const chunk of req) body += chunk;
  const send = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  if (url.searchParams.get('op') === 'config') return send(toolCreditsConfig);
  if (url.searchParams.get('op') === 'account') {
    if (req.method === 'POST') registrations.push(JSON.parse(body));
    return send({paid:2,promo:1,freeAvailable:false,referralCode:firstRef,invites:{earned:1,pending:0},recentOrders:[]});
  }
  if (url.searchParams.get('op') === 'orders') {
    const request = JSON.parse(body);
    orderRequests.push(request);
    if (fixtureRejectsOrder) { res.statusCode = 503; return send({error:'FIXTURE_ORDER_REJECTED'}); }
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
const expectedChromeVersion = process.env.TOOL_CREDITS_EXPECTED_CHROME_VERSION || '';
const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome');
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  if (expectedChromeVersion) {
    assert.equal(expectedChromeVersion, PUPPETEER_REVISIONS.chrome,
      'TOOL_CREDITS_EXPECTED_CHROME_VERSION must equal Puppeteer locked Chrome');
    const actualChromeVersion = (await browser.version()).replace(/^[^/]+\//, '');
    assert.equal(actualChromeVersion, expectedChromeVersion, 'browser must match Puppeteer locked Chrome exactly');
  }
  let physicalClickSequence = 0;
  const inputReportDir = fileURLToPath(new URL('build/reports/', root));

async function recordPrimaryInputFailure(page, selector, label, error) {
  if (label.startsWith('obstructed ') || error?.walletInputDiagnosticWritten) return;
  error.walletInputDiagnosticWritten = true;
  try {
    const browserState = await page.evaluate(selector => {
      const target = document.querySelector(selector);
      const rect = target?.getBoundingClientRect();
      const center = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const hit = center && document.elementFromPoint(center.x, center.y);
      const identify = node => node && {
        tag: node.tagName,
        id: node.id || '',
        className: String(node.className || ''),
      };
      return {
        visibilityState: document.visibilityState,
        documentFocus: document.hasFocus(),
        activeElement: identify(document.activeElement),
        target: target && {
          ...identify(target),
          connected: target.isConnected,
          disabled: Boolean(target.disabled),
          rect: rect?.toJSON?.() || null,
        },
        centerTarget: identify(hit),
        centerInsideTarget: Boolean(target && hit && target.contains(hit)),
      };
    }, selector).catch(browserError => ({ collectionError: String(browserError?.message || browserError) }));
    const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const diagnostic = {
      schema: 'confenge.wallet-input-diagnostic/v1',
      label,
      selector,
      error: { name: error?.name || 'Error', message: String(error?.message || error) },
      browserState,
      action: error?.browserDiagnostic || null,
      fixture: { calls: [...calls], orderRequestCount: orderRequests.length },
    };
    const jsonPath = join(inputReportDir, `wallet-input-${slug}.json`);
    const screenshotPath = join(inputReportDir, `wallet-input-${slug}.png`);
    await mkdir(inputReportDir, { recursive: true });
    await writeFile(jsonPath, JSON.stringify(diagnostic, null, 2));
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    // The workflow can fail before artifacts are uploaded, so the bounded,
    // metadata-only diagnostic must also remain available in the job log.
    console.error('wallet input diagnostic', JSON.stringify({ ...diagnostic, jsonPath, screenshotPath }));
  } catch (diagnosticError) {
    console.error('wallet input diagnostic collection failed', JSON.stringify({
      label,
      primaryError: String(error?.message || error),
      diagnosticError: String(diagnosticError?.message || diagnosticError),
    }));
  }
}

// "Trusted" here means Chrome generated the events from page-scoped CDP
// input. It proves real browser dispatch, not a physical human mouse.
async function prepareTrustedPhysicalClick(page, selector, label) {
  const traceKey = `${label}-${++physicalClickSequence}`;
  try {
    return await page.evaluate(async ({ selector, label, traceKey }) => {
      if (document.visibilityState !== 'visible') throw new Error(`${label}: page is not visible`);
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) throw new Error(`${label}: live target is absent`);
      if (!target.isConnected) throw new Error(`${label}: live target is disconnected`);
      if ('disabled' in target && target.disabled) throw new Error(`${label}: live target is disabled`);
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const snapshot = () => {
        const rect = target.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      await new Promise(resolve => requestAnimationFrame(resolve));
      const first = snapshot();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const second = snapshot();
      if (first.x !== second.x || first.y !== second.y || first.width !== second.width || first.height !== second.height) {
        throw new Error(`${label}: target geometry is not stable: ${JSON.stringify({ first, second })}`);
      }
      if (!(second.width > 0 && second.height > 0)) {
        throw new Error(`${label}: target has no positive geometry: ${JSON.stringify(second)}`);
      }
      const center = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
      if (!(center.x >= 0 && center.x < innerWidth && center.y >= 0 && center.y < innerHeight)) {
        throw new Error(`${label}: target center is outside the viewport: ${JSON.stringify({ center, width: innerWidth, height: innerHeight })}`);
      }
      const hit = document.elementFromPoint(center.x, center.y);
      if (!hit || !target.contains(hit)) {
        throw new Error(`${label}: target center is obstructed: ${JSON.stringify({ center, hit: hit && { tag: hit.tagName, id: hit.id, className: hit.className } })}`);
      }
      const state = {
        target, selector, trace: [], rawTrace: [], mutations: [], timeline: [], listener: null,
        focusListener: null, visibilityListener: null, observer: null,
      };
      const primaryTypes = new Set(['pointerdown', 'pointerup', 'click']);
      const observedTypes = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click',
        'gotpointercapture', 'lostpointercapture'];
      const identify = node => node && { tag: node.tagName, id: node.id || '', className: String(node.className || '') };
      const mark = (phase, extra = {}) => {
        if (state.timeline.length < 24) state.timeline.push({ phase, at: performance.now(), ...extra });
      };
      mark('prepared', { focus: document.hasFocus(), visibility: document.visibilityState });
      state.listener = event => {
        const current = document.querySelector(state.selector);
        if (state.rawTrace.length < 24) state.rawTrace.push({
          type: event.type,
          at: performance.now(),
          isTrusted: event.isTrusted,
          target: identify(event.target),
          clientX: event.clientX,
          clientY: event.clientY,
          visibility: document.visibilityState,
          focus: document.hasFocus(),
          storedConnected: state.target.isConnected,
          currentIsStored: current === state.target,
          eventInsideStored: state.target.contains(event.target),
        });
        if (!primaryTypes.has(event.type)) return;
        if (!state.target.contains(event.target)) return;
        state.trace.push({
          type: event.type,
          isTrusted: event.isTrusted,
          target: event.target.tagName,
          connected: state.target.isConnected,
          disabled: Boolean(state.target.disabled),
        });
      };
      for (const type of observedTypes) document.addEventListener(type, state.listener, true);
      state.observedTypes = observedTypes;
      state.focusListener = event => mark(`window-${event.type}`, {
        focus: document.hasFocus(), visibility: document.visibilityState,
      });
      state.visibilityListener = () => mark('document-visibilitychange', {
        focus: document.hasFocus(), visibility: document.visibilityState,
      });
      for (const type of ['focus', 'blur']) window.addEventListener(type, state.focusListener, true);
      document.addEventListener('visibilitychange', state.visibilityListener, true);
      state.observer = new MutationObserver(records => {
        const current = document.querySelector(state.selector);
        for (const record of records) {
          if (state.mutations.length >= 48) break;
          state.mutations.push({
            at: performance.now(),
            type: record.type,
            attributeName: record.attributeName || null,
            added: record.addedNodes?.length || 0,
            removed: record.removedNodes?.length || 0,
            storedConnected: state.target.isConnected,
            currentIsStored: current === state.target,
          });
        }
      });
      state.observer.observe(document.querySelector('dialog') || document.body, {
        subtree: true, childList: true, attributes: true,
      });
      window.__toolCreditsPhysicalClicks ||= Object.create(null);
      window.__toolCreditsPhysicalClicks[traceKey] = state;
      return { selector, label, traceKey, rect: second, focusAtPrepare: document.hasFocus() };
    }, { selector, label, traceKey });
  } catch (error) {
    await recordPrimaryInputFailure(page, selector, label, error);
    throw error;
  }
}

async function trustedPhysicalClick(page, prepared) {
  const snapshotTrace = () => page.evaluate(traceKey => {
    const state = window.__toolCreditsPhysicalClicks?.[traceKey];
    if (!state) return { trace: [], rawTrace: [], mutations: [], timeline: [], stateMissing: true };
    const current = document.querySelector(state.selector);
    return {
      trace: [...state.trace], rawTrace: [...state.rawTrace], mutations: [...state.mutations], timeline: [...state.timeline],
      storedConnected: state.target.isConnected, currentIsStored: current === state.target,
    };
  }, prepared.traceKey);
  const clearTrace = () => page.evaluate(traceKey => {
    const state = window.__toolCreditsPhysicalClicks?.[traceKey];
    if (!state) return { trace: [], rawTrace: [], mutations: [], timeline: [], stateMissing: true };
    for (const type of state.observedTypes || ['pointerdown', 'pointerup', 'click']) {
      document.removeEventListener(type, state.listener, true);
    }
    for (const type of ['focus', 'blur']) window.removeEventListener(type, state.focusListener, true);
    document.removeEventListener('visibilitychange', state.visibilityListener, true);
    state.observer?.disconnect();
    const current = document.querySelector(state.selector);
    state.timeline.push({ phase: 'cleared', at: performance.now(), focus: document.hasFocus(),
      visibility: document.visibilityState, storedConnected: state.target.isConnected, currentIsStored: current === state.target });
    delete window.__toolCreditsPhysicalClicks[traceKey];
    return { trace: state.trace, rawTrace: state.rawTrace, mutations: state.mutations, timeline: state.timeline,
      storedConnected: state.target.isConnected, currentIsStored: current === state.target };
  }, prepared.traceKey);
  let center;
  try {
    center = await page.evaluate(prepared => {
      if (document.visibilityState !== 'visible') throw new Error(`${prepared.label}: page lost visibility before action`);
      const state = window.__toolCreditsPhysicalClicks?.[prepared.traceKey];
      const target = document.querySelector(prepared.selector);
      if (!state || target !== state.target) throw new Error(`${prepared.label}: live target identity changed before action`);
      if (!target.isConnected) throw new Error(`${prepared.label}: live target disconnected before action`);
      if ('disabled' in target && target.disabled) throw new Error(`${prepared.label}: live target disabled before action`);
      state.timeline.push({ phase: 'action-check', at: performance.now(), focus: document.hasFocus(), visibility: document.visibilityState });
      const rect = target.getBoundingClientRect();
      const current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const prior = prepared.rect;
      if (current.x !== prior.x || current.y !== prior.y || current.width !== prior.width || current.height !== prior.height) {
        throw new Error(`${prepared.label}: target geometry changed before action: ${JSON.stringify({ prior, current })}`);
      }
      const point = { x: current.x + current.width / 2, y: current.y + current.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hit || !target.contains(hit)) throw new Error(`${prepared.label}: target center became obstructed before action`);
      return point;
    }, prepared);
    // Puppeteer's click helper batches move/down/up. Move separately so the
    // press remains sequential and the live target is revalidated first.
    await page.mouse.move(center.x, center.y);
    await page.evaluate(traceKey => {
      const state = window.__toolCreditsPhysicalClicks?.[traceKey];
      state?.timeline.push({ phase: 'pointer-moved', at: performance.now(), focus: document.hasFocus(),
        visibility: document.visibilityState });
    }, prepared.traceKey);
    await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus());
    center = await page.evaluate(prepared => {
      const state = window.__toolCreditsPhysicalClicks?.[prepared.traceKey];
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        throw new Error(`${prepared.label}: page lost native readiness before press`);
      }
      const target = document.querySelector(prepared.selector);
      if (!state || target !== state.target) throw new Error(`${prepared.label}: live target identity changed before press`);
      if (!target.isConnected) throw new Error(`${prepared.label}: live target disconnected before press`);
      if ('disabled' in target && target.disabled) throw new Error(`${prepared.label}: live target disabled before press`);
      const rect = target.getBoundingClientRect();
      const current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const prior = prepared.rect;
      if (current.x !== prior.x || current.y !== prior.y || current.width !== prior.width || current.height !== prior.height) {
        throw new Error(`${prepared.label}: target geometry changed before press: ${JSON.stringify({ prior, current })}`);
      }
      const point = { x: current.x + current.width / 2, y: current.y + current.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hit || !target.contains(hit)) {
        throw new Error(`${prepared.label}: target center became obstructed before press`);
      }
      state.timeline.push({ phase: 'ready-to-press', at: performance.now(), focus: document.hasFocus(),
        visibility: document.visibilityState, storedConnected: state.target.isConnected, currentIsStored: target === state.target });
      return point;
    }, prepared);
  } catch (error) {
    const cleared = await clearTrace().catch(clearError => ({ clearError: String(clearError?.message || clearError) }));
    error.browserDiagnostic = cleared;
    await recordPrimaryInputFailure(page, prepared.selector, prepared.label, error);
    throw error;
  }
  let clickError;
  try {
    await page.mouse.down();
    await page.mouse.up();
  }
  catch (error) { clickError = error; }
  const immediate = await snapshotTrace();
  let delayed = null;
  if (immediate.trace.length === 0) {
    // Diagnostic only: the assertion remains on the immediate snapshot. Keep
    // listeners briefly to distinguish late renderer delivery from no input.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
    delayed = await snapshotTrace();
  }
  const final = await clearTrace();
  const diagnostic = { ...final, immediate, delayed };
  if (clickError) {
    clickError.browserDiagnostic = diagnostic;
    await recordPrimaryInputFailure(page, prepared.selector, prepared.label, clickError);
    throw clickError;
  }
  try {
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      assert.equal(immediate.trace.filter(event => event.type === type).length, 1,
        `${prepared.label}: expected one immediate trusted ${type}: ${JSON.stringify(immediate.trace)}`);
    }
    assert.ok(immediate.trace.every(event => event.isTrusted),
      `${prepared.label}: physical input must be browser-trusted: ${JSON.stringify(immediate.trace)}`);
  } catch (error) {
    error.browserDiagnostic = diagnostic;
    await recordPrimaryInputFailure(page, prepared.selector, prepared.label, error);
    throw error;
  }
  return immediate.trace;
}

// Auxiliary flow controls use synthetic DOM activation after a visible center
// hit-test. The primary Pix purchase proof does not use this helper:
// it requires one browser-trusted physical pointer sequence.
async function activateVisibleControl(page, selector) {
  const control = await page.waitForSelector(selector, { visible: true });
  await control.evaluate(async (node, selector) => {
    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (node.disabled || !node.contains(hit)) throw new Error('Control cannot be reached: ' + selector);
    // Preserve the upstream functional-flow coverage without presenting this
    // synthetic activation as proof of trusted pointer input.
    node.click();
  }, selector);
}

async function openAndSignIn(page, { referral = false, shared = false } = {}) {
  const opened = await page.evaluate(async ({ referral, shared }) => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    const wallet = createToolCredits({ toolId: 'modela-memoria', shared });
    return referral ? wallet.openReferral() : wallet.open();
  }, { referral, shared });
  assert.equal(opened, true);
  assert.equal(await page.$eval('dialog', dialog => dialog.open), true);
  assert.match(await page.$eval('dialog', dialog => dialog.textContent), /primeiro uso completo/i);
  await page.type('input[type=email]', fixtureEmail);
  await page.type('input[type=password]', fixturePassword);
  await activateVisibleControl(page, 'dialog button[type=submit]');
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
}

  const initialPages = await browser.pages();
  assert.equal(initialPages.length, 1, 'the primary journey must reuse the sole launch page');
  const [page] = initialPages;
  const cpuThrottleRate = Number(process.env.TOOL_CREDITS_CPU_THROTTLE_RATE || 1);
  assert.ok(Number.isFinite(cpuThrottleRate) && cpuThrottleRate >= 1 && cpuThrottleRate <= 20,
    'TOOL_CREDITS_CPU_THROTTLE_RATE must be from 1 to 20');
  if (cpuThrottleRate > 1) await page.emulateCPUThrottling(cpuThrottleRate);
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
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus());
  const socialPage = await browser.newPage();
  await socialPage.setViewport({width:390,height:844});
  await socialPage.goto(`http://127.0.0.1:${port}/?social=1`);
  const socialOpened = await socialPage.evaluate(async () => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    return createToolCredits({ toolId: 'modela-memoria' }).open();
  });
  assert.equal(socialOpened, true);
  assert.deepEqual(await socialPage.$$eval('dialog[open] .tool-credits__provider', nodes => nodes.map(node => node.textContent)),
    ['Continuar com Google', 'Continuar com LinkedIn']);
  assert.equal(await socialPage.$('dialog[open] .tool-credits__provider--invalid'), null);
  await activateVisibleControl(socialPage, 'dialog[open] .tool-credits__provider--google');
  await socialPage.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Créditos de exportação'));
  assert.equal(await socialPage.evaluate(() => globalThis.popupResolverSeen), true);
  await socialPage.close();
  const isolatedPage = await browser.newPage();
  await isolatedPage.setViewport({width:390,height:844});
  await isolatedPage.goto(`http://127.0.0.1:${port}/?isolated=1`);
  assert.equal(await isolatedPage.evaluate(() => globalThis.crossOriginIsolated), true);
  const isolatedOpened = await isolatedPage.evaluate(async () => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    return createToolCredits({ toolId: 'modela-memoria' }).open();
  });
  assert.equal(isolatedOpened, true);
  assert.deepEqual(await isolatedPage.$eval('dialog[open] .tool-credits__central-wallet', link => ({
    href: link.getAttribute('href'), target: link.target, rel: link.rel,
  })), { href: '/ferramentas/#meus-creditos', target: '_blank', rel: 'noopener' });
  assert.equal(await isolatedPage.$('dialog[open] .tool-credits__provider'), null);
  await isolatedPage.close();
  await openAndSignIn(page, { referral: true });
  assert.match(await page.$eval('dialog', d => d.textContent), /3 créditos disponíveis/);
  await page.waitForFunction(() => document.activeElement?.id === 'tool-credits-referral');
  assert.match(await page.$eval('#tool-credits-referral', node => node.textContent), /primeira exportação paga/i);
  assert.match(await page.$eval('#tool-credits-referral input', node => node.value), /^https:\/\/confenge\.com\.br\/avaliacao-imoveis-urbanos\/inferencia\/\?ref=/);
  assert.equal(registrations.find(record => record.referralCode === firstRef)?.referralCode, firstRef);
  assert.ok(await page.$eval('dialog', d => d.getBoundingClientRect().width <= innerWidth));
  // Focus is only a pre-press readiness condition. Delivery is still proved
  // by one trusted pointer sequence on this exact live target, never by focus.
  await trustedPhysicalClick(page, await prepareTrustedPhysicalClick(
    page, 'dialog .tool-credits__packs button', 'unaccepted purchase',
  ));
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Confirme que leu os termos'));
  assert.match(await page.$eval('dialog', d => d.textContent), /Confirme que leu os termos/);
  assert.equal(calls.includes('orders'), false);
  const termsBeforeClick = await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const checkbox = dialog?.querySelector('input[type=checkbox]');
    if (!checkbox) throw new Error('terms control is absent before the real click');
    window.termsClickTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'click']) dialog.addEventListener(type, event => {
      if (!event.target?.matches('input[type=checkbox]')) return;
      window.termsClickTrace.push({ type, target: event.target.tagName, checked: event.target.checked, connected: event.target.isConnected });
    });
    const rect = checkbox.getBoundingClientRect();
    return { checked: checkbox.checked, connected: checkbox.isConnected, width: rect.width, height: rect.height };
  });
  assert.equal(termsBeforeClick.checked, false);
  assert.equal(termsBeforeClick.connected, true);
  assert.ok(termsBeforeClick.width > 0 && termsBeforeClick.height > 0, 'terms control must have a clickable geometry');
  // The same trusted pointer path rejects a moving or covered checkbox.
  await trustedPhysicalClick(page, await prepareTrustedPhysicalClick(page, 'dialog input[type=checkbox]', 'terms consent'));
  try {
    await page.waitForFunction(() => document.querySelector('dialog input[type=checkbox]')?.checked === true, { timeout: 5000 });
  } catch (error) {
    const trace = await page.evaluate(() => ({
      trace: window.termsClickTrace || [],
      current: (() => { const checkbox = document.querySelector('dialog input[type=checkbox]'); return checkbox && { checked: checkbox.checked, connected: checkbox.isConnected }; })(),
    }));
    throw new Error(`real terms click did not persist on the live control: ${JSON.stringify(trace)}`, { cause: error });
  }
  assert.equal(await page.$eval('dialog input[type=checkbox]', node => node.checked), true, 'the live terms control must be accepted');
  const termsClickTrace = await page.evaluate(() => window.termsClickTrace);
  assert.ok(termsClickTrace.some(event => event.type === 'click' && event.target === 'INPUT' && event.checked && event.connected),
    `real terms click was not observed on the live control: ${JSON.stringify(termsClickTrace)}`);
  // A covering element must be rejected before any input is dispatched. This
  // counterproof prevents the physical helper from degrading into a forced
  // click when another element owns the visible center.
  await page.evaluate(() => {
    const obstruction = document.createElement('div');
    obstruction.id = 'tool-credits-click-obstruction';
    obstruction.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:auto';
    document.querySelector('dialog').append(obstruction);
  });
  await assert.rejects(
    () => prepareTrustedPhysicalClick(page, 'dialog .tool-credits__packs button', 'obstructed purchase'),
    /target center is obstructed/,
  );
  assert.equal(orderRequests.length, 0, 'an obstructed target must not create an order');
  await page.evaluate(() => document.querySelector('#tool-credits-click-obstruction')?.remove());

  const preparedPurchase = await prepareTrustedPhysicalClick(
    page, 'dialog .tool-credits__packs button', 'accepted purchase',
  );
  let orderResponse;
  let responseState = 'pending';
  let clickState = 'prepared';
  let purchaseClickTrace = [];
  const responseAbort = new AbortController();
  const responsePromise = page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(request.url());
    return request.method() === 'POST' && url.pathname === '/api/web/tool-credits' && url.searchParams.get('op') === 'orders';
  }, { signal: responseAbort.signal }).then(response => {
    responseState = `fulfilled:${response.status()}`;
    return { response };
  }, error => {
    responseState = `rejected:${error?.name || 'Error'}:${error?.message || error}`;
    return { error };
  });
  try {
    purchaseClickTrace = await trustedPhysicalClick(page, preparedPurchase);
    clickState = 'fulfilled';
    const responseOutcome = await responsePromise;
    if (responseOutcome.error) throw responseOutcome.error;
    orderResponse = responseOutcome.response;
    assert.equal(orderResponse.status(), 200, 'the real purchase click must receive a successful orders response');
    assert.ok(purchaseClickTrace.some(event => event.type === 'pointerdown' && event.connected && !event.disabled),
      `real purchase pointer did not start on the live actionable button: ${JSON.stringify(purchaseClickTrace)}`);
    await page.waitForFunction(() => document.querySelector('textarea')?.value === 'pix-code');
  } catch (error) {
    if (clickState !== 'fulfilled') {
      clickState = `rejected:${error?.name || 'Error'}:${error?.message || error}`;
      responseAbort.abort();
      await responsePromise;
    }
    const diagnostic = await page.evaluate(() => {
      const dialog = document.querySelector('dialog');
      const checkbox = dialog?.querySelector('input[type=checkbox]');
      const button = dialog?.querySelector('.tool-credits__packs button');
      const rect = button?.getBoundingClientRect();
      const center = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const point = center && document.elementFromPoint(center.x, center.y);
      return {
        visibilityState: document.visibilityState,
        documentFocus: document.hasFocus(),
        dialogText: dialog?.textContent || null,
        checkbox: checkbox && { checked: checkbox.checked, connected: checkbox.isConnected },
        button: button && { connected: button.isConnected, disabled: button.disabled, text: button.textContent, rect: rect?.toJSON?.() || null },
        centerTarget: point && { tag: point.tagName, text: point.textContent, className: point.className },
        pix: document.querySelector('textarea')?.value || null,
        storedOrders: localStorage.getItem('confenge-tool-orders-v1:u1'),
      };
    });
    const reportDir = fileURLToPath(new URL('build/reports/', root));
    await mkdir(reportDir, { recursive: true });
    const screenshotPath = join(reportDir, 'tool-credits-pix-click-failure.png');
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    throw new Error(`real purchase click/Pix transition failed: ${JSON.stringify({
      responseStatus: orderResponse?.status?.() || null,
      responseState,
      clickState,
      focusAtPrepare: preparedPurchase.focusAtPrepare,
      clickTrace: purchaseClickTrace,
      calls,
      orderRequests,
      screenshotPath,
      ...diagnostic,
    })}`, { cause: error });
  }
  assert.ok(await page.$('img[alt="QR Code Pix"]'));
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
  assert.ok(!serializedEvents.includes(firstRef) && !serializedEvents.includes(fixtureEmail)
    && !serializedEvents.includes(fixturePassword) && !serializedEvents.includes('confenge.com.br/'));

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
  await activateVisibleControl(checkoutPage, 'dialog input[type=checkbox]');
  assert.equal(await checkoutPage.$eval('dialog input[type=checkbox]', checkbox => checkbox.checked), true);
  await activateVisibleControl(checkoutPage, 'dialog .tool-credits__packs button');
  await checkoutPage.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Abrir pagamento no Mercado Pago'));
  assert.equal(orderRequests.length, 2);
  assert.equal(orderRequests[1].paymentFlow, 'checkout');
  assert.equal(await checkoutPage.$('img[alt="QR Code Pix"]'), null);
  assert.equal(await checkoutPage.$eval('dialog .tool-credits__close', button => button.disabled), false);
  await activateVisibleControl(checkoutPage, 'dialog .tool-credits__close');
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
  assert.match(await page.$eval('.tool-credits__export-notice', notice => notice.textContent), /Indique e ganhe créditos/);
  assert.equal(await page.$('dialog[open]'), null, 'successful export must not open a referral popup');
  await activateVisibleControl(page, '.tool-credits__export-notice button:nth-of-type(2)');
  await page.waitForSelector('dialog[open] #tool-credits-referral');
  assert.match(await page.$eval('dialog[open] #tool-credits-referral', section => section.textContent), /primeira exportação paga/);
  await activateVisibleControl(page, 'dialog[open] .tool-credits__close');

  toolCreditsConfig = {...sharedEnabledConfig}; delete toolCreditsConfig.sharedExportsEnabled;
  const gated = await browser.newPage();
  await gated.goto(`http://127.0.0.1:${port}/`);
  const gates = await gated.evaluate(async () => {
    const {createToolCredits}=await import('/assets/js/tool-credits.mjs');
    const response = value => ({ status: 200, ok: true, json: async () => value });
    const disabled = createToolCredits({toolId:'modela-memoria', fetchImpl: async () => response({enabled:false})});
    const paused = createToolCredits({toolId:'modela-memoria', fetchImpl: async () => response({enabled:true, firebase:{apiKey:'fake'}, tools:['modela-memoria'], purchasesEnabled:false})});
    const sharedConfig = sharedExportsEnabled => ({enabled:true, firebase:{apiKey:'fake'}, tools:['modela-memoria'], sharedExportsEnabled});
    const sharedMissing = createToolCredits({toolId:'modela-memoria', shared:true, fetchImpl: async () => response(sharedConfig())});
    const sharedNull = createToolCredits({toolId:'modela-memoria', shared:true, fetchImpl: async () => response(sharedConfig(null))});
    const sharedFalse = createToolCredits({toolId:'modela-memoria', shared:true, fetchImpl: async () => response(sharedConfig(false))});
    const {exportToolResult} = await import('/assets/js/tool-credits.mjs');
    let directDelivered = 0;
    const directResult = await exportToolResult({toolId:'calculadora-bdi', format:'csv', content:'local only', deliver: () => { directDelivered += 1; }});
    return {
      disabled: await disabled.openReferral(), paused: await paused.openReferral(),
      sharedMissing: await sharedMissing.open(), sharedNull: await sharedNull.open(), sharedFalse: await sharedFalse.open(),
      directResult, directDelivered, dialogs: document.querySelectorAll('dialog').length,
    };
  });
  assert.deepEqual(gates, {disabled:false, paused:false, sharedMissing:false, sharedNull:false, sharedFalse:false, directResult:true, directDelivered:1, dialogs:0});
  await gated.close();
  toolCreditsConfig = sharedEnabledConfig;

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
  await early.evaluate(async ({ email, password }) => {
    const { createToolCredits } = await import('/assets/js/tool-credits.mjs');
    await createToolCredits({ toolId: 'modela-memoria' }).open();
    const afterExpiry = Date.now() + 31 * 864e5;
    Date.now = () => afterExpiry;
    const form = document.querySelector('dialog form');
    form.querySelector('input[type=email]').value = email;
    form.querySelector('input[type=password]').value = password;
    form.requestSubmit();
  }, { email: 'expired@example.test', password: fixturePassword });
  await early.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Créditos de exportação'));
  const afterExpiry = registrations.slice(provisionStart);
  assert.ok(afterExpiry.length && afterExpiry.every(request => !('referralCode' in request)));
  await early.close();
  console.log('browser tool credits: ok');
} finally {
  try {
    await browser?.close();
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
