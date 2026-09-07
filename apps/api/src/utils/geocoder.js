const fs = require('node:fs/promises');
const path = require('node:path');

function createGeocoder({ fetcher = fetch, cacheFile = path.join(__dirname, '../../data/geocoder-cache.json'), interval = 1100, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const cache = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  let nextRequest = 0;
  let blockedUntil = 0;
  let writes = Promise.resolve();
  const ready = cacheFile ? fs.readFile(cacheFile, 'utf8').then(text => {
    for (const [key, value] of JSON.parse(text)) if (typeof value.name === 'string' && value.expires > now()) cache.set(key, value);
  }).catch(() => {}) : Promise.resolve();
  const unavailable = () => Object.assign(new Error('Place lookup temporarily unavailable'), { status: 503, retryAfter: Math.max(30, Math.ceil((blockedUntil - now()) / 1000)) });
  function persist() {
    if (!cacheFile) return;
    writes = writes.then(async () => {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(`${cacheFile}.tmp`, JSON.stringify([...cache]), 'utf8');
      await fs.rename(`${cacheFile}.tmp`, cacheFile);
    }).catch(error => console.error('[location] cache write failed:', error.code));
  }
  async function lookup(latitude, longitude, language = 'en') {
    await ready;
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}:${language}`;
    const saved = cache.get(key);
    if (saved?.expires > now()) return saved.name;
    if (pending.has(key)) return pending.get(key);
    if (blockedUntil > now() || pending.size >= 10) throw unavailable();
    const job = queue.then(async () => {
      if (blockedUntil > now()) throw unavailable();
      await sleep(Math.max(0, nextRequest - now()));
      nextRequest = now() + interval;
      const params = new URLSearchParams({ format: 'jsonv2', lat: String(latitude), lon: String(longitude), zoom: '18', addressdetails: '1', 'accept-language': language });
      try {
        const response = await fetcher(`${process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/reverse'}?${params}`, {
          headers: { Accept: 'application/json', 'User-Agent': process.env.GEOCODER_USER_AGENT || 'TrackField/1.0 (company attendance)' }, signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
          const retry = response.headers.get('retry-after');
          const seconds = /^\d+$/.test(retry || '') ? Number(retry) : Math.max(0, (Date.parse(retry) - now()) / 1000) || 0;
          blockedUntil = now() + Math.max(response.status === 403 ? 900 : 60, seconds) * 1000;
          console.warn('[location] geocoder HTTP', response.status);
          throw unavailable();
        }
        const data = await response.json();
        const a = data.address || {};
        const name = a.neighbourhood || a.suburb || a.quarter || a.borough || a.city_district || a.village || a.town || a.city || data.name || a.road || a.county || a.state || data.display_name;
        if (typeof name !== 'string' || !name.trim()) throw Object.assign(new Error('Place name not found'), { status: 404 });
        if (cache.size >= 5000) cache.delete(cache.keys().next().value);
        cache.set(key, { name: name.trim(), expires: now() + 30 * 86400000 });
        persist();
        return name.trim();
      } catch (error) {
        if (error.status) throw error;
        blockedUntil = now() + 30000;
        console.warn('[location] geocoder unavailable:', error.name);
        throw unavailable();
      }
    });
    pending.set(key, job);
    queue = job.catch(() => {});
    try { return await job; } finally { pending.delete(key); }
  }
  return { lookup, flush: () => writes };
}
module.exports = { createGeocoder };
