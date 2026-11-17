try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch {
  /* .env opsional */
}

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { db } = require('./lib/db');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 12000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

/* ------------------------------------------------------------------ */
/* Public config                                                       */
/* ------------------------------------------------------------------ */
const CAFE = {
  name: 'TITIK JENUH COFFEE SHOP',
  shortName: 'TITIK JENUH',
  tagline: 'Tempat Singgah Pas Buat Kamu yang Lagi Lelah Sama Rutinitas.',
  address: 'Jl. Kopi Kenangan No. 44, Kota Bandung, Jawa Barat',
  hours: 'Senin - Minggu | 15.00 - 23.00 WIB',
  phone: '+62 812-0000-4400',
  instagram: 'https://instagram.com/titikjenuh.coffee',
  maps: 'https://www.google.com/maps/search/?api=1&query=coffee+shop',
};

app.get('/api/config', (req, res) => res.json(CAFE));

/* ------------------------------------------------------------------ */
/* Menu + search                                                       */
/* ------------------------------------------------------------------ */
function fetchMenu(where = '', params = []) {
  return db
    .prepare(`SELECT id, name, category, description, price FROM menu_items ${where} ORDER BY category, id`)
    .all(...params);
}

app.get('/api/menu', (req, res) => {
  res.json({ items: fetchMenu('WHERE available = 1') });
});

function performSearch(q) {
  const term = String(q || '').trim();
  if (!term) return { items: [], query: '' };
  const like = `%${term}%`;
  const items = fetchMenu(
    'WHERE available = 1 AND (name LIKE ? OR category LIKE ? OR description LIKE ?)',
    [like, like, like]
  );
  return { items, query: term };
}

app.get('/api/menu/search', (req, res) => {
  res.json(performSearch(req.query.q));
});

/* ------------------------------------------------------------------ */
/* Customer orders                                                     */
/* ------------------------------------------------------------------ */
app.post('/api/orders', (req, res) => {
  const { customer_name, table_no, note, items } = req.body || {};
  if (!customer_name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nama pemesan dan minimal 1 menu wajib diisi.' });
  }

  const lines = [];
  let total = 0;
  for (const item of items) {
    const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(Number(item.id));
    if (!menu) continue;
    const qty = Math.max(1, Math.min(50, Number(item.qty) || 1));
    const subtotal = menu.price * qty;
    total += subtotal;
    lines.push([menu.id, menu.name, menu.price, menu.cost, qty, subtotal]);
  }
  if (lines.length === 0) return res.status(400).json({ error: 'Menu tidak valid.' });

  const code = 'TJC-' + String(Date.now()).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const info = db
    .prepare(
      'INSERT INTO orders (code, customer_name, table_no, note, status, payment_status, total) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(code, String(customer_name).slice(0, 60), String(table_no || '').slice(0, 20), String(note || '').slice(0, 200), 'pending', 'unpaid', total);

  const orderId = info.lastInsertRowid;
  const stmt = db.prepare(
    'INSERT INTO order_items (order_id, menu_id, name, price, cost, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const l of lines) stmt.run(orderId, ...l);

  res.status(201).json({ ok: true, code, total, status: 'pending' });
});

/* ------------------------------------------------------------------ */
/* Hidden admin gate via search bar                                    */
/* ------------------------------------------------------------------ */
app.post('/api/search', (req, res) => {
  const q = String((req.body && req.body.q) || '').trim();
  if (q && auth.verifyAccessToken(q)) {
    auth.setGateCookie(res);
    auth.logAction('gate', 'akses-token-diterima', 'Halaman admin dibuka via token');
    return res.json({ gate: true, redirect: '/admin' });
  }
  return res.json({ gate: false, ...performSearch(q) });
});

/* ------------------------------------------------------------------ */
/* Admin pages (hidden unless gate cookie present)                     */
/* ------------------------------------------------------------------ */
const VIEWS_DIR = path.join(__dirname, 'views');

app.get(['/admin', '/admin/'], (req, res) => {
  if (!auth.hasGate(req)) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(VIEWS_DIR, 'admin.html'));
});

app.post('/api/admin/login', (req, res) => {
  if (!auth.hasGate(req)) return res.status(404).json({ error: 'Halaman tidak ditemukan.' });
  const { username, email, password } = req.body || {};
  const user = auth.verifyCredentials(username, email, password);
  if (!user) {
    auth.logAction(username || 'unknown', 'login-gagal', 'Kredensial tidak cocok');
    return res.status(401).json({ error: 'Username, email, atau password salah.' });
  }
  const token = auth.createSession(user.username);
  auth.setSessionCookie(res, token);
  auth.logAction(user.username, 'login-berhasil', '');
  res.json({ ok: true, username: user.username, email: user.email });
});

app.get('/api/admin/session', (req, res) => {
  const session = auth.getSession(req.cookies && req.cookies.tj_session);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: session.username });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies && req.cookies.tj_session;
  const session = auth.getSession(token);
  if (session) auth.logAction(session.username, 'logout', '');
  auth.destroySession(token);
  auth.clearSessionCookie(res);
  auth.clearGate(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Admin API                                                           */
/* ------------------------------------------------------------------ */
function statsFor(where, params = []) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM orders WHERE ${where}`
    )
    .get(...params);
  return row;
}

app.get('/api/admin/stats', auth.requireAuth, (req, res) => {
  const gross = statsFor("status = 'approved'");
  const pending = statsFor("status = 'pending'");
  const rejected = statsFor("status = 'rejected'");

  const costRow = db
    .prepare(
      `SELECT COALESCE(SUM(oi.cost * oi.qty), 0) AS cost
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'approved'`
    )
    .get();
  const expenseRow = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses').get();
  const balanceRow = statsFor("payment_status = 'paid' AND status = 'approved'");

  const revenueGross = gross.total;
  const cogs = costRow.cost;
  const expenses = expenseRow.total;
  const revenueNet = revenueGross - cogs - expenses;

  const bestSeller = db
    .prepare(
      `SELECT oi.name, SUM(oi.qty) AS qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'approved'
       GROUP BY oi.name ORDER BY qty DESC LIMIT 5`
    )
    .all();

  const last7 = db
    .prepare(
      `SELECT date(created_at) AS day, COALESCE(SUM(total), 0) AS total
       FROM orders WHERE status = 'approved' AND created_at >= datetime('now', '-6 days')
       GROUP BY day ORDER BY day`
    )
    .all();

  res.json({
    revenue: {
      gross: revenueGross,
      cogs,
      expenses,
      net: revenueNet,
    },
    balance: {
      paid: balanceRow.total,
      ordersPaid: balanceRow.count,
    },
    orders: {
      approved: gross.count,
      pending: pending.count,
      rejected: rejected.count,
      pendingValue: pending.total,
    },
    bestSeller,
    last7,
  });
});

function loadOrders(where = '', params = []) {
  const orders = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT 200`).all(...params);
  const itemsStmt = db.prepare('SELECT name, price, qty, subtotal FROM order_items WHERE order_id = ?');
  return orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) }));
}

