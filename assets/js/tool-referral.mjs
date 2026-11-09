const KEY = 'confenge-tool-referral-v1';
const DURATION_MS = 30 * 864e5;
const DEFERRED_QUEUE = 'confengeDeferredEvents';
const MAX_DEFERRED_EVENTS = 8;
let inMemory;
export const validReferral = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16}$/.test(value);
const deferredReferral = item => item?.event === 'tool_referral_visit'
  && item.props?.touch_outcome === 'accepted'
  && ['persistent', 'memory'].includes(item.props?.storage_mode);
const measure = props => {
  try {
    if (typeof window.confengeTrack === 'function') return window.confengeTrack('tool_referral_visit', props);
    const pending = Array.isArray(window[DEFERRED_QUEUE]) ? window[DEFERRED_QUEUE].filter(deferredReferral) : [];
    pending.push({ event: 'tool_referral_visit', props: { touch_outcome: 'accepted', storage_mode: props.storage_mode } });
    window[DEFERRED_QUEUE] = pending.slice(-MAX_DEFERRED_EVENTS);
  } catch {}
};

// One first-touch policy for the catalogue and the tools' shared account.
// The credit service is the only consumer of the stored code.
export function referralFirstTouch() {
  const now = Date.now();
  const url = new URL(location.href);
  const refs = url.searchParams.getAll('ref');
  if (refs.length) {
    url.searchParams.delete('ref');
    try { history.replaceState(history.state, '', url); } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Number.isFinite(saved?.expires) && saved.expires > now && validReferral(saved.ref)) {
      inMemory = saved;
      return saved.ref;
    }
  } catch {}
  if (inMemory?.expires > now) return inMemory.ref;
  inMemory = undefined;
  if (refs.length === 1 && validReferral(refs[0])) {
    let storageMode = 'memory';
    const saved = { ref: refs[0], expires: now + DURATION_MS };
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
      if (JSON.parse(localStorage.getItem(KEY) || 'null')?.ref === refs[0]) storageMode = 'persistent';
    } catch {}
    inMemory = saved;
    measure({ touch_outcome: 'accepted', storage_mode: storageMode });
    return saved.ref;
  }
  try { localStorage.removeItem(KEY); } catch {}
  return '';
}
