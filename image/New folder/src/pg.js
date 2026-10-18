'use strict';
// Minimal PostgreSQL client (wire protocol v3) built only on Node's net/tls/crypto.
// Why it exists: the build environment could not install npm packages, so this project has zero
// external dependencies. It supports what the API needs: trust / cleartext / md5 / SCRAM-SHA-256
// authentication, TLS, parameterized queries (extended protocol, text format), transactions and a
// small connection pool. It uses the *unnamed* prepared statement only, so it also works behind
// PgBouncer / Supabase transaction pooler. If you later prefer the official `pg` package, only this
// file and the `db.query / db.tx` calls in src/db.js need to change.

const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

class PgError extends Error {
  constructor(fields) {
    super(fields.M || 'database error');
    this.name = 'PgError';
    this.code = fields.C;      // SQLSTATE, e.g. 23505 = unique_violation
    this.severity = fields.S;
    this.detail = fields.D;
    this.constraint = fields.n;
    this.table = fields.t;
  }
}

function parseConnectionString(url) {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('DATABASE_URL must start with postgresql://');
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || decodeURIComponent(u.username),
  };
}

const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const cstr = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
function msg(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from(type), i32(body.length + 4), body]);
}

function encodeParam(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex'); // bytea (text format)
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function parseValue(oid, text) {
  if (text === null) return null;
  switch (oid) {
    case 16: return text === 't';
    case 20: case 21: case 23: case 700: case 701: return Number(text); // int8/int2/int4/float4/float8
    case 17: return Buffer.from(text.slice(2), 'hex'); // bytea comes back as \\x<hex>
    case 114: case 3802: return JSON.parse(text);
    case 1082: case 1114: case 1184: return new Date(text);
    default: return text;
  }
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

class Client {
  constructor(cfg) {
    this.cfg = cfg;
    this.buf = Buffer.alloc(0);
    this.queue = Promise.resolve();
    this.current = null;
    this.startup = null;
    this.dead = false;
    this.busy = false;
  }

  connect() {
    const { host, port } = this.cfg;
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host, port });
      this.startup = { resolve, reject };
      sock.once('error', (e) => this._fail(e));
      sock.once('connect', () => {
        if (this.cfg.ssl === 'disable') { this._attach(sock); return this._sendStartup(); }
        sock.once('data', (d) => {
          if (d[0] === 0x53) { // 'S' -> server accepts TLS
            const t = tls.connect({
              socket: sock,
              servername: net.isIP(host) ? undefined : host,
              rejectUnauthorized: this.cfg.ssl === 'verify',
            });
            t.once('error', (e) => this._fail(e));
            t.once('secureConnect', () => { this._attach(t); this._sendStartup(); });
          } else if (this.cfg.ssl === 'require' || this.cfg.ssl === 'verify') {
            this._fail(new Error('server does not support TLS but DATABASE_SSL requires it'));
          } else { // 'prefer' and server said 'N'
            this._attach(sock); this._sendStartup();
          }
        });
        sock.write(Buffer.concat([i32(8), i32(80877103)])); // SSLRequest
      });
    });
  }

  _attach(sock) {
    this.sock = sock;
    sock.on('data', (d) => this._onData(d));
    sock.on('error', (e) => this._fail(e));
    sock.on('close', () => this._fail(new Error('connection closed')));
  }

  _sendStartup() {
    const params = Buffer.concat([cstr('user'), cstr(this.cfg.user), cstr('database'), cstr(this.cfg.database),
      cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('eladham-api'), Buffer.from([0])]);
    const body = Buffer.concat([i32(196608), params]);
    this.sock.write(Buffer.concat([i32(body.length + 4), body]));
  }

  _fail(err) {
    if (this.dead) return;
    this.dead = true;
    if (this.startup) { const s = this.startup; this.startup = null; s.reject(err); }
    if (this.current) { const c = this.current; this.current = null; c.reject(err); }
    try { this.sock && this.sock.destroy(); } catch { /* ignore */ }
  }

  _onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const type = String.fromCharCode(this.buf[0]);
      const payload = this.buf.subarray(5, len + 1);
      this.buf = this.buf.subarray(len + 1);
      try { this._handle(type, payload); } catch (e) { this._fail(e); return; }
    }
  }

  _handle(type, p) {
    switch (type) {
      case 'R': return this._auth(p);
      case 'E': {
        const err = new PgError(this._fields(p));
        if (this.startup) { const s = this.startup; this.startup = null; s.reject(err); this._fail(err); }
        else if (this.current) this.current.error = err;
        return;
      }
      case 'Z': // ReadyForQuery
        if (this.startup) { const s = this.startup; this.startup = null; s.resolve(this); }
        else if (this.current) {
          const c = this.current; this.current = null;
          if (c.error) c.reject(c.error);
          else c.resolve({ rows: c.rows, rowCount: c.rowCount, fields: c.fields });
        }
        return;
      case 'T': { // RowDescription
        if (!this.current) return;
        const n = p.readInt16BE(0); let o = 2; const fields = [];
        for (let i = 0; i < n; i++) {
          const end = p.indexOf(0, o);
          const name = p.toString('utf8', o, end); o = end + 1;
          const oid = p.readInt32BE(o + 6); o += 18;
          fields.push({ name, oid });
        }
        this.current.fields = fields; return;
      }
      case 'D': { // DataRow
        const c = this.current; if (!c || !c.fields) return;
        const n = p.readInt16BE(0); let o = 2; const row = {};
        for (let i = 0; i < n; i++) {
          const l = p.readInt32BE(o); o += 4;
          let text = null;
          if (l >= 0) { text = p.toString('utf8', o, o + l); o += l; }
          row[c.fields[i].name] = parseValue(c.fields[i].oid, text);
        }
        c.rows.push(row); return;
      }
      case 'C': { // CommandComplete: "INSERT 0 1" / "UPDATE 3" / "SELECT 5"
        if (!this.current) return;
        const tag = p.toString('utf8', 0, p.length - 1).split(' ');
        const last = Number(tag[tag.length - 1]);
        this.current.rowCount = Number.isFinite(last) ? last : 0; return;
      }
      default: return; // ParseComplete, BindComplete, NoData, ParameterStatus, BackendKeyData, Notice ...
    }
  }

  _fields(p) {
    const f = {}; let o = 0;
    while (o < p.length && p[o] !== 0) {
      const k = String.fromCharCode(p[o]); const end = p.indexOf(0, o + 1);
      f[k] = p.toString('utf8', o + 1, end); o = end + 1;
    }
    return f;
  }

  _auth(p) {
    const code = p.readInt32BE(0);
    const { user, password } = this.cfg;
    switch (code) {
      case 0: return; // AuthenticationOk
      case 3: this.sock.write(msg('p', cstr(password))); return;
      case 5: {
        const salt = p.subarray(4, 8);
        const inner = crypto.createHash('md5').update(password + user).digest('hex');
        const outer = crypto.createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex');
        this.sock.write(msg('p', cstr('md5' + outer))); return;
      }
      case 10: { // SASL: start SCRAM-SHA-256
        const mechs = p.toString('utf8', 4).split('\0');
        if (!mechs.includes('SCRAM-SHA-256')) throw new Error('server offers no supported SASL mechanism');
        this.scram = { nonce: crypto.randomBytes(18).toString('base64') };
        this.scram.firstBare = `n=,r=${this.scram.nonce}`;
        const first = Buffer.from(`n,,${this.scram.firstBare}`);
        this.sock.write(msg('p', cstr('SCRAM-SHA-256'), i32(first.length), first)); return;
      }
      case 11: { // SASLContinue
        const serverFirst = p.toString('utf8', 4);
        const kv = Object.fromEntries(serverFirst.split(',').map((x) => [x[0], x.slice(2)]));
        if (!kv.r.startsWith(this.scram.nonce)) throw new Error('SCRAM nonce mismatch');
        const salted = crypto.pbkdf2Sync(password, Buffer.from(kv.s, 'base64'), Number(kv.i), 32, 'sha256');
        const clientKey = hmac(salted, 'Client Key');
        const noProof = `c=biws,r=${kv.r}`;
        const authMessage = `${this.scram.firstBare},${serverFirst},${noProof}`;
        const sig = hmac(sha256(clientKey), authMessage);
        const proof = Buffer.from(clientKey.map((b, i) => b ^ sig[i])).toString('base64');
        this.scram.serverSig = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
        this.sock.write(msg('p', Buffer.from(`${noProof},p=${proof}`))); return;
      }
      case 12: { // SASLFinal
        const v = p.toString('utf8', 4);
        if (v !== `v=${this.scram.serverSig}`) throw new Error('SCRAM server signature mismatch');
        return;
      }
      default: throw new Error(`unsupported authentication method (${code})`);
    }
  }

  query(text, params = []) {
    const run = () => new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error('connection is closed'));
      this.current = { resolve, reject, rows: [], rowCount: 0, fields: null, error: null };
      const enc = params.map(encodeParam);
      const bind = [cstr(''), cstr(''), i16(0), i16(enc.length)];
      for (const v of enc) {
        if (v === null) bind.push(i32(-1));
        else { const b = Buffer.from(v, 'utf8'); bind.push(i32(b.length), b); }
      }
      bind.push(i16(0)); // all results in text format
      this.sock.write(Buffer.concat([
        msg('P', cstr(''), cstr(text), i16(0)),
        msg('B', ...bind),
        msg('D', Buffer.from('P'), cstr('')),
        msg('E', cstr(''), i32(0)),
        msg('S'),
      ]));
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  close() {
    if (this.dead) return;
    try { this.sock.write(msg('X')); } catch { /* ignore */ }
    this.dead = true;
    try { this.sock.end(); } catch { /* ignore */ }
  }
}

