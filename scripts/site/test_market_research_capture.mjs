import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'parse5';
const require = createRequire(import.meta.url);
const core = require('../../netlify/functions/lib/lead-core.cjs');
const { mapLeadToInboundV1 } = require('../../netlify/functions/lib/inbound-handoff.cjs');

const nav = readFileSync(new URL('../../js/modules/nav.js', import.meta.url), 'utf8');
const start = nav.indexOf('const HOME_SITUATIONS =');
const end = nav.indexOf('\n    const homeSituation', start);
assert.ok(start >= 0 && end > start, 'exercise the shipped situation table');
const context = {};
vm.runInNewContext(nav.slice(start, end) + '; this.research = HOME_SITUATIONS["pesquisa de mercado"];', context);
assert.equal(context.research.journey, 'outro');
assert.equal(context.research.ladder, false);
assert.match(context.research.placeholder, /decisão/);
assert.doesNotMatch(context.research.placeholder, /Edital|glosa|engenharia/);

const proofSlugs = ['relacoes-compradores-fornecedores', 'composicao-contratos-amostra', 'fornecedores-climatizacao-contratos-publicos'];
for (const slug of ['orgaos', 'mercados', 'concorrencia', 'acompanhamento', 'precos', 'pesquisa-sob-encomenda', ...proofSlugs]) {
  const route = `/inteligencia/${slug}/`;
  const html = readFileSync(new URL(`../../inteligencia/${slug}/index.html`, import.meta.url), 'utf8');
  const nodes = (node) => [node, ...(node.childNodes || []).flatMap(nodes)];
  const attrs = (node) => Object.fromEntries((node.attrs || []).map(({name, value}) => [name, value]));
  const forms = nodes(parse(html)).filter(node => node.tagName === 'form' && Object.hasOwn(attrs(node), 'data-capture-form'));
  assert.equal(forms.length, 1, 'one canonical capture per research route');
  const hiddenNodes = nodes(forms[0]).filter(node => node.tagName === 'input' && attrs(node).type === 'hidden');
  const fields = Object.fromEntries(hiddenNodes.map(node => [attrs(node).name, attrs(node).value]));
  assert.ok(hiddenNodes.some(node => attrs(node).name === 'estagio' && attrs(node).id === 'estagio'), 'shipped runtime can read the actual research stage');
  const normalized = core.validateAndNormalize({
    ...fields,
    nome: 'SYNTHETIC-UNIT', email: 'probe@example.com',
    mensagem: 'Decisão sobre produto, território e utilização institucional.',
    consentimento: true,
  });
  assert.equal(normalized.ok, true, slug);
  assert.equal(normalized.lead.jornada, 'outro');
  const version = slug === 'fornecedores-climatizacao-contratos-publicos' ? 'climatizacao-sample.v1' : proofSlugs.includes(slug) ? 'market-intelligence-sample.v1' : null;
  assert.equal(normalized.lead.evidence_pack_version, version);
  const wire = mapLeadToInboundV1({ ...normalized.lead, lead_id: 'unit-research-12345', received_at: '2026-10-14T12:00:00Z' });
  assert.equal(wire.source, 'CONFENGE_WEB');
  assert.equal(wire.route_family, 'inteligencia-mercado');
  assert.match(wire.message, /pesquisa de mercado/);
  if (version) assert.ok(wire.message.includes(version));
  else assert.ok(!wire.message.includes('im-20261014-v1'), 'campaign/form version is not presented as a research pack');
  if (proofSlugs.includes(slug)) {
    assert.equal(normalized.lead.analysis_cutoff, '2026-10-14');
    assert.match(wire.message, /data de corte=2026-10-14/);
  }
}
console.log('PASS nine research route contexts: generic journey, scope, version and canonical source reach the existing handoff; all three proof cutoffs survive.');
