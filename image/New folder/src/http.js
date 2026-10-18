'use strict';
// Tiny HTTP framework on node:http: router, JSON body parsing, cookies, CORS, security headers, error handling.
const config = require('./config');

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}

const MAX_BODY = 100 * 1024; // 100 KB is plenty for this API

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY) return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'البيانات المرسلة كبيرة جدًا'));
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'البيانات المرسلة كبيرة جدًا')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve(undefined);
      const type = String(req.headers['content-type'] || '');
      if (!/^application\/json/i.test(type)) return reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'لازم Content-Type يكون application/json'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'INVALID_JSON', 'الـ JSON المرسل غير صحيح')); }
    });
    req.on('error', reject);
  });
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > limit) return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'الملف كبير جدًا'));
    const chunks = []; let size = 0; let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) { failed = true; reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'الملف كبير جدًا')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const hops = config.trustProxyHops;
  if (hops > 0) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    // the Nth entry from the RIGHT is what our own trusted proxy saw; anything further left can be spoofed
    if (xff.length >= hops) return xff[xff.length - hops];
  }
  return req.socket.remoteAddress || '';
}

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  return { re, keys };
}

function createApp() {
  const routes = [];
  const app = {
    // app.route('POST', '/api/x', mw1, mw2, handler)
    // The first handler may be an options object { rawLimit: bytes } for binary uploads (the handler then calls
    // `await ctx.readRaw()` AFTER the auth middleware has run, so anonymous clients can't make us buffer big bodies).
    route(method, pattern, ...handlers) {
      let rawLimit = 0;
      if (handlers[0] && typeof handlers[0] === 'object') rawLimit = handlers.shift().rawLimit || 0;
      routes.push({ method, ...compile(pattern), handlers, rawLimit });
    },
  };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    app[m] = (pattern, ...handlers) => app.route(m.toUpperCase(), pattern, ...handlers);
  }

  function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Returns true when the request Origin is one of our frontends.
  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (!config.corsOrigins.includes(origin)) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return true;
  }

  function send(res, status, payload) {
    if (res.headersSent || res.writableEnded) return;
    const body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  }

  app.handler = async (req, res) => {
    setSecurityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const originOk = applyCors(req, res);

    if (req.method === 'OPTIONS') {
      if (!originOk || !req.headers.origin) { res.statusCode = 403; return res.end(); }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Max-Age', '600');
      res.statusCode = 204; return res.end();
    }

    const ctx = {
      req, res, url, query: Object.fromEntries(url.searchParams), params: {}, body: undefined,
      cookies: parseCookies(req.headers.cookie), ip: clientIp(req), user: null, session: null,
      json: (status, data) => send(res, status, { ok: true, data }),
      rawLimit: 0,
      readRaw: () => readRaw(req, ctx.rawLimit),
      // Sends a stored file. Only call after the access check.
      sendBinary(type, buf) {
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Length', buf.length);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, no-store');
        res.end(buf);
      },
      setCookie(name, value, opts = {}) {
        const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`];
        if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
        if (opts.httpOnly) parts.push('HttpOnly');
        if (opts.secure) parts.push('Secure');
        if (opts.sameSite) parts.push(`SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`);
        const prev = res.getHeader('Set-Cookie');
        res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
      },
    };

    try {
      // A browser request from an origin we do not know is rejected outright (also stops cross-site form posts).
      if (!originOk) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'المصدر ده غير مسموح');

      const path = url.pathname;
      let match = null; let pathExists = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        pathExists = true;
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        match = { r, m }; break;
      }
      if (!match) {
        if (pathExists) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'الطريقة غير مسموحة');
        throw new HttpError(404, 'NOT_FOUND', 'المسار غير موجود');
      }
      match.r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(match.m[i + 1]); });
      ctx.rawLimit = match.r.rawLimit;
      if (!match.r.rawLimit && ['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readJson(req);

      for (const h of match.r.handlers) {
        await h(ctx);
        if (res.writableEnded) break;
      }
      if (!res.writableEnded) throw new Error('handler did not send a response');
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
      } else if (err && err.status && err.code && err.status < 500) {
        send(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
      } else {
        // Log the cause WITHOUT request bodies, cookies or tokens; tell the client nothing about internals.
        console.error(`[error] ${req.method} ${url.pathname}:`, err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
        const status = err && err.status >= 500 ? err.status : 500;
        send(res, status, { ok: false, error: { code: (err && err.code) || 'SERVER_ERROR', message: 'حصل خطأ في السيرفر، جرّب تاني بعد شوية' } });
      }
    }
  };

  return app;
}

module.exports = { createApp, HttpError, parseCookies };
