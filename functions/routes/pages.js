const express = require('express');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { isoToDisplay, dayAbbrev } = require('../lib/dateFormat');
const { escapeHtml, stripTags, truncate } = require('../lib/html');
const { NOTICIAS_CATEGORIES } = require('../constants');
const { setPublicCache } = require('../lib/cache');

const router = express.Router();

const SITE_URL = 'https://www.mrgnt.mx';
const DEFAULT_IMAGE = `${SITE_URL}/assets/mrgnt-logo-principal.jpg`;
const DESCRIPTION_MAX_LENGTH = 200;
const ALL_TAB = '__all__';

const eventoTemplate = fs.readFileSync(path.join(__dirname, '../templates/evento.html'), 'utf8');
const noticiaTemplate = fs.readFileSync(path.join(__dirname, '../templates/noticia.html'), 'utf8');
const noticiasTemplate = fs.readFileSync(path.join(__dirname, '../templates/noticias.html'), 'utf8');
const artistaTemplate = fs.readFileSync(path.join(__dirname, '../templates/artista.html'), 'utf8');

function toClientArticle(doc) {
  const d = doc.data();
  return {
    slug: doc.id,
    category: d.category,
    title: d.title,
    date: isoToDisplay(d.article_date),
    author: d.author,
    excerpt: d.excerpt,
    note: d.note,
    media: d.media || null,
    mediaType: d.media_type || null,
    embedUrl: d.embed_url || null,
    embedProvider: d.embed_provider || null,
  };
}

async function fetchPublishedArticles() {
  const snap = await admin.firestore().collection('articles').where('status', '==', 'published').orderBy('article_date', 'desc').get();
  return snap.docs.map(toClientArticle);
}

// Mirrors extractYouTubeId() in public/noticia.js and public/noticias.js — kept in
// sync by hand since this is the only place the server needs it too.
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

// Mirrors cardThumbHTML() in public/noticias.js.
function cardThumbHtml(post) {
  if (post.media && post.mediaType !== 'video') {
    return `<div class="card-thumb"><img src="${escapeHtml(post.media)}" alt="" loading="lazy"></div>`;
  }
  if (post.media && post.mediaType === 'video') {
    return `<div class="card-thumb"><video src="${escapeHtml(post.media)}" muted playsinline preload="metadata"></video></div>`;
  }
  if (post.embedProvider === 'youtube' && post.embedUrl) {
    const videoId = extractYouTubeId(post.embedUrl);
    if (videoId) {
      return `<div class="card-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(videoId)}/hqdefault.jpg" alt="" loading="lazy"></div>`;
    }
  }
  if (post.embedProvider) {
    return `<div class="card-thumb card-thumb-embed"><span>${escapeHtml(post.embedProvider)}</span></div>`;
  }
  return '';
}

// Mirrors the card markup built in renderArticles() in public/noticias.js.
function articleCardHtml(post) {
  return `<div class="card article-card">
      ${cardThumbHtml(post)}
      <span class="badge badge-rust">${escapeHtml(post.category)}</span>
      <h3><a href="noticia.html?slug=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
      <p class="article-excerpt">${escapeHtml(post.excerpt)}</p>
      <span class="article-meta">${escapeHtml(post.author)} · ${escapeHtml(post.date)}</span>
    </div>`;
}

// Mirrors renderTabs() in public/noticias.js.
function tabsHtml(categories, active) {
  return [ALL_TAB, ...categories]
    .map((t) => `<button class="tab${t === active ? ' active' : ''}">${t === ALL_TAB ? 'Todas' : escapeHtml(t)}</button>`)
    .join('');
}

