/**
 * Operations.
 *
 * The unglamorous half of a data product, and the half a client usually cannot
 * see: which provider is active, whether the last ingestion pass succeeded, how
 * much metered quota is left, and what the row counts actually are.
 *
 * Admin-only.
 */
import Link from 'next/link';

import { LockedPanel, PageHeader } from '@/components/cards';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Stat,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import { getSession, hasRole, TIER_LABELS } from '@/lib/auth/session';
import { describeRuntime, getAdminStats, listFeatureFlags, listIngestionRuns } from '@/lib/data/admin';
import { listSources } from '@/lib/data/editorial';
import { formatDate, formatDuration, formatNumber, pluralize } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const session = await getSession();

  if (!hasRole(session, 'admin')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Operations"
          title="Ingestion and platform health"
          description="Provider status, ingestion history, quota and feature flags."
        />
        <LockedPanel
          featureKey="admin.ops"
          requiredTier="Administrator role"
          currentTier={`${session.role} / ${session.tier}`}
          title="Operations is administrator-only"
          description="Switch persona in the header to “Fanfan Feng · admin” to inspect the ingestion pipeline, the provider adapter that is currently active, and the feature flags backing the paywall."
        />
      </div>
    );
  }

  const runtime = describeRuntime();
  const [stats, runs, flags, sources] = await Promise.all([
    getAdminStats(),
    listIngestionRuns(14),
    listFeatureFlags(),
    listSources(),
  ]);

  const failures = runs.filter((r) => r.status === 'failed');
  const quota = runs.find((r) => r.quota)?.quota ?? null;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Operations"
        description="The pipeline behind the product: which provider is selected, what the last ingestion passes did, how much metered quota is left, and the feature flags that drive the paywall."
        action={
          <div className="flex flex-col items-end gap-2">
            <Badge tone={runtime.offline ? 'warn' : 'up'}>
              {runtime.offline ? 'Offline snapshot' : 'Live provider'}
            </Badge>
            <span className="font-mono text-[11px] text-ink-subtle">
              provider={runtime.provider} driver={runtime.driver}
            </span>
          </div>
        }
      />

      {runtime.offline ? (
        <Callout tone="warn" title="Running on the committed snapshot">
          <code className="text-ink">SOLEINDEX_PROVIDER=fixture</code> is active, so the market data
          comes from the repository snapshot rather than a live endpoint. This is the default on
          purpose: it makes the demo deterministic and keeps the test suite offline. Set{' '}
          <code className="text-ink">SOLEINDEX_PROVIDER=kicksdb</code> and supply{' '}
          <code className="text-ink">KICKSDB_API_KEY</code> to switch the whole application to live
          data — no code change.
        </Callout>
      ) : null}

      {/* ------------------------------- stats ------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label="Products" value={formatNumber(stats.products)} sub="in the catalogue" />
        </Card>
        <Card className="p-4">
          <Stat
            label="Price observations"
            value={formatNumber(stats.pricePoints)}
            sub={`${formatNumber(stats.salesPoints)} sales observations`}
          />
        </Card>
        <Card className="p-4">
          <Stat
            label="Trend scores"
            value={formatNumber(stats.trendScores)}
            sub={stats.lastAnalyticsRun ? `recomputed ${formatDate(stats.lastAnalyticsRun)}` : 'never run'}
          />
        </Card>
        <Card className="p-4">
          <Stat
            label="Ingestion failures"
            value={formatNumber(failures.length)}
            sub={`of the last ${runs.length} runs`}
          />
        </Card>
      </section>

      {/* ------------------------------- quota -------------------------------- */}
      {quota ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Provider quota</CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Captured from the <code className="text-ink">X-Quota-Current</code> response header on
                the most recent metered call.
              </p>
            </div>
            <Badge tone={Number(quota.remaining ?? 0) > 0 ? 'up' : 'down'}>
              {Number(quota.remaining ?? 0) > 0 ? 'Within budget' : 'Exhausted'}
            </Badge>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-4">
            <Stat label="Monthly limit" value={formatNumber(Number(quota.monthlyLimit ?? 0))} />
            <Stat label="Used" value={formatNumber(Number(quota.used ?? 0))} />
            <Stat
              label="Remaining"
              value={formatNumber(Number(quota.remaining ?? 0))}
              tone={Number(quota.remaining ?? 0) > 0 ? 'accent' : 'default'}
            />
          </CardBody>
          <CardFooter>
            Window {String(quota.window ?? '—')}. The free tier is 1,000 requests per month, which is
            why the fixture provider exists: a demo that dies when the quota runs out is not a demo.
          </CardFooter>
        </Card>
      ) : null}

      {/* ---------------------------- ingestion runs --------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Ingestion history</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              One row per scheduled sync. Failures are retained rather than overwritten — the failing
              run is the most informative thing in this table.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Run</Th>
                <Th>Provider</Th>
                <Th>Status</Th>
                <Th align="right" className="hidden md:table-cell">
                  Products
                </Th>
                <Th align="right" className="hidden md:table-cell">
                  Observations
                </Th>
                <Th align="right">Duration</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="transition-colors hover:bg-raised/40">
                  <Td className="text-xs text-ink-muted">{formatDate(run.startedAt)}</Td>
                  <Td className="font-mono text-[11px] text-ink-muted">{run.provider}</Td>
                  <Td>
                    <Badge
                      tone={
                        run.status === 'success' ? 'up' : run.status === 'failed' ? 'down' : 'warn'
                      }
                    >
                      {run.status}
                    </Badge>
                    {run.error ? (
                      <p className="mt-1 max-w-md text-[10px] leading-relaxed text-ink-subtle">
                        {run.error}
                      </p>
                    ) : null}
                  </Td>
                  <Td align="right" className="tnum hidden text-xs text-ink-muted md:table-cell">
                    {formatNumber(run.productsUpserted)}
                  </Td>
                  <Td align="right" className="tnum hidden text-xs text-ink-muted md:table-cell">
                    {formatNumber(run.pricePointsUpserted)}
                  </Td>
                  <Td align="right" className="tnum text-xs text-ink-muted">
                    {formatDuration(run.durationMs)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ---------------------------- feature flags ---------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Feature flags</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              The paywall is data, not code. Each flag declares a minimum tier, and the gate is
              evaluated server-side on every request.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Flag</Th>
                <Th>Label</Th>
                <Th align="right">Minimum tier</Th>
                <Th align="right">Enabled</Th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.key}>
                  <Td className="font-mono text-[11px] text-ink">{flag.key}</Td>
                  <Td className="text-xs text-ink-muted">{flag.label}</Td>
                  <Td align="right">
                    <Badge
                      tone={
                        flag.minTier === 'free' ? 'neutral' : flag.minTier === 'pro' ? 'accent' : 'info'
                      }
                    >
                      {TIER_LABELS[flag.minTier]}
                    </Badge>
                  </Td>
                  <Td align="right" className="text-xs text-ink-muted">
                    {flag.enabled ? 'yes' : 'no'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ------------------------------- sources ------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Source registry</CardTitle>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Kind</Th>
                <Th align="right">Notes</Th>
                <Th align="right" className="hidden md:table-cell">
                  Retrieved
                </Th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <Td className="text-xs text-ink">
                    {source.url ? (
                      <a href={source.url} className="hover:text-accent" rel="noreferrer noopener">
                        {source.name}
                      </a>
                    ) : (
                      source.name
                    )}
                  </Td>
                  <Td>
                    <Badge tone="outline">{source.kind}</Badge>
                  </Td>
                  <Td align="right" className="tnum text-xs text-ink-muted">
                    {pluralize(source.insightCount, 'note')}
                  </Td>
                  <Td align="right" className="hidden text-xs text-ink-subtle md:table-cell">
                    {formatDate(source.retrievedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Callout tone="neutral" title="What is not wired up here">
        There is no live scheduler in the demo — the ingestion history is seeded so the surface can be
        evaluated. The real job is a cron entry calling the same provider adapter the application
        uses, and <code className="text-ink">pnpm analytics:refresh</code> afterwards. The adapter,
        the run log and the quota capture are all implemented; only the trigger is missing, and it is
        a deployment concern rather than a code one. See{' '}
        <Link href="/trends/methodology" className="text-accent hover:underline">
          methodology
        </Link>{' '}
        for what runs downstream.
      </Callout>
    </div>
  );
}
