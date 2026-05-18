const { useState, useEffect, useRef } = React;
const { Reveal, Eyebrow, Tag, Marquee } = window.__QD;

const liveWebsiteProjects = [
  {
    id: '01',
    client: 'Al Taj Al Malaki',
    name: 'Al Taj Al Malaki',
    tag: 'EVENT RENTALS',
    url: 'https://www.tajalmalaki.ae/',
    domain: 'tajalmalaki.ae',
    description: 'Luxury event rental platform with live order tracking, premium inventory browsing, and streamlined booking flows built for UAE events.',
    metrics: ['Real-time tracking', 'Mobile optimized', 'Firebase backend'],
    stack: ['Firebase', 'Tracking', 'Realtime', 'Inventory', 'Booking'],
    cta: 'VISIT SITE \u2192',
  },
  {
    id: '02',
    client: 'Evo Creation',
    name: 'Evo Creation',
    tag: 'LUXURY EVENTS',
    url: 'https://evocreation.ae/',
    domain: 'evocreation.ae',
    description: 'Luxury wedding and event presentation website focused on cinematic visuals, immersive storytelling, and premium lead generation.',
    metrics: ['Cinematic experience', 'High-end UI system', 'Conversion focused'],
    stack: ['Luxury UI', 'Motion', 'Responsive', 'Branding', 'Lead Gen'],
    cta: 'VISIT SITE \u2192',
  },
];

const useViewportFlag = (breakpoint = 980) => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
};

const LiveIndicator = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(166,240,79,0.26)', background: 'rgba(166,240,79,0.08)', backdropFilter: 'blur(14px)' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acid)', boxShadow: '0 0 18px rgba(166,240,79,0.9)', animation: 'qd-pulse 1.4s ease-in-out infinite' }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--acid)' }}>LIVE</span>
  </div>
);

