const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createGeocoder } = require('./geocoder');
const result = name => new Response(JSON.stringify({ address: { suburb: name } }));
test('deduplicates concurrent lookups, spaces requests and separates languages', async () => {
  let clock = 1000;
  const calls = [];
  const geocoder = createGeocoder({ cacheFile: null, now: () => clock, sleep: async ms => { clock += ms; }, fetcher: async url => { calls.push({ time: clock, url }); return result('Dhaka'); } });
  const values = await Promise.all([geocoder.lookup(23, 90), geocoder.lookup(23, 90), geocoder.lookup(24, 90)]);
  assert.deepEqual(values, ['Dhaka', 'Dhaka', 'Dhaka']);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].time - calls[0].time >= 1100);
  await geocoder.lookup(23, 90);
  assert.equal(calls.length, 2);
  await geocoder.lookup(23, 90, 'bn');
  assert.equal(calls.length, 3);
});
test('respects provider cooldown and recovers instead of caching errors as names', async () => {
  let clock = 1000;
  let calls = 0;
  const geocoder = createGeocoder({ cacheFile: null, now: () => clock, sleep: async ms => { clock += ms; }, fetcher: async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '120' } }) : result('Recovered place') });
  await assert.rejects(geocoder.lookup(23, 90), error => error.status === 503 && error.retryAfter === 120);
  await assert.rejects(geocoder.lookup(24, 90));
  assert.equal(calls, 1);
  clock += 121000;
  assert.equal(await geocoder.lookup(23, 90), 'Recovered place');
  assert.equal(calls, 2);
});
test('keeps successful names across restarts and supports display_name-only responses', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'trackfield-geocoder-'));
  const cacheFile = path.join(directory, 'cache.json');
  try {
    const first = createGeocoder({ cacheFile, interval: 0, fetcher: async () => new Response(JSON.stringify({ display_name: 'Road, Dhaka' })) });
    assert.equal(await first.lookup(23, 90), 'Road, Dhaka');
    await first.flush();
    const second = createGeocoder({ cacheFile, fetcher: async () => assert.fail('Must use persisted cache') });
    assert.equal(await second.lookup(23, 90), 'Road, Dhaka');
  } finally {
    await fs.unlink(cacheFile).catch(() => {});
    await fs.rmdir(directory);
  }
});
