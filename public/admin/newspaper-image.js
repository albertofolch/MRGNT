// Builds "MRGNT newspaper" style images entirely with the Canvas 2D API —
// no external APIs, no AI, just the text/photos already on the event or article.

export const EVENTS_MIN = 3;
export const EVENTS_MAX = 6;

const WIDTH_EVENTS = 1080;
const HEIGHT_EVENTS = 1920;
const WIDTH_ARTICLE = 1080;
const HEIGHT_ARTICLE = 1350;
const MARGIN = 56;

const COLORS = {
  paper: '#FFFBF2',
  ink: '#241206',
  muted: '#654226',
  rust: '#C74F24',
};

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

async function loadFonts() {
  await Promise.all([
    document.fonts.load('700 112px Bungee'),
    document.fonts.load('700 60px Bungee'),
    document.fonts.load('700 44px Bungee'),
    document.fonts.load('700 18px "Space Mono"'),
    document.fonts.load('400 18px "Space Mono"'),
    document.fonts.load('700 30px "Space Grotesk"'),
    document.fonts.load('400 18px "Space Grotesk"'),
  ]).catch(() => {});
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

function fitFontSize(ctx, text, family, weight, maxWidth, maxSize, minSize) {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar una de las imágenes.'));
    img.src = resolveImageSrc(src);
  });
}

