'use client';

/**
 * Chart components.
 *
 * All of them are client components because Recharts needs the DOM; everything
 * else in the product stays server-rendered. Keeping every chart in one file
 * means there is exactly **one** `'use client'` boundary for the whole charting
 * layer, which is easy to reason about and easy to code-split later.
 *
 * Convention across all charts: no chart junk. No 3D, no gradients under lines
 * except the hero index, no dual axes, and tooltips that always show the exact
 * value rather than a rounded label.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ComponentProps } from 'react';

import { formatDayMonth, formatMoney, formatMoneyCompact, formatMonth, formatNumber } from '@/lib/format';
import { AXIS_PROPS, CHART, GRID_PROPS, TOOLTIP_STYLE, seriesColor } from '@/lib/palette';

type TooltipFormatter = NonNullable<ComponentProps<typeof Tooltip>['formatter']>;
type TooltipLabelFormatter = NonNullable<ComponentProps<typeof Tooltip>['labelFormatter']>;

/**
 * Recharts v3 types a tooltip's `value` as `ValueType | undefined` and its
 * `label` as `ReactNode`. Both are always controlled by the chart here, so
 * these two adapters keep the chart bodies readable instead of threading
 * recharts' generics through every call site.
 */
function fmt(fn: (value: number, name: string) => [string, string]): TooltipFormatter {
  return ((value: unknown, name: unknown) => fn(Number(value), String(name ?? ''))) as TooltipFormatter;
}

function fmtLabel(fn: (label: string) => string): TooltipLabelFormatter {
  return ((label: unknown) => fn(String(label ?? ''))) as TooltipLabelFormatter;
}

/* -------------------------------------------------------------------------- */
/* Market index                                                                */
/* -------------------------------------------------------------------------- */

export function IndexChart({
  data,
  height = 220,
}: {
  data: { date: string; index: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.hex.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART.hex.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="date"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatMonth(value)}
            minTickGap={48}
          />
          <YAxis
            {...AXIS_PROPS}
            width={44}
            tickFormatter={(value: number) => `${value.toFixed(2)}×`}
            domain={['auto', 'auto']}
          />
          {/* 1.0× is retail — the only reference line worth drawing. */}
          <ReferenceLine
            y={1}
            stroke={CHART.hex.line}
            strokeDasharray="4 4"
            label={{ value: 'retail', position: 'insideBottomRight', fill: CHART.hex.axis, fontSize: 10 }}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value) => [`${value.toFixed(3)}× retail`, 'Index'])}
            labelFormatter={fmtLabel((label) => formatMonth(label))}
          />
          <Area
            type="monotone"
            dataKey="index"
            stroke={CHART.hex.accent}
            strokeWidth={1.75}
            fill="url(#indexFill)"
            dot={false}
            activeDot={{ r: 3, fill: CHART.hex.accent, stroke: CHART.hex.surface }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product price history                                                       */
/* -------------------------------------------------------------------------- */

export function PriceHistoryChart({
  data,
  retailCents,
  height = 300,
}: {
  data: { date: string; lowestAskCents: number | null; highestBidCents: number | null; lastSaleCents: number | null }[];
  retailCents: number;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="date"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatDayMonth(value)}
            minTickGap={40}
          />
          <YAxis
            {...AXIS_PROPS}
            width={54}
            tickFormatter={(value: number) => formatMoneyCompact(value)}
            domain={['auto', 'auto']}
          />
          <ReferenceLine
            y={retailCents}
            stroke={CHART.hex.warn}
            strokeDasharray="5 4"
            label={{
              value: `retail ${formatMoney(retailCents)}`,
              position: 'insideTopRight',
              fill: CHART.hex.warn,
              fontSize: 10,
            }}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value, name) => [formatMoney(value), name])}
            labelFormatter={fmtLabel((label) => formatDayMonth(label))}
          />
          <Legend
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 11, color: CHART.hex.axis, paddingTop: 6 }}
          />
          <Line
            type="monotone"
            dataKey="lowestAskCents"
            name="Lowest ask"
            stroke={CHART.hex.down}
            strokeWidth={1.25}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="highestBidCents"
            name="Highest bid"
            stroke={CHART.hex.info}
            strokeWidth={1.25}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="lastSaleCents"
            name="Last sale"
            stroke={CHART.hex.accent}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Supply / demand                                                             */
/* -------------------------------------------------------------------------- */

export function SupplyDemandChart({
  data,
  height = 200,
}: {
  data: { date: string; volume: number; activeListings: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="date"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatDayMonth(value)}
            minTickGap={40}
          />
          <YAxis {...AXIS_PROPS} width={44} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value, name) => [formatNumber(value), name])}
            labelFormatter={fmtLabel((label) => formatDayMonth(label))}
          />
          <Legend
            iconType="square"
            iconSize={9}
            wrapperStyle={{ fontSize: 11, color: CHART.hex.axis, paddingTop: 6 }}
          />
          <Bar dataKey="volume" name="Units sold" fill={CHART.hex.accent} radius={[2, 2, 0, 0]} />
          <Bar
            dataKey="activeListings"
            name="Active listings"
            fill={CHART.hex.line}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Attribute share over time                                                   */
