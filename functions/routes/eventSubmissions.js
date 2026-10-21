const express = require('express');
const admin = require('firebase-admin');
const { requireAdmin } = require('../auth');
const { isoToDisplay, dayAbbrev } = require('../lib/dateFormat');
const { saveEventImage } = require('../lib/images');
const { deleteMediaFile } = require('../storage');
const { validate, buildDocData, createEventDoc, toClient } = require('./events');

const router = express.Router();

function toClientSubmission(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    event_date: d.event_date,
    date: isoToDisplay(d.event_date),
    day: dayAbbrev(d.event_date),
    time: d.time,
    stage: d.stage,
    artist: d.artist,
    tag: d.tag || '',
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
    ...(await buildDocData(body)),
    submitter_name: body.submitter_name.trim(),
    submitter_email: body.submitter_email.trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (body.image_data) {
    try {
      const { url, path } = await saveEventImage(body.image_data);
      docData.image = url;
      docData.image_path = path;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const ref = await admin.firestore().collection('event_submissions').add(docData);
    const snap = await ref.get();
    const submission = toClientSubmission(snap);
    res.status(201).json(submission);
  } catch {
    res.status(500).json({ error: 'Error al enviar el evento' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const snap = await admin.firestore().collection('event_submissions').orderBy('createdAt', 'asc').get();
    res.json(snap.docs.map(toClientSubmission));
  } catch {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

router.post('/:id/approve', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('event_submissions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });

  // snap.data() was already normalized by buildDocData() when the submission was created
  // (e.g. blank optional fields stored as null), so re-running it here would call
  // .trim() on those nulls and throw. Just drop the submission-only fields and reuse
  // the stored event data as-is.
  const { submitter_name, submitter_email, createdAt, ...docData } = snap.data();
  try {
    const eventSnap = await createEventDoc(docData);
    await ref.delete();
    res.status(201).json(toClient(eventSnap));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al aprobar el evento' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const ref = admin.firestore().collection('event_submissions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
  await ref.delete();
  const { image_path } = snap.data();
  if (image_path) await deleteMediaFile(image_path);
  res.status(204).end();
});

module.exports = router;
