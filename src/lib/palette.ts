/**
 * Chart palette, mirroring the CSS custom properties in globals.css.
 *
 * Recharts needs concrete colour strings rather than CSS variables in a few
 * places (SVG gradients, tooltips rendered outside the themed tree), so the
 * values are duplicated here deliberately — and kept in one object so they
 * cannot drift apart.
 */
export const CHART = {
  accent: 'var(--color-series-1)',
  series: [
    'var(--color-series-1)',
    'var(--color-series-2)',
    'var(--color-series-3)',
    'var(--color-series-4)',
    'var(--color-series-5)',
    'var(--color-series-6)',
  ],
  /** Concrete hex, for SVG <defs> where CSS vars are unreliable. */
  hex: {
    accent: '#c6f24e',
    up: '#3ddc97',
    down: '#ff6b8a',
    warn: '#ffb020',
    info: '#5aa9ff',
    violet: '#9d7bff',
    cyan: '#4cc9f0',
    grid: '#22272f',
    axis: '#626b76',
    surface: '#14171c',
    line: '#333a44',
  },
} as const;

export function seriesColor(index: number): string {
  return CHART.series[index % CHART.series.length] as string;
}

/** Fixed axis/grid props, so every chart in the product looks like a family. */
export const AXIS_PROPS = {
  stroke: CHART.hex.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: CHART.hex.grid,
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: CHART.hex.surface,
    border: `1px solid ${CHART.hex.line}`,
    borderRadius: 10,
    fontSize: 12,
    padding: '8px 10px',
    color: '#f2f4f7',
  },
  labelStyle: { color: '#98a1ac', fontSize: 11, marginBottom: 4 },
  itemStyle: { color: '#f2f4f7', fontSize: 12 },
} as const;

/** Colour key → hex, for colourway chips. Mirrors the generator's COLOR_HEX. */
export const COLOR_HEX: Record<string, string> = {
  black: '#17181a',
  white: '#f4f4f2',
  grey: '#9aa0a6',
  red: '#d7373f',
  blue: '#2f6fd0',
  green: '#3f8f5b',
  orange: '#e07a2f',
  purple: '#7a5ac4',
  pink: '#e08ca8',
  brown: '#7a5844',
  yellow: '#e3c24a',
  beige: '#d8c9ae',
  unknown: '#4a5158',
};
