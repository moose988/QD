/* ============================================================================
   QD Systems — homepage internationalization (EN / AR / ZH-Hans / RU)
   - Human-written translations (no machine translation).
   - Engine swaps [data-i18n] text, [data-i18n-html] markup, [data-i18n-ph]
     placeholders; sets <html lang/dir>; wires the language switcher; persists
     the choice; and broadcasts `qd:langchange` so the React work section and the
     demo chat can re-render.
   ========================================================================== */
(function () {
  'use strict';

  var SUPPORTED = ['en', 'ar', 'zh', 'ru'];
  var STORAGE_KEY = 'qd_lang';
  var FLAGS = { en: '🇬🇧', ar: '🇦🇪', zh: '🇨🇳', ru: '🇷🇺' };
  var CODES = { en: 'EN', ar: 'AR', zh: '中文', ru: 'RU' };

  /* ----------------------------------------------------------------------- */
  /* Dictionary                                                              */
  /* ----------------------------------------------------------------------- */
  var DICT = {
    /* nav */
    'nav.work':       { en: 'Work', ar: 'الأعمال', zh: '作品', ru: 'Работы' },
    'nav.demo':       { en: 'Live demo', ar: 'تجربة مباشرة', zh: '在线演示', ru: 'Демо' },
    'nav.build':      { en: 'What we build', ar: 'ماذا نبني', zh: '我们的服务', ru: 'Что мы создаём' },
    'nav.contact':    { en: 'Contact', ar: 'تواصل', zh: '联系我们', ru: 'Контакты' },
    'nav.navigate':   { en: 'Navigate', ar: 'التنقل', zh: '导航', ru: 'Меню' },

    'cta.book':       { en: 'Book a Free Call →', ar: 'احجز مكالمة مجانية ←', zh: '预约免费通话 →', ru: 'Бесплатный звонок →' },
    'cta.demo':       { en: 'Try the live demo', ar: 'جرّب النموذج المباشر', zh: '体验在线演示', ru: 'Попробовать демо' },

    /* hero */
    'hero.avail':     { en: 'Now booking · we take a limited number of builds at a time',
                        ar: 'نستقبل الحجوزات الآن · نعمل على عدد محدود من المشاريع في آنٍ واحد',
                        zh: '现正接受预约 · 我们同期仅承接有限数量的项目',
                        ru: 'Открыта запись · одновременно берём ограниченное число проектов' },
    'hero.h1':        {
      en: '<span class="metal shine hero-line"><span class="word">Websites</span> <span class="word">that</span> <span class="word">win.</span></span><span class="metal hero-line"><span class="word">Systems</span> <span class="word">that</span> <span class="word">run</span></span><span class="metal hero-line"><span class="word">your</span> <span class="word">business.</span></span>',
      ar: '<span class="metal shine hero-line"><span class="word">مواقع</span> <span class="word">تكسب.</span></span><span class="metal hero-line"><span class="word">وأنظمة</span> <span class="word">تُدير</span> <span class="word">عملك.</span></span>',
      zh: '<span class="metal shine hero-line"><span class="word">致胜的网站。</span></span><span class="metal hero-line"><span class="word">驱动业务的系统。</span></span>',
      ru: '<span class="metal shine hero-line"><span class="word">Сайты,</span> <span class="word">которые</span> <span class="word">побеждают.</span></span><span class="metal hero-line"><span class="word">Системы,</span> <span class="word">которые</span> <span class="word">ведут</span> <span class="word">ваш</span> <span class="word">бизнес.</span></span>'
    },
    'hero.check1':    { en: 'World-class custom websites — and the systems behind them. Never templates.',
                        ar: 'مواقع مخصصة بمستوى عالمي — والأنظمة التي تقف خلفها. بلا قوالب جاهزة.',
                        zh: '世界级的定制网站，以及背后的系统。绝不使用模板。',
                        ru: 'Кастомные сайты мирового класса — и системы за ними. Никаких шаблонов.' },
    'hero.check2':    { en: 'Booking, order tracking, automation, AI chat & dashboards.',
                        ar: 'حجوزات، تتبع طلبات، أتمتة، محادثة ذكية، ولوحات تحكم.',
                        zh: '预订、订单追踪、自动化、AI 聊天与数据看板。',
                        ru: 'Бронирование, отслеживание заказов, автоматизация, AI-чат и дашборды.' },
    'hero.check3':    { en: 'Bilingual EN / AR, built for the UAE.',
                        ar: 'ثنائي اللغة عربي / إنجليزي، مصمم للسوق الإماراتي.',
                        zh: '支持英语 / 阿拉伯语双语，专为阿联酋打造。',
                        ru: 'Двуязычно (EN / AR), создано для рынка ОАЭ.' },
    'hero.ctanote':   { en: 'Free 15-min call · no obligation · we reply within the hour',
                        ar: 'مكالمة مجانية مدتها ١٥ دقيقة · بلا أي التزام · نرد خلال ساعة',
                        zh: '免费 15 分钟通话 · 无任何义务 · 一小时内回复',
                        ru: 'Бесплатный 15-мин звонок · без обязательств · ответим в течение часа' },
    'hero.trust':     { en: 'Trusted by <b>Al Taj Al Malaki</b> · <b>Evo Creation</b> · live in the UAE',
                        ar: 'يثق بنا <b>التاج الملكي</b> · <b>Evo Creation</b> · نشطان في الإمارات',
                        zh: '信赖之选：<b>Al Taj Al Malaki</b> · <b>Evo Creation</b> · 已在阿联酋上线',
                        ru: 'Нам доверяют <b>Al Taj Al Malaki</b> · <b>Evo Creation</b> · уже работают в ОАЭ' },
    'hero.badge.demo.k': { en: 'Working demo', ar: 'نموذج عملي', zh: '真实演示', ru: 'Рабочее демо' },
    'hero.badge.demo.v': { en: '1–3 hrs', ar: '١–٣ ساعات', zh: '1–3 小时', ru: '1–3 часа' },
    'hero.badge.web.k':  { en: 'Website', ar: 'موقع', zh: '网站', ru: 'Сайт' },
    'hero.badge.web.v':  { en: 'In 24h', ar: 'خلال ٢٤ ساعة', zh: '24 小时内', ru: 'За 24 ч' },
    'hero.badge.sys.k':  { en: 'Full system', ar: 'نظام كامل', zh: '完整系统', ru: 'Полная система' },
    'hero.badge.sys.v':  { en: '1–3 days', ar: '١–٣ أيام', zh: '1–3 天', ru: '1–3 дня' },
    'hero.scroll':    { en: 'Scroll', ar: 'مرّر', zh: '向下滚动', ru: 'Листайте' },

    /* ghost marquee */
    'ghost.track':    {
      en: '<b>Websites</b><b class="fill">Booking systems</b><b>Order tracking</b><b class="fill">Automation</b><b>AI chat</b><b class="fill">Dashboards</b><b>Websites</b><b class="fill">Booking systems</b><b>Order tracking</b><b class="fill">Automation</b><b>AI chat</b><b class="fill">Dashboards</b>',
      ar: '<b>مواقع</b><b class="fill">أنظمة حجز</b><b>تتبع الطلبات</b><b class="fill">أتمتة</b><b>محادثة ذكية</b><b class="fill">لوحات تحكم</b><b>مواقع</b><b class="fill">أنظمة حجز</b><b>تتبع الطلبات</b><b class="fill">أتمتة</b><b>محادثة ذكية</b><b class="fill">لوحات تحكم</b><b>مواقع</b><b class="fill">أنظمة حجز</b><b>تتبع الطلبات</b><b class="fill">أتمتة</b><b>محادثة ذكية</b><b class="fill">لوحات تحكم</b><b>مواقع</b><b class="fill">أنظمة حجز</b><b>تتبع الطلبات</b><b class="fill">أتمتة</b><b>محادثة ذكية</b><b class="fill">لوحات تحكم</b>',
      zh: '<b>网站</b><b class="fill">预订系统</b><b>订单追踪</b><b class="fill">自动化</b><b>AI 聊天</b><b class="fill">数据看板</b><b>网站</b><b class="fill">预订系统</b><b>订单追踪</b><b class="fill">自动化</b><b>AI 聊天</b><b class="fill">数据看板</b><b>网站</b><b class="fill">预订系统</b><b>订单追踪</b><b class="fill">自动化</b><b>AI 聊天</b><b class="fill">数据看板</b><b>网站</b><b class="fill">预订系统</b><b>订单追踪</b><b class="fill">自动化</b><b>AI 聊天</b><b class="fill">数据看板</b>',
      ru: '<b>Сайты</b><b class="fill">Бронирование</b><b>Отслеживание заказов</b><b class="fill">Автоматизация</b><b>AI-чат</b><b class="fill">Дашборды</b><b>Сайты</b><b class="fill">Бронирование</b><b>Отслеживание заказов</b><b class="fill">Автоматизация</b><b>AI-чат</b><b class="fill">Дашборды</b><b>Сайты</b><b class="fill">Бронирование</b><b>Отслеживание заказов</b><b class="fill">Автоматизация</b><b>AI-чат</b><b class="fill">Дашборды</b><b>Сайты</b><b class="fill">Бронирование</b><b>Отслеживание заказов</b><b class="fill">Автоматизация</b><b>AI-чат</b><b class="fill">Дашборды</b>'
    },

    /* demo */
    'demo.tag':       { en: 'See it work', ar: 'شاهده يعمل', zh: '实际体验', ru: 'Посмотрите в действии' },
    'demo.h2':        { en: 'An assistant that books while you sleep.',
                        ar: 'مساعد يحجز بينما أنت نائم.',
                        zh: '一个在你睡觉时也能接单的助手。',
                        ru: 'Ассистент, который принимает заявки, пока вы спите.' },
    'demo.lead':      { en: 'Not a screenshot — a live example of the assistant handling a customer request.',
                        ar: 'ليست لقطة شاشة — مثال حي للمساعد وهو يتعامل مع طلب عميل.',
                        zh: '这不是截图，而是助手处理真实客户请求的实时演示。',
                        ru: 'Это не скриншот — живой пример того, как ассистент обрабатывает запрос клиента.' },
    'demo.bartitle':  { en: 'QD Booking Assistant', ar: 'مساعد الحجز QD', zh: 'QD 预订助手', ru: 'QD-ассистент бронирования' },
    'demo.live':      { en: 'LIVE', ar: 'مباشر', zh: '实时', ru: 'LIVE' },
    'demo.footnote':  {
      en: 'Tap a question above to try it. On the live site, this same assistant — bilingual EN/AR, capturing every lead — answers <i>your</i> customers 24/7.',
      ar: 'اضغط على سؤال أعلاه لتجربته. على الموقع المباشر، هذا المساعد نفسه — ثنائي اللغة عربي/إنجليزي، يلتقط كل عميل محتمل — يرد على عملائك على مدار الساعة.',
      zh: '点击上方任意问题即可体验。在正式网站上，这个助手（支持英 / 阿双语、捕获每一条线索）全天候为<i>你的</i>客户解答。',
      ru: 'Нажмите на вопрос выше, чтобы попробовать. На рабочем сайте этот же ассистент — двуязычный (EN/AR), фиксирующий каждую заявку — отвечает <i>вашим</i> клиентам круглосуточно.'
    },

    /* proof */
    'proof.tag':      { en: 'Trusted across the UAE', ar: 'موثوق به في الإمارات', zh: '受阿联酋各地信赖', ru: 'Нам доверяют по всему ОАЭ' },
    'proof.stat1':    { en: 'Brands live in the UAE', ar: 'علامات تجارية تعمل في الإمارات', zh: '已上线的阿联酋品牌', ru: 'Брендов работает в ОАЭ' },
    'proof.stat2':    { en: 'Website turnaround', ar: 'مدة تسليم الموقع', zh: '网站交付时间', ru: 'Срок запуска сайта' },
    'proof.stat3':    { en: 'Custom-built, never templates', ar: 'مبنيّ خصيصاً، بلا قوالب جاهزة', zh: '纯定制，绝无模板', ru: 'Только кастом, без шаблонов' },
    'proof.stat4':    { en: 'Reply time', ar: 'زمن الرد', zh: '回复时间', ru: 'Время ответа' },

    /* statement */
    'statement':      {
      en: '<span class="metal">You don\'t need <span class="muted">more complexity.</span></span><br><span class="metal">You need a system that just works.</span>',
      ar: '<span class="metal">لست بحاجة إلى <span class="muted">مزيد من التعقيد.</span></span><br><span class="metal">أنت بحاجة إلى نظام يؤدي عمله دون تعقيد.</span>',
      zh: '<span class="metal">你需要的不是<span class="muted">更多复杂性。</span></span><br><span class="metal">而是一个真正好用的系统。</span>',
      ru: '<span class="metal">Вам не нужна <span class="muted">лишняя сложность.</span></span><br><span class="metal">Нужна система, которая просто работает.</span>'
    },

    /* build */
    'build.tag':      { en: 'What we build', ar: 'ماذا نبني', zh: '我们的服务', ru: 'Что мы создаём' },
    'build.h2':       { en: 'Three things, done properly.', ar: 'ثلاثة أشياء، نُتقنها.', zh: '三件事，做到极致。', ru: 'Три вещи, сделанные как надо.' },
    'build.lead':     { en: 'Websites better than the competition — plus the systems that make them earn.',
                        ar: 'مواقع أفضل من المنافسين — بالإضافة إلى الأنظمة التي تجعلها تربح.',
                        zh: '比对手更出色的网站，加上让它们真正赚钱的系统。',
                        ru: 'Сайты лучше, чем у конкурентов, — плюс системы, которые приносят прибыль.' },
    'build.o1.h':     { en: 'Websites that win', ar: 'مواقع تكسب', zh: '致胜的网站', ru: 'Сайты, которые побеждают' },
    'build.o1.p':     { en: 'Premium, fast, custom-built sites that make customers trust you in seconds. Never a template.',
                        ar: 'مواقع فاخرة وسريعة ومبنية خصيصاً تجعل العملاء يثقون بك في ثوانٍ. بلا قوالب جاهزة أبداً.',
                        zh: '高端、快速、纯定制的网站，让客户在几秒内信任你。绝不使用模板。',
                        ru: 'Премиальные, быстрые, полностью кастомные сайты, которым клиент доверяет за секунды. Никаких шаблонов.' },
    'build.o2.h':     { en: 'Systems that run it', ar: 'أنظمة تُشغّلها', zh: '驱动业务的系统', ru: 'Системы, которые всё ведут' },
    'build.o2.p':     { en: 'Booking, order tracking, payments, portals and dashboards — the engine your business runs on.',
                        ar: 'حجوزات، تتبع طلبات، مدفوعات، بوابات ولوحات تحكم — المحرك الذي يُشغّل عملك.',
                        zh: '预订、订单追踪、支付、门户和数据看板——驱动你业务运转的引擎。',
                        ru: 'Бронирование, отслеживание заказов, платежи, порталы и дашборды — движок вашего бизнеса.' },
    'build.o3.h':     { en: 'Automation & AI chat', ar: 'الأتمتة والمحادثة الذكية', zh: '自动化与 AI 聊天', ru: 'Автоматизация и AI-чат' },
    'build.o3.p':     { en: 'WhatsApp flows, lead capture and an assistant that answers and books while you sleep.',
                        ar: 'تدفقات واتساب، التقاط العملاء، ومساعد يرد ويحجز بينما أنت نائم.',
                        zh: 'WhatsApp 自动流程、线索捕获，以及在你睡觉时也能回复和接单的助手。',
                        ru: 'WhatsApp-сценарии, захват заявок и ассистент, который отвечает и бронирует, пока вы спите.' },

    /* why / compare */
    'why.tag':        { en: 'Why QD', ar: 'لماذا QD', zh: '为什么选择 QD', ru: 'Почему QD' },
    'why.h2':         { en: 'A pretty page, or a system that earns?',
                        ar: 'صفحة جميلة، أم نظام يربح؟',
                        zh: '是漂亮的页面，还是能赚钱的系统？',
                        ru: 'Красивая страница или система, которая зарабатывает?' },
    'why.lead':       { en: 'Most studios stop at the page. We build what happens after the click.',
                        ar: 'معظم الاستوديوهات تتوقف عند الصفحة. نحن نبني ما يحدث بعد النقرة.',
                        zh: '多数工作室止步于页面。我们打造点击之后真正发生的一切。',
                        ru: 'Большинство студий останавливаются на странице. Мы строим то, что происходит после клика.' },
    'why.them.title': { en: 'A typical studio', ar: 'استوديو تقليدي', zh: '普通工作室', ru: 'Обычная студия' },
    'why.them1':      { en: 'Hands you a page, then disappears', ar: 'يسلّمك صفحة ثم يختفي', zh: '交付页面后便消失', ru: 'Отдаёт страницу и исчезает' },
    'why.them2':      { en: 'Templates dressed up as "custom"', ar: 'قوالب جاهزة تُباع بوصفها "تصميم مخصص"', zh: '把模板包装成"定制"', ru: 'Шаблоны под видом «кастома»' },
    'why.them3':      { en: 'No booking, tracking or automation', ar: 'بلا حجز أو تتبع أو أتمتة', zh: '没有预订、追踪或自动化', ru: 'Без бронирования, отслеживания и автоматизации' },
    'why.them4':      { en: 'Weeks of back-and-forth', ar: 'أسابيع من المراسلات المتكررة', zh: '数周来回沟通', ru: 'Недели переписки' },
    'why.them5':      { en: 'English only', ar: 'إنجليزي فقط', zh: '仅支持英文', ru: 'Только английский' },
    'why.us.badge':   { en: 'You', ar: 'أنت', zh: '你', ru: 'Вы' },
    'why.us1':        { en: 'A site plus the system that runs your business', ar: 'موقع بالإضافة إلى النظام الذي يُدير عملك', zh: '网站，外加驱动你业务的系统', ru: 'Сайт плюс система, которая ведёт ваш бизнес' },
    'why.us2':        { en: '100% custom-coded — never a template', ar: 'مبرمَج خصيصاً ١٠٠٪ — بلا قوالب جاهزة', zh: '100% 纯手工编码——绝无模板', ru: '100% кастомный код — никаких шаблонов' },
    'why.us3':        { en: 'Booking, tracking, automation & AI chat built in', ar: 'حجز وتتبع وأتمتة ومحادثة ذكية مدمجة', zh: '内置预订、追踪、自动化与 AI 聊天', ru: 'Бронирование, отслеживание, автоматизация и AI-чат — в комплекте' },
    'why.us4':        { en: 'Live in days, timeline agreed in writing', ar: 'جاهز خلال أيام، بجدول زمني متفق عليه كتابياً', zh: '数日内上线，时间表书面约定', ru: 'Запуск за дни, сроки зафиксированы письменно' },
    'why.us5':        { en: 'Bilingual EN / AR, built for the UAE', ar: 'ثنائي اللغة عربي/إنجليزي، مصمم للإمارات', zh: '支持英 / 阿双语，专为阿联酋打造', ru: 'Двуязычно (EN / AR), создано для ОАЭ' },

    /* how */
    'how.tag':        { en: 'What happens next', ar: 'ماذا يحدث بعد ذلك', zh: '接下来会怎样', ru: 'Что дальше' },
    'how.h2':         { en: 'From hello to live in four steps.', ar: 'من أول تواصل إلى الإطلاق في أربع خطوات.', zh: '从初次接触到上线，只需四步。', ru: 'От «привет» до запуска за четыре шага.' },
    'how.lead':       { en: 'No mystery, no endless meetings — here\'s exactly how it goes.',
                        ar: 'لا غموض، لا اجتماعات لا تنتهي — إليك بالضبط كيف تسير الأمور.',
                        zh: '没有谜团，没有没完没了的会议——下面就是具体流程。',
                        ru: 'Никаких загадок и бесконечных совещаний — вот как всё проходит.' },
    'how.s1.h':       { en: 'Free call', ar: 'مكالمة مجانية', zh: '免费通话', ru: 'Бесплатный звонок' },
    'how.s1.p':       { en: '15 minutes. You tell us the problem; we tell you straight if we can solve it.',
                        ar: '١٥ دقيقة. تخبرنا بالمشكلة، ونخبرك بصراحة إن كنا نستطيع حلها.',
                        zh: '15 分钟。你说明问题，我们直接告诉你能否解决。',
                        ru: '15 минут. Вы рассказываете о задаче — мы честно говорим, решим ли её.' },
    'how.s2.h':       { en: 'Fixed quote', ar: 'عرض سعر ثابت', zh: '固定报价', ru: 'Фиксированная смета' },
    'how.s2.p':       { en: 'One clear scope and price in writing — no hourly games, no surprises.',
                        ar: 'نطاق وسعر واضح كتابياً — بلا ألاعيب بالساعة، بلا مفاجآت.',
                        zh: '一份清晰的范围和价格，白纸黑字——不按小时玩花样，没有意外。',
                        ru: 'Чёткий объём и цена письменно — без почасовых игр и сюрпризов.' },
    'how.s3.h':       { en: 'We build', ar: 'نبني', zh: '我们开发', ru: 'Мы создаём' },
    'how.s3.p':       { en: 'Demo in hours, site in 24h, full system in 1–3 days. You watch it take shape.',
                        ar: 'نموذج خلال ساعات، موقع خلال ٢٤ ساعة، نظام كامل خلال ١–٣ أيام. تشاهده يتشكّل.',
                        zh: '数小时出演示，24 小时出网站，1–3 天出完整系统。你亲眼见证它成形。',
                        ru: 'Демо за часы, сайт за 24 ч, полная система за 1–3 дня. Вы видите, как всё складывается.' },
    'how.s4.h':       { en: 'Go live', ar: 'الإطلاق', zh: '正式上线', ru: 'Запуск' },
    'how.s4.p':       { en: 'We launch, test and support it. You pay the final invoice only when you\'re happy.',
                        ar: 'نطلق ونختبر وندعم. تدفع الفاتورة النهائية فقط عندما تكون راضياً.',
                        zh: '我们上线、测试并提供支持。只有在你满意时才支付尾款。',
                        ru: 'Мы запускаем, тестируем и поддерживаем. Финальный счёт вы оплачиваете, только когда довольны.' },

    /* faq */
    'faq.tag':        { en: 'Questions', ar: 'أسئلة', zh: '常见问题', ru: 'Вопросы' },
    'faq.h2':         { en: 'Everything owners ask us.', ar: 'كل ما يسألنا عنه أصحاب الأعمال.', zh: '老板们最常问的一切。', ru: 'Всё, о чём спрашивают владельцы.' },
    'faq.q1':         { en: 'How fast can you really deliver?', ar: 'كم تستغرقون فعلاً في التسليم؟', zh: '你们到底能多快交付？', ru: 'Насколько быстро вы реально сдаёте?' },
    'faq.a1':         { en: 'A working demo in 1–3 hours, a full website in 24 hours, and a complete system in 1–3 days — depending on scope. We commit to your exact timeline in writing before we start.',
                        ar: 'نموذج عملي خلال ١–٣ ساعات، موقع كامل خلال ٢٤ ساعة، ونظام متكامل خلال ١–٣ أيام — حسب النطاق. نلتزم بجدولك الزمني المحدد موثّقاً كتابياً قبل أن نبدأ.',
                        zh: '视范围而定：1–3 小时出可用演示，24 小时出完整网站，1–3 天出完整系统。开工前，我们会以书面形式承诺你的确切时间表。',
                        ru: 'Рабочее демо за 1–3 часа, полный сайт за 24 часа, готовая система за 1–3 дня — в зависимости от объёма. Перед стартом письменно фиксируем точные сроки.' },
    'faq.q2':         { en: 'What if I don\'t like it?', ar: 'ماذا لو لم يعجبني؟', zh: '如果我不满意怎么办？', ru: 'А если мне не понравится?' },
    'faq.a2':         { en: 'You only pay the final invoice once it\'s live and you\'re happy. We refine until it\'s right.',
                        ar: 'تدفع الفاتورة النهائية فقط بعد الإطلاق وعندما تكون راضياً. نُحسّنه حتى ترضى عنه تماماً.',
                        zh: '只有在上线且你满意之后，才支付尾款。我们会不断打磨，直到做对为止。',
                        ru: 'Финальный счёт вы платите, только когда всё запущено и вы довольны. Дорабатываем, пока не будет идеально.' },
    'faq.q3':         { en: 'Do you build in Arabic?', ar: 'هل تبنون بالعربية؟', zh: '你们做阿拉伯语网站吗？', ru: 'Вы делаете на арабском?' },
    'faq.a3':         { en: 'Yes — every build is bilingual EN/AR with full right-to-left support, made for the UAE market.',
                        ar: 'نعم — كل مشروع ثنائي اللغة عربي/إنجليزي مع دعم كامل للكتابة من اليمين لليسار، مصمم للسوق الإماراتي.',
                        zh: '是的——每个项目都支持英语 / 阿拉伯语双语，并完整支持从右到左排版，专为阿联酋市场打造。',
                        ru: 'Да — каждый проект двуязычный (EN/AR) с полной поддержкой письма справа налево, под рынок ОАЭ.' },
    'faq.q4':         { en: 'Is it really custom, or a template?', ar: 'هل هو مخصص فعلاً أم قالب؟', zh: '真的是定制，还是模板？', ru: 'Это правда кастом или шаблон?' },
    'faq.a4':         { en: '100% custom. We design and code from scratch around your business — no themes, no page builders.',
                        ar: 'مخصص ١٠٠٪. نصمم ونبرمج من الصفر حول عملك — بلا ثيمات، بلا أدوات بناء صفحات.',
                        zh: '100% 定制。我们围绕你的业务从零设计与编码——不用主题，不用页面搭建器。',
                        ru: '100% кастом. Проектируем и пишем код с нуля под ваш бизнес — без тем и конструкторов.' },
    'faq.q5':         { en: 'What does it cost?', ar: 'كم التكلفة؟', zh: '费用是多少？', ru: 'Сколько это стоит?' },
    'faq.a5':         {
      en: 'Every project is different, so we don\'t do one-size-fits-all pricing. You get <b style="color:#e8e8ec">one fixed, itemized quote up front</b> — agreed in writing before we start. No hourly games, no hidden fees, and you only pay the final invoice once you\'re happy. Most quotes go out the same day as your free call.',
      ar: 'كل مشروع مختلف، لذلك لا نعتمد تسعيراً موحداً للجميع. تحصل على <b style="color:#e8e8ec">عرض سعر واحد ثابت ومفصّل مقدماً</b> — متفق عليه كتابياً قبل أن نبدأ. بلا تسعير بالساعة، بلا رسوم خفية، ولا تدفع الفاتورة النهائية إلا عند رضاك. معظم العروض تصدر في نفس يوم مكالمتك المجانية.',
      zh: '每个项目都不一样，所以我们不做一刀切的定价。你会预先收到<b style="color:#e8e8ec">一份固定、逐项列明的报价</b>——在开工前以书面确认。不按小时玩花样，没有隐藏费用，满意后才付尾款。多数报价在免费通话当天即可发出。',
      ru: 'Каждый проект уникален, поэтому у нас нет универсального прайса. Вы заранее получаете <b style="color:#e8e8ec">одну фиксированную детализированную смету</b> — согласованную письменно до старта. Без почасовых игр и скрытых платежей, а финальный счёт вы оплачиваете, только когда довольны. Большинство смет отправляем в день бесплатного звонка.'
    },

    /* contact */
    'contact.h2':     {
      en: 'Tell us the problem.<br>We\'ll build the system.',
      ar: 'أخبرنا بالمشكلة.<br>سنبني النظام.',
      zh: '告诉我们问题，<br>我们来打造系统。',
      ru: 'Расскажите о задаче.<br>Мы построим систему.'
    },
    'contact.sub':    { en: 'One free 15-minute call. You leave with a clear plan, timeline, and price — most quotes go out the same day.',
                        ar: 'مكالمة مجانية واحدة مدتها ١٥ دقيقة. تخرج منها بخطة واضحة وجدول زمني وسعر — ومعظم العروض تصدر في نفس اليوم.',
                        zh: '一次免费的 15 分钟通话。你将获得清晰的方案、时间表和价格——多数报价当天即可发出。',
                        ru: 'Один бесплатный 15-минутный звонок. Вы уходите с понятным планом, сроками и ценой — большинство смет отправляем в тот же день.' },
    'contact.step1':  { en: 'Book', ar: 'احجز', zh: '预约', ru: 'Запись' },
    'contact.step2':  { en: '15-min call', ar: 'مكالمة ١٥ دقيقة', zh: '15 分钟通话', ru: '15-мин звонок' },
    'contact.step3':  { en: 'Your plan & fixed price', ar: 'خطتك وسعر ثابت', zh: '你的方案与固定价格', ru: 'Ваш план и фикс-цена' },
    'contact.note':   { en: 'Free · no obligation · we reply within the hour',
                        ar: 'مجاناً · دون التزام · نرد خلال ساعة',
                        zh: '免费 · 无义务 · 一小时内回复',
                        ru: 'Бесплатно · без обязательств · ответим в течение часа' },
    'contact.wa':     { en: 'Prefer WhatsApp? Message us →', ar: 'هل تُفضّل واتساب؟ راسلنا ←', zh: '更喜欢 WhatsApp？给我们发消息 →', ru: 'Предпочитаете WhatsApp? Напишите →' },
    'contact.g1':     { en: 'Timeline agreed in writing', ar: 'جدول زمني متفق عليه كتابياً', zh: '时间表书面约定', ru: 'Сроки зафиксированы письменно' },
    'contact.g2':     { en: 'Pay the final invoice only when you\'re happy', ar: 'ادفع الفاتورة النهائية فقط عند رضاك', zh: '满意后才付尾款', ru: 'Платите финальный счёт, только когда довольны' },
    'contact.g3':     { en: '100% custom — no templates', ar: 'مخصص ١٠٠٪ — بلا قوالب جاهزة', zh: '100% 定制——无模板', ru: '100% кастом — без шаблонов' },
    'contact.eyebrow':{ en: 'QD SYSTEMS · START A BUILD', ar: 'كيودي سيستمز · ابدأ مشروعك', zh: 'QD SYSTEMS · 开始构建', ru: 'QD SYSTEMS · НАЧАТЬ ПРОЕКТ' },
    'contact.whn':    { en: 'What happens next', ar: 'ماذا يحدث بعد ذلك', zh: '接下来的流程', ru: 'Что происходит дальше' },
    'contact.ts1':    { en: 'Book a free call', ar: 'احجز مكالمة مجانية', zh: '预约免费电话', ru: 'Записаться на звонок' },
    'contact.ts1s':   { en: 'Takes 15 min · free', ar: '١٥ دقيقة فقط · مجانية', zh: '仅需 15 分钟 · 免费', ru: '15 мин · бесплатно' },
    'contact.ts2':    { en: 'We review & quote', ar: 'نراجع ونحدد النطاق', zh: '我们审核并报价', ru: 'Изучаем и делаем оффер' },
    'contact.ts2s':   { en: 'Fixed price in writing', ar: 'عرض سعر ثابت كتابياً', zh: '书面固定报价', ru: 'Фиксированная цена письменно' },
    'contact.ts3':    { en: 'You go live', ar: 'موقعك يذهب للإنترنت', zh: '您的网站上线', ru: 'Вы запускаетесь' },
    'contact.ts3s':   { en: 'Demo in hours', ar: 'ديمو في ساعات', zh: '几小时内演示', ru: 'Демо за несколько часов' },
    'contact.reply':  { en: 'Reply time', ar: 'وقت الرد', zh: '回复时间', ru: 'Время ответа' },

    /* footer */
    'footer.copy':    { en: '© 2026 QD Systems · Built in the UAE', ar: '© ٢٠٢٦ QD Systems · صُنع في الإمارات', zh: '© 2026 QD Systems · 在阿联酋打造', ru: '© 2026 QD Systems · Сделано в ОАЭ' },
    'footer.privacy': { en: 'Privacy Policy', ar: 'سياسة الخصوصية', zh: '隐私政策', ru: 'Конфиденциальность' },
    'footer.terms':   { en: 'Terms of Service', ar: 'شروط الخدمة', zh: '服务条款', ru: 'Условия' },

    /* booking modal */
    'book.title':     { en: 'Book your free call', ar: 'احجز مكالمتك المجانية', zh: '预约你的免费通话', ru: 'Запишитесь на бесплатный звонок' },
    'book.sub':       { en: '15 minutes, no obligation. Drop your details and we\'ll email you a Google Meet link — usually within the hour.',
                        ar: '١٥ دقيقة، دون التزام. اترك بياناتك وسنرسل لك رابط Google Meet عبر البريد — عادة خلال ساعة.',
                        zh: '15 分钟，无任何义务。留下你的信息，我们会通过邮件发送 Google Meet 链接——通常在一小时内。',
                        ru: '15 минут, без обязательств. Оставьте данные — пришлём ссылку на Google Meet по почте, обычно в течение часа.' },
    'book.name':      { en: 'Name', ar: 'الاسم', zh: '姓名', ru: 'Имя' },
    'book.name.ph':   { en: 'e.g. Ahmed', ar: 'مثال: أحمد', zh: '例如：Ahmed', ru: 'напр. Ахмед' },
    'book.phone':     { en: 'Phone number', ar: 'رقم الهاتف', zh: '电话号码', ru: 'Телефон' },
    'book.email':     { en: 'Email', ar: 'البريد الإلكتروني', zh: '邮箱', ru: 'Эл. почта' },
    'book.purpose':   { en: 'What\'s it about?', ar: 'ما الموضوع؟', zh: '关于什么？', ru: 'О чём речь?' },
    'book.opt1':      { en: 'A new website', ar: 'موقع جديد', zh: '一个新网站', ru: 'Новый сайт' },
    'book.opt2':      { en: 'A full system (booking / automation / dashboard)', ar: 'نظام كامل (حجز / أتمتة / لوحة تحكم)', zh: '完整系统（预订 / 自动化 / 看板）', ru: 'Полная система (бронь / автоматизация / дашборд)' },
    'book.opt3':      { en: 'Not sure yet — I\'d like advice', ar: 'لست متأكداً بعد — أريد استشارة', zh: '还不确定——想听听建议', ru: 'Пока не уверен — нужен совет' },
    'book.date':      { en: 'Preferred date', ar: 'التاريخ المفضل', zh: '期望日期', ru: 'Желаемая дата' },
    'book.time':      { en: 'Preferred time', ar: 'الوقت المفضل', zh: '期望时间', ru: 'Желаемое время' },
    'book.submit':    { en: 'Confirm — send my Meet link →', ar: 'تأكيد — أرسل لي رابط الاجتماع ←', zh: '确认——发送我的会议链接 →', ru: 'Подтвердить — прислать ссылку →' },
    'book.hint':      { en: 'Free · no obligation · your link arrives by email',
                        ar: 'مجاناً · دون التزام · يصلك الرابط بالبريد',
                        zh: '免费 · 无义务 · 链接将通过邮件送达',
                        ru: 'Бесплатно · без обязательств · ссылка придёт на почту' },
    'book.error':     { en: 'Something went wrong sending your booking. Please try again — or message us on WhatsApp and we\'ll confirm your call there:',
                        ar: 'حدث خطأ أثناء إرسال حجزك. حاول مرة أخرى — أو راسلنا على واتساب وسنؤكد مكالمتك هناك:',
                        zh: '发送预约时出了点问题。请重试——或通过 WhatsApp 联系我们，我们会在那边为你确认通话：',
                        ru: 'Не удалось отправить вашу запись. Попробуйте ещё раз — или напишите нам в WhatsApp, и мы подтвердим звонок там:' },
    'book.done.title':{ en: 'You\'re booked', ar: 'تم تأكيد حجزك!', zh: '预约成功', ru: 'Вы записаны' },
    'book.done.msg':  { en: 'Check {email} — your Google Meet link is on its way, usually within the hour.',
                        ar: 'راجع {email} — رابط Google Meet في طريقه إليك، عادة خلال ساعة.',
                        zh: '请查收 {email} —— 你的 Google Meet 链接正在发送，通常一小时内到达。',
                        ru: 'Проверьте {email} — ссылка на Google Meet уже в пути, обычно в течение часа.' },

    /* intro */
    'intro.loading':  { en: 'Loading experience', ar: 'جارٍ تحميل التجربة', zh: '正在加载体验', ru: 'Загрузка…' }
  };

  /* ----------------------------------------------------------------------- */
  /* Demo-chat data (consumed by the inline demo script in index.html)       */
  /* ----------------------------------------------------------------------- */
  window.QD_DEMO = {
    en: {
      flows: {
        intro: [{ who: 'them', t: 'Hi! Do you have round tables for 200 guests this weekend?' }, { who: 'us', t: 'Yes — 25 round tables available Sat. Want me to hold them?' }, { who: 'them', t: 'Please. And can someone call me?' }, { who: 'us', t: 'Done ✅ Booked a callback for today 4:00 PM.' }, { book: 'Callback booked automatically — while you were reading this.' }],
        avail: [{ who: 'us', t: 'Which date are you looking at?' }, { who: 'them', t: 'Next Friday evening.' }, { who: 'us', t: 'We have availability Fri evening. Shall I pencil you in and send a quote?' }, { book: 'Slot held for Friday — quote on its way.' }],
        quote: [{ who: 'us', t: 'Tell me the package and guest count and I\'ll price it instantly.' }, { who: 'them', t: 'Gold package, 150 guests.' }, { who: 'us', t: 'Gold · 150 guests → AED 18,500, all-in. Want me to lock it?' }, { book: 'Instant quote delivered — no waiting on email.' }],
        lang: [{ who: 'them', t: 'Can you build the site in Arabic?' }, { who: 'us', t: 'Of course — we build in Arabic and English with full RTL support.' }, { book: 'Bilingual EN / AR — handled natively.' }]
      },
      chips: [{ k: 'avail', t: '📅 Check availability' }, { k: 'quote', t: '💸 Get an instant quote' }, { k: 'lang', t: '🌐 Need it in Arabic?' }],
      bookChip: 'Book a free call →'
    },
    ar: {
      flows: {
        intro: [{ who: 'them', t: 'مرحباً! عندكم طاولات دائرية لـ٢٠٠ ضيف هذا الأسبوع؟' }, { who: 'us', t: 'نعم — ٢٥ طاولة دائرية متاحة السبت. أحجزها لك؟' }, { who: 'them', t: 'تمام. وممكن أحد يتصل فيني؟' }, { who: 'us', t: 'تم ✅ حجزت لك مكالمة اليوم الساعة ٤:٠٠ مساءً.' }, { book: 'تم حجز المكالمة تلقائياً — بينما كنت تقرأ هذا.' }],
        avail: [{ who: 'us', t: 'أي تاريخ تفكر فيه؟' }, { who: 'them', t: 'مساء الجمعة القادمة.' }, { who: 'us', t: 'لدينا توفر مساء الجمعة. أحجز لك مبدئياً وأرسل عرض سعر؟' }, { book: 'تم حجز موعد الجمعة — العرض في الطريق.' }],
        quote: [{ who: 'us', t: 'أخبرني بالباقة وعدد الضيوف وأسعّرها فوراً.' }, { who: 'them', t: 'الباقة الذهبية، ١٥٠ ضيف.' }, { who: 'us', t: 'الذهبية · ١٥٠ ضيف ← ١٨٬٥٠٠ درهم شاملة. أثبّتها؟' }, { book: 'عرض سعر فوري — دون انتظار البريد.' }],
        lang: [{ who: 'them', t: 'تقدرون تسوون الموقع بالعربي؟' }, { who: 'us', t: 'أكيد — نبنيه بالعربي والإنجليزي مع دعم كامل للكتابة من اليمين لليسار.' }, { book: 'ثنائي اللغة عربي/إنجليزي — مدعوم أصلاً.' }]
      },
      chips: [{ k: 'avail', t: '📅 تحقق من التوفر' }, { k: 'quote', t: '💸 احصل على عرض فوري' }, { k: 'lang', t: '🌐 تريده بالعربي؟' }],
      bookChip: 'احجز مكالمة مجانية ←'
    },
    zh: {
      flows: {
        intro: [{ who: 'them', t: '你好！这周末有能坐 200 位客人的圆桌吗？' }, { who: 'us', t: '有的——周六有 25 张圆桌可用。需要我先帮你留着吗？' }, { who: 'them', t: '麻烦了。能安排人给我打电话吗？' }, { who: 'us', t: '搞定 ✅ 已为你预约今天下午 4:00 回电。' }, { book: '回电已自动预约——就在你阅读这段话的时候。' }],
        avail: [{ who: 'us', t: '你看的是哪一天？' }, { who: 'them', t: '下周五晚上。' }, { who: 'us', t: '周五晚上有空档。要我先帮你留位并发报价吗？' }, { book: '周五时段已保留——报价马上送达。' }],
        quote: [{ who: 'us', t: '告诉我套餐和人数，我立刻报价。' }, { who: 'them', t: '黄金套餐，150 位。' }, { who: 'us', t: '黄金套餐 · 150 位 → 全包 18,500 迪拉姆。要锁定吗？' }, { book: '即时报价——无需等待邮件。' }],
        lang: [{ who: 'them', t: '你们能做中文版网站吗？' }, { who: 'us', t: '可以——我们的网站默认支持英语和阿拉伯语双语，中文等其他语言可按需添加。' }, { book: '多语言支持——按需提供。' }]
      },
      chips: [{ k: 'avail', t: '📅 查询空档' }, { k: 'quote', t: '💸 获取即时报价' }, { k: 'lang', t: '🌐 需要中文版？' }],
      bookChip: '预约免费通话 →'
    },
    ru: {
      flows: {
        intro: [{ who: 'them', t: 'Здравствуйте! Есть круглые столы на 200 гостей в эти выходные?' }, { who: 'us', t: 'Да — 25 круглых столов свободны в субботу. Забронировать для вас?' }, { who: 'them', t: 'Да, пожалуйста. И может кто-нибудь позвонить мне?' }, { who: 'us', t: 'Готово ✅ Записал обратный звонок на сегодня в 16:00.' }, { book: 'Обратный звонок забронирован автоматически — пока вы это читали.' }],
        avail: [{ who: 'us', t: 'На какую дату смотрите?' }, { who: 'them', t: 'Следующая пятница, вечер.' }, { who: 'us', t: 'В пятницу вечером есть места. Забронировать и прислать смету?' }, { book: 'Слот на пятницу зарезервирован — смета в пути.' }],
        quote: [{ who: 'us', t: 'Назовите пакет и число гостей — посчитаю мгновенно.' }, { who: 'them', t: 'Золотой пакет, 150 гостей.' }, { who: 'us', t: 'Золотой · 150 гостей → 18 500 AED, всё включено. Зафиксировать?' }, { book: 'Мгновенная смета — без ожидания письма.' }],
        lang: [{ who: 'them', t: 'Вы можете сделать сайт на русском?' }, { who: 'us', t: 'Да — наши сайты по умолчанию двуязычные (английский / арабский), а русский и другие языки добавляем по запросу.' }, { book: 'Мультиязычность — по запросу.' }]
      },
      chips: [{ k: 'avail', t: '📅 Проверить даты' }, { k: 'quote', t: '💸 Мгновенная смета' }, { k: 'lang', t: '🌐 Нужно на русском?' }],
      bookChip: 'Бесплатный звонок →'
    }
  };

  /* ----------------------------------------------------------------------- */
  /* Engine                                                                  */
  /* ----------------------------------------------------------------------- */
  function normalize(l) { return SUPPORTED.indexOf(l) >= 0 ? l : 'en'; }

  function currentLang() {
    var l = window.QD_LANG;
    if (!l) {
      try { l = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (!l) { var n = (navigator.language || 'en').toLowerCase(); l = n.indexOf('ar') === 0 ? 'ar' : n.indexOf('zh') === 0 ? 'zh' : n.indexOf('ru') === 0 ? 'ru' : 'en'; }
    }
    return normalize(l);
  }

  // Public string getter for inline scripts (e.g. booking confirmation).
  window.qdT = function (key) {
    var entry = DICT[key];
    return entry ? (entry[currentLang()] || entry.en) : '';
  };

  function applyTranslations(lang) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var e = DICT[el.getAttribute('data-i18n')];
      if (e && (e[lang] || e.en) != null) el.textContent = e[lang] || e.en;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var e = DICT[el.getAttribute('data-i18n-html')];
      if (e && (e[lang] || e.en) != null) el.innerHTML = e[lang] || e.en;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var e = DICT[el.getAttribute('data-i18n-ph')];
      if (e && (e[lang] || e.en) != null) el.setAttribute('placeholder', e[lang] || e.en);
    });
  }

  function restaggerWords() {
    document.querySelectorAll('.hero .word').forEach(function (w, i) {
      w.style.transitionDelay = (0.05 + i * 0.06) + 's';
    });
  }

  function updateSwitcherUI(lang) {
    var cur = document.getElementById('langCur');
    if (cur) cur.innerHTML = '<span class="lang-flag">' + FLAGS[lang] + '</span> ' + CODES[lang];
    document.querySelectorAll('#langMenu [data-lang], #navMobileLangs [data-lang]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      b.setAttribute('aria-selected', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  var PAGE_TITLES = {
    en: 'QD Systems · Websites & systems for UAE businesses',
    ar: 'QD Systems · مواقع وأنظمة لأعمال الإمارات',
    zh: 'QD Systems · 为阿联酋企业打造的网站与系统',
    ru: 'QD Systems · Сайты и системы для бизнеса в ОАЭ'
  };

  function setLang(lang, persist) {
    lang = normalize(lang);
    window.QD_LANG = lang;
    var d = document.documentElement;
    d.lang = lang;
    d.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    if (PAGE_TITLES[lang]) document.title = PAGE_TITLES[lang];
    if (persist) { try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {} }
    applyTranslations(lang);
    restaggerWords();
    updateSwitcherUI(lang);
    window.dispatchEvent(new CustomEvent('qd:langchange', { detail: { lang: lang } }));
  }
  window.qdSetLang = function (l) { setLang(l, true); };

  /* ---- switcher wiring ---- */
  function wireSwitcher() {
    var btn = document.getElementById('langBtn');
    var menu = document.getElementById('langMenu');
    var sw = document.getElementById('langSwitch');
    if (btn && menu && sw) {
      var close = function () { sw.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = sw.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      menu.querySelectorAll('[data-lang]').forEach(function (b) {
        b.addEventListener('click', function () { setLang(b.getAttribute('data-lang'), true); close(); });
      });
      document.addEventListener('click', function (e) { if (!sw.contains(e.target)) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
    var mob = document.getElementById('navMobileLangs');
    if (mob) mob.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang'), true); });
    });
  }

  /* ---- injected styles: switcher + RTL + CJK fallback ---- */
  function injectStyles() {
    var css = [
      /* language switcher */
      '.lang-switch{position:relative}',
      '.lang-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.03);color:var(--muted);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s,border-color .2s,color .2s;-webkit-tap-highlight-color:transparent}',
      '.lang-btn:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.22);color:var(--fg)}',
      '.lang-cur{letter-spacing:.04em;display:inline-flex;align-items:center;gap:6px}',
      '.lang-flag{font-size:15px;line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}',
      '.lang-menu [data-lang] .lang-flag,.nav-mobile-langs [data-lang] .lang-flag{margin-right:8px}',
      '[dir="rtl"] .lang-menu [data-lang] .lang-flag{margin-right:0;margin-left:8px}',
      '.lang-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:158px;padding:6px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(22,22,28,.99),rgba(12,12,14,.99));box-shadow:0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);opacity:0;transform:translateY(-8px) scale(.97);pointer-events:none;transition:opacity .2s var(--ease),transform .2s var(--ease);z-index:10001}',
      '[dir="rtl"] .lang-menu{right:auto;left:0}',
      '.lang-switch.open .lang-menu{opacity:1;transform:none;pointer-events:auto}',
      '.lang-menu [data-lang]{display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-radius:9px;background:none;color:var(--muted);font-family:inherit;font-size:14px;cursor:pointer;transition:background .15s,color .15s}',
      '[dir="rtl"] .lang-menu [data-lang]{text-align:right}',
      '.lang-menu [data-lang]:hover{background:rgba(255,255,255,.06);color:var(--fg)}',
      '.lang-menu [data-lang].active{color:var(--fg);background:rgba(255,255,255,.04)}',
      '.lang-menu [data-lang].active::after{content:"✓";float:right;color:var(--live)}',
      '[dir="rtl"] .lang-menu [data-lang].active::after{float:left}',
      '@media(max-width:880px){.lang-switch{display:none}}',
      /* mobile language buttons (inside the mobile menu) */
      '.nav-mobile-langs{display:flex;flex-wrap:wrap;gap:8px;padding:14px 16px 6px;margin-top:6px;border-top:1px solid var(--line)}',
      '.nav-mobile-langs button{flex:1 1 40%;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.03);color:var(--muted);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.nav-mobile-langs button.active{background:var(--silver);color:#0a0a0b;border-color:transparent}',
      /* CJK fallback so Chinese renders cleanly even though Inter/Space Grotesk lack CJK glyphs */
      'html[lang="zh"] body,html[lang="zh"] h1,html[lang="zh"] h2,html[lang="zh"] h3,html[lang="zh"] .disp{font-family:"Space Grotesk",Inter,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif}',
      /* Cyrillic fallback — Space Grotesk has no Cyrillic, so without this RU headlines drop to a serif (Times) and look broken */
      'html[lang="ru"] h1,html[lang="ru"] h2,html[lang="ru"] h3,html[lang="ru"] .disp,html[lang="ru"] .ghost b,html[lang="ru"] .marquee span,html[lang="ru"] #intro .mk,html[lang="ru"] .stat .n,html[lang="ru"] .badge .v,html[lang="ru"] .brand b,html[lang="ru"] .nav-mobile-links a,html[lang="ru"] .qa button,html[lang="ru"] .col h4,html[lang="ru"] .modal h3,html[lang="ru"] .quote p,html[lang="ru"] .trustrow b{font-family:Inter,system-ui,sans-serif}',
      /* ---- RTL adjustments (Arabic) ---- */
      '[dir="rtl"] .lead,[dir="rtl"] .sub,[dir="rtl"] .check,[dir="rtl"] .offer,[dir="rtl"] .step,[dir="rtl"] .qa button,[dir="rtl"] .qa .ans p,[dir="rtl"] .col li,[dir="rtl"] .col h4,[dir="rtl"] .badge,[dir="rtl"] .modal,[dir="rtl"] .modal label{text-align:right}',
      '[dir="rtl"] .modal .mx{right:auto;left:16px}',
      '[dir="rtl"] .modal select{background-position:18px 19px,13px 19px}',
      '[dir="rtl"] .iwork-result{border-left:0;border-right:2px solid rgba(53,210,126,.45);padding-left:0;padding-right:10px}',
      '[dir="rtl"] .qform{text-align:right}',
      /* Keep the scrolling keyword ribbon LTR in Arabic so its -50% loop stays seamless
         (each Arabic word still renders RTL internally; only the marquee flow is LTR). */
      '[dir="rtl"] .ghost{direction:ltr;text-align:left}',
      '[dir="rtl"] .ghost .track{direction:ltr;animation-duration:22s}',
      '[dir="rtl"] .marquee{direction:ltr;text-align:left}',
      '[dir="rtl"] .marquee .track{direction:ltr}',
      /* Arabic ribbon fix: a 1px outline on connected Arabic script is nearly invisible,
         so every second (stroked) word vanished and the banner looked broken/gappy.
         Give those words a faint solid fill instead, drop the negative letter-spacing
         (it clips Arabic ligatures), and tighten the gap between words. */
      '[dir="rtl"] .ghost b{-webkit-text-stroke:0;color:rgba(244,244,246,.26);letter-spacing:0;margin-right:44px}',
      '[dir="rtl"] .ghost b.fill{color:transparent}',
      '[dir="rtl"] h1,[dir="rtl"] h2,[dir="rtl"] h3,[dir="rtl"] .disp{letter-spacing:0}',
      'html[lang="zh"] .ghost .track{animation-duration:18s}',
      'html[lang="ru"] .ghost .track{animation-duration:27s}',
      /* Hero mirror for Arabic: text anchored on the RIGHT, 3D object on the LEFT,
         readability gradient flipped to sit under the right-hand text. */
      '[dir="rtl"] .hero-col{align-items:flex-start;text-align:right}',
      '[dir="rtl"] .cta-row,[dir="rtl"] .speed,[dir="rtl"] .checks{justify-content:flex-start}',
      '[dir="rtl"] .qd-hero::before{transform:scaleX(-1)}',
      '@media(min-width:981px){[dir="rtl"] #gl{left:auto;right:34vw}}',
      '@media(min-width:981px) and (max-width:1280px){[dir="rtl"] #gl{left:auto;right:52vw}}',
      '@media(min-width:981px) and (max-width:1100px){[dir="rtl"] #gl{left:auto;right:46vw}}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'qd-i18n-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---- boot ---- */
  function boot() {
    injectStyles();
    wireSwitcher();
    setLang(currentLang(), false);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
