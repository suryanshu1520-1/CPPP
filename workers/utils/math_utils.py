"""
Mathematical helper functions for fraud detection algorithms.

Contains scaling functions, statistical utilities, and scoring algorithms.
"""

import math
from typing import List, Tuple
import numpy as np


# ============================================================================
# SCALING FUNCTIONS
# ============================================================================

def exponential_decay(value: float, lambda_param: float = 0.1) -> float:
    """
    Apply exponential decay scaling: 1 - exp(-λ × value)
    
    Used for bid window compression scoring. Shorter bid windows
    receive higher scores (closer to 1.0).
    
    Args:
        value: Input value (e.g., bid_window_days)
        lambda_param: Decay rate parameter (default: 0.1)
    
    Returns:
        Scaled value between 0.0 and 1.0
    
    Mathematical rationale:
        - λ = 0.1 means a 10-day window scores ~0.63
        - A 30-day window scores ~0.95 (near maximum)
        - This creates a smooth, monotonically increasing curve
    """
    if value < 0:
        return 0.0
    return 1.0 - math.exp(-lambda_param * value)


def hyperbolic_tangent(value: float, scale: float = 100.0) -> float:
    """
    Apply hyperbolic tangent scaling: tanh(value / scale)
    
    Used for award delay asymmetry scoring. Prevents extreme outliers
    from breaking the index by capping at 1.0.
    
    Args:
        value: Input value (e.g., award_delay_days)
        scale: Scaling factor (default: 100.0)
    
    Returns:
        Scaled value between 0.0 and 1.0
    
    Mathematical rationale:
        - tanh(x) asymptotically approaches 1.0 as x → ∞
        - scale = 100 means a 100-day delay scores ~0.76
        - A 300-day delay scores ~0.99 (near maximum)
        - This prevents extreme delays from dominating the index
    """
    if value < 0:
        return 0.0
    return math.tanh(value / scale)


def normalize_score(value: float, min_val: float, max_val: float) -> float:
    """
    Normalize a value to [0.0, 1.0] range.
    
    Args:
        value: Input value
        min_val: Minimum expected value
        max_val: Maximum expected value
    
    Returns:
        Normalized value between 0.0 and 1.0
    """
    if max_val == min_val:
        return 0.0
    normalized = (value - min_val) / (max_val - min_val)
    return max(0.0, min(1.0, normalized))


# ============================================================================
# IRI COMPONENT SCORING
# ============================================================================

def calculate_single_bid_score(bids_received: int) -> float:
    """
    Calculate single-bidder score component.
    
    Args:
        bids_received: Number of bids received
    
    Returns:
        Score between 0.0 and 1.0
    
    Logic:
        - 1 bid → 1.0 (maximum risk)
        - 2 bids → 0.5 (moderate risk)
        - 3+ bids → 0.0 (low risk)
    """
    if bids_received == 1:
        return 1.0
    elif bids_received == 2:
        return 0.5
    else:
        return 0.0


def calculate_bid_window_score(bid_window_days: int) -> float:
    """
    Calculate bid window compression score using exponential decay.
    
    Args:
        bid_window_days: Number of days in bid window
    
    Returns:
        Score between 0.0 and 1.0
    
    Logic:
        - Shorter windows → higher scores (compressed competition)
        - Uses exponential decay: 1 - exp(-0.1 × days)
        - Inverted so shorter windows score higher
    """
    if bid_window_days is None or bid_window_days < 0:
        return 0.0
    
    # Exponential decay: shorter windows get higher scores
    # 7 days → ~0.50, 14 days → ~0.75, 30 days → ~0.95
    decay_score = exponential_decay(bid_window_days, lambda_param=0.1)
    
    # Invert: shorter windows should score higher
    return 1.0 - decay_score


