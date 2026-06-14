// Local dev server for QD — mounts api/*.js on plain Node http (no vercel login).
// Generic: any file at /api/<name>.js is auto-mounted at /api/<name>.
// Also rewrites /q/*, /card/*, and /invite/* to their clean-route entry pages to match Vercel rewrites.
// Dynamic import with cache-bust lets us edit handlers without restarting.

import dotenv from 'dotenv';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

// Resolve paths relative to THIS file, not the launch cwd, so .env.local and
// static/api files load correctly no matter where the server is started from.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

dotenv.config({ path: path.join(ROOT, '.env.local') });

if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASS) {
  console.warn('[dev-server] Zoho SMTP env vars not loaded — /api/contact-email will fail until .env.local is configured');
}

if (!process.env.QUOTE_PASSCODE_SALT) {
  console.warn('[dev-server] QUOTE_PASSCODE_SALT not loaded — /api/quote-* will fail. Check QUOTE_PASSCODE_SALT in .env.local at the project root.');
} else {
  console.log('[dev-server] QUOTE_PASSCODE_SALT loaded ✓');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

function shimRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

function apiName(pathname) {
  if (!pathname.startsWith('/api/')) return null;
  const name = pathname.slice('/api/'.length).split('/')[0];
  return name || null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  const name = apiName(pathname);
  if (name) {
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `No api/${name}.js` }));
      return;
    }
    console.log(`[${new Date().toISOString()}] ${req.method} /api/${name}`);
    shimRes(res);
    try {
      if (req.method !== 'GET' && req.method !== 'OPTIONS') req.body = await readBody(req);
      const mod = await import(pathToFileURL(file).href + '?t=' + Date.now()); // cache-bust for hot reload
      await mod.default(req, res);
    } catch (e) {
      console.error('[handler error]', e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({ error: e.message, stack: e.stack }));
    }
    return;
  }

  // /q/*, /card/*, and /invite/* rewrites (match vercel.json).
  // Like Vercel, the filesystem wins first: if the exact path exists as a
  // real file, serve it and skip the slug rewrite (fixes e.g.
  // /invite/invite-shared.js being swallowed by the /invite/:slug rewrite).
  let urlPath = pathname;
  const existsAsFile = (p) => {
    try {
      const candidate = path.normalize(path.join(ROOT, decodeURIComponent(p)));
      return candidate.startsWith(ROOT) && fs.statSync(candidate).isFile();
    } catch { return false; }
  };
  if (!existsAsFile(urlPath)) {
    if (urlPath.startsWith('/q/')) urlPath = '/q/index.html';
    else if (urlPath.startsWith('/card/')) urlPath = '/card/index.html';
    else if (urlPath.startsWith('/demo/')) urlPath = '/demo/index.html';
    else if (urlPath.startsWith('/invite/')) urlPath = '/invite/index.html';
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  let filePath = path.normalize(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403; res.end('Forbidden'); return;
  }
  let stat;
  try { stat = fs.statSync(filePath); } catch {}
  if (!stat?.isFile() && path.extname(filePath) === '') {
    const htmlCandidate = filePath + '.html';
    try {
      stat = fs.statSync(htmlCandidate);
      filePath = htmlCandidate;
    } catch {}
  }
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try { stat = fs.statSync(filePath); } catch { stat = null; }
  }
  if (!stat?.isFile()) {
    console.log(`[${new Date().toISOString()}] 404 ${pathname}`);
    res.statusCode = 404; res.end('Not Found'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  QD local server (no Vercel CLI needed)`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → /api/* auto-mounts handlers from api/<name>.js`);
  console.log(`  → /q/* rewrites to /q (matches vercel.json)`);
  console.log(`  → /card/* rewrites to /card (matches vercel.json)`);
  console.log(`  → /invite/* rewrites to /invite (matches vercel.json)`);
  console.log('═══════════════════════════════════════════════════════════');
});
