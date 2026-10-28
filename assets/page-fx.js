/* QD page transitions — intercepts same-origin navigation, plays a 260ms dark veil with the QD mark, then navigates.
   Homepage service rows (a[data-svx]) get their own thematic ~820ms transition instead (see page-fx.css).
   Entrance fade comes from page-fx.css. Skips: anchors, new-tab, modified clicks, downloads, external, reduced motion. */
(function () {
  var veil = document.createElement('div');
  veil.className = 'pg-veil';
  veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<b>QD</b>';
  document.body.appendChild(veil);

  var timers = [];
  function cleanup() {
    document.body.classList.remove('pg-out');
    timers.forEach(clearTimeout); timers = [];
    var old = document.querySelectorAll('.svx');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var pressed = document.querySelectorAll('.svc.is-press');
    for (var j = 0; j < pressed.length; j++) pressed[j].classList.remove('is-press');
  }
  /* back/forward cache restore — never leave the veil or a service overlay up */
  addEventListener('pageshow', function (e) { if (e.persisted) cleanup(); });

  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  /* product pages read these flags in their <head> and skip their own logo intro when already set */
  var INTRO_KEYS = { '/website-development': 'qd_wd_intro', '/ai-automation': 'qd_ai_intro', '/business-dashboards': 'qd_bd_intro', '/restaurant-nfc': 'qd_nfc_intro', '/event-management': 'qd_ev_intro' };
  var SCENES = {
    web: '<div class="svx-bg"></div><div class="w-frame"><div class="w-bar"><i></i><i></i><i></i></div><div class="w-b w-b1"></div><div class="w-b w-b2"></div><div class="w-b w-b3"></div><div class="w-b w-b4"></div><div class="w-b w-b5"></div></div><div class="svx-end"></div>',
    nfc: '<div class="svx-bg"></div><div class="n-ring"></div><div class="n-ring"></div><div class="n-ring"></div><div class="n-dot"></div><div class="svx-end"></div>',
    ai: '<div class="svx-bg"></div><div class="a-col"><div class="a-b a-b1"></div><div class="a-b a-b2"></div><div class="a-b a-b3"><i></i><i></i><i></i></div></div><div class="a-wipe"></div><div class="svx-end"></div>',
    dash: '<div class="svx-bg"></div><div class="d-chart"><div class="d-bar"></div><div class="d-bar"></div><div class="d-bar"></div><div class="d-bar"></div><div class="d-bar"></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline pathLength="1" points="10,72 30,52 50,60 70,32 90,12" vector-effect="non-scaling-stroke"/></svg></div><div class="svx-end"></div>',
    ev: '<div class="svx-bg"></div><div class="e-env"><div class="e-back"></div><div class="e-card"></div><div class="e-front"></div><div class="e-flap"></div><div class="e-seal"></div></div><div class="svx-end"></div>'
  };

  function playService(a, kind, u, e) {
    var x, y;
    if (e.detail === 0 || (!e.clientX && !e.clientY)) { /* keyboard: start from the row's centre */
      var row = a.closest('.svc') || a, r = row.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    } else { x = e.clientX; y = e.clientY; }
    var o = document.createElement('div');
    o.className = 'svx svx--' + kind;
    o.setAttribute('aria-hidden', 'true');
    o.style.setProperty('--x', x + 'px');
    o.style.setProperty('--y', y + 'px');
    o.innerHTML = SCENES[kind];
    document.body.appendChild(o);
    var row2 = a.closest('.svc'); if (row2) row2.classList.add('is-press');
    try { var k = INTRO_KEYS[u.pathname.replace(/\/$/, '')]; if (k) sessionStorage.setItem(k, '1'); } catch (_) {}
    var done = false;
    function go() { if (done) return; done = true; location.href = u.href; }
    timers.push(setTimeout(go, 840));
    timers.push(setTimeout(go, 1200)); /* failsafe */
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if (!href || href[0] === '#' || /^(mailto:|tel:|javascript:|wa\.me)/i.test(href)) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.hash) return; /* same-page anchor */
    e.preventDefault();
    var kind = a.getAttribute('data-svx');
    if (kind && SCENES[kind]) { try { playService(a, kind, u, e); return; } catch (_) { location.href = u.href; return; } }
    document.body.classList.add('pg-out');
    timers.push(setTimeout(function () { location.href = u.href; }, 280));
  }, true);
})();
