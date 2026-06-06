const root = document.getElementById('qd-demo-root');

const DEVICE_WIDTHS = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px'
};

const state = {
  mode: 'loading',
  slug: '',
  title: '',
  clientName: '',
  reason: '',
  demoUrl: '',
  device: 'desktop',
  error: '',
  blocked: false,
  localAttempts: 0,
  iframeLoaded: false,
  embedWarningVisible: false
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getSlugFromPath = () => {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const demoIndex = parts.indexOf('demo');
  return demoIndex >= 0 ? String(parts[demoIndex + 1] || '').trim().toLowerCase() : '';
};

const unavailableMessages = {
  not_found: "This demo link doesn't exist.",
  draft: "This demo isn't ready yet.",
  disabled: 'This demo has been disabled.',
  expired: 'This demo has expired.'
};

const renderLoading = () => `
  <section class="qd-demo-screen">
    <div class="qd-demo-screen-panel">
      <div class="qd-demo-spinner" aria-hidden="true"></div>
      <div class="qd-demo-kicker">QD Systems</div>
      <h1 class="qd-demo-title">Verifying demo...</h1>
      <p class="qd-demo-copy">Preparing a secure preview session.</p>
    </div>
  </section>
`;

const renderUnavailable = () => `
  <section class="qd-demo-screen">
    <div class="qd-demo-screen-panel">
      <img class="qd-demo-logo" src="/assets/qd-logo.jpeg" alt="QD Systems">
      <div class="qd-demo-kicker">Client Demo</div>
      <h1 class="qd-demo-title">Preview unavailable</h1>
      <p class="qd-demo-copy">${escapeHtml(unavailableMessages[state.reason] || 'This demo is unavailable right now.')}</p>
      <a class="qd-demo-link" href="https://qdsystems.ae" target="_blank" rel="noreferrer noopener">Contact QD Systems</a>
    </div>
  </section>
`;

const renderGate = () => `
  <div class="qd-demo-gate">
    <div class="qd-demo-gate-panel ${state.error ? 'qd-demo-shake' : ''}">
      <img class="qd-demo-logo" src="/assets/qd-logo.jpeg" alt="QD Systems">
      <div>
        <div class="qd-demo-kicker">${escapeHtml(state.clientName || 'QD Systems')}</div>
        <h1 class="qd-demo-title">${escapeHtml(state.title || 'Client Demo')}</h1>
        <p class="qd-demo-subtitle">Enter passcode to view demo</p>
      </div>
      <form id="qd-demo-passcode-form" class="qd-demo-field">
        <label for="qd-demo-passcode">Passcode</label>
        <input id="qd-demo-passcode" class="qd-demo-input" name="passcode" type="password" placeholder="Enter passcode" autocomplete="current-password" required>
        <button class="qd-demo-button" type="submit" ${state.blocked ? 'disabled' : ''}>Unlock Demo -></button>
      </form>
      <div class="qd-demo-error" role="alert">${escapeHtml(state.error || '')}</div>
    </div>
  </div>
`;

const deviceIcon = (device) => {
  if (device === 'desktop') {
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 20h6m-4-4h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }
  if (device === 'tablet') {
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="17.5" r="0.9" fill="currentColor"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="17.5" r="0.9" fill="currentColor"/></svg>';
};

const deviceButtons = Object.keys(DEVICE_WIDTHS).map((device) => `
  <button class="qd-demo-device-btn ${state.device === device ? 'is-active' : ''}" type="button" data-device="${escapeHtml(device)}" aria-label="${escapeHtml(device)} view">
    ${deviceIcon(device)}
  </button>
`).join('');

const looksLikeProtectedVercelPreview = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.vercel.app') && parsed.hostname.includes('-projects.');
  } catch {
    return false;
  }
};

const renderUnlocked = () => `
  <div class="qd-demo-shell">
    <div class="qd-demo-frame-shell">
      <header class="qd-demo-topbar">
        <div class="qd-demo-topbar-brand">
          <img src="/assets/qd-logo.jpeg" alt="QD Systems">
          <div>
            <strong>${escapeHtml(state.title || 'Client Demo')}</strong>
            <div class="qd-demo-meta">${escapeHtml(state.clientName || 'QD Systems')}</div>
          </div>
        </div>
        <a class="qd-demo-link" href="${escapeHtml(state.demoUrl)}" target="_blank" rel="noreferrer noopener">Open full demo ↗</a>
      </header>
      <div class="qd-demo-device-bar">
        ${deviceButtons}
        <a class="qd-demo-link qd-demo-frame-fallback" id="qd-demo-fallback-link" href="${escapeHtml(state.demoUrl)}" target="_blank" rel="noreferrer noopener">Open demo in new tab</a>
      </div>
      ${state.embedWarningVisible ? `
        <div class="qd-demo-embed-warning" role="status">
          This site is blocking iframe embedding. Open the demo in a new tab, or use a public deployment URL that allows embedding.
        </div>
      ` : ''}
      <div class="qd-demo-iframe-wrap">
        <iframe
          id="qd-demo-iframe"
          class="qd-demo-iframe"
          title="${escapeHtml(state.title || 'Client Demo')}"
          src="${escapeHtml(state.demoUrl)}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
          referrerpolicy="strict-origin-when-cross-origin"
          style="width:${DEVICE_WIDTHS[state.device]};"
        ></iframe>
      </div>
    </div>
  </div>
`;

