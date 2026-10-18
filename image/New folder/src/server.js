'use strict';
const http = require('node:http');
const config = require('./config');
const db = require('./db');
const { buildApp } = require('./app');
const bootstrap = require('./bootstrap');

const app = buildApp();
const server = http.createServer(app.handler);
server.requestTimeout = 30000;
server.headersTimeout = 15000;

bootstrap().then(() => {
  server.listen(config.port, () => {
    console.log(`ELADHAM API listening on :${config.port} (${config.isProd ? 'production' : 'development'})`);
  });
}).catch((e) => { console.error('startup failed:', e.message); process.exit(1); });

async function shutdown() {
  server.close(async () => { await db.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
