/**
 * Bid Window vs. Award Delay Scatterplot — Client Component
 *
 * A stark white canvas with extremely subtle grey quadrants.
 * Normal contracts are muted grey; anomalous contracts pop in Crimson.
 * Interactive tooltips show contract details on hover.
 */

'use client';

import { useMemo, useState } from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ScatterplotPoint } from '@/types/worker-schemas';

interface BidWindowScatterplotProps {
    data: ScatterplotPoint[];
}

interface TooltipPayload {
    contract_id: string;
    tender_id: string;
    org_name: string;
    vendor_name: string;
    contract_value: number;
    bid_window_days: number;
    award_delay_days: number;
    bids_received: number;
    is_anomaly: boolean;
    anomaly_type?: string;
}

// Format currency in Indian numbering
const formatCurrency = (value: number): string => {
    if (value >= 10000000) {
        return `₹${(value / 10000000).toFixed(2)} Cr`;
    } else if (value >= 100000) {
        return `₹${(value / 100000).toFixed(2)} Lakh`;
    }
    return `₹${value.toLocaleString('en-IN')}`;
};

export default function BidWindowScatterplot({
    data,
}: BidWindowScatterplotProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-80">
                <p className="text-ink-muted text-sm">No scatterplot data available</p>
            </div>
        );
    }

    // Anomaly threshold lines: sub-5 day bid windows with near-instant awards
    const anomalyThresholdX = 5;
    const anomalyThresholdY = 10;

    // Custom tooltip
    const CustomTooltip = ({
        active,
        payload,
    }: {
        active?: boolean;
        payload?: { payload: TooltipPayload }[];
    }) => {
        if (!active || !payload || payload.length === 0) return null;

        const item = payload[0].payload;

        return (
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="bg-white border border-border-subtle rounded-lg px-4 py-3 shadow-sm max-w-xs"
            >
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                    <div
                        className={`w-2 h-2 rounded-full ${item.is_anomaly ? 'bg-crimson' : 'bg-ink-muted'
                            }`}
                    />
                    <span className="text-xs font-medium text-ink-secondary">
                        {item.tender_id}
                    </span>
                </div>

                {/* Department & Vendor */}
                <p className="text-xs text-ink-primary font-medium truncate" title={item.org_name}>
                    {item.org_name}
                </p>
                <p className="text-xs text-ink-muted mt-0.5 truncate" title={item.vendor_name}>
                    {item.vendor_name}
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <div>
                        <p className="text-xs text-ink-muted">Bid Window</p>
                        <p
                            className={`text-sm font-semibold numeric ${item.bid_window_days < 5 ? 'text-crimson' : 'text-ink-primary'
                                }`}
                        >
                            {item.bid_window_days}d
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-ink-muted">Award Delay</p>
                        <p
                            className={`text-sm font-semibold numeric ${item.award_delay_days < 10 && item.bid_window_days < 5
                                    ? 'text-crimson'
                                    : 'text-ink-primary'
                                }`}
                        >
                            {item.award_delay_days}d
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-ink-muted">Bids</p>
                        <p
                            className={`text-sm font-semibold numeric ${item.bids_received === 1 ? 'text-crimson' : 'text-ink-primary'
                                }`}
                        >
                            {item.bids_received}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-ink-muted">Value</p>
                        <p className="text-sm font-semibold numeric text-ink-primary">
                            {formatCurrency(item.contract_value)}
                        </p>
                    </div>
                </div>

                {item.is_anomaly && (
                    <div className="mt-2 pt-2 border-t border-crimson/20">
                        <p className="text-xs font-medium text-crimson">
                            {item.anomaly_type === 'rush_job'
                                ? 'Rush job — sub-5 day bid window'
                                : 'Single bid — no competition'}
                        </p>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="w-full">
            <ResponsiveContainer width="100%" height={400}>
                <ScatterChart
                    margin={{ top: 16, right: 16, left: 0, bottom: 24 }}
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {/* Subtle grey quadrant lines — no heavy grid */}
                    <CartesianGrid
                        strokeDasharray="0"
                        stroke="var(--border-subtle)"
                        strokeOpacity={0.3}
                        vertical={false}
                        horizontal={false}
                    />

                    {/* X Axis: Bid Window Days */}
                    <XAxis
                        type="number"
                        dataKey="bid_window_days"
                        name="Bid Window (Days)"
                        label={{
                            value: 'Bid Window (Days)',
                            position: 'insideBottom',
                            offset: -14,
                            fontSize: 11,
                            fill: '#9CA3AF',
                            fontFamily: 'Inter, sans-serif',
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                            fill: '#9CA3AF',
                            fontSize: 11,
                            fontFamily: 'Inter, sans-serif',
                        }}
                        domain={[0, 'auto']}
                    />

                    {/* Y Axis: Award Delay Days */}
                    <YAxis
                        type="number"
                        dataKey="award_delay_days"
                        name="Award Delay (Days)"
                        label={{
                            value: 'Award Delay (Days)',
                            angle: -90,
                            position: 'insideLeft',
                            offset: 10,
                            fontSize: 11,
                            fill: '#9CA3AF',
                            fontFamily: 'Inter, sans-serif',
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                            fill: '#9CA3AF',
                            fontSize: 11,
                            fontFamily: 'Inter, sans-serif',
                        }}
                        domain={[0, 'auto']}
                    />

                    {/* Anomaly threshold lines */}
                    <ReferenceLine
                        x={anomalyThresholdX}
                        stroke="#D90429"
                        strokeOpacity={0.15}
                        strokeDasharray="4 4"
                    />
                    <ReferenceLine
                        y={anomalyThresholdY}
                        stroke="#D90429"
                        strokeOpacity={0.15}
                        strokeDasharray="4 4"
                    />

                    <Tooltip content={<CustomTooltip />} cursor={false} />

                    {/* Scatter points */}
                    <Scatter>
                        {data.map((point, index) => {
                            const isHovered = hoveredIndex === index;
                            const isAnomaly = point.bid_window_days < 5 || point.bids_received === 1;
                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={isAnomaly ? '#D90429' : '#9CA3AF'}
                                    fillOpacity={
                                        isHovered
                                            ? 1
                                            : isAnomaly
                                                ? 0.85
                                                : 0.25
                                    }
                                    style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                                    onMouseEnter={() => setHoveredIndex(index)}
                                    r={
                                        isHovered
                                            ? 8
                                            : isAnomaly
                                                ? 6
                                                : 4
                                    }
                                />
                            );
                        })}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 text-xs text-ink-muted">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-crimson opacity-85" />
                    <span>Anomalous — rapid award with minimal competition</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-ink-muted opacity-25" />
                    <span>Standard procurement process</span>
                </div>
            </div>
        </div>
    );
}