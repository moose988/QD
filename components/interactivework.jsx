const { useState, useEffect, useRef } = React;

const WORK_COPY = {
  en: {
    tag: 'Selected work',
    title: 'Live systems, running in the real world.',
    lead: 'Two custom builds serving real customers today — scroll inside each preview or open the live site.',
    live: 'LIVE',
    loading: 'Loading preview…',
    viewLive: 'View live site',
    fallbackTitle: 'Preview unavailable in-frame',
    fallbackBody: 'This site blocks embedded previews. Open it in a new tab to explore.',
    projects: [
      {
        id: 'taj',
        name: 'Al Taj Al Malaki',
        category: 'Event Rentals · UAE',
        domain: 'tajalmalaki.ae',
        url: 'https://www.tajalmalaki.ae/',
        description: 'Browse premium inventory, place orders, and track deliveries — without endless phone calls.',
        result: 'A live booking & tracking system, bilingual EN/AR, running across the UAE.',
        tags: ['Real-time tracking', 'Mobile-first', 'Bilingual'],
      },
      {
        id: 'evo',
        name: 'Evo Creation',
        category: 'Luxury Events · UAE',
        domain: 'evocreation.ae',
        url: 'https://evocreation.ae/',
        description: 'A cinematic brand experience that sells luxury before the first conversation.',
        result: 'Premium lead capture and motion-rich storytelling, live around the clock.',
        tags: ['Motion design', 'Lead capture', 'Responsive', 'Luxury UI'],
      },
    ],
  },
  ar: {
    tag: 'أعمال مختارة',
    title: 'أنظمة مباشرة تعمل في العالم الحقيقي.',
    lead: 'مشروعان مخصصان يخدمان عملاء حقيقيين اليوم — تصفح داخل كل معاينة أو افتح الموقع المباشر.',
    live: 'مباشر',
    loading: 'جاري تحميل المعاينة…',
    viewLive: 'زيارة الموقع المباشر',
    fallbackTitle: 'المعاينة غير متاحة داخل الإطار',
    fallbackBody: 'هذا الموقع يمنع التضمين. افتحه في تبويب جديد للاستكشاف.',
    projects: [
      {
        id: 'taj',
        name: 'Al Taj Al Malaki',
        category: 'تأجير فعاليات · الإمارات',
        domain: 'tajalmalaki.ae',
        url: 'https://www.tajalmalaki.ae/',
        description: 'تصفح مخزون فاخر، أتمم الطلبات، وتتبع التسليم — دون مكالمات لا تنتهي.',
        result: 'نظام حجز وتتبع مباشر، ثنائي اللغة EN/AR، يعمل في جميع أنحاء الإمارات.',
        tags: ['تتبع مباشر', 'مهيأ للجوال', 'ثنائي اللغة'],
      },
      {
        id: 'evo',
        name: 'Evo Creation',
        category: 'فعاليات فاخرة · الإمارات',
        domain: 'evocreation.ae',
        url: 'https://evocreation.ae/',
        description: 'تجربة علامة سينمائية تبيع الفخامة قبل أول محادثة.',
        result: 'توليد عملاء راقٍ وسرد بصري غني بالحركة، يعمل على مدار الساعة.',
        tags: ['تصميم حركي', 'توليد عملاء', 'متجاوب', 'واجهة فاخرة'],
      },
    ],
  },
  zh: {
    tag: '精选案例',
    title: '在真实世界运行的实时系统。',
    lead: '两个为真实客户服务的定制项目——在每个预览中滚动查看，或打开线上网站。',
    live: '在线',
    loading: '正在加载预览…',
    viewLive: '访问线上网站',
    fallbackTitle: '无法在框架内预览',
    fallbackBody: '该网站禁止嵌入预览。请在新标签页中打开以浏览。',
    projects: [
      {
        id: 'taj',
        name: 'Al Taj Al Malaki',
        category: '活动租赁 · 阿联酋',
        domain: 'tajalmalaki.ae',
        url: 'https://www.tajalmalaki.ae/',
        description: '浏览高端库存、下单并追踪配送——无需没完没了的电话。',
        result: '一套实时预订与追踪系统，支持英 / 阿双语，覆盖整个阿联酋。',
        tags: ['实时追踪', '移动优先', '双语'],
      },
      {
        id: 'evo',
        name: 'Evo Creation',
        category: '奢华活动 · 阿联酋',
        domain: 'evocreation.ae',
        url: 'https://evocreation.ae/',
        description: '一种电影般的品牌体验，在第一次对话之前就卖出奢华感。',
        result: '高端线索捕获与富有动效的叙事，全天候在线。',
        tags: ['动效设计', '线索捕获', '响应式', '奢华界面'],
      },
    ],
  },
  ru: {
    tag: 'Избранные работы',
    title: 'Живые системы, работающие в реальном мире.',
    lead: 'Два кастомных проекта, обслуживающих реальных клиентов сегодня — прокрутите внутри каждого превью или откройте сайт.',
    live: 'LIVE',
    loading: 'Загрузка превью…',
    viewLive: 'Открыть сайт',
    fallbackTitle: 'Превью недоступно во фрейме',
    fallbackBody: 'Этот сайт блокирует встроенный просмотр. Откройте его в новой вкладке.',
    projects: [
      {
        id: 'taj',
        name: 'Al Taj Al Malaki',
        category: 'Аренда для мероприятий · ОАЭ',
        domain: 'tajalmalaki.ae',
        url: 'https://www.tajalmalaki.ae/',
        description: 'Просматривайте премиальный каталог, оформляйте заказы и отслеживайте доставку — без бесконечных звонков.',
        result: 'Живая система брони и трекинга, двуязычная EN/AR, работает по всем ОАЭ.',
        tags: ['Трекинг в реальном времени', 'Mobile-first', 'Двуязычно'],
      },
      {
        id: 'evo',
        name: 'Evo Creation',
        category: 'Люксовые мероприятия · ОАЭ',
        domain: 'evocreation.ae',
        url: 'https://evocreation.ae/',
        description: 'Кинематографичный бренд-опыт, который продаёт люкс ещё до первого разговора.',
        result: 'Премиальный захват заявок и насыщенный анимацией сторителлинг, доступно круглосуточно.',
        tags: ['Моушн-дизайн', 'Захват заявок', 'Адаптивность', 'Люкс-интерфейс'],
      },
    ],
  },
};

