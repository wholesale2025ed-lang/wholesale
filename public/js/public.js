// ===== public/js/public.js =====

// Util
async function fetchJSON(u){
  const r = await fetch(u);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let PRODUCTS   = [];
let CATS       = [];
let ACTIVE_CAT = '';
let CONTACTS   = [];

const qEl    = $('#q');
const qBtn   = $('#qBtn');
const catsEl = $('#cats');
const gridEl = $('#grid');

// ========= BRANDING =========
async function loadBranding(){
  try{
    const b = await fetchJSON('/api/branding');
    const name = b?.name     || 'Wholesale.com';
    const tag  = b?.tag      || '✓ Compras seguras';
    const logo = b?.logo_url || '/img/logo.jpg';

    const nameEl  = document.querySelector('.brand-name');
    const logoEl  = document.querySelector('.brand .logo-img');
    const promoEl = document.querySelector('.promos span');

    if (nameEl)  nameEl.textContent = name;
    if (promoEl) promoEl.textContent = tag;
    if (logoEl)  logoEl.src = logo;

    // Footer branding
    $('#footerLogo')?.setAttribute('src', logo);
    $('#footerName') && ($('#footerName').textContent = name);
    $('#footerNameCopy') && ($('#footerNameCopy').textContent = name);
  }catch{}
}

// ========= Categorías =========
function renderCats(){
  const tabs = [{slug:'', name:'Todos'}, ...CATS].map(c => {
    const active = (ACTIVE_CAT === (c.slug||'')) ? 'active' : '';
    return `<button class="tab ${active}" data-slug="${c.slug||''}">${c.name}</button>`;
  }).join('');
  catsEl.innerHTML = tabs;

  catsEl.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      ACTIVE_CAT = t.dataset.slug || '';
      loadProducts();
      catsEl.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
    };
  });
}

// ========= Tarjetas =========
function money(n){
  return new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ'}).format(Number(n||0));
}

function renderGrid(){
  const q = (qEl.value||'').trim().toLowerCase();
  const view = PRODUCTS.filter(p =>
    !q || p.title.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)
  );

  gridEl.innerHTML = view.map(p => `
    <article class="pcard" data-id="${p.id}">
      <img class="pimg" loading="lazy" src="${p.image_url || ''}" alt="">
      <div class="pbody">
        <div class="ptitle">${p.title}</div>
        <div class="pcat">${p.category||''}</div>
        <div class="pprice">${money(p.price)}</div>
      </div>
    </article>
  `).join('');

  $$('.pcard').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.id)));
}

// ========= Modal detalle =========
const modal      = $('#modal');
const mdClose    = $('#mdClose');
const mdBackdrop = $('#modalBackdrop');

function waLinkWithFallback(){
  const c = CONTACTS.find(x => x.visible && x.whatsapp);
  if (!c) return '';
  const digits = String(c.whatsapp).replace(/[^\d]/g,'');
  return digits ? `https://wa.me/${digits}` : '';
}

async function openDetail(id){
  // Carga el DETALLE con galería
  const p = await fetchJSON(`/api/products/${id}`);

  // Normalizamos a SOLO URLs
  const gallery = Array.isArray(p.images) && p.images.length
    ? p.images.map(img => (typeof img === 'string') ? img : (img.url || ''))
    : (p.image_url ? [p.image_url] : []);

  $('#mdImg').src            = gallery[0] || '';
  $('#mdTitle').textContent  = p.title || '';
  $('#mdCat').textContent    = p.category || '';
  $('#mdPrice').textContent  = money(p.price);
  $('#mdDesc').textContent   = p.description || 'Sin descripción.';

  // Render miniaturas
  const thumbs = $('#mdThumbs');
  thumbs.innerHTML = gallery.map((u,i)=>
    `<button type="button" data-i="${i}" ${i===0?'aria-current="true"':''}><img src="${u}" alt=""></button>`
  ).join('');
  thumbs.querySelectorAll('button').forEach(btn=>{
    btn.onclick = ()=>{
      const i = Number(btn.dataset.i);
      $('#mdImg').src = gallery[i] || '';
      thumbs.querySelectorAll('button').forEach(b=>b.removeAttribute('aria-current'));
      btn.setAttribute('aria-current','true');
    };
  });

  const wa = waLinkWithFallback();
  const text = encodeURIComponent(
    `¡Hola!\n\nEstoy interesado(a) en “${p.title}” (${money(p.price)}). ` +
    `¿Disponibilidad, tiempo de entrega, formas de pago y garantía?`
  );
  const href = wa ? `${wa}?text=${text}` : '#';
  const a = $('#mdWhats');
  a.href      = href;
  a.target    = wa ? '_blank' : '';
  a.rel       = wa ? 'noopener' : '';
  a.textContent = 'Contactar por WhatsApp';

  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}

