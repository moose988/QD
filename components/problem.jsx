const { useState, useEffect, useRef } = React;
const { Eyebrow, useInView, useMouseTilt, useScrollProgress, useViewportFlag, usePrefersReducedMotion } = window.__QD;

const problemCopy = {
  en: {
    eyebrow: '// 02 · SOUND FAMILIAR?',
    headA: "You don't need ",
    strike: 'more complexity.',
    headB: 'You need ',
    headC: 'less friction.',
    reframeA: 'We make your online presence',
    reframeB: 'feel expensive.',
    pains: [
      { n:'01', pain:'Your business deserves better than a template.', fix:'Custom-built. Brand-first. Designed to convert.' },
      { n:'02', pain:"People visit your site. They don't trust it.", fix:'Faster. Cleaner. Premium UX that feels credible.' },
      { n:'03', pain:"You're running the business manually.", fix:'Booking systems. Automation. Live tracking.' },
    ]
  },
  ar: {
    eyebrow: '// 02 · هل يبدو هذا مألوفاً؟',
    headA: 'أنت لا تحتاج إلى ',
    strike: 'تعقيد أكثر.',
    headB: 'أنت تحتاج إلى ',
    headC: 'احتكاك أقل.',
    reframeA: 'نحن نجعل حضورك الرقمي',
    reframeB: 'يبدو بمستوى فاخر.',
    pains: [
      { n:'01', pain:'نشاطك التجاري يستحق أكثر من قالب جاهز.', fix:'بناء مخصص. علامة أولاً. وتجربة مصممة للتحويل.' },
      { n:'02', pain:'الناس يزورون موقعك لكنهم لا يثقون به.', fix:'أسرع. أنظف. وتجربة فاخرة تعزز المصداقية.' },
      { n:'03', pain:'أنت تدير العمل يدوياً أكثر مما يجب.', fix:'أنظمة حجز. أتمتة. ومتابعة مباشرة.' },
    ]
  }
};

const StrikeWord = ({ children, delay=0 }) => {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <span ref={ref} style={{ position:'relative',display:'inline-block',color:'var(--fg3)' }}>
      {children}
      <span style={{ position:'absolute',left:0,top:'54%',height:6,background:'var(--acid)',width:seen?'100%':'0%',transition:`width 700ms cubic-bezier(0.65,0,0.35,1) ${delay}ms`,boxShadow:'0 0 12px rgba(232,232,238,0.5)',display:'block' }} />
    </span>
  );
};

const ConnectorArrow = ({ start }) => (
  <svg width="64" height="24" viewBox="0 0 64 24" style={{ overflow:'visible' }}>
    <defs>
      <linearGradient id="qd-arrow-grad" x1="0" x2="1">
        <stop offset="0%" stopColor="var(--fg3)" />
        <stop offset="100%" stopColor="var(--acid)" />
      </linearGradient>
    </defs>
    <line x1="0" y1="12" x2="54" y2="12" stroke="url(#qd-arrow-grad)" strokeWidth="2"
      strokeDasharray="60" strokeDashoffset={start?0:60}
      style={{ transition:'stroke-dashoffset 900ms cubic-bezier(0.65,0,0.35,1) 200ms' }} />
    <polyline points="48,6 56,12 48,18" fill="none" stroke="var(--acid)" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity:start?1:0,transform:start?'translateX(0)':'translateX(-12px)',transition:'opacity 400ms ease 900ms,transform 600ms cubic-bezier(0.34,1.56,0.64,1) 900ms',filter:'drop-shadow(0 0 6px var(--acid))' }} />
    <circle cx="0" cy="12" r="3" fill="var(--acid)"
      style={{ opacity:start?0.9:0,transition:'opacity 200ms ease 1100ms',animation:start?'qd-dot-glide 1.6s ease-in-out 1200ms infinite':'none',filter:'drop-shadow(0 0 6px var(--acid))' }} />
  </svg>
);

