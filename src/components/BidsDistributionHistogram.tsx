/**
 * Bids-Received Distribution Histogram — Client Component
 *
 * Shows the structural compression of competition.
 * Removes X and Y axis lines entirely. Uses subtle tick marks
 * and interactive tooltips showing exact numbers on hover.
 * Single-bid bars are highlighted in Crimson.
 */

'use client';

import { useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import type { BidsDistributionData } from '@/types/worker-schemas';

interface BidsDistributionHistogramProps {
    data: BidsDistributionData[];
}

interface TooltipPayload {
    bids_category: string;
    count: number;
    percentage: number;
    is_single_bid: boolean;
}

export default function BidsDistributionHistogram({
    data,
}: BidsDistributionHistogramProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-ink-muted text-sm">No distribution data available</p>
            </div>
        );
    }

    // Sort by bids category
    const sortedData = useMemo(() => {
        const order = ['1 Bid', '2 Bids', '3 Bids', '4 Bids', '5+ Bids'];
        return [...data].sort(
            (a, b) => order.indexOf(a.bids_category) - order.indexOf(b.bids_category)
        );
    }, [data]);

    // Custom tooltip — axis-free, clean, shows exact numbers
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
                className="bg-white border border-border-subtle rounded-lg px-4 py-3 shadow-sm"
            >
                <p className="text-xs font-medium text-ink-secondary">{item.bids_category}</p>
                <p className="text-lg font-semibold numeric text-ink-primary mt-1">
                    {item.count.toLocaleString()}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                    {item.percentage.toFixed(1)}% of all contracts
                </p>
                {item.bids_category === '1 Bid' && (
                    <p className="text-xs text-crimson mt-1">
                        No competitive bidding
                    </p>
                )}
            </motion.div>
        );
    };

    return (
        <div className="w-full">
            <ResponsiveContainer width="100%" height={320}>
                <BarChart
                    data={sortedData}
                    margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {/* No axis lines — only subtle tick marks */}
                    <XAxis
                        dataKey="bids_category"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                            fill: 'var(--text-muted)',
                            fontSize: 12,
                            fontFamily: 'Inter, sans-serif',
                        }}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                            fill: 'var(--text-muted)',
                            fontSize: 12,
                            fontFamily: 'Inter, sans-serif',
                        }}
                        tickFormatter={(value: number) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={false} />

                    {/* Animated bars with staggered entrance */}
                    <Bar
                        dataKey="count"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={64}
                    >
                        {sortedData.map((entry, index) => {
                            const isHovered = hoveredIndex === index;
                            return (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.is_single_bid ? '#D90429' : '#9CA3AF'}
                                    fillOpacity={isHovered ? 1 : entry.is_single_bid ? 0.85 : 0.45}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredIndex(index)}
                                />
                            );
                        })}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 text-xs text-ink-muted">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-crimson opacity-85" />
                    <span>Single-bid contracts — competition absent</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-ink-muted opacity-45" />
                    <span>Multi-bid contracts — competitive</span>
                </div>
            </div>
        </div>
    );
}