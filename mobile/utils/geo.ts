/**
 * BestMe — Geo utilities
 * ========================
 * Plain distance math for GPS route tracking. No native deps, so it's
 * unit-testable outside Expo (see utils/__tests__).
 */

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lng points, in km. */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/** mm:ss (or h:mm:ss past an hour) — matches the workout session clock. */
export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "5:12 /km" — undefined once distance is too small to give a meaningful pace. */
export function formatPace(elapsedSeconds: number, distanceKm: number): string | null {
  if (distanceKm < 0.05) return null;
  const paceSecondsPerKm = elapsedSeconds / distanceKm;
  if (!Number.isFinite(paceSecondsPerKm)) return null;
  const m = Math.floor(paceSecondsPerKm / 60);
  const s = Math.round(paceSecondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}
