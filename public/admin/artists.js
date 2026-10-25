import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';
import { initRichEditor } from '/admin/rich-editor.js';

const PREVIEW_STORAGE_KEY = 'mrgnt_artist_preview';
const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;
const SPOTIFY_ARTIST_HOSTS = ['open.spotify.com', 'spotify.link'];

let artists = [];
let editingId = null;
let listFilter = 'all';
let spotifyPreviewTimer = null;
let spotifySearchTimer = null;

const form = document.getElementById('artist-form');
const errorEl = document.getElementById('artist-error');
const disciplineSelect = document.getElementById('artist-discipline');
const listEl = document.getElementById('artists-list');
const cancelBtn = document.getElementById('artist-cancel');
const submitBtn = document.getElementById('artist-submit');
const previewBtn = document.getElementById('artist-preview');
const headingEl = document.getElementById('form-heading');
const bioEditor = initRichEditor(document.getElementById('artist-bio-editor'));
const spotifyInput = document.getElementById('artist-spotify');
const spotifyStatusEl = document.getElementById('artist-spotify-status');
const spotifyPreviewEl = document.getElementById('artist-spotify-preview');
const spotifyPreviewImageEl = document.getElementById('artist-spotify-preview-image');
const spotifyPreviewNameEl = document.getElementById('artist-spotify-preview-name');
const spotifyPreviewTracksEl = document.getElementById('artist-spotify-preview-tracks');
const spotifySearchInput = document.getElementById('artist-spotify-search');
const spotifyResultsEl = document.getElementById('artist-spotify-results');

function parseSpotifyId(input) {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();
  if (SPOTIFY_ID_RE.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (SPOTIFY_ARTIST_HOSTS.includes(u.hostname)) {
      const match = u.pathname.match(/^\/(?:intl-[a-zA-Z]{2}\/)?artist\/([a-zA-Z0-9]{22})/);
      if (match) return match[1];
    }
  } catch {
    // not a valid URL either
  }
  return null;
}

function clearSpotifyPreview() {
  spotifyStatusEl.hidden = true;
  spotifyPreviewEl.hidden = true;
}

async function updateSpotifyPreview() {
  const id = parseSpotifyId(spotifyInput.value);
  if (!id) {
    spotifyPreviewEl.hidden = true;
    if (spotifyInput.value.trim()) {
      spotifyStatusEl.textContent = 'ID o URL de Spotify inválido';
      spotifyStatusEl.hidden = false;
    } else {
      spotifyStatusEl.hidden = true;
    }
    return;
  }

  spotifyStatusEl.textContent = 'Buscando en Spotify…';
  spotifyStatusEl.hidden = false;
  spotifyPreviewEl.hidden = true;

  try {
    const [artistRes, tracksRes] = await Promise.all([
      fetch(`/api/spotify/artist/${id}`),
      fetch(`/api/spotify/artist/${id}/top-tracks`),
    ]);
    if (!artistRes.ok) throw new Error();
    const artistData = await artistRes.json();
    const tracks = tracksRes.ok ? await tracksRes.json() : [];

    const imageUrl = artistData.images && artistData.images[0] ? artistData.images[0].url : null;
    spotifyPreviewImageEl.src = imageUrl || '';
    spotifyPreviewImageEl.hidden = !imageUrl;
    spotifyPreviewNameEl.textContent = artistData.name;
    spotifyPreviewTracksEl.innerHTML = tracks.slice(0, 5).map((t) => `<li>${t.name}</li>`).join('') || '<li>Sin canciones disponibles</li>';

    spotifyStatusEl.hidden = true;
    spotifyPreviewEl.hidden = false;
  } catch {
    spotifyPreviewEl.hidden = true;
    spotifyStatusEl.textContent = 'No se pudo encontrar ese artista en Spotify';
    spotifyStatusEl.hidden = false;
  }
}

spotifyInput.addEventListener('input', () => {
  clearTimeout(spotifyPreviewTimer);
  spotifyPreviewTimer = setTimeout(updateSpotifyPreview, 500);
});

function clearSpotifyResults() {
  spotifyResultsEl.hidden = true;
  spotifyResultsEl.innerHTML = '';
}

