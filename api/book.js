// POST /api/book  { name, email, phone, purpose, time, source } -> { ok: true, id, meetLink? }
// Captures a "Book a free call" request from the site (booking modal) or the chatbot.
//
// FLOW (each later step is optional and ENV-GATED — a missing integration is skipped,
// never fatal, so the lead is never lost):
//   1. ALWAYS save the booking to Firestore `bookings` (must-never-lose step, runs first).
//   2. If Google Calendar env vars exist → create a Calendar event with a Google Meet link,
//      add the visitor as an attendee, and capture { meetLink, calendarEventId }.
//   3. If Resend env vars exist AND we have a meetLink → email the visitor the link.
//   4. Update the Firestore doc with { meetLink, calendarEventId, status:'scheduled', emailedAt }.
//   5. Return { ok:true, id, meetLink? }. The calendar+email work is wrapped in its own
//      try/catch: if it throws, we still return ok (booking is already saved) and log a warning.
//      The booking modal shows a WhatsApp fallback, so the visitor never sees a hard error.
//
// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT VARIABLES
// ─────────────────────────────────────────────────────────────────────────────
// Firebase (already required by this project — see api/_lib/firebase.js):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//
// Google Calendar + Meet (OPTIONAL — skipped if absent):
//   GOOGLE_CALENDAR_CREDENTIALS  Service-account JSON (the full file contents as a single
//                                string, or base64 of it). Create at
//                                https://console.cloud.google.com → IAM & Admin → Service
//                                Accounts → "Keys" → Add key (JSON). Enable the
//                                "Google Calendar API" for that project first.
//   GOOGLE_CALENDAR_ID           The calendar to write events to. For a personal/shared
//                                calendar use its address (e.g. "you@gmail.com" or the
//                                long "...@group.calendar.google.com" id from the calendar's
//                                settings). Defaults to "primary".
//   GOOGLE_CALENDAR_IMPERSONATE  (OPTIONAL) A Workspace user email to impersonate. Only set
//                                this if you use DOMAIN-WIDE DELEGATION (Workspace only).
//   GOOGLE_CALENDAR_TIMEZONE     (OPTIONAL) IANA TZ for the event, e.g. "Asia/Riyadh".
//                                Defaults to "UTC".
//
//   TWO WAYS TO GIVE THE SERVICE ACCOUNT ACCESS TO A CALENDAR:
//     (a) Shared calendar (simplest, works with any Gmail): in Google Calendar →
//         Settings → "Share with specific people" → add the service account's
//         client_email with "Make changes to events". Set GOOGLE_CALENDAR_ID to that
//         calendar's id. Do NOT set GOOGLE_CALENDAR_IMPERSONATE.
//     (b) Domain-wide delegation (Google Workspace only): in the Admin console authorize
//         the service account's client ID for scope
//         https://www.googleapis.com/auth/calendar, then set GOOGLE_CALENDAR_IMPERSONATE
//         to a real Workspace user. This lets the event invite the visitor and send the
//         Google-generated calendar invite as that user.
//
// Resend email (OPTIONAL — skipped if absent):
//   RESEND_API_KEY      From https://resend.com → API Keys.
//   BOOKING_FROM_EMAIL  Verified sender, e.g. "QD Systems <hello@yourdomain.com>".
//                       The domain must be verified in Resend.
//
// SIMPLER ALTERNATIVE: instead of wiring up Google + Resend yourself, point the booking
// modal at a Cal.com (or Calendly) scheduling link. Cal.com generates the Google Meet
// link AND sends the confirmation email for you, so you can leave the calendar/email
// env vars unset and just keep the Firestore record as a backup lead store.

import { getDb, admin } from './_lib/firebase.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// True only if every named env var is present and non-empty.
function hasEnv(...names) {
  return names.every((n) => typeof process.env[n] === 'string' && process.env[n].trim());
}

// Parse the service-account JSON from env (accepts raw JSON or base64-encoded JSON).
function parseServiceAccount(raw) {
  let text = raw.trim();
  if (!text.startsWith('{')) {
    // Looks base64-encoded — decode it.
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  const sa = JSON.parse(text);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return sa;
}

// Try to parse the visitor's preferred time into a concrete start Date.
// Returns null if it can't be parsed (caller falls back to "to be confirmed").
function parsePreferredTime(time) {
  if (!time) return null;
  const d = new Date(time);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1970) return d;
  return null;
}

