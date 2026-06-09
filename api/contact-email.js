// POST /api/contact-email  { submissionId, payload } -> { ok, clientEmailSent, adminEmailSent }
// POST /api/contact-email?debug=1  — safe SMTP env + connection diagnostics (no secrets)
// POST /api/contact-email?test=1   — send test emails to admin addresses only
//
// SMTP credentials come from environment variables only — never commit secrets.
// Set ZOHO_SMTP_PASS (Zoho app-specific password) in Vercel Environment Variables / .env.local.

import nodemailer from 'nodemailer';

export const config = { runtime: 'nodejs', maxDuration: 15 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FROM = 'QD Systems <contact@qdsystems.ae>';
const CONTACT_REPLY = 'contact@qdsystems.ae';

function isEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}

function safeError(error) {
  return {
    code: error?.code,
    command: error?.command,
    responseCode: error?.responseCode,
    message: error?.message,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSmtpConfig() {
  const host = (process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com').trim();
  const port = Number(process.env.ZOHO_SMTP_PORT || 465);
  const secure = String(process.env.ZOHO_SMTP_SECURE ?? 'true').toLowerCase() === 'true';
  const user = (process.env.ZOHO_SMTP_USER || '').trim();
  const pass = process.env.ZOHO_SMTP_PASS ?? '';
  return { host, port, secure, user, pass };
}

function getFromAddress() {
  const raw = (process.env.QD_FROM_EMAIL || DEFAULT_FROM).trim();
  return raw || DEFAULT_FROM;
}

function validateSmtpEnv() {
  const { user, pass } = getSmtpConfig();
  if (!user) return 'Missing ZOHO_SMTP_USER';
  if (!pass) return 'Missing ZOHO_SMTP_PASS';
  return null;
}

function createTransport() {
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

function getAdminRecipients() {
  const raw = process.env.QD_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => isEmail(e));
}

function getQueryFlags(req) {
  const rawUrl = req.url || '';
  const url = new URL(rawUrl.startsWith('http') ? rawUrl : `http://localhost${rawUrl}`);
  return {
    debug: url.searchParams.get('debug') === '1',
    test: url.searchParams.get('test') === '1',
  };
}

async function parseJsonBody(req) {
  let body = req.body;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      if (!body.trim()) return {};
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    }
    if (typeof body === 'object') return body;
  }

  if (typeof req.on !== 'function') return {};

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function payloadField(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function normalizePayload(payload) {
  return {
    ...payload,
    businessName: payloadField(payload, 'businessName'),
    businessEmail: payloadField(payload, 'businessEmail', 'email'),
    businessPhone: payloadField(payload, 'businessPhone', 'phone'),
    industry: payloadField(payload, 'industry'),
    businessDescription: payloadField(payload, 'businessDescription'),
    socialLinks: payloadField(payload, 'socialLinks'),
    selectedMainPurpose: payloadField(payload, 'selectedMainPurpose', 'mainPurpose'),
    selectedRequiredFeatures: payloadField(payload, 'selectedRequiredFeatures', 'requiredFeatures'),
    idealCustomerAgeGroup: payloadField(payload, 'idealCustomerAgeGroup'),
    idealCustomerGender: payloadField(payload, 'idealCustomerGender'),
    idealCustomerBudgetLevel: payloadField(payload, 'idealCustomerBudgetLevel'),
    idealCustomerNotes: payloadField(payload, 'idealCustomerNotes'),
    selectionSupport: payloadField(payload, 'selectionSupport'),
    supportLevel: payloadField(payload, 'supportLevel'),
    notes: payloadField(payload, 'notes'),
    language: payloadField(payload, 'language'),
    status: payloadField(payload, 'status') || 'New',
    priority: payloadField(payload, 'priority') || 'Normal',
    submittedAt: payloadField(payload, 'submittedAt') || new Date().toISOString(),
  };
}

function buildClientText(submissionId, businessName) {
  const name = businessName?.trim() || 'there';
  return `Hi ${name},

Thank you for contacting QD Systems.

We received your project request and our team will review the details shortly. We will get back to you with the next steps.

Submission reference: ${submissionId}

QD Systems
Websites · Brands · Digital Systems
contact@qdsystems.ae`;
}

function buildClientHtml(submissionId, businessName) {
  const name = escapeHtml(businessName?.trim() || 'there');
  const ref = escapeHtml(submissionId);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;color:#e8e6e3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:36px 32px 28px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems</p>
          <h1 style="margin:0 0 24px;font-size:22px;font-weight:400;color:#f5f3f0;line-height:1.4;">We received your request</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Hi ${name},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c8c4be;">Thank you for contacting QD Systems.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#c8c4be;">We received your project request and our team will review the details shortly. We will get back to you with the next steps.</p>
          <p style="margin:0 0 28px;font-size:13px;color:#8a8680;">Submission reference: <span style="color:#d4d0ca;font-family:monospace;">${ref}</span></p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:0 0 20px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a8680;">QD Systems<br>Websites · Brands · Digital Systems<br><a href="mailto:contact@qdsystems.ae" style="color:#b8b4ae;">contact@qdsystems.ae</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAdminFields(payload, submissionId) {
  const p = normalizePayload(payload);
  return [
    ['Submission ID', submissionId],
    ['Submitted At', p.submittedAt],
    ['Language', p.language],
    ['Business Name', p.businessName],
    ['Business Email', p.businessEmail],
    ['Business Phone', p.businessPhone],
    ['Industry', p.industry],
    ['Business Description', p.businessDescription],
    ['Social Links', p.socialLinks],
    ['Main Purpose', p.selectedMainPurpose],
    ['Required Features', p.selectedRequiredFeatures],
    ['Ideal Customer Age Group', p.idealCustomerAgeGroup],
    ['Ideal Customer Gender', p.idealCustomerGender],
    ['Ideal Customer Budget Level', p.idealCustomerBudgetLevel],
    ['Ideal Customer Notes', p.idealCustomerNotes],
    ['Selection Support', p.selectionSupport],
    ['Support Level', p.supportLevel],
    ['Notes', p.notes],
    ['Status', p.status],
    ['Priority', p.priority],
  ];
}

function buildAdminText(payload, submissionId) {
  const lines = buildAdminFields(payload, submissionId).map(([label, value]) => {
    const v = value != null && String(value).trim() !== '' ? String(value).trim() : '—';
    return `${label}: ${v}`;
  });
  lines.push('', 'This lead was automatically generated from the QD Systems contact form.');
  return lines.join('\n');
}

function buildAdminHtml(payload, submissionId) {
  const rows = buildAdminFields(payload, submissionId)
    .map(([label, value]) => {
      const v = value != null && String(value).trim() !== '' ? escapeHtml(String(value)) : '—';
      return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;font-size:12px;color:#8a8680;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:13px;color:#e8e6e3;word-break:break-word;">${v}</td></tr>`;
    })
    .join('');
  const businessName = escapeHtml(normalizePayload(payload).businessName || 'New Lead');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121214;border:1px solid #2a2a2e;border-radius:8px;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a8680;">QD Systems — Admin</p>
          <h1 style="margin:0 0 24px;font-size:20px;font-weight:400;color:#f5f3f0;">New contact submission — ${businessName}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
          <p style="margin:24px 0 0;font-size:12px;color:#8a8680;font-style:italic;">This lead was automatically generated from the QD Systems contact form.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function handleDebug(res) {
  const smtp = getSmtpConfig();
  const admins = getAdminRecipients();
  const env = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    user: smtp.user || null,
    hasPassword: Boolean(smtp.pass),
    hasZohoPassword: Boolean(smtp.pass),
    from: getFromAddress(),
    admins,
    envPresent: {
      ZOHO_SMTP_HOST: Boolean(process.env.ZOHO_SMTP_HOST),
      ZOHO_SMTP_PORT: Boolean(process.env.ZOHO_SMTP_PORT),
      ZOHO_SMTP_SECURE: Boolean(process.env.ZOHO_SMTP_SECURE),
      ZOHO_SMTP_USER: Boolean(process.env.ZOHO_SMTP_USER),
      ZOHO_SMTP_PASS: Boolean(process.env.ZOHO_SMTP_PASS),
      QD_FROM_EMAIL: Boolean(process.env.QD_FROM_EMAIL),
      QD_ADMIN_EMAILS: Boolean(process.env.QD_ADMIN_EMAILS),
    },
  };

  const missing = validateSmtpEnv();
  if (missing) {
    console.error('[contact-email] debug: SMTP env missing:', missing);
    return res.status(503).json({
      ok: false,
      env,
      transportCreated: false,
      smtpVerify: { ok: false, message: missing },
    });
  }

  if (!admins.length) {
    console.error('[contact-email] debug: QD_ADMIN_EMAILS missing or invalid');
    return res.status(503).json({
      ok: false,
      env,
      transportCreated: false,
      smtpVerify: { ok: false, message: 'QD_ADMIN_EMAILS missing or invalid' },
    });
  }

  let transport;
  try {
    transport = createTransport();
  } catch (error) {
    console.error('[contact-email] transport creation failed:', safeError(error));
    return res.status(500).json({
      ok: false,
      env,
      transportCreated: false,
      smtpVerify: { ok: false, message: 'Failed to create SMTP transport' },
    });
  }

  try {
    await transport.verify();
    return res.status(200).json({
      ok: true,
      env,
      transportCreated: true,
      smtpVerify: { ok: true },
    });
  } catch (error) {
    const err = safeError(error);
    console.error('[contact-email] SMTP verify failed:', err);
    return res.status(502).json({
      ok: false,
      env,
      transportCreated: true,
      smtpVerify: {
        ok: false,
        code: err.code,
        message: 'Authentication failed or connection failed',
      },
    });
  }
}

async function handleTest(res) {
  const smtpError = validateSmtpEnv();
  if (smtpError) {
    console.error('[contact-email] test mode SMTP env missing:', smtpError);
    return res.status(503).json({ ok: false, error: 'Email notification failed' });
  }

  const adminRecipients = getAdminRecipients();
  if (!adminRecipients.length) {
    console.error('[contact-email] test mode: invalid QD_ADMIN_EMAILS');
    return res.status(503).json({ ok: false, error: 'Email notification failed' });
  }

  const from = getFromAddress();
  const transport = createTransport();
  const text = 'This is a test email from the QD Systems contact notification system.';
  const html = `<p style="font-family:Georgia,serif;color:#222;">${escapeHtml(text)}</p>`;

  try {
    await transport.sendMail({
      from,
      to: adminRecipients,
      replyTo: CONTACT_REPLY,
      subject: 'QD Systems email test',
      text,
      html,
    });
    console.log('[contact-email] test emails sent to admins');
    return res.status(200).json({ ok: true, adminEmailSent: true });
  } catch (error) {
    console.error('[contact-email] test email failed:', safeError(error));
    return res.status(502).json({ ok: false, error: 'Email notification failed' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { debug, test } = getQueryFlags(req);
  if (debug) return handleDebug(res);
  if (test) return handleTest(res);

  try {
    const body = await parseJsonBody(req);
    if (body === null) {
      console.error('[contact-email] body parsing failed');
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const submissionId = (body.submissionId || '').toString().trim();
    const payload = body.payload;

    if (!submissionId) return res.status(400).json({ error: 'submissionId is required' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload is required' });

    const smtpError = validateSmtpEnv();
    if (smtpError) {
      console.error('[contact-email] SMTP config missing for submission', submissionId, smtpError);
      return res.status(503).json({ ok: false, error: 'Email notification failed' });
    }

    const adminRecipients = getAdminRecipients();
    if (!adminRecipients.length) {
      console.error('[contact-email] QD_ADMIN_EMAILS missing or invalid for submission', submissionId);
      return res.status(503).json({ ok: false, error: 'Email notification failed' });
    }

    const normalized = normalizePayload(payload);
    const from = getFromAddress();
    const clientEmail = normalized.businessEmail;
    const clientEmailValid = isEmail(clientEmail);
    const businessName = normalized.businessName;
    const transport = createTransport();

    let clientEmailSent = false;
    let adminEmailSent = false;

    if (clientEmailValid) {
      try {
        await transport.sendMail({
          from,
          to: clientEmail,
          replyTo: CONTACT_REPLY,
          subject: 'We received your request — QD Systems',
          text: buildClientText(submissionId, businessName),
          html: buildClientHtml(submissionId, businessName),
        });
        clientEmailSent = true;
        console.log('[contact-email] client email sent:', submissionId);
      } catch (error) {
        console.error('[contact-email] client email failed:', submissionId, safeError(error));
      }
    } else {
      console.warn('[contact-email] skipping client email — invalid or missing businessEmail:', submissionId);
    }

    try {
      await transport.sendMail({
        from,
        to: adminRecipients,
        replyTo: clientEmailValid ? clientEmail : CONTACT_REPLY,
        subject: `New QD contact submission — ${businessName || 'New Lead'}`,
        text: buildAdminText(payload, submissionId),
        html: buildAdminHtml(payload, submissionId),
      });
      adminEmailSent = true;
      console.log('[contact-email] admin email sent:', submissionId);
    } catch (error) {
      console.error('[contact-email] admin email failed:', submissionId, safeError(error));
    }

    if (!clientEmailSent && !adminEmailSent) {
      return res.status(502).json({ ok: false, error: 'Email notification failed' });
    }

    return res.status(200).json({
      ok: true,
      submissionId,
      clientEmailSent,
      adminEmailSent,
    });
  } catch (error) {
    console.error('[contact-email] unexpected error:', safeError(error));
    return res.status(500).json({ ok: false, error: 'Email notification failed' });
  }
}
