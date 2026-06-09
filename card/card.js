import { db } from '../firebase.js';
import {
  collection,
  getDocs,
  limit,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const SITE_URL = 'https://qdsystems.ae';
const skeletonEl = document.getElementById('card-skeleton');
const contentEl = document.getElementById('card-content');
const emptyEl = document.getElementById('card-empty');

const iconMarkup = {
  phone: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 3.8h3.2l1.1 4.3-2 1.9a16.3 16.3 0 0 0 5.1 5.1l1.9-2 4.3 1.1v3.2c0 .9-.7 1.6-1.6 1.6C9.3 19 5 14.7 5 9.4c0-.9.7-1.6 1.6-1.6Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.8a8 8 0 0 1-11.7 7l-4 1 1-3.8A8 8 0 1 1 20 11.8Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.7 9.1c.2-.4.4-.4.6-.4h.5c.2 0 .5 0 .6.5l.6 1.5c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .4.4.8 1 1.4 1.8 1.8.1.1.3.1.4 0l.6-.5c.2-.2.4-.2.6-.1l1.5.6c.5.1.5.4.5.6v.5c0 .2 0 .4-.4.6-.4.2-1 .4-1.6.3-1-.2-2-.7-3.3-2-1.3-1.3-1.8-2.3-2-3.3-.1-.6.1-1.2.3-1.6Z" fill="currentColor"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16v11H4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4.8 7.2 7.2 5.8 7.2-5.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  website: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 12h15M12 4a12.4 12.4 0 0 1 0 16M12 4a12.4 12.4 0 0 0 0 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 9.5V18M7 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM11 9.5V18m0-5c0-2.3 1.4-3.8 3.4-3.8 2 0 2.6 1.3 2.6 3.7V18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6"/><circle cx="16.6" cy="7.4" r=".9" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.5 13.5 13.5 10.5M9 15H7.5a3.5 3.5 0 1 1 0-7H9M15 9h1.5a3.5 3.5 0 1 1 0 7H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  contact: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 5.5h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="2" stroke="currentColor" stroke-width="1.6"/><path d="M6.8 15.3c.9-1.2 2.1-1.8 3.4-1.8s2.5.6 3.4 1.8M14 9h3M14 12h3M14 15h2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizePhoneForWhatsapp = (phone) => String(phone ?? '').replace(/[^\d]/g, '');

const getInitials = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'QD';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
};

const shortUrl = (value) => {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '');
  } catch {
    return String(value ?? '');
  }
};

const getSlugFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get('slug');
  if (slugParam) return slugParam.trim().toLowerCase();

  const parts = window.location.pathname.split('/').filter(Boolean);
  const cardIndex = parts.indexOf('card');
  if (cardIndex >= 0 && parts[cardIndex + 1] && parts[cardIndex + 1] !== 'index.html') {
    return parts[cardIndex + 1].trim().toLowerCase();
  }
  return '';
};

const iconForLink = (icon) => iconMarkup[icon] || iconMarkup.link;

const buildCardLinks = (card) => {
  const links = [];

  if (card.email) {
    links.push({
      label: 'Email',
      url: `mailto:${card.email}`,
      subtitle: card.email,
      icon: 'email'
    });
  }

  if (card.website) {
    links.push({
      label: 'Website',
      url: card.website,
      subtitle: shortUrl(card.website),
      icon: 'website'
    });
  }

  for (const item of Array.isArray(card.links) ? card.links : []) {
    if (!item?.url || !item?.label) continue;
    links.push({
      label: item.label,
      url: item.url,
      subtitle: shortUrl(item.url),
      icon: item.icon || 'link'
    });
  }

  return links;
};

const renderAvatar = (card) => {
  if (card.avatar) {
    return `<img src="${escapeHtml(card.avatar)}" alt="${escapeHtml(card.name)}">`;
  }
  return `<span class="card-avatar-initials">${escapeHtml(getInitials(card.name))}</span>`;
};

