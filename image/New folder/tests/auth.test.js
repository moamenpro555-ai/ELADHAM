'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, startServer, createUser, Client, db } = require('./helpers');

let srv, student, teacher;
before(async () => {
  await resetDb();
  srv = await startServer();
  student = await createUser({ email: 'Sara@Example.com', name: 'Sara', password: 'Correct-horse-1' });
  teacher = await createUser({ email: 'teacher@example.com', name: 'T', role: 'teacher', password: 'Teacher-pass-1' });
});
after(async () => { srv.server.close(); await db.end(); });

describe('login', () => {
  test('succeeds with the right password (e-mail is case-insensitive) and sets an HttpOnly cookie', async () => {
    const c = new Client(srv.base);
    const r = await c.login('sara@example.com', 'Correct-horse-1');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.user.role, 'student');
    assert.ok(r.body.data.csrfToken);
    const sc = r.setCookies.join(' | ');
    assert.match(sc, /HttpOnly/i);
    assert.match(sc, /SameSite=Lax/i);
    assert.match(sc, /Max-Age=\d+/);
  });

  test('never returns the password or its hash anywhere', async () => {
    const c = new Client(srv.base);
    const r = await c.login('sara@example.com', 'Correct-horse-1');
    const me = await c.get('/api/auth/me');
    for (const text of [r.text, me.text]) {
      assert.ok(!/password_hash|passwordHash|scrypt\$/.test(text));
      assert.ok(!text.includes('Correct-horse-1'));
    }
  });

  test('wrong password and unknown e-mail give the SAME generic error (no account enumeration)', async () => {
    const a = await new Client(srv.base).login('sara@example.com', 'wrong-password');
    const b = await new Client(srv.base).login('nobody@example.com', 'wrong-password');
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('a disabled account cannot log in and gets the same generic error', async () => {
    await createUser({ email: 'off@example.com', password: 'Passw0rd!off', active: false });
    const r = await new Client(srv.base).login('off@example.com', 'Passw0rd!off');
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('rejects malformed input with 400 and handles SQL-injection strings safely', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.post('/api/auth/login', { email: 'not-an-email', password: 'x' }, { csrf: false })).status, 400);
    assert.equal((await c.post('/api/auth/login', { email: 'a@b.co' }, { csrf: false })).status, 400);
    assert.equal((await c.post('/api/auth/login', { email: "x@y.co' OR '1'='1", password: "' OR '1'='1" }, { csrf: false })).status, 400);
    const r = await c.post('/api/auth/login', { email: 'sara@example.com', password: "' OR '1'='1' --" }, { csrf: false });
    assert.equal(r.status, 401);
    assert.equal((await c.request('POST', '/api/auth/login', undefined, { raw: '{bad json', csrf: false })).status, 400);
    const users = await db.query('SELECT count(*)::int AS n FROM users');
    assert.ok(users.rows[0].n >= 2); // tables are intact
  });

  test('a login from an unknown browser origin is refused', async () => {
    const r = await new Client(srv.base).post('/api/auth/login', { email: 'sara@example.com', password: 'Correct-horse-1' }, { csrf: false, origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'ORIGIN_NOT_ALLOWED');
  });
});

describe('brute-force protection', () => {
  test('locks the account after repeated failures, even for the right password, until the window passes', async () => {
    await createUser({ email: 'brute@example.com', password: 'Right-pass-1' });
    for (let i = 0; i < 5; i++) {
      const r = await new Client(srv.base).login('brute@example.com', 'bad-guess-' + i);
      assert.equal(r.status, 401);
    }
    const locked = await new Client(srv.base).login('brute@example.com', 'Right-pass-1');
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'TOO_MANY_ATTEMPTS');
    // simulate the lock window passing
    await db.query(`UPDATE login_attempts SET created_at = now() - interval '1 hour' WHERE email_lower = 'brute@example.com'`);
    const ok = await new Client(srv.base).login('brute@example.com', 'Right-pass-1');
    assert.equal(ok.status, 200);
  });
});

