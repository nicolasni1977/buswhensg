import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  findByCode,
  findNearest,
  searchStops,
  frecencyTop,
  arrivalText,
  isValidStopCode,
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
