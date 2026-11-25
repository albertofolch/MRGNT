import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';
import { storage } from '/firebase-config.js';
import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';
import { initRichEditor } from '/admin/rich-editor.js';
import {
  CAROUSEL_MAX_PHOTOS, CAROUSEL_TIPOS, buildCarouselDraft, fitCarouselDraft, carouselOrder,
  reviewCarousel, generateCarouselImages, carouselCaption,
} from '/admin/carousel-image.js';

let articles = [];
let editingId = null;
let editingArticle = null;
let currentMediaRemoved = false;
let currentEmbedRemoved = false;
let currentRole = null;
let currentUid = null;
let statusFilter = 'all';

const form = document.getElementById('article-form');
const errorEl = document.getElementById('article-error');
const categorySelect = document.getElementById('article-category');
const listEl = document.getElementById('articles-list');
const cancelBtn = document.getElementById('article-cancel');
const submitBtn = document.getElementById('article-submit');
const headingEl = document.getElementById('form-heading');
const titleInput = document.getElementById('article-title');
const mediaInput = document.getElementById('article-media');
const mediaCurrentEl = document.getElementById('article-media-current');
const embedUrlInput = document.getElementById('article-embed-url');
const embedCurrentEl = document.getElementById('article-embed-current');
const noteEditor = initRichEditor(document.getElementById('article-note-editor'));
const socialGenerateBtn = document.getElementById('article-social-generate');
const socialErrorEl = document.getElementById('article-social-error');
const socialPreviewEl = document.getElementById('article-social-preview');
const carouselPhotosEl = document.getElementById('carousel-photos');
const carouselPhotoInput = document.getElementById('carousel-photo-input');
const carouselEditorEl = document.getElementById('carousel-editor');
const carouselRefillBtn = document.getElementById('carousel-refill');
const carouselWarningsEl = document.getElementById('carousel-warnings');
const carouselSlidesEl = document.getElementById('carousel-slides');
const carouselDownloadAllBtn = document.getElementById('carousel-download-all');
const carouselCaptionEl = document.getElementById('carousel-caption');
const carouselCopyCaptionBtn = document.getElementById('carousel-copy-caption');

function hasMedia() {
  if (mediaInput.files[0]) return true;
  if (editingId && editingArticle && editingArticle.media && !currentMediaRemoved) return true;
  return false;
}

function renderEmbedPreview(article) {
  currentEmbedRemoved = false;
  embedUrlInput.value = '';
  if (!article || !article.embedUrl) {
    embedCurrentEl.hidden = true;
    embedCurrentEl.innerHTML = '';
    return;
  }
  embedCurrentEl.innerHTML = `
    <a href="${article.embedUrl}" target="_blank" rel="noopener">${article.embedUrl}</a>
    <div class="admin-checkbox-row">
      <input type="checkbox" id="article-remove-embed">
      <label for="article-remove-embed">Quitar embed actual</label>
    </div>
  `;
  embedCurrentEl.hidden = false;
  document.getElementById('article-remove-embed').addEventListener('change', (e) => {
    currentEmbedRemoved = e.target.checked;
  });
}

function renderMediaPreview(article) {
  currentMediaRemoved = false;
  mediaInput.value = '';
  if (!article || !article.media) {
    mediaCurrentEl.hidden = true;
    mediaCurrentEl.innerHTML = '';
    return;
  }
  const mediaTag = article.mediaType === 'video'
    ? `<video src="${article.media}" controls></video>`
    : `<img src="${article.media}" alt="Media actual">`;
  mediaCurrentEl.innerHTML = `
    ${mediaTag}
    <div class="admin-checkbox-row">
      <input type="checkbox" id="article-remove-media">
      <label for="article-remove-media">Quitar media actual</label>
    </div>
  `;
  mediaCurrentEl.hidden = false;
  document.getElementById('article-remove-media').addEventListener('change', (e) => {
    currentMediaRemoved = e.target.checked;
    syncCoverPhoto();
  });
}

