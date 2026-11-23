const SHARE_SOURCES = ['confenge_share', 'whatsapp', 'linkedin'];
const RESULTS = ['ready', 'failed', 'edited', 'exported'];

function sizeBand(size) {
  if (!Number.isFinite(size) || size <= 0) return 'none';
  if (size <= 1024 ** 2) return 'up-to-1-mib';
  if (size <= 10 * 1024 ** 2) return 'up-to-10-mib';
  return 'over-10-mib';
}

export function createToolMetrics(toolId) {
  const query = new URLSearchParams(location.search);
  const shared = query.getAll('utm_medium').join(',') === 'referral'
    && query.getAll('utm_campaign').join(',') === 'ferramentas'
    && SHARE_SOURCES.includes(query.getAll('utm_source').join(','));
  const entry = shared ? 'share' : 'other';
  const device = matchMedia('(max-width: 660px)').matches ? 'compact' : 'wide';
  const emit = (step, details = {}) => {
    try {
      window.confengeTrack?.('tool_workflow_step', {
        tool_id: toolId, step, entry, device, ...details,
      });
    } catch {
      // Measurement must never delay an editor action or a local download.
    }
  };
  emit('view');
  let active;
  return {
    start(format, input, size) {
      const details = { format, input, size_band: sizeBand(size) };
      const started = performance.now();
      const observed = new Set();
      emit('started', details);
      active = {
        finish(step) {
          if (!RESULTS.includes(step) || observed.has(step)) return;
          observed.add(step);
          if (step === 'ready' || step === 'failed') {
            const elapsed = performance.now() - started;
            emit(step, {
              ...details,
              duration_band: elapsed < 2000 ? 'under-2s' : elapsed < 8000 ? 'under-8s' : '8s-or-more',
            });
          } else {
            emit(step, details);
          }
        },
      };
      return active;
    },
    finish(step) {
      active?.finish(step);
    },
  };
}
