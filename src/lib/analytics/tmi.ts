/**
 * Trend Momentum Index (TMI)
 * ==========================
 *
 * A single 0–100 score that summarises the *current state* of demand for a
 * product, colourway, material, category or brand — and, crucially, explains
 * itself. Every factor is normalised to 0–1 and the published weights are the
 * ones used here, so the methodology page is a description of the code rather
 * than a marketing claim.
 *
 * The design brief for this index was taken from the observation that **price is
 * a lagging indicator**. Supply arrives before it clears, and price is the
 * variable that eventually adjusts. So the score deliberately blends:
 *
 *   - two lagging signals (price velocity, realised volatility), and
 *   - three leading or independent ones (volume delta, sell-through rate, and a
 *     qualitative attention signal supplied by the editorial team).
 *
 * What it is not
 * --------------
 * It is not a forecast. It is a weighted summary of observed state. Nothing in
 * here extrapolates, and a high score says nothing about next quarter. See
 * docs/methodology.md for the known limitations.
 *
 * Pure functions only — no database, no clock, no I/O. That is what makes it
 * testable, and it is why `src/lib/analytics/refresh.ts` exists to do the wiring.
 */

/** Published factor weights. They must sum to 1. */
export const TMI_WEIGHTS = {
  /** Recent price trend, smoothed by ordinary least squares. */
  priceVelocity: 0.35,
  /** Recent transaction volume against the prior period. */
  volumeDelta: 0.25,
  /** Realised volatility, inverted — steady appreciation beats spikes. */
  volatility: 0.15,
  /** Volume cleared per unit of standing supply. The leading indicator. */
  sellThrough: 0.15,
  /** Editorial mentions and external search interest. */
  attention: 0.1,
} as const;

export type TmiFactor = keyof typeof TMI_WEIGHTS;

export const TMI_FACTORS: readonly TmiFactor[] = [
  'priceVelocity',
  'volumeDelta',
  'volatility',
  'sellThrough',
  'attention',
];

/** Display names. Kept next to the weights so the UI cannot drift from the model. */
export const TMI_FACTOR_LABELS: Record<TmiFactor, string> = {
  priceVelocity: 'Price velocity',
  volumeDelta: 'Volume delta',
  volatility: 'Stability',
  sellThrough: 'Sell-through',
  attention: 'Attention',
};

export const TMI_FACTOR_DESCRIPTIONS: Record<TmiFactor, string> = {
  priceVelocity:
    'Ordinary-least-squares slope of price over the window, expressed as a fraction of the mean price per day. A fit rather than a first-vs-last comparison, so one noisy print cannot move it.',
  volumeDelta:
    'Units traded in the second half of the window against the first half, with the halves equalised by observation count.',
  volatility:
    'Standard deviation of week-on-week returns, inverted. Steady appreciation scores higher than the same move delivered in spikes.',
  sellThrough:
    'Units cleared per standing listing. This is the leading indicator: supply arrives before it clears, and price is what adjusts afterwards.',
  attention:
    'Editorial mentions and external search interest, supplied by the analyst desk on a 0–1 scale. Neutral 0.5 when unknown.',
};

/**
 * Calibration constants. Each maps a raw measurement onto the 0–1 component
 * scale. They are exposed so the methodology page can show its work, and so
 * they can be re-tuned without hunting through arithmetic.
 *
 * All thresholds were chosen against the demo dataset's observed range and are
 * documented in docs/methodology.md.
 */
export const TMI_CALIBRATION = {
  /**
   * Fractional price change per day that maps to roughly a 0.76 component
   * score. 0.0025 = +0.25%/day, i.e. ~20% over a 90-day window.
   */
  velocityScale: 0.0025,
  /** Deviation from a 1.0 volume ratio that maps to ~0.76. */
  volumeScale: 0.6,
  /** Standard deviation of weekly returns that maps to ~0.37. */
  volatilityScale: 0.06,
  /** Turnover rate (units sold per standing listing) considered neutral. */
  turnoverMid: 1.0,
  /** Spread of turnover rates around the neutral point. */
  turnoverScale: 1.0,
} as const;

export const TMI_DEFAULT_WINDOW_DAYS = 90;

/** Below this many observations the score is directional at best. */
const MIN_OBSERVATIONS = 3;
/** Sample sizes at or above this, with real volume, earn "high" confidence. */
const HIGH_CONFIDENCE_OBSERVATIONS = 12;
const HIGH_CONFIDENCE_VOLUME = 60;
const MEDIUM_CONFIDENCE_OBSERVATIONS = 8;
const MEDIUM_CONFIDENCE_VOLUME = 20;

export type TmiConfidence = 'low' | 'medium' | 'high';

export interface TmiObservation {
  /** ISO date, `yyyy-mm-dd`. */
  date: string;
  lastSaleCents: number;
  volume: number;
  activeListings: number;
}