function resetForm() {
  editingId = null;
  editingArticle = null;
  form.reset();
  document.getElementById('article-id').value = '';
  noteEditor.setHTML('');
  cancelBtn.hidden = true;
  submitBtn.textContent = 'Guardar artículo';
  headingEl.textContent = 'NUEVO ARTÍCULO';
  errorEl.hidden = true;
  renderMediaPreview(null);
  renderEmbedPreview(null);
  resetCarousel();
}

function startEdit(article) {
  editingId = article.id;
  editingArticle = article;
  document.getElementById('article-id').value = article.id;
  document.getElementById('article-title').value = article.title;
  categorySelect.value = article.category;
  document.getElementById('article-date').value = article.article_date;
  document.getElementById('article-author').value = article.author;
  document.getElementById('article-excerpt').value = article.excerpt;
  noteEditor.setHTML(article.note || '');
  renderMediaPreview(article);
  renderEmbedPreview(article);
  cancelBtn.hidden = false;
  submitBtn.textContent = 'Guardar cambios';
  headingEl.textContent = `EDITAR: ${article.title.toUpperCase()}`;
  errorEl.hidden = true;
  resetCarousel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function canEdit(article) {
  if (currentRole === 'admin') return true;
  return article.createdBy === currentUid && article.status !== 'published';
}

function filteredArticles() {
  if (statusFilter === 'published') return articles.filter((a) => a.status === 'published');
  if (statusFilter === 'draft') return articles.filter((a) => a.status !== 'published');
  if (statusFilter === 'popular') {
    return articles.filter((a) => a.status === 'published').sort((a, b) => b.views - a.views);
  }
  return articles;
}

async function togglePublish(article) {
  const action = article.status === 'published' ? 'unpublish' : 'publish';
  const res = await apiFetch(`/api/articles/${article.id}/${action}`, { method: 'POST' });
  if (res.ok) {
    if (editingId === article.id) resetForm();
    await loadArticles();
  } else {
    alert('No se pudo actualizar el estado del artículo');
  }
}

function renderList() {
  listEl.innerHTML = '';
  const visible = filteredArticles();
  if (!visible.length) {
    listEl.innerHTML = '<p class="admin-empty">No hay artículos en esta vista.</p>';
    return;
  }
  visible.forEach((article) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const thumb = article.media && article.mediaType !== 'video'
      ? `<img class="admin-row-thumb" src="${article.media}" alt="">`
      : '';
    const statusBadge = article.status === 'published'
      ? '<span class="admin-status-badge admin-status-published">Publicado</span>'
      : '<span class="admin-status-badge admin-status-draft">Sin publicar</span>';
    const editable = canEdit(article);
    const views = article.status === 'published'
      ? ` · ${article.views.toLocaleString('es-MX')} ${article.views === 1 ? 'lectura' : 'lecturas'}`
      : '';
    row.innerHTML = `
      ${thumb}
      <div class="admin-row-main">
        <div class="admin-row-title">${article.title} ${statusBadge}</div>
        <div class="admin-row-sub">${article.category} — ${article.author} · ${article.date}${views}</div>
      </div>
      <div class="admin-row-actions">
        ${article.status === 'published' ? `<a href="/noticia.html?slug=${encodeURIComponent(article.slug)}" target="_blank">Ver</a>` : ''}
        ${currentRole === 'admin' ? `<button type="button" class="admin-publish">${article.status === 'published' ? 'Despublicar' : 'Publicar'}</button>` : ''}
        ${editable ? '<button type="button" class="admin-edit">Editar</button>' : ''}
        ${editable ? '<button type="button" class="admin-delete">Eliminar</button>' : ''}
      </div>
    `;
    if (editable) {
      row.querySelector('.admin-edit').addEventListener('click', () => startEdit(article));
      row.querySelector('.admin-delete').addEventListener('click', () => deleteArticle(article));
    }
    if (currentRole === 'admin') {
      row.querySelector('.admin-publish').addEventListener('click', () => togglePublish(article));
    }
    listEl.appendChild(row);
  });
}

async function loadArticles() {
  const res = await apiFetch('/api/articles');
  articles = await res.json();
  renderList();
}

