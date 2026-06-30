"""
Pydantic models for data validation and serialization.

Defines all data structures used across Temporal activities and workflows.
"""

from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# ============================================================================
# ENUMS
# ============================================================================

class CheckpointType(str, Enum):
    """Agent checkpoint classification."""
    EPISODIC = "episodic"      # Discrete event memories
    PROCEDURAL = "procedural"  # Workflow state snapshots
    PAYLOAD = "payload"        # Serialized outputs


class ExecutionStatus(str, Enum):
    """Execution status for checkpoints and logs."""
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AnomalySeverity(str, Enum):
    """Severity levels for detected anomalies."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnomalyType(str, Enum):
    """Types of procurement anomalies."""
    SINGLE_BID = "single_bid"
    RUSH_JOB = "rush_job"
    EXTREME_DELAY = "extreme_delay"
    CARTEL_DETECTED = "cartel_detected"
    WIN_RATE_SPIKE = "win_rate_spike"
    HIGH_IRI = "high_iri"


# ============================================================================
# DATABASE MODELS (Read-only representations)
# ============================================================================

class ContractRecord(BaseModel):
    """Represents a row from aoc_clean table."""
    model_config = ConfigDict(from_attributes=True)
    
    contract_id: UUID
    tender_id: str
    org_id: UUID
    vendor_id: UUID
    contract_value: Decimal
    award_date: datetime
    contract_date: Optional[datetime] = None
    published_date: Optional[datetime] = None
    closing_date: Optional[datetime] = None
    bids_received: int
    bid_window_days: Optional[int] = None
    award_delay_days: Optional[int] = None
    tender_type: str
    contract_status: str
    tender_title: Optional[str] = None
    tender_ref_no: Optional[str] = None
    description: Optional[str] = None
    org_name: str
    vendor_name: str
    state: Optional[str] = None
    sector: Optional[str] = None
    created_at: datetime


class OrgSummary(BaseModel):
    """Represents a row from org_summary table."""
    model_config = ConfigDict(from_attributes=True)
    
    org_id: UUID
    org_name: str
    parent_ministry: Optional[str] = None
    org_type: str
    region: Optional[str] = None
    total_budget: Optional[Decimal] = None
    cpio_address: Optional[str] = None
    website: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorSummary(BaseModel):
    """Represents a row from vendor_summary table."""
    model_config = ConfigDict(from_attributes=True)
    
    vendor_id: UUID
    vendor_name: str
    registration_type: Optional[str] = None
    incorporated_date: Optional[date] = None
    pan_number: Optional[str] = None
    gst_number: Optional[str] = None
    active_status: bool
    total_contracts_won: int
    total_value_won: Decimal
    avg_bids_per_tender: Optional[Decimal] = None
    single_bid_wins: int
    created_at: datetime
    updated_at: datetime


# ============================================================================
# ANALYSIS INPUT PARAMETERS
# ============================================================================

class IRIAnalysisParams(BaseModel):
    """Parameters for IRI calculation activity."""
    window_months: int = Field(default=12, description="Analysis window in months")
    top_n: int = Field(default=100, description="Number of riskiest contracts to return")
    org_ids: Optional[List[UUID]] = Field(default=None, description="Filter by specific organizations")
    min_contract_value: Optional[Decimal] = Field(default=None, description="Minimum contract value filter")


class CartelDetectionParams(BaseModel):
    """Parameters for cartel detection activity."""
    window_months: int = Field(default=24, description="Detection window in months")
    min_community_size: int = Field(default=5, description="Minimum community size to analyze")
    rule_95_threshold: float = Field(default=0.95, description="95% rule threshold")
    org_ids: Optional[List[UUID]] = Field(default=None, description="Filter by specific organizations")


class AnomalyDetectionParams(BaseModel):
    """Parameters for time-series anomaly detection activity."""
    contamination: float = Field(default=0.01, description="Expected anomaly fraction")
    n_estimators: int = Field(default=200, description="IsolationForest estimators")
    score_threshold: float = Field(default=-0.5, description="Anomaly score threshold")
    vendor_ids: Optional[List[UUID]] = Field(default=None, description="Filter by specific vendors")


class AnalysisParams(BaseModel):
    """Combined parameters for the main workflow."""
    iri_params: IRIAnalysisParams = Field(default_factory=IRIAnalysisParams)
    cartel_params: CartelDetectionParams = Field(default_factory=CartelDetectionParams)
    anomaly_params: AnomalyDetectionParams = Field(default_factory=AnomalyDetectionParams)
    workflow_id: str = Field(description="Temporal workflow execution ID")


# ============================================================================
# ANALYSIS RESULTS
# ============================================================================

class IRIScore(BaseModel):
    """Integrity Risk Index score for a contract."""
    contract_id: UUID
    tender_id: str
    org_id: UUID
    vendor_id: UUID
    org_name: str
    vendor_name: str
    contract_value: Decimal
    award_date: datetime
    
    # Component scores (0.0 to 1.0)
    single_bid_score: float
    bid_window_score: float
    award_delay_score: float
    hhi_score: float
    
    # Final IRI (0.0 to 100.0)
    iri_score: float
    
    # Metadata
    hhi_value: Optional[float] = None
    bids_received: int
    bid_window_days: Optional[int] = None
    award_delay_days: Optional[int] = None


class IRIAnalysisResult(BaseModel):
    """Result from IRI calculation activity."""
    analysis_window_months: int
    total_contracts_analyzed: int
    riskiest_contracts: List[IRIScore]
    average_iri: float
    max_iri: float
    contracts_above_threshold: int
    analyzed_at: datetime


class CartelCommunity(BaseModel):
    """Detected cartel community."""
    community_id: int
    vendor_ids: List[UUID]
    vendor_names: List[str]
    org_ids: List[UUID]
    org_names: List[str]
    total_contracts: int
    total_value: Decimal
    
    # 95% Rule metrics
    dominant_vendor_id: Optional[UUID] = None
    dominant_vendor_name: Optional[str] = None
    dominant_vendor_share: float = 0.0
    cover_bid_ratio: float = 0.0
    
    # Confidence metrics
    is_cartel_suspected: bool
    confidence_score: float
    bic_improvement: Optional[float] = None


class CartelDetectionResult(BaseModel):
    """Result from cartel detection activity."""
    analysis_window_months: int
    total_communities_detected: int
    suspected_cartels: List[CartelCommunity]
    total_vendors_analyzed: int
    total_orgs_analyzed: int
    analyzed_at: datetime


class VendorAnomaly(BaseModel):
    """Detected anomaly in vendor win-rate."""
    vendor_id: UUID
    vendor_name: str
    org_id: UUID
    org_name: str
    
    # Time-series data
    anomaly_date: datetime
    actual_win_rate: float
    expected_win_rate: float
    deviation: float
    
    # Anomaly score
    anomaly_score: float
    is_anomaly: bool
    
    # Context
    contracts_won: int
    total_contracts: int
    seasonality_adjusted: bool


class AnomalyDetectionResult(BaseModel):
    """Result from time-series anomaly detection activity."""
    total_vendors_analyzed: int
    total_anomalies_detected: int
    anomalies: List[VendorAnomaly]
    model_contamination: float
    model_n_estimators: int
    analyzed_at: datetime


# ============================================================================
# SYNTHESIS AND SERIALIZATION
# ============================================================================

class SynthesisParams(BaseModel):
    """Parameters for synthesizing analysis results."""
    workflow_id: str
    iri_result: IRIAnalysisResult
    cartel_result: CartelDetectionResult
    anomaly_result: AnomalyDetectionResult
    severity_threshold: AnomalySeverity = Field(default=AnomalySeverity.HIGH)


class RTIPayload(BaseModel):
    """RTI dossier payload for serialization to database."""
    contract_id: UUID
    org_id: UUID
    vendor_id: Optional[UUID] = None
    
    # RTI content
    rti_text: str
    cpio_address: str
    applicant_name: str = "[Your Name]"
    application_date: date
    
    # Metadata
    anomaly_type: AnomalyType
    anomaly_severity: AnomalySeverity
    hhi_at_generation: Optional[float] = None
    iri_at_generation: Optional[float] = None
    
    # Temporal reference
    workflow_id: str
    checkpoint_id: Optional[UUID] = None
    
    # Status
    status: str = "generated"
    generated_at: datetime


class AnalysisResult(BaseModel):
    """Final result from the procurement analysis workflow."""
    workflow_id: str
    iri_result: IRIAnalysisResult
    cartel_result: CartelDetectionResult
    anomaly_result: AnomalyDetectionResult
    rti_payloads_generated: int
    completed_at: datetime


# ============================================================================
# AGENT MEMORY MODELS
# ============================================================================

class AgentCheckpoint(BaseModel):
    """Agent state checkpoint for persistent memory."""
    checkpoint_id: Optional[UUID] = None
    workflow_id: str
    workflow_run_id: Optional[str] = None
    activity_id: Optional[str] = None
    agent_name: str
    checkpoint_type: CheckpointType
    state: Dict[str, Any]
    contract_id: Optional[UUID] = None
    org_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    execution_status: ExecutionStatus = ExecutionStatus.RUNNING
    error_message: Optional[str] = None
    execution_duration_ms: Optional[int] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AgentExecutionLog(BaseModel):
    """Structured execution log entry."""
    log_id: Optional[UUID] = None
    workflow_id: str
    workflow_run_id: Optional[str] = None
    activity_id: Optional[str] = None
    agent_name: str
    log_level: str = "info"
    message: str
    context: Optional[Dict[str, Any]] = None
    execution_duration_ms: Optional[int] = None
    memory_usage_mb: Optional[float] = None
    contract_id: Optional[UUID] = None
    created_at: Optional[datetime] = None