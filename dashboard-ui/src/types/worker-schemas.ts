/**
 * TypeScript type definitions matching Python Temporal worker output schemas.
 * These types ensure type safety when consuming data from the analytical engine.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum AnomalySeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
}

export enum AnomalyType {
    SINGLE_BID = 'single_bid',
    RUSH_JOB = 'rush_job',
    EXTREME_DELAY = 'extreme_delay',
    CARTEL_DETECTED = 'cartel_detected',
    WIN_RATE_SPIKE = 'win_rate_spike',
    HIGH_IRI = 'high_iri',
}

// ============================================================================
// CORE DATA MODELS
// ============================================================================

export interface ContractRecord {
    contract_id: string;
    tender_id: string;
    org_id: string;
    vendor_id: string;
    contract_value: number;
    award_date: string;
    contract_date?: string;
    published_date?: string;
    closing_date?: string;
    bids_received: number;
    bid_window_days?: number;
    award_delay_days?: number;
    tender_type: string;
    contract_status: string;
    tender_title?: string;
    tender_ref_no?: string;
    description?: string;
    org_name: string;
    vendor_name: string;
    state?: string;
    sector?: string;
    created_at: string;
}

export interface OrgSummary {
    org_id: string;
    org_name: string;
    parent_ministry?: string;
    org_type: string;
    region?: string;
    total_budget?: number;
    cpio_address?: string;
    website?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface VendorSummary {
    vendor_id: string;
    vendor_name: string;
    registration_type?: string;
    incorporated_date?: string;
    pan_number?: string;
    gst_number?: string;
    active_status: boolean;
    total_contracts_won: number;
    total_value_won: number;
    avg_bids_per_tender?: number;
    single_bid_wins: number;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// ANALYSIS RESULTS
// ============================================================================

export interface IRIScore {
    contract_id: string;
    tender_id: string;
    org_id: string;
    vendor_id: string;
    org_name: string;
    vendor_name: string;
    contract_value: number;
    award_date: string;
    single_bid_score: number;
    bid_window_score: number;
    award_delay_score: number;
    hhi_score: number;
    iri_score: number;
    hhi_value?: number;
    bids_received: number;
    bid_window_days?: number;
    award_delay_days?: number;
}

export interface IRIAnalysisResult {
    analysis_window_months: number;
    total_contracts_analyzed: number;
    riskiest_contracts: IRIScore[];
    average_iri: number;
    max_iri: number;
    contracts_above_threshold: number;
    analyzed_at: string;
}

export interface CartelCommunity {
    community_id: number;
    vendor_ids: string[];
    vendor_names: string[];
    org_ids: string[];
    org_names: string[];
    total_contracts: number;
    total_value: number;
    dominant_vendor_id?: string;
    dominant_vendor_name?: string;
    dominant_vendor_share: number;
    cover_bid_ratio: number;
    is_cartel_suspected: boolean;
    confidence_score: number;
    bic_improvement?: number;
}

export interface CartelDetectionResult {
    analysis_window_months: number;
    total_communities_detected: number;
    suspected_cartels: CartelCommunity[];
    total_vendors_analyzed: number;
    total_orgs_analyzed: number;
    analyzed_at: string;
}

export interface VendorAnomaly {
    vendor_id: string;
    vendor_name: string;
    org_id: string;
    org_name: string;
    anomaly_date: string;
    actual_win_rate: number;
    expected_win_rate: number;
    deviation: number;
    anomaly_score: number;
    is_anomaly: boolean;
    contracts_won: number;
    total_contracts: number;
    seasonality_adjusted: boolean;
}

export interface AnomalyDetectionResult {
    total_vendors_analyzed: number;
    total_anomalies_detected: number;
    anomalies: VendorAnomaly[];
    model_contamination: number;
    model_n_estimators: number;
    analyzed_at: string;
}

// ============================================================================
// RTI PAYLOADS
// ============================================================================

export interface RTIPayload {
    payload_id: string;
    contract_id: string;
    org_id: string;
    vendor_id?: string;
    rti_text: string;
    cpio_address: string;
    applicant_name: string;
    application_date: string;
    anomaly_type: AnomalyType;
    anomaly_severity: AnomalySeverity;
    hhi_at_generation?: number;
    iri_at_generation?: number;
    workflow_id: string;
    checkpoint_id?: string;
    status: string;
    generated_at: string;
}

// ============================================================================
// DEPARTMENT SCORECARD DATA
// ============================================================================

export interface DepartmentScorecardData {
    org_id: string;
    org_name: string;
    parent_ministry?: string;
    region?: string;
    total_budget?: number;

    // Rolling 12-month metrics
    hhi_12m: number;
    iri_12m: number;
    total_contracts_12m: number;
    total_value_12m: number;
    avg_bids_12m: number;
    single_bid_rate_12m: number;

    // Risk indicators
    is_high_concentration: boolean; // HHI > 2500
    is_single_bid_specialist: boolean; // single_bid_rate > 50%

    // Contextual data
    budget_utilization_pct?: number;
    top_vendor_name?: string;
    top_vendor_share_pct?: number;
}

// ============================================================================
// BID FEASIBILITY DATA
// ============================================================================

export interface BidFeasibilityData {
    org_id: string;
    org_name: string;
    hhi: number;
    is_high_concentration: boolean;
    is_single_bid_specialist: boolean;
    avg_bids_received: number;
    single_bid_rate: number;
    warning_message: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// VISUALIZATION DATA
// ============================================================================

export interface BidsDistributionData {
    bids_category: string; // "1 Bid", "2 Bids", "3 Bids", "4 Bids", "5+ Bids"
    count: number;
    percentage: number;
    is_single_bid: boolean;
}

export interface ScatterplotPoint {
    contract_id: string;
    tender_id: string;
    org_name: string;
    vendor_name: string;
    contract_value: number;
    bid_window_days: number;
    award_delay_days: number;
    bids_received: number;
    is_anomaly: boolean;
    anomaly_type?: AnomalyType;
}

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
    timestamp: string;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    total: number;
    page: number;
    limit: number;
    timestamp: string;
}