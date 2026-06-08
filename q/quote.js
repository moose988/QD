import { L, LABELS } from '/app/lib/quote-labels.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';

const QD_BRAND = { name: 'QD Systems', phone: '+971 50 534 9907', site: 'qdsystems.ae' };
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
  console.log('[quote-verify] requesting API', { id: ID, endpoint: '/api/quote-verify' });
  const res = await fetch('/api/quote-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ID, passcode }),
  });
  console.log('[quote-verify] response status', res.status, res.statusText);
  if (res.status === 401) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  if (res.status === 404) { renderNotFound(); return; }
  if (!res.ok) {
    console.error('[quote-verify] API failure');
    showError('Network error');
    return;
  }
  const data = await res.json();
  // First successful unlock: pick the quote's preferred language UNLESS user already overrode
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
  const primary = field[currentLang];
  if (primary) return primary;
  const other = currentLang === 'en' ? field.ar : field.en;
  if (!other) return '';
  const tag = currentLang === 'en' ? '[AR]' : '[EN]';
  return `${tag} ${other}`;
}

function renderQuote(data) {
  const totals = computeTotals(data.lineItems, data.vatPercent, data.pages?.price);
  const issued = data.createdAt
    ? new Date(data.createdAt._seconds ? data.createdAt._seconds * 1000 : data.createdAt).toLocaleDateString(currentLang === 'ar' ? 'ar-AE' : 'en-AE', { year:'numeric', month:'short', day:'numeric' })
    : '';
  const root = document.getElementById('quote-root');
  root.innerHTML = `
    <div class="quote-shell">
      <div class="quote-toolbar">
        <button id="lang-en" type="button" class="${currentLang==='en'?'active':''}">EN</button>
        <span style="color:#ccc">·</span>
        <button id="lang-ar" type="button" class="${currentLang==='ar'?'active':''}">AR</button>
        <button id="print-btn" type="button">🖨 ${L(currentLang,'print')}</button>
      </div>
      <div class="quote-header">
        <div class="quote-header-brand">
          <img src="/assets/qd-logo.jpeg" alt="${QD_BRAND.name}">
          <div class="brand-sub">WEB · BRAND · DIGITAL SYSTEMS</div>
          <div class="brand-contact">${QD_BRAND.site} · ${QD_BRAND.phone}</div>
        </div>
        <div class="quote-header-meta">
          <div class="quote-title">${L(currentLang,'quotation')}</div>
          <div class="quote-num">${escape(data.quoteNumber)}</div>
          <div class="quote-date">${L(currentLang,'issued')} · ${escape(issued)}</div>
          <div class="quote-date">${L(currentLang,'valid')} · ${escape(data.validDays)} ${L(currentLang,'days')}</div>
        </div>
      </div>
      <div class="client-block">
        <div class="label">${L(currentLang,'preparedFor')}</div>
        <div class="name">${escape(data.customer?.businessName || '')}</div>
        <div class="contact">${escape([data.customer?.email, data.customer?.phone].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="line-items-wrap">
      <table class="line-items">
        <thead>
          <tr>
            <th>${L(currentLang,'service')}</th>
            <th class="center" style="width:48px">${L(currentLang,'qty')}</th>
            <th class="num" style="width:90px">${L(currentLang,'unit')}</th>
            <th class="num" style="width:90px">${L(currentLang,'total')}</th>
          </tr>
        </thead>
        <tbody>
          ${(data.lineItems||[]).map((li) => `
            <tr>
              <td class="desc">${escape(pickText(li.name))}${li.description && pickText(li.description) ? `<small>${escape(pickText(li.description))}</small>`:''}</td>
              <td class="center">${escape(li.qty)}</td>
              <td class="num">${formatAED(li.unitPrice)}</td>
              <td class="num">${formatAED((Number(li.qty)||0)*(Number(li.unitPrice)||0))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <div class="totals-row">
        <div class="totals-box">
          <div class="row"><span>${L(currentLang,'pagesPrice')}</span><span>${formatAED(totals.pagesSubtotal)}</span></div>
          <div class="row"><span>${L(currentLang,'subtotal')}</span><span>${formatAED(totals.subtotal)}</span></div>
          <div class="row"><span>${L(currentLang,'vat')} ${escape(data.vatPercent)}%</span><span>${formatAED(totals.vat)}</span></div>
          <div class="row grand"><span>${L(currentLang,'grandTotal')}</span><span>${formatAED(totals.grandTotal)}</span></div>
        </div>
      </div>
      ${(pickText(data.pages) || Number(data.pages?.price) > 0) ? `
        <div class="pages-block">
          <div class="label">${L(currentLang,'pagesIncluded')}</div>
          ${pickText(data.pages) ? `<div class="pages-text">${escape(pickText(data.pages))}</div>` : ''}
          ${Number(data.pages?.price) > 0 ? `<div class="pages-text"><strong>${L(currentLang,'pagesPrice')}:</strong> AED ${formatAED(Number(data.pages.price) || 0)}</div>` : ''}
        </div>` : ''}
      <div class="terms-block">${escape(pickText(data.terms))}<br>${L(currentLang,'questions')}</div>
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

// ─── Boot ─────────────────────────────────────────────────────
applyStaticLabels();
document.getElementById('passcode-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('passcode-input').value.trim();
  if (!/^[0-9]{6}$/.test(code)) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  verifyAndRender(code);
});

if (!ID) renderNotFound();
