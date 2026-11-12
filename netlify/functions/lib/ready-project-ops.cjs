/** Private operational projection. Never a second commercial ledger. */
const { filterCommercialLeads } = require('./record-kind.cjs');

const INTEREST_KEYS = Object.freeze([
  'kind', 'product_id', 'city', 'uf', 'lot_width_m', 'lot_depth_m',
  'lot_status', 'bedrooms', 'build_when',
]);

function projectInterestProjection(record) {
  if (record?.intent !== 'ready_project_interest' || !record.project_interest ||
      typeof record.project_interest !== 'object') return null;
  const value = record.project_interest;
  if (!['license', 'adaptation', 'complementary', 'custom'].includes(value.kind)) return null;
  return Object.fromEntries(INTEREST_KEYS.map(key => [key, value[key] ?? null]));
}

function isReadyProjectLead(record) {
  return Boolean(projectInterestProjection(record));
}

function summarizeReadyProjectLeads(records) {
  const rows = filterCommercialLeads(records || []).filter(isReadyProjectLead);
  const qualified = new Set(['qualified', 'meeting', 'proposal', 'won']);
  const sum = (items, key) => {
    const values = items.map(row => row[key]).filter(value =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0);
    return { value: values.length ? values.reduce((total, value) => total + value, 0) : null, records: values.length };
  };
  const group = items => ({
    contacts_received: items.length,
    contacts_qualified: items.filter(row => qualified.has(row.commercial_stage) ||
      (Array.isArray(row.stage_history) ? row.stage_history : []).some(entry => qualified.has(entry.to))).length,
    contracts_registered: items.filter(row => row.commercial_stage === 'won').length,
    stages: items.reduce((out, row) => {
      const stage = row.commercial_stage || 'lead_persisted';
      out[stage] = (out[stage] || 0) + 1;
      return out;
    }, {}),
    manual_values: {
      proposal: sum(items, 'proposal_value'),
      contracted: sum(items, 'contract_value'),
      received: sum(items, 'revenue_received'),
    },
  });
  return {
    schema_version: 'ready-project-contacts/v1',
    commercial_only: true,
    total: group(rows),
    license: group(rows.filter(row => row.project_interest.kind === 'license')),
    additional_services: group(rows.filter(row => row.project_interest.kind !== 'license')),
    payment_and_delivery_source: 'project-commerce authenticated report; not inferred from contact stages',
    manual_not_collected_here: ['payment_fees', 'acquisition_expenses', 'support_hours'],
  };
}

module.exports = { INTEREST_KEYS, projectInterestProjection, isReadyProjectLead, summarizeReadyProjectLeads };
