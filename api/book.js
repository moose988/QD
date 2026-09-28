// POST /api/book
// Creates a booking, schedules a Google Calendar event with a unique Google Meet link,
// saves the meeting details to Firestore, and emails both the client and the admin.

import { google } from 'googleapis';
import { createHash, randomUUID } from 'node:crypto';
import { getDb, admin } from './_lib/firebase.js';
import {
  CONTACT_REPLY,
  escapeHtml,
  getAdminRecipients,
  isEmail,
  sendZohoMail,
  validateSmtpEnv,
} from './_lib/zoho-mail.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

const DEFAULT_DURATION_MINUTES = 15;
const DEFAULT_TIMEZONE = (process.env.QD_TIMEZONE || 'Asia/Dubai').trim() || 'Asia/Dubai';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function requireEnv(...names) {
  const missing = names.filter((name) => {
    const value = process.env[name];
    return typeof value !== 'string' || !value.trim();
  });
  if (missing.length) {
    const error = new Error(`Missing environment variables: ${missing.join(', ')}`);
    error.code = 'MISSING_ENV';
    throw error;
  }
}

function parseLegacySlot(value) {
  if (!value || typeof value !== 'string') return {};
  const match = value.trim().match(/(\d{4}-\d{2}-\d{2}).*?([01]\d|2[0-3]):([0-5]\d)/);
  if (!match) return {};
  return {
    preferredDate: match[1],
    preferredTime: `${match[2]}:${match[3]}`,
  };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - date.getTime()) / 60000;
}

export function localDateTimeToUtc(preferredDate, preferredTime, timeZone) {
  const [year, month, day] = preferredDate.split('-').map(Number);
  const [hour, minute] = preferredTime.split(':').map(Number);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
  let utcMillis = utcGuess - (offsetMinutes * 60 * 1000);
  const correctedOffset = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);

  if (correctedOffset !== offsetMinutes) {
    offsetMinutes = correctedOffset;
    utcMillis = utcGuess - (offsetMinutes * 60 * 1000);
  }

  return {
    startDate: new Date(utcMillis),
    offsetMinutes,
  };
}

function formatOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function formatRfc3339Local(preferredDate, preferredTime, offsetMinutes) {
  return `${preferredDate}T${preferredTime}:00${formatOffset(offsetMinutes)}`;
}

