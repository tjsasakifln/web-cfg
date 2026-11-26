const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { check, UUID, sha, mac, accountId } = require('./policy.cjs');
const { verify } = require('./export-consent.cjs');
const { normalizeInput, gaps, privacyGaps } = require('./etp-input.cjs');
const { ETP_TOOL, ETP_FORMAT, ETP_STATES, ETP_EXPORT_READY, retentionMs } = require('./etp-policy.cjs');
const { renderEtp } = require('./etp-documents.cjs');
const { agentRequest, callAgent, verifyInterview, verifyDocument } = require('./etp-agent.cjs');

const leaseMs = 150_000;
const maxArtifactBytes = 512 * 1024;
const maxAttempts = 2;
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' });
const getDay = now => calendar.format(now);
const get = async (tx, ref) => (await tx.get(ref)).data();
const validKeys = (input, keys) => input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === keys.length &&
  keys.every(k => Object.hasOwn(input, k));
const formatReply = (statusCode, body) => ({ statusCode, body });
const expires = j => j.deleteAfter?.toMillis?.() ?? new Date(j.deleteAfter).valueOf();
const validFiles = ({ docx, pdf }) => Buffer.isBuffer(docx) && Buffer.isBuffer(pdf) && docx.subarray(0,4).equals(Buffer.from('504b0304','hex')) &&
  pdf.subarray(0,5).toString('ascii') === '%PDF-' && docx.length + pdf.length <= maxArtifactBytes;
const recoverable = new Set(['EXPORT_CONFIRMATION_REQUIRED', 'EXPORT_CONFIRMATION_CHANGED', 'NO_CREDITS', 'OPERATION_LIMIT']);
const jobFailures = new Set(['ETP_PROVIDER_RESPONSE', 'ETP_PROVIDER_UNAVAILABLE', 'ETP_UNSUPPORTED_FACT', 'ETP_ARTIFACT_FAILED']);

