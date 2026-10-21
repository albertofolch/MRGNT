const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

// Streams back an image already stored in our own Storage bucket, same-origin.
// The newspaper image generator draws uploaded photos onto a <canvas> and exports it
// with toDataURL(), which requires the source image to be CORS-clean; Firebase Storage
// download URLs don't send Access-Control-Allow-Origin by default, so loading them
// directly into an <img crossorigin> fails. Proxying through our own origin sidesteps
// that without needing any bucket-level CORS configuration.
router.get('/proxy', async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  const bucket = admin.storage().bucket();
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`;
  if (!raw.startsWith(prefix)) return res.status(400).json({ error: 'URL no permitida' });

  let path;
  try {
    path = decodeURIComponent(raw.slice(prefix.length).split('?')[0]);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }
  // Only ever proxy objects our own upload routes create.
  if (!/^(events|articles)\/[^/]+$/.test(path)) return res.status(400).json({ error: 'Ruta no permitida' });

  try {
    const file = bucket.file(path);
    const [meta] = await file.getMetadata();
    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    file.createReadStream()
      .on('error', () => { if (!res.headersSent) res.status(404); res.end(); })
      .pipe(res);
  } catch {
    res.status(404).json({ error: 'No encontrado' });
  }
});

module.exports = router;
