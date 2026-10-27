// api/_lib/handoff.js
// Server-owned hand-off, decided BEFORE the model call (no capture_lead tool needed):
//   decideHandoff  'handoff' | 'ask_what' | 'no_contact' | 'none'
//   buildLead      lead fields from the visitor's own words (business type, brief, urgency)
//   handoffNote    the one-line instruction the prompt gets for this turn
// The model is told the decision; the server then guarantees the reply matches it.

import { hasHandoffIntent } from './sanitize.js';
import { extractFacts } from './token-budget.js';

// Something concrete they want built (a business type alone is not enough).
const PROJECT_RE = /\b(?:web ?site|site|web ?page|landing page|web app|online (?:store|shop|ordering|booking|menu)|e-?commerce|ordering|order(?:s|ing)? online|booking|reservations?|appointments?|dashboard|admin panel|portal|crm|system|platform|app|chat ?bot|ai (?:chat|assistant)|automation|nfc|tags?|digital menu|menu|qr|loyalty|reviews?|business card|invitations?|invites?|rsvp|seating|check-?in|guest list|wedding|engagement|birthday|graduation|events?|redesign|database|inventory|payments?)\b|موقع|متجر إلكتروني|طلب أونلاين|حجز|لوحة تحكم|نظام|تطبيق|بوت|أتمتة|بطاق|ملصق|منيو|قائمة|دعوة|دعوات|زفاف|عرس|خطوبة|حفل|مناسب|فعالي|网站|网页|点餐|预订|仪表板|后台|系统|应用|机器人|自动化|标签|菜单|请柬|邀请|婚礼|活动|сайт|магазин|заказ|бронир|дашборд|панел|систем|приложен|бот|автоматиз|метк|меню|приглаш|свадьб|событи|мероприят/iu;

export function isUsableContact(contact) {
  const c = String(contact || '').trim();
  if (!c) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return true;
  return c.replace(/\D/g, '').length >= 7;
}

export function visitorContact(visitor) {
  if (isUsableContact(visitor?.phone)) return visitor.phone;
  if (isUsableContact(visitor?.email)) return visitor.email;
  return '';
}

/**
 * userTexts: the visitor's own messages, oldest first, including the current one (original text).
 * alreadyHandedOff: a lead was saved earlier in this session (known from history/Firestore).
 */
