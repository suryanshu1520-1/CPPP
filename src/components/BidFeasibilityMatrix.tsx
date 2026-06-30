/**
 * Bid Feasibility Matrix — React Server Component
 * 
 * Warning component for SME contractors evaluating bid opportunities.
 * Detects high HHI concentration and single-bid specialist patterns,
 * providing clear, non-technical warnings.
 */

import { getBidFeasibility } from '@/lib/actions';
import type { BidFeasibilityData } from '@/types/worker-schemas';

interface BidFeasibilityMatrixProps {
    orgId: string;
}

export default async function BidFeasibilityMatrix({ orgId }: BidFeasibilityMatrixProps) {
    const data = await getBidFeasibility(orgId);

    if (!data) {
        return null;
    }

    const isCritical = data.risk_level === 'critical';
    const isHigh = data.risk_level === 'high';

    // If market is healthy, don't show the warning block
    if (!isCritical && !isHigh) {
        return null;
    }

    return (
        <div className="warning-block">
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-crimson flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 1L15 15H1L8 1Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 6V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="8" cy="11.5" r="0.75" fill="white" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="warning-block-title">
                        {isCritical ? 'High-Risk Market — Bidding Not Recommended' : 'Market Concentration Warning'}
                    </p>
                    <p className="text-sm text-ink-primary mt-2 leading-relaxed">
                        {data.warning_message}
                    </p>

                    {/* Key Metrics */}
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-ink-muted">Market Concentration (HHI)</p>
                            <p className={`text-lg font-semibold numeric mt-0.5 ${data.hhi > 2500 ? 'text-crimson' : 'text-ink-primary'}`}>
                                {data.hhi.toFixed(0)}
                            </p>
                            <p className="text-xs text-ink-secondary mt-0.5">
                                {data.hhi > 2500 ? 'Highly concentrated' : 'Moderate concentration'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-ink-muted">Avg Bids Per Tender</p>
                            <p className={`text-lg font-semibold numeric mt-0.5 ${data.avg_bids_received < 3 ? 'text-crimson' : 'text-ink-primary'}`}>
                                {data.avg_bids_received.toFixed(1)}
                            </p>
                            <p className="text-xs text-ink-secondary mt-0.5">
                                {data.avg_bids_received < 3 ? 'Low competition' : 'Healthy competition'}
                            </p>
                        </div>
                    </div>

                    {/* Single-Bid Specialist Alert */}
                    {data.is_single_bid_specialist && (
                        <div className="mt-4 pt-4 border-t border-crimson/20">
                            <p className="text-sm font-medium text-crimson">
                                ⚠ Single-Bid Specialist Detected
                            </p>
                            <p className="text-xs text-ink-secondary mt-1">
                                This department awards {(data.single_bid_rate * 100).toFixed(0)}% of contracts to a single vendor with no competitive bidding.
                                New entrants face significant barriers to winning contracts here.
                            </p>
                        </div>
                    )}

                    {/* Recommendation */}
                    <div className="mt-4 pt-4 border-t border-crimson/20">
                        <p className="text-sm font-medium text-ink-primary">
                            Recommendation
                        </p>
                        <p className="text-xs text-ink-secondary mt-1">
                            {isCritical
                                ? 'Consider targeting more competitive departments for initial contract wins. Look for departments with HHI below 1,500 and average bids above 3 per tender.'
                                : 'Proceed with caution. Ensure your bid pricing is competitive and consider forming joint ventures with established local vendors.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}