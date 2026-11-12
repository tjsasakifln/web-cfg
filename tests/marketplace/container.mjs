#!/usr/bin/env node
// Exercise the production image and unmodified Compose on an isolated CI runner.
// Never point this script at a deployment host or reuse its disposable volumes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deploy = join(root, 'deploy/netcup/marketplace');
const secrets = new Set();
let activeChild;
let interrupted;
let cleaning = false;

function sanitize(value) {
  let text = String(value).replace(/\x1b\[[0-9;]*m/g, '');
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) text = text.split(secret).join('[redacted]');
  return text.replace(/\b(?:pk_|sk_|rk_|whsec_)[A-Za-z0-9_-]+/g, '[redacted-key]');
}

// Preserve diagnostics without streaming environment values or seed output.
async function run(label, command, args, { env, input, timeout = 180000, quiet = false } = {}) {
  if (interrupted && !cleaning) throw interrupted;
  if (!quiet) console.log(label);
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
    activeChild = child;
    let output = '', failed;
    const collect = chunk => { output = (output + chunk.toString('utf8')).slice(-2 * 1024 * 1024); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const heartbeat = setInterval(() => { if (!quiet) console.log(`Still running: ${label}`); }, 30000);
    let forceKill;
    const timer = setTimeout(() => {
      failed = new Error(`${label}: timed out`);
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);
    const finished = () => {
      clearInterval(heartbeat); clearTimeout(timer); clearTimeout(forceKill);
      if (activeChild === child) activeChild = undefined;
    };
    child.once('error', error => { finished(); rejectRun(new Error(`${label}: ${error.code || 'could not start'}`)); });
    child.once('close', (code, signal) => {
      finished();
      if (interrupted && !cleaning) return rejectRun(interrupted);
      if (failed || code !== 0) {
        const detail = sanitize(output).slice(-12000);
        return rejectRun(new Error(`${failed?.message || `${label}: exit ${code ?? signal}`}\n${detail}`));
      }
      resolveRun(output);
    });
  });
}

