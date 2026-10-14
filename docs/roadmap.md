# Roadmap

What is built, what comes next, and what each stage costs. Written so a reader can tell the
difference between "not done" and "not started" — this project is unusually complete at stage 0 and
that is deliberate.

---

## Phase 0 — Working foundation ✅ *shipped*

The clickable product. Everything a reviewer needs in order to judge the work.

| Delivered | Evidence |
| --- | --- |
| 16-table PostgreSQL schema | [`src/db/schema.ts`](../src/db/schema.ts), migrations in `drizzle/` |
| Runs with zero external services | embedded PostgreSQL, committed dataset |
| 240-silhouette catalogue, 18 months of history | 28,320 price + 18,720 sales observations |
| Full-text search + 5 facets + 8 sort keys | `/products` |
| Multi-product comparison, rebased | `/compare` |
| Trend Momentum Index | 52 unit tests; specification at `/trends/methodology` |
| Colour / material / category rotation | `/trends` |
| Analyst desk with polymorphic entity linking | `/admin` |
| Editorial CMS, Markdown, draft → publish | `/admin/editorial`, `/editorial` |
| Server-side tier gating | `/pricing`; measured 38 KB vs 138 KB response |
| Provider abstraction, two implementations | [ADR-0001](adr/0001-provider-adapter.md) |
| CI: typecheck, test, build | `.github/workflows/ci.yml` |

---

## Phase 1 — Live data and scheduling

**Goal:** replace the snapshot with a real feed, on a schedule, with the failure modes handled.

- Confirm the KicksDB response mapping against a live account (`--dry-run` exists for this).
- Cron trigger calling `scripts/ingest.ts` → `scripts/analytics:refresh`.
- Transactional ingestion: a failed batch rolls back rather than leaving partial observations.
- Per-provider rate limiting and a circuit breaker on repeated 5xx.
- Orphan sweep for `insight_links` when a product leaves the catalogue.
- Backfill tooling: historical re-ingest for a date range without duplicating rows.

**Exit criteria:** a full week of unattended runs, with at least one provider failure recovered
without manual intervention.

---

## Phase 2 — Commercial surface

**Goal:** take money, and give paying users something the free tier does not have.

- Stripe: products, prices, checkout, billing portal, webhooks writing `subscriptions`.
- Entitlement cache so the tier check does not hit the database on every render.
- Alerts: price thresholds and supply-ratio triggers, delivered by email.
- CSV and JSON export with signed, expiring URLs.
- Audit log for every write through the analyst desk.
- Seat management for the Enterprise tier.

**Exit criteria:** a test-mode subscription completes end to end and unlocks the gated surfaces
without a deploy.

---

## Phase 3 — Depth

**Goal:** the things that make the tool hard to replace.

- **Daily granularity** for the price series (the schema is already daily-capable; only the seed is
  weekly) and an intraday quote path for real-time providers.
- **Index back-fitting** so the momentum score can be evaluated historically — you cannot validate a
  signal you have no history for.
- **Model evaluation harness**: walk-forward test of the TMI's relationship to forward returns, with
  the result published whether or not it is flattering. If the index does not predict anything, that
  belongs on `/trends/methodology`.
- **AI summaries** (flagged `ai.summaries`, Enterprise): LLM-written market recaps grounded strictly
  in the computed aggregates, with the source figures cited inline and never asserted from the model's
  own priors.
- **Warehouse export** to Parquet for BI tools, so the analytics team is not reading the operational
  database.

---

## Deliberately not planned

| Not doing | Why |
| --- | --- |
| A mobile app | The web app is responsive enough for the read path. A native app serves a use case nobody has described yet. |
| A general-purpose BI query builder | The value here is the domain model and the index, not another chart builder. Embed the warehouse export instead. |
| Multi-tenant white-labelling | Real demand for this would reshape the data model (per-tenant catalogues, per-tenant indices). Build it when a second tenant exists, not before. |
| Real-time streaming quotes | Weekly and daily data answer the questions this product asks. Sub-second data would change the audience, not just the infrastructure. |
| Predicting prices | The index describes state, not the future, and the methodology says so. Adding a forecast would mean either publishing an unvalidated number or doing the walk-forward work in Phase 3 first. |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Provider API changes shape or pricing | High | High | Interface isolates the blast radius to one adapter file; `--dry-run` surfaces a break before ingestion writes |
| Quota exhaustion on the free tier | High | Medium | Snapshot fallback; quota captured per call and surfaced on `/admin/ops` |
| Trend index mis-calibrated for a new market | Medium | High | Constants are published and explained; re-calibration is a documented, deliberate act |
| Synthetic data mistaken for real | Medium | High | Disclosed in the README, in the manifest, and in the footer of every page |
| Scope creep into a general BI tool | Medium | Medium | "Deliberately not planned" above is the fence |
