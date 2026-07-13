-- ============================================================================
-- MIGRATION 001: Core Relational Schemas (DDL)
-- Project Tender — Unified Memory & Aggregation Layer
-- Target: PostgreSQL 15+ with TimescaleDB 2.x
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Trigram similarity for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";       -- GIN indexing for non-array types

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Organization classification: State vs Central government bodies
CREATE TYPE org_type_enum AS ENUM ('state', 'central', 'psu', 'autonomous');

-- Tender procurement method as per CPPP classification
CREATE TYPE tender_type_enum AS ENUM (
    'open',              -- Open competitive bidding (default)
    'limited',           -- Limited tender (pre-qualified vendors)
    'single_bid',        -- Single source / nomination
    'global',            -- International competitive bidding
    'eoi'                -- Expression of Interest
);

-- Contract status lifecycle
CREATE TYPE contract_status_enum AS ENUM (
    'awarded',           -- Contract signed
    'cancelled',         -- Cancelled before award
    'terminated',        -- Terminated post-award
    'completed',         -- Work completed
    'disputed'           -- Under arbitration/dispute
);

-- Agent checkpoint classification for the memory layer
CREATE TYPE checkpoint_type_enum AS ENUM (
    'episodic',          -- Discrete event memory (e.g., "found anomaly X")
    'procedural',        -- Workflow state (e.g., "step 3 of IRI calculation")
    'payload'            -- Serialized output (e.g., RTI dossier JSON)
);

-- ============================================================================
-- TABLE: org_summary
-- Department hierarchies — maps every Public Authority in the CPPP dataset.
-- ~1,793 rows in current dataset. Small dimension table.
-- ============================================================================
CREATE TABLE org_summary (
    org_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name        TEXT NOT NULL,
    parent_ministry TEXT,                          -- Parent ministry (e.g., "Ministry of Road Transport")
    org_type        org_type_enum NOT NULL DEFAULT 'central',
    region          TEXT,                          -- State/UT name for state bodies; 'National' for central
    total_budget    NUMERIC(18, 2) DEFAULT 0,     -- Annual budget allocation (INR)
    cpio_address    TEXT,                          -- Central Public Information Officer address for RTI
    website         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT org_name_unique UNIQUE (org_name),
    CONSTRAINT total_budget_non_negative CHECK (total_budget >= 0)
);

-- Index: Fast lookup by parent ministry for hierarchical drill-downs
CREATE INDEX idx_org_parent_ministry ON org_summary (parent_ministry) WHERE parent_ministry IS NOT NULL;
-- Index: Region-based filtering for state-level scorecards
CREATE INDEX idx_org_region ON org_summary (region) WHERE region IS NOT NULL;
-- Index: Active orgs only (partial index — most queries filter is_active = TRUE)
CREATE INDEX idx_org_active ON org_summary (org_name) WHERE is_active = TRUE;

COMMENT ON TABLE org_summary IS 'Department/Public Authority dimension table. Maps every buying entity in the CPPP dataset.';
COMMENT ON COLUMN org_summary.total_budget IS 'Annual budget allocation in INR. Used for budget utilization ratio calculations.';

-- ============================================================================
-- TABLE: vendor_summary
-- Contractor profiles — every unique vendor that has bid on or won a contract.
-- ~947k rows in current dataset. Medium dimension table.
-- ============================================================================
CREATE TABLE vendor_summary (
    vendor_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name         TEXT NOT NULL,
    registration_type   TEXT,                          -- e.g., 'Pvt Ltd', 'LLP', 'Proprietorship'
    incorporated_date   DATE,                          -- Date of incorporation
    pan_number          TEXT,                          -- Permanent Account Number (masked in production)
    gst_number          TEXT,                          -- GST registration
    active_status       BOOLEAN NOT NULL DEFAULT TRUE,
    total_contracts_won INTEGER NOT NULL DEFAULT 0,
    total_value_won     NUMERIC(18, 2) NOT NULL DEFAULT 0,
    avg_bids_per_tender NUMERIC(5, 2),                -- Historical average bids received on tenders this vendor participates in
    single_bid_wins     INTEGER NOT NULL DEFAULT 0,    -- Count of contracts won with only 1 bid (red flag indicator)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT vendor_name_unique UNIQUE (vendor_name),
    CONSTRAINT total_value_non_negative CHECK (total_value_won >= 0),
    CONSTRAINT single_bid_wins_non_negative CHECK (single_bid_wins >= 0)
);

