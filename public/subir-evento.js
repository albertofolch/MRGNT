const form = document.getElementById('event-submit-form');
const errorEl = document.getElementById('event-submit-error');
const successEl = document.getElementById('event-submit-success');
const submitBtn = document.getElementById('event-submit-btn');
const imageInput = document.getElementById('event-image');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  successEl.hidden = true;

  const payload = {
    event_date: document.getElementById('event-date').value,
    time: document.getElementById('event-time').value,
    stage: document.getElementById('event-stage').value,
    location_url: document.getElementById('event-location-url').value,
    artist: document.getElementById('event-artist').value,
    title: document.getElementById('event-title').value,
    tag: document.getElementById('event-tag').value,
    description: document.getElementById('event-description').value,
    cost: document.getElementById('event-cost').value,
    ticket_link: document.getElementById('event-ticket-link').value,
    embed_url: document.getElementById('event-embed-url').value,
    submitter_name: document.getElementById('event-submitter-name').value,
    submitter_email: document.getElementById('event-submitter-email').value,
    website: document.getElementById('event-website').value,
  };

  const imageFile = imageInput.files[0];
  if (imageFile) {
    if (imageFile.size > MAX_IMAGE_BYTES) {
      errorEl.textContent = 'La imagen no debe pesar más de 5 MB.';
      errorEl.hidden = false;
      return;
    }
    try {
      payload.image_data = await readImageAsDataUrl(imageFile);
    } catch {
      errorEl.textContent = 'No se pudo leer la imagen. Inténtalo de nuevo.';
      errorEl.hidden = false;
      return;
    }
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/event-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorEl.textContent = body.error || 'No se pudo enviar el evento. Inténtalo de nuevo.';
      errorEl.hidden = false;
      return;
    }
    form.reset();
    successEl.textContent = '¡Gracias! Recibimos tu evento y lo revisaremos antes de publicarlo.';
    successEl.hidden = false;
  } catch {
    errorEl.textContent = 'No se pudo enviar el evento. Revisa tu conexión e inténtalo de nuevo.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});
