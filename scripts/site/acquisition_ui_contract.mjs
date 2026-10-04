// Shared predicates for the browser gate and its adversarial controls.
export function footerMatches(observed, expected) {
  return Array.isArray(observed) && JSON.stringify(observed) === JSON.stringify(
    expected.map(({ heading, links }) => ({ heading, links })),
  );
}

export function proposalAnchorErrors(actual, expected, emitted) {
  const errors = [];
  if (actual?.count !== 1) errors.push("proposal_anchor_count");
  if (actual?.href !== expected.href || actual?.targetCount !== 1) errors.push("proposal_anchor_target");
  if (actual?.position !== "hero") errors.push("proposal_anchor_position");
  if (actual?.family !== expected.route_family || actual?.asset !== expected.asset_id) errors.push("proposal_anchor_context");
  if (emitted?.count !== 1) errors.push("proposal_event_count");
  const event = emitted?.event;
  if (event?.event !== "cta_click" || event?.cta_id !== expected.id || event?.page_path !== expected.route
    || event?.route_family !== expected.route_family || event?.asset_id !== expected.asset_id
    || event?.destination_type !== "form" || event?.cta_position !== "hero") errors.push("proposal_event_context");
  if (emitted?.hasPiiKey !== false || emitted?.hasPiiValue !== false) errors.push("proposal_event_pii");
  return errors;
}