function createEtpService({ db, cfg, ledger, clock = Date.now, provider = callAgent,
  renderer = renderEtp, notify = () => {} }) {
  const root = db.collection('toolsCommerce').doc('v1-' + cfg.mode);
  const doc = (kind, id) => root.collection(kind).doc(id);
  const encryptionKey = Buffer.from(mac(cfg.identityKey, 'etp-encryption-v1', cfg.mode), 'hex');
  const jobId = (uid, requestId) => sha('export\0' + accountId(uid) + '\0' + requestId);
  const jobRef = (uid, requestId) => doc(ETP_STATES, jobId(uid, requestId));
  const usageRef = uid => doc('etpUsage', accountId(uid));
  const interviewSubject = input => mac(cfg.identityKey, 'etp-interview-subject-v1', JSON.stringify([
    input.identification.organization, input.identification.title, input.profile.sphere, input.profile.objectType,
    input.profile.sisp, input.profile.federalTransfer, input.answers.VI.support.classified,
  ]));
  const digestOf = (input, requestId) => mac(cfg.identityKey, 'etp-input-v1', JSON.stringify([requestId, input]));
  const packing = { toolId: ETP_TOOL, format: ETP_FORMAT };
  const aad = (uid, requestId, digest) => Buffer.from([cfg.mode, jobId(uid, requestId), digest].join(':'));
  const inflight = new Map();

  function seal(files, scope) {
    check(validFiles(files), 'ETP_ARTIFACT_FAILED', 502);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(scope);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(files.docx.length);
    const data = Buffer.concat([cipher.update(Buffer.concat([length, files.docx, files.pdf])), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }
  function unseal(blob, scope) {
    const sealed = Buffer.from(blob);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, sealed.subarray(0, 12));
    decipher.setAAD(scope);
    decipher.setAuthTag(sealed.subarray(12, 28));
    const files = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
    const boundary = files.readUInt32BE(0) + 4;
    const out = { docx: files.subarray(4, boundary), pdf: files.subarray(boundary) };
    check(validFiles(out), 'ETP_ARTIFACT_FAILED', 502);
    return { docx: out.docx.toString('base64'), pdf: out.pdf.toString('base64') };
  }
  function checkJob(j, digest, now) {
    if (!j) return;
    check(j.digest === digest, 'REQUEST_CONFLICT', 409);
    check(expires(j) > now, 'ETP_EXPIRED', 410);
  }
  async function reserve(tx, uid, op, amount, settings, now, active) {
    const day = getDay(now);
    const userRef = usageRef(uid);
    const budget = doc('etpBudgets', day.slice(0, 7));
    const storedUser = await get(tx, userRef);
    const used = storedUser?.day === day ? storedUser : { day, interview: 0, generate: 0 };
    const spend = await get(tx, budget) || { reservedMicros: 0, interviewMicros: 0, requests: 0, completed: 0, observedMicros: 0 };
    const concurrency = storedUser?.active;
    if (active) check(!concurrency || concurrency.until <= now, 'ETP_ACTIVE_REQUEST', 409);
    check(used[op] < (op === 'interview' ? 6 : 4), 'ETP_DAILY_LIMIT', 429);
    check(spend.reservedMicros + amount <= settings.budgetMicros &&
      (op !== 'interview' || spend.interviewMicros + amount <= Math.floor(settings.budgetMicros / 4)), 'ETP_BUDGET_PAUSED', 503);
    tx.set(userRef, { ...used, ...(storedUser?.interviewProof ? { interviewProof: storedUser.interviewProof } : {}), ...(active || concurrency ? { active: active || concurrency } : {}), [op]: used[op] + 1 });
    tx.set(budget, { ...spend, requests: spend.requests + 1, reservedMicros: spend.reservedMicros + amount,
      interviewMicros: spend.interviewMicros + (op === 'interview' ? amount : 0) });
    return budget;
  }
  async function observe(ref, observedMicros) {
    if (!Number.isSafeInteger(observedMicros) || observedMicros < 0) return;
    try { await db.runTransaction(async tx => {
      const before = await get(tx, ref);
      if (before) tx.update(ref, { completed: before.completed + 1, observedMicros: before.observedMicros + observedMicros });
    }); } catch { notify('ETP_OBSERVATION_UNAVAILABLE'); }
  }

  async function result(uid, requestId, includeFiles = true) {
    const j = (await jobRef(uid, requestId).get()).data();
    const now = clock();
    if (!j) return formatReply(200, { status: 'missing' });
    if (expires(j) <= now) return formatReply(410, { status: 'missing', error: 'ETP_EXPIRED' });
    if (j.state === 'ready') {
      const body = { status: 'ready', expiresAt: expires(j) };
      if (includeFiles) body.files = unseal(j.artifact, aad(uid, requestId, j.digest));
      return formatReply(200, body);
    }
    if (j.state === ETP_EXPORT_READY) return formatReply(200, { status: 'confirm' });
    if (j.state === 'working' && j.leaseUntil > now) return formatReply(200, { status: 'working' });
    return formatReply(200, { status: 'failed', error: j.failure || 'ETP_INTERRUPTED', retryable: j.attempts < maxAttempts });
  }

  async function complete(uid, requestId, job) {
    try {
      await ledger.completeExport({ uid, requestId, digest: job.digest, authorization: job.authorization, bytes: job.bytes, ...packing });
      return formatReply(200, { status: 'ready' });
    } catch (err) {
      if (recoverable.has(err?.message)) return formatReply(200, { status: 'confirm', error: err.message });
      throw err;
    }
  }
  async function continueJob({ uid, requestId, ref, lease, charge, request, input, settings, budget }) {
    let observed;
    try {
      const { output, actualMicros } = await provider({ key: settings.key, request });
      observed = actualMicros;
      const artifact = seal(renderer(verifyDocument(output, input)), aad(uid, requestId, charge.digest));
      const staged = await db.runTransaction(async tx => {
        const j = await get(tx, ref);
        if (j?.lease !== lease || j.state !== 'working' || j.leaseUntil <= clock()) return false;
        tx.update(ref, { artifact, state: ETP_EXPORT_READY, deleteAfter: new Date(clock() + retentionMs), leaseUntil: 0 });
        return true;
      });
      if (staged) await complete(uid, requestId, charge);
    } catch (error) {
      // The paid write is atomic with job readiness. On uncertain delivery a staged
      // artifact can be finalized with a fresh quote, without another model call.
      try {
        const failure = jobFailures.has(error?.message) ? error.message : 'ETP_INTERRUPTED';
        await db.runTransaction(async tx => {
          const j = await get(tx, ref);
          if (j?.lease === lease && j.state === 'working') tx.update(ref, { state: 'failed', failure, leaseUntil: 0 });
        });
        notify(failure);
      } catch { notify('ETP_JOB_STATE_UNAVAILABLE'); }
    } finally {
      await observe(budget, observed);
      try {
        const userRef = usageRef(uid);
        await db.runTransaction(async tx => {
          const user = await get(tx, userRef);
          if (user?.active?.lease === lease) tx.update(userRef, { active: null });
        });
      } catch { notify('ETP_LOCK_RELEASE_UNAVAILABLE'); }
    }
  }
  async function interview(uid, input, settings) {
    const missing = gaps(input);
    const account = await ledger.account(uid);
    check(!account.blocked, 'ACCOUNT_BLOCKED', 409);
    const request = agentRequest('interview', input, missing);
    const budget = await db.runTransaction(tx => reserve(tx, uid, 'interview', request.reservedMicros, settings, clock()));
    const { output, actualMicros } = await provider({ key: settings.key, request });
    // Measurement must not add provider latency to the HTTP handler.
    void observe(budget, actualMicros);
    const questions = verifyInterview(output);
    const ref = usageRef(uid);
    await db.runTransaction(async tx => {
      const user = await get(tx, ref);
      const now = clock();
      if (user) tx.update(ref, { interviewProof: { subject: interviewSubject(input), until: now + 3 * 60 * 60 * 1000 } });
    });
    return formatReply(200, { gaps: missing, questions });
  }
  async function handle(op, user, payload, settings) {
    const uid = user.uid;
    if (op === 'etp-result') {
      check(validKeys(payload, ['requestId']) && typeof payload.requestId === 'string' && UUID.test(payload.requestId), 'INVALID_REQUEST', 400);
      return result(uid, payload.requestId.toLowerCase());
    }
    check(settings.enabled, 'FEATURE_DISABLED', 404);
    const keys = op === 'etp-interview' ? ['input', 'consent'] : ['input', 'consent', 'requestId'];
    if (op === 'etp-generate') keys.push('authorization');
    check(validKeys(payload, keys), 'INVALID_REQUEST', 400);
    check(payload.consent === true, 'ETP_DATA_CONSENT_REQUIRED', 422);
    const input = normalizeInput(payload.input);
    if (op === 'etp-interview') {
      const privateData = privacyGaps(input);
      if (privateData.length) return formatReply(422, { error: 'ETP_PRIVATE_INPUT', gaps: privateData });
      return interview(uid, input, settings);
    }
    check(typeof payload.requestId === 'string' && UUID.test(payload.requestId), 'INVALID_REQUEST', 400);
    const requestId = payload.requestId.toLowerCase();
    const missing = gaps(input);
    if (missing.length) return formatReply(422, { error: 'ETP_INCOMPLETE', gaps: missing });
    const digest = digestOf(input, requestId);
    const bytes = Buffer.byteLength(JSON.stringify(input));
    const ref = jobRef(uid, requestId);
    const current = (await ref.get()).data();
    checkJob(current, digest, clock());
    if (op === 'etp-generate' && current?.state === 'ready') return formatReply(200, { status: 'ready' });
    if (op === 'etp-generate' && current?.state === 'working' && current.leaseUntil > clock()) return formatReply(202, { status: 'working' });
    if (!current) {
      const proof = (await usageRef(uid).get()).data()?.interviewProof;
      check(proof?.until > clock() && proof.subject === interviewSubject(input), 'ETP_INTERVIEW_REQUIRED', 409);
    }
    const quote = await ledger.quoteExport({ uid, requestId, digest, bytes, ...packing });
    if (op === 'etp-prepare') return formatReply(200, { quote });
    verify(cfg.identityKey, payload.authorization, { accountId: accountId(uid), exportId: jobId(uid, requestId),
      toolId: ETP_TOOL, digest, bucket: quote.bucket, source: JSON.parse(Buffer.from(quote.token.split('.')[0], 'base64url')).source }, clock());
    const charge = { digest, bytes, authorization: payload.authorization };
    if (current?.state === ETP_EXPORT_READY) return complete(uid, requestId, charge);
    check(!quote.recovery, 'ETP_EXPIRED', 410);
    const request = agentRequest('generate', input);
    const lease = randomBytes(16).toString('hex');
    const begin = await db.runTransaction(async tx => {
      const j = await get(tx, ref);
      const now = clock();
      checkJob(j, digest, now);
      if (j?.state === 'ready') return { status: 'ready' };
      if (j?.state === ETP_EXPORT_READY) return { status: 'staged' };
      if (j?.state === 'working' && j.leaseUntil > now) return { status: 'working' };
      check((j?.attempts || 0) < maxAttempts, 'ETP_RETRY_LIMIT', 429);
      const budget = await reserve(tx, uid, 'generate', request.reservedMicros, settings, now, { lease, until: now + leaseMs });
      tx.set(ref, { state: 'working', digest, attempts: (j?.attempts || 0) + 1,
        lease, leaseUntil: now + leaseMs, deleteAfter: new Date(now + retentionMs) });
      return { status: 'started', budget };
    });
    if (begin.status === 'staged') return complete(uid, requestId, charge);
    if (begin.status === 'ready') return formatReply(200, { status: 'ready' });
    if (begin.status === 'started') {
      const pending = continueJob({ uid, requestId, ref, lease, charge, request, input, settings, budget: begin.budget });
      inflight.set(ref.path, pending);
      void pending.finally(() => { if (inflight.get(ref.path) === pending) inflight.delete(ref.path); });
    }
    return formatReply(202, { status: 'working' });
  }
  return { handle, async drain() { await Promise.allSettled([...inflight.values()]); } };
}
module.exports = { createEtpService };
