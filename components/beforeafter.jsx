const { useState, useRef, useEffect, useCallback } = React;
const { Reveal, Eyebrow } = window.__QD;

const PRESET_SPLITS = [10, 25, 50, 75, 90];

const BeforeSite = () => (
  <div style={{ fontFamily:'Arial,Helvetica,sans-serif',color:'#222',background:'#fff',height:'100%',width:'100%',overflow:'hidden',display:'flex',flexDirection:'column' }}>
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 22px',borderBottom:'1px solid #e5e5e5',flexShrink:0 }}>
      <div style={{ display:'flex',alignItems:'center',gap:7 }}>
        <div style={{ width:22,height:22,borderRadius:3,background:'linear-gradient(135deg,#4a90e2,#7b68ee)',display:'grid',placeItems:'center',color:'#fff',fontWeight:700,fontSize:11 }}>P</div>
        <div style={{ fontWeight:700,fontSize:15,color:'#333' }}>Petal<span style={{ color:'#4a90e2' }}>Co</span></div>
      </div>
      <div style={{ display:'flex',gap:14,fontSize:11,color:'#666' }}>{['Home','Shop','About','Blog','Contact'].map(l => <span key={l}>{l}</span>)}</div>
      <div style={{ padding:'5px 11px',background:'#4a90e2',color:'#fff',fontSize:10,fontWeight:700,borderRadius:3 }}>BUY NOW</div>
    </div>
    <div style={{ padding:'22px 22px 18px',background:'linear-gradient(180deg,#f0f4f8,#fff)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,alignItems:'center',borderBottom:'1px solid #e5e5e5',flexShrink:0 }}>
      <div>
        <div style={{ display:'inline-block',padding:'3px 8px',background:'#fff5d6',color:'#a0791e',fontSize:9,fontWeight:700,borderRadius:10,marginBottom:8 }}>★ #1 RATED 2014</div>
        <div style={{ fontSize:22,fontWeight:700,lineHeight:1.15,color:'#1a1a1a',marginBottom:7 }}>Premium Floral<br/><span style={{ color:'#4a90e2' }}>Solutions Online</span></div>
        <div style={{ fontSize:11,color:'#666',lineHeight:1.4,marginBottom:12 }}>Discover our cutting-edge floral arrangements that leverage synergy to unlock unprecedented gifting opportunities.</div>
        <div style={{ display:'flex',gap:6 }}>
          <div style={{ padding:'7px 14px',background:'#ff6b35',color:'#fff',fontSize:10,fontWeight:700,borderRadius:3 }}>SHOP NOW →</div>
          <div style={{ padding:'7px 14px',background:'#fff',color:'#4a90e2',fontSize:10,fontWeight:700,border:'2px solid #4a90e2',borderRadius:3 }}>WATCH VIDEO ▶</div>
        </div>
      </div>
      <div style={{ height:130,borderRadius:4,background:'linear-gradient(135deg,#d4e4f7,#b8d0eb)',position:'relative',border:'1px solid #c0d4e8' }}>
        <div style={{ position:'absolute',inset:12,background:'rgba(255,255,255,0.5)',borderRadius:3,display:'grid',placeItems:'center' }}><div style={{ fontSize:36,opacity:0.4 }}>🌸</div></div>
        <div style={{ position:'absolute',bottom:5,right:7,fontSize:8,color:'#888',fontStyle:'italic' }}>shutterstock_4421.jpg</div>
      </div>
    </div>
    <div style={{ padding:'10px 22px',background:'#f9f9f9',borderBottom:'1px solid #e5e5e5',display:'flex',alignItems:'center',gap:14,justifyContent:'center',flexShrink:0 }}>
      <div style={{ fontSize:8,color:'#888',textTransform:'uppercase',letterSpacing:0.5 }}>As seen in:</div>
      {['VOGUE','ELLE','TIME','FORBES'].map(b => <div key={b} style={{ fontSize:11,fontWeight:700,color:'#aaa',fontStyle:'italic' }}>{b}</div>)}
    </div>
    <div style={{ padding:'20px 22px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,flex:1 }}>
      {[{ icon:'🚀',t:'Lightning Fast Delivery',d:'Blazing-fast shipping' },{ icon:'🔒',t:'Secure Checkout',d:'Bank-level encryption' },{ icon:'💡',t:'Smart Subscriptions',d:'AI-powered weekly' }].map((f,i) => (
        <div key={i} style={{ textAlign:'center',padding:8 }}>
          <div style={{ width:40,height:40,borderRadius:'50%',background:'#e8f1fb',margin:'0 auto 8px',display:'grid',placeItems:'center',fontSize:18 }}>{f.icon}</div>
          <div style={{ fontSize:11,fontWeight:700,color:'#333',marginBottom:3 }}>{f.t}</div>
          <div style={{ fontSize:9,color:'#888',lineHeight:1.4 }}>{f.d}</div>
        </div>
      ))}
    </div>
  </div>
);

const AfterSite = () => (
  <div style={{ fontFamily:'Georgia,"Times New Roman",serif',color:'#1c1611',background:'#f4ecdf',height:'100%',width:'100%',overflow:'hidden',display:'flex',flexDirection:'column' }}>
    <div style={{ display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',padding:'14px 26px',borderBottom:'1px solid #1c1611',flexShrink:0 }}>
      <div style={{ fontFamily:'"Courier New",monospace',fontSize:9,letterSpacing:'0.2em',textTransform:'uppercase' }}>EST. 2014 · NO. 04</div>
      <div style={{ fontFamily:'Georgia,serif',fontSize:22,letterSpacing:'0.18em',textAlign:'center',textTransform:'uppercase' }}>PETAL<span style={{ fontStyle:'italic' }}>&amp;Co</span></div>
      <div style={{ display:'flex',justifyContent:'flex-end',gap:18,fontFamily:'"Courier New",monospace',fontSize:10,letterSpacing:'0.16em',textTransform:'uppercase' }}>
        <span>SHOP</span><span>JOURNAL</span><span style={{ color:'#d8552a' }}>★ NEW</span>
      </div>
    </div>
    <div style={{ flex:1,display:'grid',gridTemplateColumns:'1.1fr 1fr',borderBottom:'1px solid #1c1611',minHeight:0 }}>
      <div style={{ padding:'28px 26px',display:'flex',flexDirection:'column',justifyContent:'space-between',borderRight:'1px solid #1c1611' }}>
        <div>
          <div style={{ fontFamily:'"Courier New",monospace',fontSize:9,letterSpacing:'0.22em',textTransform:'uppercase',color:'#d8552a',marginBottom:14 }}>VOLUME III — SPRING ARRANGEMENTS</div>
          <div style={{ fontFamily:'Georgia,serif',fontSize:38,lineHeight:0.95 }}>Flowers,<br/><span style={{ fontStyle:'italic',color:'#d8552a' }}>but make them</span><br/>arrive on time.</div>
          <div style={{ marginTop:18,fontFamily:'Georgia,serif',fontSize:12,color:'#3a322a',lineHeight:1.5,fontStyle:'italic' }}>Hand-tied. Sourced within 40 miles. Delivered before noon, or it's free.</div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginTop:16 }}>
          <div style={{ padding:'10px 20px',background:'#1c1611',color:'#f4ecdf',fontFamily:'"Courier New",monospace',fontSize:10,letterSpacing:'0.18em',textTransform:'uppercase' }}>Order today →</div>
          <div style={{ fontFamily:'Georgia,serif',fontStyle:'italic',fontSize:12,textDecoration:'underline',textUnderlineOffset:3 }}>or visit the studio</div>
        </div>
      </div>
      <div style={{ position:'relative',overflow:'hidden',background:'linear-gradient(135deg,#d8552a,#c2401d 60%,#8a2810)' }}>
        <svg viewBox="0 0 240 280" style={{ position:'absolute',inset:0,width:'100%',height:'100%' }} preserveAspectRatio="xMidYMid slice">
          <defs><radialGradient id="ba-bloom" cx="0.5" cy="0.5"><stop offset="0%" stopColor="#f4ecdf" stopOpacity="0.95"/><stop offset="50%" stopColor="#e8b89a" stopOpacity="0.7"/><stop offset="100%" stopColor="#d8552a" stopOpacity="0"/></radialGradient></defs>
          <path d="M120 280 Q118 200 130 140" stroke="#1c1611" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <path d="M90 280 Q92 220 80 170" stroke="#1c1611" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <path d="M160 280 Q158 210 170 150" stroke="#1c1611" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <circle cx="130" cy="140" r="42" fill="url(#ba-bloom)"/>
          <circle cx="80" cy="170" r="34" fill="url(#ba-bloom)" opacity="0.9"/>
          <circle cx="170" cy="150" r="30" fill="url(#ba-bloom)" opacity="0.85"/>
          <circle cx="130" cy="140" r="10" fill="#1c1611"/>
        </svg>
        <div style={{ position:'absolute',bottom:12,right:14,fontFamily:'Georgia,serif',fontStyle:'italic',fontSize:11,color:'#f4ecdf',textAlign:'right',lineHeight:1.3 }}>Plate I —<br/><span style={{ fontFamily:'"Courier New",monospace',fontStyle:'normal',fontSize:8,letterSpacing:'0.15em' }}>SPRING / 26</span></div>
      </div>
    </div>
    <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',flexShrink:0 }}>
      {[{ n:'01',t:'Pick a bloom',s:'curated weekly' },{ n:'02',t:'Choose a vase',s:'eight shapes' },{ n:'03',t:'Add a note',s:'handwritten' },{ n:'04',t:'Doorstep, 11am',s:"or it's free" }].map((c,i) => (
        <div key={i} style={{ padding:'14px 16px',borderRight:i===3?'none':'1px solid #1c1611',display:'flex',flexDirection:'column',gap:4 }}>
          <div style={{ fontFamily:'"Courier New",monospace',fontSize:9,color:'#d8552a',letterSpacing:'0.2em' }}>NO. {c.n}</div>
          <div style={{ fontFamily:'Georgia,serif',fontSize:14,fontStyle:'italic' }}>{c.t}</div>
          <div style={{ fontFamily:'"Courier New",monospace',fontSize:8,color:'#3a322a',letterSpacing:'0.12em',textTransform:'uppercase' }}>{c.s}</div>
        </div>
      ))}
    </div>
  </div>
);

const clampSplit = (value) => Math.max(2, Math.min(98, value));

const getPresetValue = (value) => {
  const match = PRESET_SPLITS.find((preset) => Math.abs(preset - value) < 3);
  return match ?? null;
};

const BeforeAfter = () => {
  const [activePreset, setActivePreset] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const wrapRef = useRef(null);
  const introStartedRef = useRef(false);
  const currentSplitRef = useRef(50);
  const rafRef = useRef(null);
  const introFrameRef = useRef(null);
  const beforeLabelRef = useRef(null);
  const afterLabelRef = useRef(null);

  const syncLabels = useCallback((value) => {
    if (beforeLabelRef.current) beforeLabelRef.current.style.opacity = value > 8 ? '1' : '0';
    if (afterLabelRef.current) afterLabelRef.current.style.opacity = value < 92 ? '1' : '0';
  }, []);

  const applySplit = useCallback((value, options = {}) => {
    const { syncPreset = true } = options;
    const next = clampSplit(value);
    currentSplitRef.current = next;

    if (wrapRef.current) {
      wrapRef.current.style.setProperty('--split', `${next}%`);
    }

    syncLabels(next);

    if (syncPreset) {
      setActivePreset((prev) => {
        const matched = getPresetValue(next);
        return prev === matched ? prev : matched;
      });
    }
  }, [syncLabels]);

  const scheduleSplit = useCallback((value, options = {}) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      applySplit(value, options);
      rafRef.current = null;
    });
  }, [applySplit]);

  const updateFromClientX = useCallback((clientX) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    scheduleSplit(next);
  }, [scheduleSplit]);

  useEffect(() => {
    applySplit(50, { syncPreset: true });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (introFrameRef.current) cancelAnimationFrame(introFrameRef.current);
    };
  }, [applySplit]);

  useEffect(() => {
    if (!dragging) return undefined;

    const onPointerMove = (event) => updateFromClientX(event.clientX);
    const onPointerUp = () => setDragging(false);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragging, updateFromClientX]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || hasInteracted || introStartedRef.current) return undefined;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return undefined;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || introStartedRef.current) return;

        introStartedRef.current = true;
        const totalFrames = 72;
        let frame = 0;

        const animate = () => {
          frame += 1;
          const progress = frame / totalFrames;
          const next = progress < 0.5
            ? 80 - (80 - 30) * (progress / 0.5)
            : 30 + (50 - 30) * ((progress - 0.5) / 0.5);

          applySplit(next, { syncPreset: true });

          if (frame < totalFrames && !hasInteracted) {
            introFrameRef.current = requestAnimationFrame(animate);
          }
        };

        window.setTimeout(() => {
          introFrameRef.current = requestAnimationFrame(animate);
        }, 320);

        observer.disconnect();
      });
    }, { threshold: 0.45 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [applySplit, hasInteracted]);

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    setHasInteracted(true);
    setDragging(true);
    if (wrapRef.current) wrapRef.current.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const jumpToPreset = (value) => {
    setHasInteracted(true);
    scheduleSplit(value, { syncPreset: true });
  };

  return (
    <section id="before-after" className="qd-section qd-beforeafter-section" data-bridge="obsidian-2"
      style={{ position:'relative',background:'var(--obsidian)',padding:'160px 40px 200px',borderTop:'1px solid var(--border-1)',zIndex:5,overflow:'hidden' }}>
      <div className="qd-beforeafter-grid" style={{ position:'absolute',inset:0,opacity:0.4,pointerEvents:'none',backgroundImage:'linear-gradient(rgba(244,241,234,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(244,241,234,0.03) 1px,transparent 1px)',backgroundSize:'64px 64px' }} />
      <div style={{ maxWidth:1280,margin:'0 auto',position:'relative' }}>
        <div className="qd-beforeafter-head qd-mobile-stack" style={{ display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:60,alignItems:'flex-end',marginBottom:56 }}>
          <Reveal lift={32}>
            <Eyebrow color="var(--acid)">// 04 · BEFORE / AFTER</Eyebrow>
            <h2 style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:'clamp(56px,8vw,120px)',letterSpacing:'-0.04em',lineHeight:0.92,margin:'12px 0 24px',color:'var(--bone)' }}>Same client.<br/><em style={{ fontFamily:'var(--font-serif)',fontWeight:400,color:'var(--acid)' }}>Different planet.</em></h2>
            <p style={{ fontFamily:'var(--font-body)',fontSize:18,color:'var(--fg2)',maxWidth:520,lineHeight:1.5 }}>Drag to reveal. Left is what they had. Right is what ships now — a totally different brand voice. We design to <em style={{ fontFamily:'var(--font-serif)' }}>their</em> world, not ours.</p>
          </Reveal>
          <Reveal delay={120} lift={32}>
            <div style={{ display:'flex',flexDirection:'column',gap:14,padding:'20px 24px',border:'1px solid var(--border-1)',borderRadius:12,background:'var(--obsidian-2)' }}>
              {[{ l:'TIME ON SITE',a:'0:23',b:'3:41',d:'+860%' },{ l:'CONVERSION',a:'1.1%',b:'6.4%',d:'+482%' },{ l:'BOUNCE',a:'74%',b:'22%',d:'-70%' }].map((r,i) => (
                <div key={i} style={{ display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:12,alignItems:'center',paddingBottom:i===2?0:10,borderBottom:i===2?'none':'1px solid var(--border-1)' }}>
                  <div className="qd-eyebrow" style={{ fontSize:10 }}>{r.l}</div>
                  <div style={{ fontFamily:'var(--font-mono)',fontSize:13,color:'var(--fg3)',textDecoration:'line-through' }}>{r.a}</div>
                  <div style={{ fontFamily:'var(--font-display)',fontSize:18,fontWeight:600,letterSpacing:'-0.02em',minWidth:56,textAlign:'right',color:'var(--bone)' }}>{r.b}</div>
                  <div style={{ fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,color:'var(--acid)',minWidth:52,textAlign:'right' }}>{r.d}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal lift={40} duration={1000}>
          <div
            ref={wrapRef}
            className={`qd-beforeafter-compare ${dragging ? 'is-dragging' : ''}`}
            onPointerDown={onPointerDown}
            style={{
              '--split': '50%',
              position:'relative',
              borderRadius:16,
              overflow:'hidden',
              border:'1px solid var(--border-1)',
              boxShadow:'0 18px 56px rgba(0,0,0,0.45)',
              cursor:dragging?'grabbing':'ew-resize',
              userSelect:'none',
              aspectRatio:'16/10',
              maxHeight:760,
              background:'var(--obsidian-2)',
            }}
          >
            <div className="qd-beforeafter-browserbar" style={{ position:'absolute',top:0,left:0,right:0,height:36,background:'var(--obsidian-3)',borderBottom:'1px solid var(--border-1)',display:'flex',alignItems:'center',padding:'0 14px',gap:8,zIndex:10 }}>
              <div style={{ display:'flex',gap:6 }}>{['#ff5f57','#febc2e','#28c840'].map((color) => <div key={color} style={{ width:11,height:11,borderRadius:'50%',background:color }} />)}</div>
              <div style={{ marginLeft:16,padding:'4px 10px',background:'var(--obsidian-2)',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--fg3)',display:'flex',alignItems:'center',gap:6,minWidth:220 }}>
                <span style={{ color:'var(--acid)' }}>●</span><span>petalandco.studio</span>
              </div>
            </div>
            <div className="qd-beforeafter-stage" style={{ position:'absolute',top:36,left:0,right:0,bottom:0 }}>
              <div className="qd-beforeafter-after" style={{ position:'absolute',inset:0 }}><AfterSite /></div>
              <div className="qd-beforeafter-before" style={{ position:'absolute',inset:0 }}><BeforeSite /></div>
              <div ref={beforeLabelRef} className="qd-beforeafter-label qd-beforeafter-label-before" style={{ position:'absolute',top:-28,left:6,zIndex:5,fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.2em',color:'var(--fg3)',textTransform:'uppercase',opacity:1,transition:'opacity 160ms ease' }}>● BEFORE · 2014</div>
              <div ref={afterLabelRef} className="qd-beforeafter-label qd-beforeafter-label-after" style={{ position:'absolute',top:-28,right:6,zIndex:5,fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.2em',color:'var(--acid)',textTransform:'uppercase',opacity:1,transition:'opacity 160ms ease' }}>AFTER · QD ●</div>
              <div className="qd-beforeafter-divider qd-heavy-glow" style={{ position:'absolute',top:0,bottom:0,left:'calc(var(--split) - 1px)',width:2,background:'var(--acid)',pointerEvents:'none',zIndex:6 }} />
              <div className="qd-beforeafter-handle" style={{ position:'absolute',top:'50%',left:'var(--split)',transform:'translate3d(-50%, -50%, 0)',zIndex:7,width:56,height:56,borderRadius:'50%',background:'var(--acid)',color:'var(--obsidian)',display:'grid',placeItems:'center',cursor:dragging?'grabbing':'grab',animation:hasInteracted?'none':'qd-handle-bob 2.2s ease-in-out infinite' }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M8 5 L3 11 L8 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 5 L19 11 L14 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120} lift={20}>
          <div className="qd-beforeafter-jumps" style={{ marginTop:18,display:'flex',justifyContent:'center',gap:10 }}>
            {PRESET_SPLITS.map((preset) => (
              <button
                key={preset}
                onClick={() => jumpToPreset(preset)}
                style={{
                  cursor:'pointer',
                  padding:'6px 14px',
                  background:activePreset === preset ? 'var(--acid)' : 'transparent',
                  color:activePreset === preset ? 'var(--obsidian)' : 'var(--fg2)',
                  border:`1px solid ${activePreset === preset ? 'var(--acid)' : 'var(--border-2)'}`,
                  borderRadius:4,
                  fontFamily:'var(--font-mono)',
                  fontSize:10,
                  fontWeight:600,
                  letterSpacing:'0.12em',
                  transition:'background 180ms ease,color 180ms ease,border-color 180ms ease',
                }}
              >
                {preset}%
              </button>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200} lift={20}>
          <div style={{ marginTop:28,display:'flex',justifyContent:'space-between',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--fg3)',letterSpacing:'0.1em',textTransform:'uppercase',flexWrap:'wrap',gap:12 }}>
            <span>// PETAL &amp; CO. · brand + storefront redesign · 9-day turnaround</span>
            <span style={{ color:'var(--acid)',cursor:'pointer' }}>↗ Read the case study</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

window.__QD = { ...window.__QD, BeforeAfter };
