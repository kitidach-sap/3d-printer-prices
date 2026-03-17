require('dotenv').config();
const handler = require('./api/cron/twitter.js');

const req = {
  headers: {},
  query: { key: process.env.ADMIN_KEY }
};
const res = {
  json: (data) => console.log('RESPONSE:', data),
  status: (code) => ({ json: (data) => console.log('STATUS:', code, 'RESPONSE:', data) }),
};

(async () => {
  await handler(req, res);
})();