async function runSpotifySearch(query) {
  if (!query.trim()) {
    clearSpotifyResults();
    return;
  }
  try {
    const res = await apiFetch(`/api/spotify/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      spotifyResultsEl.innerHTML = `<p class="admin-spotify-results-empty">${body.error || 'No se pudo buscar en Spotify'}</p>`;
      spotifyResultsEl.hidden = false;
      return;
    }
    const results = await res.json();

    if (!results.length) {
      spotifyResultsEl.innerHTML = '<p class="admin-spotify-results-empty">Sin resultados</p>';
      spotifyResultsEl.hidden = false;
      return;
    }

    spotifyResultsEl.innerHTML = '';
    results.forEach((artist) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'admin-spotify-result';
      row.innerHTML = `
        ${artist.image ? `<img src="${artist.image}" alt="">` : '<span class="admin-spotify-result-placeholder"></span>'}
        <span class="admin-spotify-result-body">
          <strong>${artist.name}</strong>
          ${artist.genres.length ? `<span>${artist.genres.slice(0, 2).join(', ')}</span>` : ''}
        </span>
      `;
      row.addEventListener('click', () => {
        spotifyInput.value = artist.id;
        spotifySearchInput.value = artist.name;
        clearSpotifyResults();
        updateSpotifyPreview();
      });
      spotifyResultsEl.appendChild(row);
    });
    spotifyResultsEl.hidden = false;
  } catch (err) {
    console.error('Spotify search failed:', err);
    spotifyResultsEl.innerHTML = '<p class="admin-spotify-results-empty">No se pudo buscar en Spotify (revisa la consola)</p>';
    spotifyResultsEl.hidden = false;
  }
}

spotifySearchInput.addEventListener('input', () => {
  clearTimeout(spotifySearchTimer);
  const query = spotifySearchInput.value;
  spotifySearchTimer = setTimeout(() => runSpotifySearch(query), 400);
});

document.addEventListener('click', (e) => {
  if (e.target !== spotifySearchInput && !spotifyResultsEl.contains(e.target)) {
    clearSpotifyResults();
  }
});

previewBtn.addEventListener('click', () => {
  const preview = {
    name: document.getElementById('artist-name').value.trim() || 'Sin nombre',
    discipline: disciplineSelect.value,
    genre: document.getElementById('artist-genre').value,
    bio: bioEditor.getHTML(),
    featured: document.getElementById('artist-featured').checked,
    spotifyArtistId: parseSpotifyId(spotifyInput.value),
    showSpotifyEmbed: document.getElementById('artist-show-spotify').checked,
  };
  sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(preview));
  window.open('/artista.html?preview=1', '_blank');
});

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('artist-id').value = '';
  bioEditor.setHTML('');
  cancelBtn.hidden = true;
  submitBtn.textContent = 'Guardar artista';
  headingEl.textContent = 'NUEVO ARTISTA';
  errorEl.hidden = true;
  clearSpotifyPreview();
  clearSpotifyResults();
}

function startEdit(artist) {
  editingId = artist.id;
  document.getElementById('artist-id').value = artist.id;
  document.getElementById('artist-name').value = artist.name;
  disciplineSelect.value = artist.discipline;
  document.getElementById('artist-genre').value = artist.genre;
  document.getElementById('artist-spotify').value = artist.spotifyArtistId || '';
  document.getElementById('artist-featured').checked = artist.featured;
  document.getElementById('artist-show-spotify').checked = artist.showSpotifyEmbed;
  spotifySearchInput.value = '';
  clearSpotifyResults();
  if (artist.spotifyArtistId) {
    updateSpotifyPreview();
  } else {
    clearSpotifyPreview();
  }
  bioEditor.setHTML(artist.bio || '');
  cancelBtn.hidden = false;
  submitBtn.textContent = 'Guardar cambios';
  headingEl.textContent = `EDITAR: ${artist.name.toUpperCase()}`;
  errorEl.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filteredArtists() {
  if (listFilter === 'popular') return [...artists].sort((a, b) => b.views - a.views);
  return artists;
}

function renderList() {
  listEl.innerHTML = '';
  if (!artists.length) {
    listEl.innerHTML = '<p class="admin-empty">Aún no hay artistas.</p>';
    return;
  }
  filteredArtists().forEach((artist) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const views = `${artist.views.toLocaleString('es-MX')} ${artist.views === 1 ? 'visita' : 'visitas'}`;
    row.innerHTML = `
      <div class="admin-row-main">
        <div class="admin-row-title">${artist.name}${artist.featured ? ' · Featured' : ''}</div>
        <div class="admin-row-sub">${artist.discipline} — ${artist.genre || 'Sin género'} · ${views}</div>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="admin-edit">Editar</button>
        <button type="button" class="admin-delete">Eliminar</button>
      </div>
    `;
    row.querySelector('.admin-edit').addEventListener('click', () => startEdit(artist));
    row.querySelector('.admin-delete').addEventListener('click', () => deleteArtist(artist));
    listEl.appendChild(row);
  });
}

async function loadArtists() {
  const res = await apiFetch('/api/artists');
  artists = await res.json();
  renderList();
}

async function deleteArtist(artist) {
  if (!confirm(`¿Eliminar a "${artist.name}"?`)) return;
  const res = await apiFetch(`/api/artists/${artist.id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingId === artist.id) resetForm();
    await loadArtists();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const payload = {
    name: document.getElementById('artist-name').value,
    discipline: disciplineSelect.value,
    genre: document.getElementById('artist-genre').value,
    featured: document.getElementById('artist-featured').checked,
    bio: bioEditor.getHTML(),
    spotify_artist_id: document.getElementById('artist-spotify').value,
    show_spotify_embed: document.getElementById('artist-show-spotify').checked,
  };
  const url = editingId ? `/api/artists/${editingId}` : '/api/artists';
  const method = editingId ? 'PUT' : 'POST';
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = body.error || 'No se pudo guardar el artista';
    errorEl.hidden = false;
    return;
  }
  resetForm();
  await loadArtists();
});

cancelBtn.addEventListener('click', resetForm);

document.querySelectorAll('.admin-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    listFilter = btn.dataset.filter;
    document.querySelectorAll('.admin-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderList();
  });
});

requireAdminSession(['admin']).then(async (session) => {
  if (!session) return;
  renderAdminNav('artists', session.role);
  const meta = await (await apiFetch('/api/meta')).json();
  disciplineSelect.innerHTML = meta.disciplines.map((d) => `<option value="${d}">${d}</option>`).join('');
  await loadArtists();
});