async function deleteArticle(article) {
  if (!confirm(`¿Eliminar "${article.title}"?`)) return;
  const res = await apiFetch(`/api/articles/${article.id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingId === article.id) resetForm();
    await loadArticles();
  }
}

async function uploadMediaFile(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`;
  const path = `articles/${filename}`;
  const ref = storageRef(storage, path);
  const task = uploadBytesResumable(ref, file);
  await new Promise((resolve, reject) => task.on('state_changed', null, reject, resolve));
  const url = await getDownloadURL(ref);
  return { url, path, mediaType: file.type.startsWith('video/') ? 'video' : 'image' };
}

// ───────── Carrete para redes sociales ─────────
// Photos: [{ id, src, name, pos, isCover }] — the article's cover photo joins the
// list on its own (isCover); extra photos are local files. Max CAROUSEL_MAX_PHOTOS.
let carouselPhotos = [];
let carouselPhotoSeq = 0;
let carouselFieldSeq = 0;
let coverExcluded = false;
let coverObjectUrl = null;
let carouselDraft = null;
let carouselResult = [];

const pad2 = (n) => String(n).padStart(2, '0');

function resetSocialPreview() {
  socialErrorEl.hidden = true;
  socialErrorEl.textContent = '';
  carouselWarningsEl.hidden = true;
  carouselWarningsEl.innerHTML = '';
  socialPreviewEl.hidden = true;
  carouselSlidesEl.innerHTML = '';
  carouselResult = [];
}

function showSocialError(message) {
  socialErrorEl.textContent = message;
  socialErrorEl.hidden = false;
}

function coverPhotoSrc() {
  const file = mediaInput.files[0];
  if (file) {
    if (!file.type.startsWith('image/')) return null;
    if (!coverObjectUrl || coverObjectUrl.file !== file) {
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl.url);
      coverObjectUrl = { file, url: URL.createObjectURL(file) };
    }
    return coverObjectUrl.url;
  }
  if (editingId && editingArticle && editingArticle.media && !currentMediaRemoved && editingArticle.mediaType !== 'video') {
    return editingArticle.media;
  }
  return null;
}

// Keeps the article's cover photo in the carrete list in step with the media field.
function syncCoverPhoto() {
  const src = coverPhotoSrc();
  const idx = carouselPhotos.findIndex((p) => p.isCover);
  if (idx >= 0 && carouselPhotos[idx].src === src) return;
  if (idx >= 0) carouselPhotos.splice(idx, 1);
  if (src && !coverExcluded && carouselPhotos.length < CAROUSEL_MAX_PHOTOS) {
    carouselPhotos.splice(idx >= 0 ? idx : 0, 0, { id: ++carouselPhotoSeq, src, name: 'Foto de portada del artículo', pos: 50, isCover: true });
  }
  onCarouselPhotosChanged();
}

function onCarouselPhotosChanged() {
  renderCarouselPhotos();
  if (carouselDraft) {
    fitCarouselDraft(carouselDraft, Math.max(1, carouselPhotos.length));
    renderCarouselEditor();
  }
  resetSocialPreview();
}

