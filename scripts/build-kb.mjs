#!/usr/bin/env node
// scripts/build-kb.mjs
// Reads knowledge/*, chunks + embeds locally, uploads to Firestore `kb_chunks`.
//
// Run:  npm run build:kb
// Needs: GROQ_API_KEY (not actually used here) + FIREBASE_SERVICE_ACCOUNT in .env.local

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import admin from 'firebase-admin';

import { chunkMarkdown, chunkPortfolio, splitByLanguage } from './lib/chunker.mjs';
import { embedPassage, EMBED_DIM, EMBED_MODEL_NAME } from './lib/embed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');

loadEnv({ path: path.join(ROOT, '.env.local') });

// ─── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error(
      '\nMissing FIREBASE_SERVICE_ACCOUNT in .env.local.\n' +
      '\nHow to get it:\n' +
      '  1. https://console.firebase.google.com/project/qdsystems-67764/settings/serviceaccounts/adminsdk\n' +
      '  2. Click "Generate new private key" -> download the JSON\n' +
      '  3. Paste the ENTIRE JSON onto one line as the value of FIREBASE_SERVICE_ACCOUNT in .env.local\n'
    );
    process.exit(1);
  }
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (err) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON:', err.message);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin.firestore();
}

// ─── Load + chunk all knowledge ───────────────────────────────────────────────

async function loadChunks() {
  const allChunks = [];

  const mdFiles = [
    'company.md',
    'services.md',
    'services-detailed.md',
    'faq.md',
    'process.md',
    'sales-playbook.md',
  ];
  for (const file of mdFiles) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const byLang = splitByLanguage(raw);
    const baseId = file.replace('.md', '');
    for (const lang of ['en', 'ar', 'zh', 'ru']) {
      if (!byLang[lang]?.trim()) continue;
      const chunks = chunkMarkdown(byLang[lang], { source: file, lang, baseId });
      allChunks.push(...chunks);
    }
    console.log(`[load] ${file}: ${allChunks.filter(c => c.source === file).length} chunks`);
  }

  // Portfolio JSON
  const portfolioRaw = await fs.readFile(path.join(KNOWLEDGE_DIR, 'portfolio.json'), 'utf8');
  const portfolio = JSON.parse(portfolioRaw);
  const portfolioChunks = chunkPortfolio(portfolio);
  allChunks.push(...portfolioChunks);
  console.log(`[load] portfolio.json: ${portfolioChunks.length} chunks`);

  return allChunks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══ QD Knowledge Base Build ═══');
  console.log(`Embedding model: ${EMBED_MODEL_NAME} (${EMBED_DIM} dim)\n`);

  const db = initFirebase();
  const chunks = await loadChunks();
  console.log(`\nTotal chunks to embed: ${chunks.length}\n`);

  // Embed sequentially. Could parallelize but the model is local so it's CPU-bound anyway.
  const embedded = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    process.stdout.write(`\r[embed] ${i + 1}/${chunks.length}  ${c.id.padEnd(40)}`);
    const vector = await embedPassage(c.text);
    embedded.push({ ...c, embedding: vector });
  }
  console.log('\n[embed] All embeddings computed.');

  // Wipe and re-upload the collection. For QD's size, a full rebuild each time is simpler than diffing.
  console.log('\n[firestore] Clearing existing kb_chunks collection...');
  const existing = await db.collection('kb_chunks').listDocuments();
  let deleted = 0;
  while (existing.length > 0) {
    const batch = db.batch();
    const slice = existing.splice(0, 400);
    slice.forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += slice.length;
  }
  console.log(`[firestore] Deleted ${deleted} old docs.`);

  console.log('[firestore] Uploading new chunks...');
  for (let i = 0; i < embedded.length; i += 400) {
    const batch = db.batch();
    const slice = embedded.slice(i, i + 400);
    for (const c of slice) {
      const ref = db.collection('kb_chunks').doc(c.id);
      batch.set(ref, {
        source: c.source,
        lang: c.lang,
        heading: c.heading,
        text: c.text,
        embedding: c.embedding,
        model: EMBED_MODEL_NAME,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`[firestore] Uploaded ${Math.min(i + 400, embedded.length)} / ${embedded.length}`);
  }

  // Stash a metadata doc so the runtime function can sanity-check dim & model
  await db.collection('kb_meta').doc('current').set({
    model: EMBED_MODEL_NAME,
    dim: EMBED_DIM,
    chunkCount: embedded.length,
    languages: {
      en: embedded.filter(c => c.lang === 'en').length,
      ar: embedded.filter(c => c.lang === 'ar').length,
      zh: embedded.filter(c => c.lang === 'zh').length,
      ru: embedded.filter(c => c.lang === 'ru').length,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\nDone. ${embedded.length} chunks indexed.`);
  console.log(`   EN: ${embedded.filter(c => c.lang === 'en').length}`);
  console.log(`   AR: ${embedded.filter(c => c.lang === 'ar').length}`);
  console.log(`   ZH: ${embedded.filter(c => c.lang === 'zh').length}`);
  console.log(`   RU: ${embedded.filter(c => c.lang === 'ru').length}`);
  process.exit(0);
}

main().catch(err => {
  console.error('\nBuild failed:', err);
  process.exit(1);
});
