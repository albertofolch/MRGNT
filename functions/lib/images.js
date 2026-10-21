const admin = require('firebase-admin');
const crypto = require('crypto');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const DATA_URL_RE = /^data:(image\/[a-z]+);base64,([a-zA-Z0-9+/=]+)$/;

// Accepts a data: URL (as produced by FileReader.readAsDataURL in the browser),
// stores it in Cloud Storage under events/, and returns a public download URL
// plus the storage path (needed later to delete the file).
async function saveEventImage(dataUrl) {
  const match = typeof dataUrl === 'string' && DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error('Formato de imagen no válido');
  const [, contentType, base64] = match;
  const ext = CONTENT_TYPE_EXT[contentType];
  if (!ext) throw new Error('Solo se aceptan imágenes JPEG, PNG, WEBP o GIF');

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('La imagen no debe pesar más de 5 MB');

  const path = `events/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const token = crypto.randomUUID();
  const file = admin.storage().bucket().file(path);
  await file.save(buffer, { contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { url, path };
}

module.exports = { saveEventImage };