function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  return Object.fromEntries(
    dtf.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function formatMeetingDisplay(startDate, endDate, timeZone) {
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(startDate)} · ${timeFormatter.format(startDate)} to ${timeFormatter.format(endDate)} (${timeZone})`;
}

export function parseMeetingRequest({ preferredDate, preferredTime, time, timezone }) {
  const fallback = parseLegacySlot(time);
  const dateValue = (preferredDate || fallback.preferredDate || '').trim();
  const timeValue = (preferredTime || fallback.preferredTime || '').trim();
  const meetingTimezone = (timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;

  if (!DATE_RE.test(dateValue)) {
    const error = new Error('Please choose a valid meeting date.');
    error.code = 'INVALID_DATE';
    throw error;
  }

  if (!TIME_RE.test(timeValue)) {
    const error = new Error('Please choose a valid meeting time.');
    error.code = 'INVALID_TIME';
    throw error;
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    const error = new Error('Please choose a valid meeting date.');
    error.code = 'INVALID_DATE';
    throw error;
  }

  const { startDate, offsetMinutes } = localDateTimeToUtc(dateValue, timeValue, meetingTimezone);
  const meetingEnd = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
  const endParts = getZonedParts(meetingEnd, meetingTimezone);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(meetingEnd.getTime())) {
    const error = new Error('The selected meeting time is invalid.');
    error.code = 'INVALID_DATETIME';
    throw error;
  }

  if (startDate.getTime() <= Date.now()) {
    const error = new Error('Please choose a future meeting time.');
    error.code = 'PAST_DATETIME';
    throw error;
  }

  return {
    preferredDate: dateValue,
    preferredTime: timeValue,
    meetingTimezone,
    meetingStart: startDate.toISOString(),
    meetingEnd: meetingEnd.toISOString(),
    meetingStartLocal: formatRfc3339Local(dateValue, timeValue, offsetMinutes),
    meetingEndLocal: formatRfc3339Local(
      `${endParts.year}-${endParts.month}-${endParts.day}`,
      `${endParts.hour}:${endParts.minute}`,
      offsetMinutes
    ),
    meetingDisplay: formatMeetingDisplay(startDate, meetingEnd, meetingTimezone),
    durationMinutes: DEFAULT_DURATION_MINUTES,
  };
}

function buildBookingClientText(details) {
  const greeting = details.name?.trim() || 'there';
  return `Hi ${greeting},

Thank you for booking a call with QD Systems.

Your Google Meet call is confirmed.

Meeting time: ${details.meetingDisplay}
Duration: ${details.durationMinutes} minutes
Purpose: ${details.purpose}

Join Google Meet:
${details.meetingLink}

Add this to your calendar so you don't miss it.

Booking reference: ${details.bookingId}

QD Systems
Websites · Brands · Digital Systems
contact@qdsystems.ae`;
}

function buildBookingClientHtml(details) {
  const greeting = escapeHtml(details.name?.trim() || 'there');
  const ref = escapeHtml(details.bookingId);
  const meetLink = escapeHtml(details.meetingLink);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;color:#e8e6e3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:36px 32px 28px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:400;color:#f5f3f0;line-height:1.4;">Your Google Meet call is confirmed</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Hi ${greeting},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Thank you for booking a call with QD Systems.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#c8c4be;"><strong style="color:#e8e6e3;">Meeting time:</strong> ${escapeHtml(details.meetingDisplay)}</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#c8c4be;"><strong style="color:#e8e6e3;">Duration:</strong> ${details.durationMinutes} minutes</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#c8c4be;"><strong style="color:#e8e6e3;">Purpose:</strong> ${escapeHtml(details.purpose)}</p>
          <p style="margin:0 0 18px;">
            <a href="${meetLink}" style="display:inline-block;padding:14px 22px;background:#e8e6e3;color:#0a0a0c;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">Join Google Meet</a>
          </p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#b8b4ae;word-break:break-all;">${meetLink}</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#8a8680;">Add this to your calendar so you don't miss it.</p>
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

function buildBookingAdminFields(details) {
  return [
    ['Booking ID', details.bookingId],
    ['Submission ID', details.submissionId || '—'],
    ['Client name', details.name],
    ['Client email', details.email],
    ['Phone', details.phone],
    ['Purpose', details.purpose],
    ['Preferred meeting time', details.meetingDisplay],
    ['Google Meet link', details.meetingLink],
    ['Google Calendar event ID', details.calendarEventId],
    ['Source', details.source],
  ];
}

function buildBookingAdminText(details) {
  const lines = buildBookingAdminFields(details).map(([label, value]) => {
    const safeValue = value != null && String(value).trim() !== '' ? String(value).trim() : '—';
    return `${label}: ${safeValue}`;
  });
  lines.push('', 'This booking was automatically generated from the QD Systems “Book a free call” form.');
  return lines.join('\n');
}

function buildBookingAdminHtml(details) {
  const rows = buildBookingAdminFields(details)
    .map(([label, value]) => {
      const safeValue = value != null && String(value).trim() !== '' ? escapeHtml(String(value)) : '—';
      return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;font-size:12px;color:#8a8680;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:13px;color:#e8e6e3;word-break:break-word;">${safeValue}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems — Admin</p>
          <h1 style="margin:0 0 24px;font-size:20px;font-weight:400;color:#f5f3f0;">New call booking — ${escapeHtml(details.name?.trim() || 'New Lead')}</h1>
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
    const error = new Error(smtpError);
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const adminRecipients = getAdminRecipients();
  if (!adminRecipients.length) {
    const error = new Error('Missing QD_ADMIN_EMAIL / QD_ADMIN_EMAILS');
    error.code = 'ADMIN_RECIPIENTS_NOT_CONFIGURED';
    throw error;
  }

  let clientEmailSent = false;
  let adminEmailSent = false;
  const alreadySent = details.alreadySent || {};

  if (alreadySent.clientEmailSent) clientEmailSent = true;
  else try {
    await sendZohoMail({
      to: details.email,
      subject: 'Your Google Meet call is confirmed — QD Systems',
      text: buildBookingClientText(details),
      html: buildBookingClientHtml(details),
      replyTo: CONTACT_REPLY,
    });
    await details.onEmailSent?.('clientEmailSent');
    clientEmailSent = true;
    console.log('[book-email] client email sent:', details.bookingId);
  } catch (error) {
    console.error('[book-email] client email failed', { code: error?.code || 'SMTP_ERROR', responseCode: error?.responseCode || null, command: error?.command || null });
  }

  if (alreadySent.adminEmailSent) adminEmailSent = true;
  else try {
    await sendZohoMail({
      to: adminRecipients,
      subject: `New QD call booking — ${details.name?.trim() || 'New Lead'}`,
      text: buildBookingAdminText(details),
      html: buildBookingAdminHtml(details),
      replyTo: isEmail(details.email) ? details.email : CONTACT_REPLY,
    });
    await details.onEmailSent?.('adminEmailSent');
    adminEmailSent = true;
    console.log('[book-email] admin email sent:', details.bookingId);
  } catch (error) {
    console.error('[book-email] admin email failed', { code: error?.code || 'SMTP_ERROR', responseCode: error?.responseCode || null, command: error?.command || null });
  }

  return {
    attempted: true,
    clientEmailSent,
    adminEmailSent,
    error: !clientEmailSent || !adminEmailSent,
  };
}

export async function createCalendarEvent(details) {
  requireEnv('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ID');

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const calendar = google.calendar({ version: 'v3', auth });
  // Use deterministic IDs so a retry after a timeout or partial persistence can
  // recover the original event instead of creating another calendar entry.
  const eventId = createHash('sha256').update(`qd-booking:${details.bookingId}`).digest('hex');
  const requestId = `qd-${eventId}`;
  const adminEmail = (process.env.QD_ADMIN_EMAIL || process.env.QD_ADMIN_EMAILS || '').split(',')[0].trim();
  const attendees = [{ email: details.email }];

  if (isEmail(adminEmail) && adminEmail.toLowerCase() !== details.email.toLowerCase()) {
    attendees.push({ email: adminEmail });
  }

  const event = {
    id: eventId,
    summary: `QD Systems Call — ${details.name}`.slice(0, 200),
    description: [
      'Booked via the QD Systems website.',
      `Client: ${details.name}`,
      `Email: ${details.email}`,
      `Phone: ${details.phone}`,
      `Purpose: ${details.purpose}`,
      `Meeting time: ${details.meetingDisplay}`,
    ].join('\n'),
    start: {
      dateTime: details.meetingStartLocal,
      timeZone: details.meetingTimezone,
    },
    end: {
      dateTime: details.meetingEndLocal,
      timeZone: details.meetingTimezone,
    },
    attendees,
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  let data;
  try {
    ({ data } = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID.trim(),
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: event,
    }));
  } catch (error) {
    if (error?.code !== 409 && error?.response?.status !== 409) throw error;
    ({ data } = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID.trim(), eventId }));
  }

  const meetingLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ||
    null;

  if (!meetingLink || !data.id) {
    const error = new Error('Google Calendar did not return a Meet link.');
    error.code = 'MISSING_MEET_LINK';
    throw error;
  }

  return {
    meetingLink,
    calendarEventId: data.id,
  };
}

function getCalendarErrorDiagnostics(error) {
  const apiError = error?.response?.data?.error;
  const safeToken = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const token = String(value);
    return /^[A-Za-z0-9_.-]{1,80}$/.test(token) ? token : null;
  };
  const reasons = Array.isArray(apiError?.errors)
    ? apiError.errors.map((item) => safeToken(item?.reason)).filter(Boolean)
    : [];
  const providerCode = safeToken(typeof apiError === 'string' ? apiError : apiError?.status || apiError?.code);
  const code = safeToken(error?.code);
  const status = Number(error?.response?.status || error?.status || (typeof error?.code === 'number' ? error.code : 0)) || null;
  return { code, status, providerCode, reasons };
}

function getCalendarFailureResponse(diagnostics) {
  const oauthRejected = diagnostics.providerCode === 'invalid_grant' || diagnostics.code === 'invalid_grant';
  if (oauthRejected || diagnostics.status === 401 || diagnostics.status === 403) {
    return {
      status: 503,
      code: 'BOOKING_CALENDAR_AUTH_FAILED',
      error: 'We could not access the booking calendar. Please contact us on WhatsApp and we will arrange your call.',
    };
  }
  if (diagnostics.status === 404) {
    return {
      status: 503,
      code: 'BOOKING_CALENDAR_NOT_FOUND',
      error: 'The booking calendar is temporarily unavailable. Please contact us on WhatsApp and we will arrange your call.',
    };
  }
  if (diagnostics.status === 429 || diagnostics.status >= 500) {
    return {
      status: 503,
      code: 'BOOKING_CALENDAR_TEMPORARY_FAILURE',
      error: 'Google Calendar is temporarily unavailable. Please try again shortly or contact us on WhatsApp.',
    };
  }
  return {
    status: 502,
    code: 'BOOKING_CALENDAR_FAILED',
    error: 'We could not schedule your call just now. Please try again or contact us on WhatsApp.',
  };
}

function mapBookingToSubmission({ name, email, phone, purpose, source, bookingId, schedule }) {
  const noteParts = [
    'Booked via website “Book a free call” modal.',
    `Purpose: ${purpose}`,
    `Preferred time: ${schedule.meetingDisplay}`,
    `Booking ID: ${bookingId}`,
  ];

  return {
    businessName: name,
    businessEmail: email,
    businessPhone: phone,
    industry: '',
    businessDescription: '',
    mainPurpose: 'book_call',
    selectedMainPurpose: purpose,
    visitorAction: '',
    idealCustomer: '',
    requiredFeatures: [],
    optionalServices: [],
    selectedRequiredFeatures: [],
    selectedOptionalServices: [],
    budgetRange: '',
    launchDate: '',
    meetingDateTime: schedule.meetingDisplay,
    preferredDate: schedule.preferredDate,
    preferredTime: schedule.preferredTime,
    meetingTimezone: schedule.meetingTimezone,
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
      mainPurpose: purpose,
      preferredCallTime: schedule.preferredTime,
      meetingDateTime: schedule.meetingDisplay,
      preferredDate: schedule.preferredDate,
      preferredTime: schedule.preferredTime,
      meetingTimezone: schedule.meetingTimezone,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function mirrorMeetingDetails(db, submissionId, meetingUpdate) {
  if (!submissionId) return;
  await db.collection('projectSubmissions').doc(submissionId).set(
    {
      meetingProvider: 'google_meet',
      meetingLink: meetingUpdate.meetingLink,
      calendarEventId: meetingUpdate.calendarEventId,
      meetingStart: meetingUpdate.meetingStart,
      meetingEnd: meetingUpdate.meetingEnd,
      meetingTimezone: meetingUpdate.meetingTimezone,
      meetingCreatedAt: meetingUpdate.meetingCreatedAt,
      meetingDateTime: meetingUpdate.meetingDisplay,
      preferredDate: meetingUpdate.preferredDate,
      preferredTime: meetingUpdate.preferredTime,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export function createBookingHandler(dependencies = {}) {
  const getDatabase = dependencies.getDb || getDb;
  const adminSdk = dependencies.admin || admin;
  const calendarEventCreator = dependencies.createCalendarEvent || createCalendarEvent;
  const notificationSender = dependencies.sendBookingNotifications || sendBookingNotifications;

  return async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    body = body || {};

    const name = (body.name || '').toString().trim().slice(0, 120);
    const email = (body.email || '').toString().trim().slice(0, 200);
    const phone = (body.phone || '').toString().trim().slice(0, 60);
    const purpose = (body.purpose || '').toString().trim().slice(0, 300);
    const source = (body.source || 'website').toString().trim().slice(0, 60);
    const preferredDate = (body.preferredDate || '').toString().trim().slice(0, 20);
    const preferredTime = (body.preferredTime || '').toString().trim().slice(0, 10);
    const time = (body.time || '').toString().trim().slice(0, 120);

    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!phone) return res.status(400).json({ error: 'Please enter your phone number.' });
    if (!purpose) return res.status(400).json({ error: 'Please tell us what the call is about.' });

    let schedule;
    try {
      schedule = parseMeetingRequest({
        preferredDate,
        preferredTime,
        time,
        // Treat submitted date/time values as wall-clock time in the business timezone.
        timezone: DEFAULT_TIMEZONE,
      });
    } catch (scheduleError) {
      if (['INVALID_DATE', 'INVALID_TIME', 'INVALID_DATETIME', 'PAST_DATETIME'].includes(scheduleError.code)) {
        return res.status(400).json({ error: scheduleError.message });
      }
      throw scheduleError;
    }

    const idempotencyKey = (body.idempotencyKey || randomUUID()).toString().trim().slice(0, 120);
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: 'Please refresh the page and try booking again.' });
    }
    const bookingKey = createHash('sha256').update(idempotencyKey).digest('hex');
    const requestFingerprint = createHash('sha256').update([
      name, email.toLowerCase(), phone, purpose, schedule.preferredDate,
      schedule.preferredTime, schedule.meetingTimezone,
    ].join('\n')).digest('hex');
    const db = getDatabase();
    const ref = db.collection('bookings').doc(bookingKey);
    const existingSnapshot = await ref.get();
    const bookingData = existingSnapshot.exists ? existingSnapshot.data() : null;
    if (bookingData && bookingData.requestFingerprint !== requestFingerprint) {
      return res.status(409).json({ error: 'This booking attempt was already used for different details. Please refresh and try again.' });
    }
    if (!bookingData) {
      await ref.set({
        name,
        email,
        phone,
        purpose,
        time: schedule.meetingDisplay,
        preferredDate: schedule.preferredDate,
        preferredTime: schedule.preferredTime,
        requestedTimeRaw: time,
        meetingTimezone: schedule.meetingTimezone,
        source,
        requestFingerprint,
        status: 'pending_calendar',
        createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      });
    }

    let submissionId = bookingData?.submissionId || null;
    if (!submissionId) {
      try {
        const submissionRef = db.collection('projectSubmissions').doc(`booking-${bookingKey}`);
        submissionId = submissionRef.id;
        await submissionRef.set(
          mapBookingToSubmission({ name, email, phone, purpose, source, bookingId: ref.id, schedule }),
          { merge: true }
        );
        await ref.set({ submissionId }, { merge: true });
      } catch (submissionErr) {
        console.warn('[book-email] submission mirror failed', { code: submissionErr?.code || 'UNKNOWN' });
      }
    }

    let calendarData;
    try {
      if (bookingData?.meetingLink && bookingData?.calendarEventId) {
        calendarData = { meetingLink: bookingData.meetingLink, calendarEventId: bookingData.calendarEventId };
      } else {
        calendarData = await calendarEventCreator({
          bookingId: ref.id,
          name,
          email,
          phone,
          purpose,
          ...schedule,
        });
      }
    } catch (calendarError) {
      const missing = calendarError?.code === 'MISSING_ENV' ? (calendarError.message.match(/Missing environment variables: (.*)/)?.[1] || '').split(', ').filter(Boolean) : [];
      const diagnostics = getCalendarErrorDiagnostics(calendarError);
      console.error('[book-email] calendar step failed', {
        ...diagnostics,
        missingEnvironment: missing,
      });
      await ref.set(
        {
          status: 'calendar_failed',
          calendarErrorCode: calendarError?.code || 'CALENDAR_ERROR',
          lastUpdatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (calendarError?.code === 'MISSING_ENV') {
        return res.status(503).json({ code: 'BOOKING_CALENDAR_NOT_CONFIGURED', error: 'Online booking is temporarily unavailable. Please contact us on WhatsApp and we will arrange your call.' });
      }
      const failure = getCalendarFailureResponse(diagnostics);
      return res.status(failure.status).json({ code: failure.code, error: failure.error });
    }

    const meetingUpdate = {
      meetingProvider: 'google_meet',
      meetingLink: calendarData.meetingLink,
      calendarEventId: calendarData.calendarEventId,
      meetingStart: schedule.meetingStart,
      meetingEnd: schedule.meetingEnd,
      meetingTimezone: schedule.meetingTimezone,
      meetingCreatedAt: bookingData?.meetingCreatedAt || adminSdk.firestore.FieldValue.serverTimestamp(),
      meetingDisplay: schedule.meetingDisplay,
      preferredDate: schedule.preferredDate,
      preferredTime: schedule.preferredTime,
      durationMinutes: schedule.durationMinutes,
      status: 'scheduled',
      lastUpdatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(meetingUpdate, { merge: true });
    try {
      await mirrorMeetingDetails(db, submissionId, meetingUpdate);
    } catch (mirrorErr) {
      console.warn('[book] meeting detail mirror failed:', mirrorErr?.message || mirrorErr);
    }

    const emailDetails = {
      bookingId: ref.id,
      submissionId,
      name,
      email,
      phone,
      purpose,
      source,
      meetingLink: calendarData.meetingLink,
      calendarEventId: calendarData.calendarEventId,
      meetingDisplay: schedule.meetingDisplay,
      durationMinutes: schedule.durationMinutes,
    };

    let emailNotifications;
    try {
      emailNotifications = await notificationSender({
        ...emailDetails,
        alreadySent: bookingData?.emailNotifications || {},
        onEmailSent: (field) => ref.set({ emailNotifications: { [field]: true } }, { merge: true }),
      });
    } catch (emailError) {
      console.error('[book-email] email step failed', {
        code: emailError?.code || 'EMAIL_ERROR',
        status: emailError?.responseCode || emailError?.status || null,
      });
      emailNotifications = {
        attempted: true,
        clientEmailSent: Boolean(bookingData?.emailNotifications?.clientEmailSent),
        adminEmailSent: Boolean(bookingData?.emailNotifications?.adminEmailSent),
        error: true,
      };
    }
    await ref.set(
      {
        emailNotifications: {
          ...emailNotifications,
          sentAt: emailNotifications.error ? null : new Date().toISOString(),
          failedAt: emailNotifications.error ? new Date().toISOString() : null,
          errorMessage: emailNotifications.error ? 'Booking email delivery failed' : null,
        },
      },
      { merge: true }
    );

    if (emailNotifications.error) {
      await ref.set(
        {
          status: 'email_failed',
          lastUpdatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(502).json({ code: 'BOOKING_EMAIL_FAILED', error: 'Your call time is reserved, but we could not send the confirmation email. Please contact us on WhatsApp so we can confirm the details.' });
    }

    return res.status(200).json({
      ok: true,
      id: ref.id,
      submissionId,
      meetingLink: calendarData.meetingLink,
      calendarEventId: calendarData.calendarEventId,
      clientEmailSent: Boolean(emailNotifications.clientEmailSent),
      adminEmailSent: Boolean(emailNotifications.adminEmailSent),
    });
  } catch (error) {
    console.error('[book-email] request failed', { code: error?.code || 'BOOKING_ERROR', status: error?.status || null });
    if (error?.code === 'MISSING_ENV') {
      return res.status(503).json({ code: 'BOOKING_NOT_CONFIGURED', error: 'Online booking is temporarily unavailable. Please contact us on WhatsApp and we will arrange your call.' });
    }
    return res.status(500).json({ code: 'BOOKING_FAILED', error: 'We could not complete your booking just now. Please try again or contact us on WhatsApp.' });
  }
  };
}

export default createBookingHandler();