function renderCarouselPhotos() {
  carouselPhotosEl.innerHTML = '';
  carouselPhotos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = `admin-carousel-photo${i === 0 ? ' admin-carousel-photo--portada' : ''}`;
    item.innerHTML = `
      <img alt="">
      <div class="admin-carousel-photo-meta">
        <span>${pad2(i + 1)}${i === 0 ? ' · Portada' : ''}</span>
        <span class="admin-carousel-photo-actions">
          <button type="button" data-act="left" aria-label="Mover antes" ${i === 0 ? 'disabled' : ''}>◀</button>
          <button type="button" data-act="right" aria-label="Mover después" ${i === carouselPhotos.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" data-act="remove" aria-label="Quitar foto">✕</button>
        </span>
      </div>
      <p class="admin-carousel-photo-name"></p>
      <label class="admin-carousel-photo-pos">Encuadre <input type="range" min="0" max="100" step="1"></label>
    `;
    const img = item.querySelector('img');
    img.src = photo.src;
    img.style.objectPosition = `50% ${photo.pos}%`;
    item.querySelector('.admin-carousel-photo-name').textContent = photo.name;
    const range = item.querySelector('input[type="range"]');
    range.value = photo.pos;
    range.addEventListener('input', () => {
      photo.pos = Number(range.value);
      img.style.objectPosition = `50% ${photo.pos}%`;
    });
    item.querySelector('[data-act="left"]').addEventListener('click', () => moveCarouselPhoto(i, -1));
    item.querySelector('[data-act="right"]').addEventListener('click', () => moveCarouselPhoto(i, 1));
    item.querySelector('[data-act="remove"]').addEventListener('click', () => removeCarouselPhoto(i));
    carouselPhotosEl.appendChild(item);
  });
  const full = carouselPhotos.length >= CAROUSEL_MAX_PHOTOS;
  carouselPhotoInput.disabled = full;
  carouselPhotoInput.title = full ? `Máximo ${CAROUSEL_MAX_PHOTOS} fotos` : '';
}

function moveCarouselPhoto(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= carouselPhotos.length) return;
  [carouselPhotos[i], carouselPhotos[j]] = [carouselPhotos[j], carouselPhotos[i]];
  renderCarouselPhotos();
  resetSocialPreview();
}

function removeCarouselPhoto(i) {
  const [photo] = carouselPhotos.splice(i, 1);
  if (photo.isCover) coverExcluded = true;
  else URL.revokeObjectURL(photo.src);
  onCarouselPhotosChanged();
}

carouselPhotoInput.addEventListener('change', () => {
  const files = [...carouselPhotoInput.files].filter((f) => f.type.startsWith('image/'));
  const room = Math.max(0, CAROUSEL_MAX_PHOTOS - carouselPhotos.length);
  files.slice(0, room).forEach((file) => {
    carouselPhotos.push({ id: ++carouselPhotoSeq, src: URL.createObjectURL(file), name: file.name, pos: 50, isCover: false });
  });
  carouselPhotoInput.value = '';
  onCarouselPhotosChanged();
  if (files.length > room) showSocialError(`Máximo ${CAROUSEL_MAX_PHOTOS} fotos por carrete: se agregaron ${room}.`);
});

function articleFieldsForCarousel() {
  return {
    title: titleInput.value,
    category: categorySelect.value,
    isoDate: document.getElementById('article-date').value,
    excerpt: document.getElementById('article-excerpt').value,
    bodyHtml: noteEditor.getHTML(),
  };
}

