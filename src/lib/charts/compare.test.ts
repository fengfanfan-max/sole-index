/**
 * Regression tests for comparison chart preparation.
 *
 * The first block exists because of a shipped bug: series were keyed by display
 * label, so two colourways of one silhouette collapsed into a single line and two
 * React children shared a key. The React warning was visible; the missing series
 * was not. These tests assert the data behaviour, which is the part that silently
 * lied.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCompareLabels,
  buildCompareRows,
  toCompareSeries,
  type CompareSeries,
  type LabelledProduct,
} from './compare';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function series(id: string, label: string, values: (number | null)[]): CompareSeries {
  return {
    id,
    label,
    points: values.map((value, index) => ({
      date: `2026-0${Math.min(9, index + 1)}-01`,
      value,
    })),
  };
}

const knuSkoolA: LabelledProduct = {
  id: 'VNPBZ714-260',
  name: 'Vans Knu Skool "Smoke Grey"',
  brandName: 'Vans',
  silhouette: 'Knu Skool',
  colorway: 'Smoke Grey',
};
const knuSkoolB: LabelledProduct = {
  id: 'VNTZ1146-315',
  name: 'Vans Knu Skool "White Cement"',
  brandName: 'Vans',
  silhouette: 'Knu Skool',
  colorway: 'White Cement',
};

/* -------------------------------------------------------------------------- */
/* The bug                                                                     */
/* -------------------------------------------------------------------------- */

