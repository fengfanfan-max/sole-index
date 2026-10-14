/**
 * Comparison chart data preparation.
 *
 * Extracted from the chart component and kept pure so the collision behaviour is
 * testable. That matters: the bug this module exists to prevent is a *silent
 * data* bug, not a rendering warning.
 *
 * The original implementation keyed every series by its display label
 * (`"${brand} ${silhouette}"`). Two colourways of the same silhouette therefore
 * produced the same key **and the same `dataKey`**, so Recharts wrote both series
 * into one field of each row and drew a single line. React also warned about the
 * duplicate key, which is how it was noticed — the warning was the *symptom*;
 * the dropped series was the disease.
 *
 * In this catalogue that is not a rare edge case: 231 of 240 products share a
 * brand-and-silhouette label with at least one other product, and the product
 * detail page's "Compare these" action pre-selects exactly those.
 */

export interface ComparePoint {
  date: string;
  value: number | null;
}

export interface CompareSeries {
  /**
   * Stable identity — the product's style code. Used as the row key and the
   * Recharts `dataKey`, and never shown to a reader.
   */
  id: string;
  /** Human-readable name for the legend and tooltip. Not required to be unique. */
  label: string;
  points: ComparePoint[];
}

/**
 * Rebase every series to 100 at its own first positive observation and emit one
 * row per date, **keyed by series id**.
 *
 * A series with no observation on a given date is omitted from that row rather
 * than written as zero — zero would draw a line plunging to the axis, which is a
 * very different claim from "no data".
 */
export function buildCompareRows(
  series: readonly CompareSeries[],
): Record<string, string | number>[] {
  if (series.length === 0) return [];

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();

  // Base value per series: its first positive observation.
  const bases = new Map<string, number>();
  for (const s of series) {
    const first = s.points.find((p) => p.value !== null && p.value > 0)?.value ?? 0;
    bases.set(s.id, first);
  }

  return dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const s of series) {
      const point = s.points.find((p) => p.date === date);
      if (!point || point.value === null || point.value <= 0) continue;

      const base = bases.get(s.id) ?? 0;
      if (base <= 0) continue;

      row[s.id] = Number(((point.value / base) * 100).toFixed(2));
    }
    return row;
  });
}

export interface LabelledProduct {
  id: string;
  name: string;
  brandName: string;
  silhouette: string;
  colorway: string;
}

/**
 * Produce a display label per product, disambiguated only as far as necessary.
 *
 * 1. `Brand Silhouette "Colourway"` — distinguishes the common case (two
 *    colourways of one silhouette).
 * 2. If that still collides (same brand, silhouette *and* colourway), append the
 *    style code. Only the colliding entries get the suffix, so the legend stays
 *    clean in the normal case.
 */
export function buildCompareLabels(
  products: readonly LabelledProduct[],
): Map<string, string> {
  const base = new Map<string, string>();
  for (const p of products) {
    const silhouette = p.silhouette?.trim() || p.name;
    base.set(p.id, `${p.brandName} ${silhouette} "${p.colorway}"`);
  }

  const counts = new Map<string, number>();
  for (const label of base.values()) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const out = new Map<string, string>();
  for (const p of products) {
    const label = base.get(p.id) ?? p.name;
    out.set(p.id, (counts.get(label) ?? 0) > 1 ? `${label} · ${p.id}` : label);
  }
  return out;
}

/** Convenience: pair a product's identity with its computed label. */
export function toCompareSeries(
  products: readonly LabelledProduct[],
  pointsById: Map<string, ComparePoint[]>,
): CompareSeries[] {
  const labels = buildCompareLabels(products);
  return products.map((p) => ({
    id: p.id,
    label: labels.get(p.id) ?? p.name,
    points: pointsById.get(p.id) ?? [],
  }));
}
