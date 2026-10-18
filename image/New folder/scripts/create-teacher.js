'use strict';
// Creates (or promotes) a teacher account. Run it on the server / your computer, NEVER through the web API:
//   npm run create-teacher -- teacher@example.com "اسم المدرس"
// The password is read from the TEACHER_PASSWORD environment variable, or typed at the prompt (hidden input).
const readline = require('node:readline');
const db = require('../src/db');
const { hashPassword, validatePasswordStrength } = require('../src/lib/passwords');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const [email, name] = process.argv.slice(2);
  if (!email || !name) { console.error('usage: npm run create-teacher -- <email> "<name>"'); process.exit(1); }
  const password = process.env.TEACHER_PASSWORD || (await askHidden('Password: '));
  const weak = validatePasswordStrength(password, email);
  if (weak) { console.error(weak); process.exit(1); }
  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash, role, must_change_password) VALUES ($1, $2, $3, 'teacher', false)
     ON CONFLICT ((lower(email))) DO UPDATE SET role = 'teacher', password_hash = EXCLUDED.password_hash, name = EXCLUDED.name,
       is_active = true, must_change_password = false, updated_at = now()
     RETURNING id`, [email.trim().toLowerCase(), name.trim(), hash]);
  console.log('teacher ready:', rows[0].id);
  await db.end();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
