'use strict';
// Reads settings from environment variables (and from a local .env file if one exists).
// No external packages: a tiny .env parser is included below.
const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val; // real env vars always win
  }
}
loadDotEnv(path.join(__dirname, '..', '.env'));

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const isProd = env.NODE_ENV === 'production';

const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: num(env.PORT, 3000),
  databaseUrl: env.DATABASE_URL || '',
  databaseSsl: env.DATABASE_SSL || (isProd ? 'require' : 'prefer'), // disable | prefer | require | verify
  dbPoolMax: num(env.DB_POOL_MAX, 5),

  // Origins of the static frontend allowed to call this API (comma separated, no trailing slash).
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:8765')
    .split(',').map((s) => s.trim()).filter(Boolean),
  frontendUrl: (env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, ''),

  // Cookies. When the frontend (github.io) and API (onrender.com) are on different sites you MUST use
  // COOKIE_SAMESITE=none (requires HTTPS). On the same site (api.yourdomain.com + yourdomain.com) use lax.
  cookieSameSite: (env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase(),
  sessionTtlHours: num(env.SESSION_TTL_HOURS, 24 * 7),
  sessionIdleHours: num(env.SESSION_IDLE_HOURS, 48),
  maxSessionsPerUser: num(env.MAX_SESSIONS_PER_USER, 5),

  // How many reverse proxies sit in front of the app (Render = 1). Used to read the real client IP.
  trustProxyHops: num(env.TRUST_PROXY_HOPS, isProd ? 1 : 0),

  // Brute-force protection
  loginMaxFailures: num(env.LOGIN_MAX_FAILURES, 5),          // per email ...
  loginLockMinutes: num(env.LOGIN_LOCK_MINUTES, 15),         // ... within this window
  loginIpMax: num(env.LOGIN_IP_MAX, 20),                     // per IP per window
  loginIpWindowMinutes: num(env.LOGIN_IP_WINDOW_MINUTES, 15),

  // Password hashing (scrypt). Defaults follow the OWASP recommendation (N=2^15, r=8, p=3).
  scrypt: { N: num(env.SCRYPT_N, 32768), r: num(env.SCRYPT_R, 8), p: num(env.SCRYPT_P, 3) },

  resetTokenHours: num(env.RESET_TOKEN_HOURS, 24),

  // Video playback links
  videoSigningSecret: env.VIDEO_SIGNING_SECRET || '',
  videoUrlTtlSeconds: num(env.VIDEO_URL_TTL_SECONDS, 300),
};

if (isProd) {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (config.corsOrigins.some((o) => o.startsWith('http://localhost'))) {
    console.warn('[config] CORS_ORIGINS still contains localhost; set it to your real frontend origin.');
  }
  if (missing.length) throw new Error('Missing required environment variables: ' + missing.join(', '));
}

module.exports = config;