-- Index: Trigram index on vendor_name for fuzzy/partial matching in search
CREATE INDEX idx_vendor_name_trgm ON vendor_summary USING gin (vendor_name gin_trgm_ops);
-- Index: Active vendors with high contract volume (top vendor queries)
CREATE INDEX idx_vendor_active_value ON vendor_summary (total_value_won DESC) WHERE active_status = TRUE;
-- Index: Single-bid win flag for corruption risk queries
CREATE INDEX idx_vendor_single_bid ON vendor_summary (single_bid_wins DESC) WHERE single_bid_wins > 0;

COMMENT ON TABLE vendor_summary IS 'Vendor/contractor dimension table. Tracks cumulative performance metrics and red-flag indicators.';
COMMENT ON COLUMN vendor_summary.single_bid_wins IS 'Count of contracts won where only 1 bid was received. High values indicate potential market capture.';

-- ============================================================================
-- TABLE: aoc_clean
-- Award of Contract — the core fact table. Heaviest table in the system.
-- ~4.54M rows in current dataset, growing at ~500k rows/year.
-- This table will be converted to a TimescaleDB hypertable in migration 002.
-- ============================================================================
CREATE TABLE aoc_clean (
    -- Primary key: UUID for referential integrity (replaces SQLite internal_id TEXT)
    contract_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Legacy tender_id from CPPP (kept for cross-referencing with raw data)
    tender_id           TEXT NOT NULL,

    -- Foreign keys to dimension tables
    org_id              UUID NOT NULL REFERENCES org_summary(org_id) ON DELETE RESTRICT,
    vendor_id           UUID NOT NULL REFERENCES vendor_summary(vendor_id) ON DELETE RESTRICT,

    -- Contract financials
    contract_value      NUMERIC(18, 2) NOT NULL,      -- Award value in INR

    -- Temporal fields (critical for TimescaleDB partitioning)
    award_date          TIMESTAMPTZ NOT NULL,          -- Date contract was awarded (partition key)
    contract_date       TIMESTAMPTZ,                   -- Date contract was signed (may differ from award)
    published_date      TIMESTAMPTZ,                   -- Date tender was published
    closing_date        TIMESTAMPTZ,                   -- Original bid closing date

    -- Competition metrics
    bids_received       SMALLINT NOT NULL DEFAULT 0,   -- Number of bids received
    bid_window_days     SMALLINT,                      -- Days between publish and closing
    award_delay_days    SMALLINT,                      -- Days between closing and award

    -- Tender classification
    tender_type         tender_type_enum NOT NULL DEFAULT 'open',
    contract_status     contract_status_enum NOT NULL DEFAULT 'awarded',

    -- Text fields for FTS (will have generated tsvector column in migration 003)
    tender_title        TEXT,
    tender_ref_no       TEXT,
    description         TEXT,

    -- Denormalized text for backward compatibility with existing SQLite queries
    -- These will be maintained via triggers to match org_summary/vendor_summary
    org_name            TEXT NOT NULL,
    vendor_name         TEXT NOT NULL,

    -- Metadata
    state               TEXT,                          -- State/UT where work is performed
    sector              TEXT,                          -- Economic sector classification
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT contract_value_positive CHECK (contract_value > 0),
    CONSTRAINT bids_received_non_negative CHECK (bids_received >= 0),
    CONSTRAINT bid_window_positive CHECK (bid_window_days IS NULL OR bid_window_days >= 0),
    CONSTRAINT award_delay_non_negative CHECK (award_delay_days IS NULL OR award_delay_days >= 0),
    CONSTRAINT tender_id_not_empty CHECK (tender_id <> '')
);

-- ============================================================================
-- INDEXES ON aoc_clean (pre-hypertable)
-- Note: After hypertable conversion (migration 002), TimescaleDB automatically
-- creates a composite index on (award_date DESC, ...). These additional indexes
-- complement the automatic partitioning index.
-- ============================================================================

