// MRGNT · carrete de artículos (reseñas, entrevistas, crónicas) para redes sociales.
// Canvas port of the approved template (template_carrete_articulos): every slide is
// 1080×1350 with a fixed format —
//   01 · Portada: photo on top, tinta block below with antetítulo, big amarillo name,
//        rule, «LUGAR ↗ CDMX», date and an amarillo star.
//   Texto: flat background, numbered antetítulo, one sentence in Londrina, rule, small line.
//   Foto: photo on top (960 px), colored block below with numbered antetítulo and one sentence.
//   Cierre: white, closing sentence, small line, «LEE LA RESEÑA COMPLETA» + MRGNT.MX ↗, logo.
// Numbering (NN/TT) and the alternating colors are automatic:
// texto amarillo → foto tinta → texto tinta → foto amarillo → …

import { loadImage } from '/admin/newspaper-image.js';

export const CAROUSEL_MIN_PHOTOS = 1;
export const CAROUSEL_MAX_PHOTOS = 5;
export const CAROUSEL_TIPOS = ['RESEÑA', 'ENTREVISTA', 'CRÓNICA', 'ARTÍCULO'];

const W = 1080;
const H = 1350;
const M = 64; // side margin
const CW = W - M * 2; // content width (952)

const Y = '#FFDF70'; // amarillo-estrella
const T = '#181C22'; // tinta
const B = '#FFFFFF'; // blanco

const DISPLAY = '"Londrina Solid", Impact, sans-serif';
const MONO = 'VT323, "Courier New", monospace';
const HANDLE = '@FESTIVALMRGNT';
const WEB = 'MRGNT.MX';
const LOGO_SRC = '/assets/mrgnt-logo-tinta.png';

const CTA = {
  'RESEÑA': 'LEE LA RESEÑA COMPLETA',
  'ENTREVISTA': 'LEE LA ENTREVISTA COMPLETA',
  'CRÓNICA': 'LEE LA CRÓNICA COMPLETA',
  'ARTÍCULO': 'LEE EL ARTÍCULO COMPLETO',
};
const CAPTION_WEB = {
  'RESEÑA': 'Reseña completa en mrgnt.mx',
  'ENTREVISTA': 'Entrevista completa en mrgnt.mx',
  'CRÓNICA': 'Crónica completa en mrgnt.mx',
  'ARTÍCULO': 'Artículo completo en mrgnt.mx',
};

// Default tipo for each noticias category (functions/constants.js).
const TIPO_BY_CATEGORY = {
  'Entrevistas': 'ENTREVISTA',
  'Reportaje de eventos': 'RESEÑA',
  'Periodismo musical': 'ARTÍCULO',
  'Blogs de opinión': 'ARTÍCULO',
};

const TEXTO_TITLES = ['LA NOTA', 'EL CONTEXTO', 'EN DETALLE', 'LO QUE SIGUE', 'PARA SABER MÁS'];
const FOTO_TITLES = ['EN IMAGEN', 'EL MOMENTO', 'DE CERCA', 'LA ESCENA'];
const DEFAULT_HASHTAGS = '#MRGNT #FestivalMRGNT #MusicaEmergente #CDMX';

const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MONTHS_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const STAR_PATH = 'M0,-48 L9,-14 L40,-30 L20,-2 L47,14 L13,15 L18,46 L-2,20 L-24,42 L-17,10 L-46,6 L-19,-10 L-34,-38 L-7,-17Z';

// ───────── Utilities ─────────

