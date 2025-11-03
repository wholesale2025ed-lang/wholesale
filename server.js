// ===== server.js (BLOB en MySQL) =====
require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const path       = require('path');
const fs         = require('fs');           // (queda por compatibilidad con otros módulos)
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const multer     = require('multer');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');

const app = express();

/* ========= NUEVO: confiar en proxy y helpers de entorno ========= */
app.enable('trust proxy'); // necesario detrás de Render/Proxies
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

/* ======================= DB ======================= */
const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'tienda',
  port:     Number(process.env.DB_PORT || 3306),
  connectionLimit: 10
});

/* ===== helper para agregar columna solo si no existe (para MySQL < 8) ===== */
async function ensureColumn(conn, table, column, ddl){
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (!rows.length){
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// crea tablas mínimas (incluye brand_settings y product_images)
async function ensureSchema(){
  const conn = await pool.getConnection();
  try{
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100),
        email VARCHAR(150) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_temp TINYINT DEFAULT 0,
        reset_token VARCHAR(100),
        reset_expires DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        slug VARCHAR(140) NOT NULL UNIQUE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_url VARCHAR(255),
        category_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        whatsapp VARCHAR(32),
        phone VARCHAR(32),
        email VARCHAR(120),
        facebook VARCHAR(200),
        instagram VARCHAR(200),
        tiktok VARCHAR(200),
        address VARCHAR(200),
        visible TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // tabla base del branding
    await conn.query(`
      CREATE TABLE IF NOT EXISTS brand_settings (
        id TINYINT PRIMARY KEY,
        brand_name VARCHAR(150),
        tagline VARCHAR(200),
        logo_url VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // columnas nuevas SOLO si no existen
    await ensureColumn(conn, 'brand_settings', 'logo_mime', 'logo_mime VARCHAR(100) NULL');
    await ensureColumn(conn, 'brand_settings', 'logo_data', 'logo_data LONGBLOB NULL');

    // registro por defecto
    const [b] = await conn.query(`SELECT id FROM brand_settings WHERE id=1`);
    if (!b.length){
      await conn.query(`
        INSERT INTO brand_settings (id, brand_name, tagline, logo_url, logo_mime, logo_data)
        VALUES (1,'Wholesale.com','✓ Compras seguras',NULL,NULL,NULL)
      `);
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        image_url VARCHAR(255),
        mime VARCHAR(100),
        data LONGBLOB,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } finally {
    conn.release();
  }
}
ensureSchema().catch(e=>console.error('[ensureSchema]', e));

/* =================== Helpers =================== */
function slugify(str=''){
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}
function fileExists(p){ try{ return fs.existsSync(p); }catch{ return false; } }

/* ======== NUEVO: redirecciones de HTTPS y dominio canónico ======== */
/* Colocado antes de middlewares/estáticos para que redirija lo más pronto posible */
if (IS_PROD) {
  // 1) Forzar HTTPS
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });

  // 2) Redirigir apex → www (ventasedc.com => www.ventasedc.com)
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!host.startsWith('www.') && /^ventasedc\.com(?::\d+)?$/i.test(host)) {
      return res.redirect(301, `https://www.ventasedc.com${req.originalUrl}`);
    }
    next();
  });
}

/* ================= Middlewares ================ */
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // ===== NUEVO: segura solo en producción (para que funcione en localhost) =====
    secure: IS_PROD,
    sameSite: 'lax'
  }
}));

/* ================= Static files ================= */
app.use(express.static(path.join(__dirname, 'public')));

/* ================== Uploads (MEMORIA) =================== */
const storage = multer.memoryStorage();     // <— AHORA EN MEMORIA
const upload  = multer({ storage });

/* ================== SMTP =================== */
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
transport.verify(err => {
  if (err) console.error('SMTP verify error:', err);
  else console.log('SMTP ready');
});
async function sendMail({ to, subject, html }){
  return transport.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@wholesale.test',
    to, subject, html
  });
}

/* =================== Guards =================== */
function isAuth(req,res,next){
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'No autorizado' });
}

