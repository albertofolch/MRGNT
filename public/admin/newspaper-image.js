// Builds the "MRGNT newspaper" events image entirely with the Canvas 2D API —
// no external APIs, no AI, just the text/photos already on the events.
// (Articles use the carrete format instead: see /admin/carousel-image.js.)
// Styled with the MRGNT design system (see the tokens at the top of /styles.css):
// Londrina Solid 900 + VT323, tinta/amarillo-estrella, the «señal» stripe, square
// corners and the official halftone logos.

export const EVENTS_MIN = 3;
export const EVENTS_MAX = 6;

const WIDTH_EVENTS = 1080;
const HEIGHT_EVENTS = 1920;
const MARGIN = 56;

const COLORS = {
  paper: '#ffffff', // --blanco
  ink: '#181c22', // --tinta
  muted: '#3d36cd', // --indigo (texto-suave)
  accent: '#ffdf70', // --amarillo-estrella
  papel: '#f4eede', // --papel (text on tinta)
};

// The six «señal» colors, in the same order as .mr-senal in /styles.css.
const SENAL = ['#3798ca', '#339b8b', '#7d358f', '#3d36cd', '#384c91', '#7382c8'];
const SENAL_H = 24;

const DISPLAY = '"Londrina Solid", Impact, sans-serif';
const MONO = 'VT323, "Courier New", monospace';
const LEYENDA = 'FESTIVAL DE MÚSICA Y ARTE CONTEMPORÁNEO';

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// Both families are already requested by the @import at the top of /styles.css.
async function loadFonts() {
  await Promise.all([
    document.fonts.load('900 64px "Londrina Solid"'),
    document.fonts.load('400 24px VT323'),
  ]).catch(() => {});
}

// Sets one of the two brand voices. Tracking uses ctx.letterSpacing where the
// browser supports it; elsewhere it's simply ignored.
function setFont(ctx, voice, size, tracking = 0) {
  ctx.font = voice === 'display' ? `900 ${size}px ${DISPLAY}` : `400 ${size}px ${MONO}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
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

function fitFontSize(ctx, text, voice, tracking, maxWidth, maxSize, minSize) {
  let size = maxSize;
  setFont(ctx, voice, size, tracking);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    setFont(ctx, voice, size, tracking);
  }
  return size;
}

// Firebase Storage download URLs don't send Access-Control-Allow-Origin, so loading
// them straight into an <img> taints the canvas and breaks toDataURL(). Route them
// through our own same-origin proxy instead (see functions/routes/media.js) — same-origin
// images never taint the canvas, no CORS configuration needed.
function resolveImageSrc(src) {
  if (typeof src === 'string' && src.startsWith('https://firebasestorage.googleapis.com/')) {
    return `/api/media/proxy?url=${encodeURIComponent(src)}`;
  }
  return src;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar una de las imágenes.'));
    img.src = resolveImageSrc(src);
  });
}

// Official halftone logos — never retype «MRGNT» in a font.
const LOGO_SRC = {
  tinta: '/assets/mrgnt-logo-tinta.png',
  amarillo: '/assets/mrgnt-logo-amarillo.png',
};
const logoImagePromises = {};
function getLogoImage(variant) {
  if (!logoImagePromises[variant]) logoImagePromises[variant] = loadImage(LOGO_SRC[variant]).catch(() => null);
  return logoImagePromises[variant];
}
function getLogos() {
  return Promise.all([getLogoImage('tinta'), getLogoImage('amarillo')])
    .then(([tinta, amarillo]) => ({ tinta, amarillo }));
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function drawRule(ctx, x1, x2, y, weight) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x1, y, x2 - x1, weight);
}

function drawDoubleRule(ctx, x1, x2, y) {
  drawRule(ctx, x1, x2, y, 3);
  drawRule(ctx, x1, x2, y + 7, 2);
}

// Full-width «señal» stripe: the six signal colors with tinta scanlines over them.
function drawSenal(ctx, width, y, h = SENAL_H) {
  const segW = width / SENAL.length;
  SENAL.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(i * segW), y, Math.ceil(segW), h);
  });
  ctx.fillStyle = 'rgba(24, 28, 34, .35)';
  for (let ly = y; ly < y + h; ly += 6) ctx.fillRect(0, ly, width, Math.min(2, y + h - ly));
}

// Tinta box with amarillo VT323 text, like .mrgnt-etiqueta. Returns the box height.
function drawEtiqueta(ctx, text, x, y, size) {
  setFont(ctx, 'mono', size, 6);
  const padX = 16;
  const padY = 10;
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padY * 2;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return h;
}

// Draws an official MRGNT logo (public/assets/mrgnt-logo-*.png) at the given top-left corner,
// scaled to logoH tall while keeping its natural aspect ratio. Returns the drawn width.
function drawLogo(ctx, logoImg, x, y, logoH) {
  if (!logoImg) return 0;
  const logoW = logoH * (logoImg.width / logoImg.height);
  ctx.drawImage(logoImg, x, y, logoW, logoH);
  return logoW;
}

// ---- Shared masthead (fixed, same on every generated newspaper image) ----

function drawMasthead(ctx, width) {
  const marginX = MARGIN;
  drawSenal(ctx, width, 0);
  const y = SENAL_H + 40;
  drawRule(ctx, marginX, width - marginX, y, 2);
  const now = new Date();
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 'mono', 24, 2);
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.fillText('VOL. 01 · EDICIÓN ESPECIAL', marginX, y + 32);
  ctx.textAlign = 'center';
  ctx.fillText('@FESTIVALMRGNT', width / 2, y + 32);
  ctx.textAlign = 'right';
  ctx.fillText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`, width - marginX, y + 32);
  ctx.textAlign = 'left';
  drawRule(ctx, marginX, width - marginX, y + 46, 2);
  return y + 46;
}

