// api/_lib/intent.js
// Deterministic intent compressor: turns a visitor message into a short telegraphic note before it
// reaches the model, e.g. "hi, I have a restaurant. What can you offer?" -> "restaurant; asks: offer".
// Zero tokens, EN/AR/ZH/RU (+ common Arabizi). The original text is never discarded by the caller:
// it is still used for language detection, the conversation log, the lead brief and hand-off rules.
//
// Safety first: the note is only used when the extractor recognised almost everything the visitor
// said (coverage check) and every number, date, email and URL survives. Otherwise the original
// (or, for long messages, the extractive compressMessage result) is returned unchanged.

import { compressMessage, extractEntities, estimateTokens, COMPRESS_TRIGGER_CHARS } from './token-budget.js';

// A number that stands on its own (not a digit inside an Arabizi word), plus an optional unit word.
const NUM_CORE = String.raw`(?<![\p{L}\p{Nd}])([+]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*)(?:(?=(?:st|nd|rd|th|pm|am|k)(?![\p{L}]))|(?![\p{L}]))`;
const STANDALONE_NUM_RE = new RegExp(String.raw`${NUM_CORE}\s*([^\s\p{P}\p{Nd}]+(?:\s[a-z](?![\p{L}]))?)?`, 'giu');
const NUM_ONLY_RE = new RegExp(NUM_CORE, 'giu');

