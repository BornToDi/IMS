const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../prismaClient');
const { getGlobalMessages } = require('./globalChatController');

test('chat history uses stable cursors, bounded pages and server-side date filters', async () => {
  const originals = { findMany: prisma.globalMessage.findMany, findUnique: prisma.globalMessage.findUnique };
  const time = new Date('2026-10-25T03:15:00Z');
  let query;
  let exists = true;
  prisma.globalMessage.findUnique = async ({ where }) => exists ? { id: where.id, createdAt: time } : null;
  prisma.globalMessage.findMany = async args => { query = args; return [{ id: 'b' }, { id: 'a' }]; };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    let res = response();
    await getGlobalMessages({ query: { limit: '100', before: 'cursor' } }, res);
    assert.equal(query.take, 100);
    assert.equal(query.skip, 0);
    assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.deepEqual(query.where.OR, [{ createdAt: { lt: time } }, { createdAt: time, id: { lt: 'cursor' } }]);
    assert.deepEqual(res.body, [{ id: 'a' }, { id: 'b' }]);
    res = response();
    await getGlobalMessages({ query: { through: 'notification', from: '2026-10-24T18:00:00Z', until: '2026-10-25T18:00:00Z', limit: '9999' } }, res);
    assert.equal(query.take, 200);
    assert.deepEqual(query.where.OR[1], { createdAt: time, id: { lte: 'notification' } });
    assert.equal(query.where.createdAt.gte.toISOString(), '2026-10-24T18:00:00.000Z');
    assert.equal(query.where.createdAt.lt.toISOString(), '2026-10-25T18:00:00.000Z');
    for (const filters of [{ from: 'invalid', until: '2026-10-25' }, { from: '2026-10-26', until: '2026-10-25' }, { before: ['bad'] }]) {
      query = undefined;
      res = response();
      await getGlobalMessages({ query: filters }, res);
      assert.equal(res.code, 400);
      assert.equal(query, undefined);
    }
    exists = false;
    res = response();
    await getGlobalMessages({ query: { before: 'deleted' } }, res);
    assert.equal(res.code, 404);
  } finally {
    prisma.globalMessage.findMany = originals.findMany;
    prisma.globalMessage.findUnique = originals.findUnique;
    await prisma.$disconnect();
  }
});