describe('buildCompareRows — series must not collide', () => {
  it('keeps both series when two products share a display label', () => {
    // This is the exact shipped failure: same silhouette, different colourway.
    const rows = buildCompareRows([
      series('A', 'Vans Knu Skool', [100, 110, 120]),
      series('B', 'Vans Knu Skool', [200, 180, 160]),
    ]);

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveProperty('A');
      expect(row).toHaveProperty('B');
    }
    expect(rows[1]).toMatchObject({ A: 110, B: 90 });
  });

  it('would have collapsed the two series under the old label-keyed scheme', () => {
    // Demonstrates what the bug did, so the test documents the failure mode
    // rather than only the fix.
    const a = series('A', 'Vans Knu Skool', [100, 110]);
    const b = series('B', 'Vans Knu Skool', [200, 180]);
    const labelKeyedRows = [0, 1].map((i) => ({
      [a.label]: ((a.points[i]!.value as number) / 100) * 100,
      ...(b.label === a.label ? {} : { [b.label]: 0 }),
    }));
    // Under label keying there is exactly one field, so one product is lost.
    expect(Object.keys(labelKeyedRows[0]!)).toHaveLength(1);

    // Under id keying both survive.
    expect(Object.keys(buildCompareRows([a, b])[0]!).filter((k) => k !== 'date')).toHaveLength(2);
  });

  it('handles four same-label series without loss', () => {
    const rows = buildCompareRows([
      series('A', 'same', [100, 100]),
      series('B', 'same', [100, 200]),
      series('C', 'same', [100, 300]),
      series('D', 'same', [100, 400]),
    ]);
    expect(Object.keys(rows[1]!).filter((k) => k !== 'date').sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

/* -------------------------------------------------------------------------- */
/* Rebasing                                                                    */
/* -------------------------------------------------------------------------- */

describe('buildCompareRows — rebasing', () => {
  it('starts every series at 100 regardless of price level', () => {
    const rows = buildCompareRows([
      series('cheap', 'cheap', [7_000, 7_700]),
      series('dear', 'dear', [21_500, 21_500]),
    ]);
    expect(rows[0]).toMatchObject({ cheap: 100, dear: 100 });
    expect(rows[1]).toMatchObject({ cheap: 110, dear: 100 });
  });

  it('rebases from the first positive value, not the first value', () => {
    const rows = buildCompareRows([series('A', 'A', [null, 0, 50, 75])]);
    expect(rows[2]).toMatchObject({ A: 100 });
    expect(rows[3]).toMatchObject({ A: 150 });
  });

  it('omits a series from a row rather than writing zero', () => {
    // Zero would draw a plunge to the axis, which is a different claim from
    // "no observation".
    const rows = buildCompareRows([
      { id: 'A', label: 'A', points: [{ date: '2026-01-01', value: 100 }] },
      { id: 'B', label: 'B', points: [{ date: '2026-02-01', value: 100 }] },
    ]);
    expect(rows[0]).toEqual({ date: '2026-01-01', A: 100 });
    expect(rows[0]).not.toHaveProperty('B');
  });

  it('returns no rows for no series', () => {
    expect(buildCompareRows([])).toEqual([]);
  });

  it('ignores a series that never traded', () => {
    const rows = buildCompareRows([series('dead', 'dead', [null, 0, null])]);
    expect(rows.every((row) => !('dead' in row))).toBe(true);
  });

  it('emits dates in ascending order', () => {
    const rows = buildCompareRows([
      {
        id: 'A',
        label: 'A',
        points: [
          { date: '2026-03-01', value: 3 },
          { date: '2026-01-01', value: 1 },
          { date: '2026-02-01', value: 2 },
        ],
      },
    ]);
    expect(rows.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

describe('buildCompareLabels', () => {
  it('distinguishes two colourways of the same silhouette', () => {
    const labels = buildCompareLabels([knuSkoolA, knuSkoolB]);
    expect(labels.get(knuSkoolA.id)).toBe('Vans Knu Skool "Smoke Grey"');
    expect(labels.get(knuSkoolB.id)).toBe('Vans Knu Skool "White Cement"');
    expect(new Set(labels.values()).size).toBe(2);
  });

  it('appends the style code only when brand, silhouette and colourway all collide', () => {
    const twin: LabelledProduct = { ...knuSkoolA, id: 'VNPBZ714-999' };
    const labels = buildCompareLabels([knuSkoolA, twin, knuSkoolB]);

    // The colliding pair is disambiguated...
    expect(labels.get(knuSkoolA.id)).toBe('Vans Knu Skool "Smoke Grey" · VNPBZ714-260');
    expect(labels.get(twin.id)).toBe('Vans Knu Skool "Smoke Grey" · VNPBZ714-999');
    // ...and the bystander is left clean.
    expect(labels.get(knuSkoolB.id)).toBe('Vans Knu Skool "White Cement"');
    expect(new Set(labels.values()).size).toBe(3);
  });

  it('falls back to the product name when the silhouette is missing', () => {
    const labels = buildCompareLabels([{ ...knuSkoolA, silhouette: '' }]);
    expect(labels.get(knuSkoolA.id)).toBe('Vans Vans Knu Skool "Smoke Grey" "Smoke Grey"');
  });

  it('produces unique labels for every product in a large same-silhouette set', () => {
    const many: LabelledProduct[] = Array.from({ length: 12 }, (_, i) => ({
      id: `REEBOK-${i}`,
      name: `Reebok Club C 85 "${i}"`,
      brandName: 'Reebok',
      silhouette: 'Club C 85',
      colorway: `Colour ${i}`,
    }));
    const labels = buildCompareLabels(many);
    expect(new Set(labels.values()).size).toBe(many.length);
  });
});

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

describe('toCompareSeries', () => {
  it('pairs each product with a unique id, a label and its points', () => {
    const result = toCompareSeries([knuSkoolA, knuSkoolB], new Map([
      [knuSkoolA.id, [{ date: '2026-01-01', value: 12_000 }]],
      [knuSkoolB.id, [{ date: '2026-01-01', value: 11_000 }]],
    ]));

    expect(result.map((s) => s.id)).toEqual([knuSkoolA.id, knuSkoolB.id]);
    expect(new Set(result.map((s) => s.label)).size).toBe(2);
    expect(result[0]!.points).toHaveLength(1);
  });

  it('gives a product with no observations an empty series rather than throwing', () => {
    const result = toCompareSeries([knuSkoolA], new Map());
    expect(result[0]!.points).toEqual([]);
  });

  it('is usable end to end without collisions', () => {
    const seriess = toCompareSeries([knuSkoolA, knuSkoolB], new Map([
      [knuSkoolA.id, [{ date: '2026-01-01', value: 100 }, { date: '2026-02-01', value: 150 }]],
      [knuSkoolB.id, [{ date: '2026-01-01', value: 200 }, { date: '2026-02-01', value: 200 }]],
    ]));
    const rows = buildCompareRows(seriess);
    expect(rows[1]).toMatchObject({ [knuSkoolA.id]: 150, [knuSkoolB.id]: 100 });
  });
});
