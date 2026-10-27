// api/_lib/quick-replies.js
// Zero-token paths: messages that do not need the model at all.
//   quickReply   bare greeting, emoji/punctuation only, a plain "thanks" (several natural variants)
//   ReplyCache   exact-match cache for generic first-turn questions (the suggestion chips), short TTL
// Both are conservative: anything with real content still goes to the model.

const GREETING_ONLY = /^(?:(?:hi+|hello+|hey+|hiya|yo|good (?:morning|afternoon|evening|day)|greetings|salam|salaam|assalamu? ?alaikum|marhaba|mar7aba|hala|ahlan|مرحبا|مرحباً|هلا|هلا والله|أهلا|اهلا|أهلاً|السلام عليكم|سلام|صباح الخير|مساء الخير|你好|您好|嗨|哈喽|привет|здравствуйте|добрый (?:день|вечер)|доброе утро)(?:\s+(?:there|all|team|qd|guys))?[\s,.!?؟。！？…~]*)+$/iu;
const THANKS_ONLY = /^(?:(?:thanks?|thank you(?: so much| very much)?|thx|ty|cheers|شكرا|شكراً|مشكور|يعطيك العافية|谢谢|多谢|спасибо|благодарю)[\s,.!?؟。！？…]*)+$/iu;
const EMPTYISH = /^[\s\p{P}\p{S}\p{Extended_Pictographic}‍️]*$/u;

const VARIANTS = {
  greeting: {
    en: ['Hi, welcome to QD. What can I help you with?', 'Hello, good to have you here. What are you working on?', 'Hi there. What can I help you with today?'],
    ar: ['أهلاً بك في QD. كيف أقدر أساعدك؟', 'هلا والله، حياك. وش اللي تشتغل عليه؟', 'مرحباً بك. بماذا أقدر أساعدك اليوم؟'],
    zh: ['你好，欢迎来到 QD。有什么可以帮你的？', '你好，很高兴见到你。你在做什么项目？', '你好。今天有什么我可以帮忙的？'],
    ru: ['Здравствуйте, добро пожаловать в QD. Чем могу помочь?', 'Здравствуйте, рад вас видеть. Над чем вы работаете?', 'Добрый день. Чем могу помочь сегодня?'],
  },
  thanks: {
    en: ["You're welcome. I'm here if you need me.", 'Any time. Happy to help whenever you need.', "Glad it helped. I'm around if anything comes up."],
    ar: ['العفو، أنا هنا متى احتجتني.', 'على الرحب والسعة، يسعدني أساعدك في أي وقت.', 'سعيد إنها أفادتك. أنا موجود لو احتجت شيئاً.'],
    zh: ['不客气，有需要随时找我。', '不用谢，随时乐意帮忙。', '很高兴能帮上忙，有问题随时说。'],
    ru: ['Пожалуйста, я на связи, если понадоблюсь.', 'Всегда рад помочь.', 'Рад, что помог. Если что-то понадобится, я здесь.'],
  },
  ack: {
    en: ['Sounds good. What would you like to look at next?', 'Got it. What else is on your mind for the project?'],
    ar: ['تمام. وش تحب نشوف بعدها؟', 'وصلت. وش الشيء الثاني اللي تفكر فيه للمشروع؟'],
    zh: ['好的。接下来想了解什么？', '明白了。项目上还有什么想法吗？'],
    ru: ['Хорошо. Что хотите обсудить дальше?', 'Понял. Что ещё важно для проекта?'],
  },
};

function pick(list, avoid = '', seed = '') {
  const pool = list.filter((v) => v !== avoid);
  const from = pool.length ? pool : list;
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return from[(seed ? h : Math.floor(Math.random() * 1e9)) % from.length];
}

/**
 * Returns { text, kind } when the message needs no model call, else null.
 * kind: 'greeting' | 'thanks' | 'ack'
 */
export function quickReply({ message, history = [], lang = 'en', seed = '' } = {}) {
  const text = String(message || '').trim();
  const L = ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en';
  const userTurns = history.filter((m) => m?.role === 'user').length;
  const lastAssistant = [...history].reverse().find((m) => m?.role === 'assistant')?.content || '';
  let kind = null;
  if (text.length <= 60 && GREETING_ONLY.test(text)) kind = userTurns === 0 ? 'greeting' : null;
  else if (text.length <= 40 && THANKS_ONLY.test(text)) kind = 'thanks';
  else if (text.length <= 24 && EMPTYISH.test(text)) kind = userTurns === 0 ? 'greeting' : 'ack';
  if (!kind) return null;
  return { kind, text: pick(VARIANTS[kind][L], lastAssistant, seed) };
}

// ─── Exact-match reply cache ─────────────────────────────────────────────────
export function cacheKey(message, lang) {
  const norm = String(message || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return norm && norm.length <= 80 ? `${lang}|${norm}` : null;
}

export class ReplyCache {
  constructor({ ttlMs = Number(process.env.CHAT_REPLY_CACHE_TTL_MS) || 30 * 60000, max = 200, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.now = now;
    this.map = new Map();
  }

  get(key) {
    if (!key || !this.ttlMs) return null;
    const hit = this.map.get(key);
    if (!hit) return null;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value) {
    if (!key || !this.ttlMs) return;
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { at: this.now(), value });
  }
}

/**
 * Only generic first-turn questions are cacheable: no history, no hand-off, no action card,
 * nothing personal (the visitor's name or contact) in the question or the answer.
 */
export function isCacheable({ history = [], decision = 'none', actions = [], message = '', reply = '', visitor = null } = {}) {
  if (history.some((m) => m?.role === 'user')) return false;
  if (decision !== 'none' || actions.length) return false;
  if (/\d{3,}|@|https?:/i.test(message)) return false;
  const personal = [visitor?.name, visitor?.email, visitor?.phone].map((v) => String(v || '').trim()).filter((v) => v.length >= 2);
  const first = personal[0]?.split(/\s+/)[0];
  for (const p of [...personal, first].filter(Boolean)) if (reply.toLowerCase().includes(p.toLowerCase()) || message.toLowerCase().includes(p.toLowerCase())) return false;
  return Boolean(reply.trim());
}
