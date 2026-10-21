const express = require('express');
const admin = require('firebase-admin');
const { requireAdmin } = require('../auth');
const { validate, buildDocData, createArtistDoc, toClient } = require('./artists');

const router = express.Router();

function toClientSubmission(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    name: d.name,
    discipline: d.discipline,
    genre: d.genre,
    bio: d.bio || null,
    spotifyArtistId: d.spotify_artist_id || null,
    submitterName: d.submitter_name,
    submitterEmail: d.submitter_email,
  };
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  // Honeypot field: real users never fill this hidden input, bots often do.
  if (body.website) return res.status(400).json({ error: 'Solicitud inválida' });

  const error = validate(body);
  if (error) return res.status(400).json({ error });
  if (!body.submitter_name || !body.submitter_name.trim()) return res.status(400).json({ error: 'Tu nombre es requerido' });
  if (!body.submitter_email || !body.submitter_email.trim()) return res.status(400).json({ error: 'Tu email es requerido' });

  const docData = {
    ...buildDocData(body),
    submitter_name: body.submitter_name.trim(),
    submitter_email: body.submitter_email.trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await admin.firestore().collection('artist_submissions').add(docData);
    const snap = await ref.get();
    res.status(201).json(toClientSubmission(snap));
  } catch {
    res.status(500).json({ error: 'Error al enviar el artista' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const snap = await admin.firestore().collection('artist_submissions').orderBy('createdAt', 'asc').get();
    res.json(snap.docs.map(toClientSubmission));
  } catch {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

router.post('/:id/approve', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('artist_submissions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });

  // snap.data() was already normalized by buildDocData() when the submission was created,
  // so re-running it here would call .trim() on already-normalized fields. Just drop the
  // submission-only fields and reuse the stored artist data as-is.
  const { submitter_name, submitter_email, createdAt, ...docData } = snap.data();
  try {
    const artistSnap = await createArtistDoc(docData);
    await ref.delete();
    res.status(201).json(toClient(artistSnap));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al aprobar el artista' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('artist_submissions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  await ref.delete();
  res.status(204).end();
});

module.exports = router;
