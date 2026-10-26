// api/_lib/token-budget.js
// Zero-token helpers that keep each model call small:
//   estimateTokens       script-aware token estimate (calibrated against o200k, the gpt-oss tokenizer)
//   compressMessage      deterministic extractive shortening of long visitor messages
//   extractFacts         "facts so far" (business, goal, date, guests, name, topics) from the visitor's own words
//   compactHistory       last turns verbatim, older turns folded into one facts line
// Everything here is pure and synchronous: no model calls, no I/O.

// ─── Token estimate ──────────────────────────────────────────────────────────
// Per-character weights fitted on the knowledge base with o200k_harmony (see scripts/measure-tokens.mjs,
// which also reports the real tokenizer count next to this estimate). Within about 5% on the EN/AR/ZH/RU
// knowledge base, and slightly high for English (safer for budget checks). chars/3.6 is 25% off for Chinese.
const W = {
  latin: 0.24, // English prose: ~4.7 chars per token incl. spaces
  digit: 0.55,
  space: 0,
  punct: 0.6,
  arabic: 0.39, // ~3 chars per token
  cjk: 0.78, // ~1.5 chars per token
  cyrillic: 0.31, // ~3.5 chars per token
  other: 0.5,
};

export function estimateTokens(text) {
  const t = String(text ?? '');
  if (!t) return 0;
  let n = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (c === 32 || c === 10 || c === 9 || c === 13) n += W.space;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n += W.latin;
    else if (c >= 48 && c <= 57) n += W.digit;
    else if (c < 128) n += W.punct;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfeff)) n += W.arabic;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) n += W.cjk;
    else if (c >= 0x0400 && c <= 0x04ff) n += W.cyrillic;
    else if (c >= 0xc0 && c <= 0x24f) n += W.latin * 1.5; // accented Latin
    else n += W.other;
  }
  return Math.max(1, Math.ceil(n));
}

// Chat-format overhead per message (role markers) and a JSON rendering for tool schemas.
export function estimateMessagesTokens(messages = [], tools = null) {
  let n = 3;
  for (const m of messages) n += 4 + estimateTokens(typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''));
  if (tools) n += estimateTokens(JSON.stringify(tools));
  return n;
}

