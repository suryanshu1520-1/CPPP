"""
Time-Series Anomaly Detection Activity.

Temporal Activity that detects sudden, unjustified shifts in vendor win-rates
using scikit-learn's IsolationForest with seasonal decomposition.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from temporalio import activity

from workers.models.schemas import (
    AnomalyDetectionParams,
    AnomalyDetectionResult,
    VendorAnomaly,
)
from workers.utils.db import get_vendor_winrate_timeseries
from workers.utils.math_utils import remove_seasonality
from workers.config import settings

logger = logging.getLogger(__name__)


@activity.defn
async def detect_anomalies_activity(params: AnomalyDetectionParams) -> AnomalyDetectionResult:
    """
    Detect anomalous spikes in vendor win-rates using IsolationForest.
    
    This activity:
    1. Fetches vendor win-rate time series from continuous aggregates
    2. Applies seasonal decomposition to handle March Rush spending spikes
    3. Trains IsolationForest on deseasonalized residuals
    4. Identifies anomalous months where win-rate deviates significantly
    5. Returns anomalies with scores and context
    
    Algorithm:
        - STL decomposition separates trend, seasonality, and residuals
        - IsolationForest trained on residuals (removes seasonal noise)
        - contamination=0.01 ensures strict anomaly detection (1% expected)
        - n_estimators=200 provides stable ensemble predictions
        - Anomalies flagged when score < -0.5 (strong outlier)
    
    Hyperparameter Rationale:
        - contamination=0.01: Only 1% of data points are true anomalies
          (strict threshold to minimize false positives)
        - n_estimators=200: High estimator count for prediction stability
          (reduces variance in anomaly scores)
        - max_samples='auto': Automatically determines optimal sample size
        - random_state=42: Deterministic for reproducibility
    
    Args:
        params: Anomaly detection parameters
    
    Returns:
        AnomalyDetectionResult with detected anomalies
    """
    activity.logger.info("Starting time-series anomaly detection")
    
    try:
        # Fetch vendor win-rate time series
        timeseries_data = await get_vendor_winrate_timeseries(
            vendor_ids=[str(vid) for vid in params.vendor_ids] if params.vendor_ids else None
        )
        
        activity.logger.info(f"Fetched {len(timeseries_data)} win-rate records")
        
        if not timeseries_data:
            return AnomalyDetectionResult(
                total_vendors_analyzed=0,
                total_anomalies_detected=0,
                anomalies=[],
                model_contamination=params.contamination,
                model_n_estimators=params.n_estimators,
                analyzed_at=datetime.utcnow()
            )
        
        # Convert to DataFrame for easier manipulation
        df = pd.DataFrame(timeseries_data)
        
        # Group by vendor_id + org_id to analyze each vendor-department pair
        vendor_org_groups = df.groupby(['vendor_id', 'org_id'])
        
        anomalies: List[VendorAnomaly] = []
        total_vendors_analyzed = 0
        
        for (vendor_id, org_id), group in vendor_org_groups:
            if len(group) < 12:  # Need at least 12 months of data
                continue
            
            total_vendors_analyzed += 1
            
            # Sort by time
            group = group.sort_values('bucket_month')
            
            # Extract win-rate time series
            win_rates = group['win_rate_pct'].values
            
            # Apply seasonal decomposition and remove seasonality
            # This handles March Rush and other seasonal patterns
            try:
                deseasonalized = remove_seasonality(win_rates, period=12)
            except Exception as e:
                activity.logger.warning(f"Seasonal decomposition failed for vendor {vendor_id}: {e}")
                deseasonalized = win_rates  # Fallback to raw data
            
            # Prepare features for IsolationForest
            # Features: [win_rate, rolling_3m_avg, yoy_growth]
            features = []
            
            for i in range(len(deseasonalized)):
                # Current win-rate
                current_rate = deseasonalized[i]
                
                # Rolling 3-month average
                if i >= 2:
                    rolling_avg = np.mean(deseasonalized[i-2:i+1])
                else:
                    rolling_avg = current_rate
                
                # Year-over-year growth (if we have 12+ months)
                if i >= 12:
                    yoy_growth = (current_rate - deseasonalized[i-12]) / (deseasonalized[i-12] + 1e-6)
                else:
                    yoy_growth = 0.0
                
                features.append([current_rate, rolling_avg, yoy_growth])
            
            features = np.array(features)
            
            # Train IsolationForest
            # contamination=0.01: Expect 1% anomalies (strict threshold)
            # n_estimators=200: High count for stable predictions
            iso_forest = IsolationForest(
                n_estimators=params.n_estimators,
                contamination=params.contamination,
                max_samples='auto',
                random_state=42,
                n_jobs=-1  # Use all CPU cores
            )
            
            iso_forest.fit(features)
            
            # Predict anomalies
            predictions = iso_forest.predict(features)
            scores = iso_forest.score_samples(features)
            
            # Identify anomalies (prediction = -1 means anomaly)
            for i, (pred, score) in enumerate(zip(predictions, scores)):
                if pred == -1 and score < params.score_threshold:
                    # This is a strong anomaly
                    row = group.iloc[i]
                    
                    # Calculate expected win-rate (rolling average)
                    if i >= 2:
                        expected_rate = np.mean(deseasonalized[i-2:i+1])
                    else:
                        expected_rate = deseasonalized[i]
                    
                    actual_rate = deseasonalized[i]
                    deviation = actual_rate - expected_rate
                    
                    anomaly = VendorAnomaly(
                        vendor_id=vendor_id,
                        vendor_name=row.get('vendor_name', 'Unknown'),
                        org_id=org_id,
                        org_name=row.get('org_name', 'Unknown'),
                        anomaly_date=row['bucket_month'],
                        actual_win_rate=float(actual_rate),
                        expected_win_rate=float(expected_rate),
                        deviation=float(deviation),
                        anomaly_score=float(score),
                        is_anomaly=True,
                        contracts_won=int(row['win_count']),
                        total_contracts=int(row.get('total_contracts', 0)),
                        seasonality_adjusted=True
                    )
                    
                    anomalies.append(anomaly)
                    
                    activity.logger.info(
                        f"Anomaly detected: vendor={anomaly.vendor_name}, "
                        f"org={anomaly.org_name}, date={anomaly.anomaly_date}, "
                        f"actual={actual_rate:.2f}%, expected={expected_rate:.2f}%, "
                        f"score={score:.3f}"
                    )
        
        # Sort anomalies by score (most anomalous first)
        anomalies.sort(key=lambda x: x.anomaly_score)
        
        result = AnomalyDetectionResult(
            total_vendors_analyzed=total_vendors_analyzed,
            total_anomalies_detected=len(anomalies),
            anomalies=anomalies,
            model_contamination=params.contamination,
            model_n_estimators=params.n_estimators,
            analyzed_at=datetime.utcnow()
        )
        
        activity.logger.info(
            f"Anomaly detection complete: {total_vendors_analyzed} vendors analyzed, "
            f"{len(anomalies)} anomalies detected"
        )
        
        return result
        
    except Exception as e:
        activity.logger.error(f"Anomaly detection failed: {str(e)}", exc_info=True)
        raise