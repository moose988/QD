/* QD page transitions — intercepts same-origin navigation, plays a 260ms dark veil with the QD mark, then navigates.
   Entrance fade comes from page-fx.css. Skips: anchors, new-tab, modified clicks, downloads, external, reduced motion. */
(function () {
  var veil = document.createElement('div');
  veil.className = 'pg-veil';
  veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<b>QD</b>';
  document.body.appendChild(veil);

  /* back/forward cache restore — never leave the veil up */
  addEventListener('pageshow', function (e) { if (e.persisted) document.body.classList.remove('pg-out'); });

  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

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
    document.body.classList.add('pg-out');
    setTimeout(function () { location.href = u.href; }, 280);
  }, true);
})();
