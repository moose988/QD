import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Belt-and-suspenders: make sure .env.local is loaded no matter how the server was
// started (node _dev-server, `vercel dev`, or a stale process that booted before the
// var existed). Runs once, only if the salt isn't already in the environment, so it's
// a no-op in production where QUOTE_PASSCODE_SALT comes from the platform env.
let _envChecked = false;
function ensureEnvLoaded() {
  if (_envChecked) return;
  _envChecked = true;
  if (process.env.QUOTE_PASSCODE_SALT) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../.env.local'),     // repo root from api/_lib/
    path.resolve(process.cwd(), '.env.local')   // launch directory
  ];
  for (const candidate of candidates) {
    dotenv.config({ path: candidate });
    if (process.env.QUOTE_PASSCODE_SALT) break;
  }
}

// 16 hex chars = 64 bits of entropy. Unguessable for QD's scale.
export function generateQuoteId() {
  return crypto.randomBytes(8).toString('hex');
}

// 6-digit numeric. Easy for clients to type on a phone.
export function generatePasscode() {
  // Inclusive [100000, 999999]
  return String(crypto.randomInt(100000, 1000000));
}

function getSalt() {
  ensureEnvLoaded();
  const salt = process.env.QUOTE_PASSCODE_SALT;
  if (!salt) {
    throw new Error(
      'QUOTE_PASSCODE_SALT env var is required. Add it to the root .env.local file before running `vercel dev`.'
    );
  }
  return salt;
}

export function hashPasscode(plain) {
  return crypto.createHash('sha256').update(getSalt() + ':' + String(plain)).digest('hex');
}

export function verifyPasscode(plain, expectedHash) {
  if (!plain || !expectedHash) return false;
  const actual = hashPasscode(plain);
  // Timing-safe compare
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
