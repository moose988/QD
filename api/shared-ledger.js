import { getDb } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { changeLedger, PARTNERS } from '../app/lib/shared-ledger.js';
import { randomUUID } from 'node:crypto';
async function getUsdRate() {
  const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/AED', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Exchange rate is unavailable. Please try again.');
  const data = await response.json();
  if (!Number.isFinite(data.rate) || data.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error('Exchange rate is unavailable. Please try again.');
  const age = Date.now() - Date.parse(data.date + 'T23:59:59Z');
  if (age > 4 * 86400000 || age < -86400000) throw new Error('Exchange rate is out of date. Please try again later.');
  return { rate: data.rate, date: data.date };
}
export function createSharedLedgerHandler({ dbProvider = getDb, authenticate = requireAdmin, rateProvider = getUsdRate } = {}) {
return async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  let user; try { user = await authenticate(req); } catch { return res.status(401).json({error:'Unauthorized'}); }
  const actor = String(user.email || '').toLowerCase();
  const db = dbProvider();
  const ref = db.collection('adminSharedLedger').doc('main');
  try {
    if (req.method === 'GET' && String(req.url || '').includes('rate=1')) return res.json(await rateProvider());
    if (req.method === 'GET') { const snap = await ref.get(); return res.json(snap.exists ? snap.data() : {shares:[0,0], entries:[], bills:[]}); }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const fx = body.currency === 'USD' || body.type === 'pay-bill' ? await (async () => {
      if (body.type === 'pay-bill') { const snap = await ref.get(); const bill = (snap.data()?.bills || []).find(b => b.id === body.id); if (bill?.currency !== 'USD') return null; }
      return rateProvider();
    })() : null;
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const ledger = snap.exists ? snap.data() : {shares:[0,0], entries:[], bills:[]};
      const entries = [...(ledger.entries || [])], bills = [...(ledger.bills || [])];
      let next = {...ledger, entries, bills};
      const now = new Date().toISOString(); const note = String(body.note || '').trim().slice(0,120);
      const rawAmount = String(body.amount ?? '').trim();
      if (body.type !== 'pay-bill' && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error('Enter an amount with up to two decimal places.');
      const originalAmount = Math.round(Number(rawAmount) * 100);
      if (body.currency && !['AED', 'USD'].includes(body.currency)) throw new Error('Unsupported currency.');
      const amount = body.currency === 'USD' ? Math.round(originalAmount * fx.rate) : originalAmount;
      const currencyDetails = body.currency === 'USD' ? {currency:'USD', originalAmount, exchangeRate:fx.rate, rateDate:fx.date} : {};
      if (body.type === 'bill') {
        if (!note || !Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(body.due || '')) throw new Error('Enter a description, amount and due date.');
        const repeatMonths = body.monthly === 'on' ? Number(body.repeatMonths ?? 1) : 0;
        if (!Number.isInteger(repeatMonths) || repeatMonths < 0 || repeatMonths > 12 || (body.monthly === 'on' && repeatMonths < 1)) throw new Error('Choose a repeat interval from 1 to 12 months.');
        bills.unshift({id:randomUUID(), note, amount, due:body.due, monthly:repeatMonths > 0, repeatMonths, repeatDay:Number(body.due.slice(-2)), paid:false, actor, ...currencyDetails});
        entries.unshift({id:randomUUID(), type:'bill', amount, note, actor, at:now, due:body.due, repeatMonths, ...currencyDetails});
      } else {
        let value = amount, description = note, entryCurrency = currencyDetails;
        if (body.type === 'pay-bill') { const bill = bills.find(b=>b.id===body.id); if (!bill || bill.paid || bill.due !== body.due) throw new Error('This reminder has already changed; refresh and try again.'); if (bill.currency === 'USD') { if (!fx) throw new Error('Exchange rate is unavailable. Please refresh and try again.'); value = Math.round(bill.originalAmount * fx.rate); entryCurrency = {currency:'USD', originalAmount:bill.originalAmount, exchangeRate:fx.rate, rateDate:fx.date}; } else value = bill.amount; description = bill.note; if (bill.monthly) { const [y,m,d] = bill.due.split('-').map(Number); const interval = bill.repeatMonths || 1; const target = new Date(Date.UTC(y, m - 1 + interval, 1)); const year = target.getUTCFullYear(), month = target.getUTCMonth() + 1; const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); bill.due = `${year}-${String(month).padStart(2,'0')}-${String(Math.min(bill.repeatDay || d,last)).padStart(2,'0')}`; } else { bill.paid = true; bill.paidAt = now; } }
        if (body.type === 'withdraw' && bills.some(b=>!b.paid && b.due <= new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()))) throw new Error('Pay outstanding due bills before withdrawing.');
        const action = body.type === 'pay-bill' ? 'expense' : body.type;
        if (!PARTNERS.includes(actor)) throw new Error('Unknown partner.');
        const partnerIndex = PARTNERS.indexOf(actor);
        const override = action === 'withdraw' && body.allowOverShare === true && value > next.shares[partnerIndex];
        if (action === 'withdraw' && body.allowOverShare === true && (!Array.isArray(body.expectedShares) || body.expectedShares.length !== 2 || body.expectedShares.some((share, i) => share !== next.shares[i]))) throw new Error('The balance changed. Refresh and review the withdrawal again.');
        const takenFromPartner = override ? value - Math.max(0, next.shares[partnerIndex]) : 0;
        next = changeLedger(next, {type:action, amount:value, actor, allowOverShare:override});
        entries.unshift({id:randomUUID(), type:body.type === 'pay-bill' ? 'pay-bill' : action, amount:value, note:description, actor, at:now, ...entryCurrency, ...(override ? {overShare:true, takenFromPartner} : {})});
      }
      const record = entries[0];
      const actionNames = {deposit:'bank_deposit', withdraw:'bank_withdraw', expense:'bank_expense', bill:'bank_reminder_created', 'pay-bill':'bank_reminder_paid'};
      const metadata = { amountAED: (record.amount / 100).toFixed(2), ...(record.currency === 'USD' ? {amountUSD:(record.originalAmount / 100).toFixed(2), exchangeRate:record.exchangeRate, rateDate:record.rateDate} : {}), ...((record.due || body.type === 'pay-bill') ? {due:record.due || body.due} : {}), ...(record.repeatMonths ? {repeatMonths:record.repeatMonths} : {}), ...(record.overShare ? {partnerShareAED:(record.takenFromPartner / 100).toFixed(2)} : {}) };
      tx.set(db.collection('adminActivityLogs').doc(record.id), {action:actionNames[body.type], page:'admin', targetType:'shared_bank', targetId:record.id, targetLabel:record.note || 'Shared bank', actorEmail:actor, actorUid:user.uid || '', timestamp:new Date(now), metadata});
      tx.set(ref, next); return next;
    });
    return res.json(result);
  } catch(e) { return res.status(400).json({error:e.message || 'Ledger request failed.'}); }
}
}

export default createSharedLedgerHandler();
