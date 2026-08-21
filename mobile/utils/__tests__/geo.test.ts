/**
 * Tests for GPS route math (utils/geo.ts).
 *
 * Run with:  npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatClock, formatPace, haversineDistanceKm } from '../geo';

describe('haversineDistanceKm', () => {
  it('returns 0 for the same point', () => {
    assert.equal(haversineDistanceKm(19.4326, -99.1332, 19.4326, -99.1332), 0);
  });

  it('matches a known distance within rounding error', () => {
    // Mexico City Zócalo -> Ángel de la Independencia, ~3.7 km apart.
    const km = haversineDistanceKm(19.4326, -99.1332, 19.4270, -99.1677);
    assert.ok(km > 3.4 && km < 3.9, `expected ~3.7 km, got ${km}`);
  });
});

describe('formatClock', () => {
  it('formats under an hour as m:ss', () => {
    assert.equal(formatClock(75), '1:15');
  });

  it('formats an hour or more as h:mm:ss', () => {
    assert.equal(formatClock(3665), '1:01:05');
  });
});

describe('formatPace', () => {
  it('returns null when distance is too small to be meaningful', () => {
    assert.equal(formatPace(300, 0.01), null);
  });

  it('computes minutes per km', () => {
    // 30 min for 5 km = 6:00 /km.
    assert.equal(formatPace(1800, 5), '6:00 /km');
  });
});
