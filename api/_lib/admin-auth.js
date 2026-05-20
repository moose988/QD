import { getAdminApp } from './firebase.js';

// Verifies the Firebase ID token from the Authorization header.
// Throws on failure (which the caller should catch → 401).
//
// Usage in a handler:
//   try { const user = await requireAdmin(req); }
//   catch (e) { return res.status(401).json({ error: e.message }); }

export async function requireAdmin(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }
  const idToken = auth.slice('Bearer '.length).trim();
  const decoded = await getAdminApp().auth().verifyIdToken(idToken);
  // v1: any authenticated Firebase user is admin (matches the existing pattern where
  // the rules just check `request.auth != null`). If we add roles later, gate here.
  return decoded;
}