function closeDetail(){
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

mdClose?.addEventListener('click', closeDetail);
mdBackdrop?.addEventListener('click', closeDetail);
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDetail(); });

// ========= Contactos (carga y toggle) =========
function renderContacts(list){
  $('#contactsList').innerHTML = list.filter(c=>c.visible).map(c => {
    const norm = u => u ? (/^https?:\/\//i.test(u)?u:`https://${String(u).replace(/^\/+/,'')}`) : '';
    const wa   = c.whatsapp ? `https://wa.me/${String(c.whatsapp).replace(/[^\d]/g,'')}` : '';
    const ig   = norm(c.instagram);
    const fb   = norm(c.facebook);
    const tk   = norm(c.tiktok);
    return `
      <div class="citem">
        <div class="craw">
          <img class="ico" src="/img/whatsapp.png" alt="WhatsApp">
          <b>WhatsApp:</b>&nbsp; ${c.whatsapp ? `<a href="${wa}" target="_blank" rel="noopener">${c.whatsapp}</a>` : '—'}
        </div>
        <div class="crow">
          <img class="ico" src="/img/telefono.png" alt="Teléfono">
          <b>Teléfono:</b>&nbsp; ${c.phone ? `<a href="tel:${String(c.phone).replace(/[^\d+]/g,'')}">${c.phone}</a>` : '—'}
        </div>
        <div class="crow">
          <img class="ico" src="/img/correo.png" alt="Email">
          <b>Email:</b>&nbsp; ${c.email ? `<a href="mailto:${c.email}">${c.email}</a>` : '—'}
        </div>
        <div class="craw">
          <img class="ico" src="/img/dirección.png" alt="Dirección">
          <b>Dirección:</b>&nbsp; ${c.address || '—'}
        </div>
        <div class="crow">
          ${fb ? `<a class="social" href="${fb}" target="_blank" rel="noopener"><img class="ico" src="/img/facebook.jpg" alt="Facebook"><span>Facebook</span></a>` : ''}
          ${ig ? `<a class="social" href="${ig}" target="_blank" rel="noopener"><img class="ico" src="/img/instagram.png" alt="Instagram"><span>Instagram</span></a>` : ''}
          ${tk ? `<a class="social" href="${tk}" target="_blank" rel="noopener"><img class="ico" src="/img/tiktok.png" alt="TikTok"><span>TikTok</span></a>` : ''}
        </div>
      </div>`;
  }).join('');
}

// Toggle accesible con animación de altura
function setupContactsToggle(){
  const btn = $('#contactToggle');
  const panel = $('#contactos');
  if (!btn || !panel) return;

  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    const chev = btn.querySelector('.chev');
    chev && (chev.textContent = open ? '▴' : '▾');

    if (open){
      panel.hidden = false;
      // Medimos altura y aplicamos transición
      const h = panel.scrollHeight;
      panel.style.maxHeight = h + 'px';
      panel.classList.add('open');
      // Scroll suave hacia la sección
      panel.scrollIntoView({behavior:'smooth', block:'start'});
    }else{
      panel.style.maxHeight = panel.scrollHeight + 'px'; // fijamos base
      requestAnimationFrame(()=>{
        panel.classList.remove('open');
        panel.style.maxHeight = '0px';
      });
      // ocultar tras la transición
      setTimeout(()=>{ panel.hidden = true; }, 350);
    }
  };

  btn.addEventListener('click', ()=>{
    const open = btn.getAttribute('aria-expanded') === 'true';
    setOpen(!open);
  });
}

async function loadProducts(){
  const url = '/api/products' + (ACTIVE_CAT ? `?category=${encodeURIComponent(ACTIVE_CAT)}` : '');
  PRODUCTS = await fetchJSON(url);
  renderGrid();
}

async function boot(){
  await loadBranding();
  CATS = await fetchJSON('/api/categories'); renderCats();
  await loadProducts();

  // Contactos
  CONTACTS = await fetchJSON('/api/contacts');
  renderContacts(CONTACTS);
  setupContactsToggle();

  // Footer: año actual
  const y = new Date().getFullYear();
  $('#yearNow') && ($('#yearNow').textContent = y);
}

qEl?.addEventListener('input', renderGrid);
qBtn?.addEventListener('click', renderGrid);
boot();
