const { Reveal, Eyebrow, SectionLetter, useViewportFlag } = window.__QD;

const steps = [
  {
    n:'01',
    title:'Intake Form',
    desc:'Complete the intake form so we can understand your business, goals, and system requirements.',
    meta:'START'
  },
  {
    n:'02',
    title:'We Plan',
    desc:'We define the structure, features, content, and build direction.',
    meta:'PLAN'
  },
  {
    n:'03',
    title:'We Build',
    desc:'Design, systems, integrations, and responsive development.',
    meta:'BUILD'
  },
  {
    n:'04',
    title:'We Launch',
    desc:'Testing, refinement, deployment, and ongoing support.',
    meta:'LAUNCH'
  }
];

const Process = () => {
  const isMobile = useViewportFlag(760);
  return (
  <section id="process" className="qd-section qd-bridge-receive" data-bridge="obsidian"
    style={{ position:'relative',background:'var(--obsidian-2)',color:'var(--fg1)',padding:'200px 40px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden' }}>
    <div style={{ position:'absolute',right:-80,top:80,fontFamily:'var(--font-display)',fontSize:'clamp(400px,50vw,720px)',fontWeight:700,letterSpacing:'-0.06em',color:'transparent',WebkitTextStroke:'1px rgba(166,240,79,0.06)',lineHeight:0.85,pointerEvents:'none',userSelect:'none' }}>05</div>
    <div style={{ maxWidth:1280,margin:'0 auto',position:'relative' }}>
      <div className="qd-process-head qd-mobile-stack" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:60,alignItems:'flex-start',marginBottom:100 }}>
        <Reveal lift={32}>
          <Eyebrow color="var(--acid)">{'// 05 \u00b7 HOW IT WORKS'}</Eyebrow>
          <h2 style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:'clamp(56px,8vw,120px)',letterSpacing:'-0.04em',lineHeight:0.92,margin:'12px 0 24px',color:'var(--fg1)' }}>
            Four steps.<br/><em style={{ fontFamily:'var(--font-serif)',fontWeight:400,color:'var(--acid)' }}>Built properly.</em>
          </h2>
          <p style={{ fontFamily:'var(--font-body)',fontSize:18,color:'var(--fg2)',maxWidth:460,lineHeight:1.5 }}>We keep the process simple, clear, and fast {'\u2014'} from intake form to launch.</p>
        </Reveal>
        <div className="qd-process-stats" style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,paddingTop:40 }}>
          {[{ n:'5\u20137d',l:'AVG. BUILD TIME' },{ n:'Custom',l:'EVERY BUILD' },{ n:'Support',l:'POST-LAUNCH' }].map((s,i)=>(
            <Reveal key={i} delay={isMobile ? Math.min(i * 40, 80) : 120+i*80} lift={isMobile ? 14 : 24}>
              <div style={{ border:'1px solid var(--border-2)',padding:'20px 16px',borderRadius:8,background:'rgba(11,11,12,0.4)' }}>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:32,letterSpacing:'-0.02em',color:'var(--acid)' }}>{s.n}</div>
                <div className="qd-eyebrow" style={{ marginTop:6,color:'var(--fg3)' }}>{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div style={{ position:'relative' }}>
        <div className="qd-process-track" style={{ position:'absolute',top:90,left:'4%',right:'4%',height:1,background:'linear-gradient(90deg,transparent,var(--border-3) 8%,var(--border-3) 92%,transparent)',pointerEvents:'none' }} />
        <div className="qd-process-dot-travel" style={{ position:'absolute',top:86,left:'4%',width:9,height:9,background:'var(--acid)',borderRadius:'50%',boxShadow:'0 0 16px var(--acid)',animation:'qd-dot-travel 6s ease-in-out infinite' }} />
        <div className="qd-process-steps" style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:24 }}>
          {steps.map((s,i)=>(
            <Reveal key={s.n} delay={isMobile ? Math.min(i * 24, 72) : i*140} lift={isMobile ? 10 : 48} duration={isMobile ? 380 : 1000}>
              <div className="qd-process-step" style={{ display:'flex',flexDirection:'column',gap:16,marginTop:i%2===0?0:60,position:'relative' }}>
                <div className="qd-process-step-dot" style={{ position:'absolute',top:i%2===0?86:26,left:0,width:9,height:9,background:'var(--acid)',borderRadius:'50%',boxShadow:'0 0 8px var(--acid)' }} />
                <div className="qd-process-step-number" style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(80px,11vw,160px)',letterSpacing:'-0.06em',color:'var(--acid)',lineHeight:1,marginTop:24 }}>{s.n}</div>
                <div className="qd-process-step-meta" style={{ fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.18em',color:'var(--fg3)',textTransform:'uppercase' }}>{s.meta}</div>
                <div className="qd-process-step-title" style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:28,color:'var(--fg1)',letterSpacing:'-0.02em' }}>{s.title}</div>
                <div className="qd-process-step-desc" style={{ fontFamily:'var(--font-body)',fontSize:14,color:'var(--fg2)',lineHeight:1.5 }}>{s.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  </section>
  );
};
window.__QD = { ...window.__QD, Process };
