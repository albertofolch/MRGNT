const form = document.getElementById('artist-submit-form');
const errorEl = document.getElementById('artist-submit-error');
const successEl = document.getElementById('artist-submit-success');
const submitBtn = document.getElementById('artist-submit-btn');
const disciplineSelect = document.getElementById('artist-discipline');
const spotifyInput = document.getElementById('artist-spotify');
const spotifyStatusEl = document.getElementById('artist-spotify-status');
const spotifyPreviewEl = document.getElementById('artist-spotify-preview');

const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;
const SPOTIFY_ARTIST_HOSTS = ['open.spotify.com', 'spotify.link'];
let spotifyPreviewTimer = null;

fetch('/api/meta')
  .then((res) => res.json())
  .then((meta) => {
    disciplineSelect.innerHTML = meta.disciplines.map((d) => `<option value="${d}">${d}</option>`).join('');
  });

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

async function updateSpotifyPreview() {
  const id = parseSpotifyId(spotifyInput.value);
  if (!id) {
    spotifyPreviewEl.hidden = true;
    if (spotifyInput.value.trim()) {
      spotifyStatusEl.textContent = 'Enlace de Spotify no reconocido';
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
    const imageEl = document.getElementById('artist-spotify-preview-image');
    imageEl.src = imageUrl || '';
    imageEl.hidden = !imageUrl;
    document.getElementById('artist-spotify-preview-name').textContent = artistData.name;
    document.getElementById('artist-spotify-preview-tracks').innerHTML =
      tracks.slice(0, 5).map((t) => `<li>${t.name}</li>`).join('') || '<li>Sin canciones disponibles</li>';

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  successEl.hidden = true;

  const payload = {
    name: document.getElementById('artist-name').value,
    discipline: disciplineSelect.value,
    genre: document.getElementById('artist-genre').value,
    bio: document.getElementById('artist-bio').value,
    spotify_artist_id: document.getElementById('artist-spotify').value,
    submitter_name: document.getElementById('artist-submitter-name').value,
    submitter_email: document.getElementById('artist-submitter-email').value,
    website: document.getElementById('artist-website').value,
  };

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/artist-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorEl.textContent = body.error || 'No se pudo enviar el artista. Inténtalo de nuevo.';
      errorEl.hidden = false;
      return;
    }
    form.reset();
    spotifyStatusEl.hidden = true;
    spotifyPreviewEl.hidden = true;
    successEl.textContent = '¡Gracias! Recibimos tu propuesta y la revisaremos antes de publicarla.';
    successEl.hidden = false;
  } catch {
    errorEl.textContent = 'No se pudo enviar el artista. Revisa tu conexión e inténtalo de nuevo.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});
