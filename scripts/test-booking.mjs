import assert from 'node:assert/strict';
import { createBookingHandler, parseMeetingRequest } from '../api/book.js';

class MemoryFirestore {
  constructor() { this.collections = new Map(); }
  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    const docs = this.collections.get(name);
    return {
      doc: (id) => {
        const key = id || `auto-${docs.size + 1}`;
        return {
          id: key,
          get: async () => ({ exists: docs.has(key), data: () => structuredClone(docs.get(key)) }),
          set: async (value, options = {}) => {
            const previous = docs.get(key) || {};
            docs.set(key, options.merge ? deepMerge(previous, value) : structuredClone(value));
          },
        };
      },
      add: async (value) => {
        const key = `auto-${docs.size + 1}`;
        docs.set(key, structuredClone(value));
        return { id: key };
      },
    };
  }
}

function deepMerge(left, right) {
  const result = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(result[key] || {}, value)
      : value;
  }
  return result;
}

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    body: {
      name: 'Booking Test',
      email: 'test@example.com',
      phone: '+971500000000',
      purpose: 'Booking flow test',
      preferredDate: '2026-09-29',
      preferredTime: '03:00',
      meetingTimezone: 'America/Los_Angeles',
      idempotencyKey: 'booking-test-key-001',
      ...overrides,
    },
  };
}

const fieldValue = { serverTimestamp: () => 'TEST_TIMESTAMP' };
const fakeAdmin = { firestore: { FieldValue: fieldValue } };

// Dubai wall time remains 23:00 UTC on the previous day, regardless of the
// browser/server timezone, and invalid calendar dates are rejected.
const dubaiSlot = parseMeetingRequest({
  preferredDate: '2026-09-29', preferredTime: '03:00', timezone: 'Asia/Dubai',
});
assert.equal(dubaiSlot.meetingStart, '2026-09-28T23:00:00.000Z');
assert.equal(dubaiSlot.meetingTimezone, 'Asia/Dubai');
assert.throws(() => parseMeetingRequest({ preferredDate: '2026-02-30', preferredTime: '03:00', timezone: 'Asia/Dubai' }), { code: 'INVALID_DATE' });

// Reproduce today's local configuration failure through the real endpoint and
// real Google configuration check, with Firestore isolated in memory.
const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ID'];
const savedEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
for (const name of names) delete process.env[name];
const failedDb = new MemoryFirestore();
const failingHandler = createBookingHandler({ getDb: () => failedDb, admin: fakeAdmin });
const failedResponse = response();
await failingHandler(request(), failedResponse);
assert.equal(failedResponse.statusCode, 503);
assert.equal(failedResponse.body.code, 'BOOKING_CALENDAR_NOT_CONFIGURED');
assert.match(failedResponse.body.error, /temporarily unavailable/i);
assert.equal([...failedDb.collections.get('bookings').values()][0].status, 'calendar_failed');
for (const name of names) if (savedEnv[name] !== undefined) process.env[name] = savedEnv[name];

const permissionDb = new MemoryFirestore();
const permissionHandler = createBookingHandler({
  getDb: () => permissionDb,
  admin: fakeAdmin,
  createCalendarEvent: async () => {
    const error = new Error('private provider detail must not reach the client');
    error.code = 403;
    error.response = { status: 403, data: { error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'forbidden' }] } } };
    throw error;
  },
});
const permissionResponse = response();
await permissionHandler(request({ idempotencyKey: 'calendar-permission-test' }), permissionResponse);
assert.equal(permissionResponse.statusCode, 503);
assert.equal(permissionResponse.body.code, 'BOOKING_CALENDAR_AUTH_FAILED');
assert.doesNotMatch(permissionResponse.body.error, /private provider detail/i);

// Successful mock booking and a retry after partial email delivery reuse one
// booking/event, skip the already delivered client email, and deliver admin mail.
const retryDb = new MemoryFirestore();
let calendarCreates = 0;
let clientSends = 0;
let adminSends = 0;
let firstEmailAttempt = true;
let calendarTimezone = null;
const retryHandler = createBookingHandler({
  getDb: () => retryDb,
  admin: fakeAdmin,
  createCalendarEvent: async (details) => {
    calendarCreates++;
    calendarTimezone = details.meetingTimezone;
    return { meetingLink: 'https://meet.google.com/test-meet', calendarEventId: `event-${details.bookingId}` };
  },
  sendBookingNotifications: async (details) => {
    let clientEmailSent = Boolean(details.alreadySent.clientEmailSent);
    let adminEmailSent = Boolean(details.alreadySent.adminEmailSent);
    if (!clientEmailSent) { clientSends++; await details.onEmailSent('clientEmailSent'); clientEmailSent = true; }
    if (!adminEmailSent) {
      adminSends++;
      if (firstEmailAttempt) firstEmailAttempt = false;
      else { await details.onEmailSent('adminEmailSent'); adminEmailSent = true; }
    }
    return { attempted: true, clientEmailSent, adminEmailSent, error: !clientEmailSent || !adminEmailSent };
  },
});

const firstResponse = response();
await retryHandler(request(), firstResponse);
assert.equal(firstResponse.statusCode, 502);
assert.equal(firstResponse.body.code, 'BOOKING_EMAIL_FAILED');
const secondResponse = response();
await retryHandler(request(), secondResponse);
assert.equal(secondResponse.statusCode, 200);
assert.equal(secondResponse.body.ok, true);
assert.equal(secondResponse.body.clientEmailSent, true);
assert.equal(secondResponse.body.adminEmailSent, true);
assert.equal(calendarTimezone, 'Asia/Dubai');
assert.equal(calendarCreates, 1);
assert.equal(clientSends, 1);
assert.equal(adminSends, 2);
assert.equal(retryDb.collections.get('bookings').size, 1);
assert.equal(retryDb.collections.get('projectSubmissions').size, 1);
const mismatchedRetry = response();
await retryHandler(request({ email: 'different@example.com' }), mismatchedRetry);
assert.equal(mismatchedRetry.statusCode, 409);
assert.equal(calendarCreates, 1);

const invalidDb = new MemoryFirestore();
const invalidHandler = createBookingHandler({ getDb: () => invalidDb, admin: fakeAdmin });
const invalidResponse = response();
await invalidHandler(request({ preferredDate: '2026-02-30' }), invalidResponse);
assert.equal(invalidResponse.statusCode, 400);
assert.equal(invalidDb.collections.size, 0);

console.log('Booking checks passed: Dubai timezone, invalid date, missing calendar config, successful mocked flow, and retry deduplication.');