/* ===================== AUTH ===================== */
app.post('/api/auth/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email=?',[email]);
    if (!rows.length) return res.status(401).json({ error:'Correo o contraseña inválidos' });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error:'Correo o contraseña inválidos' });
    req.session.user = { id:u.id, email:u.email, username:u.username, is_temp:u.is_temp };
    res.json({ message:'Login ok', needChange: !!u.is_temp });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error en login' }); }
});

app.post('/api/auth/change-password', async (req,res)=>{
  try{
    if (!req.session?.user) return res.status(401).json({ error:'No autorizado' });
    const { current, next } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE id=?', [req.session.user.id]);
    if (!rows.length) return res.status(401).json({ error:'No autorizado' });
    const u = rows[0];
    const ok = await bcrypt.compare(current||'', u.password_hash);
    if (!ok) return res.status(400).json({ error:'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(next, 10);
    await pool.query(
      'UPDATE users SET password_hash=?, is_temp=0, reset_token=NULL, reset_expires=NULL WHERE id=?',
      [hash, u.id]
    );
    req.session.user.is_temp = 0;
    res.json({ message:'Contraseña actualizada' });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error cambiando contraseña' }); }
});

app.post('/api/auth/forgot', async (req,res)=>{
  try{
    const { email } = req.body;
    const [rows] = await pool.query('SELECT id,email FROM users WHERE email=?',[email]);
    if (!rows.length) return res.json({ message:'Si el correo existe, enviaremos un enlace' });

    const u = rows[0];
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000*60*60);
    await pool.query('UPDATE users SET reset_token=?, reset_expires=? WHERE id=?', [token, expires, u.id]);

    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const link = `${base}/reset.html?token=${token}`;

    await sendMail({
      to: u.email,
      subject: 'Restablecer contraseña - Mi Tienda',
      html: `<p>Enlace válido 1 hora:</p><p><a href="${link}">${link}</a></p>`
    });
    res.json({ message:'Si el correo existe, enviaremos un enlace' });
  }catch(e){ console.error('[FORGOT]', e); res.status(500).json({ error:'Error enviando reset' }); }
});

app.post('/api/auth/reset', async (req,res)=>{
  try{
    const { token, next } = req.body;
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE reset_token=? AND reset_expires > NOW()', [token]
    );
    if (!rows.length) return res.status(400).json({ error:'Token inválido o expirado' });
    const id = rows[0].id;
    const hash = await bcrypt.hash(next, 10);
    await pool.query(
      'UPDATE users SET password_hash=?, is_temp=0, reset_token=NULL, reset_expires=NULL WHERE id=?',
      [hash, id]
    );
    res.json({ message:'Contraseña restablecida' });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error en reset' }); }
});

app.post('/api/auth/logout', (req,res)=>{
  req.session.destroy(()=> res.json({ message:'Logout ok' }));
});

/* =============== API pública =============== */

// Lista (opcional por categoría)
app.get('/api/products', async (req,res)=>{
  try{
    const { category } = req.query;
    let sql = `
      SELECT p.id, p.title, p.description, p.price, p.image_url,
             c.id AS category_id, c.name AS category, c.slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    const args = [];
    if (category){ sql += ' WHERE c.slug=?'; args.push(category); }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  }catch(e){ console.error(e); res.status(500).json({ error:'Error listando productos' }); }
});

// Detalle con galería
app.get('/api/products/:id', async (req,res)=>{
  try{
    const id = Number(req.params.id);
    const [[p]] = await pool.query(
      `SELECT p.id, p.title, p.description, p.price, p.image_url,
              c.id AS category_id, c.name AS category, c.slug
       FROM products p
       LEFT JOIN categories c ON p.category_id=c.id
       WHERE p.id=?`, [id]);
    if (!p) return res.status(404).json({ error:'No encontrado' });

    const [imgs] = await pool.query(
      'SELECT id, image_url, CHAR_LENGTH(data) AS has_blob, sort_order FROM product_images WHERE product_id=? ORDER BY sort_order,id',
      [id]
    );

    p.images = imgs.map(x => ({
      id: x.id,
      url: (x.has_blob && x.has_blob > 0) ? `/api/images/${x.id}` : (x.image_url || '')
    }));

    res.json(p);
  }catch(e){ console.error(e); res.status(500).json({ error:'Error leyendo producto' }); }
});

// Categorías
app.get('/api/categories', async (_req,res)=>{
  try{
    const [rows] = await pool.query('SELECT id,name,slug FROM categories ORDER BY name');
    res.json(rows);
  }catch(e){ console.error(e); res.status(500).json({ error:'Error listando categorías' }); }
});

// Contactos visibles (página pública)
app.get('/api/contacts', async (_req,res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM contacts WHERE visible=1 ORDER BY created_at DESC');
    res.json(rows);
  }catch(e){ console.error(e); res.status(500).json({ error:'Error listando contactos' }); }
});

// Branding público
app.get('/api/branding', async (_req,res)=>{
  try{
    const [rows] = await pool.query('SELECT brand_name, tagline, logo_url, logo_mime, CHAR_LENGTH(logo_data) AS has_blob FROM brand_settings WHERE id=1');
    const row = rows[0] || {};
    const hasBlob = row.has_blob && row.has_blob > 0;
    res.json({
      name: row.brand_name || 'Wholesale.com',
      tag:  row.tagline    || '✓ Compras seguras',
      logo_url: hasBlob ? `/api/branding/logo?t=${Date.now()}` : (row.logo_url || null)
    });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error leyendo branding' }); }
});

/* ============== API admin (protegida) ============== */

// ====== CONTACTOS (admin) ======
app.get('/api/admin/contacts', isAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, whatsapp, phone, email, facebook, instagram, tiktok, address, visible FROM contacts ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (e) {
    console.error('[CONTACTS LIST]', e);
    res.status(500).json({ error: 'Error listando contactos' });
  }
});

app.post('/api/admin/contacts', isAuth, async (req, res) => {
  try {
    const {
      whatsapp = '',
      phone = '',
      email = '',
      facebook = '',
      instagram = '',
      tiktok = '',
      address = '',
      visible = 1
    } = req.body;

    const [r] = await pool.query(
      `INSERT INTO contacts
       (whatsapp, phone, email, facebook, instagram, tiktok, address, visible)
       VALUES (?,?,?,?,?,?,?,?)`,
      [whatsapp, phone, email, facebook, instagram, tiktok, address, Number(visible) ? 1 : 0]
    );

    res.json({ id: r.insertId, message: 'Contacto creado' });
  } catch (e) {
    console.error('[CONTACTS CREATE]', e);
    res.status(500).json({ error: 'Error creando contacto' });
  }
});

app.put('/api/admin/contacts/:id', isAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      whatsapp = '',
      phone = '',
      email = '',
      facebook = '',
      instagram = '',
      tiktok = '',
      address = '',
      visible = 1
    } = req.body;

    const [r] = await pool.query(
      `UPDATE contacts
       SET whatsapp=?, phone=?, email=?, facebook=?, instagram=?, tiktok=?, address=?, visible=?
       WHERE id=?`,
      [whatsapp, phone, email, facebook, instagram, tiktok, address, Number(visible) ? 1 : 0, id]
    );

    if (!r.affectedRows) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    res.json({ message: 'Contacto actualizado' });
  } catch (e) {
    console.error('[CONTACTS UPDATE]', e);
    res.status(500).json({ error: 'Error actualizando contacto' });
  }
});

app.delete('/api/admin/contacts/:id', isAuth, async (req,res)=>{
  try{
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM contacts WHERE id=?', [id]);
    if (!r.affectedRows) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json({ message: 'Contacto eliminado' });
  } catch (e) {
    console.error('[CONTACTS DELETE]', e);
    res.status(500).json({ error: 'Error eliminando contacto' });
  }
});

// ===== Categorías (crear) =====
app.post('/api/categories', isAuth, async (req,res)=>{
  try{
    const { name, slug } = req.body;
    if (!name || !slug) return res.status(400).json({ error:'name y slug requeridos' });
    const [r] = await pool.query('INSERT INTO categories (name, slug) VALUES (?,?)',[name,slug]);
    res.json({ id:r.insertId, name, slug });
  }catch(e){
    if (e.code === 'ER_DUP_ENTRY'){
      const [rows] = await pool.query('SELECT id,name,slug FROM categories WHERE slug=?',[req.body.slug]);
      if (rows.length) return res.json(rows[0]);
    }
    console.error(e);
    res.status(500).json({ error:'Error creando categoría' });
  }
});

// ===== Categorías (eliminar) =====
app.delete('/api/categories/:id', isAuth, async (req,res)=>{
  try{
    const id = Number(req.params.id);
    await pool.query('UPDATE products SET category_id=NULL WHERE category_id=?',[id]);
    const [r] = await pool.query('DELETE FROM categories WHERE id=?',[id]);
    if (!r.affectedRows) return res.status(404).json({ error:'Categoría no encontrada' });
    res.json({ message:'Categoría eliminada' });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error eliminando categoría' }); }
});

// ======= PRODUCTOS con galería (hasta 5 imágenes en BLOB) =======

// helper: inserta BLOB y devuelve id
async function insertImageBlob(conn, productId, file, order){
  const mime = file.mimetype || 'image/jpeg';
  const data = file.buffer || null;
  const [r] = await conn.query(
    'INSERT INTO product_images (product_id, mime, data, sort_order) VALUES (?,?,?,?)',
    [productId, mime, data, order]
  );
  return r.insertId;
}

// Crear producto
app.post('/api/admin/products', isAuth, upload.array('images', 5), async (req,res)=>{
  const conn = await pool.getConnection();
  try{
    const { title, description, price } = req.body;

    let { category_id } = req.body;
    let catId = null;
    if (category_id !== undefined && category_id !== null && String(category_id).trim() !== ''){
      const parsed = Number(category_id);
      catId = Number.isFinite(parsed) ? parsed : null;
    }

    const priceNum = Number(price);
    if (!title || !Number.isFinite(priceNum)){
      return res.status(400).json({ error:'Título y precio son obligatorios' });
    }

    await conn.beginTransaction();

    const [r] = await conn.query(
      'INSERT INTO products (title,description,price,image_url,category_id) VALUES (?,?,?,?,?)',
      [title, description || null, priceNum, null, catId]
    );
    const pid = r.insertId;

    const files = Array.isArray(req.files) ? req.files.slice(0,5) : [];
    let coverUrl = null;
    for (let i=0;i<files.length;i++){
      const imgId = await insertImageBlob(conn, pid, files[i], i);
      if (!coverUrl) coverUrl = `/api/images/${imgId}`;
    }
    if (coverUrl){
      await conn.query('UPDATE products SET image_url=? WHERE id=?',[coverUrl, pid]);
    }

    await conn.commit();
    res.json({ id: pid, image_url: coverUrl });
  }catch(e){
    try{ await conn.rollback(); }catch{}
    console.error('[PRODUCT CREATE]', e);
    res.status(500).json({ error:'Error creando producto' });
  }finally{
    conn.release();
  }
});

// Actualizar producto
app.put('/api/admin/products/:id', isAuth, upload.array('images', 5), async (req,res)=>{
  const conn = await pool.getConnection();
  try{
    const id = Number(req.params.id);
    const { title, description, price } = req.body;

    let { category_id } = req.body;
    let catId = null;
    if (category_id !== undefined && category_id !== null && String(category_id).trim() !== ''){
      const parsed = Number(category_id);
      catId = Number.isFinite(parsed) ? parsed : null;
    }

    const priceNum = Number(price);
    if (!title || !Number.isFinite(priceNum)){
      return res.status(400).json({ error:'Título y precio son obligatorios' });
    }

    await conn.beginTransaction();
    await conn.query(
      'UPDATE products SET title=?, description=?, price=?, category_id=? WHERE id=?',
      [title, description || null, priceNum, catId, id]
    );

    const files = Array.isArray(req.files) ? req.files.slice(0,5) : [];
    let newCover = null;

    if (files.length){
      // calcular sort_order siguiente
      const [[m]] = await conn.query('SELECT COALESCE(MAX(sort_order),-1) AS m FROM product_images WHERE product_id=?',[id]);
      let order = Number(m?.m ?? -1) + 1;

      for (let i=0;i<files.length;i++){
        const imgId = await insertImageBlob(conn, id, files[i], order++);
        if (!newCover){
          // si no tiene portada, poner esta
          const [[prod]] = await conn.query('SELECT image_url FROM products WHERE id=?',[id]);
          if (!prod?.image_url) newCover = `/api/images/${imgId}`;
        }
      }
      if (newCover){
        await conn.query('UPDATE products SET image_url=? WHERE id=?',[newCover, id]);
      }
    }

    await conn.commit();
    res.json({ message:'Producto actualizado' });
  }catch(e){
    try{ await conn.rollback(); }catch{}
    console.error('[PRODUCT UPDATE]', e);
    res.status(500).json({ error:'Error actualizando producto' });
  }finally{
    conn.release();
  }
});

// Eliminar una imagen por ID
app.delete('/api/admin/products/:id/images/:imgId', isAuth, async (req,res)=>{
  try{
    const { id, imgId } = req.params;

    const [[img]] = await pool.query(
      'SELECT id, image_url FROM product_images WHERE id=? AND product_id=?',
      [imgId, id]
    );
    if (!img) return res.status(404).json({ error:'Imagen no encontrada' });

    await pool.query('DELETE FROM product_images WHERE id=?',[imgId]);

    if (img.image_url && /^\/uploads\//.test(img.image_url)){
      const p = path.join(__dirname,'public', img.image_url.replace(/^\//,''));
      try{ if (fs.existsSync(p)) fs.unlinkSync(p); }catch{}
    }

    const [[prod]] = await pool.query('SELECT image_url FROM products WHERE id=?',[id]);
    if (prod?.image_url === `/api/images/${imgId}` || prod?.image_url === img.image_url){
      const [[nextImg]] = await pool.query(
        'SELECT id, image_url, CHAR_LENGTH(data) AS has_blob FROM product_images WHERE product_id=? ORDER BY sort_order,id LIMIT 1',
        [id]
      );
      const nextUrl = nextImg ? (nextImg.has_blob ? `/api/images/${nextImg.id}` : (nextImg.image_url||null)) : null;
      await pool.query('UPDATE products SET image_url=? WHERE id=?',[nextUrl, id]);
    }

    res.json({ message:'Imagen eliminada' });
  }catch(e){ console.error('[IMG DELETE]', e); res.status(500).json({ error:'Error eliminando imagen' }); }
});

// Eliminar una imagen por URL
app.delete('/api/admin/products/:id/images', isAuth, async (req,res)=>{
  try{
    const productId = Number(req.params.id);
    const url = String(req.query.url || '').trim();
    if (!productId || !url) return res.status(400).json({ error:'Parámetros inválidos' });

    const [[img]] = await pool.query(
      'SELECT id, image_url FROM product_images WHERE product_id=? AND image_url=? LIMIT 1',
      [productId, url]
    );
    if (!img) return res.status(404).json({ error:'Imagen no encontrada' });

    await pool.query('DELETE FROM product_images WHERE id=?',[img.id]);

    if (img.image_url && /^\/uploads\//.test(img.image_url)){
      const p = path.join(__dirname,'public', img.image_url.replace(/^\//,''));
      try{ if (fs.existsSync(p)) fs.unlinkSync(p); }catch{}
    }

    const [[prod]] = await pool.query('SELECT image_url FROM products WHERE id=?',[productId]);
    if (prod?.image_url === img.image_url){
      const [[nextImg]] = await pool.query(
        'SELECT id, image_url, CHAR_LENGTH(data) AS has_blob FROM product_images WHERE product_id=? ORDER BY sort_order,id LIMIT 1',
        [productId]
      );
      const nextUrl = nextImg ? (nextImg.has_blob ? `/api/images/${nextImg.id}` : (nextImg.image_url||null)) : null;
      await pool.query('UPDATE products SET image_url=? WHERE id=?',[nextUrl, productId]);
    }

    res.json({ message:'Imagen eliminada (URL)' });
  }catch(e){ console.error('[IMG DELETE URL]', e); res.status(500).json({ error:'Error eliminando imagen (URL)' }); }
});

// Eliminar producto completo
app.delete('/api/admin/products/:id', isAuth, async (req,res)=>{
  try{
    const id = Number(req.params.id);
    await pool.query('DELETE FROM product_images WHERE product_id=?',[id]); // redundante pero ok
    await pool.query('DELETE FROM products WHERE id=?',[id]);
    res.json({ message:'Producto eliminado' });
  }catch(e){ console.error('[PRODUCT DELETE]', e); res.status(500).json({ error:'Error eliminando producto' }); }
});

/* ===== BRANDING (admin) ===== */
app.get('/api/admin/branding', isAuth, async (_req,res)=>{
  try{
    const [rows] = await pool.query('SELECT brand_name, tagline, logo_url, logo_mime, CHAR_LENGTH(logo_data) AS has_blob, updated_at FROM brand_settings WHERE id=1');
    const b = rows[0] || {};
    const hasBlob = b.has_blob && b.has_blob > 0;
    res.json({
      name: b.brand_name || 'Wholesale.com',
      tag:  b.tagline    || '✓ Compras seguras',
      logo_url: hasBlob ? `/api/branding/logo?t=${Date.now()}` : (b.logo_url || null),
      updated_at: b.updated_at || null
    });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error leyendo branding' }); }
});

app.put('/api/admin/branding', isAuth, async (req,res)=>{
  try{
    const { name, tag } = req.body;
    await pool.query('UPDATE brand_settings SET brand_name=?, tagline=? WHERE id=1',[name||null, tag||null]);
    res.json({ message:'Branding actualizado' });
  }catch(e){ console.error(e); res.status(500).json({ error:'Error actualizando branding' }); }
});

// subir logo BLOB
app.post('/api/admin/branding/logo', isAuth, upload.single('logo'), async (req,res)=>{
  try{
    if (!req.file){
      return res.status(400).json({ error:'No se envió archivo' });
    }
    const mime = req.file.mimetype || 'image/png';
    const data = req.file.buffer;
    await pool.query(
      'UPDATE brand_settings SET logo_mime=?, logo_data=?, logo_url=NULL WHERE id=1',
      [mime, data]
    );
    res.json({
      message: 'Logo actualizado',
      logo_url: `/api/branding/logo?t=${Date.now()}`
    });
  }catch(e){
    console.error('[BRANDING LOGO POST]', e);
    res.status(500).json({ error:'Error subiendo logo' });
  }
});

// quitar logo
app.delete('/api/admin/branding/logo', isAuth, async (_req,res)=>{
  try{
    await pool.query(
      'UPDATE brand_settings SET logo_data=NULL, logo_mime=NULL, logo_url=NULL WHERE id=1'
    );
    res.json({ message:'Logo eliminado' });
  }catch(e){
    console.error('[BRANDING LOGO DELETE]', e);
    res.status(500).json({ error:'Error eliminando logo' });
  }
});

// servir logo BLOB
app.get('/api/branding/logo', async (_req,res)=>{
  try{
    const [[row]] = await pool.query(
      'SELECT logo_mime, logo_data FROM brand_settings WHERE id=1'
    );
    if (!row || !row.logo_data){
      return res.status(404).send('No logo');
    }
    res.setHeader('Content-Type', row.logo_mime || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(row.logo_data);
  }catch(e){
    console.error('[BRANDING LOGO GET]', e);
    res.status(500).send('Error');
  }
});

/* ====== SERVIR IMÁGENES BLOB DE PRODUCTOS ====== */
app.get('/api/images/:id', async (req,res)=>{
  try{
    const id = Number(req.params.id);
    const [[row]] = await pool.query('SELECT mime, data FROM product_images WHERE id=?',[id]);
    if (!row) return res.status(404).send('Not found');
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(row.data);
  }catch(e){ console.error('[IMG READ]', e); res.status(500).send('Error'); }
});

/* ================== Rutas de páginas ================== */
app.get('/login', (_req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));
app.get('/admin', (req,res)=>{
  if (!(req.session && req.session.user)) return res.redirect('/login');
  if (req.session.user.is_temp) return res.redirect('/first-change.html');
  res.redirect('/admin/dashboard.html');
});
const ADMIN_PAGES = new Set(['dashboard.html','productos.html','contactos.html','ajustes.html']);
app.get('/admin/:page', (req,res)=>{
  if (!(req.session && req.session.user)) return res.redirect('/login');
  if (req.session.user.is_temp) return res.redirect('/first-change.html');
  const page = req.params.page;
  if (!ADMIN_PAGES.has(page)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname,'public','admin',page));
});

/* =================== Start =================== */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, ()=> console.log('Servidor en http://localhost:' + PORT));
