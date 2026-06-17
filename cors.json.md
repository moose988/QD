# Firebase Storage CORS

Invitation cover images and background music upload from the admin panel require CORS on the Firebase Storage bucket.

Apply manually (one-time per bucket):

```bash
gcloud storage buckets update gs://qdsystems-67764.firebasestorage.app --cors-file=cors.json
```

Origins in `cors.json`:

- `http://localhost:3000`
- `http://localhost:3001`
- `https://qdsystems.ae`
- `https://www.qdsystems.ae`

Deploy storage security rules with:

```bash
firebase deploy --only storage
```
