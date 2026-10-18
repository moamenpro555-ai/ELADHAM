'use strict';
// Fixed-window in-memory rate limiter. Keeps counts per process, which is right for a single server instance
// (e.g. one Render web service). If you scale to several instances, move the counters into the database/Redis.
const { HttpError } = require('../http');

function rateLimit({ windowMs, max, key, message = 'محاولات كتير، استنى شوية وجرّب تاني' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.min(windowMs, 60000));
  timer.unref();

  const limiter = async (ctx) => {
    const k = key(ctx);
    const now = Date.now();
    let e = hits.get(k);
    if (!e || e.resetAt <= now) { e = { count: 0, resetAt: now + windowMs }; hits.set(k, e); }
    e.count++;
    const retry = Math.ceil((e.resetAt - now) / 1000);
    ctx.res.setHeader('RateLimit-Limit', String(max));
    ctx.res.setHeader('RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      ctx.res.setHeader('Retry-After', String(retry));
      throw new HttpError(429, 'RATE_LIMITED', message, { retryAfterSeconds: retry });
    }
  };
  limiter.reset = () => hits.clear();
  return limiter;
}

module.exports = { rateLimit };
