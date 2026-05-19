import crypto from 'node:crypto';

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
  const salt = process.env.QUOTE_PASSCODE_SALT;
  if (!salt) throw new Error('QUOTE_PASSCODE_SALT env var is required');
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
