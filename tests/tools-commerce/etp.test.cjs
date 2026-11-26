const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createCommerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { ETP_TOOL, ETP_FORMAT, ETP_STATES, etpSettings } = require('../../runtime/tools-commerce/etp-policy.cjs');
const { accountId, sha } = require('../../runtime/tools-commerce/policy.cjs');
const { SECTIONS, normalizeInput, gaps } = require('../../runtime/tools-commerce/etp-input.cjs');
const { agentRequest, callAgent, verifyDocument } = require('../../runtime/tools-commerce/etp-agent.cjs');
const { localArtifact } = require('../../runtime/tools-commerce/exports.cjs');
const { operations, verifyEvidence, VERSION } = require('../../runtime/tools-commerce/economics.cjs');

// Reads must precede writes, as in the Firebase transaction implementation.
const memDb = () => {
  const rows = new Map();
  let tail = Promise.resolve();
  const ref = path => ({
    path, collection: name => ({ doc: id => ref(path + '/' + name + '/' + id) }),
    async get() { return { data: () => structuredClone(rows.get(path)) }; },
  });
  const db = {
    collection: name => ({ doc: id => ref(name + '/' + id) }),
    runTransaction(fn) {
      const run = tail.then(async () => {
        const writes = [];
        const tx = {
          async get(r) { assert.equal(writes.length, 0, 'read after a write in Firestore transaction'); return r.get(); },
          set(r, v) { writes.push(() => rows.set(r.path, structuredClone(v))); },
          create(r, v) { writes.push(() => { assert.equal(rows.has(r.path), false); rows.set(r.path, structuredClone(v)); }); },
          update(r, v) { writes.push(() => { assert.ok(rows.has(r.path)); rows.set(r.path, { ...rows.get(r.path), ...structuredClone(v) }); }); },
        };
        const result = await fn(tx);
        for (const w of writes) w();
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return { db, rows };
};
const draft = () => ({
  identification: { organization: 'Prefeitura Exemplo', title: 'Recomposição dos computadores da biblioteca' },
  profile: { sphere: 'municipal', objectType: 'bens' },
  answers: {
    I: { text: 'O público precisa de postos de consulta para acessar o catálogo da biblioteca.' },
    II: { status: 'omitted', text: 'O ente não elaborou plano de contratação neste exercício.' },
    III: { text: 'Os equipamentos devem admitir uso do catálogo pelo navegador e oferecer garantia local.' },
    IV: { text: 'Estimam-se 20 computadores para as mesas abertas ao público.', support: { calculation: '20 postos multiplicados por um computador por posto.', source: 'F1' } },
    V: { text: 'A pesquisa comparou compra, locação e recuperação dos equipamentos atuais.' },
    VI: { text: 'O valor estimado informado é de R$ 30.000.', support: { calculation: '20 unidades ao custo de R$ 1.500 cada.', source: 'F1', unitPrices: 'Computador a R$ 1.500 por unidade.' } },
    VII: { text: 'A solução proposta é aquisição com entrega, instalação e garantia no local.' },
    VIII: { text: 'Lote único para manter a instalação e a garantia sob a mesma gestão.' },
    IX: { text: 'O resultado pretendido é retomar o acesso ao catálogo sem aumentar as filas.' },
    X: { text: 'Antes da contratação, providenciar instalação elétrica e pontos de rede.' },
    XI: { status: 'omitted', text: 'A equipe verificou que não há outro contrato necessário para disponibilizar os computadores.' },
    XII: { text: 'A equipe separará os equipamentos antigos para o programa de descarte de eletrônicos.' },
    XIII: { text: 'A contratação é adequada à necessidade, condicionada à adequação prévia da infraestrutura elétrica.' },
  },
  sources: [{ id: 'F1', name: 'Inventário e pesquisa simplificada', locator: 'Páginas 2 e 4', text: 'Planilha de inventário e pesquisa com preços por item, preparada pela equipe.' }],
});
const sampleOutput = input => ({
  sections: SECTIONS.filter(s => input.answers[s.id] && input.answers[s.id].status !== 'omitted').map(({ id }) => ({
    id, paragraphs: [id === 'IV' ? 'A estimativa é proporcional às mesas disponíveis para o público.' :
      id === 'VI' ? 'A estimativa tem por base a pesquisa de preços por equipamento.' : input.answers[id].text], sourceIds: id === 'IV' || id === 'VI' ? ['F1'] : [],
  })),
});
const defaultProvider = async ({ request }) => {
  const data = JSON.parse(request.body.input);
  return {
    output: request.body.max_output_tokens > 1000 ? sampleOutput(data) : { questions: [
      { id: 'I', question: 'Onde o público consulta o catálogo atualmente?', why: 'A resposta explicita o impacto atual da demanda.' },
    ] }, actualMicros: 1200,
  };
};
const setup = async ({ provider = defaultProvider, renderer, budget = '500', enabled = '1' } = {}) => {
  const { db, rows } = memDb();
  const cfg = { mode: 'emulator', identityKey: randomBytes(32), firebase: { apiKey: 'public' }, sharedExportsEnabled: true };
  const env = { CONFENGE_ETP_ENABLED: enabled, OPENAI_API_KEY: 'sk-' + 'x'.repeat(40), CONFENGE_ETP_MONTHLY_BUDGET_USD_CENTS: budget };
  let now = Date.parse('2026-11-26T12:00:00-03:00');
  const http = createCommerceHttp({ config: cfg, env, clock: () => now, onIncident: () => {}, etpProvider: provider, etpRenderer: renderer,
    firebaseFactory: () => ({ db, async authenticate(uid) { return { uid, email: uid + '@example.test' }; } }) });
  const api = async (op, body, { owner = 'a', method = 'POST', origin = 'http://localhost:8790' } = {}) => {
    const result = await http.api({ path: '/api/web/tool-credits', httpMethod: method, queryStringParameters: { op },
      ...(body ? { body: JSON.stringify(body) } : {}), headers: { authorization: owner && 'Bearer ' + owner, origin, 'content-type': 'application/json' } });
    return { code: result.statusCode, body: JSON.parse(result.body), headers: result.headers };
  };
  const getAccount = owner => api('account', null, { owner, method: 'GET' });
  const changeClock = delta => { now += delta; };
  const dep = http.getDependencies(http.config());
  await api('account', {}, { owner: 'a' });
  await api('account', {}, { owner: 'b' });
  return { api, getAccount, dep, rows, cfg, env, changeClock };
};
const preparedSubjects = new WeakMap();
const prepare = async (api, input = draft(), requestId = randomUUID(), owner = 'a') => {
  if (!preparedSubjects.has(api)) preparedSubjects.set(api, new Set());
  const seen = preparedSubjects.get(api);
  const witness = JSON.stringify([owner, input.identification, input.profile, input.answers.VI.support.classified]);
  if (!seen.has(witness)) {
    const i = await api('etp-interview', { input, consent: true }, { owner });
    assert.equal(i.code, 200, JSON.stringify(i.body));
    seen.add(witness);
  }
  const data = { requestId, input, consent: true };
  const p = await api('etp-prepare', data, { owner });
  assert.equal(p.code, 200, JSON.stringify(p.body));
  assert.equal(p.body.quote.credits, 1);
  return { data, generate: { ...data, authorization: p.body.quote.token }, requestId };
};

test('private route requires verified account origin and explicit processing consent; incomplete data does not call provider', async () => {
  let call = 0;
  const { api } = await setup({ provider: input => { call++; return defaultProvider(input); } });
  assert.ok((await api('config', null, { method: 'GET' })).body.tools.includes(ETP_TOOL));
  assert.equal((await api('etp-interview', { input: {}, consent: true }, { owner: '' })).code, 401);
  assert.equal((await api('etp-interview', { input: {}, consent: true }, { origin: 'https://other.test' })).code, 403);
  assert.equal((await api('etp-interview', { input: {}, consent: false })).body.error, 'ETP_DATA_CONSENT_REQUIRED');
  const privacy = await api('etp-interview', { input: { identification: { title: 'CPF 529.982.247-25' } }, consent: true });
  assert.equal(privacy.body.error, 'ETP_PRIVATE_INPUT');
  assert.equal((await api('etp-prepare', { input: {}, consent: true, requestId: randomUUID() })).body.error, 'ETP_INCOMPLETE');
  assert.equal((await api('etp-prepare', { input: draft(), consent: true, requestId: randomUUID() })).body.error, 'ETP_INTERVIEW_REQUIRED');
  assert.equal(call, 0);
  const questions = await api('etp-interview', { input: {}, consent: true });
  assert.equal(questions.code, 200);
  assert.ok(questions.body.questions.length && questions.body.gaps.length);
  assert.equal((await api('etp-prepare', { input: draft(), consent: true, requestId: randomUUID() })).body.error, 'ETP_INTERVIEW_REQUIRED');
});

test('both valid formats and wallet debit are atomic, same request and repeat downloads do not debit twice', async () => {
  let starts = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { api, dep, rows, getAccount, changeClock } = await setup({ provider: async request => {
    if (request.request.body.max_output_tokens > 1000) { starts++; await pending; }
    return defaultProvider(request);
  } });
  const { generate, requestId } = await prepare(api);
  const opts = { requestId };
  assert.deepEqual((await Promise.all([api('etp-generate', generate), api('etp-generate', generate)])).map(r => r.code), [202, 202]);
  assert.equal(starts, 1);
  const other = await prepare(api);
  assert.equal((await api('etp-generate', other.generate)).body.error, 'ETP_ACTIVE_REQUEST');
  assert.equal((await api('etp-result', opts)).body.status, 'working');
  assert.equal((await getAccount()).body.freeRemaining, 2);
  assert.equal((await api('etp-result', opts, { owner: 'b' })).body.status, 'missing');
  release();
  await dep.etp.drain();
  const first = await api('etp-result', opts), again = await api('etp-result', opts);
  assert.equal(first.body.status, 'ready', JSON.stringify(first.body));
  assert.equal(first.headers['Cache-Control'], 'private, no-store');
  assert.equal(first.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(Buffer.from(first.body.files.docx, 'base64').subarray(0,2).toString(), 'PK');
  assert.equal(Buffer.from(first.body.files.pdf, 'base64').subarray(0,5).toString(), '%PDF-');
  assert.deepEqual(first.body.files, again.body.files);
  assert.equal((await getAccount()).body.freeRemaining, 1);
  assert.equal((await api('etp-generate', generate)).body.status, 'ready');
  const changed = draft();
  changed.identification.title += ' novo';
  assert.equal((await api('etp-generate', { ...generate, input: changed })).body.error, 'REQUEST_CONFLICT');
  const key = [...rows.keys()].find(k => k.includes('/' + ETP_STATES + '/'));
  assert.ok(key && !JSON.stringify(rows.get(key)).includes('Prefeitura Exemplo'));
  changeClock(25 * 3600 * 1000);
  assert.equal((await api('etp-result', opts)).code, 410);
  assert.equal((await getAccount()).body.freeRemaining, 1);
});

test('generation or render failure never debits; wrong consent cannot start model and local export cannot bypass it', async () => {
  let calls = 0;
  const { api, getAccount, dep, cfg } = await setup({
    provider: request => { if (request.request.body.max_output_tokens > 1000) calls++; return defaultProvider(request); },
    renderer: () => ({ docx: Buffer.from('invalid'), pdf: Buffer.from('invalid') }),
  });
  const { generate, requestId } = await prepare(api);
  const broken = await api('etp-generate', { ...generate, authorization: 'fake' });
  assert.equal(broken.body.error, 'EXPORT_CONFIRMATION_REQUIRED');
  assert.equal(calls, 0);
  assert.throws(() => localArtifact(ETP_TOOL, { bytes: 42, sha256: '0'.repeat(64), format: ETP_FORMAT }, cfg.identityKey), /INVALID_EXPORT/);
  await api('etp-generate', generate);
  await dep.etp.drain();
  assert.equal((await api('etp-result', { requestId })).body.error, 'ETP_ARTIFACT_FAILED');
  assert.equal((await getAccount()).body.freeRemaining, 2);
  assert.equal(calls, 1);
});

test('bucket change after creation saves completed files for explicit reconfirmation without rerunning the model', async () => {
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { dep, api, getAccount, rows } = await setup({ provider: async request => {
    if (request.request.body.max_output_tokens > 1000) { calls++; await wait; }
    return defaultProvider(request);
  } });
  const { generate, data } = await prepare(api);
  await api('etp-generate', generate);
  for (let i = 0; i < 2; i++) await dep.ledger.completeExport({ uid:'a', requestId:randomUUID(), toolId:'calculadora-bdi', digest:sha('other '+i) });
  release();
  await dep.etp.drain();
  assert.equal((await api('etp-result', { requestId: data.requestId })).body.status, 'confirm');
  const wallet = 'toolsCommerce/v1-emulator/accounts/' + accountId('a');
  rows.get(wallet).promo = 1;
  const { generate: retry } = await prepare(api, data.input, data.requestId);
  assert.equal((await api('etp-generate', retry)).body.status, 'ready');
  assert.equal((await api('etp-result', { requestId: data.requestId })).body.status, 'ready');
  assert.equal((await getAccount()).body.promo, 0);
  assert.equal(calls, 1);
});

test('persistent provider spend budget fails closed across accounts; new paid usage remains independently bounded', async () => {
  let calls = 0;
  const { api, dep } = await setup({ budget:'12', provider: request => { if (request.request.body.max_output_tokens > 1000) calls++; return defaultProvider(request); } });
  const a = await prepare(api);
  await api('etp-generate', a.generate);
  await dep.etp.drain();
  const b = await prepare(api);
  await api('etp-generate', b.generate);
  await dep.etp.drain();
  const c = await prepare(api, draft(), randomUUID(), 'b');
  const rejected = await api('etp-generate', c.generate, { owner:'b' });
  assert.equal(rejected.body.error, 'ETP_BUDGET_PAUSED');
  assert.equal(calls, 2);
});

test('provider request is bounded, private, tool-free and rejects incomplete or false output', async () => {
  const input = normalizeInput(draft());
  assert.equal(gaps(input).length, 0);
  const request = agentRequest('generate', input);
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.strict, true);
    assert.ok(!body.input.includes('Prefeitura Exemplo'));
    assert.ok(!init.body.includes('sk-test-key'));
    return new Response(JSON.stringify({ status:'incomplete', usage:{ input_tokens: 200, output_tokens: 500 }, output:[] }));
  };
  await assert.rejects(callAgent({ key:'sk-test-key', fetchImpl, request }), /ETP_PROVIDER_RESPONSE/);
  const out = sampleOutput(input);
  out.sections[0].paragraphs.push('O contrato tem prazo de 999 dias e foi publicado.');
  assert.throws(() => verifyDocument(out, input), /ETP_UNSUPPORTED_FACT/);
  const absent = sampleOutput(input);
  absent.sections.pop();
  assert.throws(() => verifyDocument(absent, input), /ETP_PROVIDER_RESPONSE/);
  const badSource = sampleOutput(input);
  badSource.sections[0].sourceIds = ['F3'];
  assert.throws(() => verifyDocument(badSource, input), /ETP_PROVIDER_RESPONSE/);
});

test('classified estimate never reaches either agent; public document has only the explanation and custody reference', () => {
  const raw = draft();
  raw.sources = [];
  raw.answers.IV.support.source = 'Inventário da biblioteca pág. 3.';
  raw.answers.VI = { text:'A Administração mantém o orçamento reservado para preservar a competitividade.',
    support:{ classified:true, source:'Peça reservada de referência interna NR-TESTE.' } };
  const input = normalizeInput(raw);
  assert.equal(gaps(input).length, 0);
  for (const op of ['interview','generate']) {
    const request = agentRequest(op, input, []);
    assert.ok(!request.body.input.includes('NR-TESTE'));
    assert.ok(!JSON.parse(request.body.input).answers.VI);
  }
  const view = sampleOutput(input);
  view.sections = view.sections.filter(s => s.id !== 'VI').map(s => ({ ...s, sourceIds:[] }));
  const rendered = verifyDocument(view, input);
  assert.match(rendered.sections.find(s => s.id === 'VI').paragraphs.at(-1), /NR-TESTE/);
  view.sections[0].paragraphs.push('A medida custará dez mil reais por período.');
  assert.throws(() => verifyDocument(view, input), /ETP_UNSUPPORTED_FACT/);
});

test('new ETP economics is additive and not approved by old evidence or for experiments', () => {
  const id = ETP_TOOL + ':' + ETP_FORMAT, now = Date.now();
  const offer = { id:'confenge-pro', amountCents:4990, credits:6 };
  const basis = 'conservative_estimate', sourceRef = 'Referência verificável';
  const op = { basis, sourceRef, cpuMs:1000, peakMemoryBytes:1, storageBytes:20, transferBytes:20, externalApiCents:50,
    upperVariableCents:70, maxPayloadBytes:10240, maxDailyExports:4, experimentalApproved:true };
  const data = { schema:VERSION, offerId:offer.id, amountCents:offer.amountCents, credits:offer.credits, observedAt:now, approvedBy:'Equipe aprovadora',
    sourceRef, cycleCosts:Object.fromEntries(['recurringPaymentFees','taxes','refundProvision','support','fixedVariableInfrastructure']
      .map(k => [k, { basis, sourceRef, upperCents:10 }])), operations:Object.fromEntries(Object.keys(operations).filter(x => x !== id).map(k => [k, op])) };
  assert.equal(verifyEvidence(data, offer, now).approved, true);
  assert.equal(verifyEvidence(data, offer, now).operationLimits[id], undefined);
  data.operations[id] = op;
  assert.equal(verifyEvidence(data, offer, now).operationLimits[id].experimentalApproved, false);
  data.operations[id] = { ...op, upperVariableCents:86 };
  assert.equal(verifyEvidence(data, offer, now).approved, false);
  assert.equal(etpSettings({ CONFENGE_ETP_ENABLED:'1', OPENAI_API_KEY:'sk-' + 'x'.repeat(40), CONFENGE_ETP_MONTHLY_BUDGET_USD_CENTS:'500' },
    { mode:'live' }).enabled, false);
});
