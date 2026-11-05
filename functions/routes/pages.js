const express = require('express');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { isoToDisplay, dayAbbrev } = require('../lib/dateFormat');
const { escapeHtml, stripTags, truncate } = require('../lib/html');
const { NOTICIAS_CATEGORIES, DISCIPLINES } = require('../constants');
const { setPublicCache } = require('../lib/cache');

const router = express.Router();

const SITE_URL = 'https://www.mrgnt.mx';
const DEFAULT_IMAGE = `${SITE_URL}/assets/mrgnt-logo-principal.jpg`;
const SITE_LOGO = `${SITE_URL}/assets/mrgnt-logo-principal.jpg`;
const DESCRIPTION_MAX_LENGTH = 200;
// Upcoming vs. past events are split on the calendar day in Mexico City, where every event happens.
const SITE_TIME_ZONE = 'America/Mexico_City';
const ALL_TAB = '__all__';

const eventoTemplate = fs.readFileSync(path.join(__dirname, '../templates/evento.html'), 'utf8');
const noticiaTemplate = fs.readFileSync(path.join(__dirname, '../templates/noticia.html'), 'utf8');
const noticiasTemplate = fs.readFileSync(path.join(__dirname, '../templates/noticias.html'), 'utf8');
const artistaTemplate = fs.readFileSync(path.join(__dirname, '../templates/artista.html'), 'utf8');
const eventosTemplate = fs.readFileSync(path.join(__dirname, '../templates/eventos.html'), 'utf8');
const artistasTemplate = fs.readFileSync(path.join(__dirname, '../templates/artistas.html'), 'utf8');

const MONTH_NAMES = {
  ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril', may: 'Mayo', jun: 'Junio',
  jul: 'Julio', ago: 'Agosto', sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre',
};

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

