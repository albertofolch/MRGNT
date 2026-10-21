import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';

const listEl = document.getElementById('submissions-list');

async function renderSpotifyPreview(spotifyArtistId) {
  const sectionEl = document.getElementById('preview-spotify-section');
  const linkEl = document.getElementById('preview-spotify-link');
  const statusEl = document.getElementById('preview-spotify-status');
  const previewEl = document.getElementById('preview-spotify-preview');
  const rawEl = document.getElementById('preview-spotify-raw');

  if (!spotifyArtistId) {
    sectionEl.hidden = true;
    return;
  }

  sectionEl.hidden = false;
  rawEl.textContent = `ID: ${spotifyArtistId}`;
  linkEl.href = `https://open.spotify.com/artist/${spotifyArtistId}`;
  previewEl.hidden = true;
  statusEl.textContent = 'Buscando en Spotify…';
  statusEl.hidden = false;

  try {
    const [artistRes, tracksRes] = await Promise.all([
      fetch(`/api/spotify/artist/${spotifyArtistId}`),
      fetch(`/api/spotify/artist/${spotifyArtistId}/top-tracks`),
    ]);
    if (!artistRes.ok) throw new Error();
    const artistData = await artistRes.json();
    const tracks = tracksRes.ok ? await tracksRes.json() : [];

    const imageUrl = artistData.images && artistData.images[0] ? artistData.images[0].url : null;
    const imageEl = document.getElementById('preview-spotify-image');
    imageEl.src = imageUrl || '';
    imageEl.hidden = !imageUrl;
    document.getElementById('preview-spotify-name').textContent = artistData.name;
    document.getElementById('preview-spotify-tracks').innerHTML =
      tracks.slice(0, 5).map((t) => `<li>${t.name}</li>`).join('') || '<li>Sin canciones disponibles</li>';

    statusEl.hidden = true;
    previewEl.hidden = false;
  } catch {
    previewEl.hidden = true;
    statusEl.textContent = 'No se pudo encontrar ese artista en Spotify';
    statusEl.hidden = false;
  }
}

function openPreview(sub) {
  document.getElementById('preview-title').textContent = sub.name;
  document.getElementById('preview-meta').textContent = `${sub.discipline}${sub.genre ? ' — ' + sub.genre : ''}`;
  document.getElementById('preview-body').innerHTML = sub.bio || '';

  renderSpotifyPreview(sub.spotifyArtistId);

  document.getElementById('preview-overlay').hidden = false;
}

function closePreview() {
  document.getElementById('preview-overlay').hidden = true;
}

document.getElementById('preview-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'preview-overlay') closePreview();
});
document.getElementById('preview-close').addEventListener('click', closePreview);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePreview();
});

function renderList(submissions) {
  listEl.innerHTML = '';
  if (!submissions.length) {
    listEl.innerHTML = '<p class="admin-empty">No hay solicitudes pendientes.</p>';
    return;
  }
  submissions.forEach((sub) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-main">
        <div class="admin-row-title">${sub.name}</div>
        <div class="admin-row-sub">${sub.discipline}${sub.genre ? ' — ' + sub.genre : ''}</div>
        <div class="admin-row-sub">Enviado por ${sub.submitterName} (${sub.submitterEmail})</div>
      </div>
      <div class="admin-row-actions">
        ${sub.spotifyArtistId ? `<a href="https://open.spotify.com/artist/${sub.spotifyArtistId}" target="_blank" rel="noopener">Spotify</a>` : ''}
        <button type="button" class="admin-preview">Ver</button>
        <button type="button" class="admin-approve">Aprobar</button>
        <button type="button" class="admin-delete">Rechazar</button>
      </div>
    `;
    row.querySelector('.admin-preview').addEventListener('click', () => openPreview(sub));
    row.querySelector('.admin-approve').addEventListener('click', () => approveSubmission(sub));
    row.querySelector('.admin-delete').addEventListener('click', () => rejectSubmission(sub));
    listEl.appendChild(row);
  });
}

async function loadSubmissions() {
  const res = await apiFetch('/api/artist-submissions');
  const submissions = await res.json();
  renderList(submissions);
}

async function approveSubmission(sub) {
  if (!confirm(`¿Aprobar y publicar a "${sub.name}"?`)) return;
  const res = await apiFetch(`/api/artist-submissions/${sub.id}/approve`, { method: 'POST' });
  if (res.ok) await loadSubmissions();
  else alert('No se pudo aprobar la solicitud');
}

async function rejectSubmission(sub) {
  if (!confirm(`¿Rechazar y eliminar la solicitud de "${sub.name}"?`)) return;
  const res = await apiFetch(`/api/artist-submissions/${sub.id}`, { method: 'DELETE' });
  if (res.ok) await loadSubmissions();
  else alert('No se pudo rechazar la solicitud');
}

requireAdminSession(['admin']).then(async (session) => {
  if (!session) return;
  renderAdminNav('artist-submissions', session.role);
  await loadSubmissions();
});