// ---- Events front page ----

function drawEventsHeadline(ctx, width, startY) {
  const marginX = MARGIN;
  const maxWidth = width - marginX * 2;
  let y = startY + 150;

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  const size1 = fitFontSize(ctx, 'ENTÉRATE DE', 'display', 4, maxWidth, 150, 64);
  ctx.fillText('ENTÉRATE DE', marginX, y);
  y += size1 * 0.92;

  fitFontSize(ctx, 'LA ESCENA', 'display', 4, maxWidth, 150, 64);
  ctx.fillText('LA ESCENA', marginX, y);
  y += 34;

  drawRule(ctx, marginX, width - marginX, y, 3);
  y += 22;

  y += drawEtiqueta(ctx, 'ARTÍSTICA EN MÉXICO', marginX, y, 40);
  y += 22;
  drawDoubleRule(ctx, marginX, width - marginX, y);
  return y + 36;
}

async function drawEventsList(ctx, width, rowsTop, rowsBottom, events) {
  const marginX = MARGIN;
  const withImage = events.find((ev) => ev.image);
  let heroImg = null;
  if (withImage) {
    try {
      heroImg = await loadImage(withImage.image);
    } catch {
      heroImg = null;
    }
  }

  const imgColW = heroImg ? 300 : 0;
  const imgGap = heroImg ? 28 : 0;
  const listRight = width - marginX - imgColW - imgGap;
  const dateColW = 130;
  const textX = marginX + dateColW;
  const textW = listRight - textX;
  const rowH = (rowsBottom - rowsTop) / events.length;

  if (heroImg) {
    const ix = width - marginX - imgColW;
    drawCover(ctx, heroImg, ix, rowsTop, imgColW, rowsBottom - rowsTop);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(ix, rowsTop, imgColW, rowsBottom - rowsTop);
  }

  events.forEach((ev, i) => {
    const rowTop = rowsTop + i * rowH;
    if (i > 0) drawRule(ctx, marginX, listRight, rowTop, 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    setFont(ctx, 'display', 72, 2);
    ctx.fillText(ev.dateNum, marginX, rowTop + 74);
    setFont(ctx, 'mono', 26, 3);
    ctx.fillText(ev.day.toUpperCase(), marginX, rowTop + 100);
    setFont(ctx, 'mono', 24, 1);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(ev.time, marginX, rowTop + 124);

    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(marginX + dateColW - 18, rowTop + 8, 2, rowH - 16);

    setFont(ctx, 'display', 38, 2);
    ctx.fillStyle = COLORS.ink;
    const titleLines = wrapText(ctx, ev.headline.toUpperCase(), textW).slice(0, 2);
    let ty = rowTop + 46;
    titleLines.forEach((line) => {
      ctx.fillText(line, textX, ty);
      ty += 40;
    });

    ty += 4;
    setFont(ctx, 'mono', 25, 1);
    ctx.fillStyle = COLORS.muted;
    const maxDescLines = Math.max(2, Math.floor((rowTop + rowH - ty) / 26));
    const descLines = wrapText(ctx, ev.desc, textW).slice(0, maxDescLines);
    descLines.forEach((line) => {
      ctx.fillText(line, textX, ty);
      ty += 26;
    });
  });
}

// Tinta band (like .mr-zona--tinta) with the amarillo logo, closed by the «señal» stripe.
function drawEventsFooter(ctx, width, height, logoImg) {
  const marginX = MARGIN;
  const topY = height - 220;
  const bandBottom = height - SENAL_H;
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, topY, width, bandBottom - topY);
  drawSenal(ctx, width, bandBottom);

  const logoH = 128;
  const contentTop = topY + (bandBottom - topY - logoH) / 2;
  const logoW = drawLogo(ctx, logoImg, marginX, contentTop, logoH);

  const textX = marginX + logoW + (logoW ? 40 : 0);
  const textMaxWidth = width - marginX - textX;

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.accent;
  setFont(ctx, 'display', 44, 3);
  ctx.fillText('APOYA. ASISTE. HAZ ESCENA.', textX, contentTop + 40);

  setFont(ctx, 'mono', 23, 0);
  ctx.fillStyle = COLORS.papel;
  const taglineLines = wrapText(ctx, 'La cultura se vive, se comparte y se construye juntos. Nos vemos ahí.', textMaxWidth).slice(0, 2);
  let ly = contentTop + 76;
  taglineLines.forEach((line) => {
    ctx.fillText(line, textX, ly);
    ly += 26;
  });

  setFont(ctx, 'mono', 20, 4);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(LEYENDA, textX, Math.max(contentTop + logoH - 4, ly + 6));
}

