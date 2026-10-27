#!/usr/bin/env node
// scripts/measure-tokens.mjs
// Estimates input tokens per chat request BEFORE (previous pipeline) vs AFTER (token budget), with no
// live calls. Counts use the real gpt-oss tokenizer (o200k_harmony from the gpt-tokenizer dev
// dependency); the runtime heuristic estimateTokens() is shown next to it.
//
// BEFORE = legacy prompt layout + capture_lead tool schema + 10 history messages (assistant <= 600 chars)
//          + the raw visitor message.
// AFTER  = static-first prompt (no tool) + 2 verbatim turns as intent notes + facts line + the note.
// "cached" is the shared static prefix: on a Groq prompt-cache hit those tokens do not count toward
// TPM/TPD, so "billable on hit" is what the limits see. Real numbers: the [chat-usage] log lines.
//
// Run: node scripts/measure-tokens.mjs

process.env.FIREBASE_PROJECT_ID ??= '';
process.env.FIREBASE_SERVICE_ACCOUNT ??= '';

const { countTokens } = await import('gpt-tokenizer/encoding/o200k_harmony');
const { buildSystemPrompt, LEAD_TOOL, staticPromptPrefix } = await import('../api/_lib/prompt.js');
const { compactHistory, estimateTokens } = await import('../api/_lib/token-budget.js');
const { compressIntent, compressTurn } = await import('../api/_lib/intent.js');
const { retrieveLexical } = await import('../api/_lib/retrieval.js');
const { describeActions, detectActions } = await import('../api/_lib/actions.js');
const { decideHandoff, handoffNote } = await import('../api/_lib/handoff.js');

const VISITOR = { name: 'Sara', email: 'sara@example.com', phone: '', page: '/' };
const PER_MESSAGE_OVERHEAD = 4; // harmony role/channel markers per message
const OUTPUT_TOKENS = 150; // typical reply + low-effort reasoning (max_tokens was 450, now 320)

const ramble = `Hi there, hope you are well! So I have been thinking about this for a while and I wanted to reach out. I run a small restaurant in Dubai Marina, we have about 25 tables and we do a lot of delivery as well. Right now people call us on the phone to order and it is honestly a mess, we lose orders all the time and my staff gets confused. ${'Weekends are the worst because everyone calls at once and we cannot pick up. '.repeat(7)}I have been thinking about getting a website where people can order online, and maybe also something on the tables so people can see the menu without asking the waiter. My cousin told me about NFC tags, I don't really know how they work. We also want to open a second branch in Jumeirah around 14 November so it would be nice to have everything ready before that. Also, my email is owner@example.com if that helps. Anyway, how much would something like this cost and how long would it take? Thanks so much in advance, really appreciate it.`;

const eightTurns = [
  ['hi, i have a restaurant', 'For a restaurant, the two that fit best are a website where guests can order online, and NFC tags on the tables so they can tap to see the menu. Happy to go into either.'],
  ['what can you offer', 'A website with online ordering and a menu, plus NFC tags on each table that open the menu or the ordering page. Which one matters more right now?'],
  ['can you elaborate', 'The website gives guests a place to browse the menu and place orders without calling. The NFC tags sit on each table, so a tap opens the menu or ordering page directly on their phone.'],
  ['do the tags need an app', 'No app is needed: any modern phone opens the page with a tap. We set up what each tag opens and test it on real phones.'],
  ['we have 25 tables and 2 branches', 'That works well: each table gets its own tag, and both branches can share one ordering site with a branch picker.'],
  ['can it show orders in one place', 'Yes, a dashboard can show orders from both branches in one place so staff see everything as it comes in.'],
  ['and reviews?', 'A tag can also open your review page, so happy guests can leave a review in a couple of taps.'],
];