def calculate_award_delay_score(award_delay_days: int) -> float:
    """
    Calculate award delay asymmetry score using hyperbolic tangent.
    
    Args:
        award_delay_days: Number of days between closing and award
    
    Returns:
        Score between 0.0 and 1.0
    
    Logic:
        - Longer delays → higher scores (asymmetric processing)
        - Uses tanh to cap extreme values
        - scale = 100 means 100-day delay scores ~0.76
    """
    if award_delay_days is None or award_delay_days < 0:
        return 0.0
    
    return hyperbolic_tangent(award_delay_days, scale=100.0)


def calculate_hhi_score(hhi_value: float) -> float:
    """
    Calculate market concentration score from HHI value.
    
    Args:
        hhi_value: Herfindahl-Hirschman Index (0-10,000 scale)
    
    Returns:
        Score between 0.0 and 1.0
    
    Logic:
        - HHI < 1,500 → Competitive (score: 0.0-0.3)
        - 1,500 ≤ HHI < 2,500 → Moderate concentration (score: 0.3-0.7)
        - HHI ≥ 2,500 → High concentration (score: 0.7-1.0)
    """
    if hhi_value is None or hhi_value < 0:
        return 0.0
    
    # Normalize HHI to [0, 1] with thresholds
    if hhi_value < 1500:
        return normalize_score(hhi_value, 0, 1500) * 0.3
    elif hhi_value < 2500:
        return 0.3 + normalize_score(hhi_value, 1500, 2500) * 0.4
    else:
        return 0.7 + normalize_score(min(hhi_value, 10000), 2500, 10000) * 0.3


# ============================================================================
# COMPOSITE IRI CALCULATION
# ============================================================================

def calculate_iri(
    bids_received: int,
    bid_window_days: int,
    award_delay_days: int,
    hhi_value: float,
    weights: Tuple[float, float, float, float] = (0.40, 0.25, 0.15, 0.20)
) -> Tuple[float, dict]:
    """
    Calculate composite Integrity Risk Index (IRI).
    
    Args:
        bids_received: Number of bids received
        bid_window_days: Days in bid window
        award_delay_days: Days between closing and award
        hhi_value: Herfindahl-Hirschman Index
        weights: Component weights (w1, w2, w3, w4)
    
    Returns:
        Tuple of (iri_score, component_scores)
        - iri_score: Final IRI (0.0 to 100.0)
        - component_scores: Dict with individual component scores
    
    Mathematical formula:
        IRI = (w1 × single_bid_score + w2 × bid_window_score +
               w3 × award_delay_score + w4 × hhi_score) × 100
    
    Where:
        - w1 = 0.40 (Single-Bidder weight)
        - w2 = 0.25 (Bid Window Compression weight)
        - w3 = 0.15 (Award Delay Asymmetry weight)
        - w4 = 0.20 (Market Concentration weight)
    """
    w1, w2, w3, w4 = weights
    
    # Calculate component scores
    single_bid_score = calculate_single_bid_score(bids_received)
    bid_window_score = calculate_bid_window_score(bid_window_days)
    award_delay_score = calculate_award_delay_score(award_delay_days)
    hhi_score = calculate_hhi_score(hhi_value)
    
    # Weighted sum
    iri_score = (
        w1 * single_bid_score +
        w2 * bid_window_score +
        w3 * award_delay_score +
        w4 * hhi_score
    ) * 100.0
    
    component_scores = {
        'single_bid_score': single_bid_score,
        'bid_window_score': bid_window_score,
        'award_delay_score': award_delay_score,
        'hhi_score': hhi_score
    }
    
    return iri_score, component_scores


# ============================================================================
# STATISTICAL UTILITIES
# ============================================================================

