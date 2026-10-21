import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';
import { storage } from '/firebase-config.js';
import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';
import { initRichEditor } from '/admin/rich-editor.js';
import { generateArticleNewspaperImage } from '/admin/newspaper-image.js';

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
const socialPreviewImg = document.getElementById('article-social-preview-img');
const socialDownloadLink = document.getElementById('article-social-download');

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
  resetSocialPreview();
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
  resetSocialPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function canEdit(article) {
  if (currentRole === 'admin') return true;
  return article.createdBy === currentUid && article.status !== 'published';
}

function filteredArticles() {
  if (statusFilter === 'published') return articles.filter((a) => a.status === 'published');
  if (statusFilter === 'draft') return articles.filter((a) => a.status !== 'published');
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
    row.innerHTML = `
      ${thumb}
      <div class="admin-row-main">
        <div class="admin-row-title">${article.title} ${statusBadge}</div>
        <div class="admin-row-sub">${article.category} — ${article.author} · ${article.date}</div>
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

function resetSocialPreview() {
  socialErrorEl.hidden = true;
  socialPreviewEl.hidden = true;
  socialPreviewImg.removeAttribute('src');
  socialDownloadLink.removeAttribute('href');
}

function getPhotoSource() {
  const file = mediaInput.files[0];
  if (file) {
    if (!file.type.startsWith('image/')) return null;
    return { src: URL.createObjectURL(file) };
  }
  if (editingId && editingArticle && editingArticle.media && !currentMediaRemoved && editingArticle.mediaType !== 'video') {
    return { src: editingArticle.media };
  }
  return null;
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function isoToDisplayDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${String(day).padStart(2, '0')} ${MONTH_ABBR[month - 1]} ${year}`;
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

  const title = titleInput.value.trim();
  if (!title) {
    socialErrorEl.textContent = 'Escribe un título antes de generar la imagen.';
    socialErrorEl.hidden = false;
    return;
  }

  const photoSource = getPhotoSource();
  if (!photoSource) {
    socialErrorEl.textContent = 'Sube una foto (no video) para generar la imagen de redes sociales.';
    socialErrorEl.hidden = false;
    return;
  }

  socialGenerateBtn.disabled = true;
  try {
    const dataUrl = await generateArticleNewspaperImage({
      title,
      author: document.getElementById('article-author').value,
      dateDisplay: isoToDisplayDate(document.getElementById('article-date').value),
      bodyHtml: noteEditor.getHTML(),
      excerpt: document.getElementById('article-excerpt').value,
      photoSource,
    });
    socialPreviewImg.src = dataUrl;
    socialDownloadLink.href = dataUrl;
    socialDownloadLink.download = `${slugifyForFilename(title)}-social.png`;
    socialPreviewEl.hidden = false;
  } catch (err) {
    socialErrorEl.textContent = err.message || 'No se pudo generar la imagen. Inténtalo de nuevo.';
    socialErrorEl.hidden = false;
  } finally {
    socialGenerateBtn.disabled = false;
  }
}

socialGenerateBtn.addEventListener('click', generateSocialImage);

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
