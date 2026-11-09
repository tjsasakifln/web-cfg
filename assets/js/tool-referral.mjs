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

// One first-touch policy for the catalogue and the Modela Pro account.
// The credit service is the only consumer of the stored code.
export function referralFirstTouch() {
  const url = new URL(location.href);
  const refs = url.searchParams.getAll('ref');
  if (refs.length) {
    url.searchParams.delete('ref');
    try { history.replaceState(history.state, '', url); } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.expires > Date.now() && validReferral(saved.ref)) return saved.ref;
  } catch {}
  if (inMemory) return inMemory;
  if (refs.length === 1 && validReferral(refs[0])) {
    let storageMode = 'memory';
    try {
      const saved = { ref: refs[0], expires: Date.now() + DURATION_MS };
      localStorage.setItem(KEY, JSON.stringify(saved));
      if (JSON.parse(localStorage.getItem(KEY) || 'null')?.ref === refs[0]) storageMode = 'persistent';
    } catch {}
    inMemory = refs[0];
    measure({ touch_outcome: 'accepted', storage_mode: storageMode });
    return inMemory;
  }
  try { localStorage.removeItem(KEY); } catch {}
  return '';
}
