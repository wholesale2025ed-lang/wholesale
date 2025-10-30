// ===== public/js/admin-productos.js =====
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  async function api(method, url, data, isForm = false) {
    const opts = { method, headers: {} };
    if (data) {
      if (isForm) opts.body = data;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    }
    const res = await fetch(url, opts);
    const ct  = res.headers.get('content-type') || '';
    const txt = await res.text();
    if (!res.ok) {
      let msg = '';
      if (ct.includes('application/json')) {
        try{ msg = (JSON.parse(txt).error)||''; }catch{}
      }
      throw new Error(msg || txt || `HTTP ${res.status}`);
    }
    return ct.includes('application/json') ? (txt ? JSON.parse(txt) : {}) : txt;
  }

  /* ====== DOM ====== */
  const form         = $('#productForm');
  const titleIn      = $('#prodTitle');
  const descIn       = $('#prodDesc');
  const priceIn      = $('#prodPrice');
  const catSel       = $('#prodCat');
  const previewWrap  = $('#prodPreview');
  const submitBtn    = $('#productSubmit');
  const resetBtn     = $('#productFormReset');
  const idIn         = $('#prodId');
  const tblBody      = $('#prodTbody');
  const tblEmpty     = $('#prodEmpty');
  const searchIn     = $('#prodSearch');
  const formTitle    = $('#productFormTitle');

  // los 5 inputs que ya tienes en productos.html
  const fileInputs = ['#img1','#img2','#img3','#img4','#img5'].map(s => $(s));

  let CATS = [];
  let PRODUCTS = [];
  let EDITING = null;         // id producto en edición
  let EXISTING = [];          // [{id, url}]

  function money(n){
    return new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ'}).format(Number(n||0));
  }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  /* ====== CATEGORÍAS ====== */
  async function loadCats(){
    CATS = await api('GET','/api/categories');
    catSel.innerHTML = `<option value="">Sin categoría</option>` +
      CATS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  $('#btnAddCat')?.addEventListener('click', async ()=>{
    const name = prompt('Nombre de la nueva categoría:')?.trim();
    if (!name) return;
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const c = await api('POST','/api/categories',{name,slug});
    await loadCats();
    catSel.value = c.id;
  });
  $('#btnDelCat')?.addEventListener('click', async ()=>{
    const id = Number(catSel.value||0); if (!id) return alert('Selecciona una categoría');
    if (!confirm('¿Eliminar la categoría seleccionada? (los productos quedan sin categoría)')) return;
    await api('DELETE',`/api/categories/${id}`);
    await loadCats();
    catSel.value = '';
  });

  /* ====== LISTA ====== */
  async function loadProducts(){
    PRODUCTS = await api('GET','/api/products');
    renderTable();
  }
  function renderTable(){
    const q = (searchIn.value||'').trim().toLowerCase();
    const view = PRODUCTS.filter(p =>
      !q || p.title.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)
    );
    tblBody.innerHTML = view.map(p=>
      `<tr>
        <td><img class="thumb" src="${p.image_url||''}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #263547"/></td>
        <td>${p.title}</td>
        <td class="truncate">${escapeHtml(p.description||'')}</td>
        <td>${escapeHtml(p.category||'')}</td>
        <td class="right">${money(p.price)}</td>
        <td class="right">
          <button class="btn-outline small" data-act="edit" data-id="${p.id}">Editar</button>
          <button class="btn-danger small" data-act="del" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>`
    ).join('');

    tblEmpty.hidden = view.length > 0;

    $$('button[data-act="edit"]', tblBody).forEach(b => b.onclick = ()=> startEdit(b.dataset.id));
    $$('button[data-act="del"]', tblBody).forEach(b => b.onclick = ()=> removeProduct(b.dataset.id));
  }
  searchIn?.addEventListener('input', renderTable);

  /* ====== PREVIEW ====== */
  function renderPreview(){
    const newFiles = fileInputs.map(i => i.files?.[0]).filter(Boolean);
    previewWrap.innerHTML = (newFiles.length || EXISTING.length) ? '' : '<div class="ph">Sin imágenes</div>';

    // --- existentes (BD o legado) ---
    EXISTING.forEach(img => {
      const box = document.createElement('div'); box.className='thumb';
      box.innerHTML = `<img src="${img.url}" alt=""><button class="rm" type="button" title="Quitar">✕</button>`;
      box.querySelector('.rm').onclick = async () => {
        if (!EDITING) return;
        if (!confirm('¿Quitar esta imagen?')) return;
        try{
          if (img.id && img.id > 0) {
            await api('DELETE', `/api/admin/products/${EDITING}/images/${img.id}`);
          } else if (img.url) {
            const u = encodeURIComponent(img.url);
            await api('DELETE', `/api/admin/products/${EDITING}/images?url=${u}`);
          }
          EXISTING = EXISTING.filter(x => x !== img);
          renderPreview();
          renderInputHints(); // 👈 también actualizamos los rótulos
        }catch(e){ alert(e.message||'Error eliminando imagen'); }
      };
      previewWrap.appendChild(box);
    });

    // --- nuevas (inputs) ---
    fileInputs.forEach(inp => {
      const f = inp.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const box = document.createElement('div'); box.className='thumb';
      box.innerHTML = `<img src="${url}" alt=""><button class="rm" type="button" title="Quitar">✕</button>`;
      box.querySelector('.rm').onclick = () => {
        inp.value = '';
        renderPreview();
        renderInputHints();
      };
      previewWrap.appendChild(box);
    });
  }
  fileInputs.forEach(inp => inp?.addEventListener('change', () => {
    renderPreview();
    renderInputHints();
  }));

  // ====== NUEVO: poner “Imagen guardada X” al lado del input file ======
  function renderInputHints(){
    // quitamos los anteriores
    fileInputs.forEach(inp => {
      const next = inp.nextElementSibling;
      if (next && next.classList && next.classList.contains('img-hint')) {
        next.remove();
      }
    });
    // ponemos nuevos según EXISTING
    for (let i = 0; i < fileInputs.length; i++){
      if (EXISTING[i]){
        const span = document.createElement('span');
        span.className = 'img-hint';
        span.textContent = `Imagen guardada ${i+1}`;
        span.style.color = '#9aa9c2';
        span.style.fontSize = '12px';
        span.style.display = 'inline-block';
        span.style.marginLeft = '6px';
        fileInputs[i].insertAdjacentElement('afterend', span);
      }
    }
  }

  /* ====== CRUD ====== */
  function resetForm(){
    EDITING = null;
    idIn.value = '';
    formTitle.textContent = 'Agregar Producto';
    submitBtn.textContent = 'Añadir producto';
    form.reset();
    fileInputs.forEach(i => i.value = '');
    EXISTING = [];
    renderPreview();
    renderInputHints();
  }
  resetBtn?.addEventListener('click', resetForm);

  async function startEdit(id){
    const p = PRODUCTS.find(x=>String(x.id)===String(id));
    if (!p) return;
    EDITING = p.id;
    idIn.value = p.id;
    formTitle.textContent = `Editar: ${p.title}`;
    submitBtn.textContent = 'Guardar cambios';

    titleIn.value = p.title;
    descIn.value  = p.description || '';
    priceIn.value = p.price;
    await loadCats();
    if (p.category_id) catSel.value = String(p.category_id); else catSel.value = '';

    // vaciamos los inputs file
    fileInputs.forEach(i => i.value = '');

    // pedimos el detalle con la galería
    const full = await api('GET', `/api/products/${p.id}`);

    // full.images viene como [{id,url}]
    const imgs = Array.isArray(full.images) ? full.images : [];
    EXISTING = imgs.map(x => ({ id: Number(x.id)||0, url: String(x.url||'') }));

    renderPreview();
    renderInputHints();  // 👈 aquí ponemos los nombres de “Imagen guardada X”
  }

  async function removeProduct(id){
    if (!confirm('¿Eliminar este producto y todas sus imágenes?')) return;
    await api('DELETE', `/api/admin/products/${id}`);
    await loadProducts();
    if (EDITING && Number(EDITING)===Number(id)) resetForm();
  }

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    try{
      const fd = new FormData();
      fd.append('title', titleIn.value.trim());
      fd.append('description', descIn.value.trim());
      fd.append('price', priceIn.value || '0');
      if (catSel.value) fd.append('category_id', catSel.value);

      // adjuntar máximo 5 (uno por input)
      fileInputs.forEach(inp => {
        const f = inp.files?.[0];
        if (f) fd.append('images', f);
      });

      submitBtn.disabled = true;

      if (!EDITING){
        await api('POST','/api/admin/products', fd, true);
        alert('Producto creado');
      }else{
        await api('PUT', `/api/admin/products/${EDITING}`, fd, true);
        alert('Producto actualizado');
      }

      await loadProducts();
      resetForm();
    }catch(err){
      alert(err.message||'Error');
      console.error(err);
    }finally{
      submitBtn.disabled = false;
    }
  });

  /* ====== INIT ====== */
  (async function(){
    await loadCats();
    await loadProducts();
    renderPreview();
    renderInputHints();
  })();
})();
