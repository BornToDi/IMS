const express = require('express');

const router = express.Router();
const cache = new Map();

router.get('/reverse', async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required' });
  }

  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (cache.has(key)) return res.json({ name: cache.get(key) });

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      zoom: '18',
      addressdetails: '1',
      'accept-language': String(req.query.language || 'en').slice(0, 20)
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.GEOCODER_USER_AGENT || 'Netfield/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);

    const data = await response.json();
    const address = data?.address || {};
    const name = address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.borough ||
      address.city_district ||
      address.village ||
      address.town ||
      address.city ||
      data?.name;
    if (!name) return res.status(404).json({ error: 'Place name not found' });

    if (cache.size >= 1000) cache.delete(cache.keys().next().value);
    cache.set(key, name);
    return res.json({ name });
  } catch (error) {
    console.error('[location] reverse lookup error:', error.message);
    return res.status(502).json({ error: 'Place lookup failed' });
  }
});

module.exports = router;
