import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const NATIVE_PRESS_SEQUENCE = ['mousedown', '1', 'mouseup', '1'];

async function xdotool(args) {
  return execFile('xdotool', args, { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
}

async function diagnosticCommand(command, args) {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
    });
    return { stdout: stdout.trim().slice(0, 20000), stderr: stderr.trim().slice(0, 4000) };
  } catch (error) {
    return { error: `${error?.name || 'Error'}: ${error?.message || error}` };
  }
}

async function x11WindowDetails(windowId) {
  if (!/^\d+$/.test(windowId || '')) return null;
  const [pid, name, geometry, properties] = await Promise.all([
    diagnosticCommand('xdotool', ['getwindowpid', windowId]),
    diagnosticCommand('xdotool', ['getwindowname', windowId]),
    diagnosticCommand('xdotool', ['getwindowgeometry', '--shell', windowId]),
    diagnosticCommand('xprop', ['-id', windowId, 'WM_NAME', '_NET_WM_NAME', 'WM_CLASS', '_NET_WM_PID', 'WM_STATE']),
  ]);
  return { windowId, pid, name, geometry, properties };
}

async function captureX11State(page, prepared, ownedWindow) {
  const [active, focused, pointer, rootProperties, tree, pageState] = await Promise.all([
    diagnosticCommand('xdotool', ['getactivewindow']),
    diagnosticCommand('xdotool', ['getwindowfocus']),
    diagnosticCommand('xdotool', ['getmouselocation', '--shell']),
    diagnosticCommand('xprop', ['-root', '_NET_ACTIVE_WINDOW', '_NET_CLIENT_LIST_STACKING']),
    diagnosticCommand('xwininfo', ['-root', '-tree']),
    page.evaluate(prepared => {
      const identify = node => node && {
        tag: node.tagName, id: node.id || '', className: String(node.className || ''),
      };
      const target = document.querySelector(prepared.selector);
      const dialog = target?.closest('dialog') || document.querySelector('dialog');
      const rect = target?.getBoundingClientRect();
      const center = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const style = target && getComputedStyle(target);
      let popovers = [];
      try { popovers = [...document.querySelectorAll(':popover-open')].slice(0, 8).map(identify); } catch {}
      return {
        visibility: document.visibilityState,
        focus: document.hasFocus(),
        activeElement: identify(document.activeElement),
        userActivation: { isActive: navigator.userActivation?.isActive, hasBeenActive: navigator.userActivation?.hasBeenActive },
        dialog: dialog && { ...identify(dialog), open: dialog.open, modal: dialog.matches(':modal') },
        target: target && {
          ...identify(target), connected: target.isConnected, disabled: Boolean(target.disabled),
          rect: rect?.toJSON?.() || null, inertAncestor: identify(target.closest('[inert]')),
          pointerEvents: style?.pointerEvents, visibility: style?.visibility, display: style?.display,
        },
        inertElements: [...document.querySelectorAll('[inert]')].slice(0, 8).map(identify),
        autofocusElements: [...document.querySelectorAll('[autofocus]')].slice(0, 8).map(identify),
        popovers,
        elementsAtCenter: center ? document.elementsFromPoint(center.x, center.y).slice(0, 8).map(identify) : [],
      };
    }, prepared).catch(error => ({ error: `${error?.name || 'Error'}: ${error?.message || error}` })),
  ]);
  const activeId = /^\d+$/.test(active.stdout || '') ? active.stdout : null;
  const focusedId = /^\d+$/.test(focused.stdout || '') ? focused.stdout : null;
  const pointerId = /(?:^|\n)WINDOW=(\d+)/.exec(pointer.stdout || '')?.[1] || null;
  const [ownedWindowDetails, activeWindowDetails, focusedWindowDetails, pointerWindowDetails] = await Promise.all([
    x11WindowDetails(ownedWindow), x11WindowDetails(activeId), x11WindowDetails(focusedId), x11WindowDetails(pointerId),
  ]);
  return {
    capturedAt: new Date().toISOString(), active, focused, pointer, rootProperties, tree,
    ownedWindowDetails, activeWindowDetails, focusedWindowDetails, pointerWindowDetails, page: pageState,
  };
}

async function captureRootScreenshot(diagnosticDir, label, phase) {
  if (!diagnosticDir) return null;
  try {
    const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const path = join(diagnosticDir, `wallet-input-${slug}-native-${phase}.png`);
    await mkdir(diagnosticDir, { recursive: true });
    const result = await diagnosticCommand('import', ['-window', 'root', path]);
    return result.error ? { path, error: result.error } : { path };
  } catch (error) {
    return { error: `${error?.name || 'Error'}: ${error?.message || error}` };
  }
}

export async function assertX11NativePointerAvailable() {
  const { stdout } = await xdotool(['version']);
  assert.match(stdout, /^xdotool version /, 'xdotool must be available for native pointer mode');
}

