// api/_lib/firebase.js
// Firebase Admin init for Vercel serverless. Module-scoped so it persists across warm invocations.

import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '.env.local') });

let _app = null;
let _db = null;
let _auth = null;
let _missingEnvLogged = false;

const REQUIRED_FIREBASE_ENV = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

function getMissingFirebaseEnv() {
  return REQUIRED_FIREBASE_ENV.filter((name) => {
    const value = process.env[name];
    return typeof value !== 'string' || !value.trim();
  });
}

function createFirebaseEnvError(missing) {
  if (!_missingEnvLogged) {
    console.error(
      [
        '[firebase-admin] Missing Firebase Admin environment variables.',
        `[firebase-admin] Missing: ${missing.join(', ')}`,
        '[firebase-admin] Local dev: add them to the root .env.local file and restart `vercel dev`.',
        '[firebase-admin] FIREBASE_PRIVATE_KEY must stay quoted and keep its escaped \\n sequences.'
      ].join('\n')
    );
    _missingEnvLogged = true;
  }

  return new Error(
    `Firebase Admin env vars are missing: ${missing.join(', ')}. Add them to the root .env.local file for \`vercel dev\` or to Vercel project env vars.`
  );
}

// Local convenience: .env.local often holds one FIREBASE_SERVICE_ACCOUNT JSON
// (used by scripts/build-kb.mjs) instead of the three split variables.
function getServiceAccountFallback() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  } catch {
    return null;
  }
}

function getCredentials() {
  const missing = getMissingFirebaseEnv();
  if (missing.length) {
    const fallback = getServiceAccountFallback();
    if (fallback) return fallback;
    throw createFirebaseEnvError(missing);
  }

  const credentials = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  };
  return credentials;
}

export function getAdminApp() {
  if (_app) return _app;

  try {
    if (!admin.apps.length) {
      console.log('[firebase-admin] initializing app for project:', process.env.FIREBASE_PROJECT_ID || '(missing)');
      _app = admin.initializeApp({
        credential: admin.credential.cert(getCredentials())
      });
    } else {
      console.log('[firebase-admin] reusing existing app instance');
      _app = admin.app();
    }
  } catch (error) {
    if (!_missingEnvLogged && /Firebase Admin env vars are missing/.test(error?.message || '')) {
      console.error('[firebase-admin] initialization failed:', error.message);
      _missingEnvLogged = true;
    }
    throw error;
  }

  return _app;
}

export function getDb() {
  if (_db) return _db;
  console.log('[firebase-admin] creating firestore client');
  _db = getAdminApp().firestore();
  return _db;
}

export function getAuth() {
  if (_auth) return _auth;
  console.log('[firebase-admin] creating auth client');
  _auth = getAdminApp().auth();
  return _auth;
}

export { admin };