const PainRow = ({ p, index }) => {
  const ref = useRef(null);
  const seen = useInView(ref, 0.3);
  const mouse = useMouseTilt(ref);
  const [hover, setHover] = useState(false);
  const isMobile = useViewportFlag(760);
  const prefersReducedMotion = usePrefersReducedMotion();
  const interactive = !isMobile && !prefersReducedMotion;
  const tiltX = interactive && hover ? -mouse.y*4 : 0;
  const tiltY = interactive && hover ?  mouse.x*6 : 0;
  return (
    <div ref={ref} className="qd-problem-row" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display:'grid',gridTemplateColumns:'80px 1fr 80px 1fr',gap:32,padding:'44px 32px',alignItems:'center',position:'relative',
        opacity:seen?1:0,
        transform:seen?(interactive?`perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`:'none'):(interactive?'perspective(1400px) rotateX(20deg) translateY(60px) translateZ(-120px)':'translateY(24px)'),
        transformStyle:interactive?'preserve-3d':'flat',
        transition:`opacity ${interactive?900:420}ms cubic-bezier(0.22,1,0.36,1) ${interactive?index*140:Math.min(index*40,80)}ms,transform ${interactive?(hover?180:900):420}ms cubic-bezier(0.22,1,0.36,1) ${interactive?(hover?0:index*140):Math.min(index*40,80)}ms`,
        background:hover && interactive?'linear-gradient(90deg,rgba(232,232,238,0.06),transparent 70%)':'transparent',
        borderTop:index===0?'1px solid var(--border-1)':'none',borderBottom:'1px solid var(--border-1)',
        boxShadow:hover && interactive?'0 24px 48px rgba(0,0,0,0.4),inset 0 0 0 1px rgba(232,232,238,0.2)':'none' }}>
      <div style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:'var(--acid)',boxShadow:'0 0 16px var(--acid)',transform:hover && interactive?'scaleY(1)':'scaleY(0)',transformOrigin:'top',transition:'transform 400ms cubic-bezier(0.65,0,0.35,1)' }} />
      <div className="qd-problem-number" style={{ fontFamily:'var(--font-display)',fontSize:72,fontWeight:700,lineHeight:1,color:'transparent',WebkitTextStroke:hover && interactive?'1.5px var(--acid)':'1px var(--fg3)',letterSpacing:'-0.04em',transform:hover && interactive?'translateZ(60px) scale(1.12)':'translateZ(0) scale(1)',transition:'transform 500ms cubic-bezier(0.34,1.56,0.64,1),-webkit-text-stroke 300ms ease',textShadow:hover && interactive?'0 0 32px rgba(232,232,238,0.5)':'none' }}>{p.n}</div>
      <div className="qd-problem-pain" style={{ fontFamily:'var(--font-display)',fontSize:24,lineHeight:1.3,fontWeight:500,color:hover && interactive?'var(--fg1)':'var(--fg2)',letterSpacing:'-0.01em',transform:hover && interactive?'translateZ(40px)':'translateZ(0)',transition:'color 280ms ease,transform 500ms cubic-bezier(0.34,1.56,0.64,1)' }}>{p.pain}</div>
      <div className="qd-problem-arrow" style={{ display:'grid',placeItems:'center',transform:hover && interactive?'translateZ(50px) scale(1.2)':'translateZ(0) scale(1)',transition:'transform 500ms cubic-bezier(0.34,1.56,0.64,1)' }}><ConnectorArrow start={seen || isMobile} /></div>
      <div className="qd-problem-fix" style={{ fontFamily:'var(--font-display)',fontSize:24,lineHeight:1.3,fontWeight:500,color:'var(--fg1)',letterSpacing:'-0.01em',opacity:seen?1:0,transform:seen?(hover && interactive?'translateZ(40px) translateX(0)':'translateZ(0)'):'translateZ(0) translateX(20px)',transition:`opacity ${interactive?600:320}ms ease ${interactive?index*140+900:Math.min(index*40+120,160)}ms,transform ${interactive?500:320}ms cubic-bezier(0.34,1.56,0.64,1)` }}>{p.fix}</div>
    </div>
  );
};

