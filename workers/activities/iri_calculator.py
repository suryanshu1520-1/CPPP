"""
Integrity Risk Index (IRI) Calculator Activity.

Temporal Activity that calculates composite fraud risk scores for procurement contracts.
Uses weighted scoring with exponential decay and hyperbolic tangent scaling.
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
from uuid import UUID

from temporalio import activity

from workers.models.schemas import (
    IRIAnalysisParams,
    IRIAnalysisResult,
    IRIScore,
)
from workers.utils.db import get_contracts_for_analysis
from workers.utils.math_utils import calculate_iri
from workers.config import settings

logger = logging.getLogger(__name__)


@activity.defn
async def calculate_iri_activity(params: IRIAnalysisParams) -> IRIAnalysisResult:
    """
    Calculate Integrity Risk Index for procurement contracts.
    
    This activity:
    1. Fetches contracts from the analysis window
    2. Calculates IRI scores using weighted components
    3. Returns the riskiest contracts sorted by IRI
    
    Mathematical Formula:
        IRI = (w1 × single_bid_score + w2 × bid_window_score +
               w3 × award_delay_score + w4 × hhi_score) × 100
    
    Where:
        - w1 = 0.40 (Single-Bidder weight)
        - w2 = 0.25 (Bid Window Compression weight)
        - w3 = 0.15 (Award Delay Asymmetry weight)
        - w4 = 0.20 (Market Concentration weight)
    
    Scaling Functions:
        - bid_window_score: 1 - exp(-λ × days), λ=0.1
        - award_delay_score: tanh(days / 100)
    
    Args:
        params: IRI analysis parameters
    
    Returns:
        IRIAnalysisResult with riskiest contracts
    """
    activity.logger.info(f"Starting IRI calculation with window={params.window_months} months")
    
    try:
        # Fetch contracts from database
        contracts = await get_contracts_for_analysis(
            window_months=params.window_months,
            org_ids=[str(org_id) for org_id in params.org_ids] if params.org_ids else None,
            min_contract_value=float(params.min_contract_value) if params.min_contract_value else None
        )
        
        activity.logger.info(f"Fetched {len(contracts)} contracts for analysis")
        
        if not contracts:
            return IRIAnalysisResult(
                analysis_window_months=params.window_months,
                total_contracts_analyzed=0,
                riskiest_contracts=[],
                average_iri=0.0,
                max_iri=0.0,
                contracts_above_threshold=0,
                analyzed_at=datetime.utcnow()
            )
        
        # Calculate IRI for each contract
        iri_scores: List[IRIScore] = []
        
        for contract in contracts:
            # Extract contract data
            bids_received = contract['bids_received']
            bid_window_days = contract.get('bid_window_days')
            award_delay_days = contract.get('award_delay_days')
            hhi_value = contract.get('hhi_index')
            
            # Calculate IRI score
            iri_score, component_scores = calculate_iri(
                bids_received=bids_received,
                bid_window_days=bid_window_days if bid_window_days is not None else 0,
                award_delay_days=award_delay_days if award_delay_days is not None else 0,
                hhi_value=float(hhi_value) if hhi_value is not None else 0.0
            )
            
            # Create IRIScore object
            iri_score_obj = IRIScore(
                contract_id=contract['contract_id'],
                tender_id=contract['tender_id'],
                org_id=contract['org_id'],
                vendor_id=contract['vendor_id'],
                org_name=contract['org_name'],
                vendor_name=contract['vendor_name'],
                contract_value=Decimal(str(contract['contract_value'])),
                award_date=contract['award_date'],
                single_bid_score=component_scores['single_bid_score'],
                bid_window_score=component_scores['bid_window_score'],
                award_delay_score=component_scores['award_delay_score'],
                hhi_score=component_scores['hhi_score'],
                iri_score=iri_score,
                hhi_value=float(hhi_value) if hhi_value is not None else None,
                bids_received=bids_received,
                bid_window_days=bid_window_days,
                award_delay_days=award_delay_days
            )
            
            iri_scores.append(iri_score_obj)
        
        # Sort by IRI score (descending)
        iri_scores.sort(key=lambda x: x.iri_score, reverse=True)
        
        # Get top N riskiest contracts
        top_n = min(params.top_n, len(iri_scores))
        riskiest_contracts = iri_scores[:top_n]
        
        # Calculate statistics
        all_iri_values = [score.iri_score for score in iri_scores]
        average_iri = sum(all_iri_values) / len(all_iri_values) if all_iri_values else 0.0
        max_iri = max(all_iri_values) if all_iri_values else 0.0
        
        # Count contracts above threshold (IRI > 50 is considered high risk)
        contracts_above_threshold = sum(1 for iri in all_iri_values if iri > 50.0)
        
        result = IRIAnalysisResult(
            analysis_window_months=params.window_months,
            total_contracts_analyzed=len(contracts),
            riskiest_contracts=riskiest_contracts,
            average_iri=average_iri,
            max_iri=max_iri,
            contracts_above_threshold=contracts_above_threshold,
            analyzed_at=datetime.utcnow()
        )
        
        activity.logger.info(
            f"IRI calculation complete: {len(contracts)} contracts analyzed, "
            f"{contracts_above_threshold} above threshold, max IRI={max_iri:.2f}"
        )
        
        return result
        
    except Exception as e:
        activity.logger.error(f"IRI calculation failed: {str(e)}", exc_info=True)
        raise