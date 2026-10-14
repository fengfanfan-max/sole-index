/**
 * Methodology.
 *
 * This page is public and un-gated on purpose. Publishing the formula, the
 * calibration constants and — more importantly — the failure modes is what
 * separates a score you can act on from a number with a colour. If a metric
 * cannot survive being written down, it should not be driving decisions.
 *
 * Every constant below is imported from `src/lib/analytics/tmi.ts`, so this page
 * cannot drift out of sync with the code even if nobody remembers to update it.
 */
import Link from 'next/link';

import { PageHeader } from '@/components/cards';
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/ui/primitives';
import {
  TMI_CALIBRATION,
  TMI_DEFAULT_WINDOW_DAYS,
  TMI_FACTOR_DESCRIPTIONS,
  TMI_FACTOR_LABELS,
  TMI_FACTORS,
  TMI_WEIGHTS,
} from '@/lib/analytics/tmi';

export const metadata = {
  title: 'Methodology',
  description:
    'How the SoleIndex Trend Momentum Index is constructed: factor weights, calibration constants, worked example and known limitations.',
};

const CALIBRATION_NOTES: Record<string, string> = {
  velocityScale:
    'Fractional price change per day that maps to a factor score of about 76/100. 0.0025 is +0.25% per day, which compounds to roughly +20% over a 90-day window.',
  volumeScale:
    'Distance from a 1.0 volume ratio that maps to about 76/100. 0.6 means “the recent half traded 60% more than the prior half” is a strong positive reading.',
  volatilityScale:
    'Standard deviation of week-on-week returns that maps to about 37/100. Above this, the stability factor starts to penalise the position meaningfully.',
  turnoverMid:
    'Turnover (units sold per standing listing) considered neutral. 1.0 means the standing supply turned over once across the window.',
  turnoverScale: 'Spread of turnover around the neutral point. Turnover is clamped to 10 before use, so a zero-listing entity cannot dominate.',
};

