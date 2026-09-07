const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const prisma = require('../prismaClient');
const { signRefresh } = require('../utils/jwt');
const { refresh } = require('./authController');

test('refresh preserves cookie sessions behind Nginx HTTPS and distinguishes outages from invalid sessions', async () => {
  const original = prisma.user.findUnique;
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.post('/api/auth/refresh', refresh);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/refresh`;
  const token = signRefresh({ userId: 'employee' });
  const headers = { Cookie: `refreshToken=${token}` };
  try {
    prisma.user.findUnique = async () => ({ id: 'employee', name: 'Employee', passwordHash: 'never-return-this' });
    let response = await fetch(url, { method: 'POST', headers: { ...headers, 'X-Forwarded-Proto': 'https' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
    assert.match(response.headers.get('set-cookie'), /Path=\/api/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.user.id, 'employee');
    assert.equal(body.user.passwordHash, undefined);
    response = await fetch(url, { method: 'POST', headers });
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get('set-cookie'), /; Secure/);
    prisma.user.findUnique = async () => { throw Object.assign(new Error('Database unavailable'), { code: 'P1001' }); };
    response = await fetch(url, { method: 'POST', headers });
    assert.equal(response.status, 503);
    response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 401);
    response = await fetch(url, { method: 'POST', headers: { Cookie: 'refreshToken=invalid' } });
    assert.equal(response.status, 401);
  } finally {
    prisma.user.findUnique = original;
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});
