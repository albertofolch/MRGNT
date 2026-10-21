// Run from functions/: node scripts/migrate-article-notes-to-html.js
// Idempotent: skips any article whose `note` already looks like HTML.

const admin = require('firebase-admin');
const { sanitizeRichText } = require('../lib/sanitize');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'mrgnt-webpage',
});

const db = admin.firestore();

const LOOKS_LIKE_HTML_RE = /<[a-z][\s\S]*>/i;

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plainTextToHtml(note) {
  return note
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).split('\n').join('<br>')}</p>`)
    .join('');
}

async function main() {
  const snap = await db.collection('articles').get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const note = doc.data().note || '';
    if (!note || LOOKS_LIKE_HTML_RE.test(note)) {
      skipped++;
      continue;
    }
    const html = sanitizeRichText(plainTextToHtml(note));
    await doc.ref.update({ note: html });
    migrated++;
    console.log(`Migrated: ${doc.id}`);
  }

  console.log(`Done. Migrated ${migrated} article(s), skipped ${skipped} (already HTML or empty).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