export async function generateEventsNewspaperImage(events) {
  if (!Array.isArray(events) || events.length < EVENTS_MIN || events.length > EVENTS_MAX) {
    throw new Error(`Selecciona entre ${EVENTS_MIN} y ${EVENTS_MAX} eventos.`);
  }
  const [, logos] = await Promise.all([loadFonts(), getLogos()]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH_EVENTS;
  canvas.height = HEIGHT_EVENTS;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH_EVENTS, HEIGHT_EVENTS);

  let y = drawMasthead(ctx, WIDTH_EVENTS);
  y = drawEventsHeadline(ctx, WIDTH_EVENTS, y);

  const footerTop = HEIGHT_EVENTS - 256;
  const mapped = events.map((ev) => ({
    dateNum: (ev.date || '').split(' ')[0] || '',
    day: ev.day || '',
    time: ev.time || '',
    headline: ev.displayTitle || ev.title || ev.artist || '',
    desc: stripHtml(ev.description) || [ev.tag, ev.stage ? `En ${ev.stage}.` : ''].filter(Boolean).join(' — '),
    image: ev.image || null,
  }));

  await drawEventsList(ctx, WIDTH_EVENTS, y, footerTop, mapped);
  drawEventsFooter(ctx, WIDTH_EVENTS, HEIGHT_EVENTS, logos.amarillo);

  return canvas.toDataURL('image/png');
}
