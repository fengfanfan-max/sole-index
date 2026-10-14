# Architecture

The reasoning behind the structural decisions. For *what* the code does, read the code; this file is
for *why* it is shaped that way and what it would cost to change.

---

## Shape

```
Browser
  │
  ├─ Server Components ──────────────► src/lib/data/*        read models
  │      (no client JS for rendering)         │
  │                                           ├─ raw SQL for analytic aggregates
  │                                           └─ Drizzle for entity CRUD
  │                                                  │
  ├─ Server Actions ─────────────────► src/lib/data/mutations.ts
  │      (the only write path)                 │  re-checks session role server-side
  │                                            ▼
  └─ 2 client components                  PostgreSQL 18
        charts, filters                          │
                                                 ├─ local: PGlite (WASM, ./.data)
                                                 └─ prod:  Neon / RDS / Supabase
```

Two client components. Everything else — filtering, comparison selection, the paywall, the admin
forms' submission path — is server-rendered and driven by URL state.

---

## Why embedded PostgreSQL

**The problem.** A portfolio or demo project needs to run on someone else's machine with zero
setup. The conventional answer is SQLite, which is genuinely zero-setup but is *not* the same
database the project would use in production. SQLite vs PostgreSQL is not a dialect difference you
can ignore: `distinct on`, `lateral`, window functions, `jsonb`, `text[]`, `numeric`, partial
indexes, `percentile_cont` — this codebase uses all of them.

Choosing SQLite would mean either rewriting every query on deploy, or maintaining two query paths.
Both are worse than the alternative.

