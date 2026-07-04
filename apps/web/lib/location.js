const placeCache = new Map()
const PLACE_CACHE_VERSION = 'v2'

function cacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`
}

export function isGenericLocationLabel(label) {
  return !label || ['Update location', 'Shared live location', 'Live location'].includes(label)
}

export async function resolvePlaceName(latitude, longitude) {
  const key = cacheKey(latitude, longitude)
  if (placeCache.has(key)) return placeCache.get(key)

  try {
    const stored = window.localStorage.getItem(`place:${PLACE_CACHE_VERSION}:${key}`)
    if (stored) {
      placeCache.set(key, stored)
      return stored
    }
  } catch {}

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      zoom: '18',
      addressdetails: '1'
    })
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`)
    if (!response.ok) throw new Error('Place lookup failed')
    const data = await response.json()
    const address = data?.address || {}
    const specificPlace = [
      address.building,
      address.amenity,
      address.office,
      address.shop,
      address.tourism
    ].find(Boolean)
    const locality = address.quarter || address.neighbourhood || address.suburb || address.borough
    const parts = [
      specificPlace,
      locality,
      address.road,
      address.city || address.town || address.village
    ].filter(Boolean)
    const place = [...new Set(parts)].slice(0, 3).join(', ') || data?.name || data?.display_name || 'Place name unavailable'
    placeCache.set(key, place)
    try { window.localStorage.setItem(`place:${PLACE_CACHE_VERSION}:${key}`, place) } catch {}
    return place
  } catch {
    return 'Place name unavailable'
  }
}

export async function getCurrentLocationWithPlace() {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new Error('Location is not supported on this browser')
  }

  const coords = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }),
      (error) => reject(new Error(error?.message || 'Location permission denied')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  })

  return { ...coords, locationLabel: await resolvePlaceName(coords.latitude, coords.longitude) }
}
