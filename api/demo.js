// api/demo.js
// One serverless function for the client-demo endpoints (keeps the project under Vercel Hobby's
// 12-function cap). Public URLs are unchanged: vercel.json rewrites
//   /api/demo-deploy -> /api/demo?__demoRoute=deploy   (admin)
//   /api/demo-get    -> /api/demo?__demoRoute=get
//   /api/demo-verify -> /api/demo?__demoRoute=verify

import { getQueryParam } from './_lib/quote-admin.js';
import deployHandler from './_lib/demo-routes/deploy.js';
import getHandler from './_lib/demo-routes/get.js';
import verifyHandler from './_lib/demo-routes/verify.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const ROUTES = new Map([
  ['deploy', deployHandler],
  ['get', getHandler],
  ['verify', verifyHandler]
]);

export default async function handler(req, res) {
  const route = String(getQueryParam(req, '__demoRoute') || '').trim();
  const routeHandler = ROUTES.get(route);
  if (!routeHandler) return res.status(404).json({ error: 'Unknown demo route' });
  return routeHandler(req, res);
}