const useInView = (threshold = 0.12) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
};

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

const TajMock = () => (
  <div className="iwork-mock iwork-mock--taj" aria-hidden="true">
    <div className="iwork-mock-nav">
      <span className="iwork-mock-logo">Taj Al Malaki</span>
      <span className="iwork-mock-pill">EN / AR</span>
    </div>
    <div className="iwork-mock-hero">
      <div className="iwork-mock-eyebrow">Premium Event Rentals</div>
      <div className="iwork-mock-title">Luxury setups.<br />Tracked live.</div>
      <div className="iwork-mock-cta">Browse inventory</div>
    </div>
    <div className="iwork-mock-grid">
      {['Round tables', 'Chiavari chairs', 'Stage décor'].map((item) => (
        <div key={item} className="iwork-mock-tile">
          <div className="iwork-mock-tile-img" />
          <span>{item}</span>
        </div>
      ))}
    </div>
    <div className="iwork-mock-track">
      <span className="iwork-mock-dot" />
      Order #1842 · Out for delivery
    </div>
  </div>
);

const EvoMock = () => (
  <div className="iwork-mock iwork-mock--evo" aria-hidden="true">
    <div className="iwork-mock-nav iwork-mock-nav--evo">
      <span className="iwork-mock-logo">EVO CREATION</span>
    </div>
    <div className="iwork-mock-hero iwork-mock-hero--evo">
      <div className="iwork-mock-eyebrow">Luxury Weddings & Events</div>
      <div className="iwork-mock-title iwork-mock-title--evo">Crafted to<br />feel cinematic.</div>
    </div>
    <div className="iwork-mock-strip">
      <div className="iwork-mock-frame" />
      <div className="iwork-mock-frame iwork-mock-frame--tall" />
      <div className="iwork-mock-frame" />
    </div>
    <div className="iwork-mock-cta iwork-mock-cta--evo">Request a consultation</div>
  </div>
);

const MockPreview = ({ projectId }) => {
  if (projectId === 'taj') return <TajMock />;
  if (projectId === 'evo') return <EvoMock />;
  return null;
};

const PreviewSkeleton = ({ label }) => (
  <div className="iwork-skeleton" aria-hidden="true">
    <div className="iwork-skeleton-bar" />
    <div className="iwork-skeleton-block" />
    <div className="iwork-skeleton-lines">
      <span /><span /><span />
    </div>
    <span className="iwork-skeleton-label">{label}</span>
  </div>
);

