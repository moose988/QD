import { L } from '/app/lib/quote-labels.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';

const QD_BRAND = {
  name: 'QD Systems',
  email: 'contact@qdsystems.ae',
  phone: '+971 50 534 9907',
  site: 'qdsystems.ae',
  place: 'Sharjah, United Arab Emirates'
};
const ID = location.pathname.replace(/^\/q\//, '').trim();

let currentLang = localStorage.getItem('quoteLang') || 'en';

function applyStaticLabels(root = document) {
  root.querySelectorAll('[data-l]').forEach((el) => {
    el.textContent = L(currentLang, el.dataset.l);
  });
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function showError(msg, shake = false) {
  const errEl = document.getElementById('passcode-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.hidden = false;
  if (shake) {
    const card = document.querySelector('.passcode-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  }
}

async function verifyAndRender(passcode) {
  const res = await fetch('/api/quote-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ID, passcode }),
  });
  if (res.status === 401) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  if (res.status === 404) { renderNotFound(); return; }
  if (!res.ok) { showError('Network error'); return; }
  const data = await res.json();
  if (!localStorage.getItem('quoteLang')) {
    currentLang = data.language || 'en';
    localStorage.setItem('quoteLang', currentLang);
  }
  renderQuote(data);
}

function renderNotFound() {
  document.getElementById('quote-root').innerHTML = `
    <div class="not-found">
      <p>${L(currentLang, 'quoteNotFound')}</p>
    </div>`;
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function pickText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  const primary = field[currentLang];
  if (primary) return primary;
  return currentLang === 'en' ? field.ar || '' : field.en || '';
}

function quoteDate(value, fallback = '') {
  if (!value) return fallback;
  const date = value._seconds ? new Date(value._seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(currentLang === 'ar' ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addDays(value, days) {
  const date = value?._seconds ? new Date(value._seconds * 1000) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return quoteDate(date);
}

function lineAmount(lineItem) {
  if (lineItem?.billingNote) return escape(lineItem.billingNote);
  return `AED ${formatAED((Number(lineItem?.qty) || 0) * (Number(lineItem?.unitPrice) || 0))}`;
}

function includedRows(lineItem) {
  const groups = Array.isArray(lineItem.includedGroups) ? lineItem.includedGroups : [];
  const fromGroups = groups.flatMap((group) => (group.includes || []).map((item) => ({
    label: group.label ? `${group.label}: ${item}` : item
  })));
  const direct = Array.isArray(lineItem.includes) ? lineItem.includes.map((item) => ({ label: item })) : [];
  const rows = fromGroups.length ? fromGroups : direct;
  const description = pickText(lineItem.description);
  const allRows = rows.length ? rows : (description ? [{ label: description }] : []);
  return allRows.map((row) => `
    <tr class="sub"><td>${escape(row.label)}</td><td class="inc">Included</td></tr>
  `).join('');
}

function renderLineItems(lineItems = []) {
  return lineItems.map((lineItem) => `
    <tr class="grp"><td>${escape(pickText(lineItem.name) || 'Service')}</td><td class="amt">${lineAmount(lineItem)}</td></tr>
    ${includedRows(lineItem)}
    <tr class="div"><td colspan="2"></td></tr>
  `).join('');
}

function renderPagesLine(pages) {
  const price = Number(pages?.price) || 0;
  if (!price) return '';
  const count = Number(pages?.count) || 0;
  const label = count > 0 ? `${count} additional page${count === 1 ? '' : 's'}` : 'Additional page scope';
  return `
    <tr class="grp"><td>${escape(label)}</td><td class="amt">AED ${formatAED(price)}</td></tr>
    <tr class="sub"><td>${escape(pickText(pages) || 'Additional page design and setup')}</td><td class="inc">Included</td></tr>
    <tr class="div"><td colspan="2"></td></tr>
  `;
}

function paymentSchedule(total) {
  const advance = Math.round(total * 0.3);
  return [
    ['30% on acceptance', 'to begin work', advance],
    ['70% on completion', 'before go-live', total - advance]
  ];
}

function termItems(data) {
  const custom = pickText(data.terms);
  const validity = Number(data.validDays) || 30;
  const items = [
    `<b>Validity.</b> This quotation is valid for ${validity} days from the issue date.`,
    '<b>Payment.</b> 30% advance on acceptance to commence work; 70% on completion prior to go-live.',
    '<b>Scope.</b> Pricing covers the items listed above. Additional pages, features or systems are quoted separately.',
    '<b>Third-party services.</b> Payment gateway, delivery integrations, messaging, hosting upgrades, and vendor subscriptions are billed at cost unless explicitly included.',
    '<b>Timeline.</b> Work begins on receipt of the advance payment; a delivery schedule is confirmed at kickoff.',
    '<b>Ownership.</b> Full ownership and handover transfer to the client on final payment.'
  ];
  if (custom) items.unshift(`<b>Commercial note.</b> ${escape(custom)}`);
  return items.map((item) => `<li>${item}</li>`).join('');
}

function renderQuote(data) {
  const totals = computeTotals(data.lineItems, data.vatPercent, data.pages?.price);
  const issued = quoteDate(data.createdAt);
  const validUntil = addDays(data.createdAt, Number(data.validDays) || 30);
  const customerName = data.customer?.businessName || 'Client';
  const scope = pickText(data.notes) || pickText(data.pages) || 'Website and digital systems scope as itemized below.';
  const monthlyLine = (data.lineItems || []).find((line) => line.catalogKey === 'monthly-care');
  const monthlyText = monthlyLine?.billingNote && !/optional/i.test(monthlyLine.billingNote) ? ` &middot; ${escape(monthlyLine.billingNote)} care plan` : '';
  const root = document.getElementById('quote-root');
  root.innerHTML = `
    <div class="quote-toolbar">
      <button id="lang-en" type="button" class="${currentLang === 'en' ? 'active' : ''}">EN</button>
      <button id="lang-ar" type="button" class="${currentLang === 'ar' ? 'active' : ''}">AR</button>
      <button id="print-btn" type="button">${L(currentLang, 'print')}</button>
    </div>
    <div class="sheet">
      <div class="topbar"></div>
      <div class="pad">
        <header class="head">
          <div class="brand">
            <div class="mono">QD</div>
            <div><h1>${QD_BRAND.name}</h1><div class="sub">Websites & digital systems &middot; Sharjah, UAE</div></div>
          </div>
          <div class="docmeta">
            <div class="title">QUOTATION</div>
            <div class="metarow"><span class="k">Issue date</span><span class="v">${escape(issued)}</span></div>
            <div class="metarow"><span class="k">Valid until</span><span class="v">${escape(validUntil)}</span></div>
            <div class="refpill">REF ${escape(data.quoteNumber || ID)}</div>
          </div>
        </header>

        <section class="parties">
          <div class="box"><div class="lbl">From</div><div class="name">${QD_BRAND.name}</div><div>${QD_BRAND.place}</div><div>${QD_BRAND.email}</div><div>${QD_BRAND.site}</div></div>
          <div class="box"><div class="lbl">Prepared for</div><div class="name">${escape(customerName)}</div><div>${escape(data.customer?.email || '')}</div><div>${escape(data.customer?.phone || '')}</div></div>
        </section>

        <div class="scope"><b>Scope:</b> ${escape(scope)}</div>
        <p class="intro">Thank you for the opportunity to work with ${escape(customerName)}. Please find the detailed quotation below.</p>

        <table class="items"><tbody>${renderLineItems(data.lineItems || [])}${renderPagesLine(data.pages)}</tbody></table>

        <div class="tot"><span class="l">One-time total <span class="mo">${monthlyText}</span></span><span class="r">AED ${formatAED(totals.grandTotal)}</span></div>
        ${Number(data.vatPercent) > 0 ? `<div class="anchor">Includes VAT ${escape(data.vatPercent)}%: AED ${formatAED(totals.vat)}</div>` : '<div class="anchor">VAT: 0% unless otherwise stated.</div>'}

        <h4 class="sec">Payment schedule</h4>
        <table class="pay"><tbody>
          ${paymentSchedule(totals.grandTotal).map(([label, when, amount]) => `<tr><td>${escape(label)} <span class="when">- ${escape(when)}</span></td><td>AED ${formatAED(amount)}</td></tr>`).join('')}
        </tbody></table>
        <div class="note">Third-party costs are billed at cost unless explicitly included in the quotation.</div>

        <h4 class="sec">Terms & conditions</h4>
        <ol class="terms">${termItems(data)}</ol>

        <h4 class="sec">Acceptance</h4>
        <div class="accept">
          <div>To proceed, please sign below and return with the 30% advance payment.</div>
          <div class="row">
            <div class="sig"><div class="ln"></div><div class="cap">Client signature - ${escape(customerName)}</div></div>
            <div class="sig"><div class="ln"></div><div class="cap">Date</div></div>
          </div>
        </div>

        <footer class="foot">
          <div>${QD_BRAND.name} &middot; ${QD_BRAND.place} &middot; ${QD_BRAND.email} &middot; ${QD_BRAND.site}</div>
          <div>Ref <b>${escape(data.quoteNumber || ID)}</b> &middot; ${escape(QD_BRAND.site)}/q/${escape(ID)}</div>
        </footer>
      </div>
    </div>
  `;
  applyStaticLabels();
  document.getElementById('lang-en').addEventListener('click', () => setLang('en', data));
  document.getElementById('lang-ar').addEventListener('click', () => setLang('ar', data));
  document.getElementById('print-btn').addEventListener('click', () => window.print());
}

function setLang(lang, data) {
  if (lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem('quoteLang', lang);
  renderQuote(data);
}

applyStaticLabels();
document.getElementById('passcode-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('passcode-input').value.trim();
  if (!/^[0-9]{6}$/.test(code)) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  verifyAndRender(code);
});

if (!ID) renderNotFound();
