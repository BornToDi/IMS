const express = require('express');
const { createGeocoder } = require('../utils/geocoder');
const router = express.Router();
const geocoder = createGeocoder();

router.get('/reverse', async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (typeof req.query.lat !== 'string' || !req.query.lat.trim() || typeof req.query.lon !== 'string' || !req.query.lon.trim() || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required' });
  const language = String(req.query.language || 'en').replace(/[^a-zA-Z0-9,;-]/g, '').slice(0, 40) || 'en';
  try {
    res.json({ name: await geocoder.lookup(latitude, longitude, language) });
  } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    res.status(error.status || 502).json({ error: error.message });
  }
});
module.exports = router;
