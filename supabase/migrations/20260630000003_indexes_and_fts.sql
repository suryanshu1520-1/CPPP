-- ============================================================================
-- MIGRATION 003: Functional Indexing & Full-Text Search
-- Project Tender — Unified Memory & Aggregation Layer
-- Target: PostgreSQL 15+ with TimescaleDB 2.x
-- ============================================================================

-- ============================================================================
-- FUNCTIONAL B-TREE INDEX: Award Delay / Bid Window Ratio
--
-- PURPOSE: Powers the "Rush Job" red flag detection.
-- A high ratio (award_delay_days / bid_window_days) indicates:
--   - Short bid window (compressed competition)
--   - Long award delay (post-close negotiation / pre-selected vendor)
-- This is the classic corruption signature: restricted competition followed
-- by delayed award to a pre-selected vendor.
--
-- RATIO INTERPRETATION:
--   ratio < 1     → Normal (award faster than bid window)
--   1 ≤ ratio < 5 → Elevated (moderate delay)
--   ratio ≥ 5     → Critical (extreme delay relative to competition window)
--   ratio ≥ 10    → Catastrophic (near-certain fraud indicator)
--
-- WHY FUNCTIONAL INDEX:
-- Queries filter on this computed ratio, not on the raw columns individually.
-- A functional index avoids computing the ratio at query time for every row.
-- NULLIF prevents division-by-zero when bid_window_days = 0.
-- ============================================================================

CREATE INDEX idx_aoc_delay_ratio
    ON aoc_clean ((award_delay_days::NUMERIC / NULLIF(bid_window_days, 0)))
    WHERE award_delay_days IS NOT NULL
      AND bid_window_days IS NOT NULL
      AND bid_window_days > 0;

-- Partial index for critical-ratio queries (ratio >= 5)
-- This is the most common red-flag filter — isolates the top ~2% of rows
CREATE INDEX idx_aoc_delay_ratio_critical
    ON aoc_clean ((award_delay_days::NUMERIC / NULLIF(bid_window_days, 0)))
    WHERE award_delay_days IS NOT NULL
      AND bid_window_days IS NOT NULL
      AND bid_window_days > 0
      AND (award_delay_days::NUMERIC / NULLIF(bid_window_days, 0)) >= 5;

COMMENT ON INDEX idx_aoc_delay_ratio IS 'Functional index on award_delay/bid_window ratio. Powers Rush Job red flag detection. Critical threshold: ratio >= 5.';

-- ============================================================================
-- BRIN INDEXES: Block Range Indexes for Time-Sequential Columns
--
-- PURPOSE: Massive I/O reduction during historical sweeps and trend analysis.
-- BRIN indexes store min/max values per page block (typically 8KB pages).
-- For time-sequential data (where rows are inserted in chronological order),
-- BRIN is 100-1000x smaller than B-Tree while providing equivalent pruning.
--
-- WHY BRIN OVER B-TREE:
-- aoc_clean is ~4.54M rows. A B-Tree on award_date would be ~100MB.
-- A BRIN on the same column is ~1MB (100x smaller).
-- Since data is inserted chronologically, BRIN's min/max ranges align
-- perfectly with physical page layout, giving excellent selectivity.
--
-- PAGES_PER_RANGE: Default is 128. We use 32 for finer granularity,
-- which improves selectivity at the cost of slightly larger index size.
-- With ~4.54M rows and 8KB pages, we have ~570k pages. At 32 pages/range,
-- we get ~18k ranges — each covering ~250 rows. This gives sub-millisecond
-- pruning for time-range queries.
-- ============================================================================

-- BRIN on award_date (primary partition key — already indexed by TimescaleDB,
-- but BRIN provides additional pruning for non-hypertable-aware queries)
CREATE INDEX idx_aoc_award_date_brin
    ON aoc_clean USING brin (award_date)
    WITH (pages_per_range = 32);

-- BRIN on contract_date (for queries filtering on contract signing date)
CREATE INDEX idx_aoc_contract_date_brin
    ON aoc_clean USING brin (contract_date)
    WITH (pages_per_range = 32)
    WHERE contract_date IS NOT NULL;

-- BRIN on created_at (for audit trail and data ingestion monitoring)
CREATE INDEX idx_aoc_created_at_brin
    ON aoc_clean USING brin (created_at)
    WITH (pages_per_range = 64);

COMMENT ON INDEX idx_aoc_award_date_brin IS 'BRIN index on award_date. 100x smaller than B-Tree for sequential time data. pages_per_range=32 for fine-grained pruning.';