**The choice.** [PGlite](https://pglite.dev) — PostgreSQL 18 compiled to WebAssembly, persisted to a
directory. `pnpm dev` starts it in-process; there is no service to install.

**What that buys:**
- Identical SQL, identical semantics, identical migrations in development and production.
- `drizzle-kit` generates one set of migrations that applies to both.
- The demo dataset is a real database, not a fixture file pretending to be one. `distinct on`,
  `lateral`, `percentile_cont`, `filter (where …)` and array overlap all run for real.
- Switching to Neon is `SOLEINDEX_DB_DRIVER=postgres` plus a `DATABASE_URL`. That is the entire
  deploy story.

**What it costs:**
- Cold start is ~1 s (WASM heap plus recovery).
- Single-writer, in-process. Fine for a demo and for CI; not a multi-instance production topology —
  which is precisely why the Postgres driver exists alongside it.
- `serverExternalPackages: ['@electric-sql/pglite']` in `next.config.ts` is required so the bundler
  does not try to tree-shake the `.wasm` asset. That line is load-bearing; removing it breaks the
  build in a way that is not obvious from the error.

The driver factory is [`src/db/client.ts`](src/db/client.ts). It caches the handle on `globalThis` so
Next's HMR passes do not leak a WASM heap per edit.

---

## Query strategy

**Rule: analytic aggregates are written as SQL; entity CRUD goes through Drizzle's query builder.**

Drizzle's value is type-safe structured queries. Its weakness is window functions, `distinct on`,
`lateral` joins and `percentile_cont`, where the generated nesting stops being readable and starts
being a debugging liability. The catalogue query joins the product table to the latest price, a
30-day-ago price, recent volume and a stored score, then filters and sorts across all of them. As
raw SQL it is a page you can read. Through a builder it is three screens of indentation to express
the same thing.

The cost is that raw SQL row shapes are asserted rather than inferred. That cast is confined to one
function, [`src/lib/data/query.ts`](src/lib/data/query.ts), with a comment explaining exactly what is
being bypassed and why.

The `distinct on (product_id) … order by product_id, date desc` pattern is used for "latest price per
product" throughout, rather than a correlated subquery. Postgres satisfies it directly from the
`(product_id, platform_id, date)` index: one ordered scan instead of N.

### Full-text search

```sql
to_tsvector('english', name || colorway || silhouette || brand)
  @@ websearch_to_tsquery('english', $1)
OR name ILIKE '%' || $1 || '%'   -- and three more columns
```

`websearch_to_tsquery` gives phrase quoting, `OR` and `-exclusion` for free. The `ILIKE` disjunction
covers as-you-type prefixes, because `to_tsvector` tokenises and "samb" would not match "Samba".

At 240 rows this is a sequential scan and costs nothing. At a million rows the fix is a generated
`tsvector` column plus a GIN index — the query shape stays the same. Adding that machinery now would
be cargo cult, and it is called out here rather than quietly skipped.

---

## Render strategy

**Every route is `force-dynamic`.** That is a deliberate trade for this application:

- The market data is the product. A cached dashboard is a wrong dashboard.
- It keeps `next build` a pure compile step that never needs a database. CI can build without
  seeding. (Verified: the route table in `next build` output shows all routes as `ƒ`.)
- The dataset is 47k rows and the aggregates are indexed. A page render is a few milliseconds of
  query time.

At production scale the right answer changes: ISR with a short revalidate on the market overview, and
static generation for editorial, with on-demand revalidation driven by the ingestion job.
`revalidatePath` calls are already in the mutation layer for exactly that transition.

### Why almost nothing is a client component

Filtering and comparison selection are URL state. `?q=olive&brand=adidas&ids=A,B,C` is the whole
interaction model, so:

- every view is linkable and shareable, which is what an analyst actually wants;
- there is no client-side filter state to hydrate or keep in sync;
- the back button works;
- the comparison basket is an `<a href>` computed on the server, so adding a fourth product costs no
  JavaScript.

The two client components are the charts (Recharts needs the DOM) and the filter form (it must
submit itself on change). The form's `onChange` sits on the `<form>` rather than on each control, so
it catches bubbled events from server-rendered children — that is what lets the filter controls stay
server components.

---

## The polymorphic link

`insight_links(insight_id, entity_type, entity_id)` where `entity_id` points at different tables
depending on `entity_type`.

**The trade-off.** Referential integrity is given up: `entity_id` cannot be a foreign key, so a
deleted product leaves an orphaned link. The alternatives were:

1. **Five join tables** (`insight_products`, `insight_colors`, …) — full integrity, five queries or a
   five-way union for "notes about this product", and every new entity type is a new table plus a
   new migration.
2. **One table per entity's notes** — worse; the note concept fragments across the schema.
3. **Polymorphic link, orphan-swept** — what is implemented.

Option 3 was chosen because the entity universe is small, closed, and changes on the scale of
releases, not requests. The integrity gap is covered by an orphan sweep in the ingestion job (delete
links whose entity no longer exists), which is cheaper than paying for the joins on every read.

Reads are one indexed lookup on `(entity_type, entity_id)` — the index that makes "show me every
note about olive" a single index scan. This is what makes the feature real rather than a free-text
field with extra steps.

`entity_id` is also deliberately not normalised against the identifier's case or format, because
style codes and colour keys have different shapes. Validation happens at the write boundary in
`mutations.ts`.

---

## Authentication and entitlements

Three modules, deliberately separable:

| Module | Responsibility | Replaced by, in production |
| --- | --- | --- |
| `auth/session.ts` | Signed cookie → `Session`. `getSession()`, `hasTier()`, `hasRole()` | Auth.js / Clerk adapter |
| `auth/entitlements.ts` | `feature_flags` × session tier → granted/denied | Stripe webhooks writing `subscriptions` |
| `data/mutations.ts` | Re-checks role server-side on every write | unchanged |

The signature is a real HMAC over the payload, so a visitor cannot promote their own tier by editing
the cookie. That matters because the paywall has to be a genuine server-side gate to be worth
demonstrating.

**The gate is enforced before the query, not after.** `/trends` for a free session returns the locked
panel *before* any trend query runs, so the data never reaches the client. The measured difference is
38 KB versus 138 KB of response body. Blurring content the browser already holds is the most common
way a paywall demo turns out to be decorative, and it is a distinction a reviewer will test.

---

## Data flow: ingest → derive → serve

```
provider adapter ──► products, price_points, sales_points
                              │
                              ▼
                     analytics/refresh.ts        (pnpm analytics:refresh)
                              │  pure functions from analytics/tmi.ts
                              ▼
                        trend_scores
                              │
                              ▼
                    src/lib/data/*              (read models)
                              │
                              ▼
                       Server Components
```

`analytics/tmi.ts` has **no I/O**. That is what makes it unit-testable and what allows the 52-test
suite to run in 7 ms. `analytics/refresh.ts` is the only module that knows how to read observations
out of Postgres, aggregate them per entity, and write scores back. Keeping the boundary in that place
is the single most useful structural decision in the analytics layer.

Attribute trends are computed the same way: monthly share of transaction value, derived from the
price and sales series rather than authored. That is why the trend pages agree with the product pages
— a colourway visibly climbing on a product chart is also climbing on the radar, because both read
the same numbers.

---

## Known limitations of this architecture

| Limitation | Impact | Fix, when it matters |
| --- | --- | --- |
| No scheduler | Ingestion is manual | Cron entry calling `scripts/ingest.ts`, then `analytics:refresh` |
| `force-dynamic` everywhere | Every request hits the database | ISR + `revalidatePath` from the ingestion job |
| Polymorphic links are not FK-enforced | Orphaned links possible | Orphan sweep in the ingestion job |
| Single PGlite writer | Cannot scale horizontally | Already solved: `SOLEINDEX_DB_DRIVER=postgres` |
| Attention factor is subjective | 10% of the trend score is a human judgement | Cap the weight (done); log who supplied it |
| No rate limiting on Server Actions | A hostile client could spam writes | Edge middleware, when the app is public |

Each of these is a deployment concern with a known answer, not an unknown. That is the intended
state of the project at this stage.
