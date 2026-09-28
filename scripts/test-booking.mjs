import assert from 'node:assert/strict';
import { buildBookingConfirmation, buildBookingNotification, createBookingHandler } from '../api/book.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    body: {
      name: 'Test Customer',
      phone: '+971 50 123 4567',
      email: 'test@example.com',
      purpose: 'A new website',
      preferredDate: '2027-02-10',
      preferredTime: '03:00',
      idempotencyKey: 'booking-test-key-001',
      ...overrides,
    },
  };
}

const acceptedSenderCalls = [];
const handler = createBookingHandler({
  sendMail: async (message) => {
    acceptedSenderCalls.push(message);
    return { accepted: [message.to] };
  },
});
const success = response();
await handler(request(), success);
assert.equal(success.statusCode, 200);
assert.deepEqual(success.body, { ok: true, emailAccepted: true, requestEmailAccepted: true });
assert.equal(acceptedSenderCalls.length, 2);
assert.equal(acceptedSenderCalls[0].to, 'contact@qdsystems.ae');
assert.equal(acceptedSenderCalls[0].subject, 'New free call request — Test Customer');
assert.match(acceptedSenderCalls[0].text, /Phone: \+971 50 123 4567/);
assert.match(acceptedSenderCalls[0].text, /Email: test@example.com/);
assert.match(acceptedSenderCalls[0].text, /Preferred date: 10 February 2027/);
assert.match(acceptedSenderCalls[0].text, /preferences only, not a confirmed appointment/i);
assert.equal(acceptedSenderCalls[1].to, 'test@example.com');
assert.equal(acceptedSenderCalls[1].subject, 'We received your call request — QD Systems');
assert.match(acceptedSenderCalls[1].text, /Preferred date: 10 February 2027/);
assert.match(acceptedSenderCalls[1].text, /Preferred time: 03:00 AM \(Asia\/Dubai\)/);
assert.match(acceptedSenderCalls[1].text, /preferences only, not a confirmed appointment/i);
assert.doesNotMatch(acceptedSenderCalls[1].text + acceptedSenderCalls[1].html, /Google Meet|meet\.google/i);

// Repeated submission with the same key returns the confirmed result without
// sending a second message.
const duplicate = response();
await handler(request(), duplicate);
assert.equal(duplicate.statusCode, 200);
assert.equal(acceptedSenderCalls.length, 2);

for (const invalid of [
  { name: '' },
  { email: 'nope' },
  { phone: '12' },
  { purpose: '' },
  { preferredDate: '2027-02-30' },
  { preferredTime: '25:00' },
]) {
  const bad = response();
  await handler(request({ ...invalid, idempotencyKey: `invalid-key-${Math.random().toString(36).slice(2)}` }), bad);
  assert.equal(bad.statusCode, 400, JSON.stringify(invalid));
}
assert.equal(acceptedSenderCalls.length, 2);

// Don't report success if SMTP resolves without accepting the customer.
const rejectedHandler = createBookingHandler({ sendMail: async () => ({ accepted: [], rejected: ['test@example.com'] }) });
const rejected = response();
await rejectedHandler(request({ idempotencyKey: 'provider-reject-001' }), rejected);
assert.equal(rejected.statusCode, 502);
assert.equal(rejected.body.code, 'EMAIL_RECIPIENT_REJECTED');
assert.equal(rejected.body.ok, undefined);

// If the internal notification succeeds but customer mail fails, a retry sends
// only the customer confirmation and does not duplicate the QD request email.
let customerShouldFail = true;
const partialCalls = [];
const partialHandler = createBookingHandler({
  sendMail: async (message) => {
    partialCalls.push(message);
    if (message.to === 'test@example.com' && customerShouldFail) return { accepted: [], rejected: [message.to] };
    return { accepted: [message.to] };
  },
});
const partialFailure = response();
await partialHandler(request({ idempotencyKey: 'partial-retry-001' }), partialFailure);
assert.equal(partialFailure.statusCode, 502);
assert.equal(partialCalls.length, 2);
assert.equal(partialCalls[0].to, 'contact@qdsystems.ae');
customerShouldFail = false;
const partialRetry = response();
await partialHandler(request({ idempotencyKey: 'partial-retry-001' }), partialRetry);
assert.equal(partialRetry.statusCode, 200);
assert.equal(partialCalls.length, 3);
assert.equal(partialCalls[2].to, 'test@example.com');

// A missing Zoho credential set fails safely without attempting delivery.
const smtpNames = ['ZOHO_SMTP_USER', 'ZOHO_SMTP_PASS'];
const previousSmtpEnv = Object.fromEntries(smtpNames.map((name) => [name, process.env[name]]));
for (const name of smtpNames) delete process.env[name];
const unconfigured = response();
await createBookingHandler()(request({ idempotencyKey: 'email-config-001' }), unconfigured);
assert.equal(unconfigured.statusCode, 503);
assert.equal(unconfigured.body.code, 'EMAIL_NOT_CONFIGURED');
for (const name of smtpNames) {
  if (previousSmtpEnv[name] !== undefined) process.env[name] = previousSmtpEnv[name];
}

// Provider errors produce a safe retry response and a subsequent retry can
// succeed with the same idempotency key.
let shouldFail = true;
const retryHandler = createBookingHandler({
  sendMail: async (message) => {
    if (shouldFail) {
      const error = new Error('This detail must not be returned to the browser.');
      error.code = 'ECONNECTION';
      error.responseCode = 554;
      error.command = 'DATA';
      throw error;
    }
    return { accepted: [message.to] };
  },
});
const failed = response();
await retryHandler(request({ idempotencyKey: 'provider-retry-001' }), failed);
assert.equal(failed.statusCode, 502);
assert.match(failed.body.error, /try again/i);
assert.doesNotMatch(JSON.stringify(failed.body), /This detail|test@example.com/);
shouldFail = false;
const retried = response();
await retryHandler(request({ idempotencyKey: 'provider-retry-001' }), retried);
assert.equal(retried.statusCode, 200);

// Concurrent requests with the same idempotency key are only sent once.
let resolveSend;
let concurrentSendCount = 0;
const concurrentHandler = createBookingHandler({ sendMail: (message) => {
  concurrentSendCount++;
  return new Promise((resolve) => { resolveSend = () => resolve({ accepted: [message.to] }); });
} });
const first = response();
const pending = concurrentHandler(request({ idempotencyKey: 'concurrent-key-001' }), first);
await new Promise((resolve) => setImmediate(resolve));
const second = response();
await concurrentHandler(request({ idempotencyKey: 'concurrent-key-001' }), second);
assert.equal(second.statusCode, 409);
assert.equal(second.body.code, 'REQUEST_IN_PROGRESS');
assert.equal(concurrentSendCount, 1);
resolveSend();
await pending;
assert.equal(first.statusCode, 200);

// Template helper also safely escapes user supplied content.
const html = buildBookingConfirmation({
  name: '<Customer>', purpose: '<script>', preferredDate: '2027-02-10', preferredTime: '15:30',
}).html;
assert.doesNotMatch(html, /<script>/);
assert.match(html, /&lt;script&gt;/);
const notificationHtml = buildBookingNotification({
  name: '<Customer>', phone: '12345678', email: 'test@example.com', purpose: '<script>',
  preferredDate: '2027-02-10', preferredTime: '15:30',
}).html;
assert.doesNotMatch(notificationHtml, /<script>/);
assert.match(notificationHtml, /&lt;script&gt;/);

console.log('Booking checks passed: validation, Dubai formatting, internal and customer email acceptance, safe retries, escaping, and duplicate suppression.');