const up = (s) => String(s ?? '').toLocaleUpperCase('es-MX');
const pad = (n) => String(n).padStart(2, '0');
const DIACRITICS_RE = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g');
const slug = (s) => String(s).normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'slide';

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  // Keep paragraph breaks as sentence boundaries.
  div.querySelectorAll('p, li, h1, h2, h3, h4, br').forEach((el) => el.append(' '));
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  const parts = String(text || '').match(/[^.!?…]+(?:[.!?…]+["'»”’)\]]*|$)/g) || [];
  return parts.map((s) => s.trim()).filter((s) => s.length > 1);
}

function isoToCoverDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday} ${d} ${MONTHS_ABBR[m - 1]} ${y}`;
}

// ───────── Draft (the editable content of the carrete) ─────────

// Middle slides in order: texto, foto, texto, foto, … then any texto left.
// There's one foto slide per photo after the cover, and at least 2 middle slides.
export function carouselOrder(photoCount) {
  const nf = Math.max(0, photoCount - 1);
  const nt = Math.max(2, nf);
  const order = [];
  for (let i = 0; i < Math.max(nt, nf); i++) {
    if (i < nt) order.push({ kind: 'texto', index: i });
    if (i < nf) order.push({ kind: 'foto', index: i });
  }
  return order;
}

// Adds or removes middle slides so the draft matches the number of photos.
// New slides take the next unused sentences of the article.
export function fitCarouselDraft(draft, photoCount) {
  const order = carouselOrder(photoCount);
  const nt = order.filter((s) => s.kind === 'texto').length;
  const nf = order.length - nt;
  draft.textos = draft.textos.slice(0, nt);
  draft.fotos = draft.fotos.slice(0, nf);
  const missing = order.filter(({ kind, index }) => !(kind === 'texto' ? draft.textos : draft.fotos)[index]);
  let stillMissing = missing.length;
  order.forEach(({ kind, index }) => {
    if (!(kind === 'texto' ? draft.textos : draft.fotos)[index]) stillMissing--;
    if (kind === 'texto' && !draft.textos[index]) {
      const frase = draft.pool.shift() || '';
      // Small line only when there are sentences to spare for the slides still to fill.
      const spare = draft.pool.length > stillMissing;
      const linea = spare && draft.pool[0].length <= 120 ? draft.pool.shift() : '';
      draft.textos[index] = { titulo: TEXTO_TITLES[index % TEXTO_TITLES.length], frase, linea };
    }
    if (kind === 'foto' && !draft.fotos[index]) {
      draft.fotos[index] = { titulo: FOTO_TITLES[index % FOTO_TITLES.length], frase: draft.pool.shift() || '' };
    }
  });
  return draft;
}

// Pre-fills the carrete from the article. Every field stays editable in the admin.
export function buildCarouselDraft({ title, category, isoDate, excerpt, bodyHtml }, photoCount) {
  const body = stripHtml(bodyHtml);
  const pool = splitSentences(body || excerpt);
  const cierreFrase = pool.length > 1 ? pool.pop() : '';
  const draft = {
    tipo: TIPO_BY_CATEGORY[category] || 'ARTÍCULO',
    portada: {
      antetitulo: up(category || 'NOTICIAS'),
      nombre: (title || '').trim(),
      lugar: '',
      ciudad: 'CDMX',
      fecha: isoToCoverDate(isoDate),
    },
    textos: [],
    fotos: [],
    cierre: { titulo: 'LO QUE ME LLEVO', frase: cierreFrase, linea: '' },
    caption: { texto: (excerpt || '').trim(), hashtags: DEFAULT_HASHTAGS },
    pool,
  };
  return fitCarouselDraft(draft, photoCount);
}

export function carouselCaption(draft) {
  const p = draft.portada;
  const head = [up(p.nombre), up(p.lugar)].filter(Boolean).join(' · ');
  return [head, '', draft.caption.texto || '', '', CAPTION_WEB[draft.tipo] || 'Completo en mrgnt.mx', '',
    draft.caption.hashtags || '#MRGNT #FestivalMRGNT'].join('\n');
}

// Same checks as the template script: errors block generation, warnings don't.
export function reviewCarousel(draft, photoCount) {
  const errors = [];
  const warnings = [];
  if (photoCount < CAROUSEL_MIN_PHOTOS) errors.push('Agrega al menos una foto (no video).');
  if (photoCount > CAROUSEL_MAX_PHOTOS) errors.push(`Máximo ${CAROUSEL_MAX_PHOTOS} fotos.`);
  if (!draft.portada.nombre.trim()) errors.push('Falta el nombre de la portada.');
  const total = carouselOrder(photoCount).length + 2;
  const slides = carouselOrder(photoCount).map(({ kind, index }, i) => ({
    s: kind === 'texto' ? draft.textos[index] : draft.fotos[index],
    label: `Slide ${pad(i + 2)}`,
  }));
  slides.push({ s: draft.cierre, label: `Slide ${pad(total)} (cierre)` });
  slides.forEach(({ s, label }) => {
    if (!s.titulo.trim()) errors.push(`${label}: falta el título.`);
    if (/^\s*\d+\s*·/.test(s.titulo)) errors.push(`${label}: no pongas número en el título, se numera solo.`);
    const frase = s.frase.trim();
    if (!frase) { errors.push(`${label}: falta la frase.`); return; }
    if (splitSentences(frase).length > 1) warnings.push(`${label}: mejor una sola oración por slide.`);
    if (frase.length > 90) warnings.push(`${label}: frase larga (${frase.length} caracteres); mejor menos de 90.`);
  });
  if (JSON.stringify(draft).toLowerCase().includes('festivalemergente')) {
    errors.push('Aparece «festivalemergente». La web oficial es mrgnt.mx.');
  }
  return { errors, warnings };
}

// ───────── Canvas drawing ─────────

async function loadFonts() {
  await Promise.all([
    document.fonts.load(`900 96px ${DISPLAY}`),
    document.fonts.load(`400 30px ${MONO}`),
  ]).catch(() => {});
}

let logoPromise = null;
function getLogo() {
  if (!logoPromise) logoPromise = loadImage(LOGO_SRC).catch(() => null);
  return logoPromise;
}

function setFont(ctx, voice, size, tracking = 0) {
  ctx.font = voice === 'display' ? `900 ${size}px ${DISPLAY}` : `400 ${size}px ${MONO}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
}

