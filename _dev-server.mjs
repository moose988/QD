// Local dev server for QD — mounts api/*.js on plain Node http (no vercel login).
// Generic: any file at /api/<name>.js is auto-mounted at /api/<name>.
// Also rewrites /q/* → /q/index.html to match the Vercel rewrite.
// Dynamic import with cache-bust lets us edit handlers without restarting.

import dotenv from 'dotenv';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

const ROOT = process.cwd();
const PORT = 3000;

dotenv.config({ path: path.join(ROOT, '.env.local') });

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
      const mod = await import(file + '?t=' + Date.now()); // cache-bust for hot reload
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

  // /q/* rewrite (matches vercel.json)
  let urlPath = pathname;
  if (urlPath.startsWith('/q/') && urlPath !== '/q/index.html' && urlPath !== '/q/quote.css' && urlPath !== '/q/quote.js') {
    urlPath = '/q/index.html';
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  let filePath = path.normalize(path.join(ROOT, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403; res.end('Forbidden'); return;
  }
  let stat;
  try { stat = fs.statSync(filePath); } catch {}
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
  console.log(`  → /q/* rewrites to /q/index.html (matches vercel.json)`);
  console.log('═══════════════════════════════════════════════════════════');
});
