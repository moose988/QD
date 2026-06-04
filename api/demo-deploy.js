import { getDb } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }

    const demoId = String(body?.demoId || '').trim();
    if (!demoId) return res.status(400).json({ error: 'demoId is required' });

    const docSnap = await getDb().collection('clientDemos').doc(demoId).get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Demo not found' });

    const demo = docSnap.data() || {};
    if (!demo.deployHookUrl) return res.status(400).json({ error: 'No deploy hook URL saved for this demo' });

    const upstream = await fetch(String(demo.deployHookUrl), { method: 'POST' });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Deploy hook request failed' });
    }

    return res.status(200).json({ triggered: true });
  } catch (error) {
    const status = /Missing bearer token|Unauthorized access/i.test(error?.message || '') ? 401 : 500;
    console.error('[demo-deploy] failed:', error);
    return res.status(status).json({ error: error.message || 'Internal server error' });
  }
}
