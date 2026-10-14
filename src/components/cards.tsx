/**
 * Shared page-level compositions.
 *
 * These are intentionally server components: they render data that was already
 * fetched, and none of them need interactivity. Anything that does (the persona
 * switcher, the charts) lives in its own client module.
 */
import Link from 'next/link';

import { Badge, Card, ConfidenceMeter } from '@/components/ui/primitives';
import { Sparkline } from '@/components/charts/charts';
import { formatDate, formatMoney, formatMultiple, formatNumber, formatPercent } from '@/lib/format';
import { COLOR_HEX } from '@/lib/palette';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-2 label-caps">{eyebrow}</p> : null}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Product                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProductCardData {
  slug: string;
  name: string;
  brandName: string;
  colorway: string;
  primaryColor: string;
  releaseDate: string;
  retailPriceCents: number;
  latestCents: number | null;
  multiple: number | null;
  change: number | null;
  tmiScore: number | null;
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const hex = COLOR_HEX[product.primaryColor] ?? COLOR_HEX.unknown;

  return (
    <Link href={`/products/${product.slug}`} className="block">
      <Card interactive sheen className="flex h-full flex-col overflow-hidden">
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(90deg, ${hex}, transparent)` }}
          aria-hidden
        />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] tracking-wide text-ink-subtle uppercase">
                {product.brandName}
              </p>
              <h3 className="mt-0.5 truncate text-sm font-medium text-ink">{product.name}</h3>
            </div>
            {product.tmiScore !== null ? (
              <Badge
                tone={product.tmiScore >= 60 ? 'up' : product.tmiScore >= 40 ? 'accent' : 'down'}
                className="shrink-0"
              >
                {product.tmiScore.toFixed(0)}
              </Badge>
            ) : null}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <p className="tnum text-lg leading-none font-semibold text-ink">
                {product.latestCents !== null ? formatMoney(product.latestCents) : '—'}
              </p>
              <p className="mt-1 text-[11px] text-ink-subtle">
                retail {formatMoney(product.retailPriceCents)}
                {product.multiple !== null ? ` · ${formatMultiple(product.multiple)}` : ''}
              </p>
            </div>
            {product.change !== null ? (
              <p
                className={cn(
                  'tnum text-xs font-medium',
                  product.change > 0 ? 'text-up' : product.change < 0 ? 'text-down' : 'text-ink-subtle',
                )}
              >
                {formatPercent(product.change)}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Mover row                                                                   */
/* -------------------------------------------------------------------------- */

export function MoverRow({
  mover,
  spark,
}: {
  mover: ProductCardData & { volume4w?: number; brandName: string; colorway: string };
  spark?: number[];
}) {
  const positive = (mover.change ?? 0) >= 0;

  return (
    <Link
      href={`/products/${mover.slug}`}
      className="flex items-center gap-3 rounded-control px-2.5 py-2 transition-colors hover:bg-raised/60"
    >
      <span
        aria-hidden
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: COLOR_HEX[mover.primaryColor] ?? COLOR_HEX.unknown }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{mover.name}</span>
        <span className="block truncate text-[11px] text-ink-subtle">
          {mover.colorway}
          {mover.volume4w !== undefined ? ` · ${formatNumber(mover.volume4w)} sold · 30d` : ''}
        </span>
      </span>
      {spark ? <Sparkline values={spark} positive={positive} width={56} height={20} /> : null}
      <span className="tnum w-16 shrink-0 text-right text-[13px] text-ink">
        {mover.latestCents !== null ? formatMoney(mover.latestCents) : '—'}
      </span>
      <span
        className={cn(
          'tnum w-14 shrink-0 text-right text-xs font-medium',
          positive ? 'text-up' : 'text-down',
        )}
      >
        {mover.change !== null ? formatPercent(mover.change) : '—'}
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Insight                                                                     */
/* -------------------------------------------------------------------------- */

const KIND_LABEL: Record<string, string> = {
  observation: 'Observation',
  research: 'Research',
  market_note: 'Market note',
  source_digest: 'Source digest',
};

const KIND_TONE: Record<string, 'accent' | 'info' | 'warn' | 'neutral'> = {
  observation: 'accent',
  research: 'info',
  market_note: 'warn',
  source_digest: 'neutral',
};

export interface InsightCardData {
  id: string;
  kind: string;
  title: string;
  body: string;
  confidence: number;
  signal: string | null;
  publishedAt: string | null;
  authorName: string | null;
  sourceName: string | null;
  links: { entityType: string; entityId: string; label: string }[];
}

export function InsightCard({
  insight,
  dense = false,
}: {
  insight: InsightCardData;
  dense?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[insight.kind] ?? 'neutral'}>{KIND_LABEL[insight.kind] ?? insight.kind}</Badge>
        <ConfidenceMeter value={insight.confidence} />
        {insight.signal ? (
          <span className="tnum text-[11px] text-accent">{insight.signal}</span>
        ) : null}
      </div>

      <h3 className="text-[15px] leading-snug font-medium text-ink">{insight.title}</h3>

      <p
        className={cn(
          'mt-2 text-[13px] leading-relaxed text-ink-muted',
          dense ? 'line-clamp-3' : 'line-clamp-6',
        )}
      >
        {insight.body}
      </p>

      {insight.links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {insight.links.map((link) => (
            <span
              key={`${link.entityType}:${link.entityId}`}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] text-ink-subtle"
              title={`Linked ${link.entityType}`}
            >
              <span className="text-ink-subtle/70">{link.entityType}</span>
              <span className="max-w-40 truncate text-ink-muted">{link.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-auto pt-3 text-[11px] text-ink-subtle">
        {insight.authorName ?? 'Analyst'}
        {insight.sourceName ? ` · ${insight.sourceName}` : ''}
        {insight.publishedAt ? ` · ${formatDate(insight.publishedAt)}` : ''}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Article                                                                     */
/* -------------------------------------------------------------------------- */

export interface ArticleCardData {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  readingMinutes: number;
  publishedAt: string | null;
  authorName: string | null;
  categoryName: string | null;
}

export function ArticleCard({ article, featured = false }: { article: ArticleCardData; featured?: boolean }) {
  return (
    <Link href={`/editorial/${article.slug}`} className="block h-full">
      <Card interactive className={cn('flex h-full flex-col', featured ? 'p-6' : 'p-4')}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {article.categoryName ? <Badge tone="outline">{article.categoryName}</Badge> : null}
          <span className="text-[11px] text-ink-subtle">
            {article.readingMinutes} min read
            {article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ' · draft'}
          </span>
        </div>

        <h3
          className={cn(
            'leading-snug font-medium text-ink',
            featured ? 'text-xl tracking-tight' : 'text-[15px]',
          )}
        >
          {article.title}
        </h3>

        <p
          className={cn(
            'mt-2 leading-relaxed text-ink-muted',
            featured ? 'text-sm' : 'line-clamp-3 text-[13px]',
          )}
        >
          {article.excerpt}
        </p>

        {article.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {article.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[10px] text-ink-subtle">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-auto pt-4 text-[11px] text-ink-subtle">{article.authorName ?? 'Editorial'}</p>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Paywall                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Locked state for a gated surface.
 *
 * Note what is *not* here: the gated data. The caller decides not to fetch it, so
 * this is a genuine server-side gate rather than a CSS blur over content the
 * browser already has — the difference between a real paywall and a screenshot
 * of one.
 */
export function LockedPanel({
  title,
  description,
  requiredTier,
  currentTier,
  featureKey,
}: {
  title: string;
  description: string;
  requiredTier: string;
  currentTier: string;
  featureKey: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-backdrop opacity-40" aria-hidden />
      <div className="relative flex flex-col items-start gap-4 p-8">
        <Badge tone="warn">Requires {requiredTier}</Badge>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center rounded-control bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-dim"
          >
            See plans
          </Link>
          <span className="text-[11px] text-ink-subtle">
            Signed in as <span className="text-ink-muted">{currentTier}</span> · flag{' '}
            <code className="text-ink-muted">{featureKey}</code>
          </span>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

export function TrendChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-ink-subtle">—</span>;
  const tone = score >= 60 ? 'up' : score >= 40 ? 'accent' : 'down';
  const label = score >= 60 ? 'heating' : score >= 40 ? 'stable' : 'cooling';
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={tone}>{score.toFixed(0)}</Badge>
      <span className="hidden text-[10px] text-ink-subtle xl:inline">{label}</span>
    </span>
  );
}

export function MaterialChips({ materials }: { materials: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {materials.slice(0, 3).map((m) => (
        <span key={m} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-subtle">
          {m}
        </span>
      ))}
    </span>
  );
}
