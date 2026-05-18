const { useState, useEffect } = React;
const { Reveal, Eyebrow, Tag, ChatbotWindow, DashboardMini, BrowserMini, CodeBlock, useViewportFlag, usePrefersReducedMotion } = window.__QD;

const SectionLetter = ({ letter }) => {
  const [t, setT] = useState(0);
  const isMobile = useViewportFlag(768);
  const prefersReducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (isMobile || prefersReducedMotion) return;
    let raf; const start = performance.now();
    const loop = now => { setT((now-start)/1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [isMobile, prefersReducedMotion]);
  const ry = Math.sin(t * 0.35) * 8;
  const rx = Math.cos(t * 0.28) * 3;
  return (
    <Reveal lift={48} duration={1000}>
      <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(160px,22vw,320px)',letterSpacing:'-0.06em',lineHeight:0.85,color:'var(--acid)',textShadow:isMobile?'4px 4px 0 var(--obsidian-2)':'8px 8px 0 var(--obsidian-2),12px 12px 0 var(--obsidian)',transform:isMobile?'none':`rotateY(${ry}deg) rotateX(${rx}deg)`,transformStyle:'preserve-3d',perspective:1200,willChange:isMobile?'auto':'transform',userSelect:'none' }}>{letter}</div>
    </Reveal>
  );
};
window.__QD.SectionLetter = SectionLetter;

const serviceCards = [
  {
    id: '01',
    label: 'FLAGSHIP',
    title: 'Customer systems',
    accent: 'that respond instantly.',
    body: 'AI chat, WhatsApp flows, lead capture, and automated replies built around your business, not a generic bot.',
    tags: ['AI Chat', 'WhatsApp', 'Lead Capture', 'FAQs', 'Automation'],
    visual: <ChatbotWindow />
  },
  {
    id: '02',
    title: 'Websites',
    accent: 'that convert.',
    body: 'Premium, responsive, and built to make customers trust you faster.',
    tags: ['Responsive', 'High Trust', 'Conversion', 'Premium UI'],
    visual: <BrowserMini />
  },
  {
    id: '03',
    title: 'Operations',
    accent: 'you can monitor.',
    body: 'Orders, bookings, inventory, leads, and performance visible from one clean dashboard.',
    tags: ['Bookings', 'Inventory', 'Leads', 'Analytics'],
    visual: <DashboardMini />
  },
  {
    id: '04',
    label: 'CUSTOM',
    title: 'You describe it.',
    accent: 'We architect, ship, maintain.',
    body: 'From booking systems and portals to payments, dashboards, and custom workflows, we design, build, and support the full stack.',
    tags: ['Booking', 'Payments', 'CRM', 'Dashboards', 'Portals', 'Support'],
    visual: <CodeBlock />
  }
];

const Services = () => (
  <section id="services" className="qd-section" data-bridge="obsidian-2"
    style={{ position:'relative',background:'var(--obsidian)',padding:'160px 40px 200px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden' }}>
    <div style={{ position:'absolute',inset:0,opacity:0.4,pointerEvents:'none',backgroundImage:'linear-gradient(rgba(244,241,234,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(244,241,234,0.03) 1px,transparent 1px)',backgroundSize:'64px 64px' }} />
    <div style={{ maxWidth:1280,margin:'0 auto',position:'relative' }}>
      <div className="qd-services-head" style={{ marginBottom:56 }}>
        <Reveal lift={32}>
          <Eyebrow color="var(--acid)">// 03 · WHAT WE BUILD</Eyebrow>
          <h2 style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:'clamp(46px,6.8vw,96px)',letterSpacing:'-0.04em',lineHeight:0.89,margin:'12px 0 22px',color:'var(--bone)',maxWidth:'11ch' }}>
            Everything your business needs online.<br/><em style={{ fontFamily:'var(--font-serif)',fontWeight:400,color:'var(--acid)' }}>Built properly.</em>
          </h2>
          <p className="qd-services-intro" style={{ fontFamily:'var(--font-body)',fontSize:18,color:'var(--fg2)',lineHeight:1.5 }}>Websites, branding, automations, bookings, dashboards, and growth tools built into one premium digital presence.</p>
        </Reveal>
      </div>

      <div className="qd-services-grid">
        {serviceCards.map((card, index) => (
          <Reveal key={card.id} delay={index * 100} lift={40} duration={900}>
            <article className="qd-lift qd-service-card">
              <div className="qd-service-card-head">
                <span className="qd-eyebrow" style={{ color:'var(--acid)' }}>
                  // {card.id}{card.label ? ` · ${card.label}` : ''}
                </span>
              </div>

              <div className="qd-service-card-body">
                <h3 className="qd-service-card-title">
                  {card.title}<br /><span>{card.accent}</span>
                </h3>
                <p className="qd-service-card-copy">{card.body}</p>
              </div>

              <div className="qd-service-card-visual">
                <div className="qd-service-card-visual-inner">
                  {card.visual}
                </div>
              </div>

              <div className="qd-service-card-tags">
                {card.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

window.__QD = { ...window.__QD, Services };
