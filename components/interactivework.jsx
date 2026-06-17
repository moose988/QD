const { useState, useEffect, useRef } = React;

const INITIAL_WORK_VISIBLE = 2;

const MORE_PROJECTS = {
  en: [
    {
      id: 'vellora',
      name: 'VELLORA',
      category: 'Premium Showroom · UAE',
      domain: 'vellora-showroom.vercel.app',
      url: 'https://vellora-showroom.vercel.app/',
      description: 'A curated luxury showroom experience built around refined collections, gallery storytelling, and concierge-led visits.',
      result: 'Immersive showroom journey with collections, featured pieces, and premium presentation — live as a portfolio demo.',
      tags: ['Luxury UI', 'Gallery', 'Showroom flow', 'Portfolio demo'],
    },
    {
      id: 'restaurant',
      name: 'Restaurant Website',
      category: 'Halal Grill · UAE',
      domain: 'qdresturant.vercel.app',
      url: 'https://qdresturant.vercel.app/',
      description: 'Char-grilled halal menu, ordering flow, and multi-location showcase built for modern restaurant discovery.',
      result: 'Portfolio-ready restaurant demo with menu highlights, cart flow, and polished branch layouts.',
      tags: ['Online ordering', 'Menu showcase', 'Multi-location', 'Portfolio demo'],
    },
    {
      id: 'evergreen',
      name: 'Evergreen Construction',
      category: 'Construction · Portfolio Demo',
      domain: 'evergreen-construction.vercel.app',
      url: 'https://evergreen-construction.vercel.app/home.html',
      description: 'A clean construction brand site with service positioning, project proof, and strong quote-first calls to action.',
      result: 'A polished contractor demo built to present credibility, capability, and conversion in one landing flow.',
      tags: ['Construction', 'Corporate site', 'Service pages', 'Portfolio demo'],
    },
  ],
  ar: [
    {
      id: 'vellora',
      name: 'VELLORA',
      category: 'صالة عرض فاخرة · الإمارات',
      domain: 'vellora-showroom.vercel.app',
      url: 'https://vellora-showroom.vercel.app/',
      description: 'تجربة صالة عرض فاخرة مبنية على مجموعات منتقاة، سرد بصري، وزيارات بإرشاد الكونسيرج.',
      result: 'رحلة عرض غامرة مع مجموعات وقطع مميزة وتقديم راقٍ — مباشرة كعرض أعمال.',
      tags: ['واجهة فاخرة', 'معرض', 'تجربة صالة', 'عرض أعمال'],
    },
    {
      id: 'restaurant',
      name: 'Restaurant Website',
      category: 'مشاوي حلال · الإمارات',
      domain: 'qdresturant.vercel.app',
      url: 'https://qdresturant.vercel.app/',
      description: 'قائمة حلال على الفحم، تدفق طلب، وعرض فروع متعددة مصمم لاكتشاف المطعم الحديث.',
      result: 'عرض مطعم جاهز للمحفظة مع أطباق مميزة، سلة طلب، وتخطيط فروع أنيق.',
      tags: ['طلب أونلاين', 'عرض القائمة', 'فروع متعددة', 'عرض أعمال'],
    },
    {
      id: 'evergreen',
      name: 'Evergreen Construction',
      category: 'مقاولات · عرض أعمال',
      domain: 'evergreen-construction.vercel.app',
      url: 'https://evergreen-construction.vercel.app/home.html',
      description: 'موقع احترافي لشركة مقاولات يعرض الخدمات والمشاريع ودعوات طلب العرض بشكل واضح.',
      result: 'عرض تعريفي أنيق مصمم لإظهار المصداقية والخبرة وتحويل الزيارات إلى طلبات.',
      tags: ['مقاولات', 'موقع شركة', 'عرض خدمات', 'عرض أعمال'],
    },
  ],
  zh: [
    {
      id: 'vellora',
      name: 'VELLORA',
      category: '高端展厅 · 阿联酋',
      domain: 'vellora-showroom.vercel.app',
      url: 'https://vellora-showroom.vercel.app/',
      description: '围绕精选系列、画廊叙事和礼宾式参观打造的高端展厅体验。',
      result: '沉浸式展厅旅程，含系列、精选单品与高端呈现——作为作品集演示上线。',
      tags: ['奢华界面', '画廊', '展厅动线', '作品演示'],
    },
    {
      id: 'restaurant',
      name: 'Restaurant Website',
      category: '清真炭烤 · 阿联酋',
      domain: 'qdresturant.vercel.app',
      url: 'https://qdresturant.vercel.app/',
      description: '炭烤清真菜单、下单流程与多门店展示，面向现代餐饮发现场景。',
      result: '可直接用于作品集的的餐饮演示，含招牌菜、购物车与门店布局。',
      tags: ['在线点餐', '菜单展示', '多门店', '作品演示'],
    },
    {
      id: 'evergreen',
      name: 'Evergreen Construction',
      category: '建筑公司 · 作品演示',
      domain: 'evergreen-construction.vercel.app',
      url: 'https://evergreen-construction.vercel.app/home.html',
      description: '一个干净利落的建筑品牌网站，展示服务定位、项目实力和强转化 CTA。',
      result: '一个精致的承包商演示站点，用于同时传达专业形象、能力与转化。',
      tags: ['建筑', '企业网站', '服务展示', '作品演示'],
    },
  ],
  ru: [
    {
      id: 'vellora',
      name: 'VELLORA',
      category: 'Премиальный шоурум · ОАЭ',
      domain: 'vellora-showroom.vercel.app',
      url: 'https://vellora-showroom.vercel.app/',
      description: 'Кураторский luxury-шоурум с коллекциями, визуальным сторителлингом и визитами с консьерж-сервисом.',
      result: 'Иммерсивный путь по шоуруму с коллекциями и избранными позициями — живое портфолио-демо.',
      tags: ['Люкс-интерфейс', 'Галерея', 'Шоурум', 'Портфолио-демо'],
    },
    {
      id: 'restaurant',
      name: 'Restaurant Website',
      category: 'Халяль-гриль · ОАЭ',
      domain: 'qdresturant.vercel.app',
      url: 'https://qdresturant.vercel.app/',
      description: 'Меню халяль на углях, оформление заказа и витрина нескольких локаций для современного ресторанного опыта.',
      result: 'Готовое ресторанное портфолио-демо с хитами меню, корзиной и аккуратной сеткой филиалов.',
      tags: ['Онлайн-заказ', 'Меню', 'Несколько локаций', 'Портфолио-демо'],
    },
    {
      id: 'evergreen',
      name: 'Evergreen Construction',
      category: 'Строительство · Портфолио-демо',
      domain: 'evergreen-construction.vercel.app',
      url: 'https://evergreen-construction.vercel.app/home.html',
      description: 'Чистый корпоративный сайт для строительной компании с акцентом на услугах, проектах и заявках.',
      result: 'Презентационное демо для подрядчика, которое передает надежность, опыт и умеет конвертировать.',
      tags: ['Строительство', 'Корпоративный сайт', 'Услуги', 'Портфолио-демо'],
    },
  ],
};

