// ===== public/js/admin-common.js =====
// ===================== APLICA PREFERENCIAS GLOBALES (todas las páginas) =====================
(function applyUIPrefsEarly(){
  try{
    const prefs = JSON.parse(localStorage.getItem('ui.prefs') || '{}');

    const css = `
      body.dense .card, body.dense .surface { padding:14px; }
      body.dense .input, body.dense .btn, body.dense .btn-outline, body.dense .btn-secondary { padding:8px 10px; }
      body.dense .label { margin:8px 0 6px; }
      body.dense .menu a { padding:10px 12px; }
    `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    if (Array.isArray(prefs.accent) && prefs.accent.length >= 2){
      const [a1, a2] = prefs.accent;
      const root = document.documentElement;
      root.style.setProperty('--accent', a1);
      root.style.setProperty('--accent-2', a2);
      root.style.setProperty('--accent-ring', a1 + '44');
    }

    if (prefs.dense) document.body.classList.add('dense');

    const fs = Number(prefs.fontSize);
    if (Number.isFinite(fs) && fs >= 13 && fs <= 20){
      document.body.style.fontSize = fs + 'px';
    }
  }catch(e){ /* no-op */ }
})();

// ===================== HELPERS =====================
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function api(method, url, data, isForm = false) {
  const opts = { method, headers: {} };
  if (data) {
    if (isForm) {
      opts.body = data;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
  }

  const res = await fetch(url, opts);

  // Leemos el cuerpo UNA sola vez como texto
  const ct = res.headers.get('content-type') || '';
  const isJSON = ct.includes('application/json');
  const bodyText = await res.text(); // <- se lee solo una vez

  if (!res.ok) {
    // Intentamos extraer mensaje desde JSON si parece JSON; si no, dejamos el texto tal cual
    let msg = '';
    if (isJSON) {
      try {
        const j = JSON.parse(bodyText);
        msg = j?.error || j?.message || '';
      } catch {}
    }
    if (!msg) msg = bodyText || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  // Si fue OK, devolvemos JSON si corresponde; si no, texto
  return isJSON ? (bodyText ? JSON.parse(bodyText) : {}) : bodyText;
}


// Logout
$('#logoutBtn')?.addEventListener('click', async () => {
  try { await api('POST','/api/auth/logout'); } catch {}
  location.href = '/login';
});

// --- Resaltar link activo en el menú lateral ---
(function highlightActive(){
  const here = location.pathname.replace(/\/+$/,'');
  $$('.menu a').forEach(a => {
    const href = a.getAttribute('href')?.replace(/\/+$/,'');
    if (href && (here === href)) a.classList.add('active');
  });
})();

// --- Cargar identidad de marca en el sidebar del admin (público) ---
(async function applyBrandFromAPI(){
  try{
    const b = await (await fetch('/api/branding')).json();
    const n = $('#adminBrandName');
    const d = $('#adminBrandTag');
    const l = $('#adminBrandLogo');
    if (n && b?.name) n.textContent = b.name;
    if (d) d.textContent = b?.tagline || '';
    if (l && b?.logo_url){
      l.style.backgroundImage = `url('${b.logo_url}')`;
    }
  }catch(e){ /* ignore */ }
})();
