const placeCache = new Map()
const pendingPlaces = new Map()
const PLACE_CACHE_VERSION = 'v6'
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

function cacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`
}

export function isGenericLocationLabel(label) {
  return !label || ['Update location', 'Shared live location', 'Live location', 'Place name unavailable', 'Tap to view exact location'].includes(label)
}

export async function resolvePlaceName(latitude, longitude) {
  const key = cacheKey(latitude, longitude)
  if (placeCache.has(key)) return placeCache.get(key)
  if (pendingPlaces.has(key)) return pendingPlaces.get(key)

  try {
    const stored = window.localStorage.getItem(`place:${PLACE_CACHE_VERSION}:${key}`)
    if (stored) {
      placeCache.set(key, stored)
      return stored
    }
  } catch {}

  const lookup = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/location/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&language=${encodeURIComponent(navigator.language || 'en')}`)
      if (!response.ok) throw new Error('Place lookup failed')
      const data = await response.json()
      const place = data?.name
      if (!place) throw new Error('Place name missing')
      placeCache.set(key, place)
      try { window.localStorage.setItem(`place:${PLACE_CACHE_VERSION}:${key}`, place) } catch {}
      return place
    } catch {
      return 'Tap to view exact location'
    } finally {
      pendingPlaces.delete(key)
    }
  })()

  pendingPlaces.set(key, lookup)
  return lookup
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
