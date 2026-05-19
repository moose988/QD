// api/_lib/firebase.js
// Firebase Admin init for Vercel serverless. Module-scoped so it persists across warm invocations.

import admin from 'firebase-admin';

let _db = null;

export function getDb() {
  if (_db) return _db;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT env var is missing. Set it in Vercel project settings (and .env.local for local dev).'
    );
  }

  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + err.message);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }

  _db = admin.firestore();
  return _db;
}

export { admin };