// Emails, links, dates and standalone numbers: what a note must never drop.
export function visibleEntities(text) {
  const t = String(text ?? '');
  const nums = new Set([...t.matchAll(STANDALONE_NUM_RE)].map((m) => m[1]));
  return uniq(extractEntities(t).filter((e) => !/^[+]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*$/u.test(e) || nums.has(e)));
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────
// Each entry: [canonical label, pattern]. Patterns consume the words they match for the coverage check.
const ASKS = [
  ['offer', /\bwhat (?:else )?(?:can|could|do|would) (?:you|u|ya) (?:guys )?(?:offer|provide|do|suggest|recommend|have)(?: for (?:me|us|it|that|this|my \w+|a \w+))?\b|\bwhat do (?:you|u) (?:guys )?(?:build|make|sell|do)\b|\bwhat (?:are )?(?:your|ur) services\b|\bwhat services\b|\bwhat can you do\b|ايش تقدمون|وش تقدمون|شو تقدمون|ماذا تقدمون|ماذا تبنون|ايش تسوون|وش تسوون|شو بتقدموا|ما هي خدماتكم|خدماتكم|你们能提供什么|你们提供什么|能提供什么|你们做什么|你们能做什么|что вы (?:можете )?предложить|что вы предлагаете|что вы делаете|что вы создаёте|ваши услуги|какие услуги|\b(?:shu|sho|esh|eish|wesh) (?:t9adimoon|tqadmoon|t2admo|t3emlo)\b/giu],
  ['cost', /\bhow much(?: (?:is|does|would|will) (?:it|that|this|one|a \w+)(?: cost| be)?)?\b|\b(?:what(?:'s| is)?|whats) (?:the )?(?:cost|price|pricing)\b|\b(?:cost|costs|price|prices|pricing|quote|quotation|ballpark|budget|estimate)\b|كم السعر|كم التكلفة|كم تكلف|كم يكلف|بكم|السعر|الأسعار|التكلفة|تكلفة|عرض سعر|多少钱|价格|报价|费用|сколько стоит|сколько это стоит|цена|цены|стоимость|\b(?:kam|bikam|b kam|qaddesh|adesh) (?:el|al)?\s?(?:si3r|s3r|taklfa)\b|\bbikam\b/giu],
  ['timeline', /\bhow (?:long|fast|quickly|soon)(?: (?:does|will|would) (?:it|that|this|a project|the project) take)?\b|\b(?:timeline|time ?frame|turnaround|delivery time|lead time)\b|\bwhen can (?:you|it be) (?:start|finish|deliver|ready)\b|كم يستغرق|كم تستغرق|كم تأخذ|كم ياخذ|المدة|مدة المشروع|متى يجهز|多久|多长时间|要多久|сколько времени|сроки|как быстро/giu],
  ['how it works', /\bhow (?:does|do|would) (?:it|this|that|they|nfc|the \w+) work\b|\bhow it works\b|\bhow does (?:it|this) go\b|كيف يعمل|كيف تعمل|كيف تشتغل|كيف يشتغل|怎么用|怎么运作|如何运作|как (?:это )?работает|как работают/giu],
  ['elaborate', /\b(?:can you |could you )?(?:elaborate|explain more|tell me more|more (?:details|info|information))\b|اشرح أكثر|اشرح|وضح|تفاصيل أكثر|详细说说|详细介绍|多说一点|подробнее|расскажите подробнее/giu],
  ['can you build', /\b(?:can|could|do) (?:you|u) (?:guys )?(?:also )?(?:build|make|create|do|set up|setup|design|develop|handle|offer)\b|\bdo you (?:guys )?(?:also )?(?:do|offer|have|make|build)\b|هل تقدرون|تقدرون تسوون|هل تسوون|هل تعملون|هل تبنون|你们能做|能不能做|你们做不做|вы можете сделать|можете сделать|вы делаете/giu],
  ['examples', /\b(?:show me|can i see|see some|examples? of)\b(?: (?:some|your|of your))? ?(?:work|examples?|demos?|portfolio|projects)?|\b(?:your (?:work|portfolio|projects)|past work|previous work|demos?|portfolio)\b|أعمالكم|نماذج|أمثلة|作品|案例|示例|примеры|портфолио|ваши работы/giu],
  ['login', /\b(?:where (?:do|can) i |how (?:do|can) i )?(?:log ?in|login|sign ?in)\b|تسجيل (?:ال)?دخول|أسجل دخول|اسجل دخول|登录|登陆|вход|войти/giu],
  ['book a call', /\b(?:book|schedule|arrange|set up) (?:a |the )?(?:call|meeting|appointment|consultation|demo)\b|\b(?:call me|call back|talk to (?:someone|a person|a human|the team)|speak to (?:someone|a person|a human))\b|احجز(?: لي)? مكالمة|حجز موعد|مكالمة|预约|约个时间|созвон|записаться на звонок/giu],
  ['contact', /\bhow (?:can|do) i (?:contact|reach|call|message)(?: you| your team| the team)?(?: directly)?\b|\b(?:your )?(?:whatsapp|phone) number\b|كيف أتواصل|كيف اتواصل|رقمكم|联系方式|怎么联系|как (?:с вами )?связаться/giu],
  ['are you ai', /\bare (?:you|u) (?:a )?(?:real )?(?:person|human|bot|robot|ai)(?: or (?:a )?(?:bot|human|person|ai))?\b|هل أنت (?:بوت|إنسان|روبوت)|你是机器人吗|你是真人吗|вы (?:бот|человек)/giu],
  ['not sure', /\b(?:not sure|no idea|dunno|i don'?t know yet)\b|مو متأكد|لست متأكد|不确定|не уверен/giu],
];

const WANTS = /\b(?:i|we) (?:need|want|would like|wanna|am looking for|are looking for|'m looking for|'re looking for|need to build|want to build|need to get|want to get)\b|\b(?:i|we)'?d like\b|\blooking for\b|\bneed(?:s)?\b|\bwant(?:s)?\b|أحتاج|احتاج|نحتاج|أبي|ابي|ابغى|أبغى|بدي|أريد|اريد|نريد|我需要|我想要|我们需要|想要|需要|мне нужен|мне нужна|мне нужно|нам нужен|нам нужна|нужен|нужна|хочу|хотим|\b(?:abi|abgha|biddi|bdi|a7taj)\b/giu;

const SERVICES = [
  ['website', /\b(?:web ?site|site|web ?page|landing page|web)\b|موقع(?: إلكتروني)?|网站|网页|сайт/giu],
  ['online ordering', /\b(?:online ordering|order(?:ing)? online|online orders?|ordering(?: system)?)\b|طلب(?:ات)? أونلاين|الطلب أونلاين|在线点餐|在线订餐|онлайн[- ]заказ\p{L}*/giu],
  ['online store', /\b(?:online (?:store|shop)|e-?commerce|webshop)\b|متجر إلكتروني|متجر الكتروني|网店|在线商店|интернет-магазин/giu],
  ['booking', /\b(?:online )?(?:booking|bookings|reservations?|appointments?)(?: system)?\b|حجز(?:ات)?|حجوزات|预订|预约系统|бронировани\p{L}*|запись/giu],
  ['dashboard', /\b(?:admin )?(?:dashboard|admin panel|back ?office)\b|لوحة تحكم|داشبورد|仪表板|后台|дашборд|панель управления/giu],
  ['system', /\b(?:custom )?(?:system|platform|portal|crm|erp|pos)\b|نظام|منصة|系统|平台|систем\p{L}*|платформ\p{L}*/giu],
  ['database', /\bdatabase\b|قاعدة بيانات|数据库|база данных/giu],
  ['app', /\b(?:mobile )?apps?\b|تطبيق|应用|приложени\p{L}*/giu],
  ['chatbot', /\b(?:chat ?bot|ai (?:chat|assistant|bot)|whatsapp (?:bot|flow|automation))\b|بوت|شات بوت|聊天机器人|чат-?бот/giu],
  ['automation', /\bautomat(?:ion|e|ed)\b|أتمتة|自动化|автоматизаци\p{L}*/giu],
  ['nfc tags', /\bnfc(?: tags?| cards?| stickers?)?\b|\b(?:smart )?(?:tags?|stickers?)\b|بطاق(?:ة|ات)?(?: nfc)?|ملصق(?:ات)?|标签|nfc[- ]?метк\p{L}*|метк\p{L}*/giu],
  ['digital menu', /\b(?:digital |qr )?menu\b|منيو|قائمة(?: رقمية)?|菜单|меню/giu],
  ['invitations', /\b(?:digital |wedding |event )?invit(?:ation|ations|es?)\b|دعو(?:ة|ات)|请柬|邀请函|приглашени\p{L}*/giu],
  ['rsvp', /\brsvps?\b|تأكيد الحضور|回复出席|подтверждени\p{L}* участия/giu],
  ['seating', /\bseating(?: plan| chart)?\b|توزيع (?:ال)?طاولات|座位|рассадк\p{L}*/giu],
  ['check-in', /\bcheck-?in\b|تسجيل حضور|签到|регистраци\p{L}* гостей/giu],
  ['loyalty', /\bloyalty(?: program| points)?\b|ولاء|会员积分|лояльност\p{L}*/giu],
  ['reviews', /\b(?:google )?reviews?\b|تقييمات|评价|отзыв\p{L}*/giu],
  ['business card', /\b(?:digital )?business cards?\b|بطاقة أعمال|名片|визитк\p{L}*/giu],
  ['redesign', /\bre-?design|re-?build\b|إعادة تصميم|重新设计|редизайн/giu],
  ['payments', /\b(?:online )?payments?\b|دفع إلكتروني|在线支付|оплат\p{L}*/giu],
];

const EVENTS = /\b(?:wedding|engagement|birthday|graduation|gender reveal|baby shower|party|corporate event|conference|gala|celebration|event)s?\b|زفاف|عرس|خطوبة|عيد ميلاد|تخرج|حفل|حفلة|مناسب\p{L}*|فعالي\p{L}*|婚礼|订婚|生日|毕业|派对|活动|свадьб\p{L}*|помолвк\p{L}*|день рождения|выпускн\p{L}*|праздник|мероприяти\p{L}*|событи\p{L}*/giu;

const BUSINESS = /\b(?:restau?rant|resturan?t|resturnat|restraunt|resto|cafe|café|coffee ?shop|bakery|bar|lounge|cloud kitchen|catering|hotel|villa|resort|holiday homes?|airbnb|salon|spa|barber ?shop|barber|clinic|clic|dental clinic|dentist|hospital|pharmacy|gym|fitness (?:center|centre|studio)|studio|retail store|retail|shop|store|boutique|clothing (?:shop|store|brand)|clothing|fashion brand|jewel(?:le)?ry (?:shop|store)|perfume (?:shop|store)|real estate(?: agency)?|property|agency|school|academy|nursery|training center|car rental|garage|laundry|cleaning company|logistics|startup|wedding planner|event planner|photographer|law firm|consultancy|construction company|interior design|florist|pet shop|supermarket|grocery|restaurant group)(?:e?s)?\b|مطعم|مطاعم|مقهى|كافيه|كوفي شوب|مخبز|فندق|فيلا|منتجع|صالون|سبا|عيادة|مستشفى|صيدلية|نادي رياضي|جيم|متجر|محل|بوتيك|محل ملابس|عقار(?:ات)?|وكالة|مدرسة|أكاديمية|حضانة|مغسلة|餐厅|餐馆|咖啡店|咖啡馆|面包店|酒店|别墅|美容院|沙龙|诊所|医院|药店|健身房|商店|店铺|服装店|房地产|学校|ресторан\p{L}*|кафе|кофейн\p{L}*|пекарн\p{L}*|отел\p{L}*|гостиниц\p{L}*|вилл\p{L}*|салон\p{L}*|клиник\p{L}*|больниц\p{L}*|аптек\p{L}*|спортзал|фитнес|магазин\p{L}*|бутик\p{L}*|недвижимост\p{L}*|агентств\p{L}*|школ\p{L}*|\b(?:mat3am|mataam|ma63am|ma6am|kafee|ahwa|9aloon|3eyada|eyada)\b/giu;

const PLACES = /\b(?:dubai|abu dhabi|sharjah|ajman|ras al khaimah|rak|fujairah|umm al quwain|al ain|uae|emirates|marina|jumeirah|jlt|business bay|downtown|deira|bur dubai|khalifa city|saudi(?: arabia)?|riyadh|jeddah|qatar|doha|kuwait|bahrain|oman|muscat|egypt|cairo|jordan|amman|london|china|russia|moscow)\b|دبي|أبوظبي|ابوظبي|أبو ظبي|الشارقة|الشارقه|عجمان|رأس الخيمة|الفجيرة|العين|الإمارات|الامارات|السعودية|الرياض|جدة|قطر|الدوحة|الكويت|البحرين|عمان|مسقط|مصر|القاهرة|迪拜|阿布扎比|沙迦|阿联酋|Дуба[йе]|Абу-Даби|Шардж\p{L}*|ОАЭ|эмират\p{L}*/giu;

const GREETING = /\b(?:hi+|hello+|hey+|hiya|yo|good (?:morning|afternoon|evening|day)|greetings|salam|salaam|assalamu? alaikum|marhaba|mar7aba|hala|ahlan)\b|مرحبا|مرحباً|هلا|هلا والله|أهلا|اهلا|السلام عليكم|سلام|صباح الخير|مساء الخير|你好|您好|嗨|привет|здравствуйте|добрый (?:день|вечер)|доброе утро/giu;

const FILLER = /\b(?:please|pls|plz|thanks?|thank you|thx|ty|so|well|ok(?:ay)?|okey|um+|uh+|hmm+|just|really|actually|basically|also|anyway|btw|guys|bro|sir|madam|dear|team|kindly|hope you(?:'re| are) (?:well|good|doing well)|i was wondering|i wanted to ask|quick question|a question|question|i have a question|let me know|tell me|can you tell me|could you tell me|i'?d like to know|want to know|wanted to know)\b|من فضلك|لو سمحت|شكرا|شكراً|يعطيك العافية|الله يعافيك|طيب|تمام|ممكن|سؤال|请问|谢谢|麻烦|一下|пожалуйста|спасибо|подскажите|скажите|вопрос|\b(?:law sama7t|lw sm7t|shukran|yalla)\b/giu;

// Words that carry no meaning of their own once the slots above are extracted.
const STOP = new Set(('a an the i im i\'m ive i\'ve me my mine we our us you your u ur ya it its it\'s is are am was were be been being ' +
  'have has had having do does did doing will would can could should shall may might must to of in on at for with from by as ' +
  'and or but if then than that this these those there here what which who whom how when where why also too very ' +
  'some any all much many more most own same other such into about over out up down off again further once ' +
  'got get gets getting go going make made like one thing things something stuff kind sort lot lots bit ' +
  'for my business company place own small big new current our right now currently already still yet ' +
  'build building make create get develop design set setup up planning plan organizing organising around about approximately ' +
  'online see view guests people customers clients like maybe possible please ' +
  '3andi 3ndi 3indi ana enta inta w el al fi bas bs abi ' +
  'و ل ب ف لـ ال ' +
  'هل انا أنا عندي عندنا لدي لدينا عندك انتم أنتم انت أنت هو هي هذا هذه ذلك في على من الى إلى عن مع و او أو ثم لي لنا ' +
  'لكم ما ماذا كيف وين أين شو ايش وش يا اي أي كل بس فقط ايضا أيضا يعني الحين الآن ' +
  '我 我们 你 你们 的 了 吗 呢 吧 是 有 一个 一家 一 个 家 在 和 也 都 就 这 那 么 啊 呀 ' +
  'я мы вы ты у меня нас вас это этот эта и в на с для по к о а но или ли же бы есть мой моя наш наша что как').split(/\s+/).filter(Boolean));

const NEGATION = /\b(?:no|not|don'?t|dont|doesn'?t|didn'?t|won'?t|never|without|nothing|none)\b|لا |بدون|مو |مش |ما أبي|ما ابي|ليس|不要|不需要|不用|没有|не |без |нет\b/iu;
const UNIT_RE = /^(?:tables?|guests?|people|persons|pax|branches|branch|locations?|pages?|products?|items?|rooms?|staff|employees|days?|weeks?|months?|hours?|am|pm|p ?m|a ?m|aed|dhs|dirhams?|usd|\$|k|طاولة|طاولات|ضيف|شخص|فرع|فروع|صفحة|منتج|يوم|أيام|ساعة|درهم|张桌子|桌|位|人|家|个|天|小时|столов|гостей|человек|филиал\p{L}*|страниц\p{L}*|дней|часов|дирхам\p{L}*)$/iu;

function normalizeSpaces(s) {
  return String(s ?? '').replace(/\s+/gu, ' ').trim();
}

function scriptOf(text) {
  const t = String(text || '');
  if (/[؀-ۿ]/u.test(t)) return 'ar';
  if (/[一-鿿]/u.test(t)) return 'zh';
  if (/[Ѐ-ӿ]/u.test(t)) return 'ru';
  return null;
}

const ARABIZI_RE = /\b(?:3andi|3ndi|3indi|mat3am|ma6am|bikam|qaddesh|shu|sho|eish|wesh|abgha|biddi|a7taj|mar7aba|law sama7t|yalla|inshallah|habibi|7abibi)\b|\b[a-z]+[235679][a-z]+\b|\b[3579](?!(?:st|nd|rd|th)\b)[a-z]{2,}\b/iu;
const NOTE_RE = /^(?:[^;]{1,80}; )*(?:asks|wants|about|event|place|details|not|style): |^greeting$/u;

function uniq(list) {
  const out = [];
  for (const x of list) if (x && !out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
  return out;
}

/**
 * Compresses one visitor message into a telegraphic note.
 * Returns { text, compressed, confidence, slots }. `text` is what the model should see.
 */
export function compressIntent(input, { minSavingRatio = 0.15 } = {}) {
  const original = typeof input === 'string' ? input : String(input ?? '');
  const clean = normalizeSpaces(original);
  const fallback = (reason, confidence = 0) => {
    const text = clean.length > COMPRESS_TRIGGER_CHARS ? compressMessage(clean) : original;
    return { text: text.length <= original.length ? text : original, compressed: false, confidence, reason, slots: null };
  };
  if (!clean) return { text: original, compressed: false, confidence: 1, reason: 'empty', slots: null };
  if (NOTE_RE.test(original)) return { text: original, compressed: false, confidence: 1, reason: 'already a note', slots: null };

  let rest = ` ${clean.toLowerCase()} `;
  const consume = (re) => {
    const found = [];
    rest = rest.replace(re, (m) => {
      found.push(m.trim());
      return ' ';
    });
    return found;
  };

  // Entities first so their digits are not eaten by other patterns. Digits inside words
  // (Arabizi such as "mat3am", "si3r") are letters there, not numbers.
  const entities = visibleEntities(clean);
  const numbersWithUnits = [];
  for (const m of clean.matchAll(STANDALONE_NUM_RE)) {
    const rawUnit = m[2] ? m[2].trim() : '';
    const unit = rawUnit && UNIT_RE.test(rawUnit) ? rawUnit.replace(/^p ?m$/i, 'pm').replace(/^a ?m$/i, 'am') : '';
    numbersWithUnits.push(unit ? `${m[1]} ${unit}` : m[1]);
    if (unit) rest = rest.replace(rawUnit.toLowerCase(), ' ');
  }
  for (const e of entities) rest = rest.split(e.toLowerCase()).join(' ');
  rest = rest.replace(NUM_ONLY_RE, ' ');

  // Negations change meaning: keep the negated clause verbatim instead of guessing its scope.
  const negations = [];
  for (const m of clean.matchAll(new RegExp(`(?:${NEGATION.source})[^.,!?؟。！？،;]{0,60}`, 'giu'))) negations.push(normalizeSpaces(m[0]));

  const greeting = consume(GREETING).length > 0;
  const asks = [];
  for (const [label, re] of ASKS) if (consume(new RegExp(re.source, re.flags)).length) asks.push(label);
  // Services before business types, so "online store" is a service and not a "store".
  const services = [];
  for (const [label, re] of SERVICES) {
    const hits = consume(new RegExp(re.source, re.flags));
    if (hits.length) services.push(scriptOf(hits[0]) ? hits[0] : label);
  }
  const businessHits = consume(new RegExp(BUSINESS.source, BUSINESS.flags));
  const eventHits = consume(new RegExp(EVENTS.source, EVENTS.flags));
  const wants = consume(new RegExp(WANTS.source, WANTS.flags)).length > 0;
  const places = uniq(consume(new RegExp(PLACES.source, PLACES.flags)));
  consume(new RegExp(FILLER.source, FILLER.flags));
  if (negations.length) consume(new RegExp(NEGATION.source, 'giu'));

  // Coverage: how much of the visitor's wording did we account for?
  const leftover = rest
    .replace(/['’]/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((w) => (/[一-鿿]/u.test(w) ? [...w].filter((c) => !STOP.has(c)) : [w]))
    .filter((w) => !STOP.has(w));
  const totalWords = Math.max(1, clean.split(/\s+/u).length + ((clean.match(/[一-鿿]/gu) || []).length / 2));
  const leftoverWeight = leftover.reduce((n, w) => n + (/[一-鿿]/u.test(w) ? 0.5 : 1), 0);
  const confidence = Math.max(0, 1 - leftoverWeight / totalWords);

  const business = uniq(businessHits).slice(0, 2);
  const events = uniq(eventHits).slice(0, 2);
  const hasSlots = business.length || services.length || asks.length || events.length;
  if (!hasSlots) return fallback('no recognised intent', confidence);

  const long = clean.length > COMPRESS_TRIGGER_CHARS;
  // Unrecognised words mean unrecognised meaning: short messages must be almost fully covered.
  const threshold = long ? 0.5 : 0.85;
  if (confidence < threshold || leftover.length > (long ? 25 : 2)) return fallback('low coverage', confidence);

  const parts = [];
  if (business.length) parts.push(business.join(', '));
  if (events.length) parts.push(`event: ${events.join(', ')}`);
  if (services.length) parts.push(`${wants ? 'wants' : 'about'}: ${uniq(services).join(', ')}`);
  if (asks.length) parts.push(`asks: ${asks.join(', ')}`);
  if (negations.length) parts.push(`not: "${uniq(negations).slice(0, 2).join('", "')}"`);
  if (places.length) parts.push(`place: ${places.join(', ')}`);
  // Numbers keep their unit ("25 tables"); dates, emails and links stay verbatim. Drop items that are
  // already contained in a longer one ("14" inside "14 November").
  const candidates = uniq([...entities.filter((e) => !/^[+]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*$/u.test(e)), ...numbersWithUnits]);
  const details = candidates.filter((d, i) => !candidates.some((o, j) => j !== i && o.length > d.length && o.includes(d)));
  if (details.length) parts.push(`details: ${details.join(', ')}`);
  if (!scriptOf(clean) && ARABIZI_RE.test(clean) && /[a-z]/i.test(clean)) parts.push('style: arabizi');
  if (greeting && !parts.length) parts.push('greeting');

  let note = parts.join('; ');
  // Guarantees: never longer, every entity kept, visitor script kept, worth the change.
  const script = scriptOf(clean);
  if (script && scriptOf(note) !== script) return fallback('script would be lost', confidence);
  if (entities.some((e) => !note.includes(e))) return fallback('entity would be lost', confidence);
  const before = estimateTokens(original);
  const after = estimateTokens(note);
  if (after > before * (1 - minSavingRatio) || before - after < 2 || note.length > original.length) return fallback('saving too small', confidence);
  return {
    text: note,
    compressed: true,
    confidence,
    reason: 'ok',
    slots: { business, events, services: uniq(services), asks, negations, places, details, greeting, wants },
  };
}

/** Idempotent wrapper used for history: an already-compressed note is returned as-is. */
export function compressTurn(text) {
  return compressIntent(String(text ?? '')).text;
}
