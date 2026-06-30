/**
 * Server Actions for data fetching from PostgreSQL.
 * Implements edge caching strategy with ISR for macro state.
 */

'use server';

import { unstable_cache } from 'next/cache';
import { query, queryOne, queryValue } from './postgres';
import { CACHE_TAGS, CACHE_CONFIG } from './cache-tags';
import type {
    DepartmentScorecardData,
    BidFeasibilityData,
    BidsDistributionData,
    ScatterplotPoint,
    IRIAnalysisResult,
    CartelDetectionResult,
    AnomalyDetectionResult,
    RTIPayload,
} from '@/types/worker-schemas';

// ============================================================================
// LEVEL 1: MACRO STATE (Aggressive Edge Caching - 1 hour ISR)
// ============================================================================

/**
 * Fetch department scorecard data with 1-hour ISR
 */
export const getDepartmentScorecard = unstable_cache(
    async (orgId: string): Promise<DepartmentScorecardData | null> => {
        const result = await queryOne<DepartmentScorecardData>(
            `
      SELECT 
        o.org_id,
        o.org_name,
        o.parent_ministry,
        o.region,
        o.total_budget,
        h.hhi_index as hhi_12m,
        s.iri_score as iri_12m,
        s.total_contracts_12m,
        s.total_value_12m,
        s.avg_bids_12m,
        s.single_bid_rate_12m,
        CASE WHEN h.hhi_index > 2500 THEN true ELSE false END as is_high_concentration,
        CASE WHEN s.single_bid_rate_12m > 0.5 THEN true ELSE false END as is_single_bid_specialist,
        CASE WHEN o.total_budget > 0 
          THEN (s.total_value_12m / o.total_budget * 100) 
          ELSE NULL 
        END as budget_utilization_pct,
        s.top_vendor_name,
        s.top_vendor_share_pct
      FROM org_summary o
      LEFT JOIN cagg_rolling_hhi_12m h ON o.org_id = h.org_id
      LEFT JOIN cagg_org_monthly_summary s ON o.org_id = s.org_id
      WHERE o.org_id = $1
      ORDER BY h.bucket_month DESC, s.bucket_month DESC
      LIMIT 1
      `,
            [orgId]
        );

        return result;
    },
    [CACHE_TAGS.DEPARTMENT_DETAIL],
    {
        revalidate: CACHE_CONFIG.MACRO.revalidate,
        tags: [CACHE_TAGS.DEPARTMENT_DETAIL, CACHE_TAGS.HHI_ROLLING],
    }
);

/**
 * Fetch all departments with 1-hour ISR
 */
export const getAllDepartments = unstable_cache(
    async (): Promise<DepartmentScorecardData[]> => {
        const results = await query<DepartmentScorecardData>(
            `
      SELECT 
        o.org_id,
        o.org_name,
        o.parent_ministry,
        o.region,
        o.total_budget,
        h.hhi_index as hhi_12m,
        s.iri_score as iri_12m,
        s.total_contracts_12m,
        s.total_value_12m,
        s.avg_bids_12m,
        s.single_bid_rate_12m,
        CASE WHEN h.hhi_index > 2500 THEN true ELSE false END as is_high_concentration,
        CASE WHEN s.single_bid_rate_12m > 0.5 THEN true ELSE false END as is_single_bid_specialist,
        CASE WHEN o.total_budget > 0 
          THEN (s.total_value_12m / o.total_budget * 100) 
          ELSE NULL 
        END as budget_utilization_pct,
        s.top_vendor_name,
        s.top_vendor_share_pct
      FROM org_summary o
      LEFT JOIN cagg_rolling_hhi_12m h ON o.org_id = h.org_id
      LEFT JOIN cagg_org_monthly_summary s ON o.org_id = s.org_id
      WHERE o.is_active = true
      ORDER BY s.total_value_12m DESC NULLS LAST
      `
        );

        return results;
    },
    [CACHE_TAGS.DEPARTMENTS],
    {
        revalidate: CACHE_CONFIG.MACRO.revalidate,
        tags: [CACHE_TAGS.DEPARTMENTS, CACHE_TAGS.HHI_ROLLING],
    }
);

/**
 * Fetch bid feasibility data for SMEs with 1-hour ISR
 */
