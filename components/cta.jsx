const { useState, useEffect, useRef } = React;
const { Reveal, Eyebrow } = window.__QD;

const ctaCopy = {
  en: {
    modalKicker: 'QD Systems channel select',
    modalTitle: 'Contact QD Systems',
    modalSubtitle: 'Choose how you want to reach us.',
    contactOptions: [
      { id: 'call', label: 'Call us', description: 'Speak directly with QD Systems', href: 'tel:+971505349907', accent: 'default', status: 'CALL', disabled: false },
      { id: 'whatsapp', label: 'WhatsApp', description: 'Fastest response', href: 'https://wa.me/971505349907?text=Hi%20QD%20Systems,%20I%E2%80%99m%20interested%20in%20starting%20a%20build.', accent: 'primary', status: 'OPEN', disabled: false },
      { id: 'email', label: 'Email', description: 'Coming soon', href: '#', accent: 'muted', status: 'SOON', disabled: true }
    ],
    eyebrow: '// 07 · BUILD MODE',
    title: ['Tell us', 'the problem.'],
    startBuild: 'START A BUILD ->',
    contact: 'CONTACT',
    channelName: '#new-builds',
    typing: 'typing...',
    online: '● online',
    quote: '"We need a chatbot to handle bookings while we sleep. Goes live in two weeks. Possible?"',
    reply: 'Reply within 48h...'
  },
  ar: {
    modalKicker: 'قنوات التواصل مع QD Systems',
    modalTitle: 'تواصل مع QD Systems',
    modalSubtitle: 'اختر طريقة التواصل المناسبة.',
    contactOptions: [
      { id: 'call', label: 'اتصل بنا', description: 'تحدث مباشرة مع QD Systems', href: 'tel:+971505349907', accent: 'default', status: 'اتصال', disabled: false },
      { id: 'whatsapp', label: 'واتساب', description: 'أسرع طريقة للرد', href: 'https://wa.me/971505349907?text=Hi%20QD%20Systems,%20I%E2%80%99m%20interested%20in%20starting%20a%20build.', accent: 'primary', status: 'فتح', disabled: false },
      { id: 'email', label: 'البريد الإلكتروني', description: 'قريباً', href: '#', accent: 'muted', status: 'قريباً', disabled: true }
    ],
    eyebrow: '// 07 · وضع البناء',
    title: ['قل لنا', 'ما المشكلة.'],
    startBuild: 'ابدأ مشروعك ->',
    contact: 'تواصل',
    channelName: '#new-builds',
    typing: 'typing...',
    online: '● online',
    quote: '"نحتاج شات بوت يدير الحجوزات حتى أثناء النوم. الإطلاق خلال أسبوعين. هل هذا ممكن؟"',
    reply: 'رد خلال 48 ساعة...'
  }
};

