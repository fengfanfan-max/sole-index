# Screenshots

The shot list for the proposal, and the state of each capture.

Three are committed (`01`, `03`, `05`). The rest are un-captured — the application is running, so
they take a browser and a minute each. Capture at **1560 × 1007** (the committed size) or larger, with
a persona signed in as noted.

| # | File | Route | Persona | Why this shot |
| --- | --- | --- | --- | --- |
| 01 | `01-overview.jpg` ✅ | `/` | admin | The hero. Index chart with the retail reference line, six KPIs, breadth strip. |
| 02 | `02-product-detail.jpg` | `/products/new-balance-550-desert-ore` | admin | Price history with bid/ask/last-sale, momentum radar, **analyst notes attached to the product**. |
| 03 | `03-catalogue.jpg` ✅ | `/products?sort=tmi` | admin | Search, five facets, sparklines, colour bars, comparison basket controls. |
| 04 | `04-compare.jpg` | `/compare?ids=<3 ids>` | admin | Rebased multi-series chart plus the attribute diff table. |
| 05 | `05-trend-radar.jpg` ✅ | `/trends` | admin or editor | Colourway / material / category momentum and the gaining-vs-losing rotation. |
| 06 | `06-methodology.jpg` | `/trends/methodology` | any | The formula, weights, calibration constants and the limitations list. |
| 07 | `07-analyst-desk.jpg` | `/admin` | admin | The observation composer and the entity-link chips on saved notes. |
| 08 | `08-content-studio.jpg` | `/admin/editorial` | admin | Markdown authoring, draft → publish controls. |
| 09 | `09-report.jpg` | `/editorial/q3-2026-resale-report` | any | Rendered long-form report with tables and headings. |
| 10 | `10-operations.jpg` | `/admin/ops` | admin | Ingestion history, quota, feature flags — the unglamorous half. |
| 11 | `11-pricing.jpg` | `/pricing` | viewer | The locked state. Proves the gate is server-side: the payload is ~100 KB smaller. |
| 12 | `12-paywall-trends.jpg` | `/trends` | **viewer** | The same route as 05, locked. The pair (05, 12) is the most persuasive evidence in the set. |
| 13 | `13-login.jpg` | `/login` | any | Three personas, one click apart. |

## Capturing them

```bash
pnpm build && pnpm start      # preferred for screenshots
# or, on a normal local machine: pnpm dev
```

> **If the charts render blank**, check whether you are in `next dev` behind a proxy that blocks
> WebSocket upgrades. Recharts' `ResponsiveContainer` measures the DOM on the client, so it renders
> nothing during SSR — if the page never hydrates, every chart is an empty panel while the
> server-rendered tables and text look fine. In `next dev` the HMR socket is what fails; in
> production there is no HMR client, so `pnpm build && pnpm start` renders correctly. This is an
> environment issue, not a data one: `pnpm verify` will still pass, because it asserts on
> server-rendered markup.

Then, for the admin shots, the default persona already is admin. For `11` and `12`, switch persona in
the header to **Demo Viewer** (free tier) — the switcher submits on change.

For `04`, build a basket first: open `/products`, click the `+` at the start of three rows, then
**Compare 3 products**.

## Presentation notes

- The committed shots are full-viewport at 1560 px. Wider than 1600 px and the sidebar stops earning
  its width; narrower than 1400 px and the catalogue table drops its sparkline column.
- Dark UI screenshots benefit from a 1 px border when placed on a light background. The Markdown in
  the README wraps them in a `<p align="center">` for that reason.
- Do not crop the sidebar out of the hero. The navigation is part of the impression: it shows the
  product has an information architecture, not just one beautiful page.
