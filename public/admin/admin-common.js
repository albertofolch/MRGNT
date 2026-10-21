import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { auth } from '/firebase-config.js';

export function resolveRole(claims) {
  if (claims.role === 'admin' || claims.role === 'writer') return claims.role;
  if (claims.admin) return 'admin';
  return null;
}

export async function apiFetch(url, options = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.location.href = '/admin/login.html';
    throw new Error('No autenticado');
  }
  return res;
}

// Resolves to { user, role } for an allowed role, or redirects and resolves null.
// allowedRoles defaults to any authenticated account (admin or writer).
export function requireAdminSession(allowedRoles = ['admin', 'writer']) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        window.location.href = '/admin/login.html';
        return resolve(null);
      }
      const token = await user.getIdTokenResult();
      const role = resolveRole(token.claims);
      if (!role) {
        await signOut(auth);
        window.location.href = '/admin/login.html';
        return resolve(null);
      }
      if (!allowedRoles.includes(role)) {
        window.location.href = '/admin/index.html';
        return resolve(null);
      }
      resolve({ user, role });
    });
  });
}

export function renderAdminNav(active, role) {
  const links = [];
  if (role === 'admin') links.push(['/admin/artists.html', 'artists', 'Artistas']);
  if (role === 'admin') links.push(['/admin/artist-submissions.html', 'artist-submissions', 'Solicitudes de artistas']);
  if (role === 'admin') links.push(['/admin/events.html', 'events', 'Eventos']);
  if (role === 'admin') links.push(['/admin/event-submissions.html', 'submissions', 'Solicitudes de eventos']);
  links.push(['/admin/articles.html', 'articles', 'Noticias']);
  if (role === 'admin') links.push(['/admin/users.html', 'users', 'Usuarios']);

  const nav = document.createElement('nav');
  nav.className = 'admin-nav';
  nav.innerHTML = `
    <a href="/admin/index.html" class="admin-nav-brand">MRGNT admin</a>
    <div class="admin-nav-links">
      ${links.map(([href, key, label]) => `<a href="${href}" class="admin-nav-link${active === key ? ' active' : ''}">${label}</a>`).join('')}
      <button type="button" class="admin-nav-logout" id="admin-logout">Cerrar sesión</button>
    </div>
  `;
  document.body.prepend(nav);
  nav.querySelector('#admin-logout').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = '/admin/login.html';
  });
}