// CSS "line-height: normal" for each voice (measured in the template).
const NORMAL_LH = { display: 1.225, mono: 1 };

// Draws text centered in a CSS-like line box (top, height), like the HTML template.
function drawLine(ctx, text, x, top, lh) {
  const m = ctx.measureText(text);
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, top + (lh - (ascent + descent)) / 2 + ascent);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

// background-size: cover with background-position "posX% posY%".
function drawCover(ctx, img, x, y, w, h, posX = 50, posY = 50) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) * (posX / 100), y + (h - dh) * (posY / 100), dw, dh);
  ctx.restore();
}

function drawStar(ctx, x, y, s, color, rot) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(STAR_PATH));
  ctx.restore();
}

// Top bar, the same on every slide. On photos the labels sit on solid blocks.
function drawBar(ctx, tipo, n, total, fg, blockBg) {
  setFont(ctx, 'mono', 30, 7);
  const draw = (text, alignRight) => {
    const w = ctx.measureText(text).width + 28;
    const x = alignRight ? W - M - w : M;
    if (blockBg) {
      ctx.fillStyle = blockBg;
      ctx.fillRect(x, 44, w, 42);
    }
    ctx.fillStyle = fg;
    drawLine(ctx, text, x + 14, 50, 30);
  };
  draw(`${up(tipo)} · ${pad(n)}/${pad(total)}`, false);
  draw(HANDLE, true);
}

// Text block that flows: antetítulo → sentence → rule → small line.
// q: { size, maxh, min } — the sentence shrinks until it fits maxh.
function drawFlow(ctx, top, fg, { ante, frase, linea }, q) {
  ctx.fillStyle = fg;
  setFont(ctx, 'mono', 30, 8);
  drawLine(ctx, up(ante), M, top, 30);

  const text = up(frase);
  let size = q.size;
  let lines;
  for (;;) {
    setFont(ctx, 'display', size, 3);
    lines = wrapText(ctx, text, CW);
    if (lines.length * size * 1.08 <= q.maxh || size <= q.min) break;
    size -= 2;
  }
  const lh = size * 1.08;
  const qTop = top + 48;
  lines.forEach((line, i) => drawLine(ctx, line, M, qTop + i * lh, lh));
  let bottom = qTop + lines.length * lh;

  if (linea && linea.trim()) {
    const ruleY = bottom + 44;
    ctx.fillRect(M, ruleY, CW, 2);
    setFont(ctx, 'mono', 36, 3);
    const sTop = ruleY + 38;
    wrapText(ctx, linea.trim(), CW).forEach((line, i) => drawLine(ctx, line, M, sTop + i * 45, 45));
  }
  return bottom;
}

function newCanvas(bg) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx };
}

function drawPortada(ctx, d, total, photo) {
  const p = d.portada;
  drawCover(ctx, photo.img, 0, 0, W, H, 50, photo.pos);
  ctx.fillStyle = T;
  ctx.fillRect(0, 880, W, 470);
  drawBar(ctx, d.tipo, 1, total, Y, T);

  // Name: one line from 150 px down to 96 px; longer names wrap to two lines (≤ 80 px).
  const name = up(p.nombre).trim();
  let size = 150;
  let lines = [name];
  setFont(ctx, 'display', size, 5);
  while (size > 96 && ctx.measureText(name).width > CW) {
    size -= 2;
    setFont(ctx, 'display', size, 5);
  }
  if (ctx.measureText(name).width > CW) {
    size = 80;
    for (;;) {
      setFont(ctx, 'display', size, 5);
      lines = wrapText(ctx, name, CW);
      const fits = lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= CW);
      if (fits || size <= 44) break;
      size -= 2;
    }
    lines = lines.slice(0, 2);
  }
  const nameBottom = 1120;
  const nameTop = nameBottom - Math.max(160, lines.length * size);
  ctx.fillStyle = Y;
  lines.forEach((line, i) => drawLine(ctx, line, M, nameBottom - (lines.length - i) * size, size));

  setFont(ctx, 'mono', 30, 8);
  drawLine(ctx, up(p.antetitulo), M, nameTop - 40, 30);

  ctx.fillRect(M, 1140, CW, 2);

  const place = [up(p.lugar).trim(), up(p.ciudad).trim()].filter(Boolean).join(' ↗ ');
  if (place) {
    let ps = 40;
    setFont(ctx, 'display', ps, 4);
    while (ps > 24 && ctx.measureText(place).width > 740) {
      ps -= 2;
      setFont(ctx, 'display', ps, 4);
    }
    drawLine(ctx, place, M, 1170, 40 * NORMAL_LH.display);
  }
  setFont(ctx, 'mono', 30, 7);
  drawLine(ctx, up(p.fecha), M, 1226, 30);

  drawStar(ctx, 840, 1120, 230, Y, 12);
}

