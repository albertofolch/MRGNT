import { apiFetch, requireAdminSession, renderAdminNav } from '/admin/admin-common.js';

const listEl = document.getElementById('submissions-list');

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

function injectScriptOnce(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

function renderPreviewEmbed(sub) {
  const embedEl = document.getElementById('preview-embed');
  embedEl.innerHTML = '';
  if (!sub.embedUrl || !sub.embedProvider) {
    embedEl.hidden = true;
    return;
  }

  if (sub.embedProvider === 'youtube') {
    const videoId = extractYouTubeId(sub.embedUrl);
    if (!videoId) {
      embedEl.hidden = true;
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
    iframe.title = sub.displayTitle;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.className = 'embed-youtube';
    embedEl.appendChild(iframe);
  } else if (sub.embedProvider === 'instagram') {
    const bq = document.createElement('blockquote');
    bq.className = 'instagram-media';
    bq.setAttribute('data-instgrm-permalink', sub.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.instagram.com/embed.js');
    if (window.instgrm) window.instgrm.Embeds.process();
  } else if (sub.embedProvider === 'tiktok') {
    const bq = document.createElement('blockquote');
    bq.className = 'tiktok-embed';
    bq.setAttribute('cite', sub.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.tiktok.com/embed.js');
  } else if (sub.embedProvider === 'twitter') {
    const bq = document.createElement('blockquote');
    bq.className = 'twitter-tweet';
    const a = document.createElement('a');
    a.href = sub.embedUrl;
    bq.appendChild(a);
    embedEl.appendChild(bq);
    injectScriptOnce('https://platform.twitter.com/widgets.js');
    if (window.twttr && window.twttr.widgets) window.twttr.widgets.load();
  }

  embedEl.hidden = false;
}

function renderPreviewMap(sub) {
  const mapEl = document.getElementById('preview-map');
  const iframeEl = document.getElementById('preview-map-iframe');
  const linkEl = document.getElementById('preview-map-link');

  if (!sub.locationUrl) {
    mapEl.hidden = true;
    linkEl.hidden = true;
    return;
  }

  linkEl.href = sub.locationUrl;
  linkEl.hidden = false;

  if (sub.locationEmbedUrl) {
    iframeEl.src = sub.locationEmbedUrl;
    mapEl.hidden = false;
  } else {
    mapEl.hidden = true;
  }
}

function openPreview(sub) {
  document.getElementById('preview-title').textContent = sub.displayTitle;
  document.getElementById('preview-meta').textContent = `${sub.day} ${sub.date} · ${sub.time} — ${sub.stage}${sub.tag ? ' · ' + sub.tag : ''}`;
  document.getElementById('preview-body').innerHTML = sub.description || '';

  const imageEl = document.getElementById('preview-image');
  if (sub.image) {
    imageEl.src = sub.image;
    imageEl.alt = sub.displayTitle;
    imageEl.hidden = false;
  } else {
    imageEl.hidden = true;
  }

  renderPreviewEmbed(sub);
  renderPreviewMap(sub);

  const costEl = document.getElementById('preview-cost');
  if (sub.cost) {
    costEl.textContent = `Costo: ${sub.cost}`;
    costEl.hidden = false;
  } else {
    costEl.hidden = true;
  }

  const ticketEl = document.getElementById('preview-ticket-link');
  if (sub.ticket_link) {
    ticketEl.href = sub.ticket_link;
    ticketEl.hidden = false;
  } else {
    ticketEl.hidden = true;
  }

  document.getElementById('preview-overlay').hidden = false;
}

function closePreview() {
  document.getElementById('preview-overlay').hidden = true;
}

document.getElementById('preview-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'preview-overlay') closePreview();
});
document.getElementById('preview-close').addEventListener('click', closePreview);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePreview();
});

function renderList(submissions) {
  listEl.innerHTML = '';
  if (!submissions.length) {
    listEl.innerHTML = '<p class="admin-empty">No hay solicitudes pendientes.</p>';
    return;
  }
  submissions.forEach((sub) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      ${sub.image ? `<img class="admin-row-thumb" src="${sub.image}" alt="">` : ''}
      <div class="admin-row-main">
        <div class="admin-row-title">${sub.artist}${sub.title ? ' — ' + sub.title : ''}${sub.tag ? ' · ' + sub.tag : ''}</div>
        <div class="admin-row-sub">${sub.day} ${sub.date} · ${sub.time} — ${sub.stage}${sub.cost ? ' · ' + sub.cost : ''}</div>
        <div class="admin-row-sub">Enviado por ${sub.submitterName} (${sub.submitterEmail})</div>
      </div>
      <div class="admin-row-actions">
        ${sub.locationUrl ? `<a href="${sub.locationUrl}" target="_blank" rel="noopener">Mapa</a>` : ''}
        <button type="button" class="admin-preview">Ver</button>
        <button type="button" class="admin-approve">Aprobar</button>
        <button type="button" class="admin-delete">Rechazar</button>
      </div>
    `;
    row.querySelector('.admin-preview').addEventListener('click', () => openPreview(sub));
    row.querySelector('.admin-approve').addEventListener('click', () => approveSubmission(sub));
    row.querySelector('.admin-delete').addEventListener('click', () => rejectSubmission(sub));
    listEl.appendChild(row);
  });
}

async function loadSubmissions() {
  const res = await apiFetch('/api/event-submissions');
  const submissions = await res.json();
  renderList(submissions);
}

async function approveSubmission(sub) {
  if (!confirm(`¿Aprobar y publicar "${sub.artist}" (${sub.date})?`)) return;
  const res = await apiFetch(`/api/event-submissions/${sub.id}/approve`, { method: 'POST' });
  if (res.ok) await loadSubmissions();
  else alert('No se pudo aprobar la solicitud');
}

async function rejectSubmission(sub) {
  if (!confirm(`¿Rechazar y eliminar la solicitud de "${sub.artist}"?`)) return;
  const res = await apiFetch(`/api/event-submissions/${sub.id}`, { method: 'DELETE' });
  if (res.ok) await loadSubmissions();
  else alert('No se pudo rechazar la solicitud');
}

requireAdminSession(['admin']).then(async (session) => {
  if (!session) return;
  renderAdminNav('submissions', session.role);
  await loadSubmissions();
});