function carouselField(parent, label, obj, key, { multiline = false, options = null, counter = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-field';
  const id = `carousel-f-${++carouselFieldSeq}`;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  let input;
  if (options) {
    input = document.createElement('select');
    input.className = 'admin-select';
    options.forEach((o) => input.add(new Option(o, o)));
  } else if (multiline) {
    input = document.createElement('textarea');
    input.className = 'admin-textarea admin-carousel-textarea';
    input.rows = 2;
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'admin-input';
  }
  input.id = id;
  input.value = obj[key] || '';
  wrap.append(lab, input);
  let hint = null;
  if (counter) {
    hint = document.createElement('p');
    hint.className = 'admin-hint';
    wrap.append(hint);
  }
  const update = () => {
    if (!hint) return;
    const len = input.value.trim().length;
    hint.textContent = len > 90 ? `${len} caracteres · mejor menos de 90` : `${len} caracteres`;
    hint.classList.toggle('admin-carousel-over', len > 90);
  };
  update();
  input.addEventListener(options ? 'change' : 'input', () => {
    obj[key] = input.value;
    update();
  });
  parent.appendChild(wrap);
  return wrap;
}

function carouselGroup(title) {
  const g = document.createElement('fieldset');
  g.className = 'admin-carousel-group';
  const legend = document.createElement('legend');
  legend.textContent = title;
  g.appendChild(legend);
  carouselEditorEl.appendChild(g);
  return g;
}

function renderCarouselEditor() {
  carouselEditorEl.innerHTML = '';
  if (!carouselDraft) {
    carouselEditorEl.hidden = true;
    return;
  }
  const d = carouselDraft;
  const order = carouselOrder(Math.max(1, carouselPhotos.length));
  const total = order.length + 2;

  const portada = carouselGroup('01 · Portada');
  carouselField(portada, 'Tipo', d, 'tipo', { options: CAROUSEL_TIPOS });
  carouselField(portada, 'Antetítulo', d.portada, 'antetitulo');
  carouselField(portada, 'Nombre (artista o tema, corto)', d.portada, 'nombre');
  const row = document.createElement('div');
  row.className = 'admin-form-row';
  portada.appendChild(row);
  carouselField(row, 'Lugar', d.portada, 'lugar');
  carouselField(row, 'Ciudad', d.portada, 'ciudad');
  carouselField(row, 'Fecha', d.portada, 'fecha');

  order.forEach(({ kind, index }, i) => {
    const n = i + 2;
    if (kind === 'texto') {
      const s = d.textos[index];
      const g = carouselGroup(`${pad2(n)} · Texto`);
      carouselField(g, 'Título (sin número)', s, 'titulo');
      carouselField(g, 'Frase (una sola oración)', s, 'frase', { multiline: true, counter: true });
      carouselField(g, 'Línea chica (opcional)', s, 'linea');
    } else {
      const s = d.fotos[index];
      const g = carouselGroup(`${pad2(n)} · Foto ${pad2(index + 2)}`);
      carouselField(g, 'Título (sin número)', s, 'titulo');
      carouselField(g, 'Frase (una sola oración)', s, 'frase', { multiline: true, counter: true });
    }
  });

  const cierre = carouselGroup(`${pad2(total)} · Cierre`);
  carouselField(cierre, 'Título', d.cierre, 'titulo');
  carouselField(cierre, 'Frase-mensaje', d.cierre, 'frase', { multiline: true, counter: true });
  carouselField(cierre, 'Línea chica (opcional)', d.cierre, 'linea');

  const caption = carouselGroup('Caption');
  carouselField(caption, 'Texto (2 o 3 líneas)', d.caption, 'texto', { multiline: true });
  carouselField(caption, 'Hashtags', d.caption, 'hashtags');

  carouselEditorEl.hidden = false;
}

function resetCarousel() {
  carouselPhotos.forEach((p) => { if (!p.isCover) URL.revokeObjectURL(p.src); });
  carouselPhotos = [];
  coverExcluded = false;
  carouselDraft = null;
  carouselRefillBtn.hidden = true;
  socialGenerateBtn.textContent = 'Generar carrete';
  renderCarouselEditor();
  syncCoverPhoto();
}

const DIACRITICS_RE = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g');

function slugifyForFilename(text) {
  return text.trim().toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'articulo';
}

async function generateSocialImage() {
  resetSocialPreview();

  if (!titleInput.value.trim()) {
    showSocialError('Escribe un título antes de generar el carrete.');
    return;
  }
  if (!carouselPhotos.length) {
    showSocialError('Agrega al menos una foto (no video) para generar el carrete.');
    return;
  }
  if (!carouselDraft) {
    carouselDraft = buildCarouselDraft(articleFieldsForCarousel(), carouselPhotos.length);
    renderCarouselEditor();
    carouselRefillBtn.hidden = false;
  }

  const { errors, warnings } = reviewCarousel(carouselDraft, carouselPhotos.length);
  if (errors.length) {
    showSocialError(errors.join('\n'));
    return;
  }
  if (warnings.length) {
    warnings.forEach((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      carouselWarningsEl.appendChild(li);
    });
    carouselWarningsEl.hidden = false;
  }

  socialGenerateBtn.disabled = true;
  try {
    carouselResult = await generateCarouselImages(carouselDraft, carouselPhotos);
    const base = slugifyForFilename(carouselDraft.portada.nombre || titleInput.value);
    carouselResult.forEach((slide) => {
      slide.filename = `${base}_${slide.name}.jpg`;
      const fig = document.createElement('figure');
      fig.className = 'admin-carousel-slide';
      fig.innerHTML = '<img alt=""><a class="admin-btn-link" download></a>';
      fig.querySelector('img').src = slide.dataUrl;
      fig.querySelector('img').alt = `Slide ${slide.name.slice(0, 2)}`;
      const link = fig.querySelector('a');
      link.href = slide.dataUrl;
      link.download = slide.filename;
      link.textContent = `Descargar ${slide.name.slice(0, 2)}`;
      carouselSlidesEl.appendChild(fig);
    });
    carouselCaptionEl.value = carouselCaption(carouselDraft);
    socialPreviewEl.hidden = false;
    socialGenerateBtn.textContent = 'Actualizar carrete';
  } catch (err) {
    showSocialError(err.message || 'No se pudo generar el carrete. Inténtalo de nuevo.');
  } finally {
    socialGenerateBtn.disabled = false;
  }
}

socialGenerateBtn.addEventListener('click', generateSocialImage);

carouselRefillBtn.addEventListener('click', () => {
  if (!confirm('¿Reemplazar los textos del carrete con los de la nota? Se pierden los cambios que hiciste aquí.')) return;
  carouselDraft = buildCarouselDraft(articleFieldsForCarousel(), Math.max(1, carouselPhotos.length));
  renderCarouselEditor();
  resetSocialPreview();
});

carouselDownloadAllBtn.addEventListener('click', async () => {
  for (const slide of carouselResult) {
    const a = document.createElement('a');
    a.href = slide.dataUrl;
    a.download = slide.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 300));
  }
});

carouselCopyCaptionBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(carouselCaptionEl.value);
  } catch {
    carouselCaptionEl.select();
    document.execCommand('copy');
  }
  carouselCopyCaptionBtn.textContent = 'Copiado';
  setTimeout(() => { carouselCopyCaptionBtn.textContent = 'Copiar caption'; }, 1500);
});

mediaInput.addEventListener('change', () => {
  coverExcluded = false;
  syncCoverPhoto();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  if (!hasMedia()) {
    errorEl.textContent = 'Debes subir una foto de portada para el artículo.';
    errorEl.hidden = false;
    return;
  }

  const body = {
    title: document.getElementById('article-title').value,
    category: categorySelect.value,
    article_date: document.getElementById('article-date').value,
    author: document.getElementById('article-author').value,
    excerpt: document.getElementById('article-excerpt').value,
    note: noteEditor.getHTML(),
  };

  if (mediaInput.files[0]) {
    try {
      const { url, path, mediaType } = await uploadMediaFile(mediaInput.files[0]);
      body.media = url;
      body.media_path = path;
      body.media_type = mediaType;
    } catch {
      errorEl.textContent = 'Error al subir el archivo. Inténtalo de nuevo.';
      errorEl.hidden = false;
      return;
    }
  }

  if (editingId && currentMediaRemoved) body.remove_media = true;

  if (embedUrlInput.value.trim()) {
    body.embed_url = embedUrlInput.value.trim();
  } else if (editingId && currentEmbedRemoved) {
    body.remove_embed = true;
  }

  const url = editingId ? `/api/articles/${editingId}` : '/api/articles';
  const method = editingId ? 'PUT' : 'POST';
  const res = await apiFetch(url, { method, body: JSON.stringify(body) });
  const resBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = resBody.error || 'No se pudo guardar el artículo';
    errorEl.hidden = false;
    return;
  }
  resetForm();
  await loadArticles();
});

cancelBtn.addEventListener('click', resetForm);

document.querySelectorAll('.admin-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    statusFilter = btn.dataset.filter;
    document.querySelectorAll('.admin-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderList();
  });
});

requireAdminSession().then(async (session) => {
  if (!session) return;
  currentRole = session.role;
  currentUid = session.user.uid;
  renderAdminNav('articles', session.role);
  const meta = await (await apiFetch('/api/meta')).json();
  categorySelect.innerHTML = meta.noticiasCategories.map((c) => `<option value="${c}">${c}</option>`).join('');
  await loadArticles();
});
