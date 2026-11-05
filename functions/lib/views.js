const admin = require('firebase-admin');

// Link-preview fetchers and crawlers that run JavaScript shouldn't count as readers.
const BOT_UA_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

// Handles a public POST /:id/view: adds one to the document's `views` when `isCountable`
// accepts it. Always answers 204 so it reveals nothing about which documents exist.
async function recordView(req, res, ref, isCountable = () => true) {
  if (BOT_UA_RE.test(req.headers['user-agent'] || '')) return res.status(204).end();
  try {
    const snap = await ref.get();
    if (snap.exists && isCountable(snap.data())) {
      await ref.update({ views: admin.firestore.FieldValue.increment(1) });
    }
  } catch {
    // A missed count isn't worth surfacing to the visitor.
  }
  res.status(204).end();
}

module.exports = { recordView };
