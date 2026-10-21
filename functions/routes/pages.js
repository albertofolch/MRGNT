const express = require('express');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { isoToDisplay, dayAbbrev } = require('../lib/dateFormat');
const { escapeHtml, stripTags, truncate } = require('../lib/html');

const router = express.Router();

const SITE_URL = 'https://www.mrgnt.mx';
const DEFAULT_IMAGE = `${SITE_URL}/assets/logo.png`;
const DESCRIPTION_MAX_LENGTH = 200;

const eventoTemplate = fs.readFileSync(path.join(__dirname, '../templates/evento.html'), 'utf8');
const noticiaTemplate = fs.readFileSync(path.join(__dirname, '../templates/noticia.html'), 'utf8');
const artistaTemplate = fs.readFileSync(path.join(__dirname, '../templates/artista.html'), 'utf8');

// Every template has exactly one <title> near the top of <head> — replace it with the
// full set of title/description/Open Graph/Twitter tags for this specific page.
function injectMeta(template, { title, description, url, image, type }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="MRGNT">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ].join('\n');
  return template.replace(/<title>[^<]*<\/title>/, tags);
}

router.get('/evento.html', async (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const url = `${SITE_URL}/evento.html${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`;
  let meta = {
    title: 'Eventos — MRGNT',
    description: 'Cartelera de eventos de MRGNT: exposiciones, shows y actividades de la escena.',
    url,
    image: DEFAULT_IMAGE,
    type: 'website',
  };

  if (slug) {
    try {
      const snap = await admin.firestore().collection('events').where('slug', '==', slug).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        const displayTitle = d.title || d.artist;
        const dateLine = `${dayAbbrev(d.event_date)} ${isoToDisplay(d.event_date)} · ${d.time} — ${d.stage}`;
        const description = stripTags(d.description || '') || dateLine;
        meta = { title: `${displayTitle} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image: DEFAULT_IMAGE, type: 'article' };
      }
    } catch {
      // Firestore read failed — fall back to the generic defaults above.
    }
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(injectMeta(eventoTemplate, meta));
});

router.get('/noticia.html', async (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const url = `${SITE_URL}/noticia.html${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`;
  let meta = {
    title: 'Noticias — MRGNT',
    description: 'Noticias y novedades de la escena MRGNT.',
    url,
    image: DEFAULT_IMAGE,
    type: 'website',
  };

  if (slug) {
    try {
      const snap = await admin.firestore().collection('articles').doc(slug).get();
      if (snap.exists && snap.data().status === 'published') {
        const d = snap.data();
        const description = stripTags(d.excerpt || d.note || '');
        const image = d.media && d.media_type !== 'video' ? d.media : DEFAULT_IMAGE;
        meta = { title: `${d.title} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image, type: 'article' };
      }
    } catch {
      // Firestore read failed — fall back to the generic defaults above.
    }
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(injectMeta(noticiaTemplate, meta));
});

router.get('/artista.html', async (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const url = `${SITE_URL}/artista.html${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`;
  let meta = {
    title: 'Artistas — MRGNT',
    description: 'Los artistas emergentes que acompañamos en su camino: poesía, declamación, música, artes visuales y escultura.',
    url,
    image: DEFAULT_IMAGE,
    type: 'website',
  };

  if (slug) {
    try {
      const snap = await admin.firestore().collection('artists').where('slug', '==', slug).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        const disciplineLine = `${d.discipline}${d.genre ? ' — ' + d.genre : ''}`;
        const description = stripTags(d.bio || '') || disciplineLine;
        meta = { title: `${d.name} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image: DEFAULT_IMAGE, type: 'profile' };
      }
    } catch {
      // Firestore read failed — fall back to the generic defaults above.
    }
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(injectMeta(artistaTemplate, meta));
});

module.exports = router;
