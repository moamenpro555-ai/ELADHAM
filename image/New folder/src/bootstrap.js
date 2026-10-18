'use strict';
// Runs once at server start: applies migrations and (optionally) creates the FIRST teacher from environment variables.
// The teacher is created only if that email does not exist yet, so changing the env var later never overwrites a password.
const db = require('./db');
const migrate = require('../scripts/migrate');
const { hashPassword, validatePasswordStrength } = require('./lib/passwords');

async function bootstrap() {
  if (process.env.AUTO_MIGRATE !== 'false') await migrate();
  const email = (process.env.TEACHER_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = process.env.TEACHER_BOOTSTRAP_PASSWORD || '';
  const name = (process.env.TEACHER_BOOTSTRAP_NAME || 'المدرس').trim();
  if (!email || !password) return;
  const weak = validatePasswordStrength(password, email);
  if (weak) { console.error('[bootstrap] TEACHER_BOOTSTRAP_PASSWORD rejected:', weak); return; }
  const exists = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  if (exists.rows.length) { console.log('[bootstrap] teacher already exists, nothing to do'); return; }
  await db.query(
    `INSERT INTO users (email, name, password_hash, role, must_change_password) VALUES ($1, $2, $3, 'teacher', false)`,
    [email, name, await hashPassword(password)]);
  console.log('[bootstrap] first teacher created');
}
module.exports = bootstrap;