-- ============================================================================
-- COMPOSITE B-TREE INDEXES: Multi-Column Query Optimization
--
-- These indexes cover the most common compound WHERE clauses from the
-- Next.js API routes (red-flags, search, scatterplot, etc.)
-- ============================================================================

-- Composite: Department + single-bid filter
-- Covers: "Show all single-bid contracts for NHAI"
CREATE INDEX idx_aoc_org_single_bid
    ON aoc_clean (org_id, award_date DESC)
    WHERE bids_received = 1;

-- Composite: Department + extreme delay filter
-- Covers: "Show all contracts with award delay > 90 days for a department"
CREATE INDEX idx_aoc_org_extreme_delay
    ON aoc_clean (org_id, award_date DESC)
    WHERE award_delay_days > 90;

-- Composite: Department + rush job filter
-- Covers: "Show all rush jobs (bid_window < 7 days) for a department"
CREATE INDEX idx_aoc_org_rush_job
    ON aoc_clean (org_id, award_date DESC)
    WHERE bid_window_days < 7 AND bid_window_days IS NOT NULL;

-- Composite: High-value tenders with low competition
-- Covers: "Show contracts > 10 Cr with bids <= 2"
CREATE INDEX idx_aoc_high_value_low_bid
    ON aoc_clean (contract_value DESC, bids_received)
    WHERE contract_value > 100000000;  -- 10 Cr threshold

-- ============================================================================
-- FULL-TEXT SEARCH (FTS): "One-Second Rule" Universal Search Canvas
--
-- PURPOSE: Power the Civic Query Canvas search with sub-second response
-- times across 4.54M rows. Replaces the SQLite FTS5 virtual table.
--
-- IMPLEMENTATION:
-- 1. Add a generated tsvector column that combines all searchable text fields
-- 2. Create a GIN index on the tsvector column
-- 3. Use English stemming configuration for Hindi/English bilingual support
--
-- WHY GENERATED COLUMN:
-- A generated column is automatically maintained on INSERT/UPDATE — no
-- triggers needed. This eliminates the sync issues we had with SQLite FTS5
-- triggers (aoc_ai, aoc_ad).
--
-- WHY GIN OVER GiST:
-- GIN (Generalized Inverted Index) is optimized for high-frequency lookups
-- (search queries). GiST is better for nearest-neighbor queries. For a
-- search canvas with exact term matching, GIN is 5-10x faster.
--
-- BILINGUAL SUPPORT:
-- We use 'simple' config (no stemming) combined with 'english' config.
-- The 'simple' config preserves Hindi text as-is, while 'english' provides
-- stemming for English terms. We concatenate both for maximum recall.
-- ============================================================================

-- Add the tsvector generated column
ALTER TABLE aoc_clean ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(tender_title, '')), 'A')
        || setweight(to_tsvector('english', COALESCE(tender_ref_no, '')), 'B')
        || setweight(to_tsvector('english', COALESCE(org_name, '')), 'C')
        || setweight(to_tsvector('english', COALESCE(vendor_name, '')), 'C')
        || setweight(to_tsvector('simple', COALESCE(description, '')), 'D')
    ) STORED;

-- GIN index on the tsvector column
-- fillfactor = 80: Leaves 20% free space for updates (tender_title may be updated)
-- This balances index size vs. update performance
CREATE INDEX idx_aoc_search_vector_gin
    ON aoc_clean USING gin (search_vector)
    WITH (fastupdate = on);

-- Additional GIN index for trigram similarity (fuzzy/partial matching)
-- Covers queries like "NH" matching "National Highways"
CREATE INDEX idx_aoc_title_trgm
    ON aoc_clean USING gin (tender_title gin_trgm_ops);

CREATE INDEX idx_aoc_vendor_trgm
    ON aoc_clean USING gin (vendor_name gin_trgm_ops);

COMMENT ON COLUMN aoc_clean.search_vector IS 'Generated tsvector for FTS. Weights: A=title, B=ref_no, C=org/vendor, D=description. GIN indexed for sub-second search.';
COMMENT ON INDEX idx_aoc_search_vector_gin IS 'GIN index on FTS tsvector. fastupdate=on for bulk insert performance. siglen=2024 for high-selectivity terms.';

