const express = require('express');
const admin = require('firebase-admin');
const { requireAuth, requireAdmin, resolveRole, decodeToken } = require('../auth');
const { NOTICIAS_CATEGORIES } = require('../constants');
const { isoToDisplay } = require('../lib/dateFormat');
const { deleteMediaFile } = require('../storage');
const { slugify } = require('../lib/slugify');
const { sanitizeRichText } = require('../lib/sanitize');
const { detectEmbedProvider } = require('../lib/embeds');
const { setPublicCache } = require('../lib/cache');
const { recordView } = require('../lib/views');

const router = express.Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `views` is only sent to the admin panel; the public list stays free of it.
function toClient(doc, { withViews = true } = {}) {
  const d = doc.data();
  return {
    id: doc.id,
    slug: doc.id,
    category: d.category,
    title: d.title,
    article_date: d.article_date,
    date: isoToDisplay(d.article_date),
    author: d.author,
    excerpt: d.excerpt,
    note: d.note,
    media: d.media || null,
    mediaType: d.media_type || null,
    embedUrl: d.embed_url || null,
    embedProvider: d.embed_provider || null,
    status: d.status === 'published' ? 'published' : 'draft',
    createdBy: d.created_by || null,
    ...(withViews ? { views: d.views || 0 } : {}),
  };
}

function normalizeNote(note) {
  return sanitizeRichText(note.replace(/\r\n/g, '\n').trim());
}