-- Index: Department drill-down — most common query pattern
-- Covers: HHI calculation, department scorecards, top-departments leaderboard
CREATE INDEX idx_aoc_org_award ON aoc_clean (org_id, award_date DESC);

-- Index: Vendor lookup — for vendor scorecards and win-rate calculations
CREATE INDEX idx_aoc_vendor_award ON aoc_clean (vendor_id, award_date DESC);

-- Index: Single-bid filter — red flag queries filter bids_received <= 2
CREATE INDEX idx_aoc_bids_received ON aoc_clean (bids_received);

-- Index: Award delay filter — red flag queries filter award_delay_days > 90
CREATE INDEX idx_aoc_award_delay ON aoc_clean (award_delay_days) WHERE award_delay_days IS NOT NULL;

-- Index: Contract value range scans — for high-value tender filtering
CREATE INDEX idx_aoc_contract_value ON aoc_clean (contract_value DESC);

-- Index: Tender type filter — for tender_type breakdowns
CREATE INDEX idx_aoc_tender_type ON aoc_clean (tender_type);

-- Index: State/sector filters — for geographic and sector drill-downs
CREATE INDEX idx_aoc_state ON aoc_clean (state) WHERE state IS NOT NULL;
CREATE INDEX idx_aoc_sector ON aoc_clean (sector) WHERE sector IS NOT NULL;

-- Index: Legacy tender_id lookup — for cross-referencing with raw data
CREATE INDEX idx_aoc_tender_id ON aoc_clean (tender_id);

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to org_summary
CREATE TRIGGER trg_org_summary_updated_at
    BEFORE UPDATE ON org_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to vendor_summary
CREATE TRIGGER trg_vendor_summary_updated_at
    BEFORE UPDATE ON vendor_summary
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS: Maintain denormalized org_name/vendor_name in aoc_clean
-- Ensures backward compatibility with existing queries that use text names.
-- ============================================================================

-- Sync org_name when org_summary is updated
CREATE OR REPLACE FUNCTION sync_org_name()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.org_name IS DISTINCT FROM NEW.org_name THEN
        UPDATE aoc_clean SET org_name = NEW.org_name WHERE org_id = NEW.org_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_org_name
    AFTER UPDATE OF org_name ON org_summary
    FOR EACH ROW EXECUTE FUNCTION sync_org_name();

-- Sync vendor_name when vendor_summary is updated
CREATE OR REPLACE FUNCTION sync_vendor_name()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.vendor_name IS DISTINCT FROM NEW.vendor_name THEN
        UPDATE aoc_clean SET vendor_name = NEW.vendor_name WHERE vendor_id = NEW.vendor_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_vendor_name
    AFTER UPDATE OF vendor_name ON vendor_summary
    FOR EACH ROW EXECUTE FUNCTION sync_vendor_name();

-- ============================================================================
-- VIEWS: Pre-computed summaries for dashboard KPIs
-- These replace the SQLite monthly_summary and pre-computed JSON caches.
-- ============================================================================

-- Monthly spending summary (replaces SQLite monthly_summary table)
CREATE MATERIALIZED VIEW mv_monthly_summary AS
SELECT
    date_trunc('month', award_date) AS month_start,
    org_id,
    COUNT(*) AS contract_count,
    SUM(contract_value) AS total_value,
    AVG(bids_received) AS avg_bids,
    SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) AS single_bid_count,
    SUM(CASE WHEN bid_window_days < 7 THEN 1 ELSE 0 END) AS rush_job_count,
    AVG(award_delay_days) AS avg_award_delay
FROM aoc_clean
WHERE contract_status = 'awarded'
GROUP BY date_trunc('month', award_date), org_id
WITH DATA;

-- Index on materialized view for fast time-range queries
CREATE INDEX idx_monthly_summary_month ON mv_monthly_summary (month_start DESC);
CREATE INDEX idx_monthly_summary_org ON mv_monthly_summary (org_id, month_start DESC);

COMMENT ON MATERIALIZED VIEW mv_monthly_summary IS 'Pre-aggregated monthly metrics per department. Refresh daily via pg_cron or application scheduler.';

-- ============================================================================
-- END OF MIGRATION 001
-- ============================================================================