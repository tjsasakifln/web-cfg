/**
 * Adversarial local admit: forwards PII keys instead of calling shipped scrubProps.
 */
module.exports = {
  admitPassthrough(raw) {
    return { ok: true, event: raw.event, props: { ...(raw.props || raw) } };
  },
};