describe('session, logout, CSRF', () => {
  test('/me requires a session; logout destroys it server-side', async () => {
    assert.equal((await new Client(srv.base).get('/api/auth/me')).status, 401);
    const c = new Client(srv.base); await c.login('sara@example.com', 'Correct-horse-1');
    assert.equal((await c.get('/api/auth/me')).status, 200);
    const savedCookies = { ...c.cookies };
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    // replaying the old cookie must fail: the session row is gone, not just the cookie
    const replay = new Client(srv.base); replay.cookies = savedCookies;
    assert.equal((await replay.get('/api/auth/me')).status, 401);
  });

  test('state-changing requests without the CSRF token are rejected', async () => {
    const c = new Client(srv.base); await c.login('sara@example.com', 'Correct-horse-1');
    const r = await c.post('/api/auth/logout', {}, { csrf: false });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'CSRF_FAILED');
    assert.equal((await c.post('/api/auth/logout', {}, { headers: { 'X-CSRF-Token': 'wrong' }, csrf: false })).status, 403);
    assert.equal((await c.get('/api/auth/me')).status, 200); // session still alive
  });

  test('only a hash of the session token is stored in the database', async () => {
    const c = new Client(srv.base); await c.login('sara@example.com', 'Correct-horse-1');
    const token = Object.values(c.cookies)[0];
    const { rows } = await db.query('SELECT token_hash FROM sessions');
    assert.ok(rows.length > 0 && rows.every((r) => r.token_hash !== token));
  });

  test('expired and idle sessions stop working', async () => {
    const c = new Client(srv.base); await c.login('sara@example.com', 'Correct-horse-1');
    await db.query(`UPDATE sessions SET expires_at = now() - interval '1 minute'`);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    const d = new Client(srv.base); await d.login('sara@example.com', 'Correct-horse-1');
    await db.query(`UPDATE sessions SET last_seen_at = now() - interval '3 days'`);
    assert.equal((await d.get('/api/auth/me')).status, 401);
  });

  test('disabling a user kills their sessions immediately', async () => {
    const u = await createUser({ email: 'soon@example.com', password: 'Passw0rd!soon' });
    const c = new Client(srv.base); await c.login('soon@example.com', 'Passw0rd!soon');
    assert.equal((await c.get('/api/auth/me')).status, 200);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });
});

describe('passwords', () => {
  test('change-password needs the current password, enforces strength, and logs out other devices', async () => {
    await createUser({ email: 'chg@example.com', password: 'Old-pass-123' });
    const a = new Client(srv.base); await a.login('chg@example.com', 'Old-pass-123');
    const b = new Client(srv.base); await b.login('chg@example.com', 'Old-pass-123');
    assert.equal((await a.post('/api/auth/change-password', { currentPassword: 'nope', newPassword: 'New-pass-456' })).body.error.code, 'WRONG_PASSWORD');
    assert.equal((await a.post('/api/auth/change-password', { currentPassword: 'Old-pass-123', newPassword: 'short' })).body.error.code, 'WEAK_PASSWORD');
    assert.equal((await a.post('/api/auth/change-password', { currentPassword: 'Old-pass-123', newPassword: 'New-pass-456' })).status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 200);
    assert.equal((await b.get('/api/auth/me')).status, 401);
    assert.equal((await new Client(srv.base).login('chg@example.com', 'Old-pass-123')).status, 401);
    assert.equal((await new Client(srv.base).login('chg@example.com', 'New-pass-456')).status, 200);
  });

  test('a temporary password must be changed before anything else works', async () => {
    await createUser({ email: 'temp@example.com', password: 'Temp-pass-123', mustChange: true });
    const c = new Client(srv.base);
    const l = await c.login('temp@example.com', 'Temp-pass-123');
    assert.equal(l.body.data.user.mustChangePassword, true);
    assert.equal((await c.get('/api/courses')).body.error.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await c.get('/api/auth/me')).status, 200);
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'Temp-pass-123', newPassword: 'Brand-new-789' })).status, 200);
    assert.equal((await c.get('/api/courses')).status, 200);
  });

  test('stored hashes are salted scrypt hashes, never plain text', async () => {
    const { rows } = await db.query(`SELECT password_hash FROM users WHERE lower(email) = 'sara@example.com'`);
    assert.match(rows[0].password_hash, /^scrypt\$\d+\$\d+\$\d+\$/);
    assert.ok(!rows[0].password_hash.includes('Correct-horse-1'));
  });
});

describe('response hygiene', () => {
  test('security headers are present and errors do not leak internals', async () => {
    const r = await new Client(srv.base).get('/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(!/stack|at \w+ \(/.test(r.text));
    assert.equal((await new Client(srv.base).request('PUT', '/api/auth/login', {})).status, 405);
  });
});
