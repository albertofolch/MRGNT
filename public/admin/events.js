import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';
import { initRichEditor } from '/admin/rich-editor.js';
import { generateEventsNewspaperImage, EVENTS_MIN, EVENTS_MAX } from '/admin/newspaper-image.js';

let events = [];
let editingId = null;
const selectedForNewspaper = new Set();

const form = document.getElementById('event-form');
const errorEl = document.getElementById('event-error');
const listEl = document.getElementById('events-list');
const cancelBtn = document.getElementById('event-cancel');
const submitBtn = document.getElementById('event-submit');
const headingEl = document.getElementById('form-heading');
const descriptionEditor = initRichEditor(document.getElementById('event-description-editor'));

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('event-id').value = '';
  descriptionEditor.setHTML('');
  cancelBtn.hidden = true;
  submitBtn.textContent = 'Guardar evento';
  headingEl.textContent = 'NUEVO EVENTO';
  errorEl.hidden = true;
}

function startEdit(ev) {
  editingId = ev.id;
  document.getElementById('event-id').value = ev.id;
  document.getElementById('event-date').value = ev.event_date;
  document.getElementById('event-time').value = ev.time;
  document.getElementById('event-stage').value = ev.stage;
  document.getElementById('event-location-url').value = ev.locationUrl || '';
  document.getElementById('event-artist').value = ev.artist;
  document.getElementById('event-title').value = ev.title || '';
  document.getElementById('event-tag').value = ev.tag;
  document.getElementById('event-cost').value = ev.cost || '';
  document.getElementById('event-ticket-link').value = ev.ticket_link || '';
  document.getElementById('event-embed-url').value = ev.embedUrl || '';
  descriptionEditor.setHTML(ev.description || '');
  cancelBtn.hidden = false;
  submitBtn.textContent = 'Guardar cambios';
  headingEl.textContent = `EDITAR: ${ev.artist.toUpperCase()}`;
  errorEl.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderList() {
  listEl.innerHTML = '';
  if (!events.length) {
    listEl.innerHTML = '<p class="admin-empty">Aún no hay eventos.</p>';
    return;
  }
  events.forEach((ev) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const verLink = ev.slug
      ? `<a href="/evento.html?slug=${encodeURIComponent(ev.slug)}" target="_blank">Ver</a>`
      : '';
    const mapLink = ev.locationUrl
      ? `<a href="${ev.locationUrl}" target="_blank" rel="noopener">Mapa</a>`
      : '';
    row.innerHTML = `
      ${ev.image ? `<img class="admin-row-thumb" src="${ev.image}" alt="">` : ''}
      <div class="admin-row-main">
        <div class="admin-row-title">${ev.artist}${ev.tag ? ' · ' + ev.tag : ''}</div>
        <div class="admin-row-sub">${ev.day} ${ev.date} · ${ev.time} — ${ev.stage}</div>
      </div>
      <div class="admin-row-actions">
        ${mapLink}
        ${verLink}
        <button type="button" class="admin-edit">Editar</button>
        <button type="button" class="admin-delete">Eliminar</button>
      </div>
    `;
    row.querySelector('.admin-edit').addEventListener('click', () => startEdit(ev));
    row.querySelector('.admin-delete').addEventListener('click', () => deleteEvent(ev));
    listEl.appendChild(row);
  });
}

async function loadEvents() {
  const res = await apiFetch('/api/events');
  events = await res.json();
  renderList();
  newspaperOpenBtn.disabled = events.length < EVENTS_MIN;
}

