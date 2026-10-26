// GET /api/health
//   no auth            -> { ok: true }                      cheap liveness ping for uptime monitors (no data, no external calls)
//   admin or cron auth -> full report                       env, Groq models, knowledge base, last-24h counts
//   ?alert=1 + cron    -> same, and emails the admins when status is not "ok" (Vercel cron, daily)

import { getDb } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { getQueryParam } from './_lib/quote-admin.js';
import { getAdminRecipients, safeError, sendZohoMail } from './_lib/zoho-mail.js';
import { checkEnv, checkGroq, checkKnowledgeBase, checkActivity, getConfiguredModels, summarize, formatAlert } from './_lib/health.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

function bearerToken(req) {
  const authorization = String(req.headers.authorization || req.headers.Authorization || '').trim();
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
}

function hasCronSecret(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const given = bearerToken(req) || String(req.headers['x-cron-secret'] || getQueryParam(req, 'secret') || '').trim();
  return given === expected;
}

async function isAuthorized(req) {
  if (hasCronSecret(req)) return { cron: true };
  try {
    await requireAdmin(req);
    return { cron: false };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = bearerToken(req) || req.headers['x-cron-secret'] || getQueryParam(req, 'secret') ? await isAuthorized(req) : null;
  if (!auth) {
    return res.status(200).json({ ok: true, service: 'qd-web', time: new Date().toISOString() });
  }

  try {
    const env = checkEnv();
    const { primary, fallbacks } = getConfiguredModels();
    let db = null;
    try { db = getDb(); } catch { /* reported by the knowledge-base check */ }

    const [groq, knowledgeBase, activity] = await Promise.all([
      checkGroq({ apiKey: process.env.GROQ_API_KEY, primary, fallbacks }),
      db ? checkKnowledgeBase({ db }) : { ok: false, firestore: false, issues: ['Firestore is not configured.'] },
      db ? checkActivity({ db }) : { ok: false, issues: [] },
    ]);

    const report = { env, groq, knowledgeBase, activity };
    const { status, issues } = summarize(report);
    const checkedAt = new Date().toISOString();

    let alerted = false;
    if (auth.cron && getQueryParam(req, 'alert') === '1' && status !== 'ok') {
      const recipients = getAdminRecipients();
      if (recipients.length) {
        await sendZohoMail({ to: recipients, subject: `QD chatbot health: ${status}`, text: formatAlert({ status, issues, checkedAt }) });
        alerted = true;
      }
    }

    return res.status(200).json({ ok: status === 'ok', status, checkedAt, alerted, issues, ...report });
  } catch (error) {
    console.error('[health] failed:', safeError(error));
    return res.status(500).json({ ok: false, status: 'down', error: 'Health check crashed' });
  }
}