export const getBidFeasibility = unstable_cache(
    async (orgId: string): Promise<BidFeasibilityData | null> => {
        const result = await queryOne<BidFeasibilityData>(
            `
      SELECT 
        o.org_id,
        o.org_name,
        h.hhi_index as hhi,
        CASE WHEN h.hhi_index > 2500 THEN true ELSE false END as is_high_concentration,
        CASE WHEN s.single_bid_rate_12m > 0.5 THEN true ELSE false END as is_single_bid_specialist,
        s.avg_bids_12m as avg_bids_received,
        s.single_bid_rate_12m as single_bid_rate,
        CASE 
          WHEN h.hhi_index > 2500 AND s.single_bid_rate_12m > 0.5 
            THEN 'Historical data indicates highly concentrated vendor capture in this node. Bidding overhead risk is high.'
          WHEN h.hhi_index > 2500 
            THEN 'Market concentration is high. Competitive bidding may be challenging.'
          WHEN s.single_bid_rate_12m > 0.5 
            THEN 'Single-bid specialist detected. Market may be captured.'
          ELSE 'Market appears competitive. Standard bidding process recommended.'
        END as warning_message,
        CASE 
          WHEN h.hhi_index > 2500 AND s.single_bid_rate_12m > 0.5 THEN 'critical'
          WHEN h.hhi_index > 2500 THEN 'high'
          WHEN s.single_bid_rate_12m > 0.5 THEN 'high'
          WHEN h.hhi_index > 1500 THEN 'medium'
          ELSE 'low'
        END as risk_level
      FROM org_summary o
      LEFT JOIN cagg_rolling_hhi_12m h ON o.org_id = h.org_id
      LEFT JOIN cagg_org_monthly_summary s ON o.org_id = s.org_id
      WHERE o.org_id = $1
      ORDER BY h.bucket_month DESC, s.bucket_month DESC
      LIMIT 1
      `,
            [orgId]
        );

        return result;
    },
    [CACHE_TAGS.DEPARTMENT_DETAIL],
    {
        revalidate: CACHE_CONFIG.MACRO.revalidate,
        tags: [CACHE_TAGS.DEPARTMENT_DETAIL, CACHE_TAGS.HHI_ROLLING],
    }
);

// ============================================================================
// LEVEL 2: VISUALIZATION DATA (1-hour ISR)
// ============================================================================

/**
 * Fetch bids distribution data for histogram with 1-hour ISR
 */
export const getBidsDistribution = unstable_cache(
    async (orgId?: string): Promise<BidsDistributionData[]> => {
        const whereClause = orgId ? 'WHERE org_id = $1' : '';
        const params = orgId ? [orgId] : [];

        const results = await query<BidsDistributionData>(
            `
      SELECT 
        CASE 
          WHEN bids_received = 1 THEN '1 Bid'
          WHEN bids_received = 2 THEN '2 Bids'
          WHEN bids_received = 3 THEN '3 Bids'
          WHEN bids_received = 4 THEN '4 Bids'
          ELSE '5+ Bids'
        END as bids_category,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage,
        CASE WHEN bids_received = 1 THEN true ELSE false END as is_single_bid
      FROM aoc_clean
      ${whereClause}
      GROUP BY bids_received
      ORDER BY bids_received
      `,
            params
        );

        return results;
    },
    [CACHE_TAGS.MACRO_STATS],
    {
        revalidate: CACHE_CONFIG.MACRO.revalidate,
        tags: [CACHE_TAGS.MACRO_STATS],
    }
);

/**
 * Fetch scatterplot data for bid window vs award delay with 1-hour ISR
 */
export const getScatterplotData = unstable_cache(
    async (orgId?: string): Promise<ScatterplotPoint[]> => {
        const whereClause = orgId
            ? 'WHERE org_id = $1 AND bid_window_days IS NOT NULL AND award_delay_days IS NOT NULL'
            : 'WHERE bid_window_days IS NOT NULL AND award_delay_days IS NOT NULL';
        const params = orgId ? [orgId] : [];

        const results = await query<ScatterplotPoint>(
            `
      SELECT 
        contract_id,
        tender_id,
        org_name,
        vendor_name,
        contract_value,
        bid_window_days,
        award_delay_days,
        bids_received,
        CASE 
          WHEN bid_window_days < 5 AND award_delay_days < 10 THEN true
          WHEN bids_received = 1 AND award_delay_days > 90 THEN true
          ELSE false
        END as is_anomaly,
        CASE 
          WHEN bid_window_days < 5 AND award_delay_days < 10 THEN 'rush_job'
          WHEN bids_received = 1 AND award_delay_days > 90 THEN 'single_bid'
          ELSE NULL
        END as anomaly_type
      FROM aoc_clean
      ${whereClause}
      ORDER BY award_date DESC
      LIMIT 500
      `,
            params
        );

        return results;
    },
    [CACHE_TAGS.MACRO_STATS],
    {
        revalidate: CACHE_CONFIG.MACRO.revalidate,
        tags: [CACHE_TAGS.MACRO_STATS],
    }
);

