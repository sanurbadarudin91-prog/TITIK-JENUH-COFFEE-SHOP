const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'titikjenuh.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  description TEXT    DEFAULT '',
  price       INTEGER NOT NULL,
  cost        INTEGER NOT NULL DEFAULT 0,
  image       TEXT    DEFAULT '',
  available   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT    NOT NULL UNIQUE,
  customer_name  TEXT    NOT NULL,
  table_no       TEXT    DEFAULT '',
  note           TEXT    DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'pending',
  payment_status TEXT    NOT NULL DEFAULT 'unpaid',
  total          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_id  INTEGER REFERENCES menu_items(id),
  name     TEXT    NOT NULL,
  price    INTEGER NOT NULL,
  cost     INTEGER NOT NULL DEFAULT 0,
  qty      INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT    NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin@jenuh';
  const email = process.env.ADMIN_EMAIL || 'titik@jenuh.admin';
  const password = process.env.ADMIN_PASSWORD || 'titik-jenuh@440';

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) return;

  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(
    'INSERT INTO admin_users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)'
  ).run(username, email, hashPassword(password, salt), salt);
}

const SEED_MENU = [
  ['Kopi Susu Titik Jenuh', 'Coffee', 'Espresso + susu segar, manis pas, jadi alasan kamu balik lagi.', 22000, 9000],
  ['Americano', 'Coffee', 'Espresso dingin/panas dengan air mineral. Bersih dan jujur.', 18000, 7000],
  ['Manual Brew V60', 'Coffee', 'Single origin pilihan, diseduh manual di depan kamu.', 28000, 12000],
  ['Cappuccino', 'Coffee', 'Espresso, susu steamed, foam tebal. Klasik yang nggak pernah salah.', 25000, 10000],
  ['Matcha Latte', 'Non-Coffee', 'Matcha premium grade, creamy, nggak bikin eneg.', 26000, 11000],
  ['Red Velvet', 'Non-Coffee', 'Manis lembut dengan warna yang cantik buat feed kamu.', 25000, 10000],
  ['Mocktail Sunset Jenuh', 'Non-Coffee', 'Perpaduan buah segar dan soda, penyejuk sore hari.', 24000, 8000],
  ['Croissant Butter', 'Snack & Pastry', 'Dipanggang harian, renyah di luar, lembut di dalam.', 20000, 8000],
  ['Kentang Goreng', 'Snack & Pastry', 'Crispy di luar, lembut di dalam, saus mayo & sambal.', 18000, 6000],
  ['Platter Sharing', 'Snack & Pastry', 'Campuran snack gurih buat dibagi bareng teman.', 45000, 20000],
];

function seedMenu() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n;
  if (count > 0) return;
  const stmt = db.prepare(
    'INSERT INTO menu_items (name, category, description, price, cost) VALUES (?, ?, ?, ?, ?)'
  );
  for (const row of SEED_MENU) stmt.run(...row);
}

function seedDemoOrders() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  if (count > 0) return;

  const demo = [
    { name: 'Rani', table: 'A3', status: 'approved', payment: 'paid', items: [['Kopi Susu Titik Jenuh', 2], ['Croissant Butter', 1]] },
    { name: 'Bagas', table: 'B1', status: 'approved', payment: 'paid', items: [['Americano', 1], ['Kentang Goreng', 2]] },
    { name: 'Sinta', table: 'C2', status: 'pending', payment: 'unpaid', items: [['Matcha Latte', 1], ['Platter Sharing', 1]] },
    { name: 'Dimas', table: 'A1', status: 'pending', payment: 'unpaid', items: [['Manual Brew V60', 2]] },
  ];

  let seq = 0;
  for (const o of demo) {
    seq += 1;
    const code = 'TJC-' + String(Date.now()).slice(-6) + seq;
    let total = 0;
    const lines = [];
    for (const [name, qty] of o.items) {
      const menu = db.prepare('SELECT * FROM menu_items WHERE name = ?').get(name);
      if (!menu) continue;
      const subtotal = menu.price * qty;
      total += subtotal;
      lines.push([menu.id, menu.name, menu.price, menu.cost, qty, subtotal]);
    }
    const info = db.prepare(
      'INSERT INTO orders (code, customer_name, table_no, note, status, payment_status, total) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(code, o.name, o.table, '', o.status, o.payment, total);
    const orderId = info.lastInsertRowid;
    const stmt = db.prepare(
      'INSERT INTO order_items (order_id, menu_id, name, price, cost, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const l of lines) stmt.run(orderId, ...l);
  }
}

seedAdmin();
seedMenu();
seedDemoOrders();

module.exports = { db, hashPassword };
