const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';

function getSecret(type) {
  const key = type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
  const fallback = type === 'access' ? 'change_me_access' : 'change_me_refresh';
  const secret = process.env[key];
  if (process.env.NODE_ENV === 'production' && (!secret || secret === fallback)) {
    throw new Error(`${key} must be configured in production`);
  }
  return secret || fallback;
}

function signAccess(payload) {
  return jwt.sign(payload, getSecret('access'), { expiresIn: ACCESS_EXPIRES });
}

function signRefresh(payload) {
  return jwt.sign(payload, getSecret('refresh'), { expiresIn: REFRESH_EXPIRES });
}

function verify(token, type = 'access') {
  return jwt.verify(token, getSecret(type));
}

module.exports = { signAccess, signRefresh, verify };
