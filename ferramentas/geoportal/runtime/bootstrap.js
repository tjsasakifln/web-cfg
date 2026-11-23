(() => {
  const allowed = new Map([
    ['v=1&layers=florianopolis,sao-jose&camera=regional', 'both'],
    ['v=1&layers=florianopolis&camera=florianopolis', 'florianopolis'],
    ['v=1&layers=sao-jose&camera=sao-jose', 'sao-jose'],
    ['v=1&layers=none&camera=regional', 'none']
  ]);
  const path = location.pathname;
  if (!path.includes('/views/')) {
    const fragment = location.hash.slice(1);
    const view = allowed.get(fragment) || 'both';
    const state = allowed.has(fragment) ? fragment : 'v=1&layers=florianopolis,sao-jose&camera=regional';
    location.replace(`views/${view}/#${state}`);
    return;
  }
  window.L_PREFER_CANVAS = true;
})();
