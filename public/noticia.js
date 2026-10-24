function getSlugParam() {
  return new URLSearchParams(window.location.search).get('slug');
}

function renderNotFound() {
  document.getElementById('noticia-title').textContent = 'Artículo no encontrado';
  document.getElementById('noticia-category').hidden = true;
  document.getElementById('noticia-meta').textContent = '';
  document.getElementById('noticia-body').innerHTML = '<p>Este artículo no existe o fue eliminado.</p>';
}

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

function injectScriptOnce(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

function renderEmbed(article) {
  const embedEl = document.getElementById('noticia-embed');
  embedEl.innerHTML = '';
  if (!article.embedUrl || !article.embedProvider) {
    embedEl.hidden = true;
    return;
  }

  if (article.embedProvider === 'youtube') {
    const videoId = extractYouTubeId(article.embedUrl);
    if (!videoId) {
      embedEl.hidden = true;
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
    iframe.title = article.title;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.className = 'embed-youtube';
    embedEl.appendChild(iframe);
  } else if (article.embedProvider === 'instagram') {
    const bq = document.createElement('blockquote');
    bq.className = 'instagram-media';
    bq.setAttribute('data-instgrm-permalink', article.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.instagram.com/embed.js');
    if (window.instgrm) window.instgrm.Embeds.process();
  } else if (article.embedProvider === 'tiktok') {
    const bq = document.createElement('blockquote');
    bq.className = 'tiktok-embed';
    bq.setAttribute('cite', article.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.tiktok.com/embed.js');
  } else if (article.embedProvider === 'twitter') {
    const bq = document.createElement('blockquote');
    bq.className = 'twitter-tweet';
    const a = document.createElement('a');
    a.href = article.embedUrl;
    bq.appendChild(a);
    embedEl.appendChild(bq);
    injectScriptOnce('https://platform.twitter.com/widgets.js');
    if (window.twttr && window.twttr.widgets) window.twttr.widgets.load();
  }

  embedEl.hidden = false;
}

function renderNoticia(article) {
  document.title = `${article.title} — MRGNT`;
  document.getElementById('noticia-category').textContent = article.category;
  document.getElementById('noticia-title').textContent = article.title;
  document.getElementById('noticia-meta').textContent = `${article.author} · ${article.date}`;

  const mediaEl = document.getElementById('noticia-media');
  mediaEl.innerHTML = '';
  if (article.media) {
    const el = article.mediaType === 'video' ? document.createElement('video') : document.createElement('img');
    el.src = article.media;
    if (article.mediaType === 'video') el.controls = true;
    else el.alt = article.title;
    mediaEl.appendChild(el);
    mediaEl.hidden = false;
  } else {
    mediaEl.hidden = true;
  }

  renderEmbed(article);

  const bodyEl = document.getElementById('noticia-body');
  bodyEl.innerHTML = '';
  const note = (article.note || '').replace(/\r\n/g, '\n');
  if (/<[a-z][\s\S]*>/i.test(note)) {
    // Rich-text content: already sanitized server-side before it was stored.
    bodyEl.innerHTML = note;
  } else {
    // Legacy plain-text note (predates the rich-text editor): render safely as before.
    note.split(/\n{2,}/).forEach((paragraph) => {
      const p = document.createElement('p');
      paragraph.split('\n').forEach((line, i) => {
        if (i > 0) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      bodyEl.appendChild(p);
    });
  }
}

function renderRelated(article, articles) {
  const sectionEl = document.getElementById('noticia-related');
  const listEl = document.getElementById('noticia-related-list');
  listEl.innerHTML = '';

  const others = articles.filter((a) => a.slug !== article.slug);
  const sameCategory = others.filter((a) => a.category === article.category);
  const rest = others.filter((a) => a.category !== article.category);
  const related = [...sameCategory, ...rest].slice(0, 4);

  if (!related.length) {
    sectionEl.hidden = true;
    return;
  }

  related.forEach((post) => {
    const item = document.createElement('a');
    item.className = 'noticia-related-item';
    item.href = `noticia.html?slug=${encodeURIComponent(post.slug)}`;
    const thumb = post.media && post.mediaType !== 'video'
      ? `<img src="${post.media}" alt="">`
      : '<span class="noticia-related-thumb-placeholder"></span>';
    item.innerHTML = `
      <span class="noticia-related-thumb">${thumb}</span>
      <span class="noticia-related-body">
        <span class="noticia-related-category">${post.category}</span>
        <span class="noticia-related-title">${post.title}</span>
        <span class="noticia-related-meta">${post.date}</span>
      </span>
    `;
    listEl.appendChild(item);
  });

  sectionEl.hidden = false;
}

// Counts one read per browser per article (see POST /api/articles/:id/view). Browsers that
// have signed in to the admin panel are skipped so the team doesn't inflate the numbers.
function recordView(slug) {
  try {
    if (localStorage.getItem('mrgnt_staff')) return;
    const key = `mrgnt_viewed_${slug}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    return; // Storage blocked: skip rather than count every reload.
  }
  fetch(`/api/articles/${encodeURIComponent(slug)}/view`, { method: 'POST', keepalive: true }).catch(() => {});
}

fetch('/api/articles')
  .then((res) => res.json())
  .then((articles) => {
    const article = articles.find((a) => a.slug === getSlugParam());
    if (!article) return renderNotFound();
    renderNoticia(article);
    renderRelated(article, articles);
    recordView(article.slug);
  });