const render = () => {
  if (state.mode === 'loading') {
    root.innerHTML = renderLoading();
    return;
  }

  if (state.mode === 'unavailable') {
    root.innerHTML = renderUnavailable();
    return;
  }

  if (state.mode === 'gate') {
    root.innerHTML = renderGate();
    attachGateEvents();
    return;
  }

  root.innerHTML = renderUnlocked();
  attachUnlockedEvents();
};

const attachGateEvents = () => {
  const form = document.getElementById('qd-demo-passcode-form');
  const input = document.getElementById('qd-demo-passcode');
  if (!form || !input) return;
  input.focus();
  form.addEventListener('submit', handlePasscodeSubmit, { once: true });
};

const attachUnlockedEvents = () => {
  document.querySelectorAll('[data-device]').forEach((button) => {
    button.addEventListener('click', () => {
      state.device = button.getAttribute('data-device') || 'desktop';
      render();
    });
  });

  const iframe = document.getElementById('qd-demo-iframe');
  const fallback = document.getElementById('qd-demo-fallback-link');
  if (!iframe || !fallback) return;

  const revealFallback = () => {
    state.embedWarningVisible = true;
    fallback.classList.add('is-visible');
    const warning = document.querySelector('.qd-demo-embed-warning');
    if (warning) warning.hidden = false;
  };
  const fallbackTimer = window.setTimeout(() => {
    if (!state.iframeLoaded) revealFallback();
  }, 12000);

  if (looksLikeProtectedVercelPreview(state.demoUrl)) {
    revealFallback();
  }

  iframe.addEventListener('load', () => {
    state.iframeLoaded = true;
    window.clearTimeout(fallbackTimer);
    if (!state.embedWarningVisible) {
      fallback.classList.remove('is-visible');
    }
  }, { once: true });

  iframe.addEventListener('error', () => {
    state.iframeLoaded = false;
    window.clearTimeout(fallbackTimer);
    revealFallback();
  }, { once: true });
};

const loadDemo = async () => {
  state.slug = getSlugFromPath();
  if (!state.slug) {
    state.mode = 'unavailable';
    state.reason = 'not_found';
    render();
    return;
  }

  try {
    const response = await fetch(`/api/demo-get?slug=${encodeURIComponent(state.slug)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Could not load demo');

    if (payload.available === false) {
      state.mode = 'unavailable';
      state.reason = payload.reason || 'not_found';
      render();
      return;
    }

    state.mode = 'gate';
    state.title = payload.title || 'Client Demo';
    state.clientName = payload.clientName || 'QD Systems';
    state.reason = '';
    render();
  } catch (error) {
    console.error('[demo-page] load failed:', error);
    state.mode = 'unavailable';
    state.reason = 'not_found';
    render();
  }
};

const handlePasscodeSubmit = async (event) => {
  event.preventDefault();
  if (state.blocked) return;

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const input = form.querySelector('input[name="passcode"]');
  const passcode = String(input?.value || '');
  if (!passcode) return;

  state.error = '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Unlocking...';
  }

  try {
    const response = await fetch('/api/demo-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: state.slug, passcode })
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 429 || payload?.blocked) {
      state.blocked = true;
      state.error = 'Too many attempts. Please contact QD Systems.';
      state.mode = 'gate';
      render();
      return;
    }

    if (!response.ok || payload?.success !== true || !payload?.demoUrl) {
      state.localAttempts += 1;
      state.error = 'Incorrect passcode. Try again.';
      state.mode = 'gate';
      render();
      return;
    }

    state.mode = 'unlocked';
    state.demoUrl = payload.demoUrl;
    state.error = '';
    state.blocked = false;
    state.iframeLoaded = false;
    state.embedWarningVisible = looksLikeProtectedVercelPreview(payload.demoUrl);
    render();
  } catch (error) {
    console.error('[demo-page] verify failed:', error);
    state.error = 'Could not unlock this demo right now.';
    state.mode = 'gate';
    render();
  }
};

loadDemo();
