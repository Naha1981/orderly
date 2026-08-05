// Orderly — geo utilities (haversine distance + radius check)

export type LatLng = { lat: number; lng: number }

const R_EARTH_METERS = 6_371_000

const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Haversine great-circle distance in meters between two coordinates.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_METERS * Math.asin(Math.sqrt(h))
}

export function isWithinRadius(
  customer: LatLng,
  restaurant: LatLng,
  radiusMeters: number,
): { within: boolean; distanceM: number } {
  const distanceM = haversineMeters(customer, restaurant)
  return { within: distanceM <= radiusMeters, distanceM }
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}
