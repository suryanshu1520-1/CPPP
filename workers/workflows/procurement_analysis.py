"""
Procurement Analysis Workflow.

Temporal Workflow that orchestrates fraud detection activities:
- IRI calculation
- Cartel detection
- Time-series anomaly detection
- RTI payload serialization

Follows Temporal's deterministic execution constraints:
- No raw network calls in workflow (all I/O in activities)
- No datetime.now() in workflow (use workflow.now())
- No random number generation in workflow (use seeded activities)
"""

import asyncio
import logging
from datetime import timedelta
from typing import List

from temporalio import workflow

from workers.models.schemas import (
    AnalysisParams,
    AnalysisResult,
    IRIAnalysisParams,
    CartelDetectionParams,
    AnomalyDetectionParams,
    SynthesisParams,
    IRIAnalysisResult,
    CartelDetectionResult,
    AnomalyDetectionResult,
)

# Import activity stubs
with workflow.unsafe.imports_passed_through():
    from workers.activities.iri_calculator import calculate_iri_activity
    from workers.activities.cartel_detector import detect_cartels_activity
    from workers.activities.anomaly_detector import detect_anomalies_activity
    from workers.activities.rti_serializer import serialize_rti_payloads_activity

logger = logging.getLogger(__name__)


@workflow.defn
class ProcurementAnalysisWorkflow:
    """
    Main Temporal workflow for procurement fraud analysis.
    
    This workflow:
    1. Executes IRI, cartel, and anomaly detection in parallel
    2. Synthesizes results from all detectors
    3. Serializes catastrophic anomalies to database
    
    Deterministic Constraints:
        - All I/O operations are in activities (not workflow)
        - Uses workflow.now() instead of datetime.now()
        - No external network calls
        - All randomness is in activities with seeded RNG
    
    Retry Policy:
        - Activities have automatic retry with exponential backoff
        - Workflow itself is durable and can be resumed after failure
        - Checkpoints are created at each activity completion
    """
    
    @workflow.run
    async def run(self, params: AnalysisParams) -> AnalysisResult:
        """
        Execute the procurement analysis workflow.
        
        Args:
            params: Analysis parameters including workflow_id
        
        Returns:
            AnalysisResult with synthesis summary
        """
        workflow.logger.info(f"Starting ProcurementAnalysisWorkflow: {params.workflow_id}")
        
        # Record workflow start time (deterministic)
        start_time = workflow.now()
        
        # ====================================================================
        # PHASE 1: Execute all detectors in parallel
        # ====================================================================
        workflow.logger.info("Phase 1: Executing detectors in parallel")
        
        # Execute IRI, cartel, and anomaly detection concurrently
        # asyncio.gather runs all activities in parallel
        # Each activity has its own timeout and retry policy
        iri_result, cartel_result, anomaly_result = await asyncio.gather(
            # IRI Calculation
            # Timeout: 10 minutes (large dataset processing)
            # Retry: Up to 3 times with exponential backoff
            workflow.execute_activity(
                calculate_iri_activity,
                params.iri_params,
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=workflow.RetryPolicy(
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0,
                    maximum_interval=timedelta(minutes=1),
                    maximum_attempts=3
                )
            ),
            
            # Cartel Detection
            # Timeout: 15 minutes (graph analysis is compute-intensive)
            # Retry: Up to 3 times
            workflow.execute_activity(
                detect_cartels_activity,
                params.cartel_params,
                start_to_close_timeout=timedelta(minutes=15),
                retry_policy=workflow.RetryPolicy(
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0,
                    maximum_interval=timedelta(minutes=1),
                    maximum_attempts=3
                )
            ),
            
            # Anomaly Detection
            # Timeout: 10 minutes (IsolationForest training)
            # Retry: Up to 3 times
            workflow.execute_activity(
                detect_anomalies_activity,
                params.anomaly_params,
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=workflow.RetryPolicy(
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0,
                    maximum_interval=timedelta(minutes=1),
                    maximum_attempts=3
                )
            ),
            return_exceptions=False  # Raise exception if any activity fails
        )
        
        workflow.logger.info(
            f"Phase 1 complete: IRI={len(iri_result.riskiest_contracts)} contracts, "
            f"Cartels={len(cartel_result.suspected_cartels)}, "
            f"Anomalies={len(anomaly_result.anomalies)}"
        )
        
        # ====================================================================
        # PHASE 2: Synthesize results and serialize RTI payloads
        # ====================================================================
        workflow.logger.info("Phase 2: Synthesizing results and serializing RTI payloads")
        
        # Create synthesis parameters
        synthesis_params = SynthesisParams(
            workflow_id=params.workflow_id,
            iri_result=iri_result,
            cartel_result=cartel_result,
            anomaly_result=anomaly_result,
            severity_threshold="HIGH"  # Only process HIGH and CRITICAL
        )
        
        # Execute RTI serialization
        # Timeout: 5 minutes (database writes)
        # Retry: Up to 3 times
        final_result = await workflow.execute_activity(
            serialize_rti_payloads_activity,
            synthesis_params,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=workflow.RetryPolicy(
                initial_interval=timedelta(seconds=10),
                backoff_coefficient=2.0,
                maximum_interval=timedelta(minutes=1),
                maximum_attempts=3
            )
        )
        
        # ====================================================================
        # PHASE 3: Final logging and return
        # ====================================================================
        end_time = workflow.now()
        duration = (end_time - start_time).total_seconds()
        
        workflow.logger.info(
            f"ProcurementAnalysisWorkflow complete: "
            f"duration={duration:.2f}s, "
            f"rti_payloads={final_result.rti_payloads_generated}"
        )
        
        return final_result


