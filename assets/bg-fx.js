/* QD shared ambient background — injects the layer + runs the silver-dust canvas.
   Zero deps, ~1.3KB gzipped. Skips canvas on reduced-motion / Save-Data; pauses on hidden tab. */
(function () {
  if (document.querySelector('.qd-bgfx')) return;
  var host = document.createElement('div');
  host.className = 'qd-bgfx';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = '<div class="au"></div><div class="gl g1"></div><div class="gl g2"></div><div class="gl g3"></div><div class="gr"></div>';
  document.body.prepend(host);

  var reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var conn = navigator.connection || {};
  if (reduce || conn.saveData) return;

  /* cinematic loop video (~120KB webm) — lazy: desktop only, after full load + idle */
  if (innerWidth >= 768) {
    var addVideo = function () {
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.innerHTML = '<source src="assets/bg-loop.webm" type="video/webm"><source src="assets/bg-loop.mp4" type="video/mp4">';
      v.addEventListener('canplay', function () {
        v.classList.add('on');
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      }, { once: true });
      host.insertBefore(v, host.firstChild);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) v.pause();
        else { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      });
    };
    var idle = function () {
      ('requestIdleCallback' in window) ? requestIdleCallback(addVideo, { timeout: 3000 }) : setTimeout(addVideo, 1200);
    };
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
  }

  var cv = document.createElement('canvas');
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  var W, H, t = 0, visible = !document.hidden;
  var d = Math.min(devicePixelRatio || 1, 2);
  var N = innerWidth < 768 ? 24 : 56, parts = [];
  function size() { W = cv.width = innerWidth * d; H = cv.height = innerHeight * d; }
  size();
  addEventListener('resize', size);
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; });
  for (var i = 0; i < N; i++) parts.push({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4,
    vy: -(Math.random() * 0.0006 + 0.00018), vx: (Math.random() - 0.5) * 0.00035,
    a: Math.random() * 0.45 + 0.15, tw: Math.random() * 6.28, ts: Math.random() * 0.7 + 0.3
  });
  (function draw() {
    requestAnimationFrame(draw);
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    for (var i = 0; i < N; i++) {
      var p = parts[i];
      p.y += p.vy; p.x += p.vx;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02;
      var tw = 0.5 + 0.5 * Math.sin(t * p.ts + p.tw);
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r * d, 0, 7);
      ctx.fillStyle = 'rgba(255,255,255,' + (p.a * tw * 0.55) + ')';
      ctx.fill();
    }
  })();
})();
