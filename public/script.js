const ALL_TAB = '__all__';

let noticiasTab = null;
let artistasTab = ALL_TAB;
let allArticles = [];
let allArtists = [];

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

function cardThumbHTML(post) {
  if (post.media && post.mediaType !== 'video') {
    return `<div class="card-thumb"><img src="${post.media}" alt="" loading="lazy"></div>`;
  }
  if (post.media && post.mediaType === 'video') {
    return `<div class="card-thumb"><video src="${post.media}" muted playsinline preload="metadata"></video></div>`;
  }
  if (post.embedProvider === 'youtube' && post.embedUrl) {
    const videoId = extractYouTubeId(post.embedUrl);
    if (videoId) {
      return `<div class="card-thumb"><img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy"></div>`;
    }
  }
  if (post.embedProvider) {
    return `<div class="card-thumb card-thumb-embed"><span>${post.embedProvider}</span></div>`;
  }
  return '';
}

function renderTabs(container, tabs, active, onSelect, allLabel = 'Todas') {
  container.innerHTML = '';
  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t === active ? ' active' : '');
    btn.textContent = t === ALL_TAB ? allLabel : t;
    btn.addEventListener('click', () => onSelect(t));
    container.appendChild(btn);
  });
}

function renderNoticias(categories) {
  renderTabs(document.getElementById('noticias-tabs'), [ALL_TAB, ...categories], noticiasTab, (t) => {
    noticiasTab = t;
    renderNoticias(categories);
  });

  const postsEl = document.getElementById('noticias-posts');
  postsEl.innerHTML = '';
  const filtered = noticiasTab === ALL_TAB ? allArticles : allArticles.filter((a) => a.category === noticiasTab);
  filtered.slice(0, 3).forEach((post) => {
    const card = document.createElement('div');
    card.className = 'card post-card';
    card.innerHTML = `
      ${cardThumbHTML(post)}
      <span class="badge badge-rust">${post.category}</span>
      <h3><a href="noticia.html?slug=${encodeURIComponent(post.slug)}">${post.title}</a></h3>
      <p class="post-excerpt">${post.excerpt}</p>
      <span class="post-date">${post.date}</span>
    `;
    postsEl.appendChild(card);
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function upcomingEvents(events) {
  const today = todayISO();
  return events.filter((ev) => ev.event_date >= today);
}

function renderEvents(events) {
  const listEl = document.getElementById('events-list');
  listEl.innerHTML = '';
  upcomingEvents(events).slice(0, 4).forEach((ev) => {
    const row = document.createElement(ev.slug ? 'a' : 'div');
    row.className = 'event-row';
    if (ev.slug) row.href = `evento.html?slug=${encodeURIComponent(ev.slug)}`;
    row.innerHTML = `
      <span class="event-time">${ev.day} ${ev.date.split(' ')[0]} ${ev.date.split(' ')[1].toUpperCase()} · ${ev.time}</span>
      <div class="event-main">
        <span class="event-artist">${ev.artist}</span>
        <span class="event-stage">${ev.stage}</span>
      </div>
      ${ev.tag ? `<span class="event-tag">${ev.tag}</span>` : ''}
    `;
    listEl.appendChild(row);
  });
}

function renderArtistCard(artist) {
  const card = document.createElement(artist.slug ? 'a' : 'div');
  card.className = 'artist-card';
  if (artist.slug) {
    card.classList.add('artist-card-link');
    card.href = `artista.html?slug=${encodeURIComponent(artist.slug)}`;
  }
  card.innerHTML = `
    <div class="artist-image"></div>
    <div class="artist-body">
      ${artist.featured ? '<span class="artist-featured">Featured</span>' : ''}
      <h4 class="artist-name">${artist.name}</h4>
      <span class="artist-genre">${artist.genre}</span>
      ${artist.slug ? '<span class="artist-card-hint">Ver perfil →</span>' : ''}
    </div>
  `;

  if (artist.spotifyArtistId) {
    fetch(`/api/spotify/artist/${artist.spotifyArtistId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const imageUrl = data.images && data.images[0] ? data.images[0].url : null;
        if (imageUrl) {
          const imageEl = card.querySelector('.artist-image');
          imageEl.innerHTML = '';
          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = artist.name;
          img.loading = 'lazy';
          imageEl.appendChild(img);
        }
      })
      .catch(() => {
        // No Spotify data available (not configured yet, bad ID, network error) — keep the placeholder.
      });
  }

  return card;
}

function renderArtistas(disciplines) {
  renderTabs(document.getElementById('artistas-tabs'), [ALL_TAB, ...disciplines], artistasTab, (t) => {
    artistasTab = t;
    renderArtistas(disciplines);
  }, 'Todos');

  const listEl = document.getElementById('artistas-list');
  listEl.innerHTML = '';
  const filtered = artistasTab === ALL_TAB ? allArtists : allArtists.filter((a) => a.discipline === artistasTab);
  filtered.forEach((artist) => {
    listEl.appendChild(renderArtistCard(artist));
  });
}

Promise.all([
  fetch('/api/meta').then((res) => res.json()),
  fetch('/api/articles').then((res) => res.json()),
  fetch('/api/events').then((res) => res.json()),
  fetch('/api/artists').then((res) => res.json()),
]).then(([meta, articles, events, artists]) => {
  noticiasTab = ALL_TAB;
  allArticles = articles;
  allArtists = artists;
  renderNoticias(meta.noticiasCategories);
  renderEvents(events);
  renderArtistas(meta.disciplines);
});
