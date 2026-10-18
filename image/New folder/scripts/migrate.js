'use strict';
// Applies every migrations/*.sql file that has not been applied yet (in filename order).
const fs = require('node:fs');
const path = require('node:path');
const db = require('../src/db');

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async (tx) => {
      // the simple multi-statement SQL file is split on ';' at line ends (our files have no function bodies)
      for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !/^(--.*\n?)+$/.test(s))) {
        await tx.query(stmt);
      }
      await tx.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    console.log('applied', f);
    applied++;
  }
  if (!applied) console.log('database is up to date');
}

if (require.main === module) {
  migrate().then(() => db.end()).catch((e) => { console.error('migration failed:', e.message); process.exit(1); });
}
module.exports = migrate;
