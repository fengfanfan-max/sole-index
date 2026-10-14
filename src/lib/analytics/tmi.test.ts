/**
 * TMI unit tests.
 *
 * The point of this file is not coverage for its own sake. It pins down the two
 * properties that make the index usable in a product:
 *
 *   1. **Direction is correct.** More demand must score higher, always — across
 *      price, volume, sell-through and attention.
 *   2. **It never lies quietly.** Every degenerate input (empty window, a single
 *      print, constant price, zero volume) must produce a well-formed neutral
 *      result with an explanatory note, never a confident-looking number and
 *      never NaN.
 */
import { describe, expect, it } from 'vitest';

import {
  computePriceVelocity,
  computeReturnVolatility,
  computeTmi,
  computeTurnover,
  computeVolumeDelta,
  rankByTmi,
  TMI_FACTORS,
  TMI_WEIGHTS,
  type TmiObservation,
} from './tmi';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const START = '2026-01-05'; // a Monday

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

interface SeriesOptions {
  weeks?: number;
  startPrice?: number;
  endPrice?: number;
  volume?: number;
  listings?: number;
  endVolume?: number;
  /** Alternating ±jitter fraction applied to price, for volatility tests. */
  jitter?: number;
  start?: string;
}

/** Build a linear price ramp with flat volume, which is easy to reason about. */
function series(options: SeriesOptions = {}): TmiObservation[] {
  const {
    weeks = 13,
    startPrice = 20_000,
    endPrice = 20_000,
    volume = 10,
    listings = 40,
    endVolume = volume,
    jitter = 0,
    start = START,
  } = options;

  return Array.from({ length: weeks }, (_, i) => {
    const t = weeks === 1 ? 0 : i / (weeks - 1);
    const base = startPrice + (endPrice - startPrice) * t;
    const wobble = jitter === 0 ? 0 : (i % 2 === 0 ? jitter : -jitter) * base;
    return {
      date: addWeeks(start, i),
      lastSaleCents: Math.round(base + wobble),
      volume: Math.round(volume + (endVolume - volume) * t),
      activeListings: listings,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Weights                                                                     */
/* -------------------------------------------------------------------------- */

describe('TMI weights', () => {
  it('sum to exactly 1', () => {
    const total = TMI_FACTORS.reduce((acc, f) => acc + TMI_WEIGHTS[f], 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('exposes every factor in a stable order', () => {
    expect(TMI_FACTORS).toEqual([
      'priceVelocity',
      'volumeDelta',
      'volatility',
      'sellThrough',
      'attention',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Factor primitives                                                           */
/* -------------------------------------------------------------------------- */

describe('computePriceVelocity', () => {
  it('is positive for a rising series and negative for a falling one', () => {
    expect(computePriceVelocity(series({ startPrice: 20_000, endPrice: 26_000 }))).toBeGreaterThan(0);
    expect(computePriceVelocity(series({ startPrice: 20_000, endPrice: 15_000 }))).toBeLessThan(0);
  });

  it('is approximately zero for a flat series', () => {
    expect(Math.abs(computePriceVelocity(series()))).toBeLessThan(1e-6);
  });

  it('ignores a single outlier print rather than chasing it', () => {
    // OLS over the whole window should be far less sensitive than endpoint
    // comparison would be.
    const base = series({ startPrice: 20_000, endPrice: 20_000 });
    const spiked = base.map((o, i) =>
      i === base.length - 1 ? { ...o, lastSaleCents: o.lastSaleCents * 2 } : o,
    );
    const endpointChange = 2 - 1; // +100% first-to-last
    const fitted = computePriceVelocity(spiked) * 91; // approx window change
    expect(fitted).toBeLessThan(endpointChange);
  });

  it('returns 0 rather than NaN when there are too few points', () => {
    expect(computePriceVelocity([])).toBe(0);
    expect(computePriceVelocity(series({ weeks: 2 }))).toBe(0);
  });

  it('is scale-free: a $90 shoe and a $900 shoe move identically', () => {
    const cheap = computePriceVelocity(series({ startPrice: 9_000, endPrice: 10_800 }));
    const dear = computePriceVelocity(series({ startPrice: 90_000, endPrice: 108_000 }));
    expect(cheap).toBeCloseTo(dear, 10);
  });
});

describe('computeVolumeDelta', () => {
  it('is 1 for flat volume, even though an odd window splits 6/7', () => {
    // Regression guard: splitting purely by count made a 13-point flat window
    // read as +16% growth.
    expect(computeVolumeDelta(series({ volume: 20, weeks: 13 }))).toBeCloseTo(1, 6);
    expect(computeVolumeDelta(series({ volume: 20, weeks: 12 }))).toBeCloseTo(1, 6);
    expect(computeVolumeDelta(series({ volume: 7, weeks: 11 }))).toBeCloseTo(1, 6);
  });

  it('exceeds 1 when the recent half trades more', () => {
    expect(computeVolumeDelta(series({ volume: 10, endVolume: 40 }))).toBeGreaterThan(1);
  });

  it('never returns Infinity when the prior period had zero volume', () => {
    const obs = series({ volume: 0 }).map((o, i, all) =>
      i >= Math.floor(all.length / 2) ? { ...o, volume: 15 } : o,
    );
    const delta = computeVolumeDelta(obs);
    expect(Number.isFinite(delta)).toBe(true);
    expect(delta).toBeGreaterThan(1);
  });

  it('is 1 for a single observation', () => {
    expect(computeVolumeDelta(series({ weeks: 1 }))).toBe(1);
  });
});

describe('computeReturnVolatility', () => {
  it('is small for a linear ramp', () => {
    // Not exactly zero: a constant *cents* increase is a slightly shrinking
    // percentage increase, so the returns taper. That is the correct reading of
    // the series, not an artefact.
    const ramp = computeReturnVolatility(series({ startPrice: 20_000, endPrice: 26_000 }));
    expect(ramp).toBeLessThan(0.01);
  });

  it('rises when the price oscillates around the same mean', () => {
    const calm = computeReturnVolatility(series({ jitter: 0.001 }));
    const wild = computeReturnVolatility(series({ jitter: 0.2 }));
    expect(wild).toBeGreaterThan(calm);
  });

  it('returns 0 rather than NaN for degenerate input', () => {
    expect(computeReturnVolatility([])).toBe(0);
    expect(computeReturnVolatility(series({ weeks: 2 }))).toBe(0);
  });
});

describe('computeTurnover', () => {
  it('is volume per standing listing', () => {
    // 13 weeks x 10 units = 130 units against 40 standing listings.
    expect(computeTurnover(series({ weeks: 13, volume: 10, listings: 40 }))).toBeCloseTo(3.25, 6);
  });

  it('does not divide by zero', () => {
    const turnover = computeTurnover(series({ listings: 0, volume: 5 }));
    expect(turnover).toBe(Infinity);
    // Infinity is contained by the composite, which clamps turnover to 10.
    expect(computeTmi(series({ listings: 0, volume: 5 })).score).toBeLessThanOrEqual(100);
  });
});

/* -------------------------------------------------------------------------- */
/* Composite direction                                                         */
/* -------------------------------------------------------------------------- */

describe('computeTmi direction', () => {
  it('scores a rising market above a falling one', () => {
    const up = computeTmi(series({ startPrice: 20_000, endPrice: 28_000, volume: 10, endVolume: 30 }));
    const down = computeTmi(series({ startPrice: 28_000, endPrice: 20_000, volume: 30, endVolume: 10 }));
    expect(up.score).toBeGreaterThan(down.score);
  });

  it('scores a mid-range between the two extremes', () => {
    const up = computeTmi(series({ startPrice: 20_000, endPrice: 28_000 }));
    const flat = computeTmi(series({ startPrice: 24_000, endPrice: 24_000 }));
    const down = computeTmi(series({ startPrice: 28_000, endPrice: 20_000 }));
    expect(flat.score).toBeGreaterThan(down.score);
    expect(up.score).toBeGreaterThan(flat.score);
  });

  it('is monotonic in price velocity', () => {
    const steps = [0, 2_000, 4_000, 6_000, 8_000].map(
      (delta) => computeTmi(series({ startPrice: 20_000, endPrice: 20_000 + delta })).score,
    );
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
  });

  it('is monotonic in volume growth', () => {
    const steps = [0, 10, 25, 50, 100].map(
      (endVolume) => computeTmi(series({ volume: 10, endVolume })).score,
    );
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
    }
    expect(steps[steps.length - 1]!).toBeGreaterThan(steps[0]!);
  });

  it('rewards tight supply: fewer listings at equal volume scores higher', () => {
    const tight = computeTmi(series({ volume: 30, listings: 10 }));
    const loose = computeTmi(series({ volume: 30, listings: 400 }));
    expect(tight.score).toBeGreaterThan(loose.score);
  });

  it('penalises volatility when the trend is held constant', () => {
    const calm = computeTmi(series({ startPrice: 20_000, endPrice: 24_000, jitter: 0 }));
    const wild = computeTmi(series({ startPrice: 20_000, endPrice: 24_000, jitter: 0.15 }));
    expect(wild.components.volatility).toBeLessThan(calm.components.volatility);
  });

  it('lets the attention signal move the score', () => {
    const base = series({ startPrice: 20_000, endPrice: 23_000 });
    const quiet = computeTmi(base, { attentionSignal: 0 });
    const loud = computeTmi(base, { attentionSignal: 1 });
    expect(loud.score).toBeGreaterThan(quiet.score);
    // Attention carries 10% of the weight, so the total swing is 10 points.
    expect(loud.score - quiet.score).toBeCloseTo(10, 1);
  });
});

/* -------------------------------------------------------------------------- */
/* Structural invariants                                                       */
/* -------------------------------------------------------------------------- */

describe('computeTmi invariants', () => {
  const cases: [string, TmiObservation[]][] = [
    ['empty', []],
    ['single', series({ weeks: 1 })],
    ['two', series({ weeks: 2 })],
    ['flat', series()],
    ['rising', series({ startPrice: 20_000, endPrice: 30_000 })],
    ['falling', series({ startPrice: 30_000, endPrice: 15_000 })],
    ['zero volume', series({ volume: 0, endVolume: 0 })],
    ['zero listings', series({ listings: 0 })],
    ['wild', series({ jitter: 0.4 })],
  ];

  it.each(cases)('produces a bounded, finite result for %s', (_label, observations) => {
    const result = computeTmi(observations);

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    for (const factor of TMI_FACTORS) {
      const value = result.components[factor];
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it.each(cases)('has contributions that reconcile to the score for %s', (_label, observations) => {
    const result = computeTmi(observations);
    const total = TMI_FACTORS.reduce((acc, f) => acc + result.contributions[f], 0);
    // Contributions are rounded to 2dp individually, so allow for that drift.
    expect(Math.abs(total - result.score)).toBeLessThan(0.05);
  });

  it('is deterministic', () => {
    const input = series({ startPrice: 20_000, endPrice: 27_000, volume: 5, endVolume: 40 });
    expect(computeTmi(input)).toEqual(computeTmi(input));
  });

  it('ignores observations outside the window', () => {
    const recent = series({ weeks: 13, startPrice: 20_000, endPrice: 24_000 });
    const ancient: TmiObservation[] = [
      { date: '2019-01-07', lastSaleCents: 5_000, volume: 999, activeListings: 1 },
    ];
    const withAncient = computeTmi([...ancient, ...recent]);
    expect(withAncient.sampleSize).toBe(recent.length);
    expect(withAncient.score).toBeCloseTo(computeTmi(recent).score, 6);
  });
});

/* -------------------------------------------------------------------------- */
/* Degenerate input must be honest, not confident                              */
/* -------------------------------------------------------------------------- */

describe('computeTmi honesty on degenerate input', () => {
  it('returns a neutral 50 with a note when there is nothing to measure', () => {
    const result = computeTmi([]);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('low');
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('returns neutral and explains itself for a single observation', () => {
    const result = computeTmi(series({ weeks: 1 }));
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('low');
    expect(result.notes.join(' ')).toMatch(/only 1 observation/i);
  });

  it('flags a constant price as uninformative rather than scoring it as stable', () => {
    const result = computeTmi(series({ startPrice: 20_000, endPrice: 20_000, weeks: 13 }));
    expect(result.notes.join(' ')).toMatch(/constant/i);
  });

  it('flags a zero-volume window', () => {
    const result = computeTmi(series({ volume: 0, endVolume: 0 }));
    expect(result.notes.join(' ')).toMatch(/no units traded/i);
  });

  it('says so when no attention signal was supplied', () => {
    const result = computeTmi(series());
    expect(result.notes.join(' ')).toMatch(/attention/i);
  });

  it('stays silent when the sample is good', () => {
    const result = computeTmi(
      series({ weeks: 13, startPrice: 20_000, endPrice: 26_000, volume: 30, endVolume: 50 }),
      { attentionSignal: 0.7 },
    );
    expect(result.confidence).toBe('high');
    expect(result.notes).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Ranking                                                                     */
/* -------------------------------------------------------------------------- */

describe('rankByTmi', () => {
  it('orders by score descending', () => {
    const ranked = rankByTmi([
      { id: 'low', result: computeTmi(series({ startPrice: 30_000, endPrice: 20_000 })) },
      { id: 'high', result: computeTmi(series({ startPrice: 20_000, endPrice: 30_000, endVolume: 60 })) },
      { id: 'mid', result: computeTmi(series()) },
    ]);
    expect(ranked[0]!.id).toBe('high');
    expect(ranked[ranked.length - 1]!.id).toBe('low');
  });

  it('breaks exact ties deterministically so pages do not shuffle between renders', () => {
    const a = { id: 'bbb', result: computeTmi(series()) };
    const b = { id: 'aaa', result: computeTmi(series()) };
    const ranked = rankByTmi([a, b]);
    expect(ranked.map((r) => r.id)).toEqual(['aaa', 'bbb']);
    expect(rankByTmi([b, a]).map((r) => r.id)).toEqual(['aaa', 'bbb']);
  });

  it('prefers the higher-confidence entity when scores tie', () => {
    const thin = computeTmi(series({ weeks: 4, volume: 1 }));
    const thick = computeTmi(series({ weeks: 4, volume: 1 }));
    const ranked = rankByTmi([
      { id: 'thin', result: { ...thin, confidence: 'low' } },
      { id: 'thick', result: { ...thick, confidence: 'high' } },
    ]);
    expect(ranked[0]!.id).toBe('thick');
  });
});
