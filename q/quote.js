import { L } from '/app/lib/quote-labels.js';
import { renderQuoteTemplate, normalizeQuoteForTemplate, escapeHtml } from '/app/lib/quote-template.js';
import { formatAED } from '/app/lib/quote-totals.js';

const ID = location.pathname.replace(/^\/q\//, '').replace(/\/+$/, '').trim();
const WA_NUMBER = '971504611123';
const LANG_KEY = `qdQuoteLang:${ID}`;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Language preference is remembered per quote, so one quote's choice never
// overrides another quote's own language.
function readLang() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}
function saveLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
}

let currentLang = readLang() || 'en';
const t = (key) => L(currentLang, key);

function applyDir() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function applyStaticLabels(root = document) {
  root.querySelectorAll('[data-l]').forEach((el) => {
    el.textContent = t(el.dataset.l);
  });
  root.querySelectorAll('[data-gate-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.gateLang === currentLang));
  });
  applyDir();
}

/* ------------------------------------------------------------------ */
/* Passcode gate                                                       */
/* ------------------------------------------------------------------ */

const gate = {
  form: document.getElementById('passcode-form'),
  input: document.getElementById('passcode-input'),
  field: document.getElementById('pc-field'),
  cells: [...document.querySelectorAll('.pc-cell')],
  submit: document.getElementById('passcode-submit'),
  error: document.getElementById('passcode-error'),
  card: document.querySelector('.passcode-card'),
  busy: false,
};

function paintCells() {
  if (!gate.input) return;
  const value = gate.input.value;
  const focused = document.activeElement === gate.input;
  gate.cells.forEach((cell, i) => {
    cell.textContent = value[i] || '';
    cell.classList.toggle('is-filled', Boolean(value[i]));
    cell.classList.toggle('is-active', focused && !gate.busy && i === Math.min(value.length, 5) && value.length < 6);
  });
}

function clearError() {
  gate.error.hidden = true;
  gate.error.textContent = '';
  gate.field.classList.remove('is-error');
  gate.input.removeAttribute('aria-invalid');
}

function showError(key, shake = false) {
  if (!gate.error) return;
  gate.error.dataset.key = key;
  gate.error.textContent = t(key);
  gate.error.hidden = false;
  gate.field.classList.add('is-error');
  gate.input.setAttribute('aria-invalid', 'true');
  if (shake && !reduceMotion()) {
    gate.card.classList.remove('shake');
    void gate.card.offsetWidth;
    gate.card.classList.add('shake');
  }
}

function setBusy(busy) {
  gate.busy = busy;
  gate.form.classList.toggle('is-busy', busy);
  gate.submit.disabled = busy;
  gate.input.readOnly = busy;
  const label = gate.submit.querySelector('.btn-label');
  label.dataset.l = busy ? 'checking' : 'unlock';
  label.textContent = t(label.dataset.l);
  paintCells();
}

async function verifyAndRender(passcode) {
  if (gate.busy) return;
  clearError();
  setBusy(true);
  let res;
  try {
    res = await fetch('/api/quote-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ID, passcode }),
    });
  } catch {
    setBusy(false);
    showError('networkError');
    return;
  }
  if (res.status === 401) {
    setBusy(false);
    gate.input.value = '';
    showError('incorrectPasscode', true);
    gate.input.focus();
    paintCells();
    return;
  }
  if (res.status === 404) { renderNotFound(); return; }
  if (!res.ok) { setBusy(false); showError('networkError'); return; }

  let data;
  try { data = await res.json(); } catch { setBusy(false); showError('networkError'); return; }

  currentLang = readLang() || (data.language === 'ar' ? 'ar' : 'en');
  gate.card.classList.add('is-unlocked');
  window.setTimeout(() => renderQuote(data, { first: true }), reduceMotion() ? 0 : 520);
}

function renderNotFound() {
  document.getElementById('quote-root').innerHTML = `
    <section class="passcode-gate">
      <div class="gate-glow" aria-hidden="true"></div>
      <div class="passcode-card not-found">
        <img src="/assets/qd-logo.jpeg" alt="QD Systems" class="passcode-logo" width="88" height="88">
        <p class="passcode-prompt">${escapeHtml(t('quoteNotFound'))}</p>
        <a class="passcode-submit as-link" href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener">${escapeHtml(t('contactQd'))}</a>
      </div>
    </section>`;
  applyDir();
}

