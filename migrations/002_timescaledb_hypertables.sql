-- ============================================================================
-- MIGRATION 002: Standard PostgreSQL Materialized Views & Rolling Aggregations
-- Project Tender — Unified Memory & Aggregation Layer (Standard PG Fallback)
-- Target: PostgreSQL 15+ (Standard SQL - no TimescaleDB required)
-- ============================================================================

-- ============================================================================
-- MATERIALIZED VIEW: Monthly Vendor Market Share (Base Layer)
-- ============================================================================

CREATE MATERIALIZED VIEW cagg_monthly_vendor_share AS
SELECT
    date_trunc('month', award_date) AS bucket_month,
    org_id,
    vendor_id,
    COUNT(*) AS contracts_won,
    SUM(contract_value) AS vendor_value,
    -- Running total for this org in this month (needed for market share calc)
    SUM(SUM(contract_value)) OVER (PARTITION BY org_id, date_trunc('month', award_date)) AS org_monthly_total
FROM aoc_clean
WHERE contract_status = 'awarded'
GROUP BY date_trunc('month', award_date), org_id, vendor_id;

-- Index for fast lookups
CREATE UNIQUE INDEX idx_monthly_vendor_share_unique 
    ON cagg_monthly_vendor_share (org_id, vendor_id, bucket_month DESC);

-- ============================================================================
-- MATERIALIZED VIEW: 12-Month Rolling HHI per Department
-- ============================================================================

CREATE MATERIALIZED VIEW cagg_rolling_hhi_12m AS
WITH monthly_vendor AS (
    SELECT
        date_trunc('month', award_date) AS bucket_month,
        org_id,
        vendor_id,
        COUNT(*) AS contracts_won,
        SUM(contract_value) AS vendor_value
    FROM aoc_clean
    WHERE contract_status = 'awarded'
    GROUP BY date_trunc('month', award_date), org_id, vendor_id
),
rolling_vendor AS (
    SELECT
        m1.bucket_month,
        m1.org_id,
        m2.vendor_id,
        SUM(m2.contracts_won) AS contracts_won_12m,
        SUM(m2.vendor_value) AS vendor_value_12m
    FROM (SELECT DISTINCT bucket_month, org_id FROM monthly_vendor) m1
    JOIN monthly_vendor m2 ON m2.org_id = m1.org_id
        AND m2.bucket_month <= m1.bucket_month
        AND m2.bucket_month > m1.bucket_month - INTERVAL '12 months'
    GROUP BY m1.bucket_month, m1.org_id, m2.vendor_id
),
rolling_org AS (
    SELECT
        bucket_month,
        org_id,
        SUM(vendor_value_12m) AS total_value_12m,
        SUM(contracts_won_12m) AS total_contracts_12m,
        COUNT(DISTINCT vendor_id) AS active_vendors_12m,
        MAX(vendor_value_12m) AS top_vendor_value,
        CASE
            WHEN SUM(vendor_value_12m) > 0
            THEN (SUM(vendor_value_12m * vendor_value_12m) / (SUM(vendor_value_12m) * SUM(vendor_value_12m))) * 10000
            ELSE 0
        END AS hhi_index
    FROM rolling_vendor
    GROUP BY bucket_month, org_id
)
SELECT
    bucket_month,
    org_id,
    total_contracts_12m,
    total_value_12m,
    active_vendors_12m,
    hhi_index,
    top_vendor_value,
    CASE
        WHEN total_value_12m > 0
        THEN (top_vendor_value / total_value_12m) * 100
        ELSE 0
    END AS top_vendor_share_pct
FROM rolling_org;

-- Index on the rolling HHI for fast department scorecard lookups
CREATE UNIQUE INDEX idx_rolling_hhi_org_month ON cagg_rolling_hhi_12m (org_id, bucket_month DESC);

-- ============================================================================
-- MATERIALIZED VIEW: Vendor Win-Rate per Month
-- ============================================================================

CREATE MATERIALIZED VIEW cagg_vendor_winrate_monthly AS
SELECT
    date_trunc('month', award_date) AS bucket_month,
    vendor_id,
    org_id,
    COUNT(*) AS win_count,
    SUM(contract_value) AS total_value_won,
    AVG(contract_value) AS avg_contract_value,
    AVG(bids_received) AS avg_bids_on_won_tenders,
    -- Win rate: this vendor's wins / total contracts in same org+month
    COUNT(*)::NUMERIC / NULLIF(
        SUM(COUNT(*)) OVER (PARTITION BY date_trunc('month', award_date), org_id),
        0
    ) * 100 AS win_rate_pct,
    SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) AS single_bid_wins
FROM aoc_clean
WHERE contract_status = 'awarded'
GROUP BY date_trunc('month', award_date), vendor_id, org_id;

-- Indexes for vendor scorecard queries
CREATE UNIQUE INDEX idx_vendor_winrate_vendor_month ON cagg_vendor_winrate_monthly (vendor_id, org_id, bucket_month DESC);
CREATE INDEX idx_vendor_winrate_org_month ON cagg_vendor_winrate_monthly (org_id, bucket_month DESC);