class Pool {
  constructor({ connectionString, ssl = 'prefer', max = 5, idleMs = 30000 }) {
    this.cfg = { ...parseConnectionString(connectionString), ssl };
    this.max = max;
    this.idleMs = idleMs;
    this.idle = [];
    this.total = 0;
    this.waiters = [];
    this.closed = false;
  }

  async _acquire() {
    if (this.closed) throw new Error('pool is closed');
    while (this.idle.length) {
      const c = this.idle.pop();
      clearTimeout(c.idleTimer);
      if (!c.dead) return c;
      this.total--;
    }
    if (this.total < this.max) {
      this.total++;
      try { return await new Client(this.cfg).connect(); }
      catch (e) { this.total--; throw e; }
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  _release(c) {
    if (c.dead || this.closed) { this.total--; if (!c.dead) c.close(); return this._wake(); }
    const w = this.waiters.shift();
    if (w) return w(c);
    c.idleTimer = setTimeout(() => { this.idle = this.idle.filter((x) => x !== c); this.total--; c.close(); }, this.idleMs);
    c.idleTimer.unref();
    this.idle.push(c);
  }

  async _wake() { // a slot freed up; let a waiter open a fresh connection
    const w = this.waiters.shift();
    if (!w) return;
    try { this.total++; w(await new Client(this.cfg).connect()); }
    catch (e) { this.total--; this.waiters.unshift(w); }
  }

  async query(text, params) {
    const c = await this._acquire();
    try { return await c.query(text, params); } finally { this._release(c); }
  }

  // Runs fn(tx) inside BEGIN/COMMIT on ONE connection; rolls back on any thrown error.
  async tx(fn) {
    const c = await this._acquire();
    try {
      await c.query('BEGIN');
      const result = await fn({ query: (t, p) => c.query(t, p) });
      await c.query('COMMIT');
      return result;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { c.dead = true; }
      throw e;
    } finally { this._release(c); }
  }

  async end() {
    this.closed = true;
    for (const c of this.idle) { clearTimeout(c.idleTimer); c.close(); }
    this.idle = []; this.total = 0;
  }
}

module.exports = { Pool, Client, PgError, parseConnectionString };
