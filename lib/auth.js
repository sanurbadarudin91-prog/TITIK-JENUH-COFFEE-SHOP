const crypto = require('node:crypto');
const { db, hashPassword } = require('./db');

const ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'ADM-2026TITKJENUH-TOKEN';
const GATE_COOKIE = 'tj_gate';
const SESSION_COOKIE = 'tj_session';
const GATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyAccessToken(token) {
  return safeEqual(token, ACCESS_TOKEN);
}

function verifyCredentials(username, email, password) {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) return null;
  const expected = Buffer.from(user.password_hash, 'hex');
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;
  if (!safeEqual(email, user.email)) return null;
  return user;
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)').run(token, username, expires);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

function setGateCookie(res) {
  res.cookie(GATE_COOKIE, crypto.randomBytes(16).toString('hex'), { ...cookieBase, maxAge: GATE_TTL_MS });
}

function hasGate(req) {
  return Boolean(req.cookies && req.cookies[GATE_COOKIE]);
}

function clearGate(res) {
  res.clearCookie(GATE_COOKIE, cookieBase);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_TTL_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieBase);
}

function requireAuth(req, res, next) {
  const session = getSession(req.cookies && req.cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'Tidak terautentikasi.' });
  req.admin = session;
  next();
}

function logAction(actor, action, detail = '') {
  db.prepare('INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?)').run(actor, action, detail);
}

module.exports = {
  GATE_COOKIE,
  SESSION_COOKIE,
  verifyAccessToken,
  verifyCredentials,
  createSession,
  getSession,
  destroySession,
  setGateCookie,
  hasGate,
  clearGate,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  logAction,
};