const CASES = [
  { id: 'short message', lang: 'en', message: 'hi, I have a restaurant. What can you offer?', history: [] },
  { id: '1,500-char rambling message', lang: 'en', message: ramble, history: [] },
  { id: '8-turn conversation', lang: 'en', message: 'whats the cost', history: eightTurns.flatMap(([u, a]) => [{ role: 'user', content: u }, { role: 'assistant', content: a }]) },
  { id: 'Arabic', lang: 'ar', message: 'هلا، عندي مطعم، وش تقدمون؟', history: [] },
  { id: 'Chinese', lang: 'zh', message: '你好，我有一家餐厅，你们能提供什么？', history: [] },
  { id: 'Russian', lang: 'ru', message: 'Здравствуйте, у меня ресторан, что вы можете предложить?', history: [] },
];

const msgTokens = (messages, tools) =>
  messages.reduce((n, m) => n + PER_MESSAGE_OVERHEAD + countTokens(m.content), 3) + (tools ? countTokens(JSON.stringify(tools)) : 0);

const rows = [];
for (const c of CASES) {
  const userTexts = [...c.history.filter((m) => m.role === 'user').map((m) => m.content), c.message];
  const chunks = await retrieveLexical(c.message.slice(0, 600), { topK: 4, lang: c.lang });
  const actionsNote = describeActions(detectActions(c.message, c.lang));

  // BEFORE
  const oldHistory = c.history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'assistant' ? 600 : 1500) }));
  const oldSystem = buildSystemPrompt({ lang: c.lang, contextChunks: chunks, visitor: VISITOR, recentUserText: userTexts.slice(-3).join(' '), actionsNote, useTool: true });
  const before = msgTokens([{ role: 'system', content: oldSystem }, ...oldHistory, { role: 'user', content: c.message }], [LEAD_TOOL]);

  // AFTER
  const compact = compactHistory(c.history, { keepTurns: 2, assistantChars: 300, userTextsForFacts: userTexts, compressUser: compressTurn });
  const lastAssistant = [...c.history].reverse().find((m) => m.role === 'assistant')?.content || '';
  const hd = decideHandoff({ userTexts, visitor: VISITOR, lastAssistant });
  const newSystem = buildSystemPrompt({ lang: c.lang, contextChunks: chunks, visitor: VISITOR, actionsNote, factsLine: compact.factsLine, handoffNote: handoffNote(hd.decision) });
  const note = compressIntent(c.message).text;
  const afterMessages = [{ role: 'system', content: newSystem }, ...compact.messages, { role: 'user', content: note }];
  const after = msgTokens(afterMessages);
  const cached = countTokens(staticPromptPrefix());
  const heuristic = afterMessages.reduce((n, m) => n + PER_MESSAGE_OVERHEAD + estimateTokens(m.content), 3);
  rows.push({ case: c.id, before, after, cacheHitBillable: after - cached, heuristicAfter: heuristic, userMsgBefore: countTokens(c.message), userMsgAfter: countTokens(note) });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('case', 30)}${pad('before', 8)}${pad('after', 8)}${pad('on cache hit', 14)}${pad('heuristic', 11)}visitor msg`);
for (const r of rows) console.log(`${pad(r.case, 30)}${pad(r.before, 8)}${pad(r.after, 8)}${pad(r.cacheHitBillable, 14)}${pad(r.heuristicAfter, 11)}${r.userMsgBefore} -> ${r.userMsgAfter}`);
const avg = (k) => Math.round(rows.reduce((n, r) => n + r[k], 0) / rows.length);
const cap = (input) => Math.floor(200000 / (input + OUTPUT_TOKENS));
const perMin = (input) => (8000 / (input + OUTPUT_TOKENS)).toFixed(1);
console.log(`\naverage input tokens: before ${avg('before')}, after ${avg('after')}, after on cache hit ${avg('cacheHitBillable')} (static prefix ${countTokens(staticPromptPrefix())} tokens)`);
console.log(`model calls per model per day (200k TPD, +${OUTPUT_TOKENS} output): before ${cap(avg('before'))}, after ${cap(avg('after'))}, after with cache hits ${cap(avg('cacheHitBillable'))}`);
console.log(`model calls per model per minute (8k TPM): before ${perMin(avg('before'))}, after ${perMin(avg('after'))}, with cache hits ${perMin(avg('cacheHitBillable'))}`);
console.log('Greetings, thanks, emoji and cached generic first questions cost 0 tokens and are not in these numbers.');
