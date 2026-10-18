'use strict';
// Shared test setup. Tests run against a REAL PostgreSQL database (TEST_DATABASE_URL), never mocks.
// WARNING: resetDb() empties all tables of that database - point it only at a throw-away test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/eladham_test';
process.env.DATABASE_SSL ??= 'disable';
process.env.SCRYPT_N ??= '1024';   // fast hashing for tests only
process.env.SCRYPT_P ??= '1';
process.env.LOGIN_IP_MAX ??= '10000';
process.env.VIDEO_SIGNING_SECRET ??= 'test-signing-secret';

const http = require('node:http');
const migrate = require('../scripts/migrate');
const db = require('../src/db');
const { buildApp } = require('../src/app');
const { hashPassword } = require('../src/lib/passwords');

const ORIGIN = 'http://localhost:5500'; // one of the default CORS_ORIGINS

async function resetDb() {
  await migrate();
  await db.query('TRUNCATE users, courses, login_attempts RESTART IDENTITY CASCADE'); // cascades to everything else
}

async function startServer() {
  const server = http.createServer(buildApp().handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createUser({ email, name = 'User', password = 'Passw0rd!x', role = 'student', mustChange = false, active = true, stage = null, grade = null }) {
  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash, role, must_change_password, is_active, stage, grade) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [email, name, hash, role, mustChange, active, stage, grade]);
  return { id: rows[0].id, email, password };
}

// A tiny browser: keeps cookies + the CSRF token between calls.
class Client {
  constructor(base) { this.base = base; this.cookies = {}; this.csrf = null; }
  async request(method, path, body, { csrf = true, origin = ORIGIN, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (body !== undefined || raw !== undefined) h['Content-Type'] = headers['Content-Type'] || 'application/json';
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(this.base + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';'); const i = pair.indexOf('=');
      const name = pair.slice(0, i); const val = pair.slice(i + 1);
      if (/Max-Age=0/i.test(sc) || val === '') delete this.cookies[name]; else this.cookies[name] = val;
    }
    const buffer = Buffer.from(await res.arrayBuffer()); let json = null; const text = buffer.toString('utf8');
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text, buffer, headers: res.headers, setCookies };
  }
  get(p, o) { return this.request('GET', p, undefined, o); }
  post(p, b, o) { return this.request('POST', p, b ?? {}, o); }
  put(p, b, o) { return this.request('PUT', p, b ?? {}, o); }
  patch(p, b, o) { return this.request('PATCH', p, b ?? {}, o); }
  del(p, o) { return this.request('DELETE', p, undefined, o); }
  async login(email, password) {
    const r = await this.post('/api/auth/login', { email, password }, { csrf: false });
    if (r.status === 200) this.csrf = r.body.data.csrfToken;
    return r;
  }
}

module.exports = { resetDb, startServer, createUser, Client, db, ORIGIN };
