import { getDb } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { changeLedger, PARTNERS } from '../app/lib/shared-ledger.js';
import { randomUUID } from 'node:crypto';
export function createSharedLedgerHandler({ dbProvider = getDb, authenticate = requireAdmin } = {}) {
return async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  let user; try { user = await authenticate(req); } catch { return res.status(401).json({error:'Unauthorized'}); }
  const actor = String(user.email || '').toLowerCase();
  const db = dbProvider();
  const ref = db.collection('adminSharedLedger').doc('main');
  try {
    if (req.method === 'GET') { const snap = await ref.get(); return res.json(snap.exists ? snap.data() : {shares:[0,0], entries:[], bills:[]}); }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const ledger = snap.exists ? snap.data() : {shares:[0,0], entries:[], bills:[]};
      const entries = [...(ledger.entries || [])], bills = [...(ledger.bills || [])];
      let next = {...ledger, entries, bills};
      const now = new Date().toISOString(); const note = String(body.note || '').trim().slice(0,120);
      const rawAmount = String(body.amount ?? '').trim();
      if (body.type !== 'pay-bill' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error('Enter an amount with up to two decimal places.');
      const amount = Math.round(Number(rawAmount) * 100);
      if (body.type === 'bill') {
        if (!note || !Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(body.due || '')) throw new Error('Enter a description, amount and due date.');
        bills.unshift({id:randomUUID(), note, amount, due:body.due, monthly:body.monthly === 'on', paid:false, actor});
      } else {
        let value = amount, description = note;
        if (body.type === 'pay-bill') { const bill = bills.find(b=>b.id===body.id); if (!bill || bill.paid || bill.due !== body.due) throw new Error('This reminder has already changed; refresh and try again.'); value = bill.amount; description = bill.note; if (bill.monthly) { const [y,m,d] = bill.due.split('-').map(Number); const last = new Date(Date.UTC(y,m+1,0)).getUTCDate(); bill.due = `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`; } else { bill.paid = true; bill.paidAt = now; } }
        if (body.type === 'withdraw' && bills.some(b=>!b.paid && b.due <= new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()))) throw new Error('Pay outstanding due bills before withdrawing.');
        const action = body.type === 'pay-bill' ? 'expense' : body.type;
        if (!PARTNERS.includes(actor)) throw new Error('Unknown partner.');
        const partnerIndex = PARTNERS.indexOf(actor);
        const override = action === 'withdraw' && body.allowOverShare === true && value > next.shares[partnerIndex];
        if (action === 'withdraw' && body.allowOverShare === true && (!Array.isArray(body.expectedShares) || body.expectedShares.length !== 2 || body.expectedShares.some((share, i) => share !== next.shares[i]))) throw new Error('The balance changed. Refresh and review the withdrawal again.');
        const takenFromPartner = override ? value - next.shares[partnerIndex] : 0;
        next = changeLedger(next, {type:action, amount:value, actor, allowOverShare:override});
        entries.unshift({id:randomUUID(), type:action, amount:value, note:description, actor, at:now, ...(override ? {overShare:true, takenFromPartner} : {})});
      }
      tx.set(ref, next); return next;
    });
    return res.json(result);
  } catch(e) { return res.status(400).json({error:e.message || 'Ledger request failed.'}); }
}
}

export default createSharedLedgerHandler();
