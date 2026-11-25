(() => {
  void import('/assets/marketplace/discovery.js').catch(() => {});

  const initialize = () => {

  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (hoverQuery.matches) {
    const desktopGroups = document.querySelectorAll(
      '.desktop-nav details[data-nav-group], .pp-nav details[data-nav-group]'
    );
    for (const group of desktopGroups) {
      const summary = group.querySelector(':scope > summary');
      const panel = group.querySelector(':scope > .nav-panel');
      let openedByHover = false;
      let closeTimer;
      group.addEventListener('toggle', () => {
        if (!group.open) openedByHover = false;
      });
      group.addEventListener('pointerenter', event => {
        clearTimeout(closeTimer);
        if (event.pointerType !== 'mouse' || group.open) return;
        openedByHover = true;
        group.open = true;
      });
      group.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse' || !openedByHover) return;
        closeTimer = setTimeout(() => {
          if (openedByHover && !panel?.contains(document.activeElement)) group.open = false;
        }, 150);
      });
      summary?.addEventListener('click', event => {
        if (event.detail === 0 || !openedByHover) return;
        event.preventDefault();
        openedByHover = false;
      });
    }
  }

  const mobileQuery = window.matchMedia('(max-width: 1120px)');
  const replaceShell = node => {
    if (!node) return null;
    const replacement = node.cloneNode(false);
    while (node.firstChild) replacement.append(node.firstChild);
    node.replaceWith(replacement);
    return replacement;
  };
  const contexts = [];
  const standardTrigger = document.querySelector('.site-header .menu-toggle');
  const standardPanel = document.querySelector('.site-header .mobile-nav');
  if (standardTrigger && standardPanel) {
    contexts.push({
      trigger: replaceShell(standardTrigger),
      panel: replaceShell(standardPanel),
      details: null,
    });
  }
  const nativeOriginal = document.querySelector('.pp-header .pp-mobile, .news-site-header .news-mobile-menu');
  if (nativeOriginal) {
    const details = replaceShell(nativeOriginal);
    const trigger = replaceShell(details.querySelector(':scope > summary'));
    const panel = replaceShell(details.querySelector(':scope > nav'));
    contexts.push({
      details,
      trigger,
      panel,
    });
  }
  if (!contexts.length) return;

  let active = null;
  let toolbar = null;
  let backdrop = null;
  let inertOwned = [];
  let bodyWasLocked = false;

  const groups = context => [...context.panel.querySelectorAll('details[data-nav-group]')];
  const summary = group => group.querySelector(':scope > summary');
  const syncGroup = group => summary(group)?.setAttribute('aria-expanded', String(group.open));
  const visible = element => Boolean(
    element && element.getClientRects().length &&
    !element.closest('[hidden], [inert]') &&
    getComputedStyle(element).visibility !== 'hidden'
  );
  const focusable = root => [...root.querySelectorAll(
    'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(element => element.tabIndex >= 0 && visible(element));
  const setTrigger = (context, open) => {
    context.trigger.setAttribute('aria-expanded', String(open));
    context.trigger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    const label = context.trigger.querySelector(context.details ? 'span' : '.menu-toggle__label');
    if (label) label.textContent = open ? 'Fechar' : 'Menu';
  };
  const closeGroup = (group, returnFocus = false) => {
    group.open = false;
    syncGroup(group);
    if (returnFocus) summary(group)?.focus({ preventScroll: true });
  };
  const revealGroup = group => {
    const panel = active?.panel;
    const target = summary(group)?.getBoundingClientRect();
    const box = panel?.getBoundingClientRect();
    const top = Math.max(box?.top ?? 0, toolbar?.getBoundingClientRect().bottom ?? 0);
    if (!panel || !target || !box || !panel.contains(group)) return;
    const preview = Math.min(56, Math.max(0, box.bottom - top - target.height));
    if (target.top < top) panel.scrollTop -= top - target.top;
    else if (target.bottom + preview > box.bottom) {
      panel.scrollTop += target.bottom + preview - box.bottom;
    }
  };
  const candidates = context => [...document.querySelectorAll(
    'main, footer, .whatsapp-float, .skip-link, .nav-discovery-region, .desktop-nav, .pp-nav, header .brand, header .button'
  )].filter(element => element !== context.trigger && !element.contains(context.panel) && !context.panel.contains(element));
  const ensureControls = () => {
    if (toolbar) return;
    toolbar = document.createElement('div');
    toolbar.className = 'mobile-nav__toolbar';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mobile-nav__close';
    close.setAttribute('aria-label', 'Fechar menu');
    close.textContent = 'Fechar';
    close.addEventListener('click', () => closeMobile(true));
    toolbar.append(close);
    backdrop = document.createElement('div');
    backdrop.className = 'mobile-nav__backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => closeMobile(true));
  };
  const closeMobile = (returnFocus = false) => {
    const context = active;
    if (!context) return;
    active = null;
    setTrigger(context, false);
    context.panel.classList.remove('is-open');
    context.panel.removeAttribute('role');
    context.panel.removeAttribute('aria-modal');
    groups(context).filter(group => group.open).forEach(group => closeGroup(group));
    if (context.details) context.details.open = false;
    toolbar?.remove();
    backdrop?.remove();
    inertOwned.forEach(element => element.removeAttribute('inert'));
    inertOwned = [];
    document.documentElement.classList.remove('mobile-nav-dialog-open');
    if (!bodyWasLocked) document.body.classList.remove('menu-open');
    if (returnFocus) context.trigger.focus({ preventScroll: true });
  };
  const openMobile = context => {
    if (!mobileQuery.matches || active === context) return;
    if (active) closeMobile();
    active = context;
    bodyWasLocked = document.body.classList.contains('menu-open');
    setTrigger(context, true);
    context.panel.classList.add('is-open');
    context.panel.setAttribute('role', 'dialog');
    context.panel.setAttribute('aria-modal', 'true');
    if (context.details) context.details.open = true;
    ensureControls();
    context.panel.prepend(toolbar);
    (context.details || context.panel).before(backdrop);
    context.panel.scrollTop = 0;
    document.body.classList.add('menu-open');
    document.documentElement.classList.add('mobile-nav-dialog-open');
    inertOwned = candidates(context).filter(element => !element.hasAttribute('inert'));
    inertOwned.forEach(element => element.setAttribute('inert', ''));
    toolbar.firstElementChild.focus({ preventScroll: true });
  };

  for (const context of contexts) {
    groups(context).forEach(group => replaceShell(group));
    setTrigger(context, false);
    context.trigger.setAttribute('data-mobile-nav-ready', '');
    for (const group of groups(context)) {
      syncGroup(group);
      group.addEventListener('toggle', () => {
        syncGroup(group);
        if (!group.open) return;
        groups(context).filter(other => other !== group && other.open).forEach(other => closeGroup(other));
        revealGroup(group);
      });
    }
    if (context.details) {
      context.trigger.addEventListener('click', event => {
        if (!mobileQuery.matches) return;
        event.preventDefault();
        if (context.details.open) {
          closeMobile(true);
        } else {
          // A native `toggle` is queued. When a close followed immediately by
          // another activation reaches this handler, the old controller can
          // still be active even though the details state already asks to
          // reopen. Reset that stale state before opening the current menu.
          if (active === context) closeMobile();
          openMobile(context);
        }
      });
      context.details.addEventListener('toggle', () => {
        if (context.details.open && mobileQuery.matches) openMobile(context);
        else if (active === context) closeMobile();
      });
    } else {
      context.trigger.addEventListener('click', () => {
        if (active === context) closeMobile(true);
        else openMobile(context);
      });
    }
    let pendingTouchGroup = null;
    let touchOrigin = null;
    context.panel.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const intended = document.elementFromPoint(touch.clientX, touch.clientY)
        ?.closest('summary.nav-group__toggle');
      if (!intended || !context.panel.contains(intended)) return;
      // Chromium can retarget a narrow-margin tap to a link in the disclosure
      // that is about to collapse. Resolve the visible heading by coordinates
      // before touch adjustment chooses a different activation target. Wait for
      // touchend so a swipe that starts on the heading keeps scrolling normally.
      pendingTouchGroup = intended;
      touchOrigin = { x: touch.clientX, y: touch.clientY };
    }, { capture: true, passive: true });
    context.panel.addEventListener('touchmove', event => {
      if (!pendingTouchGroup || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > 10) {
        pendingTouchGroup = null;
        touchOrigin = null;
      }
    }, { capture: true, passive: true });
    context.panel.addEventListener('touchend', event => {
      const intended = pendingTouchGroup;
      pendingTouchGroup = null;
      touchOrigin = null;
      if (!intended || event.changedTouches.length !== 1) return;
      event.preventDefault();
      intended.click();
    }, { capture: true, passive: false });
    context.panel.addEventListener('touchcancel', () => {
      pendingTouchGroup = null;
      touchOrigin = null;
    }, { capture: true, passive: true });
    context.panel.addEventListener('click', event => {
      if (event.target.closest('a[href]')) closeMobile();
    });
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || !active) return;
    if (event.key === 'Escape') {
      const openGroup = groups(active).find(group => group.open && visible(summary(group)));
      event.preventDefault();
      event.stopPropagation();
      if (openGroup) closeGroup(openGroup, true);
      else closeMobile(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = focusable(active.panel);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (!active.panel.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('click', event => {
    if (active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) closeMobile(true);
  });
  window.addEventListener('resize', () => {
    if (!mobileQuery.matches) closeMobile();
  }, { passive: true });
  window.addEventListener('pagehide', () => closeMobile());
  };

  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
  const domContentLoaded = document.readyState === 'complete' ||
    Number(navigationEntry?.domContentLoadedEventStart) > 0;
  if (!domContentLoaded) {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
