function getSlugParam() {
  return new URLSearchParams(window.location.search).get('slug');
}

function renderNotFound() {
  document.getElementById('evento-title').textContent = 'Evento no encontrado';
  document.getElementById('evento-meta').textContent = '';
  document.getElementById('evento-body').innerHTML = '<p>Este evento no existe o fue eliminado.</p>';
}

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

function buildMapsEmbedUrl(locationUrl) {
  try {
    const u = new URL(locationUrl);

    const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (placeMatch) {
      const place = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      return `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
    }

    const coordMatch = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      return `https://www.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}&output=embed`;
    }

    const q = u.searchParams.get('q');
    if (q) {
      return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
    }

    return null;
  } catch {
    return null;
  }
}

async function renderMap(ev) {
  const mapEl = document.getElementById('evento-map');
  const iframeEl = document.getElementById('evento-map-iframe');
  const linkEl = document.getElementById('evento-map-link');

  if (!ev.locationUrl) {
    mapEl.hidden = true;
    linkEl.hidden = true;
    return;
  }

  linkEl.href = ev.locationUrl;
  linkEl.hidden = false;

  const showMap = (embedSrc) => {
    if (!embedSrc) {
      mapEl.hidden = true;
      return;
    }
    iframeEl.src = embedSrc;
    mapEl.hidden = false;
  };

  if (ev.locationEmbedUrl) {
    // Already resolved server-side when the event was saved.
    showMap(ev.locationEmbedUrl);
    return;
  }

  // Best-effort client-side extraction (works for full google.com/maps links, not short ones).
  const clientEmbedSrc = buildMapsEmbedUrl(ev.locationUrl);
  if (clientEmbedSrc) {
    showMap(clientEmbedSrc);
    return;
  }

  // Event saved before location_embed_url existed (or resolving it failed at save time) and
  // the link is a short one (maps.app.goo.gl, etc.) — ask the server to resolve it on demand.
  try {
    const res = await fetch(`/api/events/resolve-map?url=${encodeURIComponent(ev.locationUrl)}`);
    const body = await res.json();
    showMap(body.embedUrl);
  } catch {
    mapEl.hidden = true;
  }
}

function injectScriptOnce(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

function renderEmbed(ev) {
  const embedEl = document.getElementById('evento-embed');
  embedEl.innerHTML = '';
  if (!ev.embedUrl || !ev.embedProvider) {
    embedEl.hidden = true;
    return;
  }

  if (ev.embedProvider === 'youtube') {
    const videoId = extractYouTubeId(ev.embedUrl);
    if (!videoId) {
      embedEl.hidden = true;
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
    iframe.title = ev.displayTitle;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.className = 'embed-youtube';
    embedEl.appendChild(iframe);
  } else if (ev.embedProvider === 'instagram') {
    const bq = document.createElement('blockquote');
    bq.className = 'instagram-media';
    bq.setAttribute('data-instgrm-permalink', ev.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.instagram.com/embed.js');
    if (window.instgrm) window.instgrm.Embeds.process();
  } else if (ev.embedProvider === 'tiktok') {
    const bq = document.createElement('blockquote');
    bq.className = 'tiktok-embed';
    bq.setAttribute('cite', ev.embedUrl);
    embedEl.appendChild(bq);
    injectScriptOnce('https://www.tiktok.com/embed.js');
  } else if (ev.embedProvider === 'twitter') {
    const bq = document.createElement('blockquote');
    bq.className = 'twitter-tweet';
    const a = document.createElement('a');
    a.href = ev.embedUrl;
    bq.appendChild(a);
    embedEl.appendChild(bq);
    injectScriptOnce('https://platform.twitter.com/widgets.js');
    if (window.twttr && window.twttr.widgets) window.twttr.widgets.load();
  }

  embedEl.hidden = false;
}

function renderImage(ev) {
  const imageEl = document.getElementById('evento-image');
  if (ev.image) {
    imageEl.src = ev.image;
    imageEl.alt = ev.displayTitle;
    imageEl.hidden = false;
  } else {
    imageEl.hidden = true;
  }
}

function renderEvento(ev) {
  document.title = `${ev.displayTitle} — MRGNT`;
  document.getElementById('evento-title').textContent = ev.displayTitle;
  document.getElementById('evento-meta').textContent = `${ev.day} ${ev.date} · ${ev.time} — ${ev.stage}`;

  renderImage(ev);
  renderEmbed(ev);
  renderMap(ev);

  const bodyEl = document.getElementById('evento-body');
  bodyEl.innerHTML = ev.description || '';

  const costEl = document.getElementById('evento-cost');
  if (ev.cost) {
    costEl.textContent = `Costo: ${ev.cost}`;
    costEl.hidden = false;
  } else {
    costEl.hidden = true;
  }

  const ticketEl = document.getElementById('evento-ticket-link');
  if (ev.ticket_link) {
    ticketEl.href = ev.ticket_link;
    ticketEl.hidden = false;
  } else {
    ticketEl.hidden = true;
  }
}

fetch('/api/events')
  .then((res) => res.json())
  .then((events) => {
    const ev = events.find((e) => e.slug === getSlugParam());
    if (!ev) return renderNotFound();
    renderEvento(ev);
  });