// ============================================================================
// LEVEL 3: ANALYSIS RESULTS (1-hour ISR)
// ============================================================================

/**
 * Fetch IRI analysis results with 1-hour ISR
 */
export const getIRIAnalysis = unstable_cache(
    async (orgId?: string): Promise<IRIAnalysisResult | null> => {
        const whereClause = orgId ? 'WHERE org_id = $1' : '';
        const params = orgId ? [orgId] : [];

        const result = await queryOne<IRIAnalysisResult>(
            `
      SELECT 
        12 as analysis_window_months,
        COUNT(*) as total_contracts_analyzed,
        json_agg(
          json_build_object(
            'contract_id', contract_id,
            'tender_id', tender_id,
            'org_id', org_id,
            'vendor_id', vendor_id,
            'org_name', org_name,
            'vendor_name', vendor_name,
            'contract_value', contract_value,
            'award_date', award_date,
            'iri_score', iri_score,
            'bids_received', bids_received
          ) ORDER BY iri_score DESC LIMIT 100
        ) as riskiest_contracts,
        AVG(iri_score) as average_iri,
        MAX(iri_score) as max_iri,
        COUNT(CASE WHEN iri_score > 50 THEN 1 END) as contracts_above_threshold,
        NOW() as analyzed_at
      FROM (
        SELECT 
          c.*,
          (
            CASE WHEN c.bids_received = 1 THEN 40 ELSE 0 END +
            CASE WHEN c.bid_window_days < 7 THEN 25 ELSE 0 END +
            CASE WHEN c.award_delay_days > 90 THEN 15 ELSE 0 END +
            CASE WHEN h.hhi_index > 2500 THEN 20 ELSE 0 END
          ) as iri_score
        FROM aoc_clean c
        LEFT JOIN cagg_rolling_hhi_12m h ON c.org_id = h.org_id
        ${whereClause}
      ) sub
      `,
            params
        );

        return result;
    },
    [CACHE_TAGS.IRI_ANALYSIS],
    {
        revalidate: CACHE_CONFIG.ANALYSIS.revalidate,
        tags: [CACHE_TAGS.IRI_ANALYSIS],
    }
);

/**
 * Fetch cartel detection results with 1-hour ISR
 */
export const getCartelDetection = unstable_cache(
    async (orgId?: string): Promise<CartelDetectionResult | null> => {
        const whereClause = orgId ? 'WHERE org_id = $1' : '';
        const params = orgId ? [orgId] : [];

        const result = await queryOne<CartelDetectionResult>(
            `
      SELECT 
        24 as analysis_window_months,
        COUNT(DISTINCT community_id) as total_communities_detected,
        json_agg(
          json_build_object(
            'community_id', community_id,
            'vendor_ids', vendor_ids,
            'vendor_names', vendor_names,
            'org_ids', org_ids,
            'org_names', org_names,
            'total_contracts', total_contracts,
            'total_value', total_value,
            'dominant_vendor_id', dominant_vendor_id,
            'dominant_vendor_name', dominant_vendor_name,
            'dominant_vendor_share', dominant_vendor_share,
            'cover_bid_ratio', cover_bid_ratio,
            'is_cartel_suspected', is_cartel_suspected,
            'confidence_score', confidence_score
          )
        ) as suspected_cartels,
        COUNT(DISTINCT vendor_id) as total_vendors_analyzed,
        COUNT(DISTINCT org_id) as total_orgs_analyzed,
        NOW() as analyzed_at
      FROM agent_state_checkpoints
      WHERE checkpoint_type = 'payload'
        AND state->>'anomaly_type' = 'cartel_detected'
        ${orgId ? 'AND org_id = $1' : ''}
      `,
            params
        );

        return result;
    },
    [CACHE_TAGS.CARTEL_DETECTION],
    {
        revalidate: CACHE_CONFIG.ANALYSIS.revalidate,
        tags: [CACHE_TAGS.CARTEL_DETECTION],
    }
);

