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
// Zoho Mail SMTP (same as /api/contact-email — used for booking notifications):
//   ZOHO_SMTP_HOST, ZOHO_SMTP_PORT, ZOHO_SMTP_SECURE, ZOHO_SMTP_USER, ZOHO_SMTP_PASS
//   QD_FROM_EMAIL, QD_ADMIN_EMAILS
//
// SIMPLER ALTERNATIVE: instead of wiring up Google + Resend yourself, point the booking
// modal at a Cal.com (or Calendly) scheduling link. Cal.com generates the Google Meet
// link AND sends the confirmation email for you, so you can leave the calendar/email
// env vars unset and just keep the Firestore record as a backup lead store.

import { getDb, admin } from './_lib/firebase.js';
import {
  CONTACT_REPLY,
  escapeHtml,
  getAdminRecipients,
  isEmail,
  safeError,
  sendZohoMail,
  validateSmtpEnv,
} from './_lib/zoho-mail.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

function buildBookingClientText({ name, bookingId, purpose, time }) {
  const greeting = name?.trim() || 'there';
  const purposeLine = purpose ? `\nPurpose: ${purpose}` : '';
  const timeLine = time ? `\nPreferred time: ${time}` : '';
  return `Hi ${greeting},

Thank you for booking a call with QD Systems.

We received your request and our team will follow up shortly with the next steps.${purposeLine}${timeLine}

Booking reference: ${bookingId}

QD Systems
Websites · Brands · Digital Systems
contact@qdsystems.ae`;
}

function buildBookingClientHtml({ name, bookingId, purpose, time }) {
  const greeting = escapeHtml(name?.trim() || 'there');
  const ref = escapeHtml(bookingId);
  const purposeBlock = purpose
    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#c8c4be;"><strong style="color:#e8e6e3;">Purpose:</strong> ${escapeHtml(purpose)}</p>`
    : '';
  const timeBlock = time
    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#c8c4be;"><strong style="color:#e8e6e3;">Preferred time:</strong> ${escapeHtml(time)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;color:#e8e6e3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:36px 32px 28px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:400;color:#f5f3f0;line-height:1.4;">We received your call request</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Hi ${greeting},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Thank you for booking a call with QD Systems.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#c8c4be;">We received your request and our team will follow up shortly with the next steps.</p>
          ${purposeBlock}${timeBlock}
          <p style="margin:0 0 28px;font-size:13px;color:#8a8680;">Booking reference: <span style="color:#d4d0ca;font-family:monospace;">${ref}</span></p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:0 0 20px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a8680;">QD Systems<br>Websites · Brands · Digital Systems<br><a href="mailto:contact@qdsystems.ae" style="color:#b8b4ae;">contact@qdsystems.ae</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildBookingAdminFields({ bookingId, submissionId, name, email, phone, purpose, time, source }) {
  return [
    ['Booking ID', bookingId],
    ['Submission ID', submissionId || '—'],
    ['Name', name],
    ['Email', email],
    ['Phone', phone],
    ['Purpose', purpose],
    ['Preferred Time', time],
    ['Source', source],
  ];
}

function buildBookingAdminText(details) {
  const lines = buildBookingAdminFields(details).map(([label, value]) => {
    const v = value != null && String(value).trim() !== '' ? String(value).trim() : '—';
    return `${label}: ${v}`;
  });
  lines.push('', 'This booking was automatically generated from the QD Systems “Book a free call” form.');
  return lines.join('\n');
}