// schema.org Article for a published noticia. `<` is escaped so no field can close the
// <script> element early.
function articleJsonLd({ article, articleDate, description, image, url }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    image: [image],
    ...(articleDate ? { datePublished: articleDate } : {}),
    ...(article.author ? { author: { '@type': 'Person', name: article.author } } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'MRGNT',
      logo: { '@type': 'ImageObject', url: SITE_LOGO },
    },
    description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function injectBeforeHeadEnd(html, snippet) {
  return html.replace('</head>', `${snippet}\n</head>`);
}

// Same shape as toClient() in routes/events.js, limited to what the pages render.
function toClientEvent(doc) {
  const d = doc.data();
  return {
    slug: d.slug || null,
    event_date: d.event_date,
    date: isoToDisplay(d.event_date),
    day: dayAbbrev(d.event_date),
    time: d.time,
    stage: d.stage,
    artist: d.artist,
    tag: d.tag,
    displayTitle: d.title || d.artist,
    description: d.description || null,
    cost: d.cost || null,
    ticket_link: d.ticket_link || null,
    image: d.image || null,
    locationUrl: d.location_url || null,
  };
}

// Same shape as toClient() in routes/artists.js (public fields only).
function toClientArtist(doc) {
  const d = doc.data();
  return {
    slug: d.slug || null,
    name: d.name,
    discipline: d.discipline,
    genre: d.genre,
    featured: d.featured === true,
    bio: d.bio || null,
  };
}

function todayIsoInSiteZone() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Mirrors groupEventsByMonth() in public/eventos.js.
function groupEventsByMonth(list) {
  const groups = [];
  const byKey = {};
  list.forEach((ev) => {
    const [, month, year] = ev.date.split(' ');
    const key = `${month} ${year}`;
    if (!byKey[key]) {
      byKey[key] = { label: `${MONTH_NAMES[month.toLowerCase()] || month} ${year}`.toUpperCase(), events: [] };
      groups.push(byKey[key]);
    }
    byKey[key].events.push(ev);
  });
  return groups;
}

// Mirrors the row markup built in renderEventos() in public/eventos.js.
function eventRowHtml(ev) {
  const [day, month] = ev.date.split(' ');
  const tag = ev.slug ? 'a' : 'div';
  const href = ev.slug ? ` href="evento.html?slug=${encodeURIComponent(ev.slug)}"` : '';
  return `<${tag} class="event-row"${href}>
        <span class="event-time">${escapeHtml(ev.day)} ${escapeHtml(day)} ${escapeHtml(month.toUpperCase())} · ${escapeHtml(ev.time)}</span>
        <div class="event-main">
          <span class="event-artist">${escapeHtml(ev.artist)}</span>
          <span class="event-stage">${escapeHtml(ev.stage)}</span>
          ${ev.tag ? `<span class="event-tag">${escapeHtml(ev.tag)}</span>` : ''}
        </div>
      </${tag}>`;
}

// Mirrors the upcoming-events branch of renderEventos() in public/eventos.js. The past-events
// archive (eventos-archivo.html) stays a static page rendered by the same script client-side.
function eventGroupsHtml(events) {
  if (!events.length) return '<p class="eventos-empty">No hay próximos eventos por ahora.</p>';
  return groupEventsByMonth(events)
    .map((group) => `<div class="eventos-month"><h2>${escapeHtml(group.label)}</h2><div class="events-list">${group.events.map(eventRowHtml).join('')}</div></div>`)
    .join('');
}

// Mirrors renderArtistCard() in public/artistas.js. The Spotify photo is still loaded
// client-side (it needs a Spotify API call), so the image slot starts as the placeholder.
function artistCardHtml(artist) {
  const tag = artist.slug ? 'a' : 'div';
  const attrs = artist.slug
    ? ` class="artist-card artist-card-link" href="artista.html?slug=${encodeURIComponent(artist.slug)}"`
    : ' class="artist-card"';
  return `<${tag}${attrs}>
    <div class="artist-image"></div>
    <div class="artist-body">
      ${artist.featured ? '<span class="artist-featured">Featured</span>' : ''}
      <h4 class="artist-name">${escapeHtml(artist.name)}</h4>
      <span class="artist-genre">${escapeHtml(artist.genre || '')}</span>
      ${artist.slug ? '<span class="artist-card-hint">Ver perfil →</span>' : ''}
    </div>
  </${tag}>`;
}

// Mirrors renderTabs() in public/artistas.js.
function artistTabsHtml(disciplines, active) {
  return [ALL_TAB, ...disciplines]
    .map((t) => `<button class="tab${t === active ? ' active' : ''}">${t === ALL_TAB ? 'Todos' : escapeHtml(t)}</button>`)
    .join('');
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
  let html = eventoTemplate;

  let readFailed = false;
  if (slug) {
    try {
      const snap = await admin.firestore().collection('events').where('slug', '==', slug).limit(1).get();
      if (!snap.empty) {
        const ev = toClientEvent(snap.docs[0]);
        const dateLine = `${ev.day} ${ev.date} · ${ev.time} — ${ev.stage}`;
        const description = stripTags(ev.description || '') || dateLine;
        const image = ev.image || DEFAULT_IMAGE;
        meta = { title: `${ev.displayTitle} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image, type: 'article' };

        // Mirrors renderEvento() in public/evento.js. The YouTube/social embed and the map
        // iframe are left to the client: evento.js rebuilds them on load, so rendering them
        // here would load each third-party iframe twice. The Maps link itself is rendered.
        // Descriptions are sanitized rich text (sanitizeRichText() in routes/events.js) —
        // safe to inline as-is, same as the client does.
        html = html
          .replace('<h1 id="evento-title"></h1>', `<h1 id="evento-title">${escapeHtml(ev.displayTitle)}</h1>`)
          .replace('<p class="article-meta" id="evento-meta"></p>', `<p class="article-meta" id="evento-meta">${escapeHtml(dateLine)}</p>`)
          .replace('<div class="noticia-body" id="evento-body"></div>', `<div class="noticia-body" id="evento-body">${ev.description || ''}</div>`);

        if (ev.image) {
          html = html.replace(
            '<img class="evento-image" id="evento-image" alt="" hidden>',
            `<img class="evento-image" id="evento-image" src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.displayTitle)}">`
          );
        }
        if (ev.locationUrl) {
          html = html.replace(
            '<a class="evento-map-link" id="evento-map-link" href="#" target="_blank" rel="noopener" hidden>',
            `<a class="evento-map-link" id="evento-map-link" href="${escapeHtml(ev.locationUrl)}" target="_blank" rel="noopener">`
          );
        }
        if (ev.cost) {
          html = html.replace('<p class="evento-cost" id="evento-cost" hidden></p>', `<p class="evento-cost" id="evento-cost">Costo: ${escapeHtml(ev.cost)}</p>`);
        }
        if (ev.ticket_link) {
          html = html.replace(
            '<a class="btn btn-secondary btn-md" id="evento-ticket-link" href="#" target="_blank" rel="noopener" hidden>',
            `<a class="btn btn-secondary btn-md" id="evento-ticket-link" href="${escapeHtml(ev.ticket_link)}" target="_blank" rel="noopener">`
          );
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

router.get('/eventos.html', async (req, res) => {
  let html = eventosTemplate;
  let readFailed = false;
  try {
    const snap = await admin.firestore().collection('events').orderBy('event_date').get();
    const today = todayIsoInSiteZone();
    const upcoming = snap.docs.map(toClientEvent).filter((ev) => ev.event_date >= today);
    html = html.replace(
      '<div class="eventos-groups" id="eventos-groups"></div>',
      `<div class="eventos-groups" id="eventos-groups">${eventGroupsHtml(upcoming)}</div>`
    );
  } catch {
    // Firestore read failed — the client-side fetch in eventos.js will still populate the page (uncached).
    readFailed = true;
  }

  if (!readFailed) setPublicCache(req, res);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
  let jsonLd = '';

  let readFailed = false;
  if (slug) {
    try {
      const snap = await admin.firestore().collection('articles').doc(slug).get();
      if (snap.exists && snap.data().status === 'published') {
        const article = toClientArticle(snap);
        const description = stripTags(article.excerpt || article.note || '');
        const image = article.media && article.mediaType !== 'video' ? article.media : DEFAULT_IMAGE;
        meta = { title: `${article.title} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image, type: 'article' };
        jsonLd = articleJsonLd({ article, articleDate: snap.data().article_date, description: meta.description, image, url });

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
  html = injectMeta(html, meta);
  if (jsonLd) html = injectBeforeHeadEnd(html, jsonLd);
  res.send(html);
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
  let html = artistaTemplate;

  let readFailed = false;
  if (slug) {
    try {
      const snap = await admin.firestore().collection('artists').where('slug', '==', slug).limit(1).get();
      if (!snap.empty) {
        const artist = toClientArtist(snap.docs[0]);
        const disciplineLine = `${artist.discipline}${artist.genre ? ' — ' + artist.genre : ''}`;
        const description = stripTags(artist.bio || '') || disciplineLine;
        meta = { title: `${artist.name} — MRGNT`, description: truncate(description, DESCRIPTION_MAX_LENGTH), url, image: DEFAULT_IMAGE, type: 'profile' };

        // Mirrors renderArtista() in public/artista.js. The Spotify photo, embed and top tracks
        // need Spotify API calls and stay client-side. Bios are sanitized rich text
        // (sanitizeRichText() in routes/artists.js) — safe to inline as-is, same as the client does.
        html = html
          .replace('<h1 id="artista-title"></h1>', `<h1 id="artista-title">${escapeHtml(artist.name)}</h1>`)
          .replace('<p class="article-meta" id="artista-meta"></p>', `<p class="article-meta" id="artista-meta">${escapeHtml(disciplineLine)}</p>`)
          .replace('<div class="noticia-body" id="artista-body"></div>', `<div class="noticia-body" id="artista-body">${artist.bio || ''}</div>`);
        if (artist.featured) {
          html = html.replace('<span class="artista-featured" id="artista-featured" hidden>', '<span class="artista-featured" id="artista-featured">');
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

router.get('/artistas.html', async (req, res) => {
  let html = artistasTemplate;
  let readFailed = false;
  try {
    const snap = await admin.firestore().collection('artists').orderBy('createdAt').get();
    const artists = snap.docs.map(toClientArtist);
    html = html
      .replace('<div class="tabs" id="artistas-tabs"></div>', `<div class="tabs" id="artistas-tabs">${artistTabsHtml(DISCIPLINES, ALL_TAB)}</div>`)
      .replace(
        '<div class="artists-grid" id="artistas-list" style="margin-top:0"></div>',
        `<div class="artists-grid" id="artistas-list" style="margin-top:0">${artists.map(artistCardHtml).join('')}</div>`
      );
  } catch {
    // Firestore read failed — the client-side fetch in artistas.js will still populate the page (uncached).
    readFailed = true;
  }

  if (!readFailed) setPublicCache(req, res);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
