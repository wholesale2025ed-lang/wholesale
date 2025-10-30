let CONTACTS = [];
const contactTbody = $('#contactTbody');
const contactEmpty = $('#contactEmpty');

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}

/* ===== Helpers de enlaces seguros ===== */
function normHttp(u){
  if (!u) return '';
  const t = String(u).trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t.replace(/^\/+/, '');
}
function waLink(phone){
  const raw = String(phone||'').replace(/[^\d+]/g,'');
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g,'');
  return `https://wa.me/${digits}`;
}
/* TikTok: acepta @usuario, usuario o URL completa */
function tkLink(u){
  if (!u) return '';
  let t = String(u).trim();
  if (!t) return '';
  if (t.startsWith('@')) t = t.slice(1);
  if (/^https?:\/\//i.test(t)) return t;
  if (!t.includes('/')) return `https://www.tiktok.com/@${t}`;
  return 'https://' + t.replace(/^\/+/, '');
}

/* ===== Cargar & Renderizar ===== */
async function loadContacts(){
  CONTACTS = await api('GET','/api/admin/contacts');
  renderContacts();
}

function renderContacts(){
  const rows = CONTACTS.map(c => {
    const wa = waLink(c.whatsapp);
    const fb = normHttp(c.facebook);
    const ig = normHttp(c.instagram);

    // 👇 toma la propiedad venga como venga
    const tkRaw = c.tiktok ?? c.tikTok ?? c.tik_tok ?? '';
    const tk = tkLink(tkRaw);

    const a = (href, label) =>
      href ? `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(label||href)}</a>` : '';

    return `
      <tr>
        <td>${wa ? a(wa, c.whatsapp) : escapeHtml(c.whatsapp||'')}</td>
        <td>${escapeHtml(c.phone||'')}</td>
        <td>${c.email ? a('mailto:'+c.email, c.email) : ''}</td>
        <td>${fb ? a(fb, 'Facebook') : ''}</td>
        <td>${ig ? a(ig, 'Instagram') : ''}</td>
        <td>${tk ? a(tk, 'TikTok') : ''}</td>
        <td>${escapeHtml(c.address||'')}</td>
        <td>${c.visible ? 'Sí' : 'No'}</td>
        <td class="right">
          <button class="btn btn-outline small" data-cedit="${c.id}">Editar</button>
          <button class="btn btn-outline small" data-cdel="${c.id}">Eliminar</button>
        </td>
      </tr>`;
  }).join('');

  contactTbody.innerHTML = rows || '';
  contactEmpty.hidden = !!rows;

  $$('[data-cedit]').forEach(b => b.onclick = () => fillContactForm(b.dataset.cedit));
  $$('[data-cdel]').forEach(b => b.onclick = () => deleteContact(b.dataset.cdel));
}

/* ===== Formulario ===== */
function fillContactForm(id){
  const c = CONTACTS.find(x => String(x.id) === String(id));
  if (!c) return;
  $('#contactFormTitle').textContent = 'Editar contacto';
  $('#contactSubmit').textContent = 'Actualizar';
  $('#contactId').value = c.id;
  $('#cWhatsapp').value = c.whatsapp || '';
  $('#cPhone').value    = c.phone || '';
  $('#cEmail').value    = c.email || '';
  $('#cFacebook').value = c.facebook || '';
  $('#cInstagram').value= c.instagram || '';
  $('#cTikTok').value   = (c.tiktok ?? c.tikTok ?? c.tik_tok ?? '') || '';
  $('#cAddress').value  = c.address || '';
  $('#cVisible').value  = c.visible ? '1' : '0';
}

$('#contactFormReset')?.addEventListener('click', () => {
  $('#contactForm').reset();
  $('#contactFormTitle').textContent = 'Agregar contacto';
  $('#contactSubmit').textContent = 'Guardar contacto';
  $('#contactId').value = '';
  $('#cVisible').value = '1';
});

$('#contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#contactId').value.trim();
  const payload = {
    whatsapp: $('#cWhatsapp').value.trim(),
    phone:    $('#cPhone').value.trim(),
    email:    $('#cEmail').value.trim(),
    facebook: $('#cFacebook').value.trim(),
    instagram:$('#cInstagram').value.trim(),
    tiktok:   $('#cTikTok').value.trim(),
    address:  $('#cAddress').value.trim(),
    visible:  Number($('#cVisible').value)
  };
  try{
    if (id) await api('PUT', `/api/admin/contacts/${id}`, payload);
    else     await api('POST','/api/admin/contacts', payload);
    await loadContacts();
    $('#contactFormReset').click();
  }catch(e){ alert('No se pudo guardar el contacto'); console.error(e); }
});

async function deleteContact(id){
  if (!confirm('¿Eliminar contacto?')) return;
  try{
    await api('DELETE', `/api/admin/contacts/${id}`);
    CONTACTS = CONTACTS.filter(c => String(c.id)!==String(id));
    renderContacts();
  }catch(e){ alert('No se pudo eliminar'); console.error(e); }
}

$('#refreshBtn')?.addEventListener('click', loadContacts);
loadContacts();
