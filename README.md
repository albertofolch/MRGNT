# MRGNT

Site for MRGNT — a festival/collective covering noticias, eventos, artistas, and an open call (convocatoria) — plus an admin panel for managing that content.

Built from the [MRGNT design system](https://claude.ai/code/artifact/4e73a9ea-2324-43f3-85e7-b6564c559261): Londrina Solid 900 + VT323 type, `amarillo-estrella` / `tinta` base palette plus the six «señal» colors, square corners, no shadows. Tokens live at the top of `public/styles.css`; the site uses a light theme: white (`--blanco`) backgrounds with `tinta` text, sections separated by 2px rules (`.mr-zona--blanco`). `.mr-zona--tinta` is available for a dark section if ever needed. Official logos are in `public/assets/mrgnt-logo-*` — never retype «MRGNT» in a font. The public site is plain HTML/CSS/JS with no build step, served from Firebase Hosting. A Firebase Cloud Function (Express app) exposes the JSON API at `/api/*`, backed by Firestore, and powers the `/admin` panel.

## Structure

- `public/` — the public site (`index.html`, `noticias.html`, `eventos.html`, `eventos-archivo.html` (past events, newest first), `artistas.html`, `convocatoria.html`, their renderer scripts, `styles.css`, `nav.js`, `assets/logo.png`) and the `admin/` panel (login, dashboard, CRUD pages for artistas/eventos/noticias). Renderer scripts fetch content from the API at `/api/*` instead of hardcoded data.
- `functions/` — the Cloud Function (Express app): routes (`functions/routes/*`), Firestore/Auth/Storage access via `firebase-admin`, secrets (`functions/secrets.js` — Spotify and Google Maps API credentials), and one-off migration/backfill scripts (`functions/scripts/*`).
- `firestore.rules`, `firestore.indexes.json`, `storage.rules` — Firestore and Storage security rules and indexes.
- `dev-local.js` — a tiny static file server for local iteration; proxies `/api/*` requests to the deployed dev environment instead of running functions locally.

## Setup

```bash
npm install
firebase login
npm run dev          # Firebase emulators (Auth, Functions, Firestore, Hosting, Storage)
# or
npm run dev:local     # serves public/ on http://localhost:3000, proxying /api/* to the dev environment
```

`npm run create-admin` creates (or resets) an admin login in the target Firebase project.

## Admin panel

Log in at `/admin/login.html` to add, edit, or delete artistas, eventos, and noticias. Changes are saved to Firestore immediately and appear on the public site on next page load — no redeploy needed. The fixed category/discipline lists (noticias categories, artist disciplines) are not editable from the admin panel; they live in `functions/constants.js`.

Each noticia has: Título, Categoría, Fecha, Autor, Resumen (short excerpt shown in listings), Nota (the full article body, shown on its own page), and an optional Media upload (one image or video). Clicking a noticia's title anywhere on the public site opens its detail page at `/noticia.html?slug=...`. Uploaded media files are stored in Firebase Storage.

**Lecturas (read counter).** Every published noticia in the admin list shows how many people have read it, and the «Más leídos» filter sorts them by that count. Artists work the same way: each one in the admin list shows its profile visits, with a «Más vistos» filter. A read is counted once per browser per article, so reloads don't add more. Browsers that have signed in to the admin panel and known crawlers aren't counted. Counting started when this feature shipped, so older articles start from 0.

**Caching.** Public pages and the `/api/articles`, `/api/events`, `/api/artists` and `/api/meta` lists are cached by Firebase Hosting's CDN for up to 5 minutes (`functions/lib/cache.js`), which keeps Firestore reads flat as traffic grows. Edits, publishes and deletions can take up to 5 minutes to show on the public site. The admin panel is never cached and always shows changes immediately.

Each artista has an optional Spotify link — pick a result from the built-in Spotify search or paste an artist ID/URL — which powers the artist photo, Spotify player, and top tracks on their public page.

## Deployment

```bash
npm run deploy   # deploys hosting, functions, firestore rules/indexes, and storage rules
```

Requires a Firebase project with Hosting, Functions (2nd gen), Firestore, Auth, and Storage enabled, and the `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `GOOGLE_MAPS_API_KEY` secrets set via `firebase functions:secrets:set`.
