const { Reveal, Eyebrow, Marquee, Tag, CountUp, ChatbotWindow, DashboardMini, BrowserMini } = window.__QD;
const SectionLetter = window.__QD.SectionLetter;

const projects = [
  { client:'Hardline Hardware', tag:'TRACKING', blurb:'Realtime inventory across 24 stores. One dashboard. Zero spreadsheets.',        metric:40,  prefix:'−', suffix:'%', label:'fewer stockouts',       visual:'dashboard' },
  { client:'Marlow & Co.',       tag:'CHATBOT',  blurb:'Closes leads at 2am while their team sleeps. Booked 142 demos in month one.', metric:220, prefix:'+', suffix:'%', label:'more qualified leads',  visual:'chatbot' },
  { client:'Verde Logistics',    tag:'CUSTOM',   blurb:'GPS, fuel, route optimization, dispatch — all in one operator console.',       metric:14,  prefix:'',  suffix:'',  label:'trucks · live',         visual:'dashboard' },
  { client:'Studio Onyx',        tag:'WEBSITE',  blurb:'Stripped six clicks down to one. Bounce dropped 60% on launch day.',          metric:8,   prefix:'',  suffix:'x', label:'faster checkout',       visual:'browser' },
];

const WorkMarqueeStrip = ({ compact = false }) => (
  <Reveal delay={compact ? 80 : 200} lift={24}>
    <div style={{ marginTop: compact ? 0 : 80, paddingTop: compact ? 28 : 32, borderTop:'1px solid var(--border-2)' }}>
      <Marquee speed={12} className="qd-work-marquee">
        {['CHATBOTS','/','WEBSITES','/','TRACKING','/','CUSTOM SYSTEMS','/','INTEGRATIONS','/','AUTOMATIONS','/'].map((t,i)=>(
          <span key={i} style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(64px,9vw,140px)',letterSpacing:'-0.04em',color:t==='/'?'var(--acid)':'transparent',WebkitTextStroke:t==='/'?'0':'1.5px var(--fg2)',padding:'0 32px',userSelect:'none' }}>{t}</span>
        ))}
      </Marquee>
    </div>
  </Reveal>
);

const WorkMarqueeOnly = () => (
  <section className="qd-section qd-bridge-receive"
    style={{ position:'relative',background:'var(--obsidian)',padding:'56px 40px 84px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden' }}>
    <div style={{ maxWidth:1280,margin:'0 auto',position:'relative' }}>
      <WorkMarqueeStrip compact />
    </div>
  </section>
);

const Work = () => (
  <section id="work" className="qd-section qd-bridge-receive" data-bridge="acid"
    style={{ position:'relative',background:'var(--obsidian)',padding:'200px 40px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden' }}>
    <div style={{ maxWidth:1280,margin:'0 auto',position:'relative' }}>
      <div className="qd-work-head qd-mobile-stack" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'flex-end',marginBottom:80 }}>
        <div className="qd-section-letter qd-mobile-no-rotate"><SectionLetter letter="D" /></div>
        <Reveal delay={120} lift={32}>
          <Eyebrow color="var(--acid)">// 06 · SHIPPED</Eyebrow>
          <h2 style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:'clamp(56px,8vw,120px)',letterSpacing:'-0.04em',lineHeight:0.92,margin:'12px 0 24px',color:'var(--bone)' }}>
            The work.<br/><em style={{ fontFamily:'var(--font-serif)',fontWeight:400,color:'var(--acid)' }}>Receipts only.</em>
          </h2>
        </Reveal>
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:24 }}>
        {projects.map((p,i) => (
          <Reveal key={i} delay={i*80} lift={48} duration={1000}>
            <div className="qd-lift qd-work-card qd-mobile-stack"
              style={{ display:'grid',gridTemplateColumns:i%2===0?'1.3fr 1fr':'1fr 1.3fr',gap:24,background:'var(--obsidian-3)',border:'1px solid var(--border-1)',borderRadius:16,overflow:'hidden',minHeight:320,transition:'all 280ms cubic-bezier(0.16,1,0.3,1)' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--acid)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-1)'}>
              <div style={{ order:i%2===0?0:1,background:'var(--obsidian-2)',padding:32,display:'grid',placeItems:'center',borderRight:i%2===0?'1px solid var(--border-1)':'none',borderLeft:i%2===1?'1px solid var(--border-1)':'none' }}>
                <div style={{ width:'100%',maxWidth:380 }}>
                  {p.visual==='dashboard'&&<DashboardMini />}
                  {p.visual==='chatbot'&&<ChatbotWindow />}
                  {p.visual==='browser'&&<BrowserMini />}
                </div>
              </div>
              <div style={{ padding:'32px 36px',display:'flex',flexDirection:'column',gap:16 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <Tag>{p.tag}</Tag>
                  <span style={{ fontFamily:'var(--font-mono)',fontSize:11,color:'var(--fg3)' }}>0{i+1} / 0{projects.length}</span>
                </div>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(32px,4vw,52px)',letterSpacing:'-0.03em',lineHeight:0.95,color:'var(--bone)' }}>{p.client}</div>
                <div style={{ fontFamily:'var(--font-body)',fontSize:16,color:'var(--fg2)',lineHeight:1.5 }}>{p.blurb}</div>
                <div style={{ marginTop:'auto',display:'flex',alignItems:'baseline',gap:14,paddingTop:16,borderTop:'1px solid var(--border-1)' }}>
                  <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(48px,6vw,80px)',color:'var(--acid)',letterSpacing:'-0.04em',lineHeight:1 }}>
                    {p.prefix}<CountUp end={p.metric} suffix={p.suffix} />
                  </div>
                  <div className="qd-eyebrow" style={{ color:'var(--fg3)' }}>{p.label}</div>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <WorkMarqueeStrip />
    </div>
  </section>
);

// FULL WORK SECTION TEMPORARILY HIDDEN
window.__QD = { ...window.__QD, Work, WorkMarqueeOnly };
