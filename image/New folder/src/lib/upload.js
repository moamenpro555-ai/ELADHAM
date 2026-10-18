'use strict';
// Recognises uploaded files by their first bytes (magic numbers) instead of trusting the file name or the
// Content-Type header the browser sent. Only PNG / JPEG / WebP images and PDF are accepted (no SVG: it can carry scripts).
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
const LIMITS = { image: 6 * 1024 * 1024, pdf: 8 * 1024 * 1024, cover: 1024 * 1024 };
module.exports = { sniff, LIMITS };
