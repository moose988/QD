import { computeTotals, formatAED } from './quote-totals.js';

export const QD_BRAND = {
  name: 'QD Systems',
  email: 'contact@qdsystems.ae',
  phone: '+971 50 534 9907',
  site: 'qdsystems.ae',
  place: 'Dubai, United Arab Emirates'
};

const FALLBACK_SCOPE = 'Website and digital systems scope as itemized below.';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export function formatQuoteRef(ref) {
  const m = /^Q-(20\d{2})-(\d+)$/.exec(String(ref || ''));
  return m ? `Q-${m[2]}-${m[1]}` : String(ref || '');
}

export function pickQuoteText(field, lang = 'en') {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.join('\n');
  const primary = field[lang];
  if (Array.isArray(primary)) return primary.join('\n');
  if (primary) return primary;
  const fallback = lang === 'en' ? field.ar : field.en;
  return Array.isArray(fallback) ? fallback.join('\n') : (fallback || '');
}

function quoteDate(value, lang = 'en', fallback = '') {
  if (!value) return fallback;
  const date = value._seconds ? new Date(value._seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addDays(value, days, lang = 'en') {
  const date = value?._seconds ? new Date(value._seconds * 1000) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return quoteDate(date, lang);
}

function editableText(text, path, options = {}) {
  const tag = options.multiline ? 'textarea' : 'span';
  const attrs = [
    `data-${options.kind || 'qfield'}="${escapeHtml(path)}"`,
    'contenteditable="true"',
    'spellcheck="true"'
  ];
  if (options.dir) attrs.push(`dir="${escapeHtml(options.dir)}"`);
  const className = options.className || 'q-edit';
  if (tag === 'textarea') {
    return `<textarea class="${className}" ${attrs.filter((attr) => !attr.startsWith('contenteditable')).join(' ')}>${escapeHtml(text)}</textarea>`;
  }
  return `<span class="${className}" ${attrs.join(' ')}>${escapeHtml(text)}</span>`;
}

function editableMoney(value, path, options = {}) {
  return `<input class="${options.className || 'q-edit q-edit-num'}" type="number" min="0" step="1" data-${options.kind || 'qline'}="${escapeHtml(path)}" value="${escapeHtml(value ?? 0)}">`;
}

function lineAmount(lineItem, idx, editable) {
  if (lineItem?.billingNote) {
    return editable
      ? editableText(lineItem.billingNote, `${idx}.billingNote`, { kind: 'qline', className: 'q-edit q-edit-note' })
      : escapeHtml(lineItem.billingNote);
  }
  const amount = (Number(lineItem?.qty) || 0) * (Number(lineItem?.unitPrice) || 0);
  if (!editable) return `AED ${formatAED(amount)}`;
  return `
    <span class="q-line-controls">
      <span>Qty ${editableMoney(lineItem?.qty ?? 1, `${idx}.qty`)}</span>
      <span>AED ${editableMoney(lineItem?.unitPrice ?? 0, `${idx}.unitPrice`)}</span>
    </span>
  `;
}

function normalizeIncludes(lineItem = {}) {
  const groups = Array.isArray(lineItem.includedGroups) ? lineItem.includedGroups : [];
  const fromGroups = groups.flatMap((group) => (group.includes || []).map((item) => (
    group.label ? `${group.label}: ${item}` : item
  )));
  const direct = Array.isArray(lineItem.includes) ? lineItem.includes : [];
  if (direct.length) return direct.map(String);
  if (fromGroups.length) return fromGroups.map(String);
  const description = pickQuoteText(lineItem.description, 'en');
  return description ? [description] : [];
}

function renderIncludedRows(lineItem, idx, lang, editable) {
  const rows = normalizeIncludes(lineItem);
  return rows.map((label, includeIdx) => `
    <tr class="sub" data-quote-include="${idx}:${includeIdx}">
      <td>
        ${editable
          ? `<button type="button" class="q-mini-btn" data-action="quote-remove-include" data-idx="${idx}" data-include-idx="${includeIdx}" aria-label="Remove inclusion">-</button>${editableText(label, `${idx}.includes.${includeIdx}`, { kind: 'qline', className: 'q-edit q-edit-include' })}`
          : escapeHtml(label)}
      </td>
      <td class="inc">Included</td>
    </tr>
  `).join('');
}

function renderLineItem(lineItem, idx, lang, editable) {
  const name = pickQuoteText(lineItem.name, lang) || 'Service';
  return `
    <tr class="grp" data-quote-line="${idx}">
      <td>
        ${editable ? `
          <div class="q-line-admin">
            <button type="button" class="q-mini-btn q-drag" data-action="quote-move-line-up" data-idx="${idx}" aria-label="Move line up">↑</button>
            <button type="button" class="q-mini-btn q-drag" data-action="quote-move-line-down" data-idx="${idx}" aria-label="Move line down">↓</button>
            <button type="button" class="q-mini-btn q-danger" data-action="quote-remove-line" data-idx="${idx}" aria-label="Remove line">×</button>
          </div>
          <div class="q-line-name">
            ${editableText(lineItem.name?.en || name, `${idx}.name.en`, { kind: 'qline', className: 'q-edit q-edit-title' })}
            ${editableText(lineItem.name?.ar || '', `${idx}.name.ar`, { kind: 'qline', className: 'q-edit q-edit-title q-edit-ar', dir: 'rtl' })}
          </div>
        ` : escapeHtml(name)}
      </td>
      <td class="amt">${lineAmount(lineItem, idx, editable)}</td>
    </tr>
    ${renderIncludedRows(lineItem, idx, lang, editable)}
    ${editable ? `<tr class="sub"><td><button type="button" class="q-add-inline" data-action="quote-add-include" data-idx="${idx}">+ Included item</button></td><td></td></tr>` : ''}
    <tr class="div"><td colspan="2"></td></tr>
  `;
}

function renderPagesLine(pages, lang, editable) {
  const price = Number(pages?.price) || 0;
  if (!price && !editable) return '';
  const count = Number(pages?.count) || 0;
  const label = count > 0 ? `${count} additional page${count === 1 ? '' : 's'}` : 'Additional page scope';
  return `
    <tr class="grp" data-quote-pages>
      <td>${editable ? editableText(label, 'pages.en', { className: 'q-edit q-edit-title' }) : escapeHtml(label)}</td>
      <td class="amt">${editable ? `AED ${editableMoney(price, 'pages.price', { kind: 'qfield' })}` : `AED ${formatAED(price)}`}</td>
    </tr>
    <tr class="sub"><td>${editable ? editableText(pickQuoteText(pages, lang) || 'Additional page design and setup', 'pages.en', { className: 'q-edit q-edit-include' }) : escapeHtml(pickQuoteText(pages, lang) || 'Additional page design and setup')}</td><td class="inc">Included</td></tr>
    <tr class="div"><td colspan="2"></td></tr>
  `;
}

function normalizeTerms(terms, lang = 'en') {
  const value = terms && typeof terms === 'object' ? terms[lang] || terms.en || terms.ar : terms;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultTerms(validDays) {
  return [
    `Validity. This quotation is valid for ${validDays} days from the issue date.`,
    'Payment. 30% advance on acceptance to commence work; 70% on completion prior to go-live.',
    'Scope. Pricing covers the items listed above. Additional pages, features or systems are quoted separately.',
    'Third-party services. Payment gateway, delivery integrations, messaging, hosting upgrades, and vendor subscriptions are billed at cost unless explicitly included.',
    'Timeline. Work begins on receipt of the advance payment; a delivery schedule is confirmed at kickoff.',
    'Ownership. Full ownership and handover transfer to the client on final payment.'
  ];
}

function renderTerms(data, lang, editable) {
  const custom = normalizeTerms(data.terms, lang);
  const terms = custom.length ? custom : defaultTerms(Number(data.validDays) || 30);
  return terms.map((item, idx) => `
    <li>
      ${editable
        ? `${editableText(item, `${idx}`, { kind: 'qterm', className: 'q-edit q-edit-term' })}<button type="button" class="q-mini-btn q-danger" data-action="quote-remove-term" data-term-idx="${idx}" aria-label="Remove term">×</button>`
        : escapeHtml(item)}
    </li>
  `).join('');
}

export function paymentSchedule(total) {
  const advance = Math.round(total * 0.3);
  return [
    { label: '30% on acceptance', when: 'to begin work', amount: advance },
    { label: '70% on completion', when: 'before go-live', amount: total - advance }
  ];
}

export function normalizeQuoteForTemplate(data = {}, options = {}) {
  const lang = options.lang || data.language || 'en';
  const lineItems = (Array.isArray(data.lineItems) ? data.lineItems : [])
    .filter((line) => line?.catalogKey !== 'monthly-care');
  const vatPercent = data.vatInclusive === false ? Number(data.vatPercent) || 0 : 0;
  const totals = computeTotals(lineItems, vatPercent, data.pages?.price);
  const validDays = Number(data.validDays) || 30;
  return {
    ...data,
    language: lang,
    lineItems,
    vatPercent,
    vatInclusive: data.vatInclusive !== false,
    totals,
    validDays,
    quoteNumberDisplay: formatQuoteRef(data.quoteNumber || data.id || ''),
    issued: quoteDate(data.createdAt, lang),
    validUntil: addDays(data.createdAt, validDays, lang),
    customerName: data.customer?.businessName || 'Client',
    scope: pickQuoteText(data.notes, lang) || pickQuoteText(data.pages, lang) || FALLBACK_SCOPE,
    careMonthly: Number(data.careMonthly) || 0,
    carePlanName: String(data.carePlanName || data.estimateSnapshot?.monthly?.planName || 'Care Basic').trim(),
    paymentSchedule: paymentSchedule(totals.grandTotal)
  };
}

export function renderQuoteTemplate(data = {}, options = {}) {
  const editable = options.editable === true;
  const lang = options.lang || data.language || 'en';
  const q = normalizeQuoteForTemplate(data, { lang });
  const quoteUrl = options.quoteUrl || '';
  const monthlyText = q.careMonthly > 0 ? `${escapeHtml(q.carePlanName)} · AED ${formatAED(q.careMonthly)}/mo` : 'No recurring care selected';
  return `
    <div class="sheet ${editable ? 'quote-editable' : ''}" data-quote-template>
      <div class="topbar"></div>
      <div class="pad">
        <header class="head">
          <div class="brand">
            <div class="mono">QD</div>
            <div><h1>${QD_BRAND.name}</h1><div class="sub">Websites & digital systems · Dubai, UAE</div></div>
          </div>
          <div class="docmeta">
            <div class="title">QUOTATION</div>
            <div class="metarow"><span class="k">Issue date</span><span class="v">${escapeHtml(q.issued)}</span></div>
            <div class="metarow"><span class="k">Valid until</span><span class="v">${escapeHtml(q.validUntil)}</span></div>
            <div class="refpill">REF ${escapeHtml(q.quoteNumberDisplay)}</div>
          </div>
        </header>

        <section class="parties">
          <div class="box"><div class="lbl">From</div><div class="name">${QD_BRAND.name}</div><div>${QD_BRAND.place}</div><div>${QD_BRAND.email}</div><div>${QD_BRAND.site}</div></div>
          <div class="box"><div class="lbl">Prepared for</div><div class="name">${editable ? editableText(q.customerName, 'customer.businessName') : escapeHtml(q.customerName)}</div><div>${editable ? editableText(q.customer?.email || '', 'customer.email') : escapeHtml(q.customer?.email || '')}</div><div>${editable ? editableText(q.customer?.phone || '', 'customer.phone') : escapeHtml(q.customer?.phone || '')}</div></div>
        </section>

        <div class="scope"><b>Scope:</b> ${editable ? editableText(q.scope, 'notes.en', { className: 'q-edit q-edit-scope' }) : escapeHtml(q.scope)}</div>
        <p class="intro">Thank you for the opportunity to work with ${escapeHtml(q.customerName)}. Please find the detailed quotation below.</p>

        <table class="items"><tbody>
          ${q.lineItems.map((lineItem, idx) => renderLineItem(lineItem, idx, lang, editable)).join('')}
          ${renderPagesLine(q.pages, lang, editable)}
        </tbody></table>
        ${editable ? '<button type="button" class="q-add-line" data-action="quote-add-custom-line">+ Line item</button>' : ''}

        <div class="tot"><span class="l">One-time total</span><span class="r">AED ${formatAED(q.totals.grandTotal)}</span></div>
        ${q.vatInclusive ? '<div class="anchor">Prices are inclusive of VAT.</div>' : `<div class="anchor">VAT ${escapeHtml(q.vatPercent)}%: AED ${formatAED(q.totals.vat)}</div>`}

        <h4 class="sec">Payment schedule</h4>
        <table class="pay"><tbody>
          ${q.paymentSchedule.map((item) => `<tr><td>${escapeHtml(item.label)} <span class="when">- ${escapeHtml(item.when)}</span></td><td>AED ${formatAED(item.amount)}</td></tr>`).join('')}
        </tbody></table>

        <h4 class="sec">Monthly care</h4>
        <div class="care-box">
          <div><strong>${editable ? editableText(q.carePlanName, 'carePlanName') : escapeHtml(q.carePlanName)}</strong></div>
          <div>${editable ? `AED ${editableMoney(q.careMonthly, 'careMonthly', { kind: 'qfield' })}/mo` : escapeHtml(monthlyText)}</div>
        </div>
        <div class="note">Third-party costs are billed at cost unless explicitly included in the quotation.</div>

        <h4 class="sec">Terms & conditions</h4>
        <ol class="terms">${renderTerms(q, lang, editable)}</ol>
        ${editable ? '<button type="button" class="q-add-inline" data-action="quote-add-term">+ Term</button>' : ''}

        <h4 class="sec">Acceptance</h4>
        <div class="accept">
          <div>To proceed, please sign below and return with the 30% advance payment.</div>
          <div class="row">
            <div class="sig"><div class="ln"></div><div class="cap">Client signature - ${escapeHtml(q.customerName)}</div></div>
            <div class="sig"><div class="ln"></div><div class="cap">Date</div></div>
          </div>
        </div>

        <footer class="foot">
          <div>${QD_BRAND.name} · ${QD_BRAND.place} · ${QD_BRAND.email} · ${QD_BRAND.site}</div>
          <div>Ref <b>${escapeHtml(q.quoteNumberDisplay)}</b>${quoteUrl ? ` · ${escapeHtml(quoteUrl)}` : ''}</div>
        </footer>
      </div>
    </div>
  `;
}
