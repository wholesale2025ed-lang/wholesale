async function loadStats() {
  try {
    const [products, categories, contacts] = await Promise.all([
      api('GET', '/api/products'),
      api('GET', '/api/categories'),
      api('GET', '/api/contacts')
    ]);
    $('#statProducts').textContent   = products.length;
    $('#statCategories').textContent = categories.length;
    $('#statContacts').textContent   = contacts.length;
  } catch (e) { console.error('stats', e); }
}

$('#refreshBtn')?.addEventListener('click', loadStats);
loadStats();