const Problem = ({ language = 'en' }) => {
  const copy = problemCopy[language] || problemCopy.en;
  const pains = copy.pains;
  const sectionRef = useRef(null);
  const sp = useScrollProgress(sectionRef);
  const headRef = useRef(null);
  const headSeen = useInView(headRef, 0.3);
  const reframeRef = useRef(null);
  const reframeSeen = useInView(reframeRef, 0.4);
  const reframeBox = useRef(null);
  const isMobile = useViewportFlag(760);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reframeInteractive = !isMobile && !prefersReducedMotion;
  const pillMouse = useMouseTilt(reframeBox);

  return (
    <section ref={sectionRef} className="qd-section" data-bridge="obsidian-2"
      style={{ position:'relative',background:'var(--obsidian)',padding:'160px 40px 180px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden',perspective:2000 }}>
      <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(circle at 16% 18%, rgba(232,232,238,0.07), transparent 24%), radial-gradient(circle at 82% 76%, rgba(232,232,238,0.06), transparent 22%), linear-gradient(180deg, rgba(12,13,15,0.92), rgba(10,11,13,1))' }} />
      <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(var(--border-1) 1px,transparent 1px),linear-gradient(90deg,var(--border-1) 1px,transparent 1px)',backgroundSize:'64px 64px',opacity:0.34,pointerEvents:'none',transform:`translateY(${sp*30}px)`,transition:'transform 80ms linear' }} />
      <div style={{ position:'absolute',top:-220,left:'5%',width:'clamp(170px,18vw,300px)',height:'150%',transform:`rotate(-11deg) translateY(${sp*-54}px)`,background:'linear-gradient(180deg,rgba(232,232,238,0.16) 0%,rgba(232,232,238,0.07) 28%,rgba(232,232,238,0.015) 58%,rgba(232,232,238,0) 82%)',filter:'blur(1px)',pointerEvents:'none' }} />
      <div style={{ position:'absolute',top:-220,left:'5%',width:3,height:'150%',transform:`rotate(-11deg) translateY(${sp*-76}px)`,background:'linear-gradient(180deg,rgba(232,232,238,0.46) 0%,rgba(232,232,238,0.18) 42%,rgba(232,232,238,0) 78%)',boxShadow:'0 0 24px rgba(232,232,238,0.22)',pointerEvents:'none' }} />
      <div style={{ position:'absolute',right:'8%',top:'16%',width:'clamp(220px,26vw,420px)',height:'clamp(220px,26vw,420px)',border:'1px solid rgba(232,232,238,0.08)',borderRadius:'50%',transform:`translateY(${sp*40}px)`,pointerEvents:'none' }} />
      <div style={{ position:'absolute',right:'13%',top:'25%',width:'clamp(140px,17vw,280px)',height:'clamp(140px,17vw,280px)',border:'1px solid rgba(232,232,238,0.06)',borderRadius:'50%',transform:`translateY(${sp*64}px)`,pointerEvents:'none' }} />
      <div style={{ position:'absolute',right:'6%',bottom:'10%',fontFamily:'var(--font-display)',fontSize:'clamp(180px,22vw,340px)',fontWeight:700,letterSpacing:'-0.08em',lineHeight:0.82,color:'transparent',WebkitTextStroke:'1px rgba(232,232,238,0.06)',opacity:0.55,transform:`translateY(${sp*34}px)`,pointerEvents:'none',userSelect:'none' }}>QD</div>
      <div style={{ position:'absolute',right:'18%',top:'57%',width:120,height:1,background:'linear-gradient(90deg, transparent, rgba(232,232,238,0.38), transparent)',transform:`translateY(${sp*46}px)`,pointerEvents:'none' }} />
      <div style={{ position:'absolute',right:'18%',top:'57%',width:8,height:8,borderRadius:'50%',border:'1px solid rgba(232,232,238,0.5)',background:'rgba(232,232,238,0.12)',boxShadow:'0 0 18px rgba(232,232,238,0.18)',transform:`translateY(${sp*46}px) translateX(52px)`,pointerEvents:'none' }} />

      <div style={{ maxWidth:1280,margin:'0 auto',position:'relative',transformStyle:'preserve-3d' }}>
        <div ref={headRef} style={{ marginBottom:80,maxWidth:920,perspective:1200 }}>
          <div style={{ opacity:headSeen?1:0,transform:headSeen?'translateY(0)':'translateY(20px)',transition:'opacity 600ms ease,transform 600ms cubic-bezier(0.22,1,0.36,1)' }}>
            <Eyebrow color="var(--acid)">{copy.eyebrow}</Eyebrow>
          </div>
          <h2 style={{ marginTop:16,fontFamily:'var(--font-display)',fontSize:'clamp(40px,5.5vw,76px)',lineHeight:1,letterSpacing:'-0.03em',fontWeight:600,color:'var(--bone)' }}>
            <span style={{ display:'inline-block',opacity:headSeen?1:0,transform:headSeen?'perspective(800px) rotateX(0deg)':'perspective(800px) rotateX(-50deg) translateY(40px)',transformOrigin:'bottom',transition:'opacity 800ms ease 100ms,transform 900ms cubic-bezier(0.22,1,0.36,1) 100ms' }}>{copy.headA}</span>
            <span style={{ display:'inline-block',opacity:headSeen?1:0,transform:headSeen?'perspective(800px) rotateX(0deg)':'perspective(800px) rotateX(-50deg) translateY(40px)',transformOrigin:'bottom',transition:'opacity 800ms ease 280ms,transform 900ms cubic-bezier(0.22,1,0.36,1) 280ms' }}><StrikeWord delay={1100}>{copy.strike}</StrikeWord></span>
            <br />
            <span style={{ display:'inline-block',marginTop:8,opacity:headSeen?1:0,transform:headSeen?'perspective(800px) rotateX(0deg)':'perspective(800px) rotateX(-50deg) translateY(40px)',transformOrigin:'bottom',transition:'opacity 800ms ease 1500ms,transform 900ms cubic-bezier(0.22,1,0.36,1) 1500ms' }}>
              {copy.headB} <span style={{ color:'var(--acid)',display:'inline-block',animation:headSeen?'qd-glow-pulse 2.4s ease-in-out 2200ms infinite':'none' }}>{copy.headC}</span>
            </span>
          </h2>
        </div>

        <div style={{ borderTop:'1px solid var(--border-1)',perspective:1600,transformStyle:'preserve-3d' }}>
          {pains.map((p,i) => <PainRow key={p.n} p={p} index={i} />)}
        </div>

        <div ref={reframeRef} style={{ marginTop:96,textAlign:'center',opacity:reframeSeen?1:0,transform:reframeSeen?'translateY(0)':'translateY(30px)',transition:'opacity 800ms ease,transform 800ms cubic-bezier(0.22,1,0.36,1)' }}>
          <div ref={reframeBox} style={{ fontFamily:'var(--font-display)',fontSize:'clamp(24px,2.6vw,36px)',lineHeight:1.3,fontWeight:500,letterSpacing:'-0.02em',maxWidth:880,margin:'0 auto',display:'inline-block',padding:'12px 8px',transformStyle:reframeInteractive?'preserve-3d':'flat',transform:reframeInteractive?`perspective(1000px) rotateX(${pillMouse.y*-3}deg) rotateY(${pillMouse.x*4}deg)`:'none',transition:'transform 200ms ease-out',color:'var(--bone)' }}>
            {copy.reframeA}{' '}
            <span style={{ color:'var(--obsidian)',background:'var(--acid)',padding:'2px 14px',display:'inline-block',borderRadius:4,transform:reframeSeen?(reframeInteractive?`translate(${pillMouse.x*8}px,${pillMouse.y*6}px) scale(1) rotate(${pillMouse.x*2}deg)`:'scale(1)'):'translate(0,0) scale(0)',transition:reframeSeen?'transform 200ms ease-out':'transform 700ms cubic-bezier(0.34,1.56,0.64,1) 700ms',boxShadow:'0 8px 24px rgba(232,232,238,0.3)' }}>{copy.reframeB}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

window.__QD = { ...window.__QD, Problem };