const LOGO_SRC = '/assets/logo.png';
let logoImagePromise = null;
function getLogoImage() {
  if (!logoImagePromise) logoImagePromise = loadImage(LOGO_SRC).catch(() => null);
  return logoImagePromise;
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

// Draws the real MRGNT logo (public/assets/logo.png) at the given top-left corner,
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
  const y = 56;
  drawRule(ctx, marginX, width - marginX, y, 2);
  const now = new Date();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 16px "Space Mono", monospace';
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.fillText('VOL. 01 · EDICIÓN ESPECIAL', marginX, y + 26);
  ctx.textAlign = 'center';
  ctx.fillText('@FESTIVALMRGNT', width / 2, y + 26);
  ctx.textAlign = 'right';
  ctx.fillText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`, width - marginX, y + 26);
  ctx.textAlign = 'left';
  drawRule(ctx, marginX, width - marginX, y + 40, 2);
  return y + 40;
}

// ---- Events front page ----

function drawEventsHeadline(ctx, width, startY) {
  const marginX = MARGIN;
  const maxWidth = width - marginX * 2;
  let y = startY + 90;

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  const size1 = fitFontSize(ctx, 'ENTÉRATE DE', 'Bungee, sans-serif', 700, maxWidth, 108, 52);
  ctx.font = `700 ${size1}px Bungee, sans-serif`;
  ctx.fillText('ENTÉRATE DE', marginX, y);
  y += size1 + 4;

  const size2 = fitFontSize(ctx, 'LA ESCENA', 'Bungee, sans-serif', 700, maxWidth, 108, 52);
  ctx.font = `700 ${size2}px Bungee, sans-serif`;
  ctx.fillText('LA ESCENA', marginX, y);
  y += 44;

  drawRule(ctx, marginX, width - marginX, y, 3);
  y += 46;

  ctx.font = '700 38px "Space Grotesk", sans-serif';
  ctx.fillText('ARTÍSTICA EN MÉXICO', marginX, y);
  y += 26;
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
    ctx.font = '700 52px Bungee, sans-serif';
    ctx.fillText(ev.dateNum, marginX, rowTop + 58);
    ctx.font = '700 17px "Space Mono", monospace';
    ctx.fillText(ev.day, marginX, rowTop + 84);
    ctx.font = '400 15px "Space Mono", monospace';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(ev.time, marginX, rowTop + 105);

    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(marginX + dateColW - 18, rowTop + 8, 2, rowH - 16);

    ctx.font = '700 28px "Space Grotesk", sans-serif';
    ctx.fillStyle = COLORS.ink;
    const titleLines = wrapText(ctx, ev.headline.toUpperCase(), textW).slice(0, 2);
    let ty = rowTop + 36;
    titleLines.forEach((line) => {
      ctx.fillText(line, textX, ty);
      ty += 32;
    });

    ty += 8;
    ctx.font = '400 19px "Space Grotesk", sans-serif';
    ctx.fillStyle = COLORS.muted;
    const maxDescLines = Math.max(2, Math.floor((rowTop + rowH - ty) / 25));
    const descLines = wrapText(ctx, ev.desc, textW).slice(0, maxDescLines);
    descLines.forEach((line) => {
      ctx.fillText(line, textX, ty);
      ty += 25;
    });
  });
}

function drawEventsFooter(ctx, width, height, logoImg) {
  const marginX = MARGIN;
  const topY = height - 210;
  const bottomRuleY = height - 40;
  drawDoubleRule(ctx, marginX, width - marginX, topY);

  const contentTop = topY + 30;
  const logoH = 66;
  const logoW = drawLogo(ctx, logoImg, marginX, contentTop, logoH);

  const textX = marginX + logoW + (logoW ? 36 : 0);
  const textMaxWidth = width - marginX - textX;

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 22px "Space Grotesk", sans-serif';
  ctx.fillText('APOYA. ASISTE.', textX, contentTop + 24);
  ctx.fillText('HAZ ESCENA.', textX, contentTop + 52);

  ctx.font = '400 17px "Space Grotesk", sans-serif';
  ctx.fillStyle = COLORS.muted;
  const taglineLines = wrapText(ctx, 'La cultura se vive, se comparte y se construye juntos. Nos vemos ahí.', textMaxWidth).slice(0, 2);
  let ly = contentTop + 80;
  taglineLines.forEach((line) => {
    ctx.fillText(line, textX, ly);
    ly += 21;
  });

  drawRule(ctx, marginX, width - marginX, bottomRuleY, 2);
}

export async function generateEventsNewspaperImage(events) {
  if (!Array.isArray(events) || events.length < EVENTS_MIN || events.length > EVENTS_MAX) {
    throw new Error(`Selecciona entre ${EVENTS_MIN} y ${EVENTS_MAX} eventos.`);
  }
  const [, logoImg] = await Promise.all([loadFonts(), getLogoImage()]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH_EVENTS;
  canvas.height = HEIGHT_EVENTS;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH_EVENTS, HEIGHT_EVENTS);

  let y = drawMasthead(ctx, WIDTH_EVENTS);
  y = drawEventsHeadline(ctx, WIDTH_EVENTS, y);

  const footerTop = HEIGHT_EVENTS - 250;
  const mapped = events.map((ev) => ({
    dateNum: (ev.date || '').split(' ')[0] || '',
    day: ev.day || '',
    time: ev.time || '',
    headline: ev.displayTitle || ev.title || ev.artist || '',
    desc: stripHtml(ev.description) || [ev.tag, ev.stage ? `En ${ev.stage}.` : ''].filter(Boolean).join(' — '),
    image: ev.image || null,
  }));

  await drawEventsList(ctx, WIDTH_EVENTS, y, footerTop, mapped);
  drawEventsFooter(ctx, WIDTH_EVENTS, HEIGHT_EVENTS, logoImg);

  return canvas.toDataURL('image/png');
}

// ---- Article page ----

function drawArticleHeader(ctx, width, logoImg) {
  const y = 56;
  const logoH = 52;
  const logoW = logoImg ? logoH * (logoImg.width / logoImg.height) : 0;
  if (logoImg) ctx.drawImage(logoImg, (width - logoW) / 2, y, logoW, logoH);
  const ruleY = y + logoH + 24;
  drawRule(ctx, MARGIN, width - MARGIN, ruleY, 2);
  return ruleY;
}

function drawArticleByline(ctx, width, y0, author, dateDisplay) {
  const marginX = MARGIN;
  const y = y0 + 38;
  ctx.font = '700 17px "Space Mono", monospace';
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.fillText((author || 'MRGNT').toUpperCase(), marginX, y);
  ctx.textAlign = 'right';
  ctx.fillText((dateDisplay || '').toUpperCase(), width - marginX, y);
  ctx.textAlign = 'left';
  drawDoubleRule(ctx, marginX, width - marginX, y + 16);
  return y + 16 + 7;
}

function drawArticleHeadline(ctx, width, y0, title) {
  const marginX = MARGIN;
  const maxWidth = width - marginX * 2;
  let size = 52;
  let lines = [];
  do {
    ctx.font = `700 ${size}px Bungee, sans-serif`;
    lines = wrapText(ctx, title.toUpperCase(), maxWidth);
    size -= 4;
  } while (lines.length > 3 && size > 28);
  size += 4;
  ctx.font = `700 ${size}px Bungee, sans-serif`;

  let y = y0 + size + 20;
  ctx.fillStyle = COLORS.ink;
  lines.slice(0, 3).forEach((line) => {
    ctx.fillText(line, marginX, y);
    y += size + 8;
  });
  return y - (size + 8) + 28;
}

function drawArticleSummary(ctx, width, y0, text) {
  const marginX = MARGIN;
  const boxX = marginX;
  const boxW = width - marginX * 2;
  const padX = 24;
  const padY = 22;
  const lineHeight = 26;
  const textW = boxW - padX * 2;

  ctx.font = '700 20px "Space Grotesk", sans-serif';
  const lines = wrapText(ctx, text.toUpperCase(), textW);
  const boxH = padY * 2 + lines.length * lineHeight;

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(boxX, y0, boxW, boxH);

  ctx.fillStyle = COLORS.paper;
  ctx.textAlign = 'left';
  let ty = y0 + padY + lineHeight - 8;
  lines.forEach((line) => {
    ctx.fillText(line, boxX + padX, ty);
    ty += lineHeight;
  });

  return y0 + boxH;
}

function drawArticleColumns(ctx, width, y0, text, colHeight) {
  const marginX = MARGIN;
  const colGap = 30;
  const colCount = 3;
  const colW = (width - marginX * 2 - colGap * (colCount - 1)) / colCount;
  const lineHeight = 24;
  const maxLinesPerCol = Math.max(1, Math.floor(colHeight / lineHeight));

  ctx.font = '400 17px "Space Grotesk", sans-serif';
  ctx.fillStyle = COLORS.ink;
  const allLines = wrapText(ctx, text, colW);
  const total = maxLinesPerCol * colCount;

  let idx = 0;
  for (let c = 0; c < colCount; c++) {
    const colX = marginX + c * (colW + colGap);
    if (c > 0) drawRule(ctx, colX - colGap / 2, colX - colGap / 2 + 1, y0, colHeight);
    let ly = y0 + lineHeight - 6;
    for (let n = 0; n < maxLinesPerCol && idx < allLines.length; n++, idx++) {
      let line = allLines[idx];
      const isCutoff = idx === total - 1 && idx < allLines.length - 1;
      if (isCutoff) {
        while (line.length > 1 && ctx.measureText(`${line}…`).width > colW) line = line.slice(0, -1);
        line += '…';
      }
      ctx.fillText(line, colX, ly);
      ly += lineHeight;
    }
  }
  return y0 + colHeight;
}

function drawArticleFooter(ctx, width, height) {
  const marginX = MARGIN;
  const ruleY = height - 70;
  drawDoubleRule(ctx, marginX, width - marginX, ruleY - 32);
  ctx.textAlign = 'center';
  ctx.font = '700 19px "Space Mono", monospace';
  ctx.fillStyle = COLORS.rust;
  ctx.fillText('✱  LEER ARTÍCULO COMPLETO EN WWW.MRGNT.MX  ✱', width / 2, ruleY);
  ctx.textAlign = 'left';
  drawRule(ctx, marginX, width - marginX, ruleY + 20, 2);
}

// photoSource: { src } — a photo is required (matches the "cover photo" requirement on articles)
export async function generateArticleNewspaperImage({ title, author, dateDisplay, bodyHtml, excerpt, photoSource }) {
  if (!title || !title.trim()) throw new Error('Escribe un título antes de generar la imagen.');
  if (!photoSource) throw new Error('Sube una foto (no video) para generar la imagen.');
  const [, logoImg] = await Promise.all([loadFonts(), getLogoImage()]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH_ARTICLE;
  canvas.height = HEIGHT_ARTICLE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH_ARTICLE, HEIGHT_ARTICLE);

  let y = drawArticleHeader(ctx, WIDTH_ARTICLE, logoImg);
  y = drawArticleByline(ctx, WIDTH_ARTICLE, y, author, dateDisplay);
  y = drawArticleHeadline(ctx, WIDTH_ARTICLE, y, title.trim());

  if (excerpt && excerpt.trim()) {
    y = drawArticleSummary(ctx, WIDTH_ARTICLE, y, excerpt.trim());
    y += 24;
  }

  const bodyText = stripHtml(bodyHtml) || (excerpt || '').trim();
  const img = await loadImage(photoSource.src);

  const footerTop = HEIGHT_ARTICLE - 110;
  const remaining = Math.max(180, footerTop - y - 40);
  const colHeight = Math.round(remaining * 0.5);
  const photoHeight = Math.max(120, remaining - colHeight - 24);

  y = drawArticleColumns(ctx, WIDTH_ARTICLE, y + 10, bodyText, colHeight);
  y += 24;
  drawCover(ctx, img, MARGIN, y, WIDTH_ARTICLE - MARGIN * 2, photoHeight);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(MARGIN, y, WIDTH_ARTICLE - MARGIN * 2, photoHeight);

  drawArticleFooter(ctx, WIDTH_ARTICLE, HEIGHT_ARTICLE);

  return canvas.toDataURL('image/png');
}
