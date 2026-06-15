import { getDb, admin } from './firebase.js';

export async function logQuoteAudit({
  action,
  quoteId,
  quoteNumber,
  actor,
  details,
  metadata = {}
}) {
  if (!action || !quoteId) return;
  await getDb().collection('adminActivityLogs').add({
    action,
    page: 'admin',
    targetType: 'quote',
    targetId: String(quoteId),
    targetLabel: String(quoteNumber || quoteId),
    actorEmail: String(actor?.email || '').toLowerCase(),
    actorUid: String(actor?.uid || ''),
    details: String(details || ''),
    metadata: {
      details: String(details || ''),
      ...metadata
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
