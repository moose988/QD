const { Reveal, Eyebrow } = window.__QD;

const CTA = () => (
  <section id="contact" className="qd-section qd-bridge-receive qd-cta-section"
    style={{ background:'var(--acid)',color:'var(--obsidian)',padding:'180px 40px 100px',position:'relative',overflow:'hidden',zIndex:5,minHeight:'90vh',display:'grid',placeItems:'center' }}>
    <div style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',pointerEvents:'none',overflow:'hidden' }}>
      <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(280px,36vw,560px)',letterSpacing:'-0.06em',color:'transparent',WebkitTextStroke:'2px rgba(11,11,12,0.18)',lineHeight:0.85,userSelect:'none',whiteSpace:'nowrap' }}>BUILD IT</div>
    </div>
    <div style={{ maxWidth:1100,margin:'0 auto',position:'relative',zIndex:2,width:'100%' }}>
      <div className="qd-cta-grid" style={{ display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:60,alignItems:'center' }}>
        <div>
          <Reveal lift={24}><Eyebrow color="var(--obsidian)">// 07 · BUILD MODE</Eyebrow></Reveal>
          <Reveal delay={120} lift={48} duration={1100}>
            <h2 style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:'clamp(72px,10vw,156px)',letterSpacing:'-0.06em',lineHeight:0.88,margin:'24px 0',color:'var(--obsidian)' }}>
              Tell us<br/>the problem.
            </h2>
          </Reveal>
          <Reveal delay={380} lift={24}>
            <div className="qd-cta-actions" style={{ display:'flex',gap:14 }}>
              <button className="qd-btn" style={{ background:'var(--obsidian)',color:'var(--acid)',border:'none',padding:'20px 36px',fontSize:16,borderRadius:6,cursor:'pointer',transition:'transform 200ms ease,box-shadow 200ms ease' }}
                onClick={() => { window.location.href = 'contact.html'; }}
                onMouseEnter={e=>{e.target.style.transform='translateY(-2px)';e.target.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)';}}
                onMouseLeave={e=>{e.target.style.transform='';e.target.style.boxShadow='';}}>START A BUILD →</button>
              <button className="qd-btn" style={{ background:'transparent',color:'var(--obsidian)',border:'1px solid var(--obsidian)',padding:'20px 36px',fontSize:16,borderRadius:6,cursor:'pointer',transition:'background 200ms ease' }}
                onMouseEnter={e=>e.target.style.background='rgba(10,11,13,0.1)'}
                onMouseLeave={e=>e.target.style.background='transparent'}>EMAIL US</button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={300} lift={48} duration={1100}>
          <div className="qd-cta-card" style={{ background:'var(--obsidian)',borderRadius:12,padding:20,color:'var(--fg1)',boxShadow:'0 24px 60px rgba(11,11,12,0.4)',transform:'rotate(1.5deg)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,paddingBottom:14,marginBottom:14,borderBottom:'1px solid var(--border-1)' }}>
              <div style={{ width:28,height:28,background:'var(--acid)',borderRadius:6,display:'grid',placeItems:'center' }}>
                <span style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:14,color:'var(--obsidian)' }}>Q</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--font-display)',fontWeight:600,fontSize:14,color:'var(--bone)' }}>#new-builds</div>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:10,color:'var(--fg3)' }}>typing…</div>
              </div>
              <span style={{ fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ok)' }}>● online</span>
            </div>
            <div style={{ padding:14,background:'var(--obsidian-2)',borderRadius:8,fontFamily:'var(--font-body)',fontSize:14,color:'var(--fg2)',lineHeight:1.5,minHeight:100 }}>
              "We need a chatbot to handle bookings while we sleep. Goes live in two weeks. Possible?"
            </div>
            <div style={{ marginTop:12,display:'flex',alignItems:'center',padding:'10px 12px',background:'var(--obsidian-3)',borderRadius:8,border:'1px solid var(--acid)',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--fg2)' }}>
              <span style={{ color:'var(--acid)' }}>▍</span>
              <span style={{ marginLeft:8 }}>Reply within 48h…</span>
              <span style={{ marginLeft:'auto',fontSize:10,color:'var(--fg3)' }}>⏎</span>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);
window.__QD = { ...window.__QD, CTA };
