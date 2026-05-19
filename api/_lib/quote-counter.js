import { getDb } from './firebase.js';

// Reads quotes_meta/counter inside a transaction, increments, returns "Q-YYYY-NNN".
// Auto-resets the counter on year change.

export async function getNextQuoteNumber() {
  const db = getDb();
  const ref = db.collection('quotes_meta').doc('counter');
  const year = new Date().getUTCFullYear();

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let cur = snap.exists ? snap.data() : { year, nextNumber: 1 };
    if (cur.year !== year) cur = { year, nextNumber: 1 };
    const number = cur.nextNumber;
    tx.set(ref, { year, nextNumber: number + 1 });
    return { year, number };
  });

  return `Q-${next.year}-${String(next.number).padStart(3, '0')}`;
}
