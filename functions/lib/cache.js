// Lets Firebase Hosting's CDN serve a public GET response for a few minutes, so a burst of
// readers costs one Firestore read per document instead of one per visitor. Only call it on
// a successful response (an error must never be cached). Requests carrying an Authorization
// header (the admin panel) get drafts and extra fields, so they are never cached, and
// `Vary: Authorization` keeps the CDN from answering them with a cached public copy.
function setPublicCache(req, res) {
  res.set('Vary', 'Authorization');
  if (req.headers.authorization) {
    res.set('Cache-Control', 'private, no-store');
  } else {
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  }
}

module.exports = { setPublicCache };
