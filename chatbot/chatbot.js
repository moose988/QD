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
  const DEBUG_KEY = 'qd_chat_debug_v1';
  const LEAD_KEY = 'qd_chat_lead_v1';
  const MAX_HISTORY = 12;
  const REQUEST_TIMEOUT_MS = 45000;
  const STREAM_STALL_TIMEOUT_MS = 15000;

  // ─── i18n strings ──────────────────────────────────────────────────────────
  const STRINGS = {
    en: {
      title: 'QD Assistant',
      status: 'Online · Replies instantly',
      placeholder: 'Ask anything about QD…',
      footer: 'Powered by QD Systems',
      open: 'Open chat with QD',
      close: 'Close chat',
      newChat: 'New chat',
      send: 'Send',
      gateTitle: 'Before we start',
      gateSub: 'Leave your details so the team can follow up — even if the chat gets cut off.',
      gName: 'Your name',
      gEmail: 'Email',
      gPhone: 'WhatsApp / phone (optional)',
      gStart: 'Start chat →',
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
      newChat: 'محادثة جديدة',
      send: 'إرسال',
      gateTitle: 'قبل ما نبدأ',
      gateSub: 'اترك بياناتك حتى يتواصل معك الفريق — حتى لو انقطعت المحادثة.',
      gName: 'الاسم',
      gEmail: 'البريد الإلكتروني',
      gPhone: 'واتساب / رقم الهاتف (اختياري)',
      gStart: 'ابدأ المحادثة →',
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
    debugStages: JSON.parse(sessionStorage.getItem(DEBUG_KEY) || '[]'),
    lead: JSON.parse(localStorage.getItem(LEAD_KEY) || 'null'),
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
        <button class="qd-chat-new" type="button" aria-label="${STRINGS[state.lang].newChat}" title="${STRINGS[state.lang].newChat}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"/></svg>
        </button>
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
    newChatBtn: root.querySelector('.qd-chat-new'),
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
    if (els.newChatBtn) { els.newChatBtn.setAttribute('aria-label', s.newChat); els.newChatBtn.setAttribute('title', s.newChat); }
    els.input.placeholder = s.placeholder;
    els.launcher.setAttribute('aria-label', s.open);
    els.close.setAttribute('aria-label', s.close);
    els.send.setAttribute('aria-label', s.send);
    renderChips();
  }

  function renderChips() {
    if (root.getAttribute('data-gate') === 'true') { els.chips.hidden = true; els.chips.innerHTML = ''; return; }
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

  function persistDebugStages() {
    sessionStorage.setItem(DEBUG_KEY, JSON.stringify(state.debugStages.slice(-25)));
  }

  function resetDebugStages() {
    state.debugStages = [];
    persistDebugStages();
  }

  function recordDebugStage(stage, meta = {}) {
    const entry = {
      stage,
      meta,
      at: new Date().toISOString(),
    };
    state.debugStages.push(entry);
    if (state.debugStages.length > 25) {
      state.debugStages = state.debugStages.slice(-25);
    }
    persistDebugStages();
    console.info(`[qd-chat] stage: ${stage}`, meta, entry.at);
  }

  function formatDebugStages(limit = 6) {
    return state.debugStages
      .slice(-limit)
      .map((entry) => {
        const meta = Object.keys(entry.meta || {}).length ? ` ${JSON.stringify(entry.meta)}` : '';
        return `${entry.stage}${meta}`;
      })
      .join('\n');
  }

  function buildDebugMessage(baseMessage, extras = []) {
    const stages = formatDebugStages();
    return [
      baseMessage,
      ...extras.filter(Boolean),
      stages ? `Checkpoints:\n${stages}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
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
  function saveLead(lead) {
    state.lead = lead;
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(lead)); } catch (e) {}
    // Persist immediately so the lead is caught even if the visitor disconnects mid-chat.
    try {
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone, sessionId: state.sessionId, language: state.lang, pageUrl: location.href }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  function renderLeadGate() {
    const s = STRINGS[state.lang];
    root.setAttribute('data-gate', 'true');
    els.chips.hidden = true;
    els.messages.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'qd-chat-gate';
    form.innerHTML =
      '<div class="qd-chat-gate-title">' + escapeHtml(s.gateTitle) + '</div>' +
      '<div class="qd-chat-gate-sub">' + escapeHtml(s.gateSub) + '</div>' +
      '<input class="qd-chat-gate-input" name="name" autocomplete="name" placeholder="' + escapeHtml(s.gName) + '" required>' +
      '<input class="qd-chat-gate-input" name="email" type="email" autocomplete="email" placeholder="' + escapeHtml(s.gEmail) + '" required>' +
      '<input class="qd-chat-gate-input" name="phone" inputmode="tel" autocomplete="tel" placeholder="' + escapeHtml(s.gPhone) + '">' +
      '<button class="qd-chat-gate-btn" type="submit">' + escapeHtml(s.gStart) + '</button>';
    els.messages.appendChild(form);
    setTimeout(function () { var n = form.querySelector('input[name="name"]'); if (n) n.focus(); }, 60);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (form.querySelector('[name="name"]').value || '').trim();
      var email = (form.querySelector('[name="email"]').value || '').trim();
      var phone = (form.querySelector('[name="phone"]').value || '').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      saveLead({ name: name, email: email, phone: phone });
      root.removeAttribute('data-gate');
      renderHistory();
      els.input.focus();
    });
  }

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
    const abortController = new AbortController();
    let timeoutId = null;
    let stallTimer = null;

    try {
      resetDebugStages();
      recordDebugStage('fetch_started', { apiUrl: API_URL });
      recordDebugStage('request_payload_ready', {
        historyCount: Math.max(0, state.history.slice(-MAX_HISTORY, -1).length),
        sessionId: state.sessionId,
        pageLang: state.lang,
      });
      timeoutId = setTimeout(() => {
        recordDebugStage('request_timeout', { timeoutMs: REQUEST_TIMEOUT_MS });
        abortController.abort(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          message: text,
          history: state.history.slice(-MAX_HISTORY, -1), // exclude just-added user turn
          sessionId: state.sessionId,
          pageLang: state.lang,
          pageUrl: location.href,
        }),
      });
      recordDebugStage('fetch_response_received', { ok: resp.ok, status: resp.status });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const removeTyping = () => { if (typing.parentNode) typing.parentNode.removeChild(typing); };
      const clearStallTimer = () => {
        if (stallTimer) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      };
      const armStallTimer = () => {
        clearStallTimer();
        stallTimer = setTimeout(() => {
          recordDebugStage('stream_stalled', { timeoutMs: STREAM_STALL_TIMEOUT_MS });
        }, STREAM_STALL_TIMEOUT_MS);
      };

      armStallTimer();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          recordDebugStage('stream_reader_done');
          clearStallTimer();
          break;
        }
        armStallTimer();
        recordDebugStage('stream_chunk_received', { bytes: value?.length || 0 });
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
          } else if (obj.type === 'debug') {
            recordDebugStage(obj.stage, obj.meta || {});
          } else if (obj.type === 'lead' && obj.saved) {
            addLeadBanner();
          } else if (obj.type === 'sources') {
            // Optionally store sources for debug — not displayed by default
            if (botEl) botEl.dataset.sources = JSON.stringify(obj.items);
          } else if (obj.type === 'error') {
            removeTyping();
            console.error('[qd-chat] backend error:', {
              message: obj.message,
              details: obj.details,
              code: obj.code,
              statusCode: obj.statusCode,
              stage: obj.stage,
              debugStages: state.debugStages,
            });
            if (!botText) {
              const stageLabel = obj.stage ? `Debug stage: ${obj.stage}` : '';
              const detailLabel = obj.details ? `Reason: ${obj.details}` : '';
              const debugText = [obj.message || STRINGS[state.lang].errorNetwork, stageLabel, detailLabel]
                .filter(Boolean)
                .join('\n');
              addMessage('assistant', debugText);
              continue;
            }
            addMessage('assistant', obj.message || STRINGS[state.lang].errorNetwork);
          } else if (obj.type === 'done') {
            // Finalize
            recordDebugStage('stream_done');
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
      } else {
        recordDebugStage('empty_response_received');
        addMessage(
          'assistant',
          buildDebugMessage(
            state.lang === 'ar'
              ? 'لم يصل أي رد نصي من الخادم. راجع نقاط التحقق التالية وسجلات Vercel.'
              : 'The server finished without sending any text. Check the checkpoints below and the Vercel logs.'
          )
        );
      }
    } catch (err) {
      console.error('[qd-chat] error:', err, { debugStages: state.debugStages });
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      const isAbort = err?.name === 'AbortError' || /timed out/i.test(err?.message || '');
      addMessage(
        'assistant',
        buildDebugMessage(
          isAbort
            ? (state.lang === 'ar'
                ? 'انتهت مهلة طلب الدردشة قبل وصول الرد.'
                : 'The chat request timed out before a response arrived.')
            : STRINGS[state.lang].errorNetwork,
          [
            err?.message ? `Reason: ${err.message}` : '',
            'If this is the Vercel deployment, check the function logs for `/api/chat`.',
          ]
        )
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (stallTimer) clearTimeout(stallTimer);
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
    setTimeout(() => { const gn = root.querySelector('.qd-chat-gate input[name="name"]'); (gn || els.input).focus(); }, 200);
  }
  function closePanel() {
    state.open = false;
    root.setAttribute('data-open', 'false');
    sessionStorage.removeItem(OPEN_KEY);
  }

  // Start a fresh conversation (keeps the captured lead so the gate isn't shown again).
  function newChat() {
    state.history = [];
    state.sessionId = `qd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, state.sessionId);
    persist();
    resetDebugStages();
    root.removeAttribute('data-gate');
    renderHistory();
    if (state.open) setTimeout(() => els.input.focus(), 50);
  }

  els.launcher.addEventListener('click', () => (state.open ? closePanel() : openPanel()));
  els.close.addEventListener('click', closePanel);
  els.newChatBtn.addEventListener('click', newChat);

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
  if (state.lead || (state.history && state.history.length)) {
    renderHistory();
  } else {
    renderLeadGate();
  }
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
    getDebugStages() {
      return [...state.debugStages];
    },
    state,
  };
})();
