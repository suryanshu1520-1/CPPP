"""
Bipartite Cartel Detection Activity.

Temporal Activity that identifies collusive bidding rings and the "Dango Effect"
(bid rotation) using NetworkX bipartite graph analysis and Louvain community detection.
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Any, Set, Tuple
from uuid import UUID
from collections import defaultdict

import networkx as nx
from networkx.algorithms import bipartite
import community as community_louvain
import numpy as np
from sklearn.mixture import GaussianMixture

from temporalio import activity

from workers.models.schemas import (
    CartelDetectionParams,
    CartelDetectionResult,
    CartelCommunity,
)
from workers.utils.db import get_bipartite_graph_data
from workers.utils.math_utils import detect_bimodal_distribution, calculate_cover_bid_ratio
from workers.config import settings

logger = logging.getLogger(__name__)


@activity.defn
async def detect_cartels_activity(params: CartelDetectionParams) -> CartelDetectionResult:
    """
    Detect collusive bidding rings using bipartite graph analysis.
    
    This activity:
    1. Builds a bipartite graph G = (U, V, E) where U=Departments, V=Vendors
    2. Projects to vendor-vendor weighted graph
    3. Applies Louvain community detection
    4. Identifies "95% Rule" violations using GMM
    5. Returns suspected cartels with confidence scores
    
    Algorithm:
        - Bipartite projection captures vendor co-occurrence patterns
        - Louvain detects insular communities (repeated vendor clusters)
        - GMM identifies bimodal bid distributions (winner vs. cover bids)
        - 95% Rule: One vendor wins ≥95% while others submit 101-105% bids
    
    Args:
        params: Cartel detection parameters
    
    Returns:
        CartelDetectionResult with suspected cartels
    """
    activity.logger.info(f"Starting cartel detection with window={params.window_months} months")
    
    try:
        # Fetch contract data for graph construction
        graph_data = await get_bipartite_graph_data(
            window_months=params.window_months,
            org_ids=[str(org_id) for org_id in params.org_ids] if params.org_ids else None
        )
        
        activity.logger.info(f"Fetched {len(graph_data)} vendor-org relationships")
        
        if not graph_data:
            return CartelDetectionResult(
                analysis_window_months=params.window_months,
                total_communities_detected=0,
                suspected_cartels=[],
                total_vendors_analyzed=0,
                total_orgs_analyzed=0,
                analyzed_at=datetime.utcnow()
            )
        
        # Build bipartite graph
        G_bipartite = nx.Graph()
        
        # Track unique vendors and orgs
        vendor_ids: Set[UUID] = set()
        org_ids: Set[UUID] = set()
        vendor_names: Dict[UUID, str] = {}
        org_names: Dict[UUID, str] = {}
        
        for edge in graph_data:
            org_id = edge['org_id']
            vendor_id = edge['vendor_id']
            org_name = edge['org_name']
            vendor_name = edge['vendor_name']
            contract_count = edge['contract_count']
            total_value = float(edge['total_value'])
            
            # Add nodes with bipartite attribute
            G_bipartite.add_node(f"org_{org_id}", bipartite=0, name=org_name, node_type='org')
            G_bipartite.add_node(f"vendor_{vendor_id}", bipartite=1, name=vendor_name, node_type='vendor')
            
            # Add edge with weight
            G_bipartite.add_edge(
                f"org_{org_id}",
                f"vendor_{vendor_id}",
                weight=total_value,
                contract_count=contract_count
            )
            
            vendor_ids.add(vendor_id)
            org_ids.add(org_id)
            vendor_names[vendor_id] = vendor_name
            org_names[org_id] = org_name
        
        activity.logger.info(f"Built bipartite graph: {G_bipartite.number_of_nodes()} nodes, {G_bipartite.number_of_edges()} edges")
        
        # Project to vendor-vendor graph
        # Two vendors are connected if they both bid on contracts in the same department
        vendor_nodes = [n for n, d in G_bipartite.nodes(data=True) if d['bipartite'] == 1]
        G_vendor = bipartite.weighted_projected_graph(G_bipartite, vendor_nodes)
        
        activity.logger.info(f"Projected to vendor graph: {G_vendor.number_of_nodes()} vendors, {G_vendor.number_of_edges()} edges")
        
        if G_vendor.number_of_nodes() < params.min_community_size:
            return CartelDetectionResult(
                analysis_window_months=params.window_months,
                total_communities_detected=0,
                suspected_cartels=[],
                total_vendors_analyzed=len(vendor_ids),
                total_orgs_analyzed=len(org_ids),
                analyzed_at=datetime.utcnow()
            )
        
        # Apply Louvain community detection
        # Louvain optimizes modularity to find dense communities
        partition = community_louvain.best_partition(G_vendor, random_state=42)
        
        # Group vendors by community
        communities: Dict[int, List[str]] = defaultdict(list)
        for vendor_node, community_id in partition.items():
            communities[community_id].append(vendor_node)
        
        activity.logger.info(f"Detected {len(communities)} communities")
        
        # Analyze each community for cartel indicators
        suspected_cartels: List[CartelCommunity] = []
        
        for community_id, vendor_nodes in communities.items():
            if len(vendor_nodes) < params.min_community_size:
                continue
            
            # Extract vendor IDs from node names
            community_vendor_ids = [UUID(node.replace('vendor_', '')) for node in vendor_nodes]
            community_vendor_names = [vendor_names[vid] for vid in community_vendor_ids]
            
            # Find orgs connected to this community
            community_org_ids: Set[UUID] = set()
            community_org_names: Set[str] = set()
            total_contracts = 0
            total_value = Decimal('0')
            
            for edge in graph_data:
                if edge['vendor_id'] in community_vendor_ids:
                    community_org_ids.add(edge['org_id'])
                    community_org_names.add(edge['org_name'])
                    total_contracts += edge['contract_count']
                    total_value += Decimal(str(edge['total_value']))
            
            # Analyze for 95% Rule violation
            # Check if one vendor dominates within specific orgs
            for org_id in community_org_ids:
                org_edges = [e for e in graph_data if e['org_id'] == org_id and e['vendor_id'] in community_vendor_ids]
                
                if not org_edges:
                    continue
                
                # Calculate vendor shares within this org
                org_total_value = sum(float(e['total_value']) for e in org_edges)
                if org_total_value == 0:
                    continue
                
                vendor_shares = []
                dominant_vendor_id = None
                dominant_vendor_name = None
                dominant_share = 0.0
                
                for edge in org_edges:
                    share = float(edge['total_value']) / org_total_value
                    vendor_shares.append(share)
                    
                    if share > dominant_share:
                        dominant_share = share
                        dominant_vendor_id = edge['vendor_id']
                        dominant_vendor_name = edge['vendor_name']
                
                # Check 95% Rule: dominant vendor wins ≥95%
                if dominant_share >= params.rule_95_threshold:
                    # Check for bimodal distribution (cover bids)
                    bid_values = np.array([float(e['total_value']) for e in org_edges])
                    
                    is_bimodal = detect_bimodal_distribution(bid_values)
                    cover_bid_ratio = calculate_cover_bid_ratio(
                        bid_values.tolist(),
                        float(max(bid_values))
                    )
                    
                    # Calculate confidence score
                    confidence = 0.0
                    if dominant_share >= 0.95:
                        confidence += 0.4
                    if is_bimodal:
                        confidence += 0.3
                    if cover_bid_ratio > 0.5:
                        confidence += 0.3
                    
                    # Only flag if confidence is high
                    if confidence >= 0.7:
                        cartel = CartelCommunity(
                            community_id=community_id,
                            vendor_ids=community_vendor_ids,
                            vendor_names=community_vendor_names,
                            org_ids=list(community_org_ids),
                            org_names=list(community_org_names),
                            total_contracts=total_contracts,
                            total_value=total_value,
                            dominant_vendor_id=dominant_vendor_id,
                            dominant_vendor_name=dominant_vendor_name,
                            dominant_vendor_share=dominant_share,
                            cover_bid_ratio=cover_bid_ratio,
                            is_cartel_suspected=True,
                            confidence_score=confidence
                        )
                        suspected_cartels.append(cartel)
                        
                        activity.logger.info(
                            f"Suspected cartel detected: community={community_id}, "
                            f"dominant_vendor={dominant_vendor_name}, share={dominant_share:.2%}, "
                            f"confidence={confidence:.2f}"
                        )
        
        result = CartelDetectionResult(
            analysis_window_months=params.window_months,
            total_communities_detected=len(communities),
            suspected_cartels=suspected_cartels,
            total_vendors_analyzed=len(vendor_ids),
            total_orgs_analyzed=len(org_ids),
            analyzed_at=datetime.utcnow()
        )
        
        activity.logger.info(
            f"Cartel detection complete: {len(communities)} communities analyzed, "
            f"{len(suspected_cartels)} suspected cartels"
        )
        
        return result
        
    except Exception as e:
        activity.logger.error(f"Cartel detection failed: {str(e)}", exc_info=True)
        raise