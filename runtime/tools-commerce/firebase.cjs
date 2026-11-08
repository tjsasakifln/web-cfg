const { check } = require('./policy.cjs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const sdk = createRequire(join(__dirname, 'deps/package.json'));

function createFirebase(config) {
  const { getApps, initializeApp, applicationDefault } = sdk('firebase-admin/app');
  const { getAuth } = sdk('firebase-admin/auth');
  const { initializeFirestore } = sdk('firebase-admin/firestore');
  const name = `confenge-tools-${config.mode}-${config.projectId}`;
  let app = getApps().find(candidate => candidate.name === name);
  if (!app) {
    app = initializeApp({ projectId: config.projectId,
      ...(config.mode !== 'emulator' ? { credential: applicationDefault() } : {}) }, name);
  }
  const auth = getAuth(app);
  const db = initializeFirestore(app, { preferRest: config.mode !== 'emulator' });
  return { db, async authenticate(token) {
    let user;
    try { user = await auth.verifyIdToken(token, true); }
    catch (error) {
      if (['auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token', 'auth/id-token-expired',
        'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code)) check(false, 'AUTH_REQUIRED', 401);
      throw error;
    }
    check(typeof user.uid === 'string' && user.uid.length > 0, 'AUTH_REQUIRED', 401);
    check(user.email_verified === true && typeof user.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(user.email) && user.email.length <= 254,
      'EMAIL_UNVERIFIED', 403);
    if (config.mode === 'sandbox') check(config.sandboxUids.includes(user.uid), 'SANDBOX_RESTRICTED', 403);
    return { uid: user.uid, email: user.email };
  } };
}

module.exports = { createFirebase, sdk };