/**
 * Fetch anomaly detection results with 1-hour ISR
 */
export const getAnomalyDetection = unstable_cache(
    async (orgId?: string): Promise<AnomalyDetectionResult | null> => {
        const whereClause = orgId ? 'WHERE org_id = $1' : '';
        const params = orgId ? [orgId] : [];

        const result = await queryOne<AnomalyDetectionResult>(
            `
      SELECT 
        COUNT(DISTINCT vendor_id) as total_vendors_analyzed,
        COUNT(*) as total_anomalies_detected,
        json_agg(
          json_build_object(
            'vendor_id', vendor_id,
            'vendor_name', state->>'vendor_name',
            'org_id', org_id,
            'org_name', state->>'org_name',
            'anomaly_date', state->>'anomaly_date',
            'actual_win_rate', (state->>'actual_win_rate')::float,
            'expected_win_rate', (state->>'expected_win_rate')::float,
            'deviation', (state->>'deviation')::float,
            'anomaly_score', (state->>'anomaly_score')::float,
            'is_anomaly', true,
            'contracts_won', (state->>'contracts_won')::int,
            'total_contracts', (state->>'total_contracts')::int,
            'seasonality_adjusted', true
          )
        ) as anomalies,
        0.01 as model_contamination,
        200 as model_n_estimators,
        NOW() as analyzed_at
      FROM agent_state_checkpoints
      WHERE checkpoint_type = 'payload'
        AND state->>'anomaly_type' = 'win_rate_spike'
        ${orgId ? 'AND org_id = $1' : ''}
      `,
            params
        );

        return result;
    },
    [CACHE_TAGS.ANOMALY_DETECTION],
    {
        revalidate: CACHE_CONFIG.ANALYSIS.revalidate,
        tags: [CACHE_TAGS.ANOMALY_DETECTION],
    }
);

// ============================================================================
// LEVEL 4: DYNAMIC QUERIES (No Caching - Always Fresh)
// ============================================================================

/**
 * Fetch RTI payloads (dynamic - no caching)
 */
export async function getRTIPayloads(
    orgId?: string,
    limit: number = 50
): Promise<RTIPayload[]> {
    const whereClause = orgId ? 'WHERE org_id = $1' : '';
    const params = orgId ? [orgId, limit] : [limit];

    const results = await query<RTIPayload>(
        `
    SELECT 
      payload_id,
      contract_id,
      org_id,
      vendor_id,
      rti_text,
      cpio_address,
      applicant_name,
      application_date,
      anomaly_type,
      anomaly_severity,
      hhi_at_generation,
      iri_at_generation,
      workflow_id,
      checkpoint_id,
      status,
      generated_at
    FROM agent_rti_payloads
    ${whereClause}
    ORDER BY generated_at DESC
    LIMIT $${orgId ? 2 : 1}
    `,
        params
    );

    return results;
}

/**
 * Search contracts with multiple parameters (dynamic - no caching)
 */
export async function searchContracts(params: {
    query?: string;
    orgId?: string;
    vendorId?: string;
    minBids?: number;
    maxValue?: number;
    limit?: number;
}): Promise<any[]> {
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.query) {
        conditions.push(`(tender_title ILIKE $${paramIndex} OR tender_ref_no ILIKE $${paramIndex})`);
        queryParams.push(`%${params.query}%`);
        paramIndex++;
    }

    if (params.orgId) {
        conditions.push(`org_id = $${paramIndex}`);
        queryParams.push(params.orgId);
        paramIndex++;
    }

    if (params.vendorId) {
        conditions.push(`vendor_id = $${paramIndex}`);
        queryParams.push(params.vendorId);
        paramIndex++;
    }

    if (params.minBids !== undefined) {
        conditions.push(`bids_received >= $${paramIndex}`);
        queryParams.push(params.minBids);
        paramIndex++;
    }

    if (params.maxValue !== undefined) {
        conditions.push(`contract_value <= $${paramIndex}`);
        queryParams.push(params.maxValue);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 100;
    queryParams.push(limit);

    const results = await query(
        `
    SELECT *
    FROM aoc_clean
    ${whereClause}
    ORDER BY award_date DESC
    LIMIT $${paramIndex}
    `,
        queryParams
    );

    return results;
}