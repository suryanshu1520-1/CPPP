"""
RTI Payload Serializer Activity.

Temporal Activity that synthesizes analysis results and serializes
catastrophic anomalies into the agent_rti_payloads PostgreSQL table.
"""

import logging
from datetime import datetime, date
from typing import List, Dict, Any
from uuid import UUID

from temporalio import activity

from workers.models.schemas import (
    SynthesisParams,
    RTIPayload,
    AnalysisResult,
    AnomalySeverity,
    AnomalyType,
    IRIScore,
    CartelCommunity,
    VendorAnomaly,
)
from workers.utils.db import insert_rti_payload, insert_checkpoint, get_org_cpio_address
from workers.config import settings

logger = logging.getLogger(__name__)


def determine_severity(
    iri_score: float = None,
    is_cartel: bool = False,
    is_anomaly: bool = False,
    anomaly_score: float = None
) -> AnomalySeverity:
    """
    Determine anomaly severity based on multiple signals.
    
    Args:
        iri_score: IRI score (0-100)
        is_cartel: Whether cartel was detected
        is_anomaly: Whether time-series anomaly detected
        anomaly_score: IsolationForest anomaly score
    
    Returns:
        AnomalySeverity enum
    """
    # Critical: Multiple high-confidence signals
    if is_cartel and (iri_score and iri_score > 70):
        return AnomalySeverity.CRITICAL
    
    if is_cartel and is_anomaly:
        return AnomalySeverity.CRITICAL
    
    # High: Single strong signal
    if is_cartel:
        return AnomalySeverity.HIGH
    
    if iri_score and iri_score > 70:
        return AnomalySeverity.HIGH
    
    if anomaly_score and anomaly_score < -0.7:
        return AnomalySeverity.HIGH
    
    # Medium: Moderate signals
    if iri_score and iri_score > 50:
        return AnomalySeverity.MEDIUM
    
    if anomaly_score and anomaly_score < -0.5:
        return AnomalySeverity.MEDIUM
    
    # Low: Weak signals
    return AnomalySeverity.LOW


def generate_rti_text(
    contract_id: UUID,
    org_name: str,
    vendor_name: str,
    anomaly_type: AnomalyType,
    severity: AnomalySeverity,
    iri_score: float = None,
    hhi_value: float = None,
    cartel_info: str = None,
    anomaly_info: str = None
) -> str:
    """
    Generate RTI application text for a detected anomaly.
    
    Args:
        contract_id: Contract UUID
        org_name: Organization name
        vendor_name: Vendor name
        anomaly_type: Type of anomaly detected
        severity: Anomaly severity
        iri_score: IRI score (if available)
        hhi_value: HHI value (if available)
        cartel_info: Cartel detection details (if available)
        anomaly_info: Time-series anomaly details (if available)
    
    Returns:
        Formatted RTI application text
    """
    text = f"""RIGHT TO INFORMATION ACT, 2005
APPLICATION FOR INFORMATION

To,
The Central Public Information Officer (CPIO),
{org_name}

Subject: Request for Information under RTI Act, 2005 - Procurement Anomaly Investigation

Respected Sir/Madam,

I, the undersigned, hereby request information under Section 6(1) of the Right to Information Act, 2005, regarding the following procurement anomaly detected by our automated monitoring system:

CONTRACT DETAILS:
- Contract ID: {contract_id}
- Organization: {org_name}
- Vendor: {vendor_name}
- Anomaly Type: {anomaly_type.value}
- Severity Level: {severity.value.upper()}

ANALYSIS FINDINGS:
"""
    
    if iri_score is not None:
        text += f"""
1. INTEGRITY RISK INDEX (IRI): {iri_score:.2f}/100
   - This composite score indicates the probability of procurement irregularities
   - Scores above 50 suggest significant risk factors
   - Scores above 70 indicate critical risk requiring immediate investigation
"""
    
    if hhi_value is not None:
        text += f"""
2. MARKET CONCENTRATION (HHI): {hhi_value:.2f}
   - Herfindahl-Hirschman Index measures market competition
   - HHI > 2500 indicates highly concentrated market (oligopoly risk)
   - HHI > 1500 indicates moderate concentration
"""
    
    if cartel_info:
        text += f"""
3. CARTEL DETECTION:
   {cartel_info}
   - Bipartite graph analysis detected suspicious vendor clustering
   - Louvain community detection identified potential bid-rigging patterns
   - 95% Rule analysis suggests dominant vendor with cover bids
"""
    
    if anomaly_info:
        text += f"""
4. TIME-SERIES ANOMALY:
   {anomaly_info}
   - IsolationForest algorithm detected unusual win-rate spike
   - Seasonal decomposition applied to account for fiscal year patterns
   - Anomaly score indicates statistical significance
"""
    
    text += f"""
INFORMATION REQUESTED:

1. Certified copies of all tender documents, bid evaluations, and award letters for Contract ID: {contract_id}

2. Details of all vendors who submitted bids, including:
   - Vendor names and registration details
   - Bid amounts and technical scores
   - Evaluation committee minutes

3. Justification for vendor selection, including:
   - Technical evaluation criteria and scoring
   - Price comparison analysis
   - Any sole-source or single-bid justification

4. Market analysis reports, if any, conducted before tender issuance

5. Details of any previous contracts awarded to the selected vendor in the last 3 years

6. Communication records (emails, letters, meeting minutes) related to this procurement

APPLICATION DETAILS:
- Application Fee: Rs. 10/- (as per RTI Rules)
- Applicant Category: Citizen
- Purpose: Public interest and transparency in government procurement

I declare that the information sought is not exempted under Section 8 or 9 of the RTI Act, 2005, and that I am a citizen of India.

Please provide the information within 30 days as mandated under Section 7(1) of the RTI Act, 2005.

Thanking you,

Yours faithfully,
[Applicant Name]
[Address]
[Contact Details]

Date: {date.today().isoformat()}

---
Generated by Project Tender Automated Monitoring System
Analysis Timestamp: {datetime.utcnow().isoformat()}Z
"""
    
    return text