export default function MethodologyPage() {
  const totalWeight = TMI_FACTORS.reduce((sum, f) => sum + TMI_WEIGHTS[f], 0);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Methodology"
        title="How the Trend Momentum Index is built"
        description="A single 0–100 score that summarises the current state of demand for a product, colourway, material, category or brand. This page is the specification: the formula, the constants, a worked example, and — the part most vendors leave out — what the score cannot tell you."
        action={<Badge tone="accent">{TMI_DEFAULT_WINDOW_DAYS}-day default window</Badge>}
      />

      {/* ---------------------------- what it is not ---------------------------- */}
      <Callout tone="warn" title="It is not a forecast">
        Nothing here extrapolates. The index is a weighted summary of <em>observed</em> state, so a
        high score means “demand is currently strong with supply roughly in balance” — it says
        nothing about next quarter. Any tool that claims to predict a future price from this data is
        overfitting to a small sample, and you should ask to see its out-of-sample error.
      </Callout>

      {/* ------------------------------- formula -------------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">The composite</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Five factors, each normalised to 0–1, combined at fixed published weights.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <pre className="overflow-x-auto rounded-control border border-line bg-canvas px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-muted">
{`TMI = 100 × (  w_velocity  × f_velocity(price)
            + w_volume    × f_volume(volume_recent / volume_prior)
            + w_stability × f_stability(σ(weekly returns))
            + w_turnover  × f_turnover(units / standing_listings)
            + w_attention × f_attention(editorial mentions, search interest) )`}
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Directional factors are squashed onto (0, 1) with{' '}
            <code className="text-ink">0.5 + 0.5·tanh(x / scale)</code>, so 0.5 is neutral and the
            function cannot saturate no matter how extreme an input gets. Strictly-bounded factors
            (stability, attention) use their natural range.
          </p>
        </CardBody>
      </Card>

      {/* ------------------------------- factors ------------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">The five factors</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Weights sum to {totalWeight.toFixed(2)}. Two factors are lagging, three are leading or
              independent.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Factor</Th>
                <Th align="right">Weight</Th>
                <Th align="right">Lead / lag</Th>
                <Th>What it measures</Th>
              </tr>
            </thead>
            <tbody>
              {TMI_FACTORS.map((factor) => (
                <tr key={factor}>
                  <Td className="font-medium text-ink">{TMI_FACTOR_LABELS[factor]}</Td>
                  <Td align="right" className="tnum text-ink">
                    {(TMI_WEIGHTS[factor] * 100).toFixed(0)}%
                  </Td>
                  <Td align="right">
                    <Badge
                      tone={
                        factor === 'priceVelocity' || factor === 'volatility'
                          ? 'neutral'
                          : factor === 'sellThrough'
                            ? 'accent'
                            : 'info'
                      }
                    >
                      {factor === 'priceVelocity' || factor === 'volatility'
                        ? 'lagging'
                        : factor === 'sellThrough'
                          ? 'leading'
                          : 'independent'}
                    </Badge>
                  </Td>
                  <Td className="max-w-2xl text-xs leading-relaxed text-ink-muted">
                    {TMI_FACTOR_DESCRIPTIONS[factor]}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ------------------------------ calibration ----------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Calibration constants</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              The sensitivity dials. They are chosen against the observed range of this catalogue and
              are re-tuned deliberately — not continuously, and never silently.
            </p>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Constant</Th>
                <Th align="right">Value</Th>
                <Th>Why this value</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TMI_CALIBRATION).map(([key, value]) => (
                <tr key={key}>
                  <Td className="font-mono text-[12px] text-ink">{key}</Td>
                  <Td align="right" className="tnum text-ink">
                    {value}
                  </Td>
                  <Td className="max-w-2xl text-xs leading-relaxed text-ink-muted">
                    {CALIBRATION_NOTES[key]}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* --------------------------- worked example ---------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Worked example</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              A silhouette that is rising modestly on steady volume — the most common real case, and
              the one where a badly calibrated index produces the most misleading number.
            </p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 text-xs leading-relaxed text-ink-muted">
          <p>
            Thirteen weekly observations. Price drifts from $180 to $204 (OLS slope ≈ +$0.28/day
            against a mean of $192, so a fractional velocity of about 0.00144/day). Volume rises from
            9 to 13 units per week. Week-on-week return standard deviation is 0.021. Turnover is 1.4
            units per standing listing. The analyst desk has attached two published notes, giving an
            attention signal of 0.4.
          </p>
          <div className="overflow-x-auto rounded-control border border-line bg-canvas px-4 py-3 font-mono text-[12px]">
{`velocity   = 0.5 + 0.5·tanh(0.00144 / 0.0025) = 0.5 + 0.5·tanh(0.576)  = 0.759
volume     = 0.5 + 0.5·tanh((1.44-1) / 0.60)  = 0.5 + 0.5·tanh(0.733)  = 0.812
stability  = e^(-0.021 / 0.06)                                        = 0.705
turnover   = 0.5 + 0.5·tanh((1.40-1) / 1.00)  = 0.5 + 0.5·tanh(0.40)   = 0.690
attention  = 0.4                                                      = 0.400

TMI = 100 × (0.35·0.759 + 0.25·0.812 + 0.15·0.705 + 0.15·0.690 + 0.10·0.400)
    = 100 × (0.2657 + 0.2030 + 0.1058 + 0.1035 + 0.0400)
    = 71.8`}
          </div>
          <p>
            A score in the low 70s reads as “clearly heating, with volume confirming the move and
            supply not fighting it”. Note that the attention factor moved the result by only four
            points: the qualitative input is a modifier, not the driver.
          </p>
        </CardBody>
      </Card>

      {/* -------------------------- confidence handling ------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Thin samples and degenerate input</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 text-xs leading-relaxed text-ink-muted">
          <p>
            Every factor is a total function: an empty window, a single print, a constant price or a
            zero-volume product all produce a well-formed result with an explanatory note, never a
            confident-looking number and never <code className="text-ink">NaN</code>. This is
            enforced by the test suite, not by good intentions.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Rule title="Fewer than 3 observations">
              Score falls back to a neutral 50 with <code className="text-ink">confidence: low</code>{' '}
              and a note stating the window is too small to establish a trend.
            </Rule>
            <Rule title="Constant price across the window">
              Velocity and stability become uninformative; the result is still returned, with a note
              saying so. The score then leans on volume and sell-through.
            </Rule>
            <Rule title="No units traded">
              The score reflects listed supply only. A note states explicitly that it should not be
              read as demand.
            </Rule>
            <Rule title="Zero standing listings">
              Turnover would be infinite; it is clamped to 10 before the logistic, so the entity
              cannot dominate a ranking.
            </Rule>
          </div>
          <p>
            Confidence is reported separately from the score: <strong className="text-ink">high</strong>{' '}
            at 12+ observations and 60+ units, <strong className="text-ink">medium</strong> at 8+ and
            20+, otherwise <strong className="text-ink">low</strong>. The leaderboard shows the score
            and sorts ties by confidence, so a thin sample never outranks a real trend by accident.
          </p>
        </CardBody>
      </Card>

      {/* ------------------------------ limitations ----------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Known limitations</CardTitle>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Written before anyone asked, because a metric without a stated failure mode is a
              liability.
            </p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Limit title="Survivorship and coverage bias">
            The catalogue is a curated 240 silhouettes. Silhouettes that stopped trading are absent
            from the sample, which biases every aggregate upward — the index describes the tracked
            set, not the market.
          </Limit>
          <Limit title="Endpoint sensitivity in share series">
            Attribute share deltas compare the first and last month rather than fitting a trend, so a
            single unusual month at either end moves the number. The chart is the check on the
            statistic, which is why both are always shown together.
          </Limit>
          <Limit title="Overlapping material shares">
            A product can carry several materials, so material shares sum well above 100%. They are
            shares of <em>products containing</em> a material, not a partition of the market, and the
            UI labels them as such.
          </Limit>
          <Limit title="Attention is subjective">
            The attention factor is a 0–1 judgement supplied by the analyst desk, not a measured
            quantity. It carries 10% of the weight, which is a deliberate cap; a neutral 0.5 is used
            when no signal exists, rather than assuming strength or weakness.
          </Limit>
          <Limit title="Calibration drift">
            The constants were fitted to this dataset's range. Different price bands, a different
            category mix or a much larger catalogue would need re-fitting; carrying these numbers to
            another market without checking is the single easiest way to misuse the index.
          </Limit>
          <Limit title="Weekly observations">
            The demo dataset is weekly. Daily data would sharpen the velocity and stability factors
            but make the sell-through factor noisier, since a single day is often one trade. The
            window is a parameter, not a constant.
          </Limit>
        </CardBody>
      </Card>

      <Callout tone="accent" title="Read the implementation">
        The reference implementation is{' '}
        <code className="text-ink">src/lib/analytics/tmi.ts</code> — pure functions, no I/O, with the
        test suite at <code className="text-ink">tmi.test.ts</code> asserting both direction and the
        degenerate cases above. The constants on this page are imported from that module, so this
        document cannot drift away from the code.
      </Callout>

      <div className="flex flex-wrap gap-3">
        <Link href="/trends" className="text-sm text-accent hover:underline">
          ← Back to the trend radar
        </Link>
        <Link href="/products" className="text-sm text-ink-muted hover:text-ink hover:underline">
          Browse the catalogue
        </Link>
      </div>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-canvas px-3 py-2.5">
      <p className="mb-1 text-[11px] font-semibold text-ink">{title}</p>
      <p className="text-[11px] leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
      <div>
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{children}</p>
      </div>
    </div>
  );
}
