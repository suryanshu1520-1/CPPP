# Tender-Trace

A civic-transparency dashboard built on India's Central Public Procurement Portal (CPPP) "Award of Contract" data. It turns raw procurement records into market-concentration and integrity-risk scoring, anomaly/red-flag detection, vendor monopoly tracking, and RTI (Right to Information Act) request generation — aimed at journalists, SME/local contractors, compliance officers, and citizens.

Full product/architecture context lives in the root-level spec docs (`Blueprint for a World-Class Public Watchdog Utility...md`, `democratic_dashboard_architecture.md`, `feasibility_study_and_production_plan.md`).

## Stack

Next.js 16 (App Router), React 19, Recharts + Framer Motion for visualizations, Tailwind CSS.

## Data sources

- **Supabase (Postgres)** — live queries for full-text search over high-value contracts (>= 5 Cr), the fiscal award-date heatmap, the money-flow Sankey diagram, the Integrity Risk Index, and alert subscriptions (`src/lib/supabase.ts`). Access goes through the publishable key with RLS enforcing read-only aggregates.
- **Cloudflare R2** — precomputed JSON blobs for macro stats, spending trend, top departments, vendor leaderboard, HHI, provenance, red flags, and the bids-distribution/scatterplot charts (`src/lib/r2.ts`), plus the full raw dataset staging area.

## Setup

```bash
npm install
```

Required environment variables (`.env.local`):

```
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET_NAME=
```

Optional overrides (both are public-by-design values with baked-in defaults):

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

```bash
npm run dev      # start the dev server
npm run build    # production build (what Vercel runs, per ../vercel.json)
npm run lint
```

## Structure

- `src/app/page.js` — the dashboard shell (Watchdog Dashboard, Corruption Risk Hub, Monopoly Tracker, Civic Auditor Canvas tabs).
- `src/app/api/**/route.js` — API route handlers (see data sources above).
- `src/components/` — chart components (`FiscalHeatmap`, `MoneyFlowSankey`, `BidsDistributionHistogram`, `BidWindowScatterplot`).
- `src/lib/supabase.ts` — Supabase client (aggregate queries + subscriptions).
- `src/lib/r2.ts` — R2 precomputed-JSON fetch helper.

`src/app/openrouter-test/` is a standalone OpenRouter streaming demo, unrelated to the procurement dashboard.
