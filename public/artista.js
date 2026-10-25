const PREVIEW_STORAGE_KEY = 'mrgnt_artist_preview';

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function isPreviewMode() {
  return getParam('preview') === '1';
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function renderNotFound() {
  document.getElementById('artista-title').textContent = 'Artista no encontrado';
  document.getElementById('artista-meta').textContent = '';
  document.getElementById('artista-body').innerHTML = '<p>Este artista no existe o fue eliminado.</p>';
}

function renderTracks(tracks) {
  const wrapEl = document.getElementById('artista-tracks');
  const listEl = document.getElementById('artista-tracks-list');
  if (!tracks || !tracks.length) {
    wrapEl.hidden = true;
    return;
  }
  listEl.innerHTML = '';
  tracks.forEach((track) => {
    const row = document.createElement(track.external_url ? 'a' : 'div');
    row.className = 'artista-track';
    if (track.external_url) {
      row.href = track.external_url;
      row.target = '_blank';
      row.rel = 'noopener';
    }
    row.innerHTML = `
      ${track.album_image ? `<img class="artista-track-art" src="${track.album_image}" alt="" loading="lazy">` : '<span class="artista-track-art artista-track-art-placeholder"></span>'}
      <span class="artista-track-name">${track.name}</span>
      <span class="artista-track-duration">${formatDuration(track.duration_ms)}</span>
    `;
    listEl.appendChild(row);
  });
  wrapEl.hidden = false;
}

function loadSpotifyExtras(spotifyArtistId, showSpotifyEmbed) {
  fetch(`/api/spotify/artist/${spotifyArtistId}`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((data) => {
      const imageUrl = data.images && data.images[0] ? data.images[0].url : null;
      if (imageUrl) {
        const imageEl = document.getElementById('artista-hero-image');
        imageEl.innerHTML = `<img src="${imageUrl}" alt="">`;
        imageEl.hidden = false;
      }
    })
    .catch(() => {
      // No Spotify data available — keep the placeholder hidden.
    });

  if (showSpotifyEmbed) {
    const embedWrap = document.getElementById('artista-spotify-embed');
    embedWrap.innerHTML = `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/artist/${spotifyArtistId}?utm_source=generator" width="100%" height="352" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    embedWrap.hidden = false;
    // The embed above already shows the artist's top tracks — skip the redundant list.
    return;
  }

  fetch(`/api/spotify/artist/${spotifyArtistId}/top-tracks`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then(renderTracks)
    .catch(() => {
      // No track data available — leave the section hidden.
    });
}

function renderArtista(artist) {
  document.title = `${artist.name} — MRGNT`;
  document.getElementById('artista-title').textContent = artist.name;
  document.getElementById('artista-meta').textContent = `${artist.discipline}${artist.genre ? ' — ' + artist.genre : ''}`;
  document.getElementById('artista-featured').hidden = !artist.featured;
  document.getElementById('artista-body').innerHTML = artist.bio || '';

  if (artist.spotifyArtistId) {
    loadSpotifyExtras(artist.spotifyArtistId, artist.showSpotifyEmbed);
  }
}

// Counts one visit per browser per artist (see POST /api/artists/:id/view). Browsers that
// have signed in to the admin panel are skipped so the team doesn't inflate the numbers.
function recordView(id) {
  try {
    if (localStorage.getItem('mrgnt_staff')) return;
    const key = `mrgnt_viewed_artist_${id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    return; // Storage blocked: skip rather than count every reload.
  }
  fetch(`/api/artists/${encodeURIComponent(id)}/view`, { method: 'POST', keepalive: true }).catch(() => {});
}

if (isPreviewMode()) {
  const raw = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
  if (raw) {
    try {
      renderArtista(JSON.parse(raw));
    } catch {
      renderNotFound();
    }
  } else {
    renderNotFound();
  }
} else {
  fetch('/api/artists')
    .then((res) => res.json())
    .then((artists) => {
      const artist = artists.find((a) => a.slug === getParam('slug'));
      if (!artist) return renderNotFound();
      renderArtista(artist);
      recordView(artist.id);
    });
}
