/* =============================================================================
   QD OS - Chat Admin
   Shows two tabs:
     - Leads: documents captured by the chatbot's capture_lead tool
     - Conversations: full chat session logs (with messages subcollection)

   Reuses the same Firebase auth as admin.html. Requires the same auth user.

   Firestore rules to add (alongside the existing projectSubmissions rules):

     match /chatLeads/{document} {
       allow create: if true;
       allow read, update, delete: if request.auth != null;
     }
     match /chatConversations/{document} {
       allow create, update: if true;
       allow read, delete: if request.auth != null;
       match /messages/{msg} {
         allow create: if true;
         allow read: if request.auth != null;
       }
     }
     match /kb_chunks/{document} {
       allow read: if true;  // read by the chat function via admin SDK; rules don't apply there
       allow write: if false; // admin SDK bypasses anyway
     }
   ============================================================================= */

import { auth, db } from './firebase.js';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  limit as fsLimit,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const root = document.getElementById('qd-chat-admin-root');

const state = {
  user: null,
  authLoading: true,
  tab: 'leads',
  leads: [],
  conversations: [],
  selectedLeadId: null,
  selectedConvoId: null,
  selectedConvoMessages: [],
  loginError: '',
  isLoggingIn: false,
};

let leadsUnsub = null;
let convosUnsub = null;
let messagesUnsub = null;

