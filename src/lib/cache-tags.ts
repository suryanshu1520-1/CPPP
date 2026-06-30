/**
 * Next.js revalidation tag definitions for ISR (Incremental Static Regeneration).
 * Implements aggressive edge caching for macro state while keeping dynamic queries fresh.
 */

import { revalidateTag, revalidatePath } from 'next/cache';

// ============================================================================
// CACHE TAG DEFINITIONS
// ============================================================================

/**
 * Level 1: Macro State (aggressive edge caching)
 * Revalidated: Every 1 hour (3600 seconds) or on Temporal worker completion
 */
export const CACHE_TAGS = {
    // Department and organization data
    DEPARTMENTS: 'departments',
    DEPARTMENT_DETAIL: 'department-detail',

    // Vendor profiles and rankings
    VENDORS: 'vendors',
    VENDOR_DETAIL: 'vendor-detail',

    // Macro KPIs and summary statistics
    MACRO_STATS: 'macro-stats',
    KPI_SUMMARY: 'kpi-summary',

    // Continuous aggregate data (TimescaleDB)
    HHI_ROLLING: 'hhi-rolling',
    VENDOR_WINRATES: 'vendor-winrates',
    MONTHLY_SUMMARY: 'monthly-summary',

    // Analysis results from Temporal workers
    IRI_ANALYSIS: 'iri-analysis',
    CARTEL_DETECTION: 'cartel-detection',
    ANOMALY_DETECTION: 'anomaly-detection',

    // RTI payloads
    RTI_PAYLOADS: 'rti-payloads',
} as const;

/**
 * Level 2: Dynamic Queries (no caching)
 * These queries bypass the cache and hit the database directly
 */
export const DYNAMIC_QUERIES = {
    // Multi-parameter search
    SEARCH: 'search',

    // Real-time anomaly feeds
    ANOMALY_FEED: 'anomaly-feed',

    // Department scorecard drill-downs
    SCORECARD_DRILLDOWN: 'scorecard-drilldown',
} as const;

// ============================================================================
// REVALIDATION FUNCTIONS
// ============================================================================

/**
 * Revalidate macro state cache (called after Temporal worker completion)
 */
export function revalidateMacroState(): void {
    revalidateTag(CACHE_TAGS.MACRO_STATS, 'max');
    revalidateTag(CACHE_TAGS.KPI_SUMMARY, 'max');
    revalidateTag(CACHE_TAGS.DEPARTMENTS, 'max');
    revalidateTag(CACHE_TAGS.VENDORS, 'max');
    revalidateTag(CACHE_TAGS.HHI_ROLLING, 'max');
    revalidateTag(CACHE_TAGS.VENDOR_WINRATES, 'max');
    revalidateTag(CACHE_TAGS.MONTHLY_SUMMARY, 'max');
}

/**
 * Revalidate analysis results cache (called after IRI/cartel/anomaly detection)
 */
export function revalidateAnalysisResults(): void {
    revalidateTag(CACHE_TAGS.IRI_ANALYSIS, 'max');
    revalidateTag(CACHE_TAGS.CARTEL_DETECTION, 'max');
    revalidateTag(CACHE_TAGS.ANOMALY_DETECTION, 'max');
    revalidateTag(CACHE_TAGS.RTI_PAYLOADS, 'max');
}

/**
 * Revalidate department-specific cache (called when department data changes)
 */
export function revalidateDepartment(orgId: string): void {
    revalidateTag(`${CACHE_TAGS.DEPARTMENT_DETAIL}-${orgId}`, 'max');
    revalidateTag(CACHE_TAGS.DEPARTMENTS, 'max');
}

/**
 * Revalidate vendor-specific cache (called when vendor data changes)
 */
export function revalidateVendor(vendorId: string): void {
    revalidateTag(`${CACHE_TAGS.VENDOR_DETAIL}-${vendorId}`, 'max');
    revalidateTag(CACHE_TAGS.VENDORS, 'max');
}

/**
 * Revalidate all caches (emergency full refresh)
 */
export function revalidateAll(): void {
    Object.values(CACHE_TAGS).forEach(tag => {
        revalidateTag(tag, 'max');
    });
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * ISR configuration for different data types
 */
export const CACHE_CONFIG = {
    // Macro state: 1 hour ISR
    MACRO: {
        revalidate: 3600, // 1 hour
        tags: [
            CACHE_TAGS.MACRO_STATS,
            CACHE_TAGS.KPI_SUMMARY,
            CACHE_TAGS.DEPARTMENTS,
            CACHE_TAGS.VENDORS,
        ],
    },

    // Continuous aggregates: 1 hour ISR
    AGGREGATES: {
        revalidate: 3600, // 1 hour
        tags: [
            CACHE_TAGS.HHI_ROLLING,
            CACHE_TAGS.VENDOR_WINRATES,
            CACHE_TAGS.MONTHLY_SUMMARY,
        ],
    },

    // Analysis results: 1 hour ISR
    ANALYSIS: {
        revalidate: 3600, // 1 hour
        tags: [
            CACHE_TAGS.IRI_ANALYSIS,
            CACHE_TAGS.CARTEL_DETECTION,
            CACHE_TAGS.ANOMALY_DETECTION,
        ],
    },

    // Dynamic queries: no caching
    DYNAMIC: {
        revalidate: 0, // Always fresh
        tags: [],
    },
} as const;

/**
 * Get cache headers for API routes
 */
export function getCacheHeaders(level: 'macro' | 'aggregates' | 'analysis' | 'dynamic') {
    const config = CACHE_CONFIG[level.toUpperCase() as keyof typeof CACHE_CONFIG];

    if (level === 'dynamic') {
        return {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        };
    }

    return {
        'Cache-Control': `s-maxage=${config.revalidate}, stale-while-revalidate`,
    };
}