// Mirrors renderRelated() in public/noticia.js.
function relatedItemHtml(post) {
  const thumb = post.media && post.mediaType !== 'video'
    ? `<img src="${escapeHtml(post.media)}" alt="">`
    : '<span class="noticia-related-thumb-placeholder"></span>';
  return `<a class="noticia-related-item" href="noticia.html?slug=${encodeURIComponent(post.slug)}">
      <span class="noticia-related-thumb">${thumb}</span>
      <span class="noticia-related-body">
        <span class="noticia-related-category">${escapeHtml(post.category)}</span>
        <span class="noticia-related-title">${escapeHtml(post.title)}</span>
        <span class="noticia-related-meta">${escapeHtml(post.date)}</span>
      </span>
    </a>`;
}

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

  let readFailed = false;
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
      // Firestore read failed — fall back to the generic defaults above (uncached).
      readFailed = true;
    }
  }

  if (!readFailed) setPublicCache(req, res);
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
  let html = noticiaTemplate;

  let readFailed = false;
  if (slug) {
    try {
      const snap = await admin.firestore().collection('articles').doc(slug).get();
      if (snap.exists && snap.data().status === 'published') {
        const article = toClientArticle(snap);
        const description = stripTags(article.excerpt || article.note || '');
        const image = article.media && article.mediaType !== 'video' ? article.media : DEFAULT_IMAGE;
        meta = { title: `${article.title} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image, type: 'article' };

        const note = (article.note || '').replace(/\r\n/g, '\n');
        // Rich-text notes are already sanitized server-side before they're stored (see
        // normalizeNote() in routes/articles.js) — safe to inline as-is, same as the client does.
        const bodyHtml = /<[a-z][\s\S]*>/i.test(note)
          ? note
          : note.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).split('\n').join('<br>')}</p>`).join('');

        const mediaHtml = article.media
          ? (article.mediaType === 'video'
            ? `<video src="${escapeHtml(article.media)}" controls></video>`
            : `<img src="${escapeHtml(article.media)}" alt="${escapeHtml(article.title)}">`)
          : '';

        let related = [];
        try {
          const all = await fetchPublishedArticles();
          const others = all.filter((a) => a.slug !== article.slug);
          const sameCategory = others.filter((a) => a.category === article.category);
          const rest = others.filter((a) => a.category !== article.category);
          related = [...sameCategory, ...rest].slice(0, 4);
        } catch {
          // Related-articles lookup failed — the page still works without it.
        }

        html = html
          .replace('<span class="badge badge-rust" id="noticia-category"></span>', `<span class="badge badge-rust" id="noticia-category">${escapeHtml(article.category)}</span>`)
          .replace('<h1 id="noticia-title"></h1>', `<h1 id="noticia-title">${escapeHtml(article.title)}</h1>`)
          .replace('<p class="article-meta" id="noticia-meta"></p>', `<p class="article-meta" id="noticia-meta">${escapeHtml(article.author)} · ${escapeHtml(article.date)}</p>`)
          .replace('<div class="noticia-body" id="noticia-body"></div>', `<div class="noticia-body" id="noticia-body">${bodyHtml}</div>`);

        if (mediaHtml) {
          html = html.replace('<div class="noticia-media" id="noticia-media" hidden></div>', `<div class="noticia-media" id="noticia-media">${mediaHtml}</div>`);
        }

        if (related.length) {
          html = html.replace(
            '<div class="noticia-related-list" id="noticia-related-list"></div>',
            `<div class="noticia-related-list" id="noticia-related-list">${related.map(relatedItemHtml).join('')}</div>`
          );
          html = html.replace('<div class="noticia-related" id="noticia-related" hidden>', '<div class="noticia-related" id="noticia-related">');
        }
      }
    } catch {
      // Firestore read failed — fall back to the generic defaults above (uncached).
      readFailed = true;
    }
  }

  if (!readFailed) setPublicCache(req, res);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(injectMeta(html, meta));
});

router.get('/noticias.html', async (req, res) => {
  let html = noticiasTemplate;
  let readFailed = false;
  try {
    const articles = await fetchPublishedArticles();
    html = html
      .replace('<div class="tabs" id="noticias-tabs"></div>', `<div class="tabs" id="noticias-tabs">${tabsHtml(NOTICIAS_CATEGORIES, ALL_TAB)}</div>`)
      .replace(
        '<div class="posts-grid" id="noticias-posts" style="margin-top:0"></div>',
        `<div class="posts-grid" id="noticias-posts" style="margin-top:0">${articles.map(articleCardHtml).join('')}</div>`
      );
  } catch {
    // Firestore read failed — the client-side fetch in noticias.js will still populate the page (uncached).
    readFailed = true;
  }

  if (!readFailed) setPublicCache(req, res);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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

  let readFailed = false;
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
      // Firestore read failed — fall back to the generic defaults above (uncached).
      readFailed = true;
    }
  }

  if (!readFailed) setPublicCache(req, res);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(injectMeta(artistaTemplate, meta));
});

module.exports = router;
