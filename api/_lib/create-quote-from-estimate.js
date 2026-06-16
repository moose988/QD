import { getDb, admin } from './firebase.js';
import { generateQuoteId, generatePasscode, hashPasscode } from './quote-id.js';
import { getNextQuoteNumber } from './quote-counter.js';
import { buildQuoteSearchFields } from './quote-admin.js';
import { buildDefaultMilestones } from './collections.js';
import { buildQuotePaymentFields } from './quote-payments.js';
import { buildEstimate } from '../../app/lib/pricing-model.js';
import { estimateToQuoteDraft } from '../../app/lib/estimate-quote.js';

export async function createQuoteFromEstimate(body, adminUser) {
  const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {};
  const clientName = String(body?.clientName || '').trim();
  const language = body?.language === 'ar' ? 'ar' : 'en';
  const estimate = buildEstimate(selection);
  const draft = estimateToQuoteDraft(estimate, { clientName, language });
  if (!draft.lineItems.length) {
    const error = new Error('Estimate has no billable lines');
    error.status = 400;
    throw error;
  }

  const id = generateQuoteId();
  const passcodePlain = generatePasscode();
  const passcodeHash = hashPasscode(passcodePlain);
  const quoteNumber = await getNextQuoteNumber();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const quote = {
    quoteNumber,
    status: 'draft',
    language: draft.language,
    validDays: draft.validDays,
    vatInclusive: draft.vatInclusive,
    vatPercent: draft.vatPercent,
    customer: draft.customer,
    estimateSnapshot: {
      selection,
      version: estimate.version,
      inputHash: estimate.inputHash,
      listPrice: estimate.listPrice,
      net: estimate.net,
      subtotal: estimate.subtotal,
      discountPercent: estimate.discountPercent,
      discountAmount: estimate.discountAmount,
      discountApplied: estimate.discountApplied,
      discountedSubtotal: estimate.discountedSubtotal,
      vatPercent: estimate.vatPercent,
      vat: estimate.vat,
      grandTotal: estimate.grandTotal,
      deliveryCost: estimate.deliveryCost,
      marginPercent: estimate.marginPercent,
      costFloorNet: estimate.costFloorNet,
      floorBound: estimate.floorBound,
      approval: estimate.approval,
      flags: estimate.flags,
      waterfall: estimate.waterfall,
      monthly: estimate.monthly,
      createdBy: adminUser.email || adminUser.uid || ''
    },
    lineItems: draft.lineItems,
    pages: draft.pages,
    terms: draft.terms,
    notes: draft.notes,
    remarks: '',
    passcodeHash,
    _passcodePlain: passcodePlain,
    payments: [],
    careMonthly: Number(draft.careMonthly) || 0,
    carePlanName: draft.carePlanName || estimate.monthly?.planName || 'Care Basic',
    careCollected: [],
    careWaived: [],
    firstMonthFree: false,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null
  };
  Object.assign(quote, buildQuotePaymentFields(id, quote));
  Object.assign(quote, buildQuoteSearchFields(quote));
  quote.milestones = buildDefaultMilestones(quote.balance);

  const db = getDb();
  await db.collection('quotes').doc(id).set(quote);
  const after = await db.collection('quotes').doc(id).get();
  return { id, ...after.data(), passcodePlain };
}
