'use strict';
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../http');
const { schema, rules } = require('../lib/validate');
const { hashPassword, verifyPassword, verifyDummy, validatePasswordStrength } = require('../lib/passwords');
const { sha256 } = require('../lib/tokens');
const { rateLimit } = require('../lib/ratelimit');
const { createSession, clearSessionCookie, requireAuth, COOKIE_NAME } = require('../middleware/auth');

const GENERIC_LOGIN_ERROR = 'الإيميل أو كلمة السر غير صحيحة';

const ipLimiter = rateLimit({
  windowMs: config.loginIpWindowMinutes * 60000, max: config.loginIpMax, key: (ctx) => 'login:' + ctx.ip,
});
const resetLimiter = rateLimit({ windowMs: 15 * 60000, max: 10, key: (ctx) => 'reset:' + ctx.ip });
const pwLimiter = rateLimit({ windowMs: 15 * 60000, max: 10, key: (ctx) => 'pw:' + ctx.ip });

const loginBody = schema({
  email: rules.email(),
  password: rules.string({ min: 1, max: 128, trim: false }),
});

const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword ?? u.must_change_password });

module.exports = (app) => {
  app.post('/api/auth/login', ipLimiter, async (ctx) => {
    const { email, password } = loginBody(ctx.body);

    // per-account brute-force protection (counts recent failures for this e-mail)
    const recent = await db.query(
      `SELECT count(*)::int AS n FROM login_attempts
        WHERE email_lower = $1 AND NOT succeeded AND created_at > now() - ($2::int * interval '1 minute')`,
      [email, config.loginLockMinutes]);
    if (recent.rows[0].n >= config.loginMaxFailures) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', `محاولات دخول كتير. جرّب تاني بعد ${config.loginLockMinutes} دقيقة`);
    }

    const { rows } = await db.query(
      'SELECT id, email, name, role, password_hash, is_active, must_change_password FROM users WHERE lower(email) = $1', [email]);
    const user = rows[0];
    const ok = user && user.is_active ? await verifyPassword(password, user.password_hash) : await verifyDummy(password);

    if (!ok) {
      await db.query('INSERT INTO login_attempts (email_lower, ip, succeeded) VALUES ($1, $2, false)', [email, ctx.ip.slice(0, 64)]);
      // same message and status whether the e-mail exists, is disabled, or the password is wrong
      throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    await db.query('DELETE FROM login_attempts WHERE email_lower = $1 AND NOT succeeded', [email]);
    db.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`).catch(() => {});
    db.query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
    const { csrf } = await createSession(ctx, user.id);
    ctx.json(200, { user: userOut(user), csrfToken: csrf });
  });

  app.post('/api/auth/logout', requireAuth.allowMustChange, requireAuth, async (ctx) => {
    await db.query('DELETE FROM sessions WHERE id = $1', [ctx.session.id]);
    clearSessionCookie(ctx);
    ctx.json(200, { loggedOut: true });
  });

  // Called by the frontend on every page load to learn who is logged in (and to get the CSRF token).
  app.get('/api/auth/me', requireAuth.allowMustChange, requireAuth, async (ctx) => {
    ctx.json(200, { user: userOut(ctx.user), csrfToken: ctx.session.csrf });
  });

  const changeBody = schema({
    currentPassword: rules.string({ min: 1, max: 128, trim: false }),
    newPassword: rules.string({ min: 1, max: 128, trim: false }),
  });
  app.post('/api/auth/change-password', pwLimiter, requireAuth.allowMustChange, requireAuth, async (ctx) => {
    const { currentPassword, newPassword } = changeBody(ctx.body);
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [ctx.user.id]);
    if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw new HttpError(400, 'WRONG_PASSWORD', 'كلمة السر الحالية غير صحيحة');
    }
    const weak = validatePasswordStrength(newPassword, ctx.user.email);
    if (weak) throw new HttpError(400, 'WEAK_PASSWORD', weak);
    if (newPassword === currentPassword) throw new HttpError(400, 'SAME_PASSWORD', 'كلمة السر الجديدة لازم تختلف عن الحالية');
    const hash = await hashPassword(newPassword);
    await db.tx(async (tx) => {
      await tx.query('UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2', [hash, ctx.user.id]);
      await tx.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [ctx.user.id, ctx.session.id]); // log out other devices
    });
    ctx.json(200, { changed: true });
  });

  // The teacher issues a one-time link (see routes/teacher.js) and sends it to the student (e.g. on WhatsApp).
  const resetBody = schema({
    token: rules.string({ min: 20, max: 200 }),
    newPassword: rules.string({ min: 1, max: 128, trim: false }),
  });
  app.post('/api/auth/password-reset/confirm', resetLimiter, async (ctx) => {
    const { token, newPassword } = resetBody(ctx.body);
    const { rows } = await db.query(
      `SELECT t.id, t.user_id, u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active`, [sha256(token)]);
    const t = rows[0];
    if (!t) throw new HttpError(400, 'INVALID_RESET_TOKEN', 'رابط تغيير كلمة السر منتهي أو غير صحيح');
    const weak = validatePasswordStrength(newPassword, t.email);
    if (weak) throw new HttpError(400, 'WEAK_PASSWORD', weak);
    const hash = await hashPassword(newPassword);
    await db.tx(async (tx) => {
      await tx.query('UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2', [hash, t.user_id]);
      await tx.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [t.user_id]);
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [t.user_id]);
    });
    ctx.json(200, { changed: true });
  });

  app.get('/api/health', async (ctx) => {
    await db.query('SELECT 1');
    ctx.json(200, { status: 'ok' });
  });
};