/* ------------------------------------------------------------------ */
/* Quote view                                                          */
/* ------------------------------------------------------------------ */

const SECTION_KEYS = [
  [/payment/i, 'payment', 'secPayment'],
  [/care/i, 'care', 'secCare'],
  [/term/i, 'terms', 'secTerms'],
  [/accept/i, 'accept', 'secAccept'],
];

function toDate(value) {
  if (!value) return null;
  const d = value._seconds ? new Date(value._seconds * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function quoteStatus(data, q) {
  const workflow = String(data.status || '').toLowerCase();
  const map = { accepted: 'statusAccepted', paid: 'statusPaid', declined: 'statusDeclined' };
  if (map[workflow]) return { key: map[workflow], tone: workflow === 'declined' ? 'muted' : 'good' };
  const created = toDate(data.createdAt);
  if (created) {
    const expires = new Date(created);
    expires.setDate(expires.getDate() + q.validDays);
    if (Date.now() > expires.getTime()) return { key: 'statusExpired', tone: 'warn' };
  }
  return { key: 'statusValid', tone: 'good' };
}

function aed(amount) {
  return `<bdi class="qp-money"><span class="qp-cur">AED</span> ${escapeHtml(formatAED(amount))}</bdi>`;
}

function waHref(ref) {
  const text = `${t('waMessage')} ${ref}`.trim();
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

const ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.24 8.24 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>';
const ICON_PRINT = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M7 9V3.8h10V9M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6.2H7z"/></svg>';

function langSwitch(extraClass = '') {
  return `
    <div class="qp-lang ${extraClass}" role="group" aria-label="${escapeHtml(t('language'))}">
      <button type="button" data-set-lang="en" lang="en" aria-pressed="${currentLang === 'en'}">EN</button>
      <button type="button" data-set-lang="ar" lang="ar" aria-pressed="${currentLang === 'ar'}">ع</button>
    </div>`;
}

function renderSummary(data, q) {
  const status = quoteStatus(data, q);
  const advance = q.paymentSchedule?.[0];
  return `
    <aside class="qp-summary" aria-labelledby="qp-summary-title">
      <div class="qp-summary-top">
        <span class="qp-ref">${escapeHtml(t('quoteNumber'))} <bdi>${escapeHtml(q.quoteNumberDisplay)}</bdi></span>
        <span class="qp-status qp-status--${status.tone}"><i aria-hidden="true"></i>${escapeHtml(t(status.key))}</span>
      </div>
      <p class="qp-for">${escapeHtml(t('preparedForShort'))}</p>
      <h1 class="qp-client" id="qp-summary-title"><bdi>${escapeHtml(q.customerName)}</bdi></h1>

      <div class="qp-total">
        <span class="qp-total-label">${escapeHtml(t('oneTimeTotal'))}</span>
        <span class="qp-total-value">${aed(q.totals.grandTotal)}</span>
        ${q.vatInclusive ? `<span class="qp-total-note">${escapeHtml(t('vatIncluded'))}</span>` : ''}
      </div>

      <dl class="qp-facts">
        ${q.careMonthly > 0 ? `
          <div class="qp-fact qp-fact--care">
            <dt>${escapeHtml(t('monthlyCare'))}</dt>
            <dd>+ ${aed(q.careMonthly)} <span class="qp-per">${escapeHtml(t('perMonth'))}</span><small>${escapeHtml(q.carePlanName)}</small></dd>
          </div>` : ''}
        ${advance && q.totals.grandTotal > 0 ? `
          <div class="qp-fact">
            <dt>${escapeHtml(t('dueToStart'))}</dt>
            <dd>${aed(advance.amount)}</dd>
          </div>` : ''}
        <div class="qp-fact">
          <dt>${escapeHtml(t('validUntil'))}</dt>
          <dd>${escapeHtml(q.validUntil || '—')}${q.issued ? `<small>${escapeHtml(t('issuedOn'))} ${escapeHtml(q.issued)}</small>` : ''}</dd>
        </div>
      </dl>

      <p class="qp-next">${escapeHtml(t('nextStep'))}</p>
      <div class="qp-summary-actions">
        <a class="qp-btn qp-btn--wa" href="${waHref(q.quoteNumberDisplay)}" target="_blank" rel="noopener">${ICON_WA}<span>${escapeHtml(t('contactQd'))}</span></a>
        <button type="button" class="qp-btn qp-btn--ghost" data-print>${ICON_PRINT}<span>${escapeHtml(t('printPdf'))}</span></button>
      </div>

      <nav class="qp-sidenav" aria-label="${escapeHtml(t('sections'))}"><ol data-toc-list></ol></nav>
    </aside>`;
}

function renderQuote(data, { first = false } = {}) {
  const root = document.getElementById('quote-root');
  const q = normalizeQuoteForTemplate(data, { lang: currentLang });
  const ref = q.quoteNumberDisplay;
  const keepScroll = first ? 0 : window.scrollY;

  document.body.classList.add('qp--open');
  document.title = `${t('quotation')} ${ref} · QD Systems`;

  root.innerHTML = `
    <a class="qp-skip" href="#qp-document">${escapeHtml(t('secItems'))}</a>
    <header class="qp-bar">
      <div class="qp-bar-inner">
        <div class="qp-brand">
          <img src="/assets/qd-logo.jpeg" alt="" width="34" height="34">
          <span class="qp-brand-text"><strong>QD Systems</strong><span><bdi>${escapeHtml(ref)}</bdi></span></span>
        </div>
        <div class="qp-bar-actions">
          ${langSwitch()}
          <button type="button" class="qp-icon-btn" data-print aria-label="${escapeHtml(t('printPdf'))}">${ICON_PRINT}<span class="qp-hide-sm">${escapeHtml(t('printPdf'))}</span></button>
          <a class="qp-btn qp-btn--wa qp-btn--bar" href="${waHref(ref)}" target="_blank" rel="noopener">${ICON_WA}<span>${escapeHtml(t('contactShort'))}</span></a>
        </div>
      </div>
      <nav class="qp-toc" aria-label="${escapeHtml(t('sections'))}"><ol data-toc-list></ol></nav>
    </header>

    <div class="qp-layout ${first ? 'is-entering' : ''}">
      ${renderSummary(data, q)}
      <div class="qp-doc" id="qp-document" tabindex="-1">
        ${renderQuoteTemplate(data, { editable: false, lang: currentLang, quoteUrl: `qdsystems.ae/q/${ID}` })}
      </div>
    </div>

    <div class="qp-dock" role="region" aria-label="${escapeHtml(t('oneTimeTotal'))}">
      <div class="qp-dock-total">
        <span>${escapeHtml(t('oneTimeTotal'))}</span>
        <strong>${aed(q.totals.grandTotal)}</strong>
      </div>
      <a class="qp-btn qp-btn--wa" href="${waHref(ref)}" target="_blank" rel="noopener">${ICON_WA}<span>${escapeHtml(t('contactShort'))}</span></a>
    </div>
  `;
  applyDir();

  const sections = buildSections(root.querySelector('.qp-doc .pad'));
  buildToc(root, sections);
  setupReveal(sections, first);

  root.querySelectorAll('[data-set-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.setLang, data));
  });
  root.querySelectorAll('[data-print]').forEach((btn) => btn.addEventListener('click', () => window.print()));

  if (first) {
    window.scrollTo(0, 0);
    // Force a style flush so the hidden start state applies, then let it transition in.
    const layout = root.querySelector('.qp-layout');
    if (layout) {
      void layout.offsetWidth;
      layout.classList.remove('is-entering');
    }
  } else {
    window.scrollTo(0, keepScroll);
  }
}

// Group the rendered template's flat children into labelled sections.
// This only wraps existing nodes; the template markup and numbers are untouched.
function buildSections(pad) {
  if (!pad) return [];
  const sections = [];
  const used = new Set();
  let current = null;
  const start = (key, labelKey, label, before) => {
    let id = key;
    let n = 2;
    while (used.has(id)) id = `${key}-${n++}`;
    used.add(id);
    current = document.createElement('section');
    current.className = 'qp-sec';
    current.id = `sec-${id}`;
    current.dataset.sec = key;
    pad.insertBefore(current, before);
    sections.push({ el: current, id: current.id, label: labelKey ? t(labelKey) : label });
  };
  [...pad.children].forEach((el) => {
    if (el.matches('header.head')) start('overview', 'secOverview', '', el);
    else if (el.matches('.scope')) start('items', 'secItems', '', el);
    else if (el.matches('h4.sec')) {
      const text = el.textContent.trim();
      const hit = SECTION_KEYS.find(([re]) => re.test(text));
      start(hit ? hit[1] : 'section', hit ? hit[2] : '', text, el);
    } else if (el.matches('footer.foot')) {
      current = null;
      return;
    }
    if (current) current.appendChild(el);
  });
  return sections;
}

function buildToc(root, sections) {
  const lists = [...root.querySelectorAll('[data-toc-list]')];
  const items = sections.filter((s) => s.el.dataset.sec !== 'overview');
  lists.forEach((list) => {
    list.innerHTML = items.map((s) => `<li><a href="#${s.id}" data-toc="${s.id}">${escapeHtml(s.label)}</a></li>`).join('');
  });
  const links = [...root.querySelectorAll('[data-toc]')];
  links.forEach((a) => a.addEventListener('click', (e) => {
    const target = document.getElementById(a.dataset.toc);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    setActive(a.dataset.toc);
  }));

  const chipRow = root.querySelector('.qp-toc');
  function setActive(id) {
    links.forEach((a) => {
      const on = a.dataset.toc === id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const chip = chipRow?.querySelector(`[data-toc="${id}"]`);
    if (chip && chipRow.scrollWidth > chipRow.clientWidth) {
      const rowRect = chipRow.getBoundingClientRect();
      const chipRect = chip.getBoundingClientRect();
      const delta = (chipRect.left + chipRect.width / 2) - (rowRect.left + rowRect.width / 2);
      chipRow.scrollBy({ left: delta, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }

  if (!('IntersectionObserver' in window) || !items.length) return;
  const visible = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting ? entry.boundingClientRect.top : null));
    const inView = items.filter((s) => visible.get(s.id) != null);
    if (inView.length) setActive(inView[0].id);
  }, { rootMargin: '-120px 0px -55% 0px', threshold: 0 });
  items.forEach((s) => io.observe(s.el));
}

function setupReveal(sections, first) {
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  sections.forEach((s, i) => {
    s.el.classList.add('qp-reveal');
    s.el.style.setProperty('--qp-delay', first ? `${Math.min(i, 3) * 70 + 120}ms` : '0ms');
    io.observe(s.el);
  });
  // Never leave content hidden when printing.
  window.addEventListener('beforeprint', () => sections.forEach((s) => s.el.classList.add('is-in')), { once: true });
}

function setLang(lang, data) {
  if (lang === currentLang) return;
  currentLang = lang;
  saveLang(lang);
  renderQuote(data);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

applyStaticLabels();

if (!ID) {
  renderNotFound();
} else {
  document.querySelectorAll('[data-gate-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.gateLang;
      saveLang(currentLang);
      applyStaticLabels();
      if (!gate.error.hidden && gate.error.dataset.key) gate.error.textContent = t(gate.error.dataset.key);
    });
  });

  gate.input.addEventListener('input', () => {
    const digits = gate.input.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== gate.input.value) gate.input.value = digits;
    if (!gate.error.hidden) clearError();
    paintCells();
    if (digits.length === 6) verifyAndRender(digits);
  });
  gate.input.addEventListener('focus', paintCells);
  gate.input.addEventListener('blur', paintCells);
  gate.field.addEventListener('click', () => gate.input.focus());

  gate.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = gate.input.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      showError('passcodeIncomplete', true);
      gate.input.focus();
      return;
    }
    verifyAndRender(code);
  });

  paintCells();
  if (window.matchMedia?.('(pointer: fine)').matches) gate.input.focus();
}
