// Pure, framework-free helpers for BusWhenSG.
// Imported by the app (scripts.js) AND the unit tests (tests/lib.test.js).
// No DOM, no globals — everything here is deterministic and testable.

/** Great-circle distance in kilometres (Haversine). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Find a stop by exact 5-digit code; null if absent. */
export function findByCode(code, stops) {
  return stops.find((s) => s.code === code) || null;
}

/** Nearest stop to a coordinate; null for an empty list. */
export function findNearest(lat, lng, stops) {
  let best = null;
  let min = Infinity;
  for (const s of stops) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < min) {
      min = d;
      best = s;
    }
  }
  return best;
}

/** Search by code / name / road. Exact code matches rank first. */
export function searchStops(query, stops, limit = 8) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const exact = stops.filter((s) => s.code === q);
  const partial = stops.filter(
    (s) =>
      s.code !== q &&
      (s.code.startsWith(q) ||
        s.name.toLowerCase().includes(q) ||
        s.road.toLowerCase().includes(q))
  );
  return [...exact, ...partial].slice(0, limit);
}

/** Frecency ranking (visits + recency); pinned stops always first. */
export function frecencyTop(data, now, limit = 5) {
  const dayMs = 86400000;
  const scored = Object.values(data).map((s) => ({
    ...s,
    score: (s.visits || 0) + Math.exp(-(now - (s.lastVisited || 0)) / (dayMs * 7)),
  }));
  const pinned = scored.filter((s) => s.pinned);
  const unpinned = scored.filter((s) => !s.pinned).sort((a, b) => b.score - a.score);
  return [...pinned, ...unpinned].slice(0, limit);
}

/** Human arrival label. <=1 min → the (localised) "Arriving" word; missing → dash. */
export function arrivalText(min, arrivingWord = 'Arriving') {
  if (min === null || min === undefined) return '—';
  return min <= 1 ? arrivingWord : `${min} min`;
}

/** True for a well-formed 5-digit Singapore bus stop code. */
export function isValidStopCode(code) {
  return /^\d{5}$/.test(code);
}

/**
 * Pick the ordered stop list for the service direction the inbound bus is on.
 * routes: { "<service>:<dir>": [stopCode,...] }. Prefer the direction that
 * passes the selected stop and ends at the bus's destination code.
 */
export function pickRouteDirection(routes, service, selectedStop, destCode) {
  const cands = [`${service}:1`, `${service}:2`].filter((k) => Array.isArray(routes[k]));
  if (!cands.length) return null;
  const withStop = cands.filter((k) => routes[k].includes(selectedStop));
  const pool = withStop.length ? withStop : cands;
  const byDest = pool.find((k) => routes[k][routes[k].length - 1] === destCode);
  return routes[byDest || pool[0]];
}

/** Map ordered stop codes to [lat,lng] pairs, skipping any not in the stop index. */
export function routeToLatLngs(stopCodes, stopIndex) {
  const out = [];
  for (const code of stopCodes || []) {
    const s = stopIndex[code];
    if (s && Number.isFinite(s.lat) && Number.isFinite(s.lng)) out.push([s.lat, s.lng]);
  }
  return out;
}