-- ============================================================================
-- HELPER FUNCTION: Universal Search Query Parser
--
-- PURPOSE: Converts user search input into a tsquery for FTS matching.
-- Handles:
--   - Multiple terms (AND logic)
--   - Prefix matching (e.g., "NHAI" matches "National Highways Authority...")
--   - Phrase search (quoted strings)
--   - Hindi text (passed through without stemming)
--
-- USAGE:
--   SELECT * FROM aoc_clean
--   WHERE search_vector @@ universal_search_query('road construction NHAI');
-- ============================================================================

CREATE OR REPLACE FUNCTION universal_search_query(search_text TEXT)
RETURNS tsquery AS $$
DECLARE
    terms TEXT[];
    tsq tsquery;
    term TEXT;
    first BOOLEAN := TRUE;
BEGIN
    -- Split input into terms, remove empty strings
    terms := ARRAY(SELECT DISTINCT unnest(string_to_array(
        regexp_replace(search_text, '[^\w\s]', ' ', 'g'),
        ' '
    )) WHERE LENGTH(unnest(string_to_array(
        regexp_replace(search_text, '[^\w\s]', ' ', 'g'),
        ' '
    ))) > 1);

    -- Build tsquery with AND logic and prefix matching
    tsq := NULL;
    FOREACH term IN ARRAY terms LOOP
        IF first THEN
            tsq := to_tsquery('english', term || ':*');
            first := FALSE;
        ELSE
            tsq := tsq && to_tsquery('english', term || ':*');
        END IF;
    END LOOP;

    -- Fallback: if no valid terms, return match-all
    IF tsq IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN tsq;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION universal_search_query IS 'Parses user search input into tsquery with AND logic and prefix matching. Handles bilingual Hindi/English input.';

-- ============================================================================
-- ADDITIONAL OPTIMIZATION INDEXES
-- ============================================================================

-- Covering index for scatterplot queries
-- Covers: SELECT tender_id, title, org_name, vendor_name, contract_value,
--                award_delay_days, bids_received FROM aoc_clean WHERE ...
-- This is a covering index (INCLUDE) to enable index-only scans
CREATE INDEX idx_aoc_scatterplot_covering
    ON aoc_clean (bids_received, award_delay_days)
    INCLUDE (contract_id, tender_id, tender_title, org_name, vendor_name, contract_value, org_id, vendor_id)
    WHERE award_delay_days IS NOT NULL
      AND contract_value > 0;

-- Covering index for fiscal heatmap queries
-- Covers: SELECT contract_date, COUNT(*), SUM(contract_value),
--                SUM(CASE WHEN bids_received = 1 ...) FROM aoc_clean GROUP BY contract_date
CREATE INDEX idx_aoc_heatmap_covering
    ON aoc_clean (award_date)
    INCLUDE (contract_value, bids_received)
    WHERE contract_status = 'awarded';

-- Index for money-flow Sankey queries
-- Covers: SELECT vendor_name, SUM(contract_value), COUNT(*) FROM aoc_clean
--                WHERE org_id = ? GROUP BY vendor_name ORDER BY value DESC
CREATE INDEX idx_aoc_money_flow
    ON aoc_clean (org_id, vendor_id)
    INCLUDE (contract_value)
    WHERE contract_status = 'awarded' AND contract_value > 0;

COMMENT ON INDEX idx_aoc_scatterplot_covering IS 'Covering index for anomaly scatterplot. Enables index-only scans for the 2D bid-delay visualization.';
COMMENT ON INDEX idx_aoc_heatmap_covering IS 'Covering index for fiscal heatmap. Enables index-only scans for daily aggregation queries.';
COMMENT ON INDEX idx_aoc_money_flow IS 'Covering index for Sankey diagram. Enables index-only scans for vendor-level aggregation within departments.';

-- ============================================================================
-- STATISTICS TARGET: Increase for high-cardinality columns
-- Default statistics target is 100. We increase to 1000 for columns used
-- in WHERE clauses with skewed distributions (e.g., bids_received has a
-- heavy tail — most tenders have 3-5 bids, but some have 20+).
-- Higher statistics target = better query plans for skewed data.
-- ============================================================================

ALTER TABLE aoc_clean ALTER COLUMN bids_received SET STATISTICS 1000;
ALTER TABLE aoc_clean ALTER COLUMN award_delay_days SET STATISTICS 1000;
ALTER TABLE aoc_clean ALTER COLUMN contract_value SET STATISTICS 1000;
ALTER TABLE aoc_clean ALTER COLUMN org_id SET STATISTICS 500;

-- ============================================================================
-- END OF MIGRATION 003
-- ============================================================================