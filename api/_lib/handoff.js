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
export function decideHandoff({ userTexts = [], visitor = null, alreadyHandedOff = false, lastAssistant = '' } = {}) {
  const texts = userTexts.map((t) => String(t || ''));
  const recent = texts.slice(-3).join(' ');
  if (!hasHandoffIntent(recent)) return { decision: 'none', reason: 'no intent' };
  if (alreadyHandedOff) return { decision: 'already', reason: 'lead exists' };
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
    language: ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en',
  };
}

const NOTES = {
  handoff:
    "SERVER HANDOFF DECISION: this request is now with the team. First answer their last question in one short sentence (pricing is custom and depends on the scope, never a figure; timing only if they asked, hedged by scope), then say the team will message them soon. Don't ask for contact details.",
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
