const express = require('express');
const admin = require('firebase-admin');
const { escapeHtml } = require('../lib/html');

const router = express.Router();

const SITE_URL = 'https://www.mrgnt.mx';

const STATIC_PAGES = [
  { path: '/index.html', changefreq: 'weekly', priority: '1.0' },
  { path: '/noticias.html', changefreq: 'daily', priority: '0.8' },
  { path: '/eventos.html', changefreq: 'daily', priority: '0.8' },
  { path: '/artistas.html', changefreq: 'weekly', priority: '0.6' },
  { path: '/convocatoria.html', changefreq: 'monthly', priority: '0.5' },
];

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const parts = [`<loc>${escapeHtml(loc)}</loc>`];
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`<changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`<priority>${priority}</priority>`);
  return `<url>${parts.join('')}</url>`;
}

router.get('/sitemap.xml', async (req, res) => {
  const db = admin.firestore();
  const entries = STATIC_PAGES.map((p) => urlEntry({ loc: `${SITE_URL}${p.path}`, changefreq: p.changefreq, priority: p.priority }));

  try {
    const [articlesSnap, eventsSnap, artistsSnap] = await Promise.all([
      db.collection('articles').where('status', '==', 'published').get(),
      db.collection('events').get(),
      db.collection('artists').get(),
    ]);

    articlesSnap.docs.forEach((doc) => {
      const d = doc.data();
      entries.push(urlEntry({
        loc: `${SITE_URL}/noticia.html?slug=${encodeURIComponent(doc.id)}`,
        lastmod: d.article_date || undefined,
        changefreq: 'monthly',
        priority: '0.6',
      }));
    });

    eventsSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.slug) return;
      entries.push(urlEntry({
        loc: `${SITE_URL}/evento.html?slug=${encodeURIComponent(d.slug)}`,
        lastmod: d.event_date || undefined,
        changefreq: 'weekly',
        priority: '0.6',
      }));
    });

    artistsSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.slug) return;
      entries.push(urlEntry({
        loc: `${SITE_URL}/artista.html?slug=${encodeURIComponent(d.slug)}`,
        changefreq: 'monthly',
        priority: '0.5',
      }));
    });
  } catch {
    // Firestore read failed — still serve the static pages below rather than a 500.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

module.exports = router;
