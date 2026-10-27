// api/_lib/actions.js
// Deterministic "action cards" shown under the assistant's reply (a button that
// links somewhere useful). Detected from the visitor's message, not by the model,
// so they appear every time regardless of what the model writes.

const LOGIN_RE = /\blog\s?-?in\b|\blogin\b|\bsign\s?-?in\b|customer (area|portal|access)|تسجيل\s*(ال)?دخول|سجل\s*(ال)?دخول|أين.*(أسجل|ادخل|أدخل)|登录|登陆|登入|\bвход\b|войти|логин|авторизац/i;
// "can you build a login page?" is a project request, not a customer looking for the way in.
const LOGIN_BUILD_RE = /\b(build|make|create|design|develop|add|implement|integrate|code)\b[^.?!\n]{0,40}\b(log\s?-?in|sign\s?-?in|authentication|auth)\b|\b(log\s?-?in|sign\s?-?in|authentication)\b[^.?!\n]{0,20}\b(system|feature|flow|functionality|for (my|our|the) (website|app|site))\b|ابن|صمم|أنشئ|搭建|开发|做一个|создать|сделать|разработ/i;

const BOOK_RE = /\b(book|schedule|arrange|set up)\b[^.?!\n]{0,25}\b(call|meeting|appointment|consultation|demo)\b|\bcall me\b|\bcall back\b|\bphone call\b|\bappointment\b|\b(?:speak|talk|chat) (?:to|with) (?:someone|somebody|a person|a real person|a human|a real human|a real agent|an agent|a representative|the team|your team|a team member)\b|\b(?:real|live) (?:person|human|agent)\b|\bhuman agent\b|احجز|حجز موعد|موعد|مكالمة|اجتماع|اتصلوا بي|预约|约个|电话会议|通话|созвон|записаться|назначить|встреч|позвон/i;

const DEMOS_RE = /\bdemos?\b|\byour (work|portfolio|projects|previous work)\b|\b(past|previous) (work|projects)\b|\bportfolio\b|\bexamples?\b|\bsamples?\b|\bshow me (some|what|your)\b|\bsee (some|what|your|examples)\b|\bwhat (have|did) you (built|made|done)\b|أعمالكم|نماذج|أمثلة|عرض أعمال|作品|案例|示例|看看你们|演示|примеры|портфолио|ваши работы|покажите|демо/i;

const LABELS = {
  login: {
    en: { title: 'QD Events customer login', label: 'Open customer login' },
    ar: { title: 'تسجيل دخول عملاء QD Events', label: 'فتح تسجيل دخول العملاء' },
    zh: { title: 'QD Events 客户登录', label: '打开客户登录' },
    ru: { title: 'Вход для клиентов QD Events', label: 'Открыть вход для клиентов' },
  },
  book: {
    en: { title: 'Free call', label: 'Pick a time for a free call' },
    ar: { title: 'مكالمة مجانية', label: 'اختر وقتاً لمكالمة مجانية' },
    zh: { title: '免费通话', label: '选择免费通话的时间' },
    ru: { title: 'Бесплатный звонок', label: 'Выбрать время для звонка' },
  },
  demos: {
    en: { title: 'Our work', label: 'View our demos and work' },
    ar: { title: 'أعمالنا', label: 'شاهد نماذجنا وأعمالنا' },
    zh: { title: '我们的作品', label: '查看我们的演示和作品' },
    ru: { title: 'Наши работы', label: 'Смотреть демо и работы' },
  },
};

const URLS = {
  login: 'https://events.qdsystems.ae/customer-login.html',
  book: '/#contact',
  demos: '/#work',
};

export function detectActions(message, lang = 'en') {
  const text = String(message || '');
  const L = ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en';
  const out = [];
  if (LOGIN_RE.test(text) && !LOGIN_BUILD_RE.test(text)) out.push({ kind: 'login', url: URLS.login, external: true, ...LABELS.login[L] });
  if (BOOK_RE.test(text)) out.push({ kind: 'book', url: URLS.book, external: false, ...LABELS.book[L] });
  if (DEMOS_RE.test(text)) out.push({ kind: 'demos', url: URLS.demos, external: false, ...LABELS.demos[L] });
  return out.slice(0, 2);
}

// One-line note for the system prompt so the reply and the button agree.
export function describeActions(actions) {
  if (!actions?.length) return '';
  const lines = actions.map((a) =>
    a.kind === 'login'
      ? '- a "customer login" button for QD Events (you DO know where the login is; never say you lack that detail)'
      : a.kind === 'book'
        ? '- a "pick a time for a free call" button (they choose the slot there; you cannot book or confirm times yourself, so never promise a specific time)'
        : '- a "view our demos and work" button (our website previews and work)'
  );
  return `BUTTONS (the site will show these under your reply automatically):\n${lines.join('\n')}\nWrite in the SAME language the visitor used. Introduce it in one short, natural sentence that fits the button (for login: "Here's the customer login for your event."; for demos: "Here are some of our demos and past work." — adapt to the visitor's words) and keep the reply to exactly that one sentence. For the login button NEVER ask a question and never assume they are planning a new event: they are an existing customer who just needs the way in. Do NOT paste any URL.`;
}

export function getAction(kind, lang = 'en') {
  const L = ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en';
  return { kind, url: URLS[kind], external: kind === 'login', ...LABELS[kind][L] };
}

export const MEANWHILE_LINE = {
  en: 'In the meantime, you can take a look at our work.',
  ar: 'وفي هذه الأثناء، يمكنك الاطلاع على أعمالنا.',
  zh: '在此期间，你可以先看看我们的作品。',
  ru: 'А пока можете посмотреть наши работы.',
};

// Used when the model answers a button request in the wrong language.
export const ACTION_INTRO = {
  login: {
    en: "Here's the customer login for your event.",
    ar: 'هذا رابط تسجيل دخول العملاء لمناسبتك.',
    zh: '这是你活动的客户登录入口。',
    ru: 'Вот вход для клиентов для вашего события.',
  },
  book: {
    en: 'You can pick a time for a free call right here.',
    ar: 'يمكنك اختيار وقت للمكالمة المجانية من هنا.',
    zh: '你可以在这里选一个免费通话的时间。',
    ru: 'Время для бесплатного звонка можно выбрать здесь.',
  },
  demos: {
    en: 'Here are some of our demos and past work.',
    ar: 'هذه بعض نماذجنا وأعمالنا السابقة.',
    zh: '这是我们的一些演示和过往作品。',
    ru: 'Вот несколько наших демо и прошлых работ.',
  },
};
