import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '.env.local') });

const allowedAdminEmails = new Set([
  'mohammedqudaih107@gmail.com',
  'mdaya0089@gmail.com'
]);

const allowedGoogleHosts = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'g.co'
]);

let adminApp = null;

const sendJson = (res, status, payload) => {
  res.status(status).json(payload);
};

const applyCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const normalizePhone = (value = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const match = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  return (match ? match[1] : text).trim();
};

const normalizeWebsite = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = text.startsWith('http://') || text.startsWith('https://')
      ? new URL(text)
      : new URL(`https://${text}`);
    if (/google\./i.test(url.hostname) || /gstatic\.com$/i.test(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
};

const cleanText = (value = '') => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, '\'')
  .replace(/\s+/g, ' ')
  .trim();

const decodeGoogleEscapes = (value = '') => String(value || '')
  .replace(/\\u003d/gi, '=')
  .replace(/\\u0026/gi, '&')
  .replace(/\\u002f/gi, '/')
  .replace(/\\u003f/gi, '?')
  .replace(/\\u0025/gi, '%')
  .replace(/\\u002b/gi, '+')
  .replace(/\\\\u([\da-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  .replace(/\\u([\da-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const getAdminApp = () => {
  if (adminApp) return adminApp;
  if (admin.apps.length) {
    adminApp = admin.app();
    return adminApp;
  }

  let credentialPayload = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    try {
      credentialPayload = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${error.message}`);
    }
  } else if (
    process.env.FIREBASE_PROJECT_ID?.trim() &&
    process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
    process.env.FIREBASE_PRIVATE_KEY?.trim()
  ) {
    credentialPayload = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  } else {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: credentialPayload.project_id || credentialPayload.projectId,
      clientEmail: credentialPayload.client_email || credentialPayload.clientEmail,
      privateKey: String(credentialPayload.private_key || credentialPayload.privateKey || '').replace(/\\n/g, '\n')
    })
  });

  return adminApp;
};

const verifyAdmin = async (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
  }

  const decoded = await getAdminApp().auth().verifyIdToken(idToken);
  const email = String(decoded.email || '').toLowerCase();
  if (!allowedAdminEmails.has(email)) {
    throw Object.assign(new Error('Unauthorized access.'), { statusCode: 403 });
  }

  return decoded;
};

const isGoogleHostname = (hostname = '') => {
  const host = String(hostname || '').toLowerCase();
  if (allowedGoogleHosts.has(host)) return true;
  if (/^maps\.app\.goo\.gl$/i.test(host)) return true;
  if (/^(?:[\w-]+\.)*google\.com$/i.test(host)) return true;
  if (/^(?:[\w-]+\.)*google\.[a-z.]{2,}$/i.test(host)) return true;
  return false;
};

const isAllowedMapsUrl = (input) => {
  try {
    const url = new URL(String(input || ''));
    if (!/^https?:$/i.test(url.protocol)) return false;
    return isGoogleHostname(url.hostname);
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (resource, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const readTextLimited = async (response, limit = 750000) => {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const decoder = new TextDecoder();
  let total = 0;
  let text = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      text += decoder.decode(value.subarray(0, Math.max(0, limit - (total - value.byteLength))), { stream: true });
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
};

const resolveUrl = async (inputUrl) => {
  const response = await fetchWithTimeout(inputUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  }, 10000);

  if (!response.ok) {
    if (/maps\.app\.goo\.gl/i.test(inputUrl) && response.status === 404) {
      throw Object.assign(
        new Error('This short Google Maps link could not be resolved server-side. Open the listing in Google Maps and paste the full google.com/maps/place/... link instead.'),
        { statusCode: 400 }
      );
    }
    throw Object.assign(new Error('Could not open this Google Maps URL.'), { statusCode: 400 });
  }

  const resolvedUrl = response.url || inputUrl;
  if (!isAllowedMapsUrl(resolvedUrl)) {
    throw Object.assign(new Error('Only Google Maps business links are allowed.'), { statusCode: 400 });
  }

  return { resolvedUrl, response };
};

const normalizeMapsInputUrl = (input) => {
  let value = String(input || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
};

const extractPlaceIdFromUrl = (url) => {
  const text = String(url || '');
  const chijMatch = text.match(/(ChIJ[A-Za-z0-9_-]{20,})/i);
  if (chijMatch) return chijMatch[1];
  const directMatch = text.match(/place_id[:=]([A-Za-z0-9_-]+)/i);
  if (directMatch) return directMatch[1];

  try {
    const parsed = new URL(text);
    for (const key of ['place_id', 'placeid', 'cid']) {
      const value = parsed.searchParams.get(key);
      if (value && key !== 'cid') return value;
    }
  } catch {
    return '';
  }

  return '';
};

const extractSearchTextFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const queryText = parsed.searchParams.get('q')
      || parsed.searchParams.get('query')
      || parsed.searchParams.get('destination')
      || parsed.searchParams.get('daddr')
      || parsed.searchParams.get('near');
    if (queryText) return decodeURIComponent(queryText).replace(/\+/g, ' ').trim();

    const match = parsed.pathname.match(/\/maps\/place\/([^/]+)/i)
      || parsed.pathname.match(/\/place\/([^/]+)/i)
      || parsed.pathname.match(/\/maps\/search\/([^/]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).replace(/\+/g, ' ').trim();
    }

    const parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    return parts.filter((part) => !/^maps$/i.test(part) && !/^place$/i.test(part)).join(' ').trim();
  } catch {
    return '';
  }
};

const googlePlacesFetch = async (endpoint, params, apiKey) => {
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${endpoint}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      'User-Agent': 'QD Systems Admin Maps Import',
      Accept: 'application/json'
    }
  }, 10000);

  if (!response.ok) {
    throw new Error('Google Places lookup failed.');
  }

  const payload = await response.json();
  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message || `Google Places returned ${payload.status}.`);
  }

  return payload;
};

const extractWithPlacesApi = async (sourceUrl, resolvedUrl) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    let placeId = extractPlaceIdFromUrl(resolvedUrl) || extractPlaceIdFromUrl(sourceUrl);
    if (!placeId) {
      const searchText = extractSearchTextFromUrl(resolvedUrl) || extractSearchTextFromUrl(sourceUrl);
      if (searchText) {
        const findPlace = await googlePlacesFetch('findplacefromtext/json', {
          input: searchText,
          inputtype: 'textquery',
          fields: 'place_id,name,formatted_address'
        }, apiKey);
        placeId = findPlace.candidates?.[0]?.place_id || '';
      }
    }

    if (!placeId) return null;

    const details = await googlePlacesFetch('details/json', {
      place_id: placeId,
      fields: 'name,formatted_phone_number,international_phone_number,website,formatted_address,url'
    }, apiKey);

    if (!details.result) return null;

    return {
      businessName: details.result.name || '',
      phoneNumber: details.result.international_phone_number || details.result.formatted_phone_number || '',
      websiteUrl: details.result.website || '',
      meetingLocation: details.result.formatted_address || '',
      sourceUrl,
      resolvedUrl: details.result.url || resolvedUrl
    };
  } catch (error) {
    console.warn('[maps-extract] places api error:', error?.message || error);
    return null;
  }
};

const collectJsonLd = (html) => {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const items = [];

  for (const match of matches) {
    const raw = cleanText(match[1] || '');
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items.push(...parsed);
      else items.push(parsed);
    } catch {
      continue;
    }
  }

  return items;
};

const extractMeta = (html, key) => {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return '';
};

const extractTitle = (html) => cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');

const extractMapsPreviewUrl = (html) => {
  const href = html.match(/<link href="([^"]*\/maps\/preview\/place[^"]*)" as="fetch"/i)?.[1] || '';
  if (!href) return '';
  return new URL(href.replace(/&amp;/g, '&'), 'https://www.google.com').toString();
};

const chooseBestName = (candidates = [], fallback = '') => {
  const cleaned = candidates
    .map((value) => cleanText(value))
    .filter(Boolean)
    .filter((value) => !/google maps|خرائط google/i.test(value));
  if (!cleaned.length) return cleanText(fallback);

  const latin = cleaned.find((value) => /[A-Za-z]/.test(value));
  if (latin) return latin;
  return cleaned.sort((a, b) => b.length - a.length)[0] || cleanText(fallback);
};

const chooseBestAddress = (candidates = [], fallback = '') => {
  const cleaned = candidates
    .map((value) => cleanText(value))
    .filter(Boolean)
    .filter((value) => !/google maps|find local businesses/i.test(value));
  if (!cleaned.length) return cleanText(fallback);

  const latin = cleaned.find((value) => /[A-Za-z]/.test(value) && /\d|street|st\b|road|rd\b|villa|building|district|sharjah|dubai|abu dhabi|ajman|qadsiya/i.test(value));
  if (latin) return latin;

  const detailed = cleaned.find((value) => value.length >= 18);
  return detailed || cleaned[0] || cleanText(fallback);
};

const extractFirstWebsite = (html) => {
  const matches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)];
  for (const match of matches) {
    const website = normalizeWebsite(match[1]);
    if (website) return website;
  }
  return '';
};

const extractPhoneFromText = (text) => normalizePhone(text.match(/(\+?\d[\d\s().-]{6,}\d)/)?.[1] || '');

const extractFromPreviewPayload = async (previewUrl, sourceUrl, resolvedUrl) => {
  const response = await fetchWithTimeout(previewUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  }, 10000);

  if (!response.ok) return null;

  const rawText = await readTextLimited(response, 600000);
  const text = decodeGoogleEscapes(rawText);

  const nameMatches = [
    ...text.matchAll(/"0x[0-9a-f]+:0x[0-9a-f]+","([^"]+)"/gi),
    ...text.matchAll(/\["0x[0-9a-f]+:0x[0-9a-f]+","([^"]+)"/gi)
  ].map((match) => match[1]);
  const pathName = extractSearchTextFromUrl(resolvedUrl) || extractSearchTextFromUrl(sourceUrl);
  const businessName = chooseBestName([...nameMatches, pathName], pathName);

  const websiteIconMatch = text.match(/public_googblue_24dp\.png","(https?:\/\/[^"]+)"/i);
  const websiteMatch = text.match(/["']\/url\?q=([^"'&]+)(?:&|["'])/i);
  const websiteLabelMatch = text.match(/\/url\?q=[^"]+","([^"]+\.[a-z]{2,})",null,"0ahU/i);
  const websiteCandidate = websiteIconMatch?.[1]
    ? websiteIconMatch[1]
    : websiteMatch?.[1]
    ? decodeURIComponent(websiteMatch[1])
    : websiteLabelMatch?.[1]
      ? `https://${websiteLabelMatch[1]}`
      : '';
  const websiteUrl = normalizeWebsite(websiteCandidate);

  const phoneNumber = normalizePhone(
    text.match(/call_[^"]+","([^"]+)"/i)?.[1]
    || text.match(/tel:(\+?[\d\s().-]{6,}\d)/i)?.[1]
    || ''
  );

  const addressCandidates = [
    ...[...text.matchAll(/"([^"]*(?:Street|St\b|Road|Rd\b|Villa|Building|District|Sharjah|Dubai|Ajman|Abu Dhabi)[^"]*)"/gi)].map((match) => match[1]),
    text.match(/\["([^"]+)","[^"]+"\],null,\[null,null,null,null,null,null,null,[0-9.]+\]/i)?.[1] || '',
    text.match(/","([^"]+ - [^"]+)"/i)?.[1] || ''
  ];
  const meetingLocation = chooseBestAddress(addressCandidates);

  if (!businessName && !phoneNumber && !websiteUrl && !meetingLocation) return null;

  return {
    businessName,
    phoneNumber,
    websiteUrl,
    meetingLocation,
    sourceUrl,
    resolvedUrl
  };
};

const extractFromHtml = async (sourceUrl, resolvedUrl, existingResponse = null) => {
  const response = existingResponse || await fetchWithTimeout(resolvedUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  }, 10000);

  if (!response.ok) {
    throw new Error('Could not load the Google Maps page for fallback extraction.');
  }

  const html = await readTextLimited(response, 900000);
  const previewUrl = extractMapsPreviewUrl(html);
  if (previewUrl) {
    try {
      const previewLead = await extractFromPreviewPayload(previewUrl, sourceUrl, resolvedUrl);
      if (previewLead) return previewLead;
    } catch (error) {
      console.warn('[maps-extract] preview payload extraction failed:', error?.message || error);
    }
  }

  const jsonLdItems = collectJsonLd(html);

  const localBusiness = jsonLdItems.find((item) => {
    const type = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
    return type.some((entry) => /LocalBusiness|Organization|Place/i.test(String(entry || '')));
  }) || {};

  const title = extractTitle(html).replace(/\s*-\s*Google.*$/i, '').trim();
  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description');
  const businessName = cleanText(
    localBusiness.name
    || ogTitle
    || title
  );

  const addressObject = localBusiness.address;
  const address = cleanText(
    typeof addressObject === 'string'
      ? addressObject
      : [
          addressObject?.streetAddress,
          addressObject?.addressLocality,
          addressObject?.addressRegion,
          addressObject?.postalCode,
          addressObject?.addressCountry
        ].filter(Boolean).join(', ')
  );

  const websiteUrl = normalizeWebsite(
    localBusiness.url
    || extractMeta(html, 'og:url')
    || extractFirstWebsite(html)
  );

  const phoneNumber = normalizePhone(
    localBusiness.telephone
    || extractPhoneFromText(ogDescription)
    || extractPhoneFromText(html)
  );

  return {
    businessName,
    phoneNumber,
    websiteUrl,
    meetingLocation: address || cleanText(ogDescription),
    sourceUrl,
    resolvedUrl
  };
};

const normalizeLead = (raw, sourceUrl, resolvedUrl) => {
  const nameFromUrl = extractSearchTextFromUrl(resolvedUrl) || extractSearchTextFromUrl(sourceUrl);
  const businessName = cleanText(raw?.businessName || nameFromUrl || '');
  const lead = {
    businessName: businessName === 'Google Maps' ? nameFromUrl : businessName,
    phoneNumber: normalizePhone(raw?.phoneNumber || ''),
    websiteUrl: normalizeWebsite(raw?.websiteUrl || ''),
    meetingLocation: cleanText(raw?.meetingLocation || sourceUrl || ''),
    hasWebsite: normalizeWebsite(raw?.websiteUrl || '') ? 'yes' : 'no',
    sourceUrl,
    resolvedUrl: resolvedUrl || sourceUrl
  };

  return lead;
};

const mergeLeadData = (...items) => items.reduce((acc, item) => {
  if (!item || typeof item !== 'object') return acc;
  return {
    businessName: acc.businessName || item.businessName || '',
    phoneNumber: acc.phoneNumber || item.phoneNumber || '',
    websiteUrl: acc.websiteUrl || item.websiteUrl || '',
    meetingLocation: acc.meetingLocation || item.meetingLocation || '',
    sourceUrl: acc.sourceUrl || item.sourceUrl || '',
    resolvedUrl: acc.resolvedUrl || item.resolvedUrl || ''
  };
}, {
  businessName: '',
  phoneNumber: '',
  websiteUrl: '',
  meetingLocation: '',
  sourceUrl: '',
  resolvedUrl: ''
});

export const config = { runtime: 'nodejs', maxDuration: 15 };

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    await verifyAdmin(req);

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body.' });
        return;
      }
    }

    const sourceUrl = normalizeMapsInputUrl(body?.url);
    if (!sourceUrl) {
      sendJson(res, 400, { ok: false, error: 'A Google Maps URL is required.' });
      return;
    }

    let parsedUrl = null;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Enter a valid Google Maps URL.' });
      return;
    }

    if (!/^https?:$/i.test(parsedUrl.protocol) || !isAllowedMapsUrl(sourceUrl)) {
      sendJson(res, 400, { ok: false, error: 'Only Google Maps business links are allowed.' });
      return;
    }

    const { resolvedUrl, response } = await resolveUrl(sourceUrl);
    let extracted = null;
    let fallbackExtracted = null;

    try {
      extracted = await extractWithPlacesApi(sourceUrl, resolvedUrl);
    } catch (error) {
      console.warn('[maps-extract] places api lookup failed, falling back to HTML extraction:', error?.message || error);
    }

    try {
      fallbackExtracted = await extractFromHtml(sourceUrl, resolvedUrl, response);
    } catch (error) {
      console.warn('[maps-extract] html extraction failed:', error?.message || error);
    }

    const lead = normalizeLead(mergeLeadData(extracted, fallbackExtracted), sourceUrl, resolvedUrl);
    if (!lead.businessName && !lead.phoneNumber && !lead.websiteUrl) {
      sendJson(res, 422, {
        ok: false,
        error: 'We could not extract meaningful lead details from this Google Maps listing. Try the full google.com/maps/place/... link from your browser.'
      });
      return;
    }

    sendJson(res, 200, { ok: true, lead });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const fallbackMessage = statusCode >= 500
      ? 'Google Maps import is temporarily unavailable.'
      : error?.message || 'Could not extract this Google Maps listing.';
    sendJson(res, statusCode, { ok: false, error: fallbackMessage });
  }
}
