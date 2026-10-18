'use strict';
// Session authentication. The cookie holds a random token; the database holds only its SHA-256.
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../http');
const { randomToken, sha256, safeEqual } = require('../lib/tokens');

// "__Host-" prefix = Secure + Path=/ + no Domain: the browser refuses to let other (sub)domains overwrite it.
const secureCookies = config.isProd || config.cookieSameSite === 'none';
const COOKIE_NAME = secureCookies ? '__Host-eladham_sid' : 'eladham_sid';

function cookieOpts(maxAge) {
  return { httpOnly: true, secure: secureCookies, sameSite: config.cookieSameSite, path: '/', maxAge };
}

async function createSession(ctx, userId) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, sha256(token), csrf, ctx.ip.slice(0, 64), String(ctx.req.headers['user-agent'] || '').slice(0, 300), expiresAt]);
  // keep only the newest N sessions per user
  await db.query(
    `DELETE FROM sessions WHERE user_id = $1 AND id NOT IN
       (SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [userId, config.maxSessionsPerUser]);
  ctx.setCookie(COOKIE_NAME, token, cookieOpts(config.sessionTtlHours * 3600));
  return { csrf };
}

function clearSessionCookie(ctx) {
  ctx.setCookie(COOKIE_NAME, '', cookieOpts(0));
}

// Fills ctx.user / ctx.session when the cookie is valid. Never throws for a missing/invalid cookie.
async function authenticate(ctx) {
  const token = ctx.cookies[COOKIE_NAME];
  if (!token || typeof token !== 'string' || token.length > 200) return;
  const { rows } = await db.query(
    `SELECT s.id AS sid, s.csrf_token, s.last_seen_at,
            u.id, u.email, u.name, u.role, u.must_change_password, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active
        AND s.last_seen_at > now() - ($2::int * interval '1 hour')`,
    [sha256(token), config.sessionIdleHours]);
  const r = rows[0];
  if (!r) return;
  ctx.session = { id: r.sid, csrf: r.csrf_token };
  ctx.user = { id: r.id, email: r.email, name: r.name, role: r.role, mustChangePassword: r.must_change_password, createdAt: r.created_at };
  if (Date.now() - new Date(r.last_seen_at).getTime() > 60000) {
    db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [r.sid]).catch(() => {});
  }
}

// ---- guards (put them in front of route handlers) ----
async function requireAuth(ctx) {
  await authenticate(ctx);
  if (!ctx.user) throw new HttpError(401, 'UNAUTHENTICATED', 'لازم تسجل دخول الأول');
  // CSRF: every state-changing request from a logged-in browser must echo the per-session token.
  if (!['GET', 'HEAD'].includes(ctx.req.method)) {
    const sent = ctx.req.headers['x-csrf-token'];
    if (!sent || !safeEqual(sent, ctx.session.csrf)) throw new HttpError(403, 'CSRF_FAILED', 'الطلب مرفوض (رمز الحماية غير صحيح)، حدّث الصفحة وجرّب تاني');
  }
  // a student with a temporary password may only change it
  if (ctx.user.mustChangePassword && !ctx.allowMustChange) {
    throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'لازم تغيّر كلمة السر المؤقتة الأول');
  }
}
requireAuth.allowMustChange = async (ctx) => { ctx.allowMustChange = true; };

// Roles come ONLY from the database row loaded above, never from the request.
const requireRole = (role) => async (ctx) => {
  if (ctx.user.role !== role) throw new HttpError(403, 'FORBIDDEN', 'مش مسموح لك بالعملية دي');
};

module.exports = { COOKIE_NAME, createSession, clearSessionCookie, authenticate, requireAuth, requireRole };
