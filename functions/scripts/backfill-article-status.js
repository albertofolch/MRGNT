// Run from functions/: node scripts/backfill-article-status.js
// Sets status: 'published' on any article missing a status field. Existing articles were
// live immediately before the draft/publish workflow existed, so this preserves their
// visibility on the public site. Idempotent: skips articles that already have a status.

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'mrgnt-webpage',
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('articles').get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    if (doc.data().status) {
      skipped++;
      continue;
    }
    await doc.ref.update({ status: 'published' });
    migrated++;
    console.log(`Backfilled: ${doc.id} -> published`);
  }

  console.log(`Done. Backfilled ${migrated} article(s), skipped ${skipped} (already had status).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
