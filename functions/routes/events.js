const express = require('express');
const admin = require('firebase-admin');
const { requireAdmin } = require('../auth');
const { isoToDisplay, dayAbbrev } = require('../lib/dateFormat');
const { slugify } = require('../lib/slugify');
const { sanitizeRichText } = require('../lib/sanitize');
const { detectEmbedProvider } = require('../lib/embeds');
const { resolveMapsEmbedUrl } = require('../lib/maps');
const { saveEventImage } = require('../lib/images');
const { deleteMediaFile } = require('../storage');

const router = express.Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toClient(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    slug: d.slug || null,
    event_date: d.event_date,
    date: isoToDisplay(d.event_date),
    day: dayAbbrev(d.event_date),
    time: d.time,
    stage: d.stage,
    artist: d.artist,
    tag: d.tag,
    title: d.title || null,
    displayTitle: d.title || d.artist,
    description: d.description || null,
    cost: d.cost || null,
    ticket_link: d.ticket_link || null,
    embedUrl: d.embed_url || null,
    embedProvider: d.embed_provider || null,
    image: d.image || null,
    locationUrl: d.location_url || null,
    locationEmbedUrl: d.location_embed_url || null,
  };
}

function validate(body) {
  if (!body.event_date || !ISO_DATE_RE.test(body.event_date)) return 'Fecha inválida (usa el selector de fecha)';
  if (!body.time || !body.time.trim()) return 'La hora es requerida';
  if (!body.stage || !body.stage.trim()) return 'El escenario es requerido';
  if (!body.artist || !body.artist.trim()) return 'El artista/acto es requerido';
  if (body.ticket_link && body.ticket_link.trim()) {
    try {
      const u = new URL(body.ticket_link.trim());
      if (!/^https?:$/.test(u.protocol)) return 'El enlace de boletos debe ser http o https';
    } catch {
      return 'El enlace de boletos no es válido';
    }
  }
  if (body.location_url && body.location_url.trim()) {
    try {
      const u = new URL(body.location_url.trim());
      if (!/^https?:$/.test(u.protocol)) return 'El enlace de Google Maps debe ser http o https';
    } catch {
      return 'El enlace de Google Maps no es válido';
    }
  }
  if (body.embed_url && body.embed_url.trim() && !detectEmbedProvider(body.embed_url.trim())) {
    return 'Enlace de embed no reconocido (usa YouTube, Instagram, TikTok o X/Twitter)';
  }
  return null;
}

async function buildDocData(body) {
  const { event_date, time, stage, artist, tag = '', title = '', description = '', cost = '', ticket_link = '', embed_url = '', location_url = '' } = body;
  const embedUrl = embed_url.trim() || null;
  const locationUrl = location_url.trim() || null;
  return {
    event_date,
    time: time.trim(),
    stage: stage.trim(),
    artist: artist.trim(),
    tag,
    title: title.trim() || null,
    description: sanitizeRichText(description),
    cost: cost.trim() || null,
    ticket_link: ticket_link.trim() || null,
    embed_url: embedUrl,
    embed_provider: embedUrl ? detectEmbedProvider(embedUrl) : null,
    location_url: locationUrl,
    location_embed_url: locationUrl ? await resolveMapsEmbedUrl(locationUrl) : null,
  };
}

async function createEventDoc(docData) {
  const baseSlug = slugify(docData.title || docData.artist) || 'evento';
  const col = admin.firestore().collection('events');
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

router.get('/', async (req, res) => {
  try {
    const snap = await admin.firestore().collection('events').orderBy('event_date').get();
    res.json(snap.docs.map(toClient));
  } catch {
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// Resolves a Google Maps link into an embeddable URL on demand — used as a fallback by the
// event page for events saved before location_embed_url existed, or if resolving it at save
// time failed (e.g. a transient network error).
router.get('/resolve-map', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });
  const embedUrl = await resolveMapsEmbedUrl(url);
  res.json({ embedUrl });
});

router.post('/', requireAdmin, async (req, res) => {
  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });

  const docData = await buildDocData(req.body);

  if (req.body.image_data) {
    try {
      const { url, path } = await saveEventImage(req.body.image_data);
      docData.image = url;
      docData.image_path = path;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const snap = await createEventDoc(docData);
    res.status(201).json(toClient(snap));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al crear evento' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('events').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });

  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });

  const docData = await buildDocData(req.body);
  const existing = snap.data();

  // Images aren't part of the plain form fields buildDocData() overwrites wholesale —
  // keep the existing image unless a replacement was uploaded or removal was requested.
  docData.image = existing.image || null;
  docData.image_path = existing.image_path || null;
  if (req.body.image_data) {
    try {
      const { url, path } = await saveEventImage(req.body.image_data);
      if (existing.image_path) await deleteMediaFile(existing.image_path);
      docData.image = url;
      docData.image_path = path;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else if (req.body.remove_image === true) {
    if (existing.image_path) await deleteMediaFile(existing.image_path);
    docData.image = null;
    docData.image_path = null;
  }

  try {
    if (existing.slug) {
      await ref.update(docData);
    } else {
      const baseSlug = slugify(docData.title || docData.artist) || 'evento';
      const col = admin.firestore().collection('events');
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
    res.status(500).json({ error: err.message || 'Error al actualizar evento' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('events').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  try {
    await ref.delete();
    const { image_path } = snap.data();
    if (image_path) await deleteMediaFile(image_path);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

module.exports = router;
module.exports.validate = validate;
module.exports.buildDocData = buildDocData;
module.exports.createEventDoc = createEventDoc;
module.exports.toClient = toClient;
