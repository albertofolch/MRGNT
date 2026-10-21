const express = require('express');
const admin = require('firebase-admin');

admin.initializeApp();

const artistsRouter = require('./routes/artists');
const artistSubmissionsRouter = require('./routes/artistSubmissions');
const eventsRouter = require('./routes/events');
const eventSubmissionsRouter = require('./routes/eventSubmissions');
const articlesRouter = require('./routes/articles');
const metaRouter = require('./routes/meta');
const spotifyRouter = require('./routes/spotify');
const usersRouter = require('./routes/users');
const pagesRouter = require('./routes/pages');
const mediaRouter = require('./routes/media');

const app = express();
// Event submissions/edits can carry a base64-encoded image (see lib/images.js), which
// inflates well past the 100kb default — raised to fit the 5MB image limit plus overhead.
app.use(express.json({ limit: '10mb' }));

app.use('/', pagesRouter);
app.use('/api/artists', artistsRouter);
app.use('/api/artist-submissions', artistSubmissionsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/event-submissions', eventSubmissionsRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/meta', metaRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/users', usersRouter);
app.use('/api/media', mediaRouter);

module.exports = app;