def calculate_bic_improvement(
    data: np.ndarray,
    n_components_1: int = 1,
    n_components_2: int = 2
) -> float:
    """
    Calculate Bayesian Information Criterion (BIC) improvement for GMM.
    
    Used to determine if a 2-component Gaussian Mixture Model fits
    significantly better than a 1-component model (indicating bimodal
    distribution typical of cartel behavior).
    
    Args:
        data: Input data array
        n_components_1: Number of components for null model
        n_components_2: Number of components for alternative model
    
    Returns:
        BIC improvement (positive = 2-component model is better)
    
    Mathematical rationale:
        - BIC = k × ln(n) - 2 × ln(L)
        - Where k = number of parameters, n = sample size, L = likelihood
        - Improvement > 10 indicates strong evidence for 2-component model
    """
    from sklearn.mixture import GaussianMixture
    
    data = data.reshape(-1, 1)
    
    # Fit 1-component model
    gmm_1 = GaussianMixture(n_components=n_components_1, random_state=42)
    gmm_1.fit(data)
    bic_1 = gmm_1.bic(data)
    
    # Fit 2-component model
    gmm_2 = GaussianMixture(n_components=n_components_2, random_state=42)
    gmm_2.fit(data)
    bic_2 = gmm_2.bic(data)
    
    # BIC improvement (lower BIC is better, so improvement = bic_1 - bic_2)
    return bic_1 - bic_2


def detect_bimodal_distribution(data: np.ndarray, threshold: float = 10.0) -> bool:
    """
    Detect if data follows a bimodal distribution using BIC.
    
    Args:
        data: Input data array
        threshold: BIC improvement threshold (default: 10.0)
    
    Returns:
        True if bimodal distribution detected
    
    Logic:
        - Fit 1-component and 2-component GMMs
        - If BIC improvement > threshold, distribution is bimodal
        - Bimodal distributions indicate winner vs. cover bids
    """
    if len(data) < 10:
        return False
    
    bic_improvement = calculate_bic_improvement(data)
    return bic_improvement > threshold


def calculate_cover_bid_ratio(
    bid_values: List[float],
    winner_value: float,
    tolerance: float = 0.05
) -> float:
    """
    Calculate ratio of cover bids (101-105% of winner's bid).
    
    Args:
        bid_values: List of all bid values
        winner_value: Winning bid value
        tolerance: Tolerance for cover bid detection (default: 5%)
    
    Returns:
        Ratio of cover bids to total non-winning bids
    
    Logic:
        - Cover bids are typically 101-105% of the winner's bid
        - High cover bid ratio indicates bid rotation/cartel
    """
    if len(bid_values) <= 1:
        return 0.0
    
    non_winner_bids = [b for b in bid_values if b != winner_value]
    if not non_winner_bids:
        return 0.0
    
    # Count cover bids (101-105% of winner)
    lower_bound = winner_value * (1.0 + tolerance)
    upper_bound = winner_value * (1.0 + 2 * tolerance)
    
    cover_bids = [b for b in non_winner_bids if lower_bound <= b <= upper_bound]
    
    return len(cover_bids) / len(non_winner_bids)


# ============================================================================
# TIME SERIES UTILITIES
# ============================================================================

def seasonal_decompose(
    time_series: np.ndarray,
    period: int = 12
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Decompose time series into trend, seasonal, and residual components.
    
    Args:
        time_series: Input time series array
        period: Seasonal period (default: 12 for monthly data)
    
    Returns:
        Tuple of (trend, seasonal, residual)
    
    Logic:
        - Uses moving average for trend extraction
        - Seasonal component is average deviation per period
        - Residual = original - trend - seasonal
    """
    from statsmodels.tsa.seasonal import seasonal_decompose
    
    result = seasonal_decompose(time_series, model='additive', period=period)
    
    return result.trend, result.seasonal, result.resid


def remove_seasonality(
    time_series: np.ndarray,
    period: int = 12
) -> np.ndarray:
    """
    Remove seasonal component from time series.
    
    Args:
        time_series: Input time series array
        period: Seasonal period (default: 12 for monthly data)
    
    Returns:
        Deseasonalized time series (trend + residual)
    
    Logic:
        - Decompose into trend, seasonal, residual
        - Return trend + residual (seasonal removed)
        - Used for IsolationForest training on residuals
    """
    trend, seasonal, residual = seasonal_decompose(time_series, period)
    
    # Replace NaN values with 0
    trend = np.nan_to_num(trend, nan=0.0)
    seasonal = np.nan_to_num(seasonal, nan=0.0)
    residual = np.nan_to_num(residual, nan=0.0)
    
    return trend + residual