function buildBookingAdminHtml(details) {
  const rows = buildBookingAdminFields(details)
    .map(([label, value]) => {
      const v = value != null && String(value).trim() !== '' ? escapeHtml(String(value)) : '—';
      return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;font-size:12px;color:#8a8680;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:13px;color:#e8e6e3;word-break:break-word;">${v}</td></tr>`;
    })
    .join('');
  const leadName = escapeHtml(details.name?.trim() || 'New Lead');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems — Admin</p>
          <h1 style="margin:0 0 24px;font-size:20px;font-weight:400;color:#f5f3f0;">New call booking — ${leadName}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
          <p style="margin:24px 0 0;font-size:12px;color:#8a8680;font-style:italic;">This booking was automatically generated from the QD Systems “Book a free call” form.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendBookingNotifications(details) {
  const smtpError = validateSmtpEnv();
  if (smtpError) {
    console.error('[book-email] SMTP config missing:', smtpError);
    return { attempted: true, clientEmailSent: false, adminEmailSent: false, error: true };
  }

  const adminRecipients = getAdminRecipients();
  if (!adminRecipients.length) {
    console.error('[book-email] QD_ADMIN_EMAILS missing or invalid');
    return { attempted: true, clientEmailSent: false, adminEmailSent: false, error: true };
  }

  let clientEmailSent = false;
  let adminEmailSent = false;

  if (isEmail(details.email)) {
    try {
      await sendZohoMail({
        to: details.email,
        subject: 'We received your call request — QD Systems',
        text: buildBookingClientText(details),
        html: buildBookingClientHtml(details),
        replyTo: CONTACT_REPLY,
      });
      clientEmailSent = true;
      console.log('[book-email] client email sent:', details.bookingId);
    } catch (error) {
      console.error('[book-email] client email failed:', details.bookingId, safeError(error));
    }
  } else {
    console.warn('[book-email] skipping client email — invalid email:', details.bookingId);
  }

  try {
    await sendZohoMail({
      to: adminRecipients,
      subject: `New QD call booking — ${details.name?.trim() || 'New Lead'}`,
      text: buildBookingAdminText(details),
      html: buildBookingAdminHtml(details),
      replyTo: isEmail(details.email) ? details.email : CONTACT_REPLY,
    });
    adminEmailSent = true;
    console.log('[book-email] admin email sent:', details.bookingId);
  } catch (error) {
    console.error('[book-email] admin email failed:', details.bookingId, safeError(error));
  }

  return {
    attempted: true,
    clientEmailSent,
    adminEmailSent,
    error: !clientEmailSent && !adminEmailSent,
  };
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

function mapBookingToSubmission({ name, email, phone, purpose, time, source, bookingId }) {
  const noteParts = [
    'Booked via website “Book a free call” modal.',
    purpose ? `Purpose: ${purpose}` : '',
    time ? `Preferred time: ${time}` : '',
    `Booking ID: ${bookingId}`,
  ].filter(Boolean);

  return {
    businessName: name,
    businessEmail: email,
    businessPhone: phone,
    industry: '',
    businessDescription: '',
    mainPurpose: 'book_call',
    selectedMainPurpose: purpose || 'Book a free call',
    visitorAction: '',
    idealCustomer: '',
    requiredFeatures: [],
    optionalServices: [],
    selectedRequiredFeatures: [],
    selectedOptionalServices: [],
    budgetRange: '',
    launchDate: '',
    meetingDateTime: time || '',
    urgency: '',
    notes: noteParts.join('\n'),
    status: 'New',
    priority: 'Normal',
    source: source || 'website_booking',
    importedFrom: 'bookings',
    importedBookingId: bookingId,
    language: 'en',
    answers: {
      businessName: name,
      businessEmail: email,
      businessPhone: phone,
      mainPurpose: purpose || '',
      preferredCallTime: time || '',
      meetingDateTime: time || '',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
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
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    if (!purpose) return res.status(400).json({ error: 'purpose is required' });
    if (!time) return res.status(400).json({ error: 'preferred date and time are required' });

    // STEP 1 — ALWAYS save the booking first. This is the must-never-lose step.
    const db = getDb();
    const ref = await db.collection('bookings').add({
      name, email, phone, purpose, time, source,
      status: 'new',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Mirror into projectSubmissions so the admin live pipeline picks it up immediately.
    let submissionId = null;
    try {
      const submissionRef = await db.collection('projectSubmissions').add(
        mapBookingToSubmission({ name, email, phone, purpose, time, source, bookingId: ref.id })
      );
      submissionId = submissionRef.id;
      await ref.set({ submissionId }, { merge: true });
    } catch (submissionErr) {
      console.warn('[book] projectSubmissions mirror failed (booking still saved):', submissionErr?.message || submissionErr);
    }

    // STEP 1.5 — Zoho email notifications (best-effort, same SMTP as contact form).
    let emailNotifications = null;
    try {
      emailNotifications = await sendBookingNotifications({
        bookingId: ref.id,
        submissionId,
        name,
        email,
        phone,
        purpose,
        time,
        source,
      });
      await ref.set({ emailNotifications: {
        ...emailNotifications,
        sentAt: emailNotifications.error ? null : new Date().toISOString(),
        failedAt: emailNotifications.error ? new Date().toISOString() : null,
        errorMessage: emailNotifications.error ? 'Email notification failed' : null,
      } }, { merge: true });
    } catch (emailErr) {
      console.warn('[book-email] notification step failed (booking still saved):', safeError(emailErr));
      emailNotifications = { attempted: true, error: true, clientEmailSent: false, adminEmailSent: false };
      try {
        await ref.set({ emailNotifications: {
          attempted: true,
          error: true,
          errorMessage: 'Email notification failed',
          failedAt: new Date().toISOString(),
        } }, { merge: true });
      } catch (_) {}
    }

    // STEPS 2–4 — Calendar event + Resend email. Fully optional and isolated: any failure here
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
    if (submissionId) out.submissionId = submissionId;
    if (meetLink) out.meetLink = meetLink;
    if (emailNotifications) {
      out.clientEmailSent = Boolean(emailNotifications.clientEmailSent);
      out.adminEmailSent = Boolean(emailNotifications.adminEmailSent);
    }
    return res.status(200).json(out);
  } catch (error) {
    console.error('[book] error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please WhatsApp us.' });
  }
}