const BrowserPreview = ({ project, copy, useIframe }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!useIframe);
  const timeoutRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!useIframe) {
      setFailed(true);
      setLoaded(false);
      return;
    }
    loadedRef.current = false;
    setLoaded(false);
    setFailed(false);
    timeoutRef.current = window.setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 6000);
    return () => window.clearTimeout(timeoutRef.current);
  }, [project.url, useIframe]);

  const showMock = failed;
  const showSkeleton = useIframe && !loaded && !failed;

  return (
    <div className="iwork-viewport">
      {showSkeleton && <PreviewSkeleton label={copy.loading} />}
      {showMock && <MockPreview projectId={project.id} />}
      {useIframe && !failed && (
        <iframe
          src={project.url}
          title={`Live preview of ${project.name} website`}
          loading="lazy"
          className={`iwork-iframe${loaded ? ' is-loaded' : ''}`}
          onLoad={() => {
            loadedRef.current = true;
            window.clearTimeout(timeoutRef.current);
            setLoaded(true);
          }}
          onError={() => setFailed(true)}
        />
      )}
      {failed && useIframe && (
        <div className="iwork-fallback" role="status">
          <strong>{copy.fallbackTitle}</strong>
          <p>{copy.fallbackBody}</p>
        </div>
      )}
    </div>
  );
};

const useCoarsePointer = () => {
  const [coarse, setCoarse] = useState(() => window.matchMedia('(hover: none), (pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return coarse;
};

const InteractiveWorkPreview = ({ project, copy, index }) => {
  const [cardRef, visible] = useInView(0.08);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [hovered, setHovered] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  const allowHover = !reduced && !coarse;

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setUseIframe(true), index * 180);
    return () => window.clearTimeout(t);
  }, [visible, index]);

  const openLive = () => window.open(project.url, '_blank', 'noopener,noreferrer');

  return (
    <article
      ref={cardRef}
      className={`iwork-card reveal${visible ? ' in' : ''}${hovered && allowHover ? ' is-hovered' : ''}`}
      onMouseEnter={() => { if (allowHover) setHovered(true); }}
      onMouseLeave={() => { if (allowHover) setHovered(false); }}
    >
      <div className="iwork-card-glow" aria-hidden="true" />
      <div className="iwork-browser">
        <div className="iwork-browser-bar">
          <div className="iwork-dots" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="iwork-url" dir="ltr">
            <span className="iwork-live"><i aria-hidden="true" />{copy.live}</span>
            <span className="iwork-domain">{project.domain}</span>
          </div>
        </div>
        <BrowserPreview project={project} copy={copy} useIframe={useIframe} />
      </div>

      <div className="iwork-body">
        <div className="iwork-meta">
          <span className="iwork-cat">{project.category}</span>
          <h3>{project.name}</h3>
        </div>
        <p className="iwork-desc">{project.description}</p>
        <p className="iwork-result">{project.result}</p>
        <div className="iwork-tags" aria-label="Services delivered">
          {project.tags.map((tag) => (
            <span key={tag} className="iwork-tag">{tag}</span>
          ))}
        </div>
        <div className="iwork-actions">
          <button type="button" className="btn btn-silver iwork-btn" onClick={openLive}>
            {copy.viewLive} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </article>
  );
};

const SelectedWorkSection = ({ language = 'en' }) => {
  const copy = WORK_COPY[language] || WORK_COPY.en;
  const [headRef, headVisible] = useInView();

  return (
    <>
      <div ref={headRef} className={`reveal${headVisible ? ' in' : ''}`}>
        <span className="tag">{copy.tag}</span>
        <h2 className="h2">{copy.title}</h2>
        <p className="lead">{copy.lead}</p>
      </div>
      <div className="iwork-grid">
        {copy.projects.map((project, index) => (
          <InteractiveWorkPreview key={project.id} project={project} copy={copy} index={index} />
        ))}
      </div>
    </>
  );
};

window.__QD = { ...window.__QD, SelectedWorkSection, InteractiveWorkPreview, WORK_COPY };

const workRoot = document.getElementById('work-root');
if (workRoot) {
  const workReactRoot = ReactDOM.createRoot(workRoot);
  const pickWorkLang = () => {
    const l = window.QD_LANG || document.documentElement.lang || 'en';
    return WORK_COPY[l] ? l : 'en';
  };
  const renderWork = () => workReactRoot.render(<SelectedWorkSection language={pickWorkLang()} />);
  renderWork();
  window.addEventListener('qd:langchange', renderWork);
}
