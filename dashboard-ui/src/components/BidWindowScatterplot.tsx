/**
 * Award Delay vs. Bids Received Anomaly Scatterplot — Client Component
 *
 * A stark white canvas with extremely subtle grey quadrants.
 * Normal contracts are muted grey; anomalous contracts pop in Crimson.
 * Interactive tooltips show contract details on hover.
 *
 * Plots award_delay_days (x) against bids_received (y) — the two dimensions
 * actually available from the precomputed scatterplot data. Anomaly status
 * is trusted from the source data (`is_anomaly`) rather than recomputed here.
 */

'use client';

import { useState } from 'react';
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
    onPointClick?: (point: ScatterplotPoint) => void;
}

interface TooltipPayload {
    tender_id: string;
    tender_title?: string;
    org_name: string;
    vendor_name: string;
    contract_value: number;
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

// Anomaly threshold lines: prolonged delay with minimal competition
const ANOMALY_THRESHOLD_X = 30; // award delay days
const ANOMALY_THRESHOLD_Y = 2.5; // bids received

// Custom tooltip — declared outside the component so it isn't recreated
// (and reset) on every render.
function CustomTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: { payload: TooltipPayload }[];
}) {
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

            {/* Title, department & vendor */}
            {item.tender_title && (
                <p className="text-xs text-ink-primary font-medium truncate" title={item.tender_title}>
                    {item.tender_title}
                </p>
            )}
            <p className="text-xs text-ink-primary truncate" title={item.org_name}>
                {item.org_name}
            </p>
            <p className="text-xs text-ink-muted mt-0.5 truncate" title={item.vendor_name}>
                {item.vendor_name}
            </p>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                <div>
                    <p className="text-xs text-ink-muted">Award Delay</p>
                    <p
                        className={`text-sm font-semibold numeric ${item.award_delay_days > 30 ? 'text-crimson' : 'text-ink-primary'
                            }`}
                    >
                        {item.award_delay_days}d
                    </p>
                </div>
                <div>
                    <p className="text-xs text-ink-muted">Bids Received</p>
                    <p
                        className={`text-sm font-semibold numeric ${item.bids_received <= 2 ? 'text-crimson' : 'text-ink-primary'
                            }`}
                    >
                        {item.bids_received}
                    </p>
                </div>
                <div className="col-span-2">
                    <p className="text-xs text-ink-muted">Value</p>
                    <p className="text-sm font-semibold numeric text-ink-primary">
                        {formatCurrency(item.contract_value)}
                    </p>
                </div>
            </div>

            {item.is_anomaly && (
                <div className="mt-2 pt-2 border-t border-crimson/20">
                    <p className="text-xs font-medium text-crimson">
                        {item.anomaly_type === 'single_bid'
                            ? 'Single bid — no competition'
                            : 'Prolonged award delay with minimal competition'}
                    </p>
                </div>
            )}
        </motion.div>
    );
}

export default function BidWindowScatterplot({
    data,
    onPointClick,
}: BidWindowScatterplotProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-80">
                <p className="text-ink-muted text-sm">No scatterplot data available</p>
            </div>
        );
    }

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

                    {/* X Axis: Award Delay Days */}
                    <XAxis
                        type="number"
                        dataKey="award_delay_days"
                        name="Award Delay (Days)"
                        label={{
                            value: 'Award Delay (Days)',
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
                        domain={[0, 365]}
                    />

                    {/* Y Axis: Bids Received */}
                    <YAxis
                        type="number"
                        dataKey="bids_received"
                        name="Bids Received"
                        label={{
                            value: 'Bids Received',
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
                        domain={[0, 13]}
                        ticks={[1, 2, 3, 4, 5, 6, 8, 10, 12]}
                    />

                    {/* Anomaly threshold lines */}
                    <ReferenceLine
                        x={ANOMALY_THRESHOLD_X}
                        stroke="#D90429"
                        strokeOpacity={0.15}
                        strokeDasharray="4 4"
                    />
                    <ReferenceLine
                        y={ANOMALY_THRESHOLD_Y}
                        stroke="#D90429"
                        strokeOpacity={0.15}
                        strokeDasharray="4 4"
                    />

                    <Tooltip content={<CustomTooltip />} cursor={false} />

                    {/* Scatter points — data MUST be on <Scatter> for Recharts to
                        position points; <Cell> children only style them. */}
                    <Scatter
                        data={data}
                        isAnimationActive={false}
                        onClick={(node: any) => {
                            if (node && node.payload) onPointClick?.(node.payload as ScatterplotPoint);
                        }}
                    >
                        {data.map((point, index) => {
                            const isHovered = hoveredIndex === index;
                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={point.is_anomaly ? '#D90429' : '#9CA3AF'}
                                    fillOpacity={
                                        isHovered
                                            ? 1
                                            : point.is_anomaly
                                                ? 0.85
                                                : 0.25
                                    }
                                    style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                                    onMouseEnter={() => setHoveredIndex(index)}
                                    r={
                                        isHovered
                                            ? 8
                                            : point.is_anomaly
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
                    <span>Anomalous — prolonged delay with minimal competition</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-ink-muted opacity-25" />
                    <span>Standard procurement process</span>
                </div>
            </div>
        </div>
    );
}
