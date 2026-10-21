const MONTH_NAMES = {
  ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril', may: 'Mayo', jun: 'Junio',
  jul: 'Julio', ago: 'Agosto', sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre',
};

function groupEventsByMonth(list) {
  const groups = [];
  const byKey = {};
  list.forEach((ev) => {
    const [, month, year] = ev.date.split(' ');
    const key = month + ' ' + year;
    if (!byKey[key]) {
      byKey[key] = { label: `${MONTH_NAMES[month.toLowerCase()] || month} ${year}`.toUpperCase(), events: [] };
      groups.push(byKey[key]);
    }
    byKey[key].events.push(ev);
  });
  return groups;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderEventos(events) {
  const container = document.getElementById('eventos-groups');
  container.innerHTML = '';

  const today = todayISO();
  const upcoming = events.filter((ev) => ev.event_date >= today);

  groupEventsByMonth(upcoming).forEach((group) => {
    const monthEl = document.createElement('div');
    monthEl.className = 'eventos-month';

    const heading = document.createElement('h2');
    heading.textContent = group.label;
    monthEl.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'events-list';
    group.events.forEach((ev) => {
      const [day, month] = ev.date.split(' ');
      const row = document.createElement(ev.slug ? 'a' : 'div');
      row.className = 'event-row';
      if (ev.slug) row.href = `evento.html?slug=${encodeURIComponent(ev.slug)}`;
      row.innerHTML = `
        <span class="event-time">${ev.day} ${day} ${month.toUpperCase()} · ${ev.time}</span>
        <div class="event-main">
          <span class="event-artist">${ev.artist}</span>
          <span class="event-stage">${ev.stage}</span>
        </div>
        ${ev.tag ? `<span class="event-tag">${ev.tag}</span>` : ''}
      `;
      list.appendChild(row);
    });
    monthEl.appendChild(list);
    container.appendChild(monthEl);
  });
}

fetch('/api/events')
  .then((res) => res.json())
  .then(renderEventos);