function validate(body) {
  if (!body.title || !body.title.trim()) return 'El título es requerido';
  if (!NOTICIAS_CATEGORIES.includes(body.category)) return 'Categoría inválida';
  if (!body.article_date || !ISO_DATE_RE.test(body.article_date)) return 'Fecha inválida (usa el selector de fecha)';
  if (!body.author || !body.author.trim()) return 'El autor es requerido';
  if (!body.excerpt || !body.excerpt.trim()) return 'El resumen es requerido';
  if (!body.note || !body.note.trim()) return 'La nota es requerida';
  if (body.embed_url && body.embed_url.trim() && !detectEmbedProvider(body.embed_url.trim())) {
    return 'Enlace de embed no reconocido (usa YouTube, Instagram, TikTok o X/Twitter)';
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const decoded = await decodeToken(req);
    const role = decoded && resolveRole(decoded);
    let query = admin.firestore().collection('articles').orderBy('article_date', 'desc');
    if (!role) query = query.where('status', '==', 'published');
    const snap = await query.get();
    setPublicCache(req, res);
    res.json(snap.docs.map((doc) => toClient(doc, { withViews: Boolean(role) })));
  } catch {
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  if (!req.body.media) return res.status(400).json({ error: 'La foto de portada es requerida' });

  const { title, category, article_date, author, excerpt, note, media, media_path, media_type } = req.body;
  const rawSlug = req.body.slug && req.body.slug.trim() ? req.body.slug.trim() : title;
  const baseSlug = slugify(rawSlug) || 'articulo';
  const embedUrl = req.body.embed_url && req.body.embed_url.trim() ? req.body.embed_url.trim() : null;
  const embedProvider = embedUrl ? detectEmbedProvider(embedUrl) : null;

  const docData = {
    category,
    title: title.trim(),
    article_date,
    author: author.trim(),
    excerpt: excerpt.trim(),
    note: normalizeNote(note),
    media: media || null,
    media_path: media_path || null,
    media_type: media_type || null,
    embed_url: embedUrl,
    embed_provider: embedProvider,
    status: 'draft',
    created_by: req.user.uid,
    created_by_email: req.user.email || null,
  };

  const col = admin.firestore().collection('articles');
  let finalRef = null;
  let slug = baseSlug;

  try {
    await admin.firestore().runTransaction(async (tx) => {
      let n = 2;
      for (let attempt = 0; attempt < 20; attempt++) {
        const ref = col.doc(slug);
        const snap = await tx.get(ref);
        if (!snap.exists) {
          tx.set(ref, docData);
          finalRef = ref;
          return;
        }
        slug = `${baseSlug}-${n++}`;
      }
      throw new Error('No se pudo generar slug único');
    });

    const newSnap = await finalRef.get();
    res.status(201).json(toClient(newSnap));
  } catch (err) {
    if (media_path) await deleteMediaFile(media_path).catch(() => {});
    res.status(500).json({ error: err.message || 'Error al crear artículo' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const oldId = req.params.id;
  const col = admin.firestore().collection('articles');
  const oldRef = col.doc(oldId);

  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) return res.status(404).json({ error: 'No encontrado' });

  const existing = oldSnap.data();
  if (req.role !== 'admin') {
    if (existing.created_by !== req.user.uid) return res.status(403).json({ error: 'No puedes editar artículos de otros autores' });
    if (existing.status === 'published') return res.status(403).json({ error: 'No puedes editar un artículo ya publicado' });
  }

  const error = validate(req.body || {});
  if (error) return res.status(400).json({ error });

  const { title, category, article_date, author, excerpt, note } = req.body;

  let media = existing.media;
  let mediaPath = existing.media_path;
  let mediaType = existing.media_type;
  let mediaPathToDelete = null;

  if (req.body.media) {
    mediaPathToDelete = existing.media_path;
    media = req.body.media;
    mediaPath = req.body.media_path || null;
    mediaType = req.body.media_type || null;
  } else if (req.body.remove_media === true) {
    mediaPathToDelete = existing.media_path;
    media = null;
    mediaPath = null;
    mediaType = null;
  }

  if (!media) return res.status(400).json({ error: 'La foto de portada es requerida' });
  if (mediaPathToDelete) await deleteMediaFile(mediaPathToDelete).catch(() => {});

  let embedUrl = existing.embed_url || null;
  let embedProvider = existing.embed_provider || null;

  if (req.body.embed_url && req.body.embed_url.trim()) {
    embedUrl = req.body.embed_url.trim();
    embedProvider = detectEmbedProvider(embedUrl);
  } else if (req.body.remove_embed === true) {
    embedUrl = null;
    embedProvider = null;
  }

  const rawSlug = req.body.slug && req.body.slug.trim() ? req.body.slug.trim() : null;
  const newBaseSlug = rawSlug ? slugify(rawSlug) : oldId;

  const docData = {
    category,
    title: title.trim(),
    article_date,
    author: author.trim(),
    excerpt: excerpt.trim(),
    note: normalizeNote(note),
    media,
    media_path: mediaPath,
    media_type: mediaType,
    embed_url: embedUrl,
    embed_provider: embedProvider,
    status: existing.status === 'published' ? 'published' : 'draft',
    created_by: existing.created_by || req.user.uid,
    created_by_email: existing.created_by_email || req.user.email || null,
  };

  try {
    let finalRef = null;

    if (newBaseSlug === oldId) {
      await oldRef.update(docData);
      finalRef = oldRef;
    } else {
      let slug = newBaseSlug;
      await admin.firestore().runTransaction(async (tx) => {
        // Read the view count inside the transaction so reads recorded mid-rename aren't lost.
        const current = await tx.get(oldRef);
        const views = (current.exists && current.data().views) || 0;
        let n = 2;
        for (let attempt = 0; attempt < 20; attempt++) {
          const newRef = col.doc(slug);
          const snap = await tx.get(newRef);
          if (!snap.exists) {
            tx.delete(oldRef);
            tx.set(newRef, { ...docData, views });
            finalRef = newRef;
            return;
          }
          slug = `${newBaseSlug}-${n++}`;
        }
        throw new Error('No se pudo generar slug único');
      });
    }

    const updatedSnap = await finalRef.get();
    res.json(toClient(updatedSnap));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al actualizar artículo' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ref = admin.firestore().collection('articles').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
    const data = snap.data();
    if (req.role !== 'admin') {
      if (data.created_by !== req.user.uid) return res.status(403).json({ error: 'No puedes eliminar artículos de otros autores' });
      if (data.status === 'published') return res.status(403).json({ error: 'No puedes eliminar un artículo ya publicado' });
    }
    await ref.delete();
    if (data.media_path) await deleteMediaFile(data.media_path).catch(() => {});
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Error al eliminar artículo' });
  }
});

// Public: called once per browser per article by noticia.js; only published articles count.
router.post('/:id/view', (req, res) => {
  const ref = admin.firestore().collection('articles').doc(req.params.id);
  return recordView(req, res, ref, (d) => d.status === 'published');
});

router.post('/:id/publish', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('articles').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  try {
    await ref.update({ status: 'published' });
    const updated = await ref.get();
    res.json(toClient(updated));
  } catch {
    res.status(500).json({ error: 'Error al publicar artículo' });
  }
});

router.post('/:id/unpublish', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('articles').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  try {
    await ref.update({ status: 'draft' });
    const updated = await ref.get();
    res.json(toClient(updated));
  } catch {
    res.status(500).json({ error: 'Error al despublicar artículo' });
  }
});

module.exports = router;
