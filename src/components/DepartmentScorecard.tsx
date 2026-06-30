/**
 * Department Self-Audit Scorecard — React Server Component
 * 
 * Displays rolling 12-month HHI and IRI scores for a department.
 * Implements "Contextual Guardrails" design pattern:
 * - Large contract values always have slate-colored subtext explaining context
 * - Example: "₹10 Crores" with "Represents 42% of division's annual budget"
 */

import { getDepartmentScorecard } from '@/lib/actions';
import type { DepartmentScorecardData } from '@/types/worker-schemas';

interface DepartmentScorecardProps {
    orgId: string;
}

export default async function DepartmentScorecard({ orgId }: DepartmentScorecardProps) {
    const data = await getDepartmentScorecard(orgId);

    if (!data) {
        return (
            <div className="panel p-8">
                <p className="text-ink-muted text-sm">Department data not available</p>
            </div>
        );
    }

    // Format currency in Indian numbering system
    const formatCurrency = (value: number): string => {
        if (value >= 10000000) {
            return `₹${(value / 10000000).toFixed(2)} Crores`;
        } else if (value >= 100000) {
            return `₹${(value / 100000).toFixed(2)} Lakhs`;
        }
        return `₹${value.toLocaleString('en-IN')}`;
    };

    // Determine HHI risk level
    const getHHIRiskLevel = (hhi: number): { label: string; color: string } => {
        if (hhi > 2500) {
            return { label: 'Highly Concentrated', color: 'text-crimson' };
        } else if (hhi > 1500) {
            return { label: 'Moderate Concentration', color: 'text-amber-600' };
        }
        return { label: 'Competitive', color: 'text-green-600' };
    };

    // Determine IRI risk level
    const getIRIRiskLevel = (iri: number): { label: string; color: string } => {
        if (iri > 70) {
            return { label: 'Critical Risk', color: 'text-crimson' };
        } else if (iri > 50) {
            return { label: 'High Risk', color: 'text-amber-600' };
        } else if (iri > 30) {
            return { label: 'Moderate Risk', color: 'text-amber-500' };
        }
        return { label: 'Low Risk', color: 'text-green-600' };
    };

    const hhiRisk = getHHIRiskLevel(data.hhi_12m);
    const iriRisk = getIRIRiskLevel(data.iri_12m);

    return (
        <div className="panel p-8 space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-semibold text-ink-primary">{data.org_name}</h2>
                {data.parent_ministry && (
                    <p className="text-sm text-ink-secondary mt-1">{data.parent_ministry}</p>
                )}
                {data.region && (
                    <p className="text-xs text-ink-muted mt-1">{data.region}</p>
                )}
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* HHI Score */}
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <h3 className="text-sm font-medium text-ink-secondary">
                            Herfindahl-Hirschman Index (HHI)
                        </h3>
                        <span className={`text-xs font-medium ${hhiRisk.color}`}>
                            {hhiRisk.label}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-semibold numeric text-ink-primary">
                            {data.hhi_12m.toFixed(0)}
                        </span>
                        <span className="text-sm text-ink-muted">/ 10,000</span>
                    </div>
                    <p className="context-subtext">
                        {data.hhi_12m > 2500
                            ? 'Market is highly concentrated. Oligopoly or single-vendor capture likely.'
                            : data.hhi_12m > 1500
                                ? 'Moderate market concentration. Some vendor dominance detected.'
                                : 'Competitive market with healthy vendor distribution.'}
                    </p>
                </div>

                {/* IRI Score */}
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <h3 className="text-sm font-medium text-ink-secondary">
                            Integrity Risk Index (IRI)
                        </h3>
                        <span className={`text-xs font-medium ${iriRisk.color}`}>
                            {iriRisk.label}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-semibold numeric text-ink-primary">
                            {data.iri_12m.toFixed(1)}
                        </span>
                        <span className="text-sm text-ink-muted">/ 100</span>
                    </div>
                    <p className="context-subtext">
                        {data.iri_12m > 70
                            ? 'Critical integrity risk. Immediate investigation recommended.'
                            : data.iri_12m > 50
                                ? 'High integrity risk. Multiple red flags detected.'
                                : data.iri_12m > 30
                                    ? 'Moderate risk. Some anomalies present.'
                                    : 'Low risk. Procurement patterns appear normal.'}
                    </p>
                </div>
            </div>

            {/* Contract Metrics */}
            <div className="border-t border-border-subtle pt-8">
                <h3 className="text-sm font-medium text-ink-secondary mb-4">
                    Rolling 12-Month Contract Metrics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {/* Total Contracts */}
                    <div className="space-y-1">
                        <p className="text-xs text-ink-muted">Total Contracts</p>
                        <p className="text-2xl font-semibold numeric text-ink-primary">
                            {data.total_contracts_12m.toLocaleString()}
                        </p>
                        <p className="context-subtext">
                            Awarded in past 12 months
                        </p>
                    </div>

                    {/* Total Value */}
                    <div className="space-y-1">
                        <p className="text-xs text-ink-muted">Total Value</p>
                        <p className="text-2xl font-semibold numeric text-ink-primary">
                            {formatCurrency(data.total_value_12m)}
                        </p>
                        {data.budget_utilization_pct && (
                            <p className="context-subtext">
                                Represents {data.budget_utilization_pct.toFixed(1)}% of division's annual budget
                            </p>
                        )}
                    </div>

                    {/* Avg Bids */}
                    <div className="space-y-1">
                        <p className="text-xs text-ink-muted">Avg Bids Received</p>
                        <p className="text-2xl font-semibold numeric text-ink-primary">
                            {data.avg_bids_12m.toFixed(1)}
                        </p>
                        <p className="context-subtext">
                            Per contract
                        </p>
                    </div>

                    {/* Single-Bid Rate */}
                    <div className="space-y-1">
                        <p className="text-xs text-ink-muted">Single-Bid Rate</p>
                        <p className={`text-2xl font-semibold numeric ${data.single_bid_rate_12m > 0.5 ? 'text-crimson' : 'text-ink-primary'
                            }`}>
                            {(data.single_bid_rate_12m * 100).toFixed(1)}%
                        </p>
                        <p className="context-subtext">
                            {data.single_bid_rate_12m > 0.5
                                ? 'High single-bid rate. Market capture suspected.'
                                : 'Acceptable single-bid rate.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Risk Indicators */}
            {(data.is_high_concentration || data.is_single_bid_specialist) && (
                <div className="border-t border-border-subtle pt-8">
                    <h3 className="text-sm font-medium text-ink-secondary mb-4">
                        Risk Indicators
                    </h3>
                    <div className="space-y-3">
                        {data.is_high_concentration && (
                            <div className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full bg-crimson mt-1.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-ink-primary">
                                        High Market Concentration
                                    </p>
                                    <p className="text-xs text-ink-secondary mt-0.5">
                                        HHI exceeds 2,500 threshold. Market dominated by few vendors.
                                    </p>
                                </div>
                            </div>
                        )}
                        {data.is_single_bid_specialist && (
                            <div className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full bg-crimson mt-1.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-ink-primary">
                                        Single-Bid Specialist Detected
                                    </p>
                                    <p className="text-xs text-ink-secondary mt-0.5">
                                        {data.top_vendor_name && (
                                            <>{data.top_vendor_name} wins {data.top_vendor_share_pct?.toFixed(1)}% of contracts with single bids.</>
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}