// ─── Consent: the bot offers, the visitor answers ───────────────────────────
// The offer ("If you'd like, I can have the team message you.") is recognised in the next turn.
export const ASK_RE = /(?:if you(?:['’]d| would) like|would you like|do you want|shall i|want me to)[^.?!]{0,50}\bteam\b[^.?!]{0,30}(?:message|contact|reach|get in touch|follow up)|(?:إذا رغبت|إذا تحب|هل تود|هل ترغب|تحب|لو تحب)[^.؟]{0,60}الفريق[^.؟]{0,30}(?:يراسل|يتواصل|يتصل)|(?:如果你愿意|如果你想|是否需要|要不要|需要我)[^。？]{0,20}团队[^。？]{0,12}(?:联系|与你联系|和你联系)|(?:если хотите|хотите ли|желаете)[^.?]{0,50}команд[^.?]{0,25}(?:напиш|написа|свяж)/iu;
const YES_RE = /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|go ahead|sounds good|why not|do it|of course|definitely|absolutely|y)\b|^\s*(?:نعم|ايوه|أيوه|اي|أكيد|تمام|ماشي|طيب|يلا|حاضر|اوكي|ايه)(?:\s|$|[,.!؟?])|^\s*(?:好的?|可以|行|要|需要|没问题|嗯|是的)(?:[，,。.!！\s]|$)|^\s*(?:да|конечно|давайте|хорошо|ок|ладно|пожалуйста)(?:\s|$|[,.!?])/iu;
const NO_RE = /^\s*(?:no|nope|nah|not now|no thanks|no thank you|not yet|maybe later|later)\b|^\s*(?:لا|لاحقا|لاحقاً|مش)(?:\s|$|[,.!؟?])|^\s*(?:不|不用|不需要|暂时不|先不)(?:[，,。.!！\s]|$|要|用)|^\s*(?:нет|не надо|не нужно|позже|пока нет)(?:\s|$|[,.!?])/iu;
const SHORT_ANSWER_WORDS = 7;

export const CONSENT_ASK = {
  en: "If you'd like, I can have the team message you.",
  ar: 'إذا رغبت، أستطيع أن أجعل الفريق يراسلك.',
  zh: '如果你愿意，我可以让团队和你联系。',
  ru: 'Если хотите, я попрошу команду написать вам.',
};
export const CONFIRM_LINE = {
  en: 'Great, the team will message you soon.',
  ar: 'تمام، الفريق سيراسلك قريباً.',
  zh: '好的，团队很快会联系你。',
  ru: 'Отлично, команда скоро вам напишет.',
};
export const DECLINE_LINE = {
  en: "No problem, I won't pass it on. How else can I help?",
  ar: 'لا مشكلة، لن أحوّله للفريق. كيف أقدر أساعدك؟',
  zh: '没问题，我先不转交。你还想了解什么？',
  ru: 'Хорошо, не буду передавать. Что ещё вас интересует?',
};

export function decideHandoff({ userTexts = [], visitor = null, alreadyHandedOff = false, alreadyAsked = false, lastAssistant = '' } = {}) {
  const texts = userTexts.map((t) => String(t || ''));
  // The visitor is answering our offer to have the team message them.
  const answer = (texts[texts.length - 1] || '').trim();
  if (ASK_RE.test(String(lastAssistant || '')) && answer && answer.split(/\s+/).length <= SHORT_ANSWER_WORDS) {
    if (YES_RE.test(answer)) return { decision: 'confirm', reason: 'visitor accepted the offer' };
    if (NO_RE.test(answer)) return { decision: 'decline', reason: 'visitor declined the offer' };
  }
  const recent = texts.slice(-3).join(' ');
  if (!hasHandoffIntent(recent)) return { decision: 'none', reason: 'no intent' };
  if (alreadyHandedOff) return { decision: 'already', reason: 'lead exists' };
  if (alreadyAsked) return { decision: 'asked', reason: 'offer already made' };
  const facts = extractFacts(texts);
  const priorTurns = Math.max(0, texts.length - 1);
  // Their business plus a concrete proposal we already made ("a website with online ordering") counts.
  const knowsWhat = texts.some((t) => PROJECT_RE.test(t)) || (Boolean(facts.business) && (priorTurns >= 2 || PROJECT_RE.test(String(lastAssistant || ''))));
  if (!knowsWhat) return { decision: 'ask_what', reason: 'project unknown', facts };
  if (!visitorContact(visitor)) return { decision: 'no_contact', reason: 'no contact', facts };
  return { decision: 'handoff', reason: 'intent + project + contact', facts };
}

export function buildLead({ userTexts = [], visitor = null, lang = 'en' } = {}) {
  const facts = extractFacts(userTexts);
  const contact = visitorContact(visitor);
  const brief = userTexts
    .map((t) => String(t || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-4)
    .join(' / ');
  return {
    name: String(visitor?.name || '').trim(),
    contact,
    contact_type: /@/.test(contact) ? 'email' : contact ? 'whatsapp' : 'other',
    business_type: facts.business || '',
    project_brief: brief.length > 600 ? `${brief.slice(0, 597)}...` : brief,
    interests: facts.goals || [],
    event_date: facts.date || '',
    guests: facts.guests || '',
    urgency: facts.urgency || 'unknown',
    contactConsent: 'asked', // becomes 'yes' or 'no' when the visitor answers the offer
    language: ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en',
  };
}

const NOTES = {
  handoff:
    "SERVER HANDOFF DECISION: first answer their last question in one short sentence (pricing is custom and depends on the scope, never a figure; timing only if they asked, hedged by scope). Then OFFER the team as a question, for example: 'If you'd like, I can have the team message you.' Do NOT say or imply that the team will message them or that anything was passed on. Don't ask for contact details.",
  asked:
    "SERVER HANDOFF DECISION: you already offered to have the team message them and they haven't answered yet. Answer their question briefly in one short sentence. Do not offer again and do not say the team will message them.",
  already:
    "SERVER HANDOFF DECISION: the team already has this request. Answer briefly. Don't repeat the hand-off; if they ask about price or timing again, say the team will be in touch shortly with the details.",
  ask_what:
    "SERVER HANDOFF DECISION: not yet, you don't know what they want built. Say pricing is custom and depends on what they need, then ask in one short sentence what they're looking to build. Do not mention the team.",
  no_contact:
    'SERVER HANDOFF DECISION: they want a quote but there is no contact yet. Say pricing is custom and that the team can follow up, then ask how the team should reach them: WhatsApp, phone or email.',
};

export function handoffNote(decision) {
  return NOTES[decision] || '';
}

export const HANDOFF_LINE = {
  en: "I'll pass this to the team, and they'll message you soon.",
  ar: 'سأحوّل طلبك للفريق، وسيراسلونك قريباً.',
  zh: '我会把这个转给团队，他们很快会联系你。',
  ru: 'Передам это команде, и они скоро вам напишут.',
};