@activity.defn
async def serialize_rti_payloads_activity(params: SynthesisParams) -> AnalysisResult:
    """
    Synthesize analysis results and serialize catastrophic anomalies to database.
    
    This activity:
    1. Combines results from IRI, cartel, and anomaly detection
    2. Identifies contracts with multiple high-confidence signals
    3. Generates RTI application text for each catastrophic anomaly
    4. Serializes payloads to agent_rti_payloads table
    5. Creates checkpoints in agent_state_checkpoints table
    
    Synthesis Logic:
        - Contracts flagged by multiple detectors get highest priority
        - Severity determined by combined signal strength
        - Only HIGH and CRITICAL severity anomalies generate RTI payloads
        - Each payload includes full audit trail and analysis context
    
    Args:
        params: Synthesis parameters with all analysis results
    
    Returns:
        AnalysisResult with final summary
    """
    activity.logger.info("Starting RTI payload synthesis")
    
    try:
        # Build lookup maps for efficient cross-referencing
        cartel_contracts: Dict[UUID, CartelCommunity] = {}
        for cartel in params.cartel_result.suspected_cartels:
            # Map each vendor in the cartel to the cartel info
            for vendor_id in cartel.vendor_ids:
                cartel_contracts[vendor_id] = cartel
        
        anomaly_map: Dict[UUID, List[VendorAnomaly]] = {}
        for anomaly in params.anomaly_result.anomalies:
            if anomaly.vendor_id not in anomaly_map:
                anomaly_map[anomaly.vendor_id] = []
            anomaly_map[anomaly.vendor_id].append(anomaly)
        
        # Process IRI results and identify catastrophic anomalies
        rti_payloads: List[RTIPayload] = []
        processed_contracts: set = set()
        
        for iri_score in params.iri_result.riskiest_contracts:
            contract_id = iri_score.contract_id
            
            # Skip if already processed
            if contract_id in processed_contracts:
                continue
            
            # Check for cartel detection
            cartel_info = cartel_contracts.get(iri_score.vendor_id)
            is_cartel = cartel_info is not None
            
            # Check for time-series anomaly
            vendor_anomalies = anomaly_map.get(iri_score.vendor_id, [])
            is_anomaly = len(vendor_anomalies) > 0
            
            # Determine severity
            severity = determine_severity(
                iri_score=iri_score.iri_score,
                is_cartel=is_cartel,
                is_anomaly=is_anomaly,
                anomaly_score=vendor_anomalies[0].anomaly_score if vendor_anomalies else None
            )
            
            # Only process HIGH and CRITICAL severity
            if severity not in [AnomalySeverity.HIGH, AnomalySeverity.CRITICAL]:
                continue
            
            # Determine anomaly type
            if is_cartel and iri_score.iri_score > 70:
                anomaly_type = AnomalyType.CARTEL_DETECTED
            elif iri_score.iri_score > 70:
                anomaly_type = AnomalyType.HIGH_IRI
            elif is_cartel:
                anomaly_type = AnomalyType.CARTEL_DETECTED
            elif is_anomaly:
                anomaly_type = AnomalyType.WIN_RATE_SPIKE
            else:
                anomaly_type = AnomalyType.HIGH_IRI
            
            # Fetch CPIO address
            cpio_address = await get_org_cpio_address(str(iri_score.org_id))
            if not cpio_address:
                cpio_address = f"The Central Public Information Officer, {iri_score.org_name}"
            
            # Generate cartel info text
            cartel_text = None
            if cartel_info:
                cartel_text = (
                    f"Detected cartel community with {len(cartel_info.vendor_ids)} vendors. "
                    f"Dominant vendor: {cartel_info.dominant_vendor_name} "
                    f"({cartel_info.dominant_vendor_share:.1%} market share). "
                    f"Confidence: {cartel_info.confidence_score:.2f}"
                )
            
            # Generate anomaly info text
            anomaly_text = None
            if vendor_anomalies:
                latest_anomaly = vendor_anomalies[0]
                anomaly_text = (
                    f"Win-rate spike detected on {latest_anomaly.anomaly_date.date()}. "
                    f"Actual: {latest_anomaly.actual_win_rate:.2f}%, "
                    f"Expected: {latest_anomaly.expected_win_rate:.2f}%. "
                    f"Anomaly score: {latest_anomaly.anomaly_score:.3f}"
                )
            
            # Generate RTI text
            rti_text = generate_rti_text(
                contract_id=contract_id,
                org_name=iri_score.org_name,
                vendor_name=iri_score.vendor_name,
                anomaly_type=anomaly_type,
                severity=severity,
                iri_score=iri_score.iri_score,
                hhi_value=iri_score.hhi_value,
                cartel_info=cartel_text,
                anomaly_info=anomaly_text
            )
            
            # Create RTI payload
            payload = RTIPayload(
                contract_id=contract_id,
                org_id=iri_score.org_id,
                vendor_id=iri_score.vendor_id,
                rti_text=rti_text,
                cpio_address=cpio_address,
                applicant_name="[Your Name]",
                application_date=date.today(),
                anomaly_type=anomaly_type,
                anomaly_severity=severity,
                hhi_at_generation=iri_score.hhi_value,
                iri_at_generation=iri_score.iri_score,
                workflow_id=params.workflow_id,
                checkpoint_id=None,  # Will be set after checkpoint creation
                status="generated",
                generated_at=datetime.utcnow()
            )
            
            rti_payloads.append(payload)
            processed_contracts.add(contract_id)
            
            activity.logger.info(
                f"Generated RTI payload: contract={contract_id}, "
                f"vendor={iri_score.vendor_name}, severity={severity.value}, "
                f"IRI={iri_score.iri_score:.2f}"
            )
        
        # Insert payloads into database
        inserted_count = 0
        for payload in rti_payloads:
            try:
                # Create checkpoint first
                checkpoint_data = {
                    'workflow_id': params.workflow_id,
                    'agent_name': 'rti_serializer',
                    'checkpoint_type': 'payload',
                    'state': {
                        'contract_id': str(payload.contract_id),
                        'anomaly_type': payload.anomaly_type.value,
                        'severity': payload.anomaly_severity.value,
                        'iri_score': payload.iri_at_generation,
                        'hhi_value': payload.hhi_at_generation,
                        'generated_at': payload.generated_at.isoformat()
                    },
                    'contract_id': payload.contract_id,
                    'org_id': payload.org_id,
                    'vendor_id': payload.vendor_id,
                    'execution_status': 'completed'
                }
                
                checkpoint_id = await insert_checkpoint(checkpoint_data)
                payload.checkpoint_id = checkpoint_id
                
                # Insert RTI payload
                payload_dict = {
                    'contract_id': payload.contract_id,
                    'org_id': payload.org_id,
                    'vendor_id': payload.vendor_id,
                    'rti_text': payload.rti_text,
                    'cpio_address': payload.cpio_address,
                    'applicant_name': payload.applicant_name,
                    'application_date': payload.application_date,
                    'anomaly_type': payload.anomaly_type.value,
                    'anomaly_severity': payload.anomaly_severity.value,
                    'hhi_at_generation': payload.hhi_at_generation,
                    'iri_at_generation': payload.iri_at_generation,
                    'workflow_id': payload.workflow_id,
                    'checkpoint_id': payload.checkpoint_id,
                    'status': payload.status,
                    'generated_at': payload.generated_at
                }
                
                await insert_rti_payload(payload_dict)
                inserted_count += 1
                
            except Exception as e:
                activity.logger.error(f"Failed to insert RTI payload for contract {payload.contract_id}: {e}")
                continue
        
        # Create final result
        result = AnalysisResult(
            workflow_id=params.workflow_id,
            iri_result=params.iri_result,
            cartel_result=params.cartel_result,
            anomaly_result=params.anomaly_result,
            rti_payloads_generated=inserted_count,
            completed_at=datetime.utcnow()
        )
        
        activity.logger.info(
            f"RTI synthesis complete: {len(rti_payloads)} payloads generated, "
            f"{inserted_count} successfully inserted"
        )
        
        return result
        
    except Exception as e:
        activity.logger.error(f"RTI synthesis failed: {str(e)}", exc_info=True)
        raise