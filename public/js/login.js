// login.js - Splash de bienvenida y manejo de inicio de sesión
(() => {
  const form    = document.getElementById('loginForm');
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('pass');
  const btn     = document.getElementById('go');
  const overlay = document.getElementById('welcomeOverlay');
  const toast   = document.getElementById('toast');
  const toggle  = document.querySelector('.toggle-pass');

  /* ========= Splash: 3 segundos al cargar ========= */
  const SPLASH_MS = 3000; // 3s
  if (overlay) {
    // Esperar a que el DOM esté listo para que no haya flash
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        overlay.classList.add('hidden');      // fade out (CSS)
        // opcional: aria para lectores de pantalla
        overlay.setAttribute('aria-hidden', 'true');
      }, SPLASH_MS);
    });
  }

  /* ========= Utilidad: toast ========= */
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ========= Mostrar/ocultar contraseña ========= */
  toggle?.addEventListener('click', () => {
    if (!passEl) return;
    passEl.type = passEl.type === 'password' ? 'text' : 'password';
  });

  /* ========= Lógica de login ========= */
  async function login() {
    const email = (emailEl?.value || '').trim();
    const password = passEl?.value || '';

    if (!email || !password) {
      showToast('Completa correo y contraseña.');
      return;
    }

    try {
      // Tu server.js expone POST /api/auth/login
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error || data.message || 'Credenciales inválidas.');
        return;
      }

      // Si tu backend marcó contraseña temporal, puedes redirigir al cambio
      if (data?.needChange) {
        window.location.assign('/first-change.html');
        return;
      }

      // Login correcto → a la ruta protegida
      window.location.assign('/admin'); // tu server la sirve con sesión
    } catch (err) {
      console.error(err);
      showToast('No se pudo conectar con el servidor.');
    }
  }

  /* ========= Submit por botón y Enter ========= */
  btn?.addEventListener('click', (e) => { e.preventDefault(); login(); });
  form?.addEventListener('submit', (e) => { e.preventDefault(); login(); });
})();
