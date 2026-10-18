'use strict';
const { createApp } = require('./http');

function buildApp() {
  const app = createApp();
  require('./routes/auth')(app);
  require('./routes/courses')(app);
  require('./routes/teacher')(app);
  require('./routes/exams')(app);
  return app;
}
module.exports = { buildApp };
