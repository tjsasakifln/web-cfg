const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-ops-'));
process.env.NODE_ENV = 'test';
process.env.LEAD_STORE_DIR = dir;
process.env.OPS_TOKEN = 'o'.repeat(32);
delete process.env.CONFENGE_STORAGE_DIR;
delete process.env.CONFENGE_STORAGE_BACKEND;
delete process.env.RUNTIME_PROFILE;
const { FileStore } = require('../../netlify/functions/lib/lead-store.cjs');
const { handler } = require('../../netlify/functions/ops.cjs');
const { summarizeReadyProjectLeads } = require('../../netlify/functions/lib/ready-project-ops.cjs');
const interest = { kind: 'license', product_id: null, city: 'Florianópolis', uf: 'SC',
  lot_width_m: 10, lot_depth_m: 25, lot_status: 'owned', bedrooms: '2', build_when: 'unknown' };
const fixture = { lead_id: 'lead_project_ops_fixture', record_kind: 'real', intent: 'ready_project_interest',
  route_family: 'ready_projects', project_interest: { ...interest, forbidden: 'not-for-export' },
  nome: 'Contato de ensaio', email: 'contato@example.com', received_at: new Date().toISOString(),
  commercial_stage: 'qualified', proposal_value: 123, stage_history: [] };
const call = (action, query = {}, token = process.env.OPS_TOKEN) => handler({ httpMethod: 'GET',
  headers: { origin: 'https://confenge.com.br', 'x-forwarded-for': '198.51.100.99',
    ...(token ? { authorization: `Bearer ${token}` } : {}) }, queryStringParameters: { action, ...query } });
test.before(async () => { await new FileStore(dir).put(fixture, { onlyIfNew: true }); });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('qualification and contact only through authenticated private DTO', async () => {
  for (const action of ['ready_projects', 'leads', 'lead']) {
    const blocked = await call(action, { id: fixture.lead_id, pii: '1' }, '');
    assert.equal(blocked.statusCode, 401);
    assert.doesNotMatch(blocked.body, /@example|Florianópolis|Contato de ensaio/);
  }
  const summary = await call('leads', { family: 'ready_projects', pii: '0' });
  assert.equal(summary.statusCode, 200);
  assert.doesNotMatch(summary.body, /@example|Florianópolis|Contato de ensaio|not-for-export/);
  const detail = JSON.parse((await call('lead', { id: fixture.lead_id, pii: '1' })).body).lead;
  assert.equal(detail.email, fixture.email);
  assert.deepEqual(detail.project_interest, interest);
  assert.equal((await call('leads', { family: 'unrecognized' })).statusCode, 400);
});

test('report excludes probes and distinguishes manual money from payment facts', async () => {
  const synthetic = { ...fixture, lead_id: 'synthetic', record_kind: 'synthetic', contract_value: 100000 };
  const service = { ...fixture, lead_id: 'service', project_interest: { ...interest, kind: 'adaptation' },
    commercial_stage: 'won', contract_value: 200, revenue_received: 100 };
  const summary = summarizeReadyProjectLeads([fixture, synthetic, service]);
  assert.equal(summary.total.contacts_received, 2);
  assert.equal(summary.license.contacts_received, 1);
  assert.equal(summary.additional_services.manual_values.received.value, 100);
  assert.equal(summary.license.manual_values.received.value, null);
  assert.equal(summary.total.contracts_registered, 1);
  assert.equal(summary.orders, undefined);
  const response = await call('ready_projects');
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(response.body, /@example|Florianópolis|Contato de ensaio/);
  assert.equal(JSON.parse(response.body).contacts.total.contacts_received, 1);
});

test('private export keeps qualification, provenance and manual gaps', async () => {
  const { toExportRecord, filterLeads, buildExportPackage } = await import('../../scripts/revops/export_leads.mjs');
  const row = toExportRecord(fixture);
  assert.deepEqual(row.project_interest, interest);
  assert.equal(row.proposal_value, 123);
  assert.equal(row.revenue_received, null);
  assert.equal(row.manual_finance.support_hours, null);
  assert.throws(() => filterLeads([fixture], { family: 'wrong' }), /unknown_family/);
  const pkg = buildExportPackage([fixture, { ...fixture, record_kind: 'synthetic' },
    { ...fixture, record_kind: 'real', test_mode: true, utm_source: 'synthetic' }, { lead_id: 'unrelated' }],
    { kind: 'real', family: 'ready_projects' });
  assert.equal(pkg.records.length, 1);
  assert.equal(pkg.filters.family, 'ready_projects');
});
