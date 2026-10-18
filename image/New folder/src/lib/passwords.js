'use strict';
// Password hashing with scrypt (memory-hard KDF built into Node). Argon2id is not available in Node 22's
// crypto module and external packages could not be installed, so scrypt with OWASP parameters is used.
// Stored format: scrypt$N$r$p$salt(b64)$hash(b64)  -> parameters can be raised later without breaking old hashes.
const crypto = require('node:crypto');
const config = require('../config');

const KEYLEN = 64;

function scrypt(password, salt, N, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r + (1 << 20) },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const { N, r, p } = config.scrypt;
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, r, p);
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), Number(N), Number(r), Number(p));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Used when the e-mail does not exist, so the response time does not reveal which e-mails are registered.
let dummy;
async function verifyDummy(password) {
  dummy = dummy || (await hashPassword('dummy-password-for-timing'));
  await verifyPassword(password, dummy);
  return false;
}

function validatePasswordStrength(password, email) {
  if (typeof password !== 'string') return 'كلمة السر مطلوبة';
  if (password.length < 8) return 'كلمة السر لازم تكون 8 حروف على الأقل';
  if (password.length > 128) return 'كلمة السر طويلة جدًا';
  if (email && password.toLowerCase() === String(email).toLowerCase()) return 'كلمة السر لازم تختلف عن الإيميل';
  if (/^(.)\1+$/.test(password) || /^(12345678|password|qwertyui)/i.test(password)) return 'كلمة السر سهلة جدًا';
  return null;
}

// Temporary password handed to a new student (no look-alike characters, shown once to the teacher).
function generateTempPassword(len = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

module.exports = { hashPassword, verifyPassword, verifyDummy, validatePasswordStrength, generateTempPassword };
