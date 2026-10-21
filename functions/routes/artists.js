const express = require('express');
const admin = require('firebase-admin');
const { requireAdmin } = require('../auth');
const { DISCIPLINES } = require('../constants');
const { sanitizeRichText } = require('../lib/sanitize');
const { slugify } = require('../lib/slugify');

const router = express.Router();

const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{22}$/;
const SPOTIFY_ARTIST_HOSTS = ['open.spotify.com', 'spotify.link'];

function normalizeSpotifyId(input) {
  if (!input || !input.trim()) return { id: null, error: null };
  const trimmed = input.trim();
  if (SPOTIFY_ID_RE.test(trimmed)) return { id: trimmed, error: null };
  try {
    const u = new URL(trimmed);
    if (SPOTIFY_ARTIST_HOSTS.includes(u.hostname)) {
      // Spotify share links often carry a locale prefix, e.g. /intl-es/artist/ID
      const match = u.pathname.match(/^\/(?:intl-[a-zA-Z]{2}\/)?artist\/([a-zA-Z0-9]{22})/);
      if (match) return { id: match[1], error: null };
    }
  } catch {
    // not a valid URL either — fall through to error below
  }
  return { id: null, error: 'ID o URL de Spotify inválido' };
}

function toClient(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    slug: d.slug || null,
    name: d.name,
    discipline: d.discipline,
    genre: d.genre,
    featured: d.featured === true,
    bio: d.bio || null,
    spotifyArtistId: d.spotify_artist_id || null,
    showSpotifyEmbed: d.show_spotify_embed === true,
  };
}

function validate(body) {
  if (!body.name || !body.name.trim()) return 'El nombre es requerido';
  if (!DISCIPLINES.includes(body.discipline)) return 'Disciplina inválida';
  const spotifyCheck = normalizeSpotifyId(body.spotify_artist_id);
  if (spotifyCheck.error) return spotifyCheck.error;
  return null;
}

router.get('/', async (req, res) => {
  try {
    const snap = await admin.firestore().collection('artists').orderBy('createdAt').get();
    res.json(snap.docs.map(toClient));
  } catch {
    res.status(500).json({ error: 'Error al obtener artistas' });
  }
});

function buildDocData(body) {
  const { name, discipline, genre = '', featured = false, bio = '' } = body;
  const { id: spotifyArtistId } = normalizeSpotifyId(body.spotify_artist_id);
  return {
    name: name.trim(),
    discipline,
    genre,
    featured: featured === true || featured === 'true',
    bio: sanitizeRichText(bio),
    spotify_artist_id: spotifyArtistId,
    show_spotify_embed: (body.show_spotify_embed === true || body.show_spotify_embed === 'true') && !!spotifyArtistId,
  };
}

async function createArtistDoc(docData) {
  const baseSlug = slugify(docData.name) || 'artista';
  const col = admin.firestore().collection('artists');
  let finalRef = null;
  await admin.firestore().runTransaction(async (tx) => {
    let slug = baseSlug;
    let n = 2;
    for (let attempt = 0; attempt < 20; attempt++) {
      const snap = await tx.get(col.where('slug', '==', slug));
      if (snap.empty) {
        const ref = col.doc();
        tx.set(ref, { ...docData, slug, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        finalRef = ref;
        return;
      }
      slug = `${baseSlug}-${n++}`;
    }
    throw new Error('No se pudo generar slug único');
  });
  return finalRef.get();
}

router.post('/', requireAdmin, async (req, res) => {
  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });

  const docData = buildDocData(req.body);

  try {
    const snap = await createArtistDoc(docData);
    res.status(201).json(toClient(snap));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al crear artista' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('artists').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });

  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });

  const docData = buildDocData(req.body);
  const existing = snap.data();

  try {
    if (existing.slug) {
      await ref.update(docData);
    } else {
      const baseSlug = slugify(docData.name) || 'artista';
      const col = admin.firestore().collection('artists');
      await admin.firestore().runTransaction(async (tx) => {
        let slug = baseSlug;
        let n = 2;
        for (let attempt = 0; attempt < 20; attempt++) {
          const qSnap = await tx.get(col.where('slug', '==', slug));
          const collision = qSnap.docs.some((d) => d.id !== ref.id);
          if (!collision) {
            tx.update(ref, { ...docData, slug });
            return;
          }
          slug = `${baseSlug}-${n++}`;
        }
        throw new Error('No se pudo generar slug único');
      });
    }
    const updated = await ref.get();
    res.json(toClient(updated));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al actualizar artista' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('artists').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  try {
    await ref.delete();
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Error al eliminar artista' });
  }
});

module.exports = router;
module.exports.validate = validate;
module.exports.buildDocData = buildDocData;
module.exports.createArtistDoc = createArtistDoc;
module.exports.toClient = toClient;