async function removeMoveListener(page) {
  await page.evaluate(() => {
    if (window.__toolCreditsX11MoveListener) {
      document.removeEventListener('pointermove', window.__toolCreditsX11MoveListener, true);
      delete window.__toolCreditsX11MoveListener;
    }
    delete window.__toolCreditsX11Moves;
  }).catch(() => {});
}

export async function prepareX11NativePointer({ browser, page, prepared, center, diagnosticDir }) {
  let listenerInstalled = false;
  const progress = {};
  try {
    const browserPid = String(browser.process()?.pid || '');
    assert.match(browserPid, /^\d+$/, `${prepared.label}: launched Chrome PID is unavailable`);
    const { stdout } = await xdotool(['search', '--onlyvisible', '--pid', browserPid]);
    const visibleWindows = stdout.trim().split(/\s+/).filter(Boolean);
    progress.visibleWindows = visibleWindows;
    assert.equal(visibleWindows.length, 1,
      `${prepared.label}: expected one visible X11 window owned by Chrome: ${JSON.stringify(visibleWindows)}`);
    const [ownedWindow] = visibleWindows;
    const priorActiveWindow = (await xdotool(['getactivewindow'])).stdout.trim();
    progress.priorActiveWindow = priorActiveWindow;
    if (priorActiveWindow !== ownedWindow) await xdotool(['windowactivate', '--sync', ownedWindow]);
    const activeWindow = (await xdotool(['getactivewindow'])).stdout.trim();
    assert.equal(activeWindow, ownedWindow, `${prepared.label}: owned Chrome window did not become active`);
    const activePid = (await xdotool(['getwindowpid', activeWindow])).stdout.trim();
    assert.equal(activePid, browserPid, `${prepared.label}: active X11 _NET_WM_PID does not match Chrome`);
    const activeGeometry = (await xdotool(['getwindowgeometry', '--shell', activeWindow])).stdout.trim();
    Object.assign(progress, { browserPid, ownedWindow, activeWindow, activePid, activeGeometry });

    await page.evaluate(prepared => {
      window.__toolCreditsX11Moves = [];
      window.__toolCreditsX11MoveListener = event => {
        const state = window.__toolCreditsPhysicalClicks?.[prepared.traceKey];
        const current = document.querySelector(prepared.selector);
        window.__toolCreditsX11Moves.push({
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          isTrusted: event.isTrusted,
          target: event.target.tagName,
          storedConnected: state?.target?.isConnected,
          storedDisabled: Boolean(state?.target?.disabled),
          currentIsStored: Boolean(state && current === state.target),
          eventInsideStored: Boolean(state?.target?.contains(event.target)),
        });
      };
      document.addEventListener('pointermove', window.__toolCreditsX11MoveListener, true);
    }, prepared);
    listenerInstalled = true;

    const windowMetrics = await page.evaluate(() => ({
      screenX: window.screenX,
      screenY: window.screenY,
      outerWidth,
      outerHeight,
      innerWidth,
      innerHeight,
      devicePixelRatio,
    }));
    assert.equal(windowMetrics.devicePixelRatio, 1, `${prepared.label}: native X11 mapping requires scale 1`);
    progress.windowMetrics = windowMetrics;

    const neutralClient = {
      x: center.x >= 30 ? center.x - 20 : center.x + 20,
      y: center.y >= 30 ? center.y - 20 : center.y + 20,
    };
    let nativePoint = {
      x: Math.round(windowMetrics.screenX + neutralClient.x),
      y: Math.round(windowMetrics.screenY + neutralClient.y),
    };
    const pointerBeforeMove = (await xdotool(['getmouselocation', '--shell'])).stdout.trim();
    Object.assign(progress, { neutralClient, nativePoint, pointerBeforeMove });
    await xdotool(['mousemove', '--sync', String(nativePoint.x), String(nativePoint.y)]);
    await page.waitForFunction(() => window.__toolCreditsX11Moves?.length >= 1, { timeout: 5000 });
    const firstMove = await page.evaluate(() => window.__toolCreditsX11Moves.at(-1));
    assert.equal(firstMove.isTrusted, true, `${prepared.label}: neutral X11 move must be browser-trusted`);

    const firstMoveCount = await page.evaluate(() => window.__toolCreditsX11Moves.length);
    nativePoint = {
      x: Math.round(nativePoint.x + center.x - firstMove.clientX),
      y: Math.round(nativePoint.y + center.y - firstMove.clientY),
    };
    await xdotool(['mousemove', '--sync', String(nativePoint.x), String(nativePoint.y)]);
    await page.waitForFunction(count => window.__toolCreditsX11Moves?.length > count, { timeout: 5000 }, firstMoveCount);
    const calibrated = await page.evaluate(({ center, prepared }) => {
      const move = window.__toolCreditsX11Moves.at(-1);
      const state = window.__toolCreditsPhysicalClicks?.[prepared.traceKey];
      const target = document.querySelector(prepared.selector);
      const hit = document.elementFromPoint(move.clientX, move.clientY);
      return {
        move,
        statePresent: Boolean(state),
        targetConnected: Boolean(target?.isConnected),
        targetDisabled: Boolean(target?.disabled),
        targetHit: Boolean(target && hit && target.contains(hit)),
        deltaX: move.clientX - center.x,
        deltaY: move.clientY - center.y,
      };
    }, { center, prepared });
    assert.ok(calibrated.statePresent && calibrated.targetConnected && !calibrated.targetDisabled
      && calibrated.targetHit && calibrated.move.isTrusted && calibrated.move.storedConnected
      && !calibrated.move.storedDisabled && calibrated.move.currentIsStored
      && calibrated.move.eventInsideStored && Math.abs(calibrated.deltaX) <= 1
      && Math.abs(calibrated.deltaY) <= 1,
    `${prepared.label}: native pointer calibration missed the live target: ${JSON.stringify({
      windowMetrics, firstMove, nativePoint, calibrated,
    })}`);

    const proof = {
      activeWindow, activePid, browserPid, activeGeometry, pointerBeforeMove,
      windowMetrics, firstMove, nativePoint, calibrated, pressSequence: NATIVE_PRESS_SEQUENCE,
    };
    return {
      proof,
      async press() {
        await page.evaluate(prepared => {
          const state = window.__toolCreditsPhysicalClicks?.[prepared.traceKey];
          if (!state) throw new Error(`${prepared.label}: native click state disappeared before press`);
          state.nativeClickAcknowledged = false;
          state.nativeClickListener = event => {
            if (event.isTrusted && state.target.contains(event.target)) state.nativeClickAcknowledged = true;
          };
          document.addEventListener('click', state.nativeClickListener, true);
        }, prepared);
        try {
          proof.beforePress = await captureX11State(page, prepared, ownedWindow)
            .catch(error => ({ error: `${error?.name || 'Error'}: ${error?.message || error}` }));
          proof.beforePressScreenshot = await captureRootScreenshot(diagnosticDir, prepared.label, 'before');
          // Keep the one down/up sequence on a single X connection. The DOM
          // acknowledgement and exact trusted trace below remain authoritative.
          await xdotool(NATIVE_PRESS_SEQUENCE);
          proof.immediateAfterPress = await captureX11State(page, prepared, ownedWindow)
            .catch(error => ({ error: `${error?.name || 'Error'}: ${error?.message || error}` }));
          proof.immediateAfterPressScreenshot = await captureRootScreenshot(diagnosticDir, prepared.label, 'after');
          await page.waitForFunction(traceKey => {
            const state = window.__toolCreditsPhysicalClicks?.[traceKey];
            return state?.nativeClickAcknowledged === true;
          }, {}, prepared.traceKey);
        } catch (error) {
          proof.failure = await captureX11State(page, prepared, ownedWindow)
            .catch(captureError => ({ error: `${captureError?.name || 'Error'}: ${captureError?.message || captureError}` }));
          error.x11NativeProof = proof;
          throw error;
        } finally {
          await page.evaluate(traceKey => {
            const state = window.__toolCreditsPhysicalClicks?.[traceKey];
            if (state?.nativeClickListener) {
              document.removeEventListener('click', state.nativeClickListener, true);
              delete state.nativeClickListener;
            }
          }, prepared.traceKey).catch(() => {});
          await removeMoveListener(page);
          listenerInstalled = false;
        }
      },
      async cleanup() {
        if (listenerInstalled) {
          await removeMoveListener(page);
          listenerInstalled = false;
        }
      },
    };
  } catch (error) {
    const pointer = await xdotool(['getmouselocation', '--shell']).then(result => result.stdout.trim()).catch(() => null);
    const pointerWindow = /(?:^|\n)WINDOW=(\d+)/.exec(pointer || '')?.[1] || null;
    const failure = {
      progress,
      activeWindow: await xdotool(['getactivewindow']).then(result => result.stdout.trim()).catch(() => null),
      pointer,
      pointerWindow,
      pointerWindowPid: pointerWindow
        ? await xdotool(['getwindowpid', pointerWindow]).then(result => result.stdout.trim()).catch(() => null) : null,
      pointerWindowName: pointerWindow
        ? await xdotool(['getwindowname', pointerWindow]).then(result => result.stdout.trim()).catch(() => null) : null,
      pointerWindowGeometry: pointerWindow
        ? await xdotool(['getwindowgeometry', '--shell', pointerWindow]).then(result => result.stdout.trim()).catch(() => null) : null,
      page: await page.evaluate(() => ({
        visibility: document.visibilityState,
        focus: document.hasFocus(),
        moves: window.__toolCreditsX11Moves || [],
      })).catch(() => null),
    };
    if (listenerInstalled) await removeMoveListener(page);
    error.message = `${error.message}; X11 state: ${JSON.stringify(failure)}`;
    throw error;
  }
}