async function deleteEvent(ev) {
  if (!confirm(`¿Eliminar "${ev.artist}" (${ev.date})?`)) return;
  const res = await apiFetch(`/api/events/${ev.id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingId === ev.id) resetForm();
    await loadEvents();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const payload = {
    event_date: document.getElementById('event-date').value,
    time: document.getElementById('event-time').value,
    stage: document.getElementById('event-stage').value,
    location_url: document.getElementById('event-location-url').value,
    artist: document.getElementById('event-artist').value,
    title: document.getElementById('event-title').value,
    tag: document.getElementById('event-tag').value,
    description: descriptionEditor.getHTML(),
    cost: document.getElementById('event-cost').value,
    ticket_link: document.getElementById('event-ticket-link').value,
    embed_url: document.getElementById('event-embed-url').value,
  };
  const url = editingId ? `/api/events/${editingId}` : '/api/events';
  const method = editingId ? 'PUT' : 'POST';
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = body.error || 'No se pudo guardar el evento';
    errorEl.hidden = false;
    return;
  }
  resetForm();
  await loadEvents();
});

cancelBtn.addEventListener('click', resetForm);

// --- Weekly newspaper image ---

const newspaperOpenBtn = document.getElementById('newspaper-open');
const newspaperCloseBtn = document.getElementById('newspaper-close');
const newspaperOverlay = document.getElementById('newspaper-overlay');
const newspaperListEl = document.getElementById('newspaper-picker-list');
const newspaperCounterEl = document.getElementById('newspaper-counter');
const newspaperGenerateBtn = document.getElementById('newspaper-generate');
const newspaperModalErrorEl = document.getElementById('newspaper-modal-error');
const newspaperErrorEl = document.getElementById('newspaper-error');
const newspaperPreviewEl = document.getElementById('newspaper-preview');
const newspaperPreviewImg = document.getElementById('newspaper-preview-img');
const newspaperDownloadLink = document.getElementById('newspaper-download');

function updateNewspaperCounter() {
  const n = selectedForNewspaper.size;
  newspaperCounterEl.textContent = `${n} de ${EVENTS_MIN}–${EVENTS_MAX} seleccionados`;
  newspaperGenerateBtn.disabled = n < EVENTS_MIN || n > EVENTS_MAX;
}

function renderNewspaperPicker() {
  newspaperListEl.innerHTML = '';
  events.forEach((ev) => {
    const row = document.createElement('label');
    row.className = 'admin-picker-item';
    const checked = selectedForNewspaper.has(ev.id);
    row.innerHTML = `
      <input type="checkbox" data-id="${ev.id}" ${checked ? 'checked' : ''}>
      <span>
        <strong>${ev.artist}${ev.tag ? ' · ' + ev.tag : ''}</strong>
        <span class="admin-row-sub">${ev.day} ${ev.date} · ${ev.time} — ${ev.stage}</span>
      </span>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (selectedForNewspaper.size >= EVENTS_MAX) {
          e.target.checked = false;
          newspaperModalErrorEl.textContent = `Puedes seleccionar máximo ${EVENTS_MAX} eventos.`;
          newspaperModalErrorEl.hidden = false;
          return;
        }
        selectedForNewspaper.add(ev.id);
      } else {
        selectedForNewspaper.delete(ev.id);
      }
      newspaperModalErrorEl.hidden = true;
      updateNewspaperCounter();
    });
    newspaperListEl.appendChild(row);
  });
}

function openNewspaperPicker() {
  newspaperModalErrorEl.hidden = true;
  renderNewspaperPicker();
  updateNewspaperCounter();
  newspaperOverlay.hidden = false;
}

function closeNewspaperPicker() {
  newspaperOverlay.hidden = true;
}

newspaperOpenBtn.addEventListener('click', openNewspaperPicker);
newspaperCloseBtn.addEventListener('click', closeNewspaperPicker);
newspaperOverlay.addEventListener('click', (e) => {
  if (e.target === newspaperOverlay) closeNewspaperPicker();
});

newspaperGenerateBtn.addEventListener('click', async () => {
  newspaperModalErrorEl.hidden = true;
  const selected = events.filter((ev) => selectedForNewspaper.has(ev.id));
  newspaperGenerateBtn.disabled = true;
  try {
    const dataUrl = await generateEventsNewspaperImage(selected);
    newspaperErrorEl.hidden = true;
    newspaperPreviewImg.src = dataUrl;
    newspaperDownloadLink.href = dataUrl;
    newspaperDownloadLink.download = `mrgnt-periodico-${new Date().toISOString().slice(0, 10)}.png`;
    newspaperPreviewEl.hidden = false;
    closeNewspaperPicker();
  } catch (err) {
    newspaperModalErrorEl.textContent = err.message || 'No se pudo generar la imagen. Inténtalo de nuevo.';
    newspaperModalErrorEl.hidden = false;
  } finally {
    updateNewspaperCounter();
  }
});

requireAdminSession(['admin']).then(async (session) => {
  if (!session) return;
  renderAdminNav('events', session.role);
  await loadEvents();
});