/* -------------------------------------------------------------------------- */

export function ShareTrendChart({
  series,
  months,
  height = 320,
  /** Cap the number of lines; more than six is unreadable. */
  limit = 6,
}: {
  series: { value: string; points: { month: string; share: number }[] }[];
  months: string[];
  height?: number;
  limit?: number;
}) {
  const top = [...series]
    .sort((a, b) => (b.points[b.points.length - 1]?.share ?? 0) - (a.points[a.points.length - 1]?.share ?? 0))
    .slice(0, limit);

  const rows = months.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const s of top) {
      const point = s.points.find((p) => p.month === month);
      if (point) row[s.value] = Number((point.share * 100).toFixed(2));
    }
    return row;
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="month"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatMonth(value)}
            minTickGap={24}
          />
          <YAxis
            {...AXIS_PROPS}
            width={44}
            tickFormatter={(value: number) => `${value}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value, name) => [`${value.toFixed(2)}%`, name])}
            labelFormatter={fmtLabel((label) => formatMonth(label))}
          />
          <Legend
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 11, color: CHART.hex.axis, paddingTop: 6 }}
          />
          {top.map((s, i) => (
            <Line
              key={s.value}
              type="monotone"
              dataKey={s.value}
              stroke={seriesColor(i)}
              strokeWidth={1.75}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Momentum decomposition                                                      */
/* -------------------------------------------------------------------------- */

export function TmiRadar({
  components,
  labels,
  height = 240,
}: {
  components: Record<string, number>;
  labels: Record<string, string>;
  height?: number;
}) {
  const data = Object.entries(components).map(([key, value]) => ({
    factor: labels[key] ?? key,
    value: Number((value * 100).toFixed(1)),
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={CHART.hex.grid} />
          <PolarAngleAxis
            dataKey="factor"
            tick={{ fill: CHART.hex.axis, fontSize: 10 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value) => [`${value.toFixed(1)} / 100`, 'Factor'])}
          />
          <Radar
            dataKey="value"
            stroke={CHART.hex.accent}
            fill={CHART.hex.accent}
            fillOpacity={0.22}
            strokeWidth={1.75}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Multi-product comparison, rebased to 100 at the start of the window.
 *
 * Rebasing is the whole point: a $90 shoe and a $900 shoe cannot be compared on
 * absolute price, and plotting both on a dual axis is the classic way to make a
 * chart that is technically correct and practically misleading.
 */
export function CompareChart({
  series,
  height = 320,
}: {
  series: { label: string; points: { date: string; value: number | null }[] }[];
  height?: number;
}) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();

  const rows = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const s of series) {
      const point = s.points.find((p) => p.date === date);
      if (!point || point.value === null || point.value <= 0) continue;
      const base = s.points.find((p) => p.value !== null && p.value > 0)?.value ?? point.value;
      row[s.label] = Number(((point.value / base) * 100).toFixed(2));
    }
    return row;
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="date"
            {...AXIS_PROPS}
            tickFormatter={(value: string) => formatDayMonth(value)}
            minTickGap={40}
          />
          <YAxis
            {...AXIS_PROPS}
            width={44}
            tickFormatter={(value: number) => `${value}`}
            domain={['auto', 'auto']}
          />
          <ReferenceLine y={100} stroke={CHART.hex.line} strokeDasharray="4 4" />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value, name) => [`${value.toFixed(1)}`, name])}
            labelFormatter={fmtLabel((label) => formatDayMonth(label))}
          />
          <Legend
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 11, color: CHART.hex.axis, paddingTop: 6 }}
          />
          {series.map((s, i) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={seriesColor(i)}
              strokeWidth={1.75}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small multiples                                                             */
/* -------------------------------------------------------------------------- */

/** Inline sparkline for table rows. No axes, no tooltip, no interaction. */
export function Sparkline({
  values,
  positive,
  width = 76,
  height = 22,
}: {
  values: number[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-[10px] text-ink-subtle">—</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={positive ? CHART.hex.up : CHART.hex.down}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Horizontal ranking bars, used for category and rotation lists. */
export function RankBars({
  items,
  height = 220,
}: {
  items: { label: string; value: number; colour?: string }[];
  height?: number;
}) {
  const data = items.map((item) => ({ ...item, label: item.label }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 28, bottom: 2, left: 4 }}>
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v, 1)} />
          <YAxis
            type="category"
            dataKey="label"
            {...AXIS_PROPS}
            width={96}
            tick={{ fill: CHART.hex.axis, fontSize: 11 }}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={fmt((value) => [value.toFixed(1), 'Score'])}
          />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={12}>
            {data.map((item, i) => (
              <Cell
                key={item.label}
                fill={
                  item.colour ??
                  (item.value >= 60 ? CHART.hex.up : item.value >= 40 ? CHART.hex.accent : CHART.hex.down)
                }
                fillOpacity={0.85 - i * 0.02}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