const WORK_COPY = {
  en: {
    tag: 'Selected work',
    title: 'Live systems, running in the real world.',
    lead: 'Client builds and portfolio demos — scroll inside each preview or open the live site.',
    live: 'LIVE',
    loading: 'Loading preview…',
    interact: 'Interactive preview',
    interactHint: 'Tap to load the live site',
    viewLive: 'View live site',
    seeMore: 'See more',
    seeLess: 'Show less',
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
    lead: 'مشاريع للعملاء وعروض أعمال — تصفح داخل كل معاينة أو افتح الموقع المباشر.',
    live: 'مباشر',
    loading: 'جاري تحميل المعاينة…',
    interact: 'معاينة تفاعلية',
    interactHint: 'اضغط لتحميل الموقع المباشر',
    viewLive: 'زيارة الموقع المباشر',
    seeMore: 'عرض المزيد',
    seeLess: 'عرض أقل',
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
    lead: '客户项目与作品集演示——在每个预览中滚动查看，或打开线上网站。',
    live: '在线',
    loading: '正在加载预览…',
    interact: '交互预览',
    interactHint: '点击后加载真实网站',
    viewLive: '访问线上网站',
    seeMore: '查看更多',
    seeLess: '收起',
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
    lead: 'Клиентские проекты и портфолио-демо — прокрутите внутри превью или откройте сайт.',
    live: 'LIVE',
    loading: 'Загрузка превью…',
    interact: 'Интерактивное превью',
    interactHint: 'Нажмите, чтобы загрузить сайт',
    viewLive: 'Открыть сайт',
    seeMore: 'Показать ещё',
    seeLess: 'Свернуть',
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

const VelloraMock = () => (
  <div className="iwork-mock iwork-mock--vellora" aria-hidden="true">
    <div className="iwork-mock-nav">
      <span className="iwork-mock-logo">VELLORA</span>
      <span className="iwork-mock-pill">Showroom</span>
    </div>
    <div className="iwork-mock-hero">
      <div className="iwork-mock-eyebrow">Premium Collections</div>
      <div className="iwork-mock-title">Where luxury<br />meets design.</div>
      <div className="iwork-mock-cta">Explore collections</div>
    </div>
    <div className="iwork-mock-strip">
      <div className="iwork-mock-frame iwork-mock-frame--tall" />
      <div className="iwork-mock-frame" />
      <div className="iwork-mock-frame" />
    </div>
  </div>
);

const RestaurantMock = () => (
  <div className="iwork-mock iwork-mock--restaurant" aria-hidden="true">
    <div className="iwork-mock-nav">
      <span className="iwork-mock-logo">RESTAURANT</span>
      <span className="iwork-mock-pill">100% Halal</span>
    </div>
    <div className="iwork-mock-hero">
      <div className="iwork-mock-eyebrow">Char-grilled · Fresh to order</div>
      <div className="iwork-mock-title">Plated<br />generously.</div>
      <div className="iwork-mock-cta">Order now</div>
    </div>
    <div className="iwork-mock-menu">
      {['Chicken rice', 'Kofta gyro', 'Loaded fries', 'Chapli kebab'].map((item) => (
        <span key={item}><i />{item}</span>
      ))}
    </div>
  </div>
);

const MockPreview = ({ projectId }) => {
  if (projectId === 'taj') return <TajMock />;
  if (projectId === 'evo') return <EvoMock />;
  if (projectId === 'vellora') return <VelloraMock />;
  if (projectId === 'restaurant') return <RestaurantMock />;
  return null;
};

const PREVIEW_IMAGES = {
  taj: '/assets/previews/taj-preview.png',
  evo: '/assets/previews/evo-preview.png',
  vellora: '/assets/previews/vellora-preview.png',
  restaurant: '/assets/previews/restaurant-preview.png',
  evergreen: '/assets/previews/evergreen-preview.png',
};

const StaticPreview = ({ project }) => {
  const src = PREVIEW_IMAGES[project.id];
  if (!src) return <MockPreview projectId={project.id} />;
  return (
    <img
      className="iwork-shot"
      src={src}
      alt={`${project.name} preview screenshot`}
      loading="lazy"
      decoding="async"
    />
  );
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

const BrowserPreview = ({ project, copy, useIframe, onActivate }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!useIframe) {
      setLoaded(false);
      setFailed(false);
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

  const showMock = !useIframe || failed;
  const showSkeleton = useIframe && !loaded && !failed;

  return (
    <div className="iwork-viewport">
      {showSkeleton && <PreviewSkeleton label={copy.loading} />}
      {showMock && <StaticPreview project={project} />}
      {!useIframe && (
        <button type="button" className="iwork-activate" onClick={onActivate}>
          <span className="iwork-activate-icon" aria-hidden="true">▶</span>
          <span className="iwork-activate-text">
            <span className="iwork-activate-title">{copy.interact}</span>
            <span className="iwork-activate-copy">{copy.interactHint}</span>
          </span>
        </button>
      )}
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

const InteractiveWorkPreview = ({ project, copy }) => {
  const [cardRef, visible] = useInView(0.08);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [hovered, setHovered] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  const allowHover = !reduced && !coarse;

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
        <BrowserPreview
          project={project}
          copy={copy}
          useIframe={useIframe}
          onActivate={() => setUseIframe(true)}
        />
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
  const [expanded, setExpanded] = useState(false);
  const featuredProjects = copy.projects.slice(0, INITIAL_WORK_VISIBLE);
  const moreProjects = copy.projects.slice(INITIAL_WORK_VISIBLE);
  const hasMore = moreProjects.length > 0;

  return (
    <>
      <div ref={headRef} className={`reveal${headVisible ? ' in' : ''}`}>
        <span className="tag">{copy.tag}</span>
        <h2 className="h2">{copy.title}</h2>
        <p className="lead">{copy.lead}</p>
      </div>
      <div className="iwork-grid">
        {featuredProjects.map((project, index) => (
          <InteractiveWorkPreview key={project.id} project={project} copy={copy} />
        ))}
      </div>
      {hasMore && !expanded && (
        <div className="iwork-more">
          <button
            type="button"
            className="btn btn-ghost iwork-more-btn"
            aria-expanded="false"
            onClick={() => setExpanded(true)}
          >
            {copy.seeMore}
          </button>
        </div>
      )}
      {expanded && hasMore && (
        <>
          <div className="iwork-grid iwork-grid--more">
            {moreProjects.map((project, index) => (
              <InteractiveWorkPreview
                key={project.id}
                project={project}
                copy={copy}
              />
            ))}
          </div>
          <div className="iwork-more">
            <button
              type="button"
              className="btn btn-ghost iwork-more-btn"
              aria-expanded="true"
              onClick={() => setExpanded(false)}
            >
              {copy.seeLess}
            </button>
          </div>
        </>
      )}
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
