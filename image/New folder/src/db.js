'use strict';
const { Pool } = require('./pg');
const config = require('./config');

let pool = null;
function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: config.dbPoolMax });
  }
  return pool;
}

// All SQL in this project goes through these helpers and ALWAYS uses $1, $2 ... parameters.
module.exports = {
  query: (text, params) => getPool().query(text, params),
  tx: (fn) => getPool().tx(fn),
  end: async () => { if (pool) { await pool.end(); pool = null; } },
};