const ContactModal = ({ open, onClose, closeButtonRef, modalRef, copy }) => {
  if (!open) return null;

  return (
    <div
      className="qd-contact-modal-overlay"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="qd-contact-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qd-contact-modal-title"
        aria-describedby="qd-contact-modal-subtitle"
        tabIndex="-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qd-contact-modal-chrome" />
        <button
          ref={closeButtonRef}
          type="button"
          className="qd-contact-modal-close"
          aria-label="Close contact options"
          onClick={onClose}
        >
          <span aria-hidden="true">{'\u00D7'}</span>
        </button>

        <div className="qd-contact-modal-head">
          <span className="qd-contact-kicker">{copy.modalKicker}</span>
          <h3 id="qd-contact-modal-title">{copy.modalTitle}</h3>
          <p id="qd-contact-modal-subtitle">{copy.modalSubtitle}</p>
        </div>

        <div className="qd-contact-options" role="list">
          {copy.contactOptions.map((option) => {
            const className = [
              'qd-contact-option',
              option.accent === 'primary' ? 'is-primary' : '',
              option.disabled ? 'is-disabled' : ''
            ].filter(Boolean).join(' ');

            const content = (
              <>
                <div className="qd-contact-option-copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </div>
                <span className="qd-contact-option-status" aria-hidden="true">
                  {option.status}
                </span>
              </>
            );

            if (option.disabled) {
              return (
                <button
                  key={option.id}
                  type="button"
                  className={className}
                  disabled
                  aria-disabled="true"
                >
                  {content}
                </button>
              );
            }

            return (
              <a
                key={option.id}
                className={className}
                href={option.href}
                target={option.id === 'whatsapp' ? '_blank' : undefined}
                rel={option.id === 'whatsapp' ? 'noreferrer' : undefined}
              >
                {content}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CTA = ({ language = 'en' }) => {
  const copy = ctaCopy[language] || ctaCopy.en;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const contactButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const modalRef = useRef(null);
  const previousActiveRef = useRef(null);
  const closeContactModal = () => setIsModalOpen(false);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    previousActiveRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContactModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
        return;
      }

      if (modalRef.current) {
        modalRef.current.focus();
      }
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      const previousActive = previousActiveRef.current;
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      } else if (contactButtonRef.current) {
        contactButtonRef.current.focus();
      }
    };
  }, [isModalOpen]);

  return (
    <section
      id="contact"
      className="qd-section qd-bridge-receive qd-cta-section"
      style={{ background:'var(--acid)', color:'var(--obsidian)', padding:'180px 40px 100px', position:'relative', overflow:'hidden', zIndex:5, minHeight:'90vh', display:'grid', placeItems:'center' }}
    >
      <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', pointerEvents:'none', overflow:'hidden' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'clamp(280px,36vw,560px)', letterSpacing:'-0.06em', color:'transparent', WebkitTextStroke:'2px rgba(11,11,12,0.18)', lineHeight:0.85, userSelect:'none', whiteSpace:'nowrap' }}>BUILD IT</div>
      </div>
      <div style={{ maxWidth:1100, margin:'0 auto', position:'relative', zIndex:2, width:'100%' }}>
        <div className="qd-cta-grid" style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:60, alignItems:'center' }}>
          <div>
            <Reveal lift={24}><Eyebrow color="var(--obsidian)">{copy.eyebrow}</Eyebrow></Reveal>
            <Reveal delay={120} lift={48} duration={1100}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'clamp(72px,10vw,156px)', letterSpacing:'-0.06em', lineHeight:0.88, margin:'24px 0', color:'var(--obsidian)' }}>
                {copy.title[0]}<br />{copy.title[1]}
              </h2>
            </Reveal>
            <Reveal delay={380} lift={24}>
              <div className="qd-cta-actions" style={{ display:'flex', gap:14 }}>
                <button
                  className="qd-btn"
                  style={{ background:'var(--obsidian)', color:'var(--acid)', border:'none', padding:'20px 36px', fontSize:16, borderRadius:6, cursor:'pointer', transition:'transform 200ms ease,box-shadow 200ms ease' }}
                  onClick={() => { window.location.href = window.__QD.getContactHref(); }}
                  onMouseEnter={(event) => {
                    event.target.style.transform = 'translateY(-2px)';
                    event.target.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(event) => {
                    event.target.style.transform = '';
                    event.target.style.boxShadow = '';
                  }}
                >
                  {copy.startBuild}
                </button>
                <button
                  ref={contactButtonRef}
                  type="button"
                  className="qd-btn qd-cta-contact-btn"
                  onClick={() => setIsModalOpen(true)}
                >
                  {copy.contact}
                </button>
              </div>
            </Reveal>
          </div>

          <Reveal delay={300} lift={48} duration={1100}>
            <div className="qd-cta-card" style={{ background:'var(--obsidian)', borderRadius:12, padding:20, color:'var(--fg1)', boxShadow:'0 24px 60px rgba(11,11,12,0.4)', transform:'rotate(1.5deg)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, paddingBottom:14, marginBottom:14, borderBottom:'1px solid var(--border-1)' }}>
                <div style={{ width:28, height:28, background:'var(--acid)', borderRadius:6, display:'grid', placeItems:'center' }}>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14, color:'var(--obsidian)' }}>Q</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:14, color:'var(--bone)' }}>{copy.channelName}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg3)' }}>{copy.typing}</div>
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ok)' }}>{copy.online}</span>
              </div>
              <div style={{ padding:14, background:'var(--obsidian-2)', borderRadius:8, fontFamily:'var(--font-body)', fontSize:14, color:'var(--fg2)', lineHeight:1.5, minHeight:100 }}>
                {copy.quote}
              </div>
              <div style={{ marginTop:12, display:'flex', alignItems:'center', padding:'10px 12px', background:'var(--obsidian-3)', borderRadius:8, border:'1px solid var(--acid)', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--fg2)' }}>
                <span style={{ color:'var(--acid)' }}>|</span>
                <span style={{ marginLeft:8 }}>{copy.reply}</span>
                <span style={{ marginLeft:'auto', fontSize:10, color:'var(--fg3)' }}>TXT</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <ContactModal
        open={isModalOpen}
        onClose={closeContactModal}
        closeButtonRef={closeButtonRef}
        modalRef={modalRef}
        copy={copy}
      />
    </section>
  );
};

window.__QD = { ...window.__QD, CTA };
