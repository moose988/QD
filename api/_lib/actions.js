// api/_lib/actions.js
// Deterministic "action cards" shown under the assistant's reply (a button that
// links somewhere useful). Detected from the visitor's message, not by the model,
// so they appear every time regardless of what the model writes.

const LOGIN_RE = /\blog\s?-?in\b|\blogin\b|\bsign\s?-?in\b|customer (area|portal|access)|تسجيل\s*(ال)?دخول|سجل\s*(ال)?دخول|أين.*(أسجل|ادخل|أدخل)|登录|登陆|登入|\bвход\b|войти|логин|авторизац/i;
const WEBSITE_RE = /\bwebsites?\b|\bweb\s?sites?\b|\bweb\s?design|\blanding page|\bportfolio\b|\bdemos?\b|\byour work\b|\bpast work\b|\bexamples?\b|\bsamples?\b|\bsee (what|some)\b|موقع|مواقع|أعمالكم|نماذج|网站|网页|作品|案例|сайт|работы|примеры|портфолио|демо/i;

const LABELS = {
  login: {
    en: { title: 'QD Events customer login', label: 'Open customer login' },
    ar: { title: 'تسجيل دخول عملاء QD Events', label: 'فتح تسجيل دخول العملاء' },
    zh: { title: 'QD Events 客户登录', label: '打开客户登录' },
    ru: { title: 'Вход для клиентов QD Events', label: 'Открыть вход для клиентов' },
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
  demos: '/#work',
};

export function detectActions(message, lang = 'en') {
  const text = String(message || '');
  const L = ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en';
  const out = [];
  if (LOGIN_RE.test(text)) out.push({ kind: 'login', url: URLS.login, external: true, ...LABELS.login[L] });
  if (WEBSITE_RE.test(text)) out.push({ kind: 'demos', url: URLS.demos, external: false, ...LABELS.demos[L] });
  return out.slice(0, 2);
}

// One-line note for the system prompt so the reply and the button agree.
export function describeActions(actions) {
  if (!actions?.length) return '';
  const lines = actions.map((a) =>
    a.kind === 'login'
      ? '- a "customer login" button for QD Events (you DO know where the login is; never say you lack that detail)'
      : '- a "view our demos and work" button (our website previews and work)'
  );
  return `BUTTONS (the site will show these under your reply automatically):\n${lines.join('\n')}\nIntroduce it in one short, natural sentence that fits the button (for login: "Here's the customer login for your event."; for demos: "Here are some of our demos and past work." — adapt to the visitor's words) and keep the reply to that, plus at most one short question when it genuinely helps (for a website request, ask what kind of business it's for). Do NOT paste any URL.`;
}
