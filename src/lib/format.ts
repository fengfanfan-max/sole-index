/**
 * Formatting helpers.
 *
 * All money in this codebase is integer cents. Formatting is the only place
 * that knows how to turn that into a human string, so the rule ("never render a
 * raw cent value") is enforced in one file.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plainNumber = new Intl.NumberFormat('en-US');

/** `124000` → `"$1,240"` */
export function formatMoney(cents: number, options: { currency?: string } = {}): string {
  if (!Number.isFinite(cents)) return '—';
  const value = cents / 100;
  if (options.currency && options.currency !== 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: options.currency,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return usd.format(value);
}

/** `124000` → `"$1.2K"` — for axis labels and dense cards. */
export function formatMoneyCompact(cents: number): string {
  if (!Number.isFinite(cents)) return '—';
  return usdCompact.format(cents / 100);
}

/** `1240` → `"1,240"` */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  if (digits > 0) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
  return plainNumber.format(value);
}

/**
 * `0.1234` → `"+12.3%"`.
 * `signed` is on by default because in this product a change without a sign is
 * ambiguous.
 */
export function formatPercent(
  value: number,
  options: { digits?: number; signed?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return '—';
  const { digits = 1, signed = true } = options;
  const pct = value * 100;
  const body = `${Math.abs(pct).toFixed(digits)}%`;
  if (!signed) return body;
  if (pct > 0) return `+${body}`;
  if (pct < 0) return `−${body}`; // U+2212 minus, so columns align visually
  return `0.0%`;
}

/** Percentage points, e.g. `0.041` → `"+4.1pp"`. */
export function formatPoints(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const pp = value * 100;
  const body = `${Math.abs(pp).toFixed(digits)}pp`;
  if (pp > 0) return `+${body}`;
  if (pp < 0) return `−${body}`;
  return `0.0pp`;
}

/** `2.35` → `"2.35×"` */
export function formatMultiple(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}×`;
}

/** `"2026-10-05"` → `"5 Oct 2026"` */
export function formatDate(iso: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!iso) return '—';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** `"2026-10"` → `"Oct 2026"` */
export function formatMonth(iso: string): string {
  const date = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Compact form for charts: `"5 Oct"`. */
export function formatDayMonth(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Days between two ISO dates. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Title-cases a slug like `new-balance` → `New Balance`. */
export function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** `1` → `"1 insight"`, `3` → `"3 insights"` */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Human-readable byte size, for the admin ingestion view. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(value: number, epsilon = 1e-9): Direction {
  if (!Number.isFinite(value) || Math.abs(value) < epsilon) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** Tailwind text colour for a signed value. */
export function directionClass(value: number): string {
  const dir = directionOf(value);
  if (dir === 'up') return 'text-up';
  if (dir === 'down') return 'text-down';
  return 'text-ink-subtle';
}
