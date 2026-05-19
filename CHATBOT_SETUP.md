# QD Systems Chatbot — Setup Guide

This is the setup guide for the AI chatbot we built into the QD site. It uses semantic search over a bilingual (EN+AR) knowledge base, Groq for the LLM (open-source Llama 3.3 70B), and Firestore for storage.

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│ Build time (your machine)                                        │
│   knowledge/*.md, portfolio.json                                 │
│      └─ scripts/build-kb.mjs                                     │
│           ├─ embed each chunk locally (multilingual-e5)          │
│           └─ upload vectors to Firestore `kb_chunks`             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Runtime (Vercel)                                                 │
│   Visitor types message → chatbot/chatbot.js                     │
│      → POST /api/chat                                            │
│           ├─ embed query (multilingual-e5)                       │
│           ├─ cosine search Firestore kb_chunks (cached)          │
│           ├─ build bilingual prompt with retrieved context       │
│           ├─ stream Llama 3.3 70B from Groq (SSE)                │
│           ├─ if lead intent: save to chatLeads (tool calling)    │
│           └─ append turn to chatConversations/{sessionId}        │
└──────────────────────────────────────────────────────────────────┘

You review leads at /chat-admin.html (gated by Firebase auth).
```

## One-time setup

### 1. Install Node dependencies

```bash
cd /Users/mohammedqudaih/Desktop/Projects/Webs/QD_WEB
npm install
```

This installs `@xenova/transformers` (local embedding model), `firebase-admin`, `groq-sdk`, and `dotenv`. First install pulls ~300MB; the embedding model itself (~280MB) downloads on first use.

### 2. Get a Firebase service account key

We need a service account so the build script can write vectors to Firestore.

1. Go to https://console.firebase.google.com/project/qdsystems-67764/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → downloads `qdsystems-67764-firebase-adminsdk-*.json`
3. Open that file, copy the **entire JSON object** (one big object, starting with `{` and ending with `}`).
4. Open `.env.local` and paste it as the value of `FIREBASE_SERVICE_ACCOUNT`:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"qdsystems-67764", ...}
```

It must be **a single line** (newlines inside the JSON will break parsing). Most editors will paste it as one line automatically.

**Keep this key safe** — it grants full admin access to your Firestore. `.env.local` is already gitignored.

### 3. Verify your Groq key is set

`.env.local` already contains your Groq key (`GROQ_API_KEY=gsk_…`). If you rotate it, update this file.

### 4. Update Firestore security rules

Open https://console.firebase.google.com/project/qdsystems-67764/firestore/rules and add the chatbot collections to your existing rules:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ─── existing rules ──────────────────────────────────────
    match /projectSubmissions/{document} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }

    match /reviews/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // ─── NEW: chatbot rules ──────────────────────────────────
    // Leads captured by the chatbot tool call — anyone can create, only admins read/update
    match /chatLeads/{document} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }

    // Full conversation logs (with messages subcollection)
    match /chatConversations/{document} {
      allow create, update: if true;
      allow read, delete: if request.auth != null;
      match /messages/{msg} {
        allow create: if true;
        allow read: if request.auth != null;
      }
    }

    // KB chunks are written by admin SDK only (rules don't apply to it)
    match /kb_chunks/{document} {
      allow read, write: if false;
    }

    match /kb_meta/{document} {
      allow read, write: if false;
    }
  }
}
```

Click **Publish**.

### 5. Build the knowledge base

```bash
npm run build:kb
```

This will:
1. Read every file in `knowledge/`
2. Chunk it (EN and AR separately)
3. Embed each chunk locally with multilingual-e5-base (no API calls)
4. Wipe the `kb_chunks` Firestore collection and re-upload everything

First run takes ~2 minutes (model download + embedding). Subsequent runs ~30 seconds.

You can re-run `npm run build:kb` any time you edit the knowledge files.

### 6. Add the same env vars to Vercel

In the Vercel dashboard → Project Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `GROQ_API_KEY` | Same value as `.env.local` |
| `FIREBASE_SERVICE_ACCOUNT` | Same JSON value as `.env.local` |
| `EMBED_MODEL` *(optional)* | `Xenova/multilingual-e5-base` |
| `GROQ_MODEL` *(optional)* | `llama-3.3-70b-versatile` |

Set them for **Production, Preview, and Development**.

### 7. Deploy

```bash
npm run deploy
```

Or just push to your main branch if Vercel is connected to GitHub.

## Testing locally

```bash
npm install -g vercel
vercel dev
```

This runs your site + `/api/chat` on `http://localhost:3000`. Open it, click the chat button, ask questions.

## What's where

```
knowledge/
  ├─ company.md           ← who QD is, contact info
  ├─ services.md          ← main 4 service categories
  ├─ services-detailed.md ← FULL Q&A from intake form (the upgraded set)
  ├─ faq.md               ← timeline, pricing, support, etc.
  ├─ process.md           ← 4-step process
  ├─ portfolio.json       ← Al Taj Al Malaki + Evo Creation
  └─ sales-playbook.md    ← bot behavior rules (used as system prompt context)

scripts/
  ├─ build-kb.mjs         ← run with `npm run build:kb`
  └─ lib/
      ├─ chunker.mjs      ← splits markdown by ### headings
      └─ embed.mjs        ← @xenova/transformers wrapper

api/
  ├─ chat.js              ← Vercel function — the runtime brain
  └─ _lib/
      ├─ firebase.js      ← Firebase Admin init (cached)
      ├─ embed.js         ← query embedding (cached)
      ├─ retrieval.js     ← cosine search over Firestore chunks
      └─ prompt.js        ← bilingual system prompt + lead-capture tool def

chatbot/
  ├─ chatbot.js           ← drop-in widget (no framework needed)
  └─ chatbot.css          ← brand-matched styling

chat-admin.html           ← /chat-admin route — review leads + conversations
chat-admin.js             ← Firebase auth + realtime listeners
```

## How to update the bot's knowledge

1. Edit any file in `knowledge/` (or add a new `.md` file — then add it to the `mdFiles` array in `scripts/build-kb.mjs`).
2. Run `npm run build:kb`.
3. Done — the chat function caches chunks for 5 min, so it picks up the new content within 5 min, or you can redeploy to force-refresh immediately.

## How to review what visitors asked

1. Visit `/admin.html`, log in with your Firebase admin account.
2. Click **Chat Leads** in the topbar (or go directly to `/chat-admin.html`).
3. **Leads** tab shows everyone who shared contact info — click any row to see their brief + open WhatsApp.
4. **Conversations** tab shows the full chat logs even for visitors who didn't convert.

## Costs

- **Groq**: Free tier covers ~14,400 requests/day on Llama 3.3 70B. More than enough for QD.
- **Firebase**: Free Spark plan is fine for storage + reads. The bot caches KB chunks in-memory, so each conversation only does ~3 Firestore writes (the lead + 2 messages).
- **Vercel**: Free Hobby plan supports 30-second function durations on Pro — the chat function is configured for `maxDuration: 30`. On free Hobby it caps at 10s. If cold starts hit that cap, either switch to Pro ($20/mo) or downgrade to `Xenova/multilingual-e5-small` in `.env.local` for a faster cold start.

## Troubleshooting

**Build fails with "FIREBASE_SERVICE_ACCOUNT is not valid JSON"**
The JSON must be on a single line. Many editors wrap it. Open `.env.local` in a plain text editor and ensure the value is one line.

**Build hangs at "Loading model"**
First run downloads ~280MB to `~/.cache/transformers`. On slow connections this can take 2-3 minutes. Subsequent runs are instant.

**Chat function times out on Vercel**
Cold start of the embedding model + first Groq call can exceed 10s on Hobby plan. Options:
- Switch model: set `EMBED_MODEL=Xenova/multilingual-e5-small` in Vercel env vars (smaller, faster).
- Upgrade to Vercel Pro for 60s max duration.
- Move query embedding client-side (let us know and we'll refactor).

**Bot answers seem out of date**
The Firestore cache lives 5 min per warm function instance. Hit `/api/chat` once with a junk request to force a fresh fetch, or redeploy to clear all warm instances.

**Bot mixes languages**
The prompt explicitly tells it to match the user's language. If you see mixing, check that `pageLang` is being detected correctly — it auto-reads `<html lang="…">`. You can also force it: `<script src="/chatbot/chatbot.js" data-lang="ar"></script>`.

## Security notes

- Your Groq API key was visible in our chat — **rotate it** at https://console.groq.com/keys when convenient.
- The Firebase service account JSON is stored only in `.env.local` (gitignored) and in Vercel env vars — never in source.
- The `chatLeads` collection is **write-open** so anonymous visitors can create their own leads. Read access is admin-only. Same pattern as your existing `projectSubmissions`.
- The widget calls `/api/chat` from the visitor's browser; nothing sensitive is sent client-side.

## Roadmap ideas

- Streamed citations: show retrieved sources as inline chips under each bot message.
- WhatsApp handoff: button in chat that pre-fills a WhatsApp message with the conversation summary.
- A/B test: greeting variations to see which converts more leads.
- Admin: bulk-tag, export leads to CSV.
- Vector index in Firestore for faster retrieval at scale (when KB grows beyond ~500 chunks).
