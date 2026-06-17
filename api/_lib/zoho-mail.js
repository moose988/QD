// Shared Zoho Mail SMTP helpers for server-side notification emails.
// Credentials come from environment variables only — never commit secrets.

import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_FROM = 'QD Systems <contact@qdsystems.ae>';
export const CONTACT_REPLY = 'contact@qdsystems.ae';

export function isEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}

export function safeError(error) {
  return {
    code: error?.code,
    command: error?.command,
    responseCode: error?.responseCode,
    message: error?.message,
  };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getSmtpConfig() {
  const host = (process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com').trim();
  const port = Number(process.env.ZOHO_SMTP_PORT || 465);
  const secure = String(process.env.ZOHO_SMTP_SECURE ?? 'true').toLowerCase() === 'true';
  const user = (process.env.ZOHO_SMTP_USER || '').trim();
  const pass = process.env.ZOHO_SMTP_PASS ?? '';
  return { host, port, secure, user, pass };
}

export function getFromAddress() {
  const raw = (process.env.QD_FROM_EMAIL || DEFAULT_FROM).trim();
  return raw || DEFAULT_FROM;
}

export function validateSmtpEnv() {
  const { user, pass } = getSmtpConfig();
  if (!user) return 'Missing ZOHO_SMTP_USER';
  if (!pass) return 'Missing ZOHO_SMTP_PASS';
  return null;
}

export function getAdminRecipients() {
  const values = [process.env.QD_ADMIN_EMAIL || '', process.env.QD_ADMIN_EMAILS || '']
    .join(',')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => isEmail(e));
  return [...new Set(values)];
}

export function createTransport() {
  const { host, port, secure, user, pass } = getSmtpConfig();
  const options = {
    host,
    port,
    secure,
    auth: { user, pass },
  };
  if (!secure) {
    options.requireTLS = true;
  }
  return nodemailer.createTransport(options);
}

export async function sendZohoMail({ to, subject, text, html, replyTo = CONTACT_REPLY }) {
  const smtpError = validateSmtpEnv();
  if (smtpError) {
    throw new Error(smtpError);
  }

  const transport = createTransport();
  await transport.sendMail({
    from: getFromAddress(),
    to,
    replyTo,
    subject,
    text,
    html,
  });
}