export interface TmiOptions {
  windowDays?: number;
  /** Inclusive end of the window. Defaults to the latest observation. */
  asOf?: string;
  /**
   * Qualitative attention input in 0–1, supplied by the caller (editorial
   * mentions, search-interest index). Defaults to 0.5 — "no information", which
   * is deliberately neutral rather than pessimistic.
   */
  attentionSignal?: number;
}

export interface TmiResult {
  /** Composite score, 0–100. */
  score: number;
  /** Each factor normalised to 0–1. */
  components: Record<TmiFactor, number>;
  /** `components[f] * TMI_WEIGHTS[f] * 100` — what each factor contributed. */
  contributions: Record<TmiFactor, number>;
  /** Observations that fell inside the window. */
  sampleSize: number;
  windowDays: number;
  totalVolume: number;
  confidence: TmiConfidence;
  /** Human-readable caveats. Empty when the score should be taken at face value. */
  notes: string[];
}

/* -------------------------------------------------------------------------- */
/* Numeric helpers                                                             */
/* -------------------------------------------------------------------------- */

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Maps the whole real line onto (0, 1), centred at 0.5. */
const logistic01 = (value: number): number => 0.5 + 0.5 * Math.tanh(value);

const sum = (values: readonly number[]): number =>
  values.reduce((acc, v) => acc + v, 0);

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = sum(values.map((v) => (v - m) ** 2)) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Days between two ISO dates, computed in UTC so the host timezone cannot leak in. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return (b - a) / 86_400_000;
}

/**
 * Ordinary least squares slope of y against x.
 * Returns 0 when there is not enough spread in x to fit a line.
 */
function olsSlope(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - mx;
    num += dx * ((ys[i] as number) - my);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}

/* -------------------------------------------------------------------------- */
/* Factor computation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fractional price change per day, from an OLS fit rather than first-vs-last.
 * A fit is used deliberately: comparing endpoints of a noisy weekly series
 * makes the score jump on a single print.
 */
export function computePriceVelocity(
  observations: readonly TmiObservation[],
): number {
  if (observations.length < MIN_OBSERVATIONS) return 0;
  const xs = observations.map((o) => daysBetween(observations[0]!.date, o.date));
  const ys = observations.map((o) => o.lastSaleCents);
  const avgPrice = mean(ys);
  if (avgPrice <= 0) return 0;
  const slopePerDay = olsSlope(xs, ys);
  return slopePerDay / avgPrice;
}

/**
 * Ratio of volume in the second half of the window to the first half.
 *
 * The halves are equalised by observation count before comparing. Without that
 * step an odd-length window (11 or 13 weekly points, which is the common case)
 * splits 5/6 or 6/7 and flat volume reads as spurious growth of 15–20%. The
 * additive `+1` is smoothing, so a zero-volume prior period yields a large but
 * finite ratio instead of Infinity.
 */
export function computeVolumeDelta(
  observations: readonly TmiObservation[],
): number {
  if (observations.length < 2) return 1;
  const mid = Math.floor(observations.length / 2);
  const priorSlice = observations.slice(0, mid);
  const recentSlice = observations.slice(mid);
  const prior = sum(priorSlice.map((o) => o.volume));
  const recent = sum(recentSlice.map((o) => o.volume));

  // Express the recent half on the prior half's scale.
  const scaledRecent = (recent / recentSlice.length) * priorSlice.length;
  return (scaledRecent + 1) / (prior + 1);
}

/**
 * Standard deviation of consecutive percentage returns.
 *
 * Returns are already dimensionless, so no further normalisation is needed —
 * a $90 shoe and a $900 shoe with the same relative swings score identically.
 */
