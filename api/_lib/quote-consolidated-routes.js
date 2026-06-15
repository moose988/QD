import { getQueryParam } from './quote-admin.js';
import quotesHandler from './quote-routes/quotes.js';
import quoteUpdateHandler from './quote-routes/quote-update.js';
import quotePaymentHandler from './quote-routes/quote-payment.js';
import collectionsHandler from './quote-routes/collections.js';
import collectionsCollectHandler from './quote-routes/collections-collect.js';
import collectionsDigestHandler from './quote-routes/collections-digest.js';

const ROUTES = new Map([
  ['quotes', quotesHandler],
  ['quote-update', quoteUpdateHandler],
  ['quote-payment', quotePaymentHandler],
  ['collections', collectionsHandler],
  ['collections-collect', collectionsCollectHandler],
  ['collections-digest', collectionsDigestHandler]
]);

export function getConsolidatedQuoteRoute(req) {
  return String(getQueryParam(req, '__quoteRoute') || '').trim();
}

export async function handleConsolidatedQuoteRoute(route, req, res) {
  const handler = ROUTES.get(route);
  if (!handler) {
    return res.status(404).json({ error: 'Unknown quote route' });
  }
  return handler(req, res);
}