-- ============================================================================
-- MATERIALIZED VIEW: Department-Level Monthly Summary (including 12m rolling stats)
-- ============================================================================

CREATE MATERIALIZED VIEW cagg_org_monthly_summary AS
WITH monthly_stats AS (
    SELECT
        date_trunc('month', award_date) AS bucket_month,
        org_id,
        COUNT(*) AS contract_count,
        SUM(contract_value) AS total_value,
        AVG(bids_received) AS avg_bids,
        AVG(award_delay_days) AS avg_award_delay,
        SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) AS single_bid_count,
        SUM(CASE WHEN bid_window_days < 7 THEN 1 ELSE 0 END) AS rush_job_count,
        SUM(CASE WHEN award_delay_days > 90 THEN 1 ELSE 0 END) AS extreme_delay_count
    FROM aoc_clean
    WHERE contract_status = 'awarded'
    GROUP BY date_trunc('month', award_date), org_id
),
monthly_vendor AS (
    SELECT
        date_trunc('month', award_date) AS bucket_month,
        org_id,
        vendor_id,
        vendor_name,
        COUNT(*) AS contracts_won,
        SUM(contract_value) AS vendor_value
    FROM aoc_clean
    WHERE contract_status = 'awarded'
    GROUP BY date_trunc('month', award_date), org_id, vendor_id, vendor_name
),
rolling_vendor AS (
    SELECT
        m1.bucket_month,
        m1.org_id,
        m2.vendor_id,
        m2.vendor_name,
        SUM(m2.contracts_won) AS contracts_won_12m,
        SUM(m2.vendor_value) AS vendor_value_12m
    FROM (SELECT DISTINCT bucket_month, org_id FROM monthly_stats) m1
    JOIN monthly_vendor m2 ON m2.org_id = m1.org_id
        AND m2.bucket_month <= m1.bucket_month
        AND m2.bucket_month > m1.bucket_month - INTERVAL '12 months'
    GROUP BY m1.bucket_month, m1.org_id, m2.vendor_id, m2.vendor_name
),
ranked_vendors AS (
    SELECT
        bucket_month,
        org_id,
        vendor_name AS top_vendor_name,
        vendor_value_12m,
        ROW_NUMBER() OVER (PARTITION BY bucket_month, org_id ORDER BY vendor_value_12m DESC, vendor_id) AS rank
    FROM rolling_vendor
),
rolling_org_stats AS (
    SELECT
        m1.bucket_month,
        m1.org_id,
        SUM(m2.contract_count) AS total_contracts_12m,
        SUM(m2.total_value) AS total_value_12m,
        AVG(m2.avg_bids) AS avg_bids_12m,
        SUM(m2.single_bid_count)::NUMERIC / NULLIF(SUM(m2.contract_count), 0) * 100 AS single_bid_rate_12m
    FROM (SELECT DISTINCT bucket_month, org_id FROM monthly_stats) m1
    JOIN monthly_stats m2 ON m2.org_id = m1.org_id
        AND m2.bucket_month <= m1.bucket_month
        AND m2.bucket_month > m1.bucket_month - INTERVAL '12 months'
    GROUP BY m1.bucket_month, m1.org_id
)
SELECT
    ms.bucket_month,
    ms.org_id,
    ms.contract_count,
    ms.total_value,
    ms.avg_bids,
    ms.avg_award_delay,
    ms.single_bid_count,
    ms.rush_job_count,
    ms.extreme_delay_count,
    CASE
        WHEN ms.contract_count > 0 THEN
            (ms.single_bid_count::NUMERIC / ms.contract_count * 40)
            + (ms.rush_job_count::NUMERIC / ms.contract_count * 40)
            + (ms.extreme_delay_count::NUMERIC / ms.contract_count * 20)
        ELSE 0
    END AS iri_score,
    ros.total_contracts_12m,
    ros.total_value_12m,
    ros.avg_bids_12m,
    ros.single_bid_rate_12m,
    rv.top_vendor_name,
    CASE
        WHEN ros.total_value_12m > 0
        THEN (rv.vendor_value_12m / ros.total_value_12m) * 100
        ELSE 0
    END AS top_vendor_share_pct
FROM monthly_stats ms
LEFT JOIN rolling_org_stats ros ON ms.org_id = ros.org_id AND ms.bucket_month = ros.bucket_month
LEFT JOIN ranked_vendors rv ON ms.org_id = rv.org_id AND ms.bucket_month = rv.bucket_month AND rv.rank = 1;

-- Indexes
CREATE UNIQUE INDEX idx_org_monthly_org_month ON cagg_org_monthly_summary (org_id, bucket_month DESC);
CREATE INDEX idx_org_monthly_iri ON cagg_org_monthly_summary (iri_score DESC) WHERE iri_score > 50;

-- ============================================================================
-- END OF MIGRATION 002
-- ============================================================================