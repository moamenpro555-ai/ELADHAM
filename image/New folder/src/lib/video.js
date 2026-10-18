'use strict';
// Turns a lesson's stored video reference into a playback URL. It is called ONLY after the server has
// verified that the student may watch the lesson (see routes/lessons.js).
//
// Providers:
//   direct  - video_ref is returned as is. Whoever receives the URL can share it. This matches how the site works
//             today (plain MP4 files) and is NOT protected against copying.
//   signed  - video_ref is a URL on a CDN / video host / worker that you control. The API appends ?exp=<unix>&sig=<hmac>
//             where sig = HMAC-SHA256(VIDEO_SIGNING_SECRET, "<path>?exp=<unix>"). The host must verify it and reject
//             expired or invalid links. Use this when you move to a service that supports time-limited URLs.
// Nothing here can stop screen recording; links only stop casual sharing and hot-linking.
const crypto = require('node:crypto');
const config = require('../config');

function playbackFor(lesson, now = Date.now()) {
  if (!lesson.video_ref) return null;
  if (lesson.video_provider === 'signed') {
    if (!config.videoSigningSecret) {
      const err = new Error('VIDEO_SIGNING_SECRET is not configured');
      err.status = 503; err.code = 'VIDEO_NOT_CONFIGURED';
      throw err;
    }
    const url = new URL(lesson.video_ref);
    const exp = Math.floor(now / 1000) + config.videoUrlTtlSeconds;
    const sig = crypto.createHmac('sha256', config.videoSigningSecret).update(`${url.pathname}?exp=${exp}`).digest('hex');
    url.searchParams.set('exp', String(exp));
    url.searchParams.set('sig', sig);
    return { provider: 'signed', url: url.toString(), expiresAt: new Date(exp * 1000).toISOString() };
  }
  return { provider: 'direct', url: lesson.video_ref, expiresAt: null };
}

module.exports = { playbackFor };