# ============================================================================
# WORKFLOW HELPER FUNCTIONS
# ============================================================================

async def run_analysis_workflow(
    workflow_id: str,
    iri_window_months: int = 12,
    cartel_window_months: int = 24,
    org_ids: List[str] = None
) -> AnalysisResult:
    """
    Helper function to start the procurement analysis workflow.
    
    This is a convenience function for starting the workflow from
    external code (e.g., API endpoints, scheduled jobs).
    
    Args:
        workflow_id: Unique workflow execution ID
        iri_window_months: IRI analysis window in months
        cartel_window_months: Cartel detection window in months
        org_ids: Optional list of organization IDs to filter
    
    Returns:
        AnalysisResult with synthesis summary
    
    Example:
        result = await run_analysis_workflow(
            workflow_id="analysis-2024-01-15",
            iri_window_months=12,
            cartel_window_months=24
        )
    """
    from temporalio.client import Client
    
    # Connect to Temporal server
    client = await Client.connect("localhost:7233")
    
    # Create analysis parameters
    params = AnalysisParams(
        iri_params=IRIAnalysisParams(
            window_months=iri_window_months,
            top_n=100,
            org_ids=org_ids
        ),
        cartel_params=CartelDetectionParams(
            window_months=cartel_window_months,
            min_community_size=5,
            rule_95_threshold=0.95,
            org_ids=org_ids
        ),
        anomaly_params=AnomalyDetectionParams(
            contamination=0.01,
            n_estimators=200,
            score_threshold=-0.5,
            vendor_ids=None
        ),
        workflow_id=workflow_id
    )
    
    # Start workflow execution
    handle = await client.start_workflow(
        ProcurementAnalysisWorkflow.run,
        params,
        id=workflow_id,
        task_queue="procurement-analysis"
    )
    
    # Wait for workflow completion
    result = await handle.result()
    
    return result


# ============================================================================
# SCHEDULED WORKFLOW TRIGGER
# ============================================================================

async def trigger_daily_analysis():
    """
    Trigger daily procurement analysis workflow.
    
    This function can be called by a scheduler (e.g., cron, Temporal Schedule)
    to run daily fraud detection analysis.
    
    Example:
        # Run every day at 2 AM
        await trigger_daily_analysis()
    """
    from datetime import datetime
    
    # Generate workflow ID with date
    workflow_id = f"daily-analysis-{datetime.utcnow().strftime('%Y-%m-%d')}"
    
    # Run analysis with default parameters
    result = await run_analysis_workflow(
        workflow_id=workflow_id,
        iri_window_months=12,
        cartel_window_months=24
    )
    
    return result