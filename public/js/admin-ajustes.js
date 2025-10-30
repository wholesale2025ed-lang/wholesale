// /js/admin-ajustes.js  (REEMPLAZA TODO ESTE ARCHIVO)
(() => {
  // ===== Util =====
  const $  = (s, r = document) => r.querySelector(s);

  function setMsg(el, text, ok = true){
    if (!el) return;
    el.textContent = (ok ? '✅ ' : '❌ ') + text;
    el.style.color = ok ? '' : '#ff9090';
  }

  // Guarda/lee preferencias UI en localStorage
  function saveUIPrefs(partial){
    const prev = JSON.parse(localStorage.getItem('ui.prefs') || '{}');
    const next = { ...prev, ...partial };
    localStorage.setItem('ui.prefs', JSON.stringify(next));
  }
  function readUIPrefs(){
    return JSON.parse(localStorage.getItem('ui.prefs') || '{}');
  }

  // ===== Cambiar contraseña =====
  $('#pwdForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = $('#pwdCurrent').value.trim();
    const next    = $('#pwdNext').value.trim();
    const repeat  = $('#pwdRepeat').value.trim();
    const msg     = $('#pwdMsg');

    msg.textContent = '';

    if (!current || !next || !repeat){
      return setMsg(msg, 'Completa los campos.', false);
    }
    if (next.length < 6){
      return setMsg(msg, 'La nueva clave debe tener al menos 6 caracteres.', false);
    }
    if (next !== repeat){
      return setMsg(msg, 'Las contraseñas no coinciden.', false);
    }

    try{
      const res = await api('POST','/api/auth/change-password',{ current, next });
      setMsg(msg, (res?.message || 'Contraseña actualizada'));
      $('#pwdCurrent').value = $('#pwdNext').value = $('#pwdRepeat').value = '';
    }catch(err){
      setMsg(msg, (err?.message || 'Error cambiando contraseña'), false);
      console.error(err);
    }
  });

  // ===== Preferencias de interfaz =====
  const ACCENTS = [
    ['#00d0ff','#00e38e'],
    ['#8b5cf6','#22d3ee'],
    ['#ff7a18','#ffd166'],
    ['#ff4d97','#ffd1e8'],
    ['#22c55e','#93c5fd'],
  ];

  function applyAccent(a1, a2){
    const root = document.documentElement;
    root.style.setProperty('--accent', a1);
    root.style.setProperty('--accent-2', a2);
    root.style.setProperty('--accent-ring', a1 + '44');
  }

  function renderSwatches(){
    const wrap = $('#accentSwatches');
    if (!wrap) return;
    wrap.innerHTML = '';
    const pref = readUIPrefs();

    ACCENTS.forEach(([a1,a2]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = `linear-gradient(90deg, ${a1}, ${a2})`;
      b.setAttribute('role','radio');

      const checked = pref.accent && pref.accent[0]===a1 && pref.accent[1]===a2;
      b.setAttribute('aria-checked', checked ? 'true':'false');

      b.addEventListener('click', () => {
        applyAccent(a1,a2);
        saveUIPrefs({ accent:[a1,a2] });
        [...wrap.children].forEach(x=>x.setAttribute('aria-checked','false'));
        b.setAttribute('aria-checked','true');
      });

      wrap.appendChild(b);
    });

    if (pref.accent) applyAccent(pref.accent[0], pref.accent[1]);
  }

  (function injectDenseCSS(){
    const css = `
      body.dense .card, body.dense .surface { padding:14px; }
      body.dense .input, body.dense .btn, body.dense .btn-outline, body.dense .btn-secondary { padding:8px 10px; }
      body.dense .label { margin:8px 0 6px; }
      body.dense .menu a { padding:10px 12px; }
    `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  })();

  function loadUIPanel(){
    const pref = readUIPrefs();

    document.body.classList.toggle('dense', !!pref.dense);
    const denseToggle = $('#denseToggle');
    if (denseToggle){
      denseToggle.checked = !!pref.dense;
      denseToggle.addEventListener('change', (e) => {
        const on = !!e.target.checked;
        document.body.classList.toggle('dense', on);
        saveUIPrefs({ dense: on });
      });
    }

    const fontRange = $('#fontRange');
    const fontVal   = $('#fontRangeVal');
    const size = Number(pref.fontSize || 15);
    document.body.style.fontSize = size + 'px';
    if (fontRange) fontRange.value = String(size);
    if (fontVal)   fontVal.textContent = size + ' px';

    fontRange?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      document.body.style.fontSize = v + 'px';
      if (fontVal) fontVal.textContent = v + ' px';
    });
    fontRange?.addEventListener('change', (e) => {
      const v = Number(e.target.value);
      saveUIPrefs({ fontSize: v });
    });
  }

  // ===== BRANDING (nombre, lema, logo) =====

  const nameIn   = $('#brandName');
  const tagIn    = $('#brandTag');
  const logoIn   = $('#brandLogo');
  const logoImg  = $('#brandLogoImg');
  const msgEl    = $('#brandMsg');
  const rmBtn    = $('#brandRemoveLogo');

  async function loadBranding(){
    try{
      const b = await api('GET', '/api/admin/branding');
      nameIn.value = b?.name || '';
      tagIn.value  = b?.tag || '';
      if (b?.logo_url){
        logoImg.src = b.logo_url;
        logoImg.style.display = 'block';
      } else {
        logoImg.removeAttribute('src');
        logoImg.style.display = 'none';
      }
    }catch(e){
      setMsg(msgEl, e?.message || 'No se pudo cargar identidad', false);
    }
  }

  // Guardar nombre y lema (usa SOLO api(...) => no doble lectura de body)
  $('#brandForm')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    try{
      const data = await api('PUT', '/api/admin/branding', {
        name: nameIn.value.trim(),
        tag:  tagIn.value.trim()
      });
      setMsg(msgEl, data?.message || 'Guardado');
    }catch(err){
      setMsg(msgEl, err?.message || 'Error guardando', false);
    }
  });

  // Subir logo (usa SOLO api(...) con FormData)
  logoIn?.addEventListener('change', async ()=>{
    const f = logoIn.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('logo', f);
    try{
      const data = await api('POST', '/api/admin/branding/logo', fd, true);
      if (data?.logo_url){
        logoImg.src = data.logo_url;
        logoImg.style.display = 'block';
      }
      setMsg(msgEl, data?.message || 'Logo actualizado');
    }catch(err){
      setMsg(msgEl, err?.message || 'Error subiendo logo', false);
    }
  });

  // Quitar logo
  rmBtn?.addEventListener('click', async ()=>{
    try{
      const data = await api('DELETE', '/api/admin/branding/logo');
      logoImg.removeAttribute('src');
      logoImg.style.display = 'none';
      setMsg(msgEl, data?.message || 'Logo eliminado');
    }catch(err){
      setMsg(msgEl, err?.message || 'Error eliminando logo', false);
    }
  });

  // ===== Init =====
  renderSwatches();
  loadUIPanel();
  loadBranding();
})();
