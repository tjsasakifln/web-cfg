/** Disclosure-menu journeys and reviewable evidence for both public header families. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const root = resolve(process.argv[2] || '_site');
const evidenceDir = resolve(process.env.NAVIGATION_EVIDENCE_DIR || 'build/reports/convergence/navigation-discovery');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = (process.env.NAVIGATION_BASE_URL || `http://127.0.0.1:${server.address().port}`).replace(/\/$/, '');
const origin = new URL(base).origin;
const routes = ['/', '/projetos/', '/projetos-prontos/'];
const groups = ['projetos', 'servicos', 'ferramentas', 'inteligencia', 'obras-publicas', 'conteudos'];
const enhancedViewports = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1120, 800], [1280, 800], [1366, 900], [844, 320]];
const nativeViewports = [[320, 900], [1024, 900], [1366, 900]];
const report = { schema: 'confenge.navigation-discovery-ui/1.0', base_url: base, status: 'running', scenarios: [], screenshots: [], page_errors: [], failures: [] };
let browser;
let page;
let context = { kind: 'launch' };

async function pollFromNode(read, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await read();
    if (result) return result;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(context)}`);
}

async function waitForDOM(page, predicate, options = {}, ...args) {
  if (page.isJavaScriptEnabled()) return page.waitForFunction(predicate, options, ...args);
  // Page timers and Puppeteer's default rAF poller cannot run with scripting
  // disabled. DevTools can still read native DOM state synchronously.
  return pollFromNode(() => page.evaluate(predicate, ...args), options.label || 'native DOM state', options.timeout || 30000);
}

async function waitForVisible(page, selector) {
  if (page.isJavaScriptEnabled()) return page.waitForSelector(selector, { visible: true });
  return pollFromNode(() => page.evaluate(value => {
    const element = document.querySelector(value);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }, selector), `visible native control ${selector}`);
}

async function settle(page) {
  if (page.isJavaScriptEnabled()) {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    return;
  }
  await pollFromNode(() => page.evaluate(() => document.readyState === 'complete' && document.fonts.status === 'loaded'), 'native document and fonts');
  let previous = '';
  let stableSamples = 0;
  await pollFromNode(async () => {
    const boxes = await page.evaluate(() => [
      document.documentElement,
      document.querySelector('.site-header, .pp-header'),
      ...document.querySelectorAll('[data-nav-group][open] > .nav-panel'),
    ].filter(Boolean).map(element => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height, element.scrollWidth, element.scrollHeight];
    }));
    const current = JSON.stringify(boxes);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
    return stableSamples >= 2;
  }, 'stable native layout');
}

async function visit(page, route, width, height) {
  await page.setViewport({ width, height });
  let response = await page.goto(base + route, { waitUntil: 'load', timeout: 30000 });
  // Removing a fragment can be same-document navigation. Reload so each
  // keyboard journey starts from a fresh document with its initial focus.
  if (!response) response = await page.reload({ waitUntil: 'load', timeout: 30000 });
  assert.equal(response?.status(), 200, `${route}@${width}x${height}`);
  await settle(page);
}

async function assertRestored(page, trigger, returnFocus = true) {
  const state = await page.$eval(trigger, (element, focus) => ({
    expanded: element.getAttribute('aria-expanded'),
    focus: !focus || document.activeElement === element,
    locked: document.body.classList.contains('menu-open'),
    inert: Boolean(document.querySelector('main[inert], .nav-discovery[inert], .nav-discovery-region[inert]')),
    dialog: Boolean(document.querySelector('nav[aria-modal="true"]')),
  }), returnFocus);
  assert.deepEqual(state, { expanded: 'false', focus: true, locked: false, inert: false, dialog: false }, 'menu restores focus, scrolling and background');
}

async function screenshot(page, filename) {
  await page.screenshot({ path: resolve(evidenceDir, filename) });
  report.screenshots.push({ file: filename, ...context });
}

try {
  await mkdir(evidenceDir, { recursive: true });
  browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith('data:') || new URL(request.url()).origin === origin ? request.continue() : request.abort());
  page.on('pageerror', error => report.page_errors.push({ ...context, message: String(error) }));

  // Capture the three review states first so a later matrix failure retains
  // evidence for the reviewer and the authorized frozen-source recapture.
  for (const capture of [
    { route: '/', width: 1366, height: 900, group: 'ferramentas', file: 'desktop-ferramentas.png' },
    { route: '/', width: 390, height: 844, group: 'projetos', file: 'mobile-projetos.png' },
    { route: '/projetos-prontos/', width: 1280, height: 800, group: 'projetos', file: 'projetos-prontos-desktop.png' },
  ]) {
    context = { kind: 'capture', route: capture.route, javascript: true, width: capture.width, height: capture.height, group: capture.group };
    await visit(page, capture.route, capture.width, capture.height);
    const project = Boolean(await page.$('.pp-header'));
    const mobile = capture.width <= 1120;
    const nav = mobile ? project ? '.pp-mobile-nav' : '.mobile-nav' : project ? '.pp-nav' : '.desktop-nav';
    if (mobile) {
      await page.click(project ? '.pp-mobile > summary' : '.menu-toggle');
      await page.waitForSelector(`${nav}[role="dialog"]`, { visible: true });
    }
    const group = `${nav} [data-nav-group="${capture.group}"]`;
    await page.click(`${group} > summary`);
    await page.waitForFunction(selector => document.querySelector(selector)?.open, {}, group);
    await settle(page);
    await screenshot(page, capture.file);
  }

  for (const javascript of [true, false]) {
    await page.setJavaScriptEnabled(javascript);
    for (const route of routes) {
      for (const [width, height] of javascript ? enhancedViewports : nativeViewports) {
        context = { kind: 'disclosures', route, javascript, width, height };
        await visit(page, route, width, height);
        const project = Boolean(await page.$('.pp-header'));
        const mobile = width <= 1120;
        const trigger = project ? '.pp-mobile > summary' : '.menu-toggle';
        const nav = mobile ? project ? '.pp-mobile-nav' : '.mobile-nav' : project ? '.pp-nav' : '.desktop-nav';
        const label = `${route}@${width}x${height} ${javascript ? 'JS' : 'no-JS'}`;
        const row = { ...context, family: project ? 'project' : 'standard', mode: mobile ? 'mobile' : 'desktop', groups: [] };
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} baseline overflow`);
        const shortcuts = await page.$$eval('.nav-discovery a', links => links.map(link => {
          const box = link.getBoundingClientRect();
          return { label: link.textContent.trim(), left: box.left, right: box.right, height: box.height };
        }));
        assert.equal(shortcuts.length, 5, `${label} discovery links`);
        assert.ok(shortcuts.every(link => link.left >= -1 && link.right <= width + 1 && link.height >= 44), `${label} discovery links visible and touchable`);
        row.shortcuts = shortcuts;
        if (mobile && (javascript || project)) {
          await page.focus(trigger);
          await page.keyboard.press('Enter');
          if (javascript) {
            await page.waitForSelector(`${nav}[role="dialog"]`, { visible: true });
            assert.equal(await page.$eval('.nav-discovery-region', element => element.hasAttribute('inert')), true, `${label} hides the background shortcut landmark from the modal`);
          }
        }
        await waitForVisible(page, `${nav} > .nav-group > summary`);
        assert.deepEqual(await page.$$eval(`${nav} > .nav-group`, nodes => nodes.map(node => node.dataset.navGroup)), groups, `${label} six groups`);
        if (!javascript) {
          assert.equal(page.isJavaScriptEnabled(), false, 'native journeys keep scripting disabled');
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('no-js')), true, 'the page bootstrap did not execute');
          assert.equal(await page.$$eval(`${nav} > .nav-group > summary`, nodes => nodes.every(node => !node.hasAttribute('aria-expanded'))), true, 'native controls were not enhanced by application scripts');
        }
        for (const id of groups) {
          context = { kind: 'disclosures', route, javascript, width, height, group: id, phase: 'open-group' };
          const group = `${nav} [data-nav-group="${id}"]`;
          const summary = `${group} > summary`;
          await page.focus(summary);
          await page.keyboard.press('Enter');
          await waitForDOM(page, selector => document.querySelector(selector)?.open, {}, group);
          await settle(page);
          const geometry = await page.$eval(group, element => {
            const summary = element.querySelector(':scope > summary');
            const panel = element.querySelector('.nav-panel');
            const box = panel.getBoundingClientRect();
            const target = summary.getBoundingClientRect();
            const navBox = element.closest('nav').getBoundingClientRect();
            return {
              left: box.left, right: box.right, top: box.top, bottom: box.bottom,
              scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth,
              navTop: navBox.top, navBottom: navBox.bottom,
              targetWidth: target.width, targetHeight: target.height,
              links: [...panel.querySelectorAll('a')].map(link => {
                const rect = link.getBoundingClientRect();
                return { href: link.getAttribute('href'), width: rect.width, height: rect.height, scrollWidth: link.scrollWidth, clientWidth: link.clientWidth };
              }),
            };
          });
          context = { ...context, phase: 'panel-geometry', geometry };
          assert.ok(geometry.left >= -1 && geometry.right <= width + 1 && geometry.scrollWidth <= geometry.clientWidth + 1, `${label} panel containment: ${id} ${JSON.stringify(geometry)}`);
          assert.ok(geometry.targetWidth >= 44 && geometry.targetHeight >= 44, `${label} summary target ${id}`);
          assert.ok(geometry.links.length >= 2 && geometry.links.every(link => link.href?.startsWith('/') && link.height >= 44 && link.width >= 44 && link.scrollWidth <= link.clientWidth + 1), `${label} reachable touch destinations ${id}`);
          // The native standard mobile fallback is inline; enhanced and PP menus scroll inside the viewport.
          if (mobile && (javascript || project)) assert.ok(geometry.navTop >= -1 && geometry.navBottom <= height + 1, `${label} mobile scroll container: ${id} ${JSON.stringify(geometry)}`);
          if (!mobile) assert.ok(geometry.top >= -1 && geometry.bottom <= height + 1, `${label} desktop panel height: ${id} ${JSON.stringify(geometry)}`);
          if (javascript) {
            assert.equal(await page.$$eval(`${nav} > .nav-group[open]`, nodes => nodes.length), 1, `${label} one disclosure at a time`);
            await page.keyboard.press('Escape');
            assert.equal(await page.$eval(group, element => element.open), false, `${label} ${id} Escape`);
            assert.equal(await page.$eval(summary, element => document.activeElement === element), true, `${label} ${id} returns focus`);
            if (mobile) assert.equal(await page.$eval(trigger, element => element.getAttribute('aria-expanded')), 'true', 'first Escape preserves the dialog');
          } else {
            await page.keyboard.press('Enter');
            assert.equal(await page.$eval(group, element => element.open), false, `${label} ${id} works without JavaScript`);
          }
          row.groups.push({ id, ...geometry });
        }
        if (!javascript) {
          context = { kind: 'disclosures', route, javascript, width, height, group: 'projetos', phase: 'native-exclusive-switch' };
          const first = `${nav} [data-nav-group="projetos"]`;
          const second = `${nav} [data-nav-group="servicos"]`;
          await page.focus(`${first} > summary`);
          await page.keyboard.press('Enter');
          await waitForDOM(page, selector => document.querySelector(selector)?.open, {}, first);
          await waitForVisible(page, `${first} .nav-overview`);
          // Do not close the first group. The native details name must do so
          // when another group opens, with application scripting disabled.
          context = { ...context, group: 'servicos' };
          await page.focus(`${second} > summary`);
          await page.keyboard.press('Enter');
          await waitForDOM(page, selector => document.querySelector(selector)?.open, {}, second);
          assert.deepEqual(await page.$$eval(`${nav} > .nav-group[open]`, nodes => nodes.map(node => node.dataset.navGroup)), ['servicos'], `${label} native switching leaves only the second group open`);
          await waitForVisible(page, `${second} .nav-overview`);
          await page.keyboard.press('Enter');
          await waitForDOM(page, selector => !document.querySelector(selector)?.open, {}, second);
          assert.equal(await page.$$eval(`${nav} > .nav-group[open]`, nodes => nodes.length), 0, `${label} native second group closes`);
          row.native_switch = { from: 'projetos', to: 'servicos', exclusive: true, closed_after: true };
        }
        if (javascript) {
          const first = `${nav} [data-nav-group="projetos"] > summary`;
          const second = `${nav} [data-nav-group="servicos"] > summary`;
          await page.focus(first);
          await page.keyboard.press('Space');
          await page.waitForFunction(selector => document.querySelector(selector)?.parentElement.open, {}, first);
          await page.click(second);
          await page.waitForFunction(selector => {
            const open = [...document.querySelectorAll(`${selector} > .nav-group[open]`)];
            return open.length === 1 && open[0].dataset.navGroup === 'servicos';
          }, {}, nav);
          await page.keyboard.press('Escape');
          if (mobile) {
            await page.focus(`${nav} .mobile-nav__close`);
            await page.keyboard.down('Shift');
            await page.keyboard.press('Tab');
            await page.keyboard.up('Shift');
            assert.equal(await page.$eval(nav, element => element.contains(document.activeElement) && document.activeElement !== element.querySelector('.mobile-nav__close')), true, 'reverse Tab reaches the last menu action');
            await page.keyboard.press('Tab');
            assert.equal(await page.$eval(`${nav} .mobile-nav__close`, element => document.activeElement === element), true, 'Tab wraps to close');
            await page.keyboard.press('Escape');
            await assertRestored(page, trigger);
            await page.click(trigger);
            await page.waitForSelector(`${nav}[role="dialog"]`, { visible: true });
            await page.mouse.click(1, 1);
            await assertRestored(page, trigger);
          } else {
            await page.focus(first);
            await page.keyboard.press('Enter');
            await page.waitForFunction(selector => document.querySelector(selector)?.parentElement.open, {}, first);
            // The panel is inset horizontally; this point is outside even when it covers the hero.
            await page.mouse.click(1, Math.min(height - 10, 650));
            assert.equal(await page.$$eval(`${nav} > .nav-group[open]`, nodes => nodes.length), 0, 'outside click closes the desktop panel');
          }
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} document overflow`);
        row.status = 'passed';
        report.scenarios.push(row);
      }
    }
  }

  await page.setJavaScriptEnabled(true);
  for (const route of routes) {
    context = { kind: 'resize', route, javascript: true };
    await visit(page, route, 390, 844);
    const project = Boolean(await page.$('.pp-header'));
    const trigger = project ? '.pp-mobile > summary' : '.menu-toggle';
    const mobileNav = project ? '.pp-mobile-nav' : '.mobile-nav';
    const desktopNav = project ? '.pp-nav' : '.desktop-nav';
    await page.click(trigger);
    await page.waitForSelector(`${mobileNav}[role="dialog"]`, { visible: true });
    await page.click(`${mobileNav} [data-nav-group="projetos"] > summary`);
    await page.setViewport({ width: 1366, height: 900 });
    await page.waitForFunction(() => !document.body.classList.contains('menu-open'));
    await assertRestored(page, trigger, false);
    assert.equal(await page.$$eval(`${mobileNav} .nav-group[open]`, nodes => nodes.length), 0, 'resize closes mobile subgroups');
    await page.click(`${desktopNav} [data-nav-group="projetos"] > summary`);
    await page.waitForFunction(selector => document.querySelector(`${selector} .nav-group`)?.open, {}, desktopNav);
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(selector => !document.querySelector(`${selector} .nav-group[open]`), {}, desktopNav);
    await assertRestored(page, trigger, false);
    report.scenarios.push({ ...context, from: { width: 390, height: 844 }, to: { width: 1366, height: 900 }, round_trip: true, status: 'passed' });
  }

  // Check both the enhanced scroll correction and the browser's native fallback.
  for (const javascript of [true, false]) {
    await page.setJavaScriptEnabled(javascript);
    for (const width of [320, 390, 1366]) {
      context = { kind: 'anchors', route: '/', javascript, width, height: 900 };
      const targets = [];
      for (const id of ['contato', 'conteudo']) {
        await visit(page, '/', width, 900);
        if (id === 'contato') {
          if (javascript) await page.click('.hero-actions a[href="#contato"]');
          else {
            // Puppeteer's click visibility check uses IntersectionObserver;
            // focus plus Enter exercises the browser's native link action.
            await page.focus('.hero-actions a[href="#contato"]');
            await page.keyboard.press('Enter');
          }
        }
        else {
          await page.keyboard.press('Tab');
          assert.equal(await page.$eval('.skip-link', element => document.activeElement === element), true, 'skip link is the first keyboard destination');
          await page.keyboard.press('Enter');
        }
        await waitForDOM(page, targetId => {
          const target = document.getElementById(targetId);
          const header = document.querySelector('.site-header');
          const sticky = ['sticky', 'fixed'].includes(getComputedStyle(header).position);
          const boundary = sticky ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
          const top = target.getBoundingClientRect().top;
          return location.hash === `#${targetId}` && top >= boundary - 2 && top <= innerHeight - 44;
        }, { timeout: 6000 }, id);
        await settle(page);
        const geometry = await page.$eval(`#${id}`, target => {
          const header = document.querySelector('.site-header');
          const sticky = ['sticky', 'fixed'].includes(getComputedStyle(header).position);
          return { top: target.getBoundingClientRect().top, boundary: sticky ? Math.max(0, header.getBoundingClientRect().bottom) : 0, viewport: innerHeight, focused: document.activeElement.id, hash: location.hash };
        });
        assert.ok(geometry.top >= geometry.boundary - 2 && geometry.top <= geometry.viewport - 44, `${id} visible below the header: ${JSON.stringify(geometry)}`);
        if (id === 'conteudo' && javascript) assert.equal(geometry.focused, 'conteudo', 'enhanced skip link transfers focus');
        targets.push({ id, ...geometry });
      }
      report.scenarios.push({ ...context, targets, status: 'passed' });
    }
  }

  // Reproduce the two viewport regressions found by the complete UI gate.
  // Keep the shortcuts readable while protecting the sticky header and CTA.
  await page.setJavaScriptEnabled(true);
  context = { kind: 'first-viewport', route: '/', javascript: true, width: 360, height: 800 };
  await visit(page, '/', 360, 800);
  const mobileFold = await page.evaluate(() => {
    const header = document.querySelector('.site-header');
    const region = document.querySelector('.nav-discovery-region');
    const headerBox = header.getBoundingClientRect();
    const regionBox = region.getBoundingClientRect();
    return {
      headerHeight: headerBox.height,
      headerBottom: headerBox.bottom,
      shortcutTop: regionBox.top,
      shortcutsOutsideHeader: !header.contains(region),
      shortcuts: [...region.querySelectorAll('a')].map(link => {
        const box = link.getBoundingClientRect();
        return { href: link.getAttribute('href'), height: box.height, left: box.left, right: box.right };
      }),
    };
  });
  assert.ok(mobileFold.headerHeight <= 96, `mobile header exceeds 96px: ${JSON.stringify(mobileFold)}`);
  assert.ok(mobileFold.shortcutsOutsideHeader && mobileFold.shortcutTop >= mobileFold.headerBottom - 1, 'shortcut region follows the sticky header');
  assert.equal(mobileFold.shortcuts.length, 5, 'all shortcuts and company access remain visible');
  assert.ok(mobileFold.shortcuts.every(link => link.height >= 44 && link.left >= 0 && link.right <= 361), 'shortcut targets fit the mobile viewport');
  await screenshot(page, 'mobile-header-360.png');
  report.scenarios.push({ ...context, ...mobileFold, status: 'passed' });

  context = { kind: 'first-viewport', route: '/diagnostico-b2g-expansao/', javascript: true, width: 1280, height: 720 };
  await visit(page, context.route, 1280, 720);
  const offerFold = await page.evaluate(() => {
    const cta = document.querySelector('.offer-hero .button-primary');
    const box = cta.getBoundingClientRect();
    const headerCta = document.querySelector('.header-cta');
    return { ctaTop: box.top, ctaBottom: box.bottom, ctaHeight: box.height, ctaHref: cta.getAttribute('href'), headerCtaFont: parseFloat(getComputedStyle(headerCta).fontSize), viewport: innerHeight, scrollY };
  });
  assert.ok(offerFold.headerCtaFont >= 14, `header CTA text below 14px: ${JSON.stringify(offerFold)}`);
  assert.ok(offerFold.scrollY <= 1 && offerFold.ctaTop >= 0 && offerFold.ctaBottom <= offerFold.viewport && offerFold.ctaHeight >= 44, `complete offer CTA must fit before scrolling: ${JSON.stringify(offerFold)}`);
  assert.equal(offerFold.ctaHref, '#pedido-diagnostico', 'the offer retains its existing request target');
  await screenshot(page, 'diagnostico-first-viewport-1280.png');
  report.scenarios.push({ ...context, ...offerFold, status: 'passed' });

  assert.deepEqual(report.page_errors, [], 'uncaught errors in navigation journeys');
  assert.equal(report.screenshots.length, 5, 'three menu screenshots and two viewport regression screenshots');
  assert.equal(report.scenarios.filter(row => row.kind === 'disclosures').length, 33, '24 enhanced and nine native disclosure journeys');
  report.status = 'passed';
  console.log(`PASS navigation discovery: 24 enhanced, 9 native, 3 resize, 6 fragment journeys and 2 first-viewport regressions; evidence ${evidenceDir}`);
} catch (error) {
  report.status = 'failed';
  const failure = { ...context, message: error.message, stack: error.stack };
  if (page && !page.isClosed()) {
    try {
      await page.screenshot({ path: resolve(evidenceDir, 'failure.png') });
      failure.screenshot = 'failure.png';
    } catch (captureError) {
      failure.screenshot_error = String(captureError);
    }
  }
  report.failures.push(failure);
  process.exitCode = 1;
  console.error(`FAIL navigation discovery: ${JSON.stringify(context)}\n${error.stack}`);
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(resolve(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
