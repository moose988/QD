// scripts/lib/chunker.mjs
// Split text into semantic chunks. Markdown-aware: respects ### headers.
// Target ~300 tokens (~900 chars) per chunk, max ~500 tokens.

const CHAR_TARGET = 900;
const CHAR_MAX = 1500;

/**
 * Detect language from a chunk of text. Very lightweight — checks for Arabic chars.
 */
export function detectLang(text) {
  return /[؀-ۿ]/.test(text) ? 'ar' : 'en';
}

/**
 * Strip a markdown file into one big string per language section.
 * Files use "## EN" and "## AR" as language anchors.
 */
export function splitByLanguage(markdown) {
  const sections = { en: '', ar: '' };
  const parts = markdown.split(/^## (EN|AR)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const lang = parts[i].toLowerCase();
    const body = parts[i + 1] || '';
    sections[lang] = (sections[lang] || '') + body.trim() + '\n';
  }
  // Fallback: if no language headers, treat whole doc as one section
  if (!sections.en && !sections.ar) {
    sections[detectLang(markdown)] = markdown;
  }
  return sections;
}

/**
 * Chunk markdown by ### headings, then by paragraphs if a section is too large.
 */
export function chunkMarkdown(text, { source, lang, baseId }) {
  const chunks = [];
  // Split on h3 headings. Each chunk = heading + body until next h3 (or end).
  const sections = text.split(/^### /m).filter(s => s.trim().length > 0);

  let chunkIdx = 0;
  for (const rawSection of sections) {
    const section = rawSection.trim();
    const firstNewline = section.indexOf('\n');
    const heading = firstNewline === -1 ? section : section.slice(0, firstNewline);
    const body = firstNewline === -1 ? '' : section.slice(firstNewline + 1).trim();
    const fullText = body ? `${heading}\n\n${body}` : heading;

    if (fullText.length <= CHAR_MAX) {
      chunks.push({
        id: `${baseId}-${lang}-${chunkIdx++}`,
        source,
        lang,
        heading,
        text: fullText,
      });
    } else {
      // Section too big — split by paragraphs greedily into ~CHAR_TARGET chunks
      const paragraphs = body.split(/\n\n+/);
      let buf = heading + '\n\n';
      for (const p of paragraphs) {
        if (buf.length + p.length > CHAR_TARGET && buf.length > heading.length + 4) {
          chunks.push({
            id: `${baseId}-${lang}-${chunkIdx++}`,
            source,
            lang,
            heading,
            text: buf.trim(),
          });
          buf = heading + '\n\n' + p + '\n\n';
        } else {
          buf += p + '\n\n';
        }
      }
      if (buf.trim().length > heading.length + 4) {
        chunks.push({
          id: `${baseId}-${lang}-${chunkIdx++}`,
          source,
          lang,
          heading,
          text: buf.trim(),
        });
      }
    }
  }
  return chunks;
}

/**
 * Build chunks from the portfolio JSON. Each project becomes 2 chunks (EN + AR).
 */
export function chunkPortfolio(json) {
  const chunks = [];
  for (const p of json.projects || []) {
    chunks.push({
      id: `portfolio-${p.id}-en`,
      source: 'portfolio',
      lang: 'en',
      heading: p.name,
      text: [
        `${p.name} — ${p.category} (${p.market || ''}). Live at ${p.url}.`,
        p.description_en,
        `What we built: ${p.what_we_built_en}`,
        `Stack: ${(p.stack || []).join(', ')}.`,
        `Highlights: ${(p.highlights || []).join('; ')}.`,
        `Status: ${p.status}.`,
      ].filter(Boolean).join('\n\n'),
    });
    chunks.push({
      id: `portfolio-${p.id}-ar`,
      source: 'portfolio',
      lang: 'ar',
      heading: p.name,
      text: [
        `${p.name} — ${p.category_ar || p.category}. الموقع المباشر: ${p.url}.`,
        p.description_ar,
        `ما بنيناه: ${p.what_we_built_ar}`,
        `التقنيات: ${(p.stack || []).join('، ')}.`,
        `النقاط البارزة: ${(p.highlights || []).join('؛ ')}.`,
        `الحالة: ${p.status === 'Live' ? 'مباشر' : p.status}.`,
      ].filter(Boolean).join('\n\n'),
    });
  }
  // Also add the summary as its own chunk
  if (json.summary_en) {
    chunks.push({
      id: 'portfolio-summary-en',
      source: 'portfolio',
      lang: 'en',
      heading: 'Portfolio summary',
      text: json.summary_en,
    });
  }
  if (json.summary_ar) {
    chunks.push({
      id: 'portfolio-summary-ar',
      source: 'portfolio',
      lang: 'ar',
      heading: 'ملخص الأعمال',
      text: json.summary_ar,
    });
  }
  return chunks;
}
