import { L } from '/app/lib/quote-labels.js';
import { renderQuoteTemplate } from '/app/lib/quote-template.js';

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

function renderQuote(data) {
  const root = document.getElementById('quote-root');
  root.innerHTML = `
    <div class="quote-toolbar">
      <button id="lang-en" type="button" class="${currentLang === 'en' ? 'active' : ''}">EN</button>
      <button id="lang-ar" type="button" class="${currentLang === 'ar' ? 'active' : ''}">AR</button>
      <button id="print-btn" type="button">${L(currentLang, 'print')}</button>
    </div>
    ${renderQuoteTemplate(data, { editable: false, lang: currentLang, quoteUrl: `qdsystems.ae/q/${ID}` })}
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