export function computeReturnVolatility(
  observations: readonly TmiObservation[],
): number {
  if (observations.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < observations.length; i += 1) {
    const prev = observations[i - 1]!.lastSaleCents;
    const curr = observations[i]!.lastSaleCents;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return stdev(returns);
}

/**
 * Units cleared per standing listing over the window — the "sell-through"
 * leading indicator. Higher means supply is being absorbed.
 */
export function computeTurnover(
  observations: readonly TmiObservation[],
): number {
  if (observations.length === 0) return 0;
  const totalVolume = sum(observations.map((o) => o.volume));
  const avgListings = mean(observations.map((o) => Math.max(0, o.activeListings)));
  if (avgListings <= 0) return totalVolume > 0 ? Infinity : 0;
  return totalVolume / avgListings;
}

/* -------------------------------------------------------------------------- */
/* Composite                                                                   */
/* -------------------------------------------------------------------------- */

function emptyComponents(): Record<TmiFactor, number> {
  return {
    priceVelocity: 0.5,
    volumeDelta: 0.5,
    volatility: 0.5,
    sellThrough: 0.5,
    attention: 0.5,
  };
}

function buildResult(
  components: Record<TmiFactor, number>,
  meta: {
    sampleSize: number;
    windowDays: number;
    totalVolume: number;
    confidence: TmiConfidence;
    notes: string[];
  },
): TmiResult {
  const contributions = {} as Record<TmiFactor, number>;
  let score = 0;
  for (const factor of TMI_FACTORS) {
    const contribution = components[factor] * TMI_WEIGHTS[factor] * 100;
    contributions[factor] = Number(contribution.toFixed(2));
    score += contribution;
  }

  return {
    // Round only at the boundary so intermediate arithmetic stays exact.
    score: Number(Math.min(100, Math.max(0, score)).toFixed(2)),
    components,
    contributions,
    ...meta,
  };
}

/**
 * Compute the Trend Momentum Index for one entity.
 *
 * Total function: any input, including an empty array, produces a well-formed
 * result. Degenerate windows return a neutral 50 with `confidence: 'low'` and an
 * explanatory note, rather than NaN or a misleading number.
 */
export function computeTmi(
  observations: readonly TmiObservation[],
  options: TmiOptions = {},
): TmiResult {
  const windowDays = options.windowDays ?? TMI_DEFAULT_WINDOW_DAYS;

  const sorted = [...observations].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const asOf = options.asOf ?? sorted[sorted.length - 1]?.date;
  const notes: string[] = [];

  if (!asOf) {
    return buildResult(emptyComponents(), {
      sampleSize: 0,
      windowDays,
      totalVolume: 0,
      confidence: 'low',
      notes: ['No observations supplied. Score is neutral by definition.'],
    });
  }

  const windowStart = new Date(Date.parse(`${asOf}T00:00:00Z`) - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const window = sorted.filter((o) => o.date > windowStart && o.date <= asOf);
  const sampleSize = window.length;
  const totalVolume = sum(window.map((o) => o.volume));

  const attention = clamp01(options.attentionSignal ?? 0.5);
  if (options.attentionSignal === undefined) {
    notes.push(
      'No attention signal supplied; the attention factor was held at a neutral 0.5 rather than assumed strong or weak.',
    );
  }

  if (sampleSize < MIN_OBSERVATIONS) {
    notes.push(
      `Only ${sampleSize} observation${sampleSize === 1 ? '' : 's'} in the ${windowDays}-day window; a trend cannot be established. Score falls back to neutral.`,
    );
    return buildResult(emptyComponents(), {
      sampleSize,
      windowDays,
      totalVolume,
      confidence: 'low',
      notes,
    });
  }

  const components: Record<TmiFactor, number> = {
    priceVelocity: logistic01(
      computePriceVelocity(window) / TMI_CALIBRATION.velocityScale,
    ),
    volumeDelta: logistic01(
      (computeVolumeDelta(window) - 1) / TMI_CALIBRATION.volumeScale,
    ),
    volatility: clamp01(
      Math.exp(-computeReturnVolatility(window) / TMI_CALIBRATION.volatilityScale),
    ),
    sellThrough: logistic01(
      (Math.min(computeTurnover(window), 10) - TMI_CALIBRATION.turnoverMid) /
        TMI_CALIBRATION.turnoverScale,
    ),
    attention,
  };

  let confidence: TmiConfidence = 'low';
  if (sampleSize >= HIGH_CONFIDENCE_OBSERVATIONS && totalVolume >= HIGH_CONFIDENCE_VOLUME) {
    confidence = 'high';
  } else if (
    sampleSize >= MEDIUM_CONFIDENCE_OBSERVATIONS &&
    totalVolume >= MEDIUM_CONFIDENCE_VOLUME
  ) {
    confidence = 'medium';
  }

  if (confidence === 'low') {
    notes.push(
      `Thin sample (${sampleSize} observations, ${totalVolume} units). The score is directional only — do not treat it as a ranking signal.`,
    );
  }

  const distinctPrices = new Set(window.map((o) => o.lastSaleCents)).size;
  if (distinctPrices === 1) {
    notes.push(
      'Price was constant across the window, so the velocity and volatility factors are uninformative. The score leans on volume and sell-through.',
    );
  }

  if (totalVolume === 0) {
    notes.push(
      'No units traded in the window. The score reflects listed supply only and should not be read as demand.',
    );
  }

  return buildResult(components, {
    sampleSize,
    windowDays,
    totalVolume,
    confidence,
    notes,
  });
}

/** Convenience for ranking: a score plus who it belongs to. */
export interface RankedTmi<TId = string> {
  id: TId;
  result: TmiResult;
}

/**
 * Rank entities by score, highest first. Ties break on higher confidence and
 * then on id, so the output is stable across runs.
 */
export function rankByTmi<TId extends string>(
  entries: readonly { id: TId; result: TmiResult }[],
): RankedTmi<TId>[] {
  const confidenceRank: Record<TmiConfidence, number> = { high: 2, medium: 1, low: 0 };
  return [...entries].sort((a, b) => {
    if (b.result.score !== a.result.score) return b.result.score - a.result.score;
    const byConfidence = confidenceRank[b.result.confidence] - confidenceRank[a.result.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