// ─── Shared patterns ─────────────────────────────────────────────────────────
const EMAIL_RE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[^\s@<>()[\]"',;:]+/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu;
const NUM_RE = /[+]?\p{Nd}+(?:[.,:/\-]\p{Nd}+)*/gu;
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر|январ\\S*|феврал\\S*|март\\S*|апрел\\S*|ма[йя]|июн\\S*|июл\\S*|август\\S*|сентябр\\S*|октябр\\S*|ноябр\\S*|декабр\\S*';
const DATE_RE = new RegExp(`\\p{Nd}{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b|(?:${MONTHS})\\s+\\p{Nd}{1,2}(?:st|nd|rd|th)?\\b|\\p{Nd}{1,4}\\s*月\\s*\\p{Nd}{1,2}\\s*[日号]?`, 'giu');

// Things a shortened message must never lose (numbers, dates, addresses, links).
export function extractEntities(text) {
  const t = String(text ?? '');
  const out = [];
  for (const re of [EMAIL_RE, URL_RE, DATE_RE, NUM_RE]) {
    for (const m of t.matchAll(re)) out.push(m[0]);
  }
  return out;
}

const QUESTION_WORD_RE = /^(?:how|what|which|when|where|why|who|can|could|do|does|did|is|are|will|would|should|may|كيف|ماذا|ما|متى|أين|وين|هل|كم|ليش|لماذا|وش|ايش|怎么|什么|哪|多少|能不能|可以|是否|吗|как|что|какой|когда|где|почему|сколько|можно|можете|есть ли)\b/iu;
const FILLER_RE = /^(?:hi+|hello+|hey+|hiya|good (?:morning|afternoon|evening)|greetings|dear (?:team|sir|madam)|hope (?:you are|you're|all is) (?:well|good|doing well)|thanks?(?: you)?(?: so much| a lot)?(?: in advance)?|regards|best regards|kind regards|cheers|ok(?:ay)?|so|well|um+|uh+|مرحبا|مرحباً|هلا|السلام عليكم|أهلا|اهلا|شكرا|شكراً|你好|您好|谢谢|привет|здравствуйте|добрый день|спасибо)[\s,.!?؟。！？…]*$/iu;

const BUSINESS_RE = /\b(?:restau?rant|resturan?t|resturnat|restraunt|cafe|café|coffee shop|bakery|bar|lounge|kitchen|cloud kitchen|catering|hotel|villa|resort|holiday home|airbnb|salon|spa|barber(?:shop)?|clinic|dental|dentist|doctor|hospital|pharmacy|gym|fitness|studio|retail|shop|store|boutique|clothing|fashion|jewel(?:le)?ry|perfume|real estate|property|properties|agency|school|academy|nursery|training|car rental|garage|workshop|laundry|cleaning|logistics|delivery|e-?commerce|startup|wedding planner|event planner|events company|photograph(?:er|y)|law firm|consultan(?:cy|t)|construction|contracting|interior design|florist|pet shop|supermarket|grocery)\b|مطعم|مقهى|كافيه|كوفي|مخبز|فندق|فيلا|صالون|سبا|عيادة|مستشفى|صيدلية|نادي رياضي|جيم|متجر|محل|بوتيك|ملابس|عقار|عقارات|وكالة|مدرسة|أكاديمية|حضانة|مغسلة|شركة|餐厅|餐馆|咖啡|面包店|酒店|别墅|沙龙|美容|诊所|医院|药店|健身|商店|店铺|服装|房地产|学校|公司|ресторан|кафе|кофейн|пекарн|отел|гостиниц|вилл|салон|клиник|больниц|аптек|спортзал|фитнес|магазин|бутик|одежд|недвижимост|агентств|школ|компани/iu;

const PROJECT_RE = /\b(?:web ?site|site|web ?page|landing page|web app|website|web|online (?:store|shop|ordering|booking|menu)|e-?commerce|ordering|order(?:s|ing)? online|booking|reservations?|appointments?|dashboard|admin panel|portal|crm|system|platform|app|chat ?bot|ai (?:chat|assistant)|automation|whatsapp (?:flow|bot|integration)|nfc|tags?|digital menu|menu|qr|loyalty|reviews?|business card|invitations?|invites?|rsvp|seating|check-?in|guest list|wedding|engagement|birthday|graduation|gender reveal|events?|redesign|rebuild|database|inventory|payments?)\b|موقع|متجر إلكتروني|طلب أونلاين|حجز|حجوزات|لوحة تحكم|نظام|تطبيق|بوت|شات|أتمتة|بطاق|ملصق|منيو|قائمة|دعوة|دعوات|زفاف|عرس|خطوبة|حفل|مناسبة|فعالية|ضيوف|网站|网页|在线点餐|预订|仪表板|后台|系统|应用|聊天机器人|自动化|标签|菜单|请柬|邀请|婚礼|活动|宾客|сайт|интернет-магазин|заказ|бронирован|дашборд|панель|систем|приложени|бот|автоматизац|метк|меню|приглашени|свадьб|событи|мероприяти|гост/iu;

const URGENT_RE = /\b(?:urgent(?:ly)?|asap|as soon as possible|right away|immediately|today|tonight|tomorrow|tommor?ow|this week|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b|عاجل|ضروري|بأسرع وقت|اليوم|بكرة|غدا|غداً|هذا الأسبوع|紧急|尽快|马上|今天|明天|本周|срочно|как можно скорее|сегодня|завтра|на этой неделе/iu;
const SOON_RE = /\b(?:soon|next week|this month|next month|in a (?:few|couple of) (?:days|weeks)|within (?:a|two|2|three|3) weeks?)\b|قريبا|قريباً|الأسبوع القادم|الشهر القادم|下周|下个月|很快|скоро|на следующей неделе|в следующем месяце/iu;
const EXPLORING_RE = /\b(?:just (?:looking|browsing|exploring|curious)|exploring|not sure yet|no rush|someday|maybe later|thinking about)\b|أستكشف|مجرد سؤال|مو مستعجل|只是看看|不着急|просто смотрю|не спешу/iu;

const GUESTS_RE = /(\p{Nd}{2,5})\s*(?:\+\s*)?(?:guests?|people|persons|pax|attendees|invitees|ضيف|شخص|مدعو|位?宾客|位客人|人|гост\S*|человек)/iu;
const NAME_RE = /\b(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]{1,20})\b|(?:اسمي|أنا)\s+([؀-ۿ]{2,20})|我叫\s*([一-鿿]{1,4})|меня зовут\s+([А-ЯЁ][а-яё]{1,20})/u;

const TOPICS = [
  ['pricing', /\b(?:cost|price|pricing|how much|quote|budget|ballpark)\b|كم|سعر|تكلف|ميزاني|多少钱|价格|报价|费用|сколько стоит|цен|стоимост/iu],
  ['timeline', /\b(?:how long|timeline|time ?frame|how fast|deadline|deliver|ready by|when can)\b|مدة|كم يستغرق|كم تستغرق|متى|多久|多长时间|сроки|сколько времени|когда/iu],
  ['nfc', /\bnfc\b|\btap\b|\btags?\b|بطاق|ملصق|标签|метк/iu],
  ['events', /\b(?:event|invit\w*|wedding|rsvp|seating|guests?)\b|دعوة|دعوات|زفاف|مناسب|ضيوف|活动|请柬|婚礼|宾客|событи|приглаш|свадьб|гост/iu],
  ['demos', /\b(?:demo|portfolio|examples?|your work)\b|أعمالكم|نماذج|作品|案例|примеры|портфолио/iu],
];

function firstMatch(re, texts) {
  for (const t of texts) {
    const m = re.exec(String(t || ''));
    if (m) return m;
  }
  return null;
}

/**
 * Deterministic facts from the visitor's own words (newest message last).
 * Only short keyword-level facts: never free text the model could mistake for instructions.
 */
export function extractFacts(userTexts = []) {
  const texts = (Array.isArray(userTexts) ? userTexts : [userTexts]).map((t) => String(t || ''));
  const newestFirst = [...texts].reverse();
  const facts = {};
  const biz = firstMatch(BUSINESS_RE, newestFirst);
  if (biz) facts.business = biz[0].toLowerCase();
  const goals = [];
  for (const t of texts) {
    for (const m of t.matchAll(new RegExp(PROJECT_RE.source, 'giu'))) {
      const g = m[0].toLowerCase();
      if (!goals.includes(g)) goals.push(g);
    }
  }
  if (goals.length) facts.goals = goals.slice(0, 5);
  const date = firstMatch(new RegExp(DATE_RE.source, 'iu'), newestFirst);
  if (date) facts.date = date[0];
  const guests = firstMatch(GUESTS_RE, newestFirst);
  if (guests) facts.guests = guests[1];
  const name = firstMatch(NAME_RE, texts);
  if (name) facts.name = name.slice(1).find(Boolean);
  const all = texts.join(' \n ');
  if (URGENT_RE.test(all)) facts.urgency = 'urgent';
  else if (SOON_RE.test(all)) facts.urgency = 'soon';
  else if (EXPLORING_RE.test(all)) facts.urgency = 'exploring';
  const topics = TOPICS.filter(([, re]) => re.test(all)).map(([k]) => k);
  if (topics.length) facts.topics = topics;
  return facts;
}

export function formatFacts(facts = {}) {
  const clean = (v) => String(v).replace(/[\r\n\t<>`]+/g, ' ').trim().slice(0, 60);
  const parts = [];
  if (facts.name) parts.push(`name ${clean(facts.name)}`);
  if (facts.business) parts.push(`business: ${clean(facts.business)}`);
  if (facts.goals?.length) parts.push(`interested in: ${facts.goals.map(clean).join(', ')}`);
  if (facts.date) parts.push(`date mentioned: ${clean(facts.date)}`);
  if (facts.guests) parts.push(`guests: ${clean(facts.guests)}`);
  if (facts.urgency) parts.push(`urgency: ${facts.urgency}`);
  if (facts.topics?.length) parts.push(`already discussed: ${facts.topics.join(', ')}`);
  return parts.join('; ');
}

// ─── Message compression ─────────────────────────────────────────────────────
export const COMPRESS_TRIGGER_CHARS = 600;
export const COMPRESS_TARGET_CHARS = 480;

function splitSentencesKeep(text) {
  // Split after sentence punctuation followed by a space (so "a@b.com" and "3.5" stay whole), after
  // CJK full stops, or at line breaks. Punctuation stays with its sentence.
  return text
    .split(/(?<=[.!?؟…])\s+|(?<=[。！？])|\n+/u)
    .map((s) => s.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

// A sentence is filler when nothing meaningful is left after removing greetings and pleasantries.
const FILLER_PHRASE_RE = /\b(?:hi+|hello+|hey+|hiya|there|good (?:morning|afternoon|evening)|greetings|dear (?:team|sir|madam|all)|hope (?:you are|you're|all is|this finds you) (?:well|good|doing well)|thanks?(?: you)?(?: so much| a lot| again)?(?: in advance)?|(?:i )?(?:really )?appreciate (?:it|your help)|regards|best|kind|cheers|ok(?:ay)?|so|well|um+|uh+|anyway)\b|مرحبا|مرحباً|هلا|السلام عليكم|أهلا|اهلا|شكرا|شكراً|你好|您好|谢谢|привет|здравствуйте|добрый день|спасибо/giu;
function isFiller(s) {
  if (FILLER_RE.test(s)) return true;
  const rest = s.replace(FILLER_PHRASE_RE, ' ').replace(/[\p{P}\p{S}\s]+/gu, '');
  return rest.length < 3;
}

function normKey(s) {
  return s.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

function wordSet(s) {
  const k = normKey(s);
  // CJK has no spaces: use character bigrams so near-duplicates are still caught.
  if (/[一-鿿]/u.test(k)) {
    const chars = [...k.replace(/\s+/g, '')];
    const grams = new Set();
    for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars[i] + chars[i + 1]);
    return grams;
  }
  return new Set(k.split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function scriptOf(text) {
  const t = String(text || '');
  if (/[؀-ۿ]/u.test(t)) return 'ar';
  if (/[一-鿿]/u.test(t)) return 'zh';
  if (/[Ѐ-ӿ]/u.test(t)) return 'ru';
  return null;
}

function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(1, max - 1));
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/**
 * Shrinks a long visitor message while keeping what the model needs: the questions, every
 * number/date/email/URL, business and project keywords, and the first and last sentence.
 * Short messages (<= 600 chars) come back unchanged. The result is never longer than the input,
 * never longer than COMPRESS_TRIGGER_CHARS when it changed anything, and compressing twice is a no-op.
 */
export function compressMessage(input, { targetChars = COMPRESS_TARGET_CHARS, triggerChars = COMPRESS_TRIGGER_CHARS } = {}) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  if (text.length <= triggerChars) return text;

  const entities = [...new Set(extractEntities(text))];
  const entityChars = entities.reduce((n, e) => n + e.length + 1, 0);
  // Nothing safe to drop (a wall of numbers or links): leave it alone.
  if (entityChars > triggerChars - 120) return text;

  const raw = splitSentencesKeep(text);
  // De-duplicate exact and near-duplicate sentences (keep the first occurrence).
  const sentences = [];
  const sets = [];
  for (const s of raw) {
    const ws = wordSet(s);
    if (sets.some((o) => jaccard(o, ws) >= 0.8)) continue;
    sentences.push(s);
    sets.push(ws);
  }
  const content = sentences.filter((s) => !isFiller(s));
  const pool = content.length ? content : sentences;
  if (!pool.length) return text;

  const script = scriptOf(text);
  const scored = pool.map((s, i) => {
    let signal = 0;
    if (/[?؟？]/u.test(s) || QUESTION_WORD_RE.test(s)) signal += 4;
    if (extractEntities(s).length) signal += 3;
    if (BUSINESS_RE.test(s)) signal += 3;
    if (PROJECT_RE.test(s)) signal += 3;
    let score = signal;
    if (i === 0) score += 2;
    if (i === pool.length - 1) score += 1;
    score -= Math.min(2, s.length / 400);
    return { s, i, score, signal };
  });

  // The first and last sentences are kept when they carry any signal; so is one sentence in the
  // visitor's script, so the reply language never drifts.
  const mandatory = new Set([0, pool.length - 1].filter((i) => scored[i].signal > 0));
  if (script) {
    const idx = pool.findIndex((s) => scriptOf(s) === script);
    if (idx >= 0) mandatory.add(idx);
  }
  const budget = targetChars;
  const chosen = new Map();
  let used = 0;
  const take = (item, max) => {
    if (chosen.has(item.i)) return;
    const s = clip(item.s, max);
    chosen.set(item.i, s);
    used += s.length + 1;
  };
  for (const i of mandatory) take(scored[i], Math.max(80, Math.floor(budget / Math.max(2, mandatory.size + 1))));
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (chosen.has(item.i)) continue;
    if (used + item.s.length + 1 > budget) continue;
    take(item, item.s.length);
  }
  const prose = [...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s).join(' ');

  // Re-attach any number, date, address or link that only lived in a dropped sentence,
  // trimming the prose (never the entities) until the whole thing fits.
  const assemble = (proseMax) => {
    const p = clip(prose, proseMax);
    const missing = entities.filter((e) => !p.includes(e));
    return missing.length ? `${p} (${missing.join(', ')})` : p;
  };
  let out = assemble(prose.length);
  for (let max = prose.length; out.length > triggerChars && max > 60; ) {
    max = Math.max(60, max - Math.max(20, out.length - triggerChars));
    out = assemble(max);
  }

  // Any failure to meet the guarantees falls back to the original (deterministic, so still idempotent).
  if (out.length > triggerChars || out.length >= text.length) return text;
  if (entities.some((e) => !out.includes(e))) return text;
  if (script && scriptOf(out) !== script) return text;
  return out;
}

// ─── History compaction ──────────────────────────────────────────────────────
/**
 * Keeps the last `keepTurns` exchanges verbatim (user turns compressed, assistant turns clipped) and
 * folds everything older into one short facts line built from the visitor's own words.
 * Returns { messages, factsLine, droppedCount }.
 */
export function compactHistory(history = [], { keepTurns = 2, assistantChars = 400, userTextsForFacts = null } = {}) {
  const list = (Array.isArray(history) ? history : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  // Find the start index of the last `keepTurns` user turns.
  let start = list.length;
  let seen = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].role === 'user') {
      seen += 1;
      start = i;
      if (seen === keepTurns) break;
    }
  }
  if (seen < keepTurns) start = 0;
  // Never start on an assistant turn that has no user turn before it in the kept window.
  const kept = list.slice(start).map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? clip(m.content.trim(), assistantChars) : compressMessage(m.content.trim()),
  }));
  const older = list.slice(0, start);
  const factSource = userTextsForFacts || list.filter((m) => m.role === 'user').map((m) => m.content);
  const facts = extractFacts(factSource);
  const factsLine = older.length || userTextsForFacts ? formatFacts(facts) : '';
  return { messages: kept, factsLine, droppedCount: older.length, facts };
}