const BrowserFallback = ({ project, visible, overlay }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: overlay ? 3 : 0,
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      textAlign: 'center',
      background: 'linear-gradient(180deg,rgba(19,20,24,0.94),rgba(10,11,13,0.98))',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 320ms ease',
    }}
  >
    <div style={{ maxWidth: 360 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--bone)' }}>
        Live preview unavailable.
      </div>
      <p style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.6, color: 'var(--fg2)' }}>
        Open the site in a new tab.
      </p>
      <button
        type="button"
        onClick={() => window.open(project.url, '_blank', 'noopener,noreferrer')}
        style={{
          marginTop: 18,
          minHeight: 50,
          padding: '14px 18px',
          borderRadius: 10,
          border: '1px solid var(--acid)',
          background: 'var(--acid)',
          color: 'var(--obsidian)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {'Open live site \u2192'}
      </button>
    </div>
  </div>
);

const BrowserShell = ({ project, tiltX, tiltY, isCompact }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setFailed(false);
    timeoutRef.current = window.setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 5000);
    return () => window.clearTimeout(timeoutRef.current);
  }, [project.url]);

  return (
    <div style={{ position: 'relative', transformStyle: 'preserve-3d', transform: `perspective(1600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`, transition: 'transform 180ms ease-out' }}>
      <div style={{ position: 'absolute', inset: '-4% 10% auto', height: 160, background: 'radial-gradient(circle,rgba(166,240,79,0.26),transparent 72%)', filter: 'blur(26px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 'auto 12% -8%', height: 140, background: 'radial-gradient(circle,rgba(166,240,79,0.18),transparent 72%)', filter: 'blur(34px)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', overflow: 'hidden', overflowAnchor: 'none', borderRadius: 28, border: '1px solid rgba(244,241,234,0.12)', background: 'rgba(13,14,17,0.88)', boxShadow: '0 28px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(166,240,79,0.08)' }}>
        <div className="qd-liveweb-glow" style={{ pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid rgba(244,241,234,0.08)', background: 'linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#FF6159', '#FFBD2E', '#28C840'].map((color) => (
              <span key={color} style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 12px ${color}66` }} />
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, padding: '8px 12px', borderRadius: 999, background: 'rgba(244,241,234,0.04)', border: '1px solid rgba(244,241,234,0.06)' }}>
            <LiveIndicator />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--fg2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.domain}
            </span>
          </div>
        </div>

        <div className="qd-live-browser" style={{ position: 'relative', zIndex: 2, height: isCompact ? 520 : 620, minHeight: isCompact ? 520 : 620, maxHeight: isCompact ? 520 : 620, background: 'var(--obsidian)', overflow: 'hidden', overflowAnchor: 'none' }}>
          <BrowserFallback project={project} visible={!loaded && !failed} overlay={false} />
          <iframe
            src={project.url}
            title={project.client}
            loading="lazy"
            onLoad={() => {
              loadedRef.current = true;
              window.clearTimeout(timeoutRef.current);
              setLoaded(true);
              setFailed(false);
            }}
            style={{
              width: '100%',
              height: '100%',
              border: '0',
              display: 'block',
              background: 'var(--obsidian)',
              position: 'relative',
              zIndex: loaded && !failed ? 2 : 1,
              opacity: loaded && !failed ? 1 : 0,
              transition: 'opacity 320ms ease',
            }}
          />
          <BrowserFallback project={project} visible={failed} overlay />
        </div>
      </div>
    </div>
  );
};

const LiveWebsiteCard = ({ project, index, isMobile }) => {
  const ref = useRef(null);
  const tiltX = 0;
  const tiltY = 0;

  return (
    <Reveal delay={index * 140} lift={56} duration={1100}>
      <div
        ref={ref}
        className="qd-lift qd-liveweb-card qd-live-card"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.3fr 0.7fr',
          gap: isMobile ? 28 : 34,
          padding: isMobile ? 22 : 30,
          minHeight: isMobile ? 'auto' : 760,
          borderRadius: 28,
          overflow: 'hidden',
          overflowAnchor: 'none',
          border: '1px solid rgba(244,241,234,0.1)',
          background: 'linear-gradient(180deg,rgba(28,30,36,0.9),rgba(10,11,13,0.96))',
          boxShadow: '0 22px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="qd-liveweb-noise" />
        <div className="qd-liveweb-reflection" />

        <div style={{ position: 'relative', zIndex: 2, order: 0 }}>
          <BrowserShell project={project} tiltX={tiltX} tiltY={tiltY} isCompact={isMobile} />
        </div>

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Tag>{project.tag}</Tag>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--fg3)' }}>{project.id} / 02</span>
          </div>

          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(34px,4vw,58px)', lineHeight: 0.94, letterSpacing: '-0.04em', color: 'var(--bone)' }}>
            {project.name}
          </div>

          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.65, color: 'var(--fg2)', maxWidth: 480 }}>
            {project.description}
          </p>

          <div style={{ display: 'grid', gap: 10, padding: '18px 0', borderTop: '1px solid rgba(244,241,234,0.08)', borderBottom: '1px solid rgba(244,241,234,0.08)' }}>
            {project.metrics.map((metric) => (
              <div key={metric} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acid)', boxShadow: '0 0 16px rgba(166,240,79,0.8)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--bone)' }}>{metric}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {project.stack.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </div>

          <div className="qd-live-actions" style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => window.open(project.url, '_blank', 'noopener,noreferrer')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 56,
                padding: '16px 18px',
                borderRadius: 10,
                border: '1px solid var(--acid)',
                background: 'var(--acid)',
                color: 'var(--obsidian)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow: '0 0 32px rgba(166,240,79,0.22)',
                cursor: 'pointer',
              }}
            >
              {project.cta}
            </button>
            <a
              href="contact.html"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 56,
                padding: '16px 18px',
                borderRadius: 10,
                border: '1px solid rgba(244,241,234,0.16)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--bone)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {'START A BUILD \u2192'}
            </a>
          </div>
        </div>
      </div>
    </Reveal>
  );
};

const LiveWebsites = () => {
  const sectionRef = useRef(null);
  const isMobile = useViewportFlag();

  return (
    <section
      id="live-websites"
      ref={sectionRef}
      className="qd-section qd-bridge-receive"
      data-bridge="obsidian"
      style={{ position: 'relative', padding: '190px 40px 170px', background: 'var(--obsidian)', borderTop: '1px solid var(--border-1)', overflow: 'hidden', zIndex: 5 }}
    >
      <style>{`
        .qd-liveweb-card::before{
          content:'';
          position:absolute;
          inset:0;
          background:
            radial-gradient(circle at 12% 18%, rgba(166,240,79,0.12), transparent 28%),
            radial-gradient(circle at 86% 82%, rgba(166,240,79,0.08), transparent 24%);
          pointer-events:none;
        }
        .qd-liveweb-glow{
          position:absolute;
          inset:-22%;
          background:conic-gradient(from 180deg, transparent 0deg, rgba(166,240,79,0.12) 76deg, transparent 140deg, rgba(166,240,79,0.08) 240deg, transparent 360deg);
          animation: qd-liveweb-spin 14s linear infinite;
          pointer-events:none;
        }
        .qd-liveweb-reflection{
          position:absolute;
          inset:-20% auto auto -30%;
          width:70%;
          height:160%;
          background:linear-gradient(110deg, transparent 0%, rgba(166,240,79,0.12) 45%, transparent 72%);
          transform:rotate(8deg);
          animation: qd-liveweb-sweep 9s ease-in-out infinite;
          pointer-events:none;
        }
        .qd-liveweb-noise{
          position:absolute;
          inset:0;
          background-image:linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size:38px 38px;
          opacity:0.32;
          pointer-events:none;
        }
        @keyframes qd-liveweb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes qd-liveweb-sweep {
          0%, 100% { transform: translateX(0) rotate(8deg); opacity: 0.14; }
          50% { transform: translateX(32%) rotate(8deg); opacity: 0.26; }
        }
        @media (max-width: 980px){
          #live-websites{
            padding: 150px 20px 130px !important;
          }
        }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.26, backgroundImage: 'linear-gradient(rgba(244,241,234,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(244,241,234,0.03) 1px,transparent 1px)', backgroundSize: '68px 68px' }} />
      <div style={{ position: 'absolute', top: -40, left: '-8%', width: '40%', height: 420, background: 'radial-gradient(circle,rgba(166,240,79,0.14),transparent 72%)', filter: 'blur(36px)' }} />
      <div style={{ position: 'absolute', right: '-10%', bottom: 40, width: '38%', height: 360, background: 'radial-gradient(circle,rgba(166,240,79,0.12),transparent 68%)', filter: 'blur(42px)' }} />

      <div style={{ position: 'absolute', top: 130, left: 0, right: 0, opacity: 0.08, pointerEvents: 'none' }}>
        <Marquee speed={36}>
          {['LIVE SYSTEMS', '/', 'REAL DEPLOYMENTS', '/', 'TRAFFIC', '/', 'CUSTOMERS', '/', 'LIVE SYSTEMS', '/'].map((item, index) => (
            <span key={index} style={{ padding: '0 28px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(68px,9vw,140px)', letterSpacing: '-0.05em', color: item === '/' ? 'var(--acid)' : 'transparent', WebkitTextStroke: item === '/' ? '0' : '1px rgba(244,241,234,0.18)' }}>
              {item}
            </span>
          ))}
        </Marquee>
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', position: 'relative' }}>
        <Reveal lift={32}>
          <div style={{ maxWidth: 920, marginBottom: 72 }}>
            <Eyebrow color="var(--acid)">{'// 04 \u00b7 LIVE SYSTEMS'}</Eyebrow>
            <h2 style={{ margin: '16px 0 18px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(56px,8vw,118px)', lineHeight: 0.92, letterSpacing: '-0.05em', color: 'var(--bone)' }}>
              Running in the real world.<br />
              <em style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, color: 'var(--acid)' }}>Not mockups.</em>
            </h2>
            <p style={{ maxWidth: 720, fontFamily: 'var(--font-body)', fontSize: 19, lineHeight: 1.6, color: 'var(--fg2)' }}>
              Real businesses. Real traffic. Real customers using systems we designed and shipped.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120} lift={28}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 16, marginBottom: 32 }}>
            <div style={{ padding: '20px 18px', borderRadius: 18, border: '1px solid rgba(244,241,234,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 42, lineHeight: 1, color: 'var(--acid)' }}>2</div>
              <div className="qd-eyebrow" style={{ marginTop: 8 }}>live client deployments</div>
            </div>
            <div style={{ padding: '20px 18px', borderRadius: 18, border: '1px solid rgba(244,241,234,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 42, lineHeight: 1, color: 'var(--acid)' }}>24/7</div>
              <div className="qd-eyebrow" style={{ marginTop: 8 }}>customer-facing systems</div>
            </div>
            <div style={{ padding: '20px 18px', borderRadius: 18, border: '1px solid rgba(244,241,234,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 42, lineHeight: 1, color: 'var(--acid)' }}>UAE</div>
              <div className="qd-eyebrow" style={{ marginTop: 8 }}>brands running live now</div>
            </div>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gap: 28 }}>
          {liveWebsiteProjects.map((project, index) => (
            <LiveWebsiteCard key={project.name} project={project} index={index} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </section>
  );
};

window.__QD = { ...window.__QD, LiveWebsites };
