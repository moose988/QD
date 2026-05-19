// POST /api/quote-verify  { id, passcode } → { quote } or 401
// Public. Hashes input, compares to stored hash. Strips private fields before returning.

import { getDb } from './_lib/firebase.js';
import { verifyPasscode } from './_lib/quote-id.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const BRAND = {
  name: 'QD Systems',
  phone: '+971 50 534 9907',
  site: 'qdsystems.ae',
};

// Strip fields that should never leave the server.
function sanitize(quote) {
  const { passcodeHash, _passcodePlain, submissionId, ...safe } = quote;
  // Also remove any field starting with underscore (reserved for internal).
  for (const k of Object.keys(safe)) {
    if (k.startsWith('_')) delete safe[k];
  }
  return safe;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const id = (body?.id || '').toString().trim();
  const passcode = (body?.passcode || '').toString().trim();
  if (!id || !passcode) return res.status(400).json({ error: 'id and passcode are required' });

  const snap = await getDb().collection('quotes').doc(id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Quote not found' });

  const quote = snap.data();
  if (!verifyPasscode(passcode, quote.passcodeHash)) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }

  return res.status(200).json({ id, ...sanitize(quote), brand: BRAND });
}