// ─── Helpers ──────────────────────────────────────────────────────────────
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtTime(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtContactLink(contact, type) {
  if (!contact) return '—';
  const c = String(contact).trim();
  if (type === 'whatsapp' || type === 'phone') {
    const digits = c.replace(/[^\d]/g, '');
    if (!digits) return escapeHtml(c);
    return `<a href="https://wa.me/${digits}?text=${encodeURIComponent('Hi from QD Systems, following up on your message.')}" target="_blank" rel="noopener">${escapeHtml(c)}</a>`;
  }
  if (type === 'email') {
    return `<a href="mailto:${encodeURIComponent(c)}?subject=${encodeURIComponent('QD Systems - following up')}">${escapeHtml(c)}</a>`;
  }
  return escapeHtml(c);
}

// ─── Renderers ────────────────────────────────────────────────────────────
function mapLeadToSubmission(lead) {
  const isEmail = lead.contact_type === 'email';
  const businessName = (lead.name || '').trim();
  const businessEmail = isEmail ? (lead.contact || '').trim() : '';
  const businessPhone = !isEmail ? (lead.contact || '').trim() : '';
  const priority = lead.urgency === 'urgent' ? 'High' : 'Normal';
  const importedNoteParts = [
    'Imported from chat lead.',
    lead.project_brief ? `Brief: ${lead.project_brief}` : '',
    lead.sourceUrl ? `Source URL: ${lead.sourceUrl}` : '',
    lead.sessionId ? `Chat session: ${lead.sessionId}` : '',
  ].filter(Boolean);

  return {
    businessName,
    businessEmail,
    businessPhone,
    industry: lead.business_type || '',
    businessDescription: lead.project_brief || '',
    mainPurpose: 'generate_leads',
    selectedMainPurpose: 'generate_leads',
    visitorAction: '',
    idealCustomer: '',
    requiredFeatures: [],
    optionalServices: [],
    selectedRequiredFeatures: [],
    selectedOptionalServices: [],
    budgetRange: '',
    launchDate: '',
    urgency: lead.urgency || 'unknown',
    notes: importedNoteParts.join('\n'),
    status: 'New',
    priority,
    source: 'chat_lead_import',
    importedFrom: 'chatLeads',
    importedChatLeadId: lead.id,
    importedChatSessionId: lead.sessionId || '',
    language: lead.language || 'en',
    createdAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    lastUpdatedAt: serverTimestamp(),
  };
}

async function importLeadToSubmissions(lead) {
  if (!lead) return null;
  if (lead.importedSubmissionId) return lead.importedSubmissionId;

  const submissionRef = await addDoc(collection(db, 'projectSubmissions'), mapLeadToSubmission(lead));

  await updateDoc(doc(db, 'chatLeads', lead.id), {
    importedSubmissionId: submissionRef.id,
    importedAt: serverTimestamp(),
  });

  return submissionRef.id;
}

function renderShell(content) {
  const userBadge = state.user?.email
    ? `<span class="qd-admin-user-badge">${escapeHtml(state.user.email)}</span>`
    : '';
  return `
    <div class="qd-admin-shell">
      <div class="qd-admin-frame">
        <header class="qd-admin-topbar">
          <div class="qd-admin-brand">
            <img src="assets/qd-logo.jpeg" alt="QD Systems">
          </div>
          <div class="qd-admin-topbar-actions">
            <a class="qd-admin-link" href="admin.html">Submissions</a>
            ${userBadge}
            ${state.user ? '<button class="qd-btn qd-btn-ghost qd-btn-sm" type="button" data-action="logout">Logout</button>' : ''}
          </div>
        </header>
        ${content}
      </div>
    </div>
  `;
}

function renderLogin() {
  return renderShell(`
    <section class="qd-admin-login">
      <article class="qd-admin-login-panel">
        <div class="qd-eyebrow qd-admin-kicker">Admin authentication</div>
        <h2>Enter QD OS — Chat</h2>
        <p>Sign in with your Firebase admin account to review chat leads and conversations.</p>
        <form id="chat-admin-login-form" class="qd-admin-login-form">
          <label class="qd-admin-field">
            <span>Email</span>
            <input id="chat-admin-email" type="email" autocomplete="email" required>
          </label>
          <label class="qd-admin-field">
            <span>Password</span>
            <input id="chat-admin-password" type="password" autocomplete="current-password" required>
          </label>
          ${state.loginError ? `<div class="qd-admin-login-error">${escapeHtml(state.loginError)}</div>` : ''}
          <button class="qd-btn qd-btn-primary" type="submit" ${state.isLoggingIn ? 'disabled' : ''}>${state.isLoggingIn ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </article>
    </section>
  `);
}

function renderLeadItem(lead) {
  const selected = lead.id === state.selectedLeadId ? 'is-selected' : '';
  const name = lead.name || (lead.business_type ? `(${lead.business_type})` : '—');
  return `
    <div class="qd-chat-admin-item ${selected}" data-action="select-lead" data-id="${lead.id}">
      <div class="qd-meta">${escapeHtml(lead.urgency || 'unknown')} · ${fmtTime(lead.createdAt)}</div>
      <h4>${escapeHtml(name)}</h4>
      <div class="qd-brief">${escapeHtml(lead.project_brief || '—')}</div>
    </div>
  `;
}

function renderConvoItem(c) {
  const selected = c.id === state.selectedConvoId ? 'is-selected' : '';
  return `
    <div class="qd-chat-admin-item ${selected}" data-action="select-convo" data-id="${c.id}">
      <div class="qd-meta">${escapeHtml(c.lang || '—')} · ${escapeHtml(String(c.messageCount || 0))} msgs · ${fmtTime(c.lastUpdatedAt)}</div>
      <h4>${escapeHtml((c.lastMessage || '—').slice(0, 60))}</h4>
      <div class="qd-brief">${escapeHtml((c.lastResponse || '').slice(0, 120))}</div>
    </div>
  `;
}

function renderLeadDetail(lead) {
  if (!lead) {
    return '<div class="qd-chat-admin-empty">Select a lead to view details</div>';
  }
  const status = lead.status || 'new';
  const importedSubmissionId = lead.importedSubmissionId || '';
  return `
    <div class="qd-chat-admin-header">
      <h2>${escapeHtml(lead.name || lead.business_type || 'Anonymous lead')}</h2>
      <span class="qd-chat-admin-status-badge ${status !== 'new' ? 'is-contacted' : ''}">${escapeHtml(status)}</span>
    </div>

    <div class="qd-chat-admin-actions">
      ${lead.contact ? `<a class="is-primary" href="${lead.contact_type === 'email' ? 'mailto:' + encodeURIComponent(lead.contact) : 'https://wa.me/' + lead.contact.replace(/[^\d]/g, '')}" target="_blank" rel="noopener">${escapeHtml(lead.contact_type === 'email' ? 'Email' : 'WhatsApp')} →</a>` : ''}
      ${status === 'new' ? `<a href="#" data-action="mark-contacted" data-id="${lead.id}">Mark as contacted</a>` : ''}
      ${lead.sessionId ? `<a href="#" data-action="view-session" data-session="${lead.sessionId}">View conversation</a>` : ''}
      ${importedSubmissionId ? `<a href="admin.html">Open in submissions</a>` : `<a href="#" data-action="import-submission" data-id="${lead.id}">Import to submissions</a>`}
    </div>

    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Contact</span><span class="qd-chat-admin-field-value">${fmtContactLink(lead.contact, lead.contact_type)} (${escapeHtml(lead.contact_type || '—')})</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Business</span><span class="qd-chat-admin-field-value">${escapeHtml(lead.business_type || '—')}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Urgency</span><span class="qd-chat-admin-field-value">${escapeHtml(lead.urgency || '—')}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Language</span><span class="qd-chat-admin-field-value">${escapeHtml(lead.language || '—')}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Project brief</span><span class="qd-chat-admin-field-value">${escapeHtml(lead.project_brief || '—')}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Source URL</span><span class="qd-chat-admin-field-value">${lead.sourceUrl ? `<a href="${escapeHtml(lead.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(lead.sourceUrl)}</a>` : '—'}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Created</span><span class="qd-chat-admin-field-value">${fmtTime(lead.createdAt)}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Session ID</span><span class="qd-chat-admin-field-value" style="font-family: var(--font-mono); font-size: 11px;">${escapeHtml(lead.sessionId || '—')}</span></div>
  `;
}

function renderConvoDetail(convo) {
  if (!convo) {
    return '<div class="qd-chat-admin-empty">Select a conversation to view messages</div>';
  }
  const msgs = state.selectedConvoMessages || [];
  return `
    <div class="qd-chat-admin-header">
      <h2>Session ${escapeHtml(convo.id.slice(0, 12))}…</h2>
      <span class="qd-chat-admin-status-badge ${convo.hasLead ? '' : 'is-contacted'}">${convo.hasLead ? 'Lead captured' : 'No lead'}</span>
    </div>

    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Language</span><span class="qd-chat-admin-field-value">${escapeHtml(convo.lang || '—')}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Page</span><span class="qd-chat-admin-field-value">${convo.pageUrl ? `<a href="${escapeHtml(convo.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(convo.pageUrl)}</a>` : '—'}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Messages</span><span class="qd-chat-admin-field-value">${escapeHtml(String(convo.messageCount || msgs.length))}</span></div>
    <div class="qd-chat-admin-field"><span class="qd-chat-admin-field-label">Last update</span><span class="qd-chat-admin-field-value">${fmtTime(convo.lastUpdatedAt)}</span></div>

    <div class="qd-chat-admin-convo" ${convo.lang === 'ar' ? 'dir="rtl"' : ''}>
      ${msgs.length === 0
        ? '<div class="qd-chat-admin-empty-list">No messages yet</div>'
        : msgs.map(m => `
            <div class="qd-chat-admin-bubble qd-chat-admin-bubble-${m.role}">
              <div class="qd-chat-admin-bubble-meta">${escapeHtml(m.role)} · ${fmtTime(m.createdAt)}</div>
              ${escapeHtml(m.content || '')}
            </div>
          `).join('')}
    </div>
  `;
}

function renderApp() {
  const leftPane =
    state.tab === 'leads'
      ? state.leads.length === 0
        ? '<div class="qd-chat-admin-empty-list">No leads yet. Once a visitor shares their contact, it shows up here.</div>'
        : state.leads.map(renderLeadItem).join('')
      : state.conversations.length === 0
        ? '<div class="qd-chat-admin-empty-list">No conversations yet.</div>'
        : state.conversations.map(renderConvoItem).join('');

  const rightPane =
    state.tab === 'leads'
      ? renderLeadDetail(state.leads.find(l => l.id === state.selectedLeadId))
      : renderConvoDetail(state.conversations.find(c => c.id === state.selectedConvoId));

  return renderShell(`
    <section class="qd-chat-admin">
      <aside>
        <div class="qd-chat-admin-tabs">
          <button type="button" class="qd-chat-admin-tab ${state.tab === 'leads' ? 'is-active' : ''}" data-action="tab" data-tab="leads">Leads <span style="opacity:0.7">(${state.leads.length})</span></button>
          <button type="button" class="qd-chat-admin-tab ${state.tab === 'conversations' ? 'is-active' : ''}" data-action="tab" data-tab="conversations">Conversations <span style="opacity:0.7">(${state.conversations.length})</span></button>
        </div>
        <div class="qd-chat-admin-list">${leftPane}</div>
      </aside>
      <div class="qd-chat-admin-detail">${rightPane}</div>
    </section>
  `);
}

// ─── Render ───────────────────────────────────────────────────────────────
function render() {
  if (state.authLoading) {
    root.innerHTML = renderShell('<section style="display:grid;place-items:center;height:60vh;color:var(--fg3);font-family:var(--font-mono);font-size:11px;letter-spacing:0.16em;text-transform:uppercase">Loading…</section>');
    return;
  }
  if (!state.user) {
    root.innerHTML = renderLogin();
    document.getElementById('chat-admin-login-form')?.addEventListener('submit', handleLogin);
    return;
  }
  root.innerHTML = renderApp();
}

// ─── Event delegation ─────────────────────────────────────────────────────
root.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;

  if (action === 'logout') {
    await signOut(auth);
  } else if (action === 'tab') {
    state.tab = t.dataset.tab;
    render();
  } else if (action === 'select-lead') {
    state.selectedLeadId = t.dataset.id;
    render();
  } else if (action === 'select-convo') {
    state.selectedConvoId = t.dataset.id;
    subscribeMessages(t.dataset.id);
    render();
  } else if (action === 'mark-contacted') {
    e.preventDefault();
    const id = t.dataset.id;
    try {
      await updateDoc(doc(db, 'chatLeads', id), { status: 'contacted' });
    } catch (err) {
      console.error('failed to update lead status:', err);
    }
  } else if (action === 'import-submission') {
    e.preventDefault();
    const lead = state.leads.find((item) => item.id === t.dataset.id);
    if (!lead) return;
    try {
      await importLeadToSubmissions(lead);
    } catch (err) {
      console.error('failed to import lead into submissions:', err);
    }
  } else if (action === 'view-session') {
    e.preventDefault();
    const sessionId = t.dataset.session;
    state.tab = 'conversations';
    state.selectedConvoId = sessionId;
    subscribeMessages(sessionId);
    render();
  }
});

// ─── Auth + data ──────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  state.loginError = '';
  state.isLoggingIn = true;
  render();
  try {
    await setPersistence(auth, browserLocalPersistence);
    const email = document.getElementById('chat-admin-email').value.trim();
    const password = document.getElementById('chat-admin-password').value;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    state.loginError = err?.message || 'Login failed.';
    state.isLoggingIn = false;
    render();
  }
}

function subscribeLeads() {
  if (leadsUnsub) leadsUnsub();
  const q = query(collection(db, 'chatLeads'), orderBy('createdAt', 'desc'), fsLimit(200));
  leadsUnsub = onSnapshot(
    q,
    (snap) => {
      state.leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => { console.error('chatLeads listener failed:', err); }
  );
}

function subscribeConversations() {
  if (convosUnsub) convosUnsub();
  const q = query(collection(db, 'chatConversations'), orderBy('lastUpdatedAt', 'desc'), fsLimit(200));
  convosUnsub = onSnapshot(
    q,
    (snap) => {
      state.conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => { console.error('chatConversations listener failed:', err); }
  );
}

function subscribeMessages(sessionId) {
  if (messagesUnsub) messagesUnsub();
  state.selectedConvoMessages = [];
  const q = query(collection(db, 'chatConversations', sessionId, 'messages'), orderBy('createdAt', 'asc'), fsLimit(200));
  messagesUnsub = onSnapshot(
    q,
    (snap) => {
      state.selectedConvoMessages = snap.docs.map(d => d.data());
      render();
    },
    (err) => { console.error('messages listener failed:', err); }
  );
}

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  state.authLoading = false;

  if (user) {
    subscribeLeads();
    subscribeConversations();
  } else {
    if (leadsUnsub) { leadsUnsub(); leadsUnsub = null; }
    if (convosUnsub) { convosUnsub(); convosUnsub = null; }
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    state.leads = [];
    state.conversations = [];
  }

  render();
});

render();
