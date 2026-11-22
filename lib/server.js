'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = '__Host-proker_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_PASSWORD_LENGTH = 10;
let cachedDb = null;
let cachedAuth = null;

function getAdminApp() {
  const existing = getApps().find((app) => app.name === 'proker-server');
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Environment variable FIREBASE_SERVICE_ACCOUNT_JSON belum diatur di Vercel.');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON Service Account yang valid.');
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Service Account harus memuat project_id, client_email, dan private_key.');
  }
  if (serviceAccount.project_id !== 'database-gencita') {
    throw new Error('Service Account yang dipasang bukan milik Firebase project database-gencita.');
  }
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, 'proker-server');
}

function getDb() {
  if (!cachedDb) cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}

function getFirebaseAuth() {
  if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return sendJson(res, 405, { error: 'Metode permintaan tidak didukung.' });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function normalizeLoginName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function validLoginName(value) {
  return /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(value);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= 128;
}

async function hashPassword(password, saltValue) {
  if (!validatePassword(password)) {
    const error = new Error(`Password harus terdiri dari ${MIN_PASSWORD_LENGTH}–128 karakter.`);
    error.status = 400;
    throw error;
  }
  const salt = saltValue || crypto.randomBytes(16).toString('base64url');
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return { passwordSalt: salt, passwordHash: Buffer.from(derived).toString('base64url') };
}

async function verifyPassword(password, account) {
  const salt = account?.passwordSalt || 'proker-cb3-dummy-salt';
  const expectedText = account?.passwordHash || Buffer.alloc(64).toString('base64url');
  const derived = Buffer.from(await scryptAsync(String(password || ''), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }));
  let expected;
  try { expected = Buffer.from(expectedText, 'base64url'); } catch { expected = Buffer.alloc(0); }
  return Boolean(account && expected.length === derived.length && crypto.timingSafeEqual(expected, derived));
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const result = {};
  raw.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > 0) {
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
    }
  });
  return result;
}

function sessionSecret() {
  const value = process.env.PENGURUS_SESSION_SECRET;
  if (!value || value.length < 48) {
    throw new Error('PENGURUS_SESSION_SECRET belum diatur atau terlalu pendek. Buat secret acak minimal 48 karakter di Vercel.');
  }
  return value;
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.role !== 'pengurus' || !payload.sub || !payload.loginName || !payload.exp || payload.exp <= now) return null;
  return payload;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function makeSession(account) {
  const now = Math.floor(Date.now() / 1000);
  return signSession({
    role: 'pengurus',
    sub: account.pengurusId,
    loginName: account.loginName,
    ver: Number(account.tokenVersion || 1),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
}

function allowedOrigins() {
  const allowed = new Set([
    'https://www.cb3.web.id',
    'https://pages.cb3.web.id',
    'https://prokercb3.vercel.app',
    'https://wmyulfian.github.io',
  ]);
  const extra = String(process.env.ALLOWED_APP_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const item of extra) {
    try { allowed.add(new URL(item.includes('://') ? item : `https://${item}`).origin); } catch { /* abaikan nilai env yang tidak valid */ }
  }
  return allowed;
}

function handleCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!origin || !allowed.has(origin)) {
      sendJson(res, 403, { error: 'Origin tidak diizinkan untuk API ini.' });
      return true;
    }
    res.status(204).end();
    return true;
  }
  return false;
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // Permintaan server-to-server/ same-origin tertentu tidak mengirim Origin.
  if (!allowedOrigins().has(origin)) {
    const error = new Error('Asal permintaan tidak diizinkan. Buka website melalui www.cb3.web.id.');
    error.status = 403;
    throw error;
  }
}

async function verifyAdminRequest(req) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Sesi Admin tidak ditemukan. Silakan login ulang.');
    error.status = 401;
    throw error;
  }
  let decoded;
  try {
    decoded = await getFirebaseAuth().verifyIdToken(match[1], true);
  } catch {
    const error = new Error('Sesi Admin tidak valid atau sudah berakhir. Silakan login ulang.');
    error.status = 401;
    throw error;
  }
  const profile = await getDb().collection('users').doc(decoded.uid).get();
  if (!profile.exists || profile.data().role !== 'admin') {
    const error = new Error('Akses ditolak. Hanya Admin yang dapat melakukan tindakan ini.');
    error.status = 403;
    throw error;
  }
  return { uid: decoded.uid, email: decoded.email || '' };
}

async function requirePengurusSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  let payload;
  try { payload = verifySessionToken(token); } catch { payload = null; }
  if (!payload) {
    const error = new Error('Sesi Pengurus tidak ditemukan atau sudah berakhir. Silakan login kembali.');
    error.status = 401;
    throw error;
  }
  const db = getDb();
  const accountSnap = await db.collection('akun_pengurus').doc(payload.loginName).get();
  if (!accountSnap.exists) {
    const error = new Error('Akun Pengurus sudah tidak tersedia. Hubungi Admin.');
    error.status = 401;
    throw error;
  }
  const account = accountSnap.data();
  if (!account.aktif || account.pengurusId !== payload.sub || Number(account.tokenVersion || 1) !== Number(payload.ver || 1)) {
    const error = new Error('Sesi Pengurus sudah dicabut atau akun dinonaktifkan. Silakan login kembali.');
    error.status = 401;
    throw error;
  }
  const personSnap = await db.collection('pengurus').doc(account.pengurusId).get();
  if (!personSnap.exists || personSnap.data().aktif === false) {
    const error = new Error('Akun Pengurus tidak aktif. Hubungi Admin.');
    error.status = 403;
    throw error;
  }
  return {
    db,
    accountRef: accountSnap.ref,
    account,
    person: { id: personSnap.id, ...personSnap.data() },
    session: payload,
  };
}

function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = serialize(item);
    return output;
  }
  return value;
}

function docToObject(doc) {
  return { id: doc.id, ...serialize(doc.data()) };
}

async function checkLoginRateLimit(req) {
  const db = getDb();
  const forwarded = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const ipHash = crypto.createHash('sha256').update(forwarded || 'unknown').digest('hex');
  const ref = db.collection('_pengurus_login_limits').doc(ipHash);
  const now = Date.now();
  const limit = 12;
  const windowMs = 15 * 60 * 1000;
  const blocked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const started = Number(data.windowStartedAt || 0);
    const count = started && now - started < windowMs ? Number(data.count || 0) : 0;
    const next = count + 1;
    tx.set(ref, { count: next, windowStartedAt: count ? started : now, expiresAt: new Date(now + windowMs) });
    return next > limit;
  });
  if (blocked) {
    const error = new Error('Terlalu banyak percobaan login. Silakan coba kembali setelah 15 menit.');
    error.status = 429;
    throw error;
  }
  return ref;
}

function errorStatus(error) {
  return Number(error?.status) || 500;
}

module.exports = {
  FieldValue,
  SESSION_TTL_SECONDS,
  checkLoginRateLimit,
  clearSessionCookie,
  docToObject,
  errorStatus,
  getDb,
  hashPassword,
  makeSession,
  methodNotAllowed,
  normalizeLoginName,
  readBody,
  requirePengurusSession,
  sendJson,
  setSessionCookie,
  validatePassword,
  verifyAdminRequest,
  verifyPassword,
  getFirebaseAuth,
  assertSameOrigin,
  handleCors,
};
