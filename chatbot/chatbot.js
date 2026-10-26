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
      gateSub: 'Leave your details so the team can follow up, even if the chat gets cut off.',
      gName: 'Your name',
      gEmail: 'Email',
      gPhone: 'WhatsApp / phone (optional)',
      gStart: 'Start chat →',
      greeting:
        "Hi, I'm QD's assistant. Got any questions about websites, NFC tags, event invitations or anything else we do? Ask away, I'm happy to help.",
      chips: [
        'What do you build?',
        'How long does a project take?',
        'Show me your work',
        'I need a website',
      ],
      leadSaved: 'Got it, your details are with the QD team. We\'ll follow up shortly.',
      errorNetwork: 'Connection hiccup. Try once more, or WhatsApp +971 50 461 1123.',
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
      gateTitle: 'قبل أن نبدأ',
      gateSub: 'اترك بياناتك حتى يتواصل معك الفريق, حتى لو انقطعت المحادثة.',
      gName: 'الاسم',
      gEmail: 'البريد الإلكتروني',
      gPhone: 'واتساب / رقم الهاتف (اختياري)',
      gStart: 'ابدأ المحادثة ←',
      greeting:
        'أهلاً، أنا مساعد QD. عندك أي سؤال عن المواقع أو بطاقات NFC أو دعوات المناسبات أو أي شيء نقدمه؟ اسأل براحتك, يسعدني أساعدك.',
      chips: ['ماذا تبنون؟', 'كم تستغرق مدة المشروع؟', 'اعرض أعمالكم', 'أحتاج موقعاً'],
      leadSaved: 'تم, بياناتك وصلت لفريق QD. سنتواصل معك قريباً.',
      errorNetwork: 'انقطاع بسيط في الاتصال. جرّب مرة أخرى، أو راسلنا واتساب +971 50 461 1123.',
    },
    zh: {
      title: 'QD 助手',
      status: '在线 · 即时回复',
      placeholder: '关于 QD，问我任何问题…',
      footer: '由 QD Systems 提供支持',
      open: '打开 QD 对话',
      close: '关闭对话',
      newChat: '新对话',
      send: '发送',
      gateTitle: '开始之前',
      gateSub: '留下你的联系方式，方便团队跟进，即使对话中断也不怕。',
      gName: '你的姓名',
      gEmail: '邮箱',
      gPhone: 'WhatsApp / 电话（可选）',
      gStart: '开始对话 →',
      greeting:
        '你好，我是 QD 的助手。关于网站、NFC 标签、活动请柬或我们做的其他事情，有什么想问的吗？尽管问，我很乐意帮忙。',
      chips: ['你们做什么？', '一个项目需要多久？', '看看你们的作品', '我需要一个网站'],
      leadSaved: '收到，你的信息已转交 QD 团队，我们会尽快跟进。',
      errorNetwork: '连接有点小问题。请再试一次，或 WhatsApp 联系 +971 50 461 1123。',
    },
    ru: {
      title: 'QD-ассистент',
      status: 'Онлайн · отвечает мгновенно',
      placeholder: 'Спросите что угодно о QD…',
      footer: 'На платформе QD Systems',
      open: 'Открыть чат с QD',
      close: 'Закрыть чат',
      newChat: 'Новый чат',
      send: 'Отправить',
      gateTitle: 'Прежде чем начать',
      gateSub: 'Оставьте контакты, чтобы команда могла связаться, даже если чат прервётся.',
      gName: 'Ваше имя',
      gEmail: 'Эл. почта',
      gPhone: 'WhatsApp / телефон (необязательно)',
      gStart: 'Начать чат →',
      greeting:
        'Здравствуйте, я ассистент QD. Есть вопросы про сайты, NFC-метки, приглашения на события или что-то ещё из того, что мы делаем? Спрашивайте, с радостью помогу.',
      chips: ['Что вы создаёте?', 'Сколько занимает проект?', 'Покажите ваши работы', 'Мне нужен сайт'],
      leadSaved: 'Принято, ваши данные у команды QD. Скоро свяжемся.',
      errorNetwork: 'Небольшой сбой связи. Попробуйте ещё раз или напишите в WhatsApp +971 50 461 1123.',
    },
  };

  const SUPPORTED_LANGS = ['en', 'ar', 'zh', 'ru'];

  // Returns a language code ONLY when the text carries a clear script signal,
  // otherwise null — so a contactless message (e.g. a phone number) never
  // resets an in-progress Chinese/Russian/Arabic chat back to English.
  function detectLang(text) {
    const t = text || '';
    if (/[؀-ۿ]/.test(t)) return 'ar';      // Arabic
    if (/[一-鿿]/.test(t)) return 'zh';      // Chinese (CJK)
    if (/[Ѐ-ӿ]/.test(t)) return 'ru';      // Russian (Cyrillic)
    return null;
  }

  function getPageLang() {
    if (SUPPORTED_LANGS.includes(FORCED_LANG)) return FORCED_LANG;
    if (SUPPORTED_LANGS.includes(window.QD_LANG)) return window.QD_LANG;
    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (htmlLang.startsWith('ar')) return 'ar';
    if (htmlLang.startsWith('zh')) return 'zh';
    if (htmlLang.startsWith('ru')) return 'ru';
    if ((document.documentElement.dir || document.body.dir) === 'rtl') return 'ar';
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

  // Action cards: a button under a reply that links somewhere useful.
  function safeActionUrl(url) {
    return typeof url === 'string' && (url.startsWith('https://events.qdsystems.ae/') || /^\/(#[\w-]*)?$/.test(url));
  }

  function renderActions(afterEl, actions) {
    const list = (actions || []).filter((a) => a && safeActionUrl(a.url));
    if (!list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'qd-chat-actions';
    list.forEach((a) => {
      const link = document.createElement('a');
      link.className = 'qd-chat-action';
      link.href = a.url;
      if (a.external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      else link.addEventListener('click', () => { if (typeof closePanel === 'function') closePanel(); });
      const title = document.createElement('span');
      title.className = 'qd-chat-action-title';
      title.textContent = a.title || '';
      const label = document.createElement('span');
      label.className = 'qd-chat-action-label';
      label.textContent = a.label || '';
      link.append(title, label);
      wrap.appendChild(link);
    });
    afterEl.appendChild(wrap);
    requestAnimationFrame(() => els.messages.scrollTop = els.messages.scrollHeight);
  }

  function renderHistory() {
    els.messages.innerHTML = '';
    // Greeting first
    addMessage('assistant', STRINGS[state.lang].greeting);
    for (const m of state.history) {
      const el = addMessage(m.role === 'user' ? 'user' : 'assistant', m.content);
      if (m.role !== 'user' && m.actions) renderActions(el, m.actions);
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
    if (matchMedia('(pointer: fine)').matches) {
      setTimeout(function () { var n = form.querySelector('input[name="name"]'); if (n) n.focus(); }, 60);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (form.querySelector('[name="name"]').value || '').trim();
      var email = (form.querySelector('[name="email"]').value || '').trim();
      var phone = (form.querySelector('[name="phone"]').value || '').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      saveLead({ name: name, email: email, phone: phone });
      root.removeAttribute('data-gate');
      renderHistory();
      if (matchMedia('(pointer: fine)').matches) els.input.focus();
      syncMobilePanelLayout();
    });
  }

  async function send(messageText) {
    const text = (messageText ?? els.input.value).trim();
    if (!text || state.sending) return;

    // Switch language to match the user only on a clear signal; an ambiguous
    // message (digits, a bare email) keeps the current conversation language.
    const detected = detectLang(text);
    if (detected && detected !== state.lang) {
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
    let pendingActions = [];
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
          visitor: state.lead ? { name: state.lead.name, email: state.lead.email, phone: state.lead.phone } : undefined,
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
          } else if (obj.type === 'actions') {
            pendingActions = Array.isArray(obj.items) ? obj.items.slice(0, 2) : [];
          } else if (obj.type === 'debug') {
            recordDebugStage(obj.stage, obj.meta || {});
          } else if (obj.type === 'lead' && obj.saved) {
            // The assistant's own reply already confirms the hand-off; no extra banner.
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
        const recentKinds = new Set(state.history.filter((m) => m.role === 'assistant').slice(-3).flatMap((m) => (m.actions || []).map((a) => a.kind)));
        const shownActions = pendingActions.filter((a) => !recentKinds.has(a.kind));
        if (shownActions.length && botEl) renderActions(botEl, shownActions);
        state.history.push({ role: 'assistant', content: botText, actions: shownActions });
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
      if (matchMedia('(pointer: fine)').matches) els.input.focus();
      syncMobilePanelLayout();
    }
  }

  function persist() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  }

  // ─── Mobile keyboard / visual viewport ───────────────────────────────────
  const isMobileLayout = () => window.innerWidth <= 768;
  const isKeyboardOpen = () => {
    const vv = window.visualViewport;
    if (!vv) return false;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop) > 60;
  };

  function resetPanelLayout() {
    els.panel.style.removeProperty('top');
    els.panel.style.removeProperty('bottom');
    els.panel.style.removeProperty('height');
    els.panel.style.removeProperty('max-height');
    root.classList.remove('qd-chat-kb');
  }

  function syncMobilePanelLayout() {
    if (!isMobileLayout()) {
      resetPanelLayout();
      return;
    }
    if (!state.open) {
      resetPanelLayout();
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    if (isKeyboardOpen()) {
      root.classList.add('qd-chat-kb');
      const top = vv.offsetTop + 8;
      const height = Math.max(240, vv.height - 16);
      els.panel.style.top = `${top}px`;
      els.panel.style.bottom = 'auto';
      els.panel.style.height = `${height}px`;
      els.panel.style.maxHeight = `${height}px`;
    } else {
      resetPanelLayout();
    }
  }

  function maybeFocusChatInput() {
    if (!matchMedia('(pointer: fine)').matches) return;
    const gn = root.querySelector('.qd-chat-gate input[name="name"]');
    (gn || els.input).focus();
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncMobilePanelLayout);
    window.visualViewport.addEventListener('scroll', syncMobilePanelLayout);
  }
  window.addEventListener('resize', syncMobilePanelLayout);
  root.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea')) syncMobilePanelLayout();
  });
  root.addEventListener('focusout', () => {
    setTimeout(syncMobilePanelLayout, 120);
  });

  // ─── Proactive nudge ──────────────────────────────────────────────────────
  // A small, polite "need help?" bubble. Never auto-opens the panel, never shows
  // to someone already chatting, and backs off if dismissed.
  const NUDGE_OFF_KEY = 'qd_chat_nudge_off_until';
  const NUDGE_DISMISS_KEY = 'qd_chat_nudge_dismissals';
  const NUDGE_LOG_KEY = 'qd_chat_nudge_log';
  const NUDGE_SESSION_KEY = 'qd_chat_nudge_session';
  const NUDGE_ENGAGED_KEY = 'qd_chat_engaged';
  const NUDGE_FIRST_MS = 60000;       // on the site this long (and active) before the first nudge
  const NUDGE_SECTION_MS = 10000;     // time a section must stay in view for its nudge
  const NUDGE_SECTION_MIN_SITE_MS = 40000; // section nudges also wait this long after page load
  const NUDGE_SPACING_MS = 4 * 60000; // minimum gap between nudges (ignored)
  const NUDGE_SNOOZE_MS = 10 * 60000; // after the visitor presses X once
  const NUDGE_VISIBLE_MS = 12000;     // auto-hide
  const NUDGE_MAX_SESSION = 2;
  const NUDGE_MAX_WEEK = 4;
  const NUDGE_SUPPRESS_MS = 7 * 24 * 3600 * 1000;
  const NUDGE_DAY_MS = 24 * 3600 * 1000;

  const NUDGES = {
    en: { dismiss: 'Dismiss', name: 'QD Assistant', msgs: { def: ["Hi, got any questions? I'm happy to help.", ''], nfc: ["Curious what one tap could do for your business? Happy to show you.", 'What could an NFC tag do for my business?'], events: ["Planning an event? I can walk you through how QD Events works.", "I'm planning an event, how does QD Events work?"], contact: ["Rather ask than fill a form? Go ahead, I'm here.", ''] } },
    ar: { dismiss: 'إغلاق', name: 'مساعد QD', msgs: { def: ['أهلاً، عندك أي سؤال؟ يسعدني أساعدك.', ''], nfc: ['تتساءل ماذا تفعل لمسة واحدة لنشاطك؟ يسعدني أوضّح لك.', 'ماذا يمكن لبطاقة NFC أن تفعل لنشاطي؟'], events: ['تخطط لمناسبة؟ أشرح لك كيف يعمل QD Events.', 'أخطط لمناسبة, كيف يعمل QD Events؟'], contact: ['تفضّل تسأل بدل ملء النموذج؟ تفضّل، أنا هنا.', ''] } },
    zh: { dismiss: '关闭', name: 'QD 助手', msgs: { def: ['你好，有什么想问的吗？我很乐意帮忙。', ''], nfc: ['想知道轻轻一碰能为你的业务做什么吗？我来给你讲讲。', '一个 NFC 标签能为我的业务做什么？'], events: ['在筹备活动？我可以给你介绍 QD Events 怎么用。', '我在筹备活动，QD Events 怎么用？'], contact: ['比起填表，直接问我更快，我在这儿。', ''] } },
    ru: { dismiss: 'Закрыть', name: 'Ассистент QD', msgs: { def: ['Здравствуйте, есть вопросы? С радостью помогу.', ''], nfc: ['Интересно, что может одно касание для вашего бизнеса? Расскажу.', 'Что может NFC-метка для моего бизнеса?'], events: ['Планируете событие? Расскажу, как работает QD Events.', 'Я планирую событие, как работает QD Events?'], contact: ['Проще спросить, чем заполнять форму? Спрашивайте, я здесь.', ''] } },
  };

  const nudgeState = { el: null, key: 'def', hideTimer: null, lastShown: 0, lastActivity: 0, hadActivity: false, loadedAt: Date.now(), sectionSince: {}, sectionKey: null, sectionTimes: {} };

  function nudgeRead(storage, key, fallback) {
    try { const v = storage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function nudgeWrite(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  const NUDGE_FORCED = /[?&]nudge=1\b/.test(location.search);

  function nudgeAllowed() {
    if (state.open || state.sending) return false;
    if (NUDGE_FORCED) return Date.now() - nudgeState.lastShown >= 15000;
    if (state.lead || (state.history && state.history.length)) return false;
    if (sessionStorage.getItem(NUDGE_ENGAGED_KEY)) return false;
    if (document.visibilityState !== 'visible') return false;
    const now = Date.now();
    if (now < nudgeRead(localStorage, NUDGE_OFF_KEY, 0)) return false;
    if (nudgeRead(sessionStorage, NUDGE_SESSION_KEY, 0) >= NUDGE_MAX_SESSION) return false;
    const week = nudgeRead(localStorage, NUDGE_LOG_KEY, []).filter((t) => now - t < NUDGE_SUPPRESS_MS);
    if (week.length >= NUDGE_MAX_WEEK) return false;
    if (now - nudgeState.lastShown < NUDGE_SPACING_MS) return false;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !root.contains(a)) return false;
    if (isMobileLayout() && (window.innerHeight < 600 || isKeyboardOpen())) return false;
    return true;
  }

  function hideNudge() {
    clearTimeout(nudgeState.hideTimer);
    const el = nudgeState.el;
    if (!el) return;
    el.setAttribute('data-show', 'false');
    setTimeout(() => { if (el.getAttribute('data-show') === 'false') el.hidden = true; }, 280);
  }

  function ensureNudgeEl() {
    if (nudgeState.el) return nudgeState.el;
    const el = document.createElement('div');
    el.className = 'qd-chat-nudge';
    el.setAttribute('role', 'status');
    el.hidden = true;
    el.innerHTML = '<button type="button" class="qd-chat-nudge-text"><span class="qd-chat-nudge-name"></span><span class="qd-chat-nudge-msg"></span></button><button type="button" class="qd-chat-nudge-x" aria-label="Dismiss">✕</button>';
    el.querySelector('.qd-chat-nudge-text').addEventListener('click', () => {
      const prefill = (NUDGES[state.lang] || NUDGES.en).msgs[nudgeState.key][1];
      hideNudge();
      openPanel();
      if (prefill && root.getAttribute('data-gate') !== 'true' && !els.input.value) {
        els.input.value = prefill;
        els.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    el.querySelector('.qd-chat-nudge-x').addEventListener('click', () => {
      hideNudge();
      const dismissals = nudgeRead(sessionStorage, NUDGE_DISMISS_KEY, 0) + 1;
      nudgeWrite(sessionStorage, NUDGE_DISMISS_KEY, dismissals);
      nudgeWrite(localStorage, NUDGE_OFF_KEY, Date.now() + (dismissals >= 2 ? NUDGE_DAY_MS : NUDGE_SNOOZE_MS));
    });
    root.appendChild(el);
    nudgeState.el = el;
    return el;
  }

  function showNudge(key) {
    if (!nudgeAllowed()) return;
    const pack = NUDGES[state.lang] || NUDGES.en;
    const el = ensureNudgeEl();
    nudgeState.key = key;
    el.querySelector('.qd-chat-nudge-name').textContent = pack.name;
    el.querySelector('.qd-chat-nudge-msg').textContent = pack.msgs[key][0];
    el.querySelector('.qd-chat-nudge-x').setAttribute('aria-label', pack.dismiss);
    el.hidden = false;
    requestAnimationFrame(() => el.setAttribute('data-show', 'true'));
    const now = Date.now();
    nudgeState.lastShown = now;
    nudgeWrite(sessionStorage, NUDGE_SESSION_KEY, nudgeRead(sessionStorage, NUDGE_SESSION_KEY, 0) + 1);
    nudgeWrite(localStorage, NUDGE_LOG_KEY, nudgeRead(localStorage, NUDGE_LOG_KEY, []).filter((t) => now - t < NUDGE_SUPPRESS_MS).concat(now));
    clearTimeout(nudgeState.hideTimer);
    nudgeState.hideTimer = setTimeout(hideNudge, NUDGE_VISIBLE_MS);
  }

  function onChatOpened() {
    try { sessionStorage.setItem(NUDGE_ENGAGED_KEY, '1'); } catch (e) {}
    hideNudge();
  }

  function initNudge() {
    const markActive = () => { nudgeState.lastActivity = Date.now(); nudgeState.hadActivity = true; };
    ['scroll', 'pointermove', 'touchstart', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    // Section-aware nudges: NFC, QD Events, contact.
    if ('IntersectionObserver' in window) {
      const targets = [['#nfc', 'nfc'], ['.build-events', 'events'], ['#contact', 'contact']];
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const key = entry.target.getAttribute('data-nudge-key');
          if (entry.isIntersecting) nudgeState.sectionSince[key] = nudgeState.sectionSince[key] || Date.now();
          else delete nudgeState.sectionSince[key];
        });
      }, { threshold: 0.35 });
      targets.forEach(([sel, key]) => {
        const node = document.querySelector(sel);
        if (node) { node.setAttribute('data-nudge-key', key); io.observe(node); }
      });
    }

    if (NUDGE_FORCED) setTimeout(() => showNudge('def'), 2000);

    setInterval(() => {
      if (!nudgeAllowed()) return;
      const now = Date.now();
      if (now - nudgeState.loadedAt < NUDGE_SECTION_MIN_SITE_MS) return;
      const seen = nudgeRead(sessionStorage, 'qd_chat_nudge_sections', []);
      for (const key of Object.keys(nudgeState.sectionSince)) {
        if (!seen.includes(key) && now - nudgeState.sectionSince[key] >= NUDGE_SECTION_MS) {
          nudgeWrite(sessionStorage, 'qd_chat_nudge_sections', seen.concat(key));
          showNudge(key);
          return;
        }
      }
      const activeRecently = nudgeState.hadActivity && now - nudgeState.lastActivity < 15000;
      if (activeRecently && now - nudgeState.loadedAt >= NUDGE_FIRST_MS) showNudge('def');
    }, 4000);
  }

  // ─── Open / close ─────────────────────────────────────────────────────────
  function openPanel() {
    state.open = true;
    root.setAttribute('data-open', 'true');
    document.body.classList.add('qd-chat-open');
    sessionStorage.setItem(OPEN_KEY, '1');
    onChatOpened();
    syncMobilePanelLayout();
    setTimeout(maybeFocusChatInput, 200);
  }
  function closePanel() {
    state.open = false;
    root.setAttribute('data-open', 'false');
    document.body.classList.remove('qd-chat-open');
    sessionStorage.removeItem(OPEN_KEY);
    resetPanelLayout();
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
    if (state.open) {
      if (matchMedia('(pointer: fine)').matches) setTimeout(() => els.input.focus(), 50);
      syncMobilePanelLayout();
    }
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

  els.input.addEventListener('focus', () => {
    syncMobilePanelLayout();
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
  initNudge();

  // Follow the site-wide language switcher (only before the visitor has typed —
  // once they're mid-conversation we keep the language they were chatting in).
  window.addEventListener('qd:langchange', (e) => {
    const l = e && e.detail && e.detail.lang;
    if (!SUPPORTED_LANGS.includes(l) || l === state.lang) return;
    const hasUserTurn = state.history.some(m => m.role === 'user');
    if (hasUserTurn) return;
    state.lang = l;
    if (root.getAttribute('data-gate') === 'true') renderLeadGate();
    else renderHistory();
    refreshStrings();
  });

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
