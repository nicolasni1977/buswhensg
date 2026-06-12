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

/**
 * Where the bus is along its route, relative to the user's stop.
 * Finds the route stop nearest the bus's GPS, and how many stops until the user's stop.
 * Returns { busIdx, userIdx, stopsAway } (stopsAway null if either can't be placed).
 */
export function busProgress(busLat, busLng, stopCodes, stopIndex, userStop) {
  let busIdx = -1;
  let min = Infinity;
  (stopCodes || []).forEach((code, i) => {
    const s = stopIndex[code];
    if (!s) return;
    const d = haversineKm(busLat, busLng, s.lat, s.lng);
    if (d < min) { min = d; busIdx = i; }
  });
  const userIdx = (stopCodes || []).indexOf(userStop);
  const stopsAway = busIdx >= 0 && userIdx >= 0 ? userIdx - busIdx : null;
  return { busIdx, userIdx, stopsAway };
}

/**
 * APPROXIMATE per-stop ETAs (minutes), distributing the bus's known ETA-to-user
 * across the route by cumulative distance. Returns an array aligned to stopCodes
 * (null for passed/unknown stops). Honest approximation — label it "~" in the UI.
 */
export function routeStopEtas(stopCodes, stopIndex, busIdx, userIdx, etaMin) {
  const n = (stopCodes || []).length;
  const etas = new Array(n).fill(null);
  if (busIdx < 0 || userIdx <= busIdx || etaMin == null) return etas;
  const cum = new Array(n).fill(0);
  for (let i = busIdx + 1; i < n; i++) {
    const a = stopIndex[stopCodes[i - 1]];
    const b = stopIndex[stopCodes[i]];
    cum[i] = cum[i - 1] + (a && b ? haversineKm(a.lat, a.lng, b.lat, b.lng) : 0);
  }
  const base = cum[userIdx];
  for (let i = busIdx + 1; i < n; i++) {
    const ratio = base > 0 ? cum[i] / base : (i - busIdx) / (userIdx - busIdx);
    etas[i] = Math.max(1, Math.round(etaMin * ratio));
  }
  return etas;
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