// Create a Google Calendar event with a Meet link. Returns { meetLink, calendarEventId }
// or null if the integration isn't configured. Throws only on a real API failure
// (caller catches and degrades gracefully).
async function createCalendarEvent({ name, email, purpose, time }) {
  if (!hasEnv('GOOGLE_CALENDAR_CREDENTIALS')) {
    console.log('[book] Google Calendar not configured (GOOGLE_CALENDAR_CREDENTIALS missing) — skipping.');
    return null;
  }

  // Lazy import so the function still runs when `googleapis` isn't installed.
  const { google } = await import('googleapis');

  const sa = parseServiceAccount(process.env.GOOGLE_CALENDAR_CREDENTIALS);
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || 'primary').trim();
  const impersonate = (process.env.GOOGLE_CALENDAR_IMPERSONATE || '').trim() || undefined;
  const timeZone = (process.env.GOOGLE_CALENDAR_TIMEZONE || 'UTC').trim();

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate // only used with domain-wide delegation
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Determine the event window. If we can parse the preferred time, use a 30-min slot.
  // Otherwise, schedule a placeholder ~24h out and flag it "to be confirmed".
  const parsed = parsePreferredTime(time);
  const start = parsed || new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const tentative = !parsed;

  const summary = purpose
    ? `Call: ${purpose}`.slice(0, 200)
    : `Call with ${name || 'visitor'}`;

  const requestId = `qd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const event = {
    summary,
    description:
      `Booked via website${tentative ? ' (time to be confirmed)' : ''}.\n` +
      `Name: ${name || '-'}\nEmail: ${email}\nPurpose: ${purpose || '-'}\n` +
      `Requested time: ${time || '(not specified)'}`,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    attendees: isEmail(email) ? [{ email }] : [],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all'
  });

  // Pull the Meet link out of the created event.
  let meetLink =
    data.hangoutLink ||
    (data.conferenceData?.entryPoints || []).find((e) => e.entryPointType === 'video')?.uri ||
    null;

  return { meetLink, calendarEventId: data.id || null, tentative };
}

// Email the visitor their Meet link via Resend. Returns true if sent, false if skipped.
// Throws only on a real send failure (caller catches and degrades gracefully).
async function emailVisitor({ name, email, meetLink, time, tentative }) {
  if (!hasEnv('RESEND_API_KEY', 'BOOKING_FROM_EMAIL')) {
    console.log('[book] Resend not configured (RESEND_API_KEY / BOOKING_FROM_EMAIL missing) — skipping email.');
    return false;
  }
  if (!meetLink || !isEmail(email)) return false;

  // Lazy import so the function still runs when `resend` isn't installed.
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const whenLine = tentative
    ? 'We will confirm the exact time with you shortly.'
    : (time ? `Requested time: ${time}.` : '');

  const safeName = (name || 'there').replace(/[<>]/g, '');
  const safeMeet = meetLink.replace(/"/g, '%22');

  await resend.emails.send({
    from: process.env.BOOKING_FROM_EMAIL,
    to: email,
    subject: 'Your call with QD Systems — Google Meet link',
    html:
      `<p>Hi ${safeName},</p>` +
      `<p>Thanks for booking a call with QD Systems. ${whenLine}</p>` +
      `<p>Join here when it's time:<br>` +
      `<a href="${safeMeet}">${safeMeet}</a></p>` +
      `<p>If you need to reschedule, just reply to this email.</p>` +
      `<p>— QD Systems</p>`,
    text:
      `Hi ${safeName},\n\nThanks for booking a call with QD Systems. ${whenLine}\n\n` +
      `Join here when it's time:\n${meetLink}\n\n` +
      `If you need to reschedule, just reply to this email.\n\n— QD Systems`
  });

  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    body = body || {};

    const name = (body.name || '').toString().trim().slice(0, 120);
    const email = (body.email || '').toString().trim().slice(0, 200);
    const phone = (body.phone || '').toString().trim().slice(0, 60);
    const purpose = (body.purpose || '').toString().trim().slice(0, 300);
    const time = (body.time || '').toString().trim().slice(0, 120);
    const source = (body.source || 'website').toString().trim().slice(0, 60);

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'a valid email is required' });

    // STEP 1 — ALWAYS save the booking first. This is the must-never-lose step.
    const db = getDb();
    const ref = await db.collection('bookings').add({
      name, email, phone, purpose, time, source,
      status: 'new',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // STEPS 2–4 — Calendar event + email. Fully optional and isolated: any failure here
    // must NOT fail the request (the lead is already saved). Logs a warning and returns ok.
    let meetLink = null;
    try {
      const cal = await createCalendarEvent({ name, email, purpose, time });
      if (cal) {
        meetLink = cal.meetLink;

        let emailedAt = null;
        try {
          const sent = await emailVisitor({
            name, email, meetLink, time, tentative: cal.tentative
          });
          if (sent) emailedAt = admin.firestore.FieldValue.serverTimestamp();
        } catch (emailErr) {
          console.warn('[book] email step failed (booking still saved):', emailErr?.message || emailErr);
        }

        // STEP 4 — persist whatever we managed to produce.
        const update = { status: 'scheduled' };
        if (meetLink) update.meetLink = meetLink;
        if (cal.calendarEventId) update.calendarEventId = cal.calendarEventId;
        if (emailedAt) update.emailedAt = emailedAt;
        await ref.set(update, { merge: true });
      }
    } catch (integrationErr) {
      // Calendar/email failed — booking is safe, so we still return success.
      console.warn('[book] calendar/email step failed (booking still saved):', integrationErr?.message || integrationErr);
    }

    const out = { ok: true, id: ref.id };
    if (meetLink) out.meetLink = meetLink;
    return res.status(200).json(out);
  } catch (error) {
    console.error('[book] error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please WhatsApp us.' });
  }
}