const renderCard = (id, rawCard) => {
  const card = {
    company: 'QD SYSTEMS',
    website: SITE_URL,
    ...rawCard,
    id
  };
  const links = buildCardLinks(card);
  const whatsappPhone = normalizePhoneForWhatsapp(card.phone);

  document.title = `${card.name} | QD SYSTEMS`;

  contentEl.innerHTML = `
    <div class="card-avatar card-animate" id="card-avatar-el">${renderAvatar(card)}</div>
    <h1 class="card-name card-animate" id="card-name-el">${escapeHtml(card.name || 'QD SYSTEMS')}</h1>
    <p class="card-role card-animate" id="card-role-el">${escapeHtml(card.role || 'Digital Systems')}</p>
    <span class="card-company-badge card-animate" id="card-company-el">${escapeHtml(card.company || 'QD SYSTEMS')}</span>

    <div class="card-actions card-animate">
      <a class="card-btn-call" id="card-call-btn" href="${escapeHtml(card.phone ? `tel:${card.phone}` : '#')}" ${card.phone ? '' : 'aria-disabled="true"'}>${iconMarkup.phone}<span>Call</span></a>
      <a class="card-btn-whatsapp" id="card-wa-btn" href="${escapeHtml(whatsappPhone ? `https://wa.me/${whatsappPhone}` : '#')}" target="_blank" rel="noreferrer noopener" ${whatsappPhone ? '' : 'aria-disabled="true"'}>${iconMarkup.whatsapp}<span>WhatsApp</span></a>
    </div>

    <div class="card-links card-animate" id="card-links-el">
      ${links.map((item) => `
        <a class="card-link-row" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">
          <div class="card-link-icon">${iconForLink(item.icon)}</div>
          <div class="card-link-text">
            <span class="card-link-label">${escapeHtml(item.label)}</span>
            <span class="card-link-sub">${escapeHtml(item.subtitle)}</span>
          </div>
          <div class="card-link-arrow" aria-hidden="true">-></div>
        </a>
      `).join('')}
    </div>

    <button class="card-save-btn card-animate" type="button" id="card-save-btn">${iconMarkup.contact}<span>Save to Contacts</span></button>
  `;

  const avatarHost = document.getElementById('card-avatar-el');
  if (avatarHost) {
    avatarHost.innerHTML = renderAvatar(card);
  }

  const saveButton = document.getElementById('card-save-btn');
  if (saveButton) {
    saveButton.addEventListener('click', () => downloadVCard(card));
  }

  if (skeletonEl) skeletonEl.style.display = 'none';

  contentEl.hidden = false;
  contentEl.style.opacity = '0';
  contentEl.style.display = 'flex';

  requestAnimationFrame(() => {
    contentEl.style.transition = 'opacity 0.3s ease';
    contentEl.style.opacity = '1';
  });

  const animatables = contentEl.querySelectorAll('.card-animate');
  animatables.forEach((el, index) => {
    el.style.animationDelay = `${index * 70}ms`;
  });
};

const renderMissing = (slug) => {
  document.title = 'Card Not Found | QD SYSTEMS';
  emptyEl.innerHTML = `
    <div class="card-empty-state">
      <div class="card-company-badge">Smart Card</div>
      <h1>Card not found</h1>
      <p>${slug ? `No active QD card exists for "${escapeHtml(slug)}".` : 'This smart card link is missing a profile slug.'}</p>
      <a href="${SITE_URL}">Visit qdsystems.ae</a>
    </div>
  `;
  emptyEl.hidden = false;
};

const downloadVCard = (card) => {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${card.name || ''}`,
    `ORG:${card.company || ''}`,
    `TITLE:${card.role || ''}`,
    `TEL;TYPE=CELL:${card.phone || ''}`,
    `EMAIL:${card.email || ''}`,
    `URL:${card.website || ''}`,
    'END:VCARD'
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(card.slug || 'qd-card').toLowerCase()}.vcf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const incrementViews = async (id) => {
  try {
    await fetch('/api/card-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (error) {
    console.warn('[card-view] increment skipped:', error?.message || error);
  }
};

const loadCard = async () => {
  const slug = getSlugFromLocation();

  try {
    const cardsRef = collection(db, 'cards');
    const slugQuery = query(cardsRef, where('slug', '==', slug), limit(1));
    const snapshot = await getDocs(slugQuery);
    const docSnap = snapshot.docs[0];

    if (!docSnap) {
      if (skeletonEl) skeletonEl.style.display = 'none';
      renderMissing(slug);
      return;
    }

    const card = docSnap.data();
    if (card.active === false) {
      if (skeletonEl) skeletonEl.style.display = 'none';
      renderMissing(slug);
      return;
    }

    renderCard(docSnap.id, card);
    incrementViews(docSnap.id);
  } catch (error) {
    console.error('[card] load failed:', error);
    if (skeletonEl) skeletonEl.style.display = 'none';
    renderMissing(slug);
  }
};

loadCard();