app.get('/api/admin/orders', auth.requireAuth, (req, res) => {
  const status = req.query.status;
  const allowed = ['pending', 'approved', 'rejected'];
  if (status && allowed.includes(status)) {
    return res.json({ orders: loadOrders('WHERE status = ?', [status]) });
  }
  res.json({ orders: loadOrders() });
});

function setOrderStatus(req, res, status) {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  auth.logAction(req.admin.username, `pesanan-${status}`, `${order.code} (${order.customer_name})`);
  res.json({ ok: true, id, status });
}

app.post('/api/admin/orders/:id/approve', auth.requireAuth, (req, res) => setOrderStatus(req, res, 'approved'));
app.post('/api/admin/orders/:id/reject', auth.requireAuth, (req, res) => setOrderStatus(req, res, 'rejected'));

app.post('/api/admin/orders/:id/pay', auth.requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (order.status !== 'approved') return res.status(400).json({ error: 'Pesanan harus disetujui dulu sebelum dibayar.' });
  db.prepare("UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ?").run(id);
  auth.logAction(req.admin.username, 'pembayaran-diterima', `${order.code} Rp${order.total}`);
  res.json({ ok: true, id, payment_status: 'paid' });
});

app.post('/api/admin/expenses', auth.requireAuth, (req, res) => {
  const { label, amount } = req.body || {};
  const value = Number(amount);
  if (!label || !Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Label dan nominal pengeluaran wajib valid.' });
  }
  db.prepare('INSERT INTO expenses (label, amount) VALUES (?, ?)').run(String(label).slice(0, 80), Math.round(value));
  auth.logAction(req.admin.username, 'catat-pengeluaran', `${label} Rp${Math.round(value)}`);
  res.status(201).json({ ok: true });
});

app.get('/api/admin/audit', auth.requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all();
  res.json({ log: rows });
});

/* ------------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TITIK JENUH COFFEE SHOP berjalan di http://localhost:${PORT}`);
});