function parseEnv(text) {
  return Object.fromEntries(text.split('\n').filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=');
    assert.ok(index > 0, 'Generated configuration must use KEY=value');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

function parseSetup(output) {
  const records = output.split('\n').filter(line => line.startsWith('MARKETPLACE_SETUP '));
  assert.equal(records.length, 1, 'Each seed must return one infrastructure record');
  const record = JSON.parse(records[0].slice('MARKETPLACE_SETUP '.length));
  assert.deepEqual(Object.keys(record).sort(), ['publishable_key', 'sales_channel_id', 'store_id']);
  assert.match(record.store_id, /^store_[A-Za-z0-9]+$/);
  assert.match(record.sales_channel_id, /^sc_[A-Za-z0-9]+$/);
  assert.match(record.publishable_key, /^pk_[A-Za-z0-9_-]+$/);
  secrets.add(record.publishable_key);
  return record;
}

function onSignal(signal) {
  interrupted ||= new Error(`Container validation interrupted by ${signal}`);
  if (!cleaning) activeChild?.kill('SIGTERM');
}
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

async function main() {
  // A deliberate CI-only guard makes the destructive final cleanup unsuitable
  // for a production shell, even if somebody copies this command from CI logs.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Container validation only runs in GitHub Actions');
  assert.equal(process.env.RUNNER_OS, 'Linux', 'A disposable Linux CI runner is required');
  assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
  assert.match(process.env.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
  assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST === 'unix:///var/run/docker.sock', 'Remote Docker is forbidden');
  assert.ok(!process.env.DOCKER_CONTEXT || process.env.DOCKER_CONTEXT === 'default', 'A remote Docker context is forbidden');
  const suffix = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${randomBytes(6).toString('hex')}`;
  const project = `confenge-marketplace-ci-${suffix}`;
  assert.match(project, /^confenge-marketplace-ci-\d+-\d+-[a-f0-9]{12}$/);
  const image = `confenge-marketplace-ci:${suffix}`;
  const directory = await mkdtemp(join(tmpdir(), `${project}-`));
  await chmod(directory, 0o700);
  const runtimeFile = join(directory, 'runtime.env');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:MARKETPLACE_|ENGINEERING_MARKETPLACE_|STRIPE_|COMPOSE_|DOCKER_HOST$|DOCKER_CONTEXT$|DATABASE_URL$|REDIS_URL$|JWT_SECRET$|COOKIE_SECRET$|MEDUSA_WORKER_MODE$)/.test(key)) delete env[key];
  }
  Object.assign(env, { DOCKER_HOST: 'unix:///var/run/docker.sock', MARKETPLACE_IMAGE: image, COMPOSE_DISABLE_ENV_FILE: '1' });
  const composeArgs = ['compose', '--project-name', project, '--env-file', join(directory, 'compose.env'), '--file', join(deploy, 'compose.yaml')];
  const compose = (label, args, options = {}) => run(label, 'docker', [...composeArgs, ...args], { env, ...options });
  let composeConfigured = false;
  let failure;
  console.log(`Disposable Compose project: ${project}`);
  try {
    await run('Checking Docker Compose', 'docker', ['compose', 'version', '--short'], { env });
    // The production generator still requires a registry digest. This explicit
    // non-resolving CI placeholder is never used as an image: only this process
    // overrides MARKETPLACE_IMAGE with the unique locally built tag above.
    await run('Generating disposable disabled configuration', 'python3', [join(deploy, 'init-config.py'), '--directory', directory, '--image', `ci.invalid/marketplace@sha256:${'0'.repeat(64)}`], { env });
    const runtime = parseEnv(await readFile(runtimeFile, 'utf8'));
    const generated = parseEnv(await readFile(join(directory, 'compose.env'), 'utf8'));
    const gateway = parseEnv(await readFile(join(directory, 'gateway.env'), 'utf8'));
    for (const values of [runtime, generated, gateway]) {
      for (const [key, value] of Object.entries(values)) if (value && /SECRET|PASSWORD|_KEY$|DATABASE_URL|REDIS_URL/.test(key)) secrets.add(value);
    }
    assert.equal(runtime.NODE_ENV, 'production');
    assert.equal(runtime.MARKETPLACE_PAYMENTS_ENABLED, 'false');
    assert.equal(runtime.MARKETPLACE_PAYMENT_MODE, 'test');
    assert.equal(runtime.MEDUSA_DISABLE_TELEMETRY, 'true');
    assert.equal(runtime.MERCUR_DISABLE_TELEMETRY, 'true');
    assert.equal(gateway.ENGINEERING_MARKETPLACE_MODE, 'off');
    for (const [key, value] of Object.entries(runtime)) if (key.startsWith('STRIPE_')) assert.equal(value, '', 'Stripe credentials are forbidden in this check');
    const db = new URL(runtime.DATABASE_URL), redis = new URL(runtime.REDIS_URL);
    assert.equal(db.username, 'marketplace'); assert.equal(db.hostname, 'postgres'); assert.equal(db.pathname, '/marketplace');
    assert.equal(redis.hostname, 'redis'); assert.ok(redis.password);
    await compose('Validating the production Compose without printing configuration', ['config', '--quiet']);
    composeConfigured = true;
    await run('Building the actual pruned production image', 'docker', ['build', '--pull', '--progress=plain', '--tag', image, '--file', join(root, 'apps/engineering-marketplace/Dockerfile'), join(root, 'apps/engineering-marketplace')], { env, timeout: 900000 });
    await compose('Starting isolated PostgreSQL and Redis', ['up', '-d', '--wait', '--wait-timeout', '150', 'postgres', 'redis'], { timeout: 240000 });
    await compose('Migrating with the compiled production CLI', ['run', '--rm', '-T', '--no-deps', 'tools', 'db:migrate'], { timeout: 300000 });
    const first = parseSetup(await compose('Seeding compiled production infrastructure', ['run', '--rm', '-T', '--no-deps', 'tools', 'exec', './src/scripts/setup.js'], { timeout: 240000 }));
    const second = parseSetup(await compose('Repeating the seed to verify idempotency', ['run', '--rm', '-T', '--no-deps', 'tools', 'exec', './src/scripts/setup.js'], { timeout: 240000 }));
    assert.deepEqual(second, first, 'Repeated setup must reuse the store, sales channel and publishable key');
    const original = await readFile(runtimeFile, 'utf8');
    assert.equal(original.split('\n').filter(line => line.startsWith('MARKETPLACE_READINESS_PUBLISHABLE_KEY=')).length, 1);
    await writeFile(runtimeFile, original.replace(/^MARKETPLACE_READINESS_PUBLISHABLE_KEY=.*$/m, `MARKETPLACE_READINESS_PUBLISHABLE_KEY=${first.publishable_key}`), { mode: 0o600 });
    await compose('Starting the production API and worker with read-only filesystems', ['up', '-d', '--wait', '--wait-timeout', '240', 'api', 'worker'], { timeout: 300000 });
    for (const service of ['api', 'worker']) {
      const id = (await compose(`Identifying the ${service} container`, ['ps', '-q', service], { quiet: true })).trim();
      assert.match(id, /^[a-f0-9]{12,64}$/);
      // Inspect selected non-secret fields only, never .Config.Env or full JSON.
      const state = JSON.parse(await run(`Checking ${service} container restrictions`, 'docker', ['inspect', '--format', '{"read_only":{{json .HostConfig.ReadonlyRootfs}},"user":{{json .Config.User}},"tmpfs":{{json .HostConfig.Tmpfs}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}', id], { env }));
      assert.equal(state.project, project); assert.equal(state.read_only, true); assert.equal(state.user, 'node');
      assert.ok(state.tmpfs['/tmp']); assert.ok(state.tmpfs['/home/node/.config']);
      await compose(`Checking ${service} production environment and HTTP health`, ['exec', '-T', service, 'node'], { input: `
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.equal(process.version, 'v22.22.2');
assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.MEDUSA_WORKER_MODE, '${service === 'api' ? 'server' : 'worker'}');
assert.equal(process.getuid(), 1000);
assert.equal(process.env.MARKETPLACE_PAYMENTS_ENABLED, 'false');
assert.equal(process.env.MARKETPLACE_PAYMENT_MODE, 'test');
assert.ok(process.env.REDIS_URL);
for (const [key, value] of Object.entries(process.env)) if (key.startsWith('STRIPE_')) assert.equal(value, '');
for (const file of ['medusa-config.js', 'src/scripts/setup.js', 'config/domain.cjs', 'config/intents.json']) assert.ok(fs.existsSync('/app/' + file));
assert.throws(() => require.resolve('ts-node'), {code:'MODULE_NOT_FOUND'});
fetch('http://127.0.0.1:9000/health', {signal:AbortSignal.timeout(10000)}).then(response => {
  assert.equal(response.status, 200); console.log('Production mode and health verified.');
}).catch(() => { console.error('Production HTTP health failed.'); process.exitCode = 1; });
` });
    }
    await compose('Verifying the application database has no administrator privileges', ['exec', '-T', 'api', 'node'], { input: `
const assert = require('node:assert/strict');
const { Client } = require('pg');
const client = new Client({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:10000});
(async () => {
  try {
    await client.connect();
    const {rows} = await client.query('SELECT current_user AS username, current_database() AS database, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
    assert.deepEqual(rows, [{username:'marketplace', database:'marketplace', rolsuper:false, rolcreatedb:false, rolcreaterole:false}]);
    console.log('Application database privileges verified.');
  } finally { await client.end(); }
})().catch(() => { console.error('Application database privilege verification failed.'); process.exitCode = 1; });
` });
    await compose('Running the authenticated deployment readiness probe', ['exec', '-T', 'api', 'node'], { input: await readFile(join(deploy, 'ready.cjs'), 'utf8') });
    await compose('Verifying payment-disabled configuration and private access', ['exec', '-T', 'api', 'node'], { input: `
const assert = require('node:assert/strict');
const url = 'http://127.0.0.1:9000/store/engineering/config';
(async () => {
  const response = await fetch(url, {headers:{'x-publishable-api-key':process.env.MARKETPLACE_READINESS_PUBLISHABLE_KEY,'x-confenge-gateway-key':process.env.MARKETPLACE_GATEWAY_KEY},signal:AbortSignal.timeout(10000)});
  assert.equal(response.status, 200);
  const configuration = await response.json();
  assert.equal(configuration.paymentsEnabled, false); assert.equal(configuration.payment_mode, 'test'); assert.equal(configuration.commission_bps, null);
  const denied = await fetch(url, {headers:{'x-publishable-api-key':process.env.MARKETPLACE_READINESS_PUBLISHABLE_KEY},signal:AbortSignal.timeout(10000)});
  assert.equal(denied.ok, false);
  console.log('Disabled payments and private access verified.');
})().catch(() => { console.error('Private configuration verification failed.'); process.exitCode = 1; });
` });
    console.log('Production container checks passed: compiled/pruned image, migrations, idempotent seed, restricted API/worker, PostgreSQL/Redis and authenticated database readiness. No payment provider was configured.');
  } catch (error) {
    failure = error;
  } finally {
    cleaning = true;
    if (composeConfigured) {
      // Recheck the prefix immediately before any volume deletion. A random,
      // explicit project name prevents touching a production Compose project.
      assert.match(project, /^confenge-marketplace-ci-\d+-\d+-[a-f0-9]{12}$/);
      if (failure) {
        try {
          const logs = await compose('Collecting bounded, redacted CI container diagnostics', ['logs', '--no-color', '--tail', '60', 'api', 'worker', 'postgres', 'redis'], { quiet: true, timeout: 30000 });
          console.error(sanitize(logs).slice(-16000));
        } catch { console.error('CI container diagnostics were unavailable.'); }
      }
      try { await compose('Removing only the disposable CI project and its volumes', ['down', '--volumes', '--remove-orphans', '--timeout', '20'], { timeout: 120000 }); }
      catch (error) { failure ||= error; }
    }
    try { await run('Removing the local CI image', 'docker', ['image', 'rm', '--force', image], { env, quiet: true, timeout: 30000 }); }
    catch { /* A failed build may never have created this exclusive image. */ }
    await rm(directory, { recursive: true, force: true });
  }
  if (failure) throw failure;
  if (interrupted) throw interrupted;
}

main().catch(error => { console.error(sanitize(error.message)); process.exitCode = 1; });
