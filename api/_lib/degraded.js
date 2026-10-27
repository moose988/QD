// api/_lib/degraded.js
// "Never go dark": a reply built from the knowledge base alone, for when every model is rate-limited,
// over budget, failing or past the deadline. It only ever repeats sentences that exist in the KB
// (in the visitor's language), so it cannot invent facts; prices, phone numbers and timelines are
// left out unless the visitor asked for them. The caller adds the action cards and the server-owned
// hand-off line exactly as on the normal path.

import { lexTokens } from './retrieval.js';

const INTERNAL_SOURCES = /sales-playbook/i; // instructions for the bot, not facts for visitors
const PRICE_RE = /\b(?:aed|usd|dhs?|dirhams?|\$|€|£)\s?\d|\d+\s?(?:aed|usd|dhs?|dirhams?)\b|درهم|迪拉姆|дирхам/iu;
const TIME_FIGURE_RE = /\d\s*(?:[-–]\s*\d+\s*)?(?:hours?|days?|weeks?|months?|ساع|يوم|أيام|أسابيع|小时|天|周|час|дн|недел)/iu;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const MARKUP_RE = /^\s*(?:[-*•]|\d+[.)]|#+|\|)/;

const STOP = new Set('the and you your yours can could for with what how are our have has does did this that these from will would about need want like just also into than then them they their there here which who when where why yes not all any some get got make made one more most much many very its it\'s is was were been be do of to in on at by or an we me my us hi hello hey please thanks'.split(' '));
const keyTokens = (t) => lexTokens(t).filter((w) => !STOP.has(w) && (w.length > 2 || /[^\x00-\x7f]/.test(w)));

const FALLBACK = {
  en: "I can't pull up a full answer right this moment, but the team can go through it with you directly.",
  ar: 'لا أستطيع جلب إجابة كاملة في هذه اللحظة، لكن الفريق يقدر يشرح لك كل شيء مباشرة.',
  zh: '我现在没法给出完整的回答，不过团队可以直接和你详细沟通。',
  ru: 'Сейчас я не могу дать полный ответ, но команда может всё подробно обсудить с вами напрямую.',
};

function sentencesOf(text) {
  return String(text || '')
    .split(/\n+/)
    .filter((line) => !MARKUP_RE.test(line))
    .join(' ')
    .replace(/\*\*|__|`/g, '')
    .split(/(?<=[.?!؟。？！])\s*/u)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 25 && s.length <= 260 && !/[?؟？]$/.test(s));
}

/**
 * chunks: retrieved KB chunks (best first). Returns { text, usedChunkIds, matched }.
 * matched=false means nothing in the KB fit the question and the honest fallback line was used.
 */
export function degradedReply({ message = '', lang = 'en', chunks = [], asksTime = false, asksContact = false, asksPrice = false } = {}) {
  const L = ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en';
  const q = new Set(keyTokens(message));
  const candidates = [];
  chunks
    .filter((c) => c && !INTERNAL_SOURCES.test(String(c.source || '')))
    .slice(0, 4)
    .forEach((c, rank) => {
      const sameLang = c.lang === L;
      for (const s of sentencesOf(c.text)) {
        if (!asksPrice && PRICE_RE.test(s)) continue;
        if (!asksTime && TIME_FIGURE_RE.test(s)) continue;
        if (!asksContact && PHONE_RE.test(s)) continue;
        const toks = keyTokens(s);
        let overlap = 0;
        for (const t of new Set(toks)) if (q.has(t)) overlap += 1;
        const headingOverlap = keyTokens(c.heading).filter((t) => q.has(t)).length;
        const score = overlap * 2 + headingOverlap - rank * 0.5 + (sameLang ? 3 : -10);
        candidates.push({ s, score, overlap: overlap + headingOverlap, id: c.id, sameLang });
      }
    });
  const usable = candidates.filter((c) => c.sameLang && c.overlap > 0).sort((a, b) => b.score - a.score);
  if (!usable.length) return { text: FALLBACK[L], usedChunkIds: [], matched: false };
  const picked = [usable[0]];
  const second = usable.find((c) => c !== usable[0] && c.id === usable[0].id && c.overlap > 0 && c.s !== usable[0].s);
  if (second && usable[0].s.length + second.s.length < 300) picked.push(second);
  return { text: picked.map((p) => p.s).join(' '), usedChunkIds: [...new Set(picked.map((p) => p.id))], matched: true };
}

export const DEGRADED_FALLBACK = FALLBACK;