function drawTexto(ctx, d, s, n, total, fondo) {
  const fg = fondo === 'tinta' ? Y : T;
  drawBar(ctx, d.tipo, n, total, fg);
  if (fondo === 'tinta') drawStar(ctx, -110, 1080, 360, Y, -15);
  else drawStar(ctx, 740, 1080, 400, T, 8);
  drawFlow(ctx, 300, fg, { ante: `${pad(n)} · ${s.titulo}`, frase: s.frase, linea: s.linea }, { size: 96, maxh: 440, min: 60 });
}

function drawFoto(ctx, d, s, n, total, fondo, photo) {
  const bg = fondo === 'amarillo' ? Y : T;
  const fg = fondo === 'amarillo' ? T : Y;
  drawCover(ctx, photo.img, 0, 0, W, 960, 50, photo.pos);
  drawBar(ctx, d.tipo, n, total, fg, bg);
  drawFlow(ctx, 1010, fg, { ante: `${pad(n)} · ${s.titulo}`, frase: s.frase }, { size: 60, maxh: 230, min: 44 });
}

function drawCierre(ctx, d, n, total, logo) {
  const c = d.cierre;
  drawBar(ctx, d.tipo, n, total, T);
  drawStar(ctx, 760, 110, 300, Y, 20);
  drawStar(ctx, -60, 1180, 200, Y, -8);
  drawFlow(ctx, 380, T, { ante: `${pad(n)} · ${c.titulo}`, frase: c.frase, linea: c.linea }, { size: 96, maxh: 330, min: 60 });

  const cta = CTA[d.tipo] || `LEE EL ${up(d.tipo)} COMPLETO`;
  setFont(ctx, 'mono', 30, 6);
  ctx.fillStyle = T;
  ctx.fillRect(M, 1000, ctx.measureText(cta).width + 36, 50);
  ctx.fillStyle = Y;
  drawLine(ctx, cta, M + 18, 1010, 30);

  setFont(ctx, 'display', 44, 3);
  ctx.fillStyle = T;
  drawLine(ctx, `${WEB} ↗`, M, 1060, 44 * NORMAL_LH.display);

  if (logo) {
    const lw = 260;
    const lh = lw * (logo.height / logo.width);
    ctx.drawImage(logo, W - M - lw, H - M - lh, lw, lh);
  }
}

// photos: [{ src, pos }] — pos is the vertical framing (0 = top, 100 = bottom).
// Returns [{ name, dataUrl }] in slide order.
export async function generateCarouselImages(draft, photos) {
  const { errors } = reviewCarousel(draft, photos.length);
  if (errors.length) throw new Error(errors[0]);

  const [, logo, imgs] = await Promise.all([
    loadFonts(),
    getLogo(),
    Promise.all(photos.map((p) => loadImage(p.src))),
  ]);
  const loaded = photos.map((p, i) => ({ img: imgs[i], pos: Number.isFinite(p.pos) ? p.pos : 50 }));

  const order = carouselOrder(photos.length);
  const total = order.length + 2;
  const out = [];
  const render = (bg, name, draw) => {
    const { canvas, ctx } = newCanvas(bg);
    draw(ctx);
    out.push({ name: `${pad(out.length + 1)}_${name}`, dataUrl: canvas.toDataURL('image/jpeg', 0.92) });
  };

  render(T, 'portada', (ctx) => drawPortada(ctx, draft, total, loaded[0]));
  let nt = 0;
  let nf = 0;
  order.forEach(({ kind, index }, i) => {
    const n = i + 2;
    if (kind === 'texto') {
      const s = draft.textos[index];
      const fondo = nt++ % 2 ? 'tinta' : 'amarillo';
      render(fondo === 'tinta' ? T : Y, slug(s.titulo), (ctx) => drawTexto(ctx, draft, s, n, total, fondo));
    } else {
      const s = draft.fotos[index];
      const fondo = nf++ % 2 ? 'amarillo' : 'tinta';
      render(fondo === 'amarillo' ? Y : T, slug(s.titulo), (ctx) => drawFoto(ctx, draft, s, n, total, fondo, loaded[index + 1]));
    }
  });
  render(B, 'cierre', (ctx) => drawCierre(ctx, draft, total, total, logo));
  return out;
}
