import { getDb } from '../firebase.js';
import { getQueryParam } from '../quote-admin.js';


const serializeTimestamp = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isExpired = (value) => {
  if (!value) return false;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const slug = String(getQueryParam(req, 'slug') || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const db = getDb();
    const snapshot = await db.collection('clientDemos').where('slug', '==', slug).limit(1).get();
    if (snapshot.empty) {
      return res.status(200).json({ available: false, reason: 'not_found' });
    }

    const demo = snapshot.docs[0].data() || {};
    if (demo.status !== 'active') {
      return res.status(200).json({ available: false, reason: demo.status || 'draft' });
    }

    if (isExpired(demo.expiresAt)) {
      return res.status(200).json({ available: false, reason: 'expired' });
    }

    return res.status(200).json({
      available: true,
      title: demo.title || '',
      clientName: demo.clientName || '',
      status: demo.status || 'draft',
      expiresAt: serializeTimestamp(demo.expiresAt)
    });
  } catch (error) {
    console.error('[demo-get] failed:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
