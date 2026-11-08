// Keep drafts in the page session, isolated from other tools and future tabs.
export function tabDraft(key, snapshot, isBusy, report) {
  const baseKey = key + '.base';
  let timer;
  let failed = false;
  let baseFailed = false;
  let guarded = false;

  function refreshGuard() {
    const needed = timer !== undefined || failed || isBusy();
    if (needed === guarded) return;
    guarded = needed;
    if (needed) window.addEventListener('beforeunload', onLeave);
    else window.removeEventListener('beforeunload', onLeave);
  }

  function save() {
    clearTimeout(timer);
    timer = undefined;
    failed = baseFailed;
    if (!failed) {
      try { sessionStorage.setItem(key, JSON.stringify(snapshot())); }
      catch { failed = true; }
    }
    if (failed) {
      report('As últimas alterações ficaram só na página. Mantenha a aba aberta para preservá-las.', true);
    } else {
      report('Rascunho atualizado nesta aba.');
    }
    refreshGuard();
  }

  function onLeave(event) {
    if (timer !== undefined) save();
    if (!failed && !isBusy()) return;
    event.preventDefault();
    event.returnValue = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer !== undefined) save();
  });

  return {
    read() {
      return JSON.parse(sessionStorage.getItem(key));
    },
    readBase() {
      return JSON.parse(sessionStorage.getItem(baseKey));
    },
    replaceBase(base) {
      try {
        sessionStorage.setItem(baseKey, JSON.stringify(base));
        baseFailed = false;
      } catch {
        baseFailed = true;
      }
      save();
    },
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(save, 350);
      refreshGuard();
    },
    clear() {
      try {
        sessionStorage.removeItem(baseKey);
        sessionStorage.removeItem(key);
      } catch {
        report('O navegador impediu a limpeza do rascunho da aba.', true);
        return false;
      }
      clearTimeout(timer);
      timer = undefined;
      failed = baseFailed = false;
      report('Rascunho limpo.');
      refreshGuard();
      return true;
    },
    refreshGuard,
  };
}
