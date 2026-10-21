// Run from functions/: node scripts/backfill-artist-slugs.js
// Idempotent: skips any artist that already has a slug.

const admin = require('firebase-admin');
const { slugify } = require('../lib/slugify');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'mrgnt-webpage',
});

const db = admin.firestore();

async function main() {
  const col = db.collection('artists');
  const snap = await col.get();
  const usedSlugs = new Set(snap.docs.map((d) => d.data().slug).filter(Boolean));

  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.slug) {
      skipped++;
      continue;
    }
    const baseSlug = slugify(data.name || '') || 'artista';
    let slug = baseSlug;
    let n = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${n++}`;
    }
    usedSlugs.add(slug);
    await doc.ref.update({ slug });
    migrated++;
    console.log(`Backfilled: ${doc.id} -> ${slug}`);
  }

  console.log(`Done. Backfilled ${migrated} artist(s), skipped ${skipped} (already had a slug).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
