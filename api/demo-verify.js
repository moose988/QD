import crypto from 'node:crypto';
import { getDb, admin } from './_lib/firebase.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const attemptStore = new Map();

const getAttemptKey = (slug, ip) => `${slug}::${ip}`;

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  return forwarded || realIp || req.socket?.remoteAddress || 'unknown';
};

const getAttemptState = (slug, ip) => {
  const key = getAttemptKey(slug, ip);
  const now = Date.now();
  const current = attemptStore.get(key);
  if (!current || current.expiresAt <= now) {
    const next = { count: 0, expiresAt: now + ATTEMPT_WINDOW_MS };
    attemptStore.set(key, next);
    return next;
  }
  return current;
};

const recordFailedAttempt = (slug, ip) => {
  const current = getAttemptState(slug, ip);
  current.count += 1;
  attemptStore.set(getAttemptKey(slug, ip), current);
  return current.count;
};

const clearAttempts = (slug, ip) => {
  attemptStore.delete(getAttemptKey(slug, ip));
};

const isExpired = (value) => {
  if (!value) return false;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

// Must match the client-side admin hashing exactly: UTF-8 string -> SHA-256 -> lowercase hex.
const sha256 = (value) => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }

    const slug = String(body?.slug || '').trim().toLowerCase();
    const passcode = String(body?.passcode || '');
    if (!slug || !passcode) return res.status(400).json({ error: 'slug and passcode are required' });

    const ip = getClientIp(req);
    const currentAttempts = getAttemptState(slug, ip);
    if (currentAttempts.count >= MAX_FAILED_ATTEMPTS) {
      return res.status(429).json({ success: false, blocked: true });
    }

    const db = getDb();
    const snapshot = await db.collection('clientDemos').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) return res.status(200).json({ success: false });

    const docSnap = snapshot.docs[0];
    const demo = docSnap.data() || {};
    if (demo.status !== 'active' || isExpired(demo.expiresAt)) {
      return res.status(200).json({ success: false });
    }

    if (sha256(passcode) !== String(demo.passcodeHash || '')) {
      const failedCount = recordFailedAttempt(slug, ip);
      if (failedCount >= MAX_FAILED_ATTEMPTS) {
        return res.status(429).json({ success: false, blocked: true });
      }
      return res.status(200).json({ success: false });
    }

    clearAttempts(slug, ip);
    await docSnap.ref.set({
      viewCount: admin.firestore.FieldValue.increment(1),
      lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      success: true,
      demoUrl: demo.demoUrl || ''
    });
  } catch (error) {
    console.error('[demo-verify] failed:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
