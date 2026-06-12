import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  findByCode,
  findNearest,
  searchStops,
  frecencyTop,
  arrivalText,
  isValidStopCode,
  pickRouteDirection,
  routeToLatLngs,
  busProgress,
  routeStopEtas,
} from '../public/lib.js';

const STOPS = [
  { code: '01012', name: 'Hotel Grand Pacific', road: 'Victoria St', lat: 1.29685, lng: 103.85254 },
  { code: '64319', name: 'Opp Riverfront Residences', road: 'Hougang Ave 7', lat: 1.36985, lng: 103.90038 },
  { code: '83139', name: 'Bef Bishan Stn', road: 'Bishan Pl', lat: 1.3509, lng: 103.8485 },
];

describe('haversineKm', () => {
  it('is ~0 for identical points', () => {
    expect(haversineKm(1.3, 103.8, 1.3, 103.8)).toBeCloseTo(0, 5);
  });
  it('is symmetric', () => {
    expect(haversineKm(1.3, 103.8, 1.36, 103.9)).toBeCloseTo(
      haversineKm(1.36, 103.9, 1.3, 103.8),
      9
    );
  });
  it('returns a plausible km distance between two SG stops', () => {
    const d = haversineKm(1.29685, 103.85254, 1.36985, 103.90038); // ~9.7 km
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(11);
  });
});

describe('findByCode', () => {
  it('finds an existing stop', () => {
    expect(findByCode('64319', STOPS).name).toBe('Opp Riverfront Residences');
  });
  it('returns null for a missing code', () => {
    expect(findByCode('00000', STOPS)).toBeNull();
  });
});

describe('findNearest', () => {
  it('returns the closest stop', () => {
    expect(findNearest(1.3699, 103.9004, STOPS).code).toBe('64319');
  });
  it('returns null on an empty list', () => {
    expect(findNearest(1.3, 103.8, [])).toBeNull();
  });
});

describe('searchStops', () => {
  it('ranks an exact code first', () => {
    expect(searchStops('64319', STOPS)[0].code).toBe('64319');
  });
  it('matches by name, case-insensitive', () => {
    expect(searchStops('riverfront', STOPS)[0].code).toBe('64319');
  });
  it('matches by road', () => {
    expect(searchStops('victoria', STOPS)[0].code).toBe('01012');
  });
  it('returns [] for a blank query', () => {
    expect(searchStops('   ', STOPS)).toEqual([]);
  });
});

describe('frecencyTop', () => {
  const now = 1_000_000_000_000;
  it('puts pinned stops first', () => {
    const data = {
      A: { code: 'A', visits: 9, lastVisited: now, pinned: false },
      B: { code: 'B', visits: 0, lastVisited: now, pinned: true },
    };
    expect(frecencyTop(data, now, 5)[0].code).toBe('B');
  });
  it('orders unpinned by visits + recency', () => {
    const data = {
      A: { code: 'A', visits: 5, lastVisited: now, pinned: false },
      B: { code: 'B', visits: 1, lastVisited: now, pinned: false },
    };
    expect(frecencyTop(data, now, 5).map((s) => s.code)).toEqual(['A', 'B']);
  });
  it('respects the limit', () => {
    const data = {};
    for (let i = 0; i < 10; i++) {
      data['s' + i] = { code: 's' + i, visits: i, lastVisited: now, pinned: false };
    }
    expect(frecencyTop(data, now, 5)).toHaveLength(5);
  });
});

describe('arrivalText', () => {
  it('shows "Arriving" for <= 1 min', () => {
    expect(arrivalText(0)).toBe('Arriving');
    expect(arrivalText(1)).toBe('Arriving');
  });
  it('shows minutes otherwise', () => {
    expect(arrivalText(7)).toBe('7 min');
  });
  it('localises the arriving word', () => {
    expect(arrivalText(1, '即将到达')).toBe('即将到达');
  });
  it('returns a dash for a missing arrival', () => {
    expect(arrivalText(null)).toBe('—');
    expect(arrivalText(undefined)).toBe('—');
  });
});

describe('isValidStopCode', () => {
  it('accepts 5 digits', () => {
    expect(isValidStopCode('64319')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isValidStopCode('123')).toBe(false);
    expect(isValidStopCode('abcde')).toBe(false);
    expect(isValidStopCode('123456')).toBe(false);
  });
});

describe('pickRouteDirection', () => {
  const routes = { '10:1': ['A', 'B', 'C'], '10:2': ['C', 'B', 'A'], '20:1': ['P', 'Q'] };
  it('prefers the direction ending at the destination code', () => {
    expect(pickRouteDirection(routes, '10', 'B', 'A')).toEqual(['C', 'B', 'A']);
    expect(pickRouteDirection(routes, '10', 'B', 'C')).toEqual(['A', 'B', 'C']);
  });
  it('falls back to the only existing direction', () => {
    expect(pickRouteDirection(routes, '20', 'P', 'Q')).toEqual(['P', 'Q']);
  });
  it('returns null for an unknown service', () => {
    expect(pickRouteDirection(routes, '99', 'X', 'Y')).toBeNull();
  });
});

describe('busProgress', () => {
  const idx = { A: { lat: 1.0, lng: 1.0 }, B: { lat: 1.1, lng: 1.1 }, C: { lat: 1.2, lng: 1.2 }, D: { lat: 1.3, lng: 1.3 } };
  const route = ['A', 'B', 'C', 'D'];
  it('counts stops from the bus to the user stop', () => {
    expect(busProgress(1.1, 1.1, route, idx, 'D')).toEqual({ busIdx: 1, userIdx: 3, stopsAway: 2 });
  });
  it('is 0 when the bus is at the user stop', () => {
    expect(busProgress(1.3, 1.3, route, idx, 'D').stopsAway).toBe(0);
  });
  it('returns null stopsAway when the user stop is not on the route', () => {
    expect(busProgress(1.1, 1.1, route, idx, 'Z').stopsAway).toBeNull();
  });
});

describe('routeStopEtas', () => {
  const idx = { A: { lat: 1.0, lng: 1.0 }, B: { lat: 1.01, lng: 1.0 }, C: { lat: 1.02, lng: 1.0 }, D: { lat: 1.03, lng: 1.0 } };
  const route = ['A', 'B', 'C', 'D'];
  it('distributes the ETA across upcoming stops (equal spacing → linear)', () => {
    const e = routeStopEtas(route, idx, 0, 3, 9);
    expect(e[0]).toBeNull();
    expect(e[1]).toBe(3);
    expect(e[2]).toBe(6);
    expect(e[3]).toBe(9); // user stop = the real ETA
  });
  it('returns all null when bus is past the user or ETA unknown', () => {
    expect(routeStopEtas(route, idx, 3, 1, 9).every((x) => x === null)).toBe(true);
    expect(routeStopEtas(route, idx, 0, 3, null).every((x) => x === null)).toBe(true);
  });
});

describe('routeToLatLngs', () => {
  const index = { A: { lat: 1.1, lng: 2.2 }, B: { lat: 3.3, lng: 4.4 } };
  it('maps codes to coords, skipping unknowns', () => {
    expect(routeToLatLngs(['A', 'X', 'B'], index)).toEqual([[1.1, 2.2], [3.3, 4.4]]);
  });
  it('handles empty input', () => {
    expect(routeToLatLngs([], index)).toEqual([]);
    expect(routeToLatLngs(undefined, index)).toEqual([]);
  });
});
