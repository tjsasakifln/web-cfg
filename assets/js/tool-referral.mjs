const KEY = 'confenge-tool-referral-v1';
const DURATION_MS = 30 * 864e5;
let inMemory;
export const validReferral = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16}$/.test(value);

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
    try { localStorage.setItem(KEY, JSON.stringify({ ref: refs[0], expires: Date.now() + DURATION_MS })); } catch {}
    inMemory = refs[0];
    return inMemory;
  }
  try { localStorage.removeItem(KEY); } catch {}
  return '';
}
