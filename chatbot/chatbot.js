/* =============================================================================
   QD Systems chatbot widget
   - Drop-in vanilla JS, no framework needed.
   - Streams responses via SSE from /api/chat.
   - Bilingual EN/AR, auto-detects page language and switches mid-conversation.
   - Persists session ID + recent history in localStorage.

   Usage (in your HTML, just before </body>):
     <link rel="stylesheet" href="/chatbot/chatbot.css">
     <script type="module" src="/chatbot/chatbot.js"></script>

   Optional config attribute on the script tag:
     data-api="/api/chat"  (default)
     data-lang="en"        (force language; default: auto-detect from <html lang>)
   ============================================================================= */

(() => {
  // ─── Config ────────────────────────────────────────────────────────────────
  const currentScript = document.currentScript || [...document.scripts].pop();
  const API_URL = currentScript?.dataset?.api || '/api/chat';
  const FORCED_LANG = currentScript?.dataset?.lang || null;

  const SESSION_KEY = 'qd_chat_session_v1';
  const HISTORY_KEY = 'qd_chat_history_v1';
  const OPEN_KEY = 'qd_chat_open_v1';
  const MAX_HISTORY = 12;

  // ─── i18n strings ──────────────────────────────────────────────────────────
  const STRINGS = {
    en: {
      title: 'QD Assistant',
      status: 'Online · Replies instantly',
      placeholder: 'Ask anything about QD…',
      footer: 'Powered by QD Systems',
      open: 'Open chat with QD',
      close: 'Close chat',
      send: 'Send',
      greeting:
        "Hey — I'm QD's AI assistant. I can answer questions about our services, process, work, and timelines — and book you in with the team if you're ready to start. What are you working on?",
      chips: [
        'What do you build?',
        'How long does a project take?',
        'Show me your work',
        'I need a website',
      ],
      leadSaved: 'Got it — your details are with the QD team. We\'ll follow up shortly.',
      errorNetwork: 'Connection hiccup. Try once more, or WhatsApp +971 50 534 9907.',
    },
    ar: {
      title: 'مساعد QD',
      status: 'متصل · يرد فوراً',
      placeholder: 'اسأل أي شيء عن QD…',
      footer: 'مدعوم بـ QD Systems',
      open: 'فتح محادثة QD',
      close: 'إغلاق المحادثة',
      send: 'إرسال',
      greeting:
        'مرحباً — أنا المساعد الذكي لـ QD. أقدر أرد على أسئلتك عن خدماتنا وعمليتنا وأعمالنا والمدد الزمنية — وأوصلك بالفريق إذا كنت جاهزاً للبدء. على شو تشتغل؟',
      chips: ['شو تبنون؟', 'كم تأخذ مدة المشروع؟', 'اعرض أعمالكم', 'أحتاج موقع'],
      leadSaved: 'تم — بياناتك وصلت لفريق QD. سنتواصل معك قريباً.',
      errorNetwork: 'انقطاع بسيط في الاتصال. جرّب مرة ثانية، أو راسلنا واتساب +971 50 534 9907.',
    },
  };

  function detectLang(text) {
    return /[؀-ۿ]/.test(text || '') ? 'ar' : 'en';
  }

  function getPageLang() {
    if (FORCED_LANG === 'en' || FORCED_LANG === 'ar') return FORCED_LANG;
    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (htmlLang.startsWith('ar')) return 'ar';
    const dir = document.documentElement.dir || document.body.dir;
    if (dir === 'rtl') return 'ar';
    return 'en';
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  const state = {
    open: false,
    lang: getPageLang(),
    sessionId: localStorage.getItem(SESSION_KEY) || null,
    history: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'),
    sending: false,
  };

  if (!state.sessionId) {
    state.sessionId = `qd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, state.sessionId);
  }

  // ─── DOM scaffold ─────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'qd-chat-root';
  root.setAttribute('data-open', 'false');
  root.setAttribute('data-dir', state.lang === 'ar' ? 'rtl' : 'ltr');

  root.innerHTML = `
    <button class="qd-chat-launcher" type="button" aria-label="${STRINGS[state.lang].open}">
      <span class="qd-chat-launcher-pulse" aria-hidden="true"></span>
      <svg class="qd-chat-launcher-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12c0 4.418-4.03 8-9 8a9.96 9.96 0 0 1-4.06-.85L3 20l1.2-4.2A7.86 7.86 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    </button>

    <section class="qd-chat-panel" role="dialog" aria-modal="false" aria-label="QD chat">
      <header class="qd-chat-header">
        <div class="qd-chat-avatar" aria-hidden="true">QD</div>
        <div class="qd-chat-titles">
          <div class="qd-chat-title" data-i18n="title">${STRINGS[state.lang].title}</div>
          <div class="qd-chat-status">
            <span class="qd-chat-status-dot"></span>
            <span data-i18n="status">${STRINGS[state.lang].status}</span>
          </div>
        </div>
        <button class="qd-chat-close" type="button" aria-label="${STRINGS[state.lang].close}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>

      <div class="qd-chat-messages" role="log" aria-live="polite" aria-atomic="false"></div>

      <div class="qd-chat-chips" hidden></div>

      <form class="qd-chat-input-wrap">
        <textarea
          class="qd-chat-input"
          rows="1"
          placeholder="${STRINGS[state.lang].placeholder}"
          aria-label="Message"
          maxlength="2000"></textarea>
        <button class="qd-chat-send" type="submit" aria-label="${STRINGS[state.lang].send}" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </form>

      <div class="qd-chat-footer">
        <span data-i18n="footer">${STRINGS[state.lang].footer}</span>
      </div>
    </section>
  `;

  document.body.appendChild(root);

  const els = {
    launcher: root.querySelector('.qd-chat-launcher'),
    panel: root.querySelector('.qd-chat-panel'),
    close: root.querySelector('.qd-chat-close'),
    messages: root.querySelector('.qd-chat-messages'),
    chips: root.querySelector('.qd-chat-chips'),
    form: root.querySelector('form'),
    input: root.querySelector('.qd-chat-input'),
    send: root.querySelector('.qd-chat-send'),
  };

  // ─── Rendering ────────────────────────────────────────────────────────────
  function refreshStrings() {
    const s = STRINGS[state.lang];
    root.setAttribute('data-dir', state.lang === 'ar' ? 'rtl' : 'ltr');
    root.querySelector('[data-i18n="title"]').textContent = s.title;
    root.querySelector('[data-i18n="status"]').textContent = s.status;
    root.querySelector('[data-i18n="footer"]').textContent = s.footer;
    els.input.placeholder = s.placeholder;
    els.launcher.setAttribute('aria-label', s.open);
    els.close.setAttribute('aria-label', s.close);
    els.send.setAttribute('aria-label', s.send);
    renderChips();
  }

  function renderChips() {
    // Show chips only when there's no user-sent history yet
    const hasUserTurn = state.history.some(m => m.role === 'user');
    if (hasUserTurn) {
      els.chips.hidden = true;
      els.chips.innerHTML = '';
      return;
    }
    els.chips.hidden = false;
    els.chips.innerHTML = '';
    STRINGS[state.lang].chips.forEach(label => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qd-chat-chip';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        els.input.value = label;
        autosize();
        send(label);
      });
      els.chips.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Minimal markdown -> HTML for assistant messages (bold, italic, links, lists, code).
  function md(text) {
    let html = escapeHtml(text);
    // Code spans
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold + italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|tel:|mailto:|\/)[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Bullet lists (line-by-line)
    const lines = html.split('\n');
    const out = [];
    let inList = false;
    for (const ln of lines) {
      const m = ln.match(/^\s*[-*•]\s+(.*)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${m[1]}</li>`);
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(ln);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n').replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
  }

  function addMessage(role, text, opts = {}) {
    const el = document.createElement('div');
    el.className = `qd-chat-msg qd-chat-msg-${role}`;
    if (role === 'assistant') el.innerHTML = md(text);
    else el.textContent = text;
    if (opts.streaming) el.dataset.streaming = '1';
    els.messages.appendChild(el);
    requestAnimationFrame(() => els.messages.scrollTop = els.messages.scrollHeight);
    return el;
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'qd-chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    els.messages.appendChild(el);
    requestAnimationFrame(() => els.messages.scrollTop = els.messages.scrollHeight);
    return el;
  }

  function addLeadBanner() {
    const el = document.createElement('div');
    el.className = 'qd-chat-lead-banner';
    el.innerHTML = `<span class="qd-chat-lead-banner-dot"></span><span>${escapeHtml(STRINGS[state.lang].leadSaved)}</span>`;
    els.messages.appendChild(el);
    requestAnimationFrame(() => els.messages.scrollTop = els.messages.scrollHeight);
  }

  function renderHistory() {
    els.messages.innerHTML = '';
    // Greeting first
    addMessage('assistant', STRINGS[state.lang].greeting);
    for (const m of state.history) {
      addMessage(m.role === 'user' ? 'user' : 'assistant', m.content);
    }
    renderChips();
  }

  // ─── Sending ──────────────────────────────────────────────────────────────
  async function send(messageText) {
    const text = (messageText ?? els.input.value).trim();
    if (!text || state.sending) return;

    // Switch language to match the user if they switched
    const detected = detectLang(text);
    if (detected !== state.lang) {
      state.lang = detected;
      refreshStrings();
    }

    state.sending = true;
    els.input.value = '';
    autosize();
    els.send.disabled = true;
    els.input.disabled = true;

    addMessage('user', text);
    state.history.push({ role: 'user', content: text });
    persist();
    renderChips();

    const typing = addTyping();
    let botEl = null;
    let botText = '';

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: state.history.slice(-MAX_HISTORY, -1), // exclude just-added user turn
          sessionId: state.sessionId,
          pageLang: state.lang,
          pageUrl: location.href,
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const removeTyping = () => { if (typing.parentNode) typing.parentNode.removeChild(typing); };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: split on double newline; each event starts with "data: "
        const events = buffer.split(/\n\n/);
        buffer = events.pop(); // keep partial trailing event in buffer

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let obj;
          try { obj = JSON.parse(payload); } catch { continue; }

          if (obj.type === 'text') {
            if (!botEl) {
              removeTyping();
              botEl = addMessage('assistant', '', { streaming: true });
            }
            botText += obj.delta;
            botEl.innerHTML = md(botText);
            els.messages.scrollTop = els.messages.scrollHeight;
          } else if (obj.type === 'lead' && obj.saved) {
            addLeadBanner();
          } else if (obj.type === 'sources') {
            // Optionally store sources for debug — not displayed by default
            if (botEl) botEl.dataset.sources = JSON.stringify(obj.items);
          } else if (obj.type === 'error') {
            removeTyping();
            addMessage('assistant', obj.message || STRINGS[state.lang].errorNetwork);
          } else if (obj.type === 'done') {
            // Finalize
            removeTyping();
          }
        }
      }

      if (botText) {
        state.history.push({ role: 'assistant', content: botText });
        // Trim history
        if (state.history.length > MAX_HISTORY * 2) {
          state.history = state.history.slice(-MAX_HISTORY * 2);
        }
        persist();
      }
    } catch (err) {
      console.error('[qd-chat] error:', err);
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      addMessage('assistant', STRINGS[state.lang].errorNetwork);
    } finally {
      state.sending = false;
      els.input.disabled = false;
      els.send.disabled = !els.input.value.trim();
      els.input.focus();
    }
  }

  function persist() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  }

  // ─── Open / close ─────────────────────────────────────────────────────────
  function openPanel() {
    state.open = true;
    root.setAttribute('data-open', 'true');
    sessionStorage.setItem(OPEN_KEY, '1');
    setTimeout(() => els.input.focus(), 200);
  }
  function closePanel() {
    state.open = false;
    root.setAttribute('data-open', 'false');
    sessionStorage.removeItem(OPEN_KEY);
  }

  els.launcher.addEventListener('click', () => (state.open ? closePanel() : openPanel()));
  els.close.addEventListener('click', closePanel);

  // ─── Input handling ───────────────────────────────────────────────────────
  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  }

  els.input.addEventListener('input', () => {
    autosize();
    els.send.disabled = !els.input.value.trim() || state.sending;
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });

  // ─── Initial render ───────────────────────────────────────────────────────
  renderHistory();
  refreshStrings();
  if (sessionStorage.getItem(OPEN_KEY)) openPanel();

  // Expose tiny API for debugging
  window.__qdChat = {
    open: openPanel,
    close: closePanel,
    reset() {
      state.history = [];
      state.sessionId = `qd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, state.sessionId);
      persist();
      renderHistory();
    },
    state,
  };
})();
