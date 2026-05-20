// api/_lib/firebase.js
// Firebase Admin init for Vercel serverless. Module-scoped so it persists across warm invocations.

import admin from 'firebase-admin';

let _app = null;
let _db = null;

function getCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'Firebase Admin env vars are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel.'
    );
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + err.message);
  }
}

export function getAdminApp() {
  if (_app) return _app;

  if (!admin.apps.length) {
    _app = admin.initializeApp({
      credential: admin.credential.cert(getCredentials())
    });
  } else {
    _app = admin.app();
  }

  return _app;
}

export function getDb() {
  if (_db) return _db;
  _db = getAdminApp().firestore();
  return _db;
}

export { admin };
