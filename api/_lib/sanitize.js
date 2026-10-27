// api/_lib/sanitize.js
// Last line of defence on every assistant reply. The prompt asks the model to be short, plain and
// accurate; this module guarantees the parts that must never slip (wrong phone numbers, dashes,
// emoji, list markup, stock phrases, leaked instructions) no matter which model answered.

const QD_PHONE_DIGITS = '971504611123';
const QD_PHONE_DISPLAY = '+971 50 461 1123';

const STOCK_SENTENCE_RE = /(feel free|don'?t hesitate|is there anything else|anything else i can|happy to assist|assist you|delighted|thank you for (your )?interest|great question|how may i help|let me know if you (have|need)|لا تتردد|هل هناك شيء آخر|欢迎随时联系|还有什么可以帮|не стесняйтесь|могу ли я ещё)/i;

// Delivery-time claims ("live in under 24 hours", "about three days") are only for visitors who asked.
const TIMELINE_RE = /\b(?:\d+\s*(?:-|to)?\s*\d*\s*(?:hours?|days?|weeks?)|(?:one|two|three|four|five|a)\s+(?:hours?|days?|weeks?)|under (?:a|an|one) (?:day|hour)|within (?:a|an|one) (?:day|hour)|same[- ]day|overnight)\b|ساعة|ساعات|أيام|يوم واحد|小时|天内|几天|час(?:а|ов)?\b|дн(?:я|ей)\b/iu;

const LEAK_RE = /KNOWN ABOUT VISITOR|HOW TO SOUND|FINAL REMINDER|capture_lead|BUTTONS \(|CONTEXT \(authoritative|system prompt|ABSOLUTE RULES|REPLY STYLE|SERVER HANDOFF DECISION|CHAT SO FAR \(|VISITOR MESSAGES:/i;

const DEFLECT = {
  en: "That's not something I can share, but I can help with websites, NFC tags or event invitations. What are you working on?",
  ar: 'هذا ليس شيئاً أستطيع مشاركته، لكن يمكنني مساعدتك في المواقع وبطاقات NFC ودعوات المناسبات. ما الذي تعمل عليه؟',
  zh: '这个我没法分享，不过网站、NFC 标签和活动请柬方面我可以帮你。你在做什么项目？',
  ru: 'Этим я поделиться не могу, но помогу с сайтами, NFC-метками и приглашениями на события. Над чем вы работаете?',
};

function countWords(t) {
  const cjk = (t.match(/[一-鿿]/g) || []).length;
  const rest = t.replace(/[一-鿿]/g, ' ').split(/\s+/).filter(Boolean).length;
  return rest + Math.ceil(cjk / 2);
}

function splitSentences(t) {
  return t.split(/(?<=[.?؟。？])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function sanitizeReply(input, { lang = 'en', allowedDigits = [], allowPhone = false, allowTimeline = true } = {}) {
  let t = String(input || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');

  if (LEAK_RE.test(t)) return DEFLECT[lang] || DEFLECT.en;

  // dashes and odd hyphens
  t = t.replace(/[‐‑‒]/g, '-');
  t = t.replace(/\s*[—―]\s*/g, ', ');
  t = t.replace(/(\d)\s*–\s*(\d)/g, '$1-$2').replace(/\s*–\s*/g, ', ');

  // emoji, markdown, list markers, exclamation marks
  t = t.replace(/\p{Extended_Pictographic}/gu, '').replace(/[‍️]/g, '');
  t = t.replace(/\*\*|__/g, '').replace(/^#{1,6}\s*/gm, '');
  t = t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '');
  t = t.replace(/!+/g, '.').replace(/¡/g, '');

  // never let a made-up phone number through
  const allowed = new Set([QD_PHONE_DIGITS, ...allowedDigits.map((d) => String(d).replace(/\D/g, ''))]);
  t = t.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (allowed.has(digits)) return m;
    return digits.length >= 9 ? QD_PHONE_DISPLAY : m;
  });

  // drop stock sentences and unprompted mentions of QD's number (only when something else remains)
  let sentences = splitSentences(t.replace(/\s*\n+\s*/g, ' '));
  const kept = sentences.filter((s) => !STOCK_SENTENCE_RE.test(s) && (allowPhone || !s.replace(/\D/g, '').includes(QD_PHONE_DIGITS)) && (allowTimeline || !TIMELINE_RE.test(s)));
  if (kept.length) sentences = kept;

  // hard length cap: stop at the last full sentence under ~60 words
  const out = [];
  let words = 0;
  for (const s of sentences) {
    const w = countWords(s);
    if (out.length && words + w > 60) break;
    out.push(s);
    words += w;
  }
  t = out.join(' ');

  t = t
    .replace(/\s+([,.?؟،])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([.?])/g, '$1')
    .replace(/\.\s*\./g, '.')
    .replace(/^[\s,.]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return t;
}

// The visitor must have shown real intent (price, quote, timing, ready to start, wants a call)
// before we hand them to the team.
const HANDOFF_INTENT_RE = /\b(cost|costs|price|prices|pricing|how much|quote|quotation|estimate|budget|get started|let'?s (start|do it|go)|go ahead|proceed|sign me up|book (a|the|me)|call me|contact me|reach me|get back to me|ready to (start|go|begin))\b|\bstart\b|كم|سعر|أسعار|تكلف|ميزاني|عرض سعر|نبدأ|ابدأ|احجز|جاهز|تواصل معي|اتصل بي|多少钱|价格|报价|费用|预算|开始|预约|联系我|сколько|цена|стоимост|расч[её]т|начать|готов|свяжитесь|позвоните/i;

export function hasHandoffIntent(text) {
  return HANDOFF_INTENT_RE.test(String(text || ''));
}

// A reply that promises a hand-off ("I'll pass this to the team", "they'll message you soon").
const CLAIM_RE = /(pass(ed|ing)?|forward(ed|ing)?)\s+(this|it|that)\s+(on\s+)?to\s+the\s+team|(the\s+)?team\s+(will|'ll|is going to)\s+(message|contact|reach out|follow up|get back|be in touch)|they'?ll\s+(message|contact|reach|get back)|سيراسل|سيتواصل|سيتواصلون|حوّلت|团队.{0,10}(会联系|联系你|联系您)|转交|команда.{0,25}(напишет|свяжется)|(передам|передал).{0,10}команде/i;

export function claimsHandoff(text) {
  return CLAIM_RE.test(String(text || ''));
}

export const ASK_WHAT = {
  en: 'What are you looking to build?',
  ar: 'ماذا تريد أن تبني؟',
  zh: '你想做什么？',
  ru: 'Что вы хотите сделать?',
};

// Removes hand-off promises that did not happen; if nothing is left, asks what they want built.
export function stripHandoffClaims(text, lang = 'en') {
  const kept = String(text || '')
    .split(/(?<=[.?؟。？])\s+/)
    .filter((sentence) => !CLAIM_RE.test(sentence));
  return kept.join(' ').trim() || ASK_WHAT[lang] || ASK_WHAT.en;
}
