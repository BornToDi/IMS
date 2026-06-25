const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'change_me_access', { expiresIn: ACCESS_EXPIRES });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'change_me_refresh', { expiresIn: REFRESH_EXPIRES });
}

function verify(token, type = 'access') {
  const secret = type === 'access' ? (process.env.JWT_ACCESS_SECRET || 'change_me_access') : (process.env.JWT_REFRESH_SECRET || 'change_me_refresh');
  return jwt.verify(token, secret);
}

module.exports = { signAccess, signRefresh, verify };
