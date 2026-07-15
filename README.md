# Tender-Trace — Public Procurement Watchdog

A civic-transparency utility built on India's Central Public Procurement Portal (CPPP) "Award of Contract" (AoC) data. It surfaces market concentration, integrity-risk scoring, single-bid/rush-job/award-delay red flags, vendor monopoly tracking, and RTI (Right to Information Act) request generation for journalists, SME/local contractors, compliance officers, and citizens.

See the root-level spec docs for full product and architecture detail:
- `Blueprint for a World-Class Public Watchdog Utility_ Architectural and Design Specifications.md`
- `democratic_dashboard_architecture.md`
- `dashboard_architecture_proposal.md`
- `feasibility_study_and_production_plan.md`

## Layout

- **`dashboard-ui/`** — the deployed Next.js application (the only thing Vercel builds, per `vercel.json`). See `dashboard-ui/README.md` for its setup and data sources.
- **`supabase/`** — Postgres schema migrations for the emerging aggregate-data backend (replacing Turso; see Data backend below).
- **`scripts/`** — data pipeline utilities, notably `precompute_to_r2.py` (generates the precomputed JSON consumed by most of `dashboard-ui`'s API routes).
- Root-level `.db` files (`dashboard.db`, `aoc_tenders.db`, etc.) — local source-of-truth SQLite datasets used by the pipeline scripts. Not deployed; not committed in normal operation.

## Data backend

The app reads from two sources: **Supabase (Postgres)** for the live-query routes (high-value contract search, fiscal heatmap, money-flow, IRI, alert subscriptions) via aggregate tables loaded from the local dataset, and **Cloudflare R2** for precomputed JSON serving everything else. The full ~4.5M-row raw dataset is too large for a free-tier Postgres instance, so R2 holds the bulk data while Supabase holds only queryable aggregates plus a >= 5 Cr search index (~155k rows total).

## Getting started

Application setup lives in `dashboard-ui/README.md`. There is no buildable app at the repository root — the root `package.json` intentionally only declares `next` as a dependency so Vercel's framework auto-detection finds it before routing the actual install/build into `dashboard-ui/`.
