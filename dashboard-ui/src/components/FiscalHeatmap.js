"use client";

import React, { useState, useMemo } from 'react';

/**
 * FiscalHeatmap — GitHub-style calendar heatmap showing daily contract award values.
 * Highlights "March Madness" fiscal year-end spending rushes.
 * 
 * Props:
 * - data: Array of { date, day, week, month, year, value, contracts, singleBidRate }
 * - formatValue: function to format currency
 */
export default function FiscalHeatmap({ data, formatValue }) {
    const [hoveredCell, setHoveredCell] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Group data by year, then render each year as a row
    const yearGroups = useMemo(() => {
        const groups = {};
        data.forEach(d => {
            if (!groups[d.year]) groups[d.year] = [];
            groups[d.year].push(d);
        });
        return Object.keys(groups)
            .sort((a, b) => parseInt(b) - parseInt(a))
            .slice(0, 3) // Show last 3 years
            .map(y => ({ year: parseInt(y), days: groups[y] }));
    }, [data]);

    // Calculate max value for color scaling
    const maxValue = useMemo(() => {
        if (!data || data.length === 0) return 1;
        return Math.max(...data.map(d => d.value), 1);
    }, [data]);

    // Color scale: 5 levels from low to high
    const getColor = (value) => {
        if (!value || value === 0) return 'var(--bg-secondary)';
        const ratio = value / maxValue;
        if (ratio > 0.75) return 'var(--color-risk-catastrophic)';
        if (ratio > 0.5) return 'var(--color-risk-high)';
        if (ratio > 0.25) return 'var(--color-risk-medium)';
        if (ratio > 0.1) return 'var(--accent-blue)';
        return 'var(--accent-blue-glow)';
    };

    // Month labels
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabels = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

    if (!data || data.length === 0) {
        return (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>No heatmap data available</span>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', overflowX: 'auto', padding: '4px 0' }}>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>Less</span>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--bg-secondary)' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent-blue-glow)' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent-blue)' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-risk-medium)' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-risk-high)' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--color-risk-catastrophic)' }} />
                <span>More</span>
                <span style={{ marginLeft: '16px', color: 'var(--color-risk-catastrophic)', fontWeight: '600' }}>
                    🔴 March Rush Zone
                </span>
            </div>

            {yearGroups.map(({ year, days }) => {
                // Build a map of date -> data for quick lookup
                const dayMap = {};
                days.forEach(d => { dayMap[d.date] = d; });

                // Generate weeks for this year (1-53)
                const maxWeek = Math.max(...days.map(d => d.week), 52);

                return (
                    <div key={year} style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                            {year}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {/* Day labels column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '18px' }}>
                                {dayLabels.map((label, i) => (
                                    <div key={i} style={{ height: '13px', fontSize: '9px', color: 'var(--text-muted)', lineHeight: '13px', width: '20px' }}>
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {/* Month labels row */}
                            <div>
                                <div style={{ display: 'flex', gap: '2px', marginBottom: '4px', height: '14px' }}>
                                    {monthLabels.map((m, i) => (
                                        <div key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', width: 'calc((13px + 2px) * 4)', flexShrink: 0 }}>
                                            {m}
                                        </div>
                                    ))}
                                </div>

                                {/* Heatmap grid: 7 rows (days) x N columns (weeks) */}
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    {Array.from({ length: maxWeek }, (_, weekIdx) => (
                                        <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {Array.from({ length: 7 }, (_, dayIdx) => {
                                                // Find the date for this week+day
                                                const matchingDay = days.find(d => d.week === weekIdx + 1 && d.day === dayIdx);
                                                if (!matchingDay) {
                                                    return <div key={dayIdx} style={{ width: '13px', height: '13px', borderRadius: '3px' }} />;
                                                }
                                                const isMarch = matchingDay.month === 3;
                                                const color = getColor(matchingDay.value);
                                                return (
                                                    <div
                                                        key={dayIdx}
                                                        onMouseEnter={(e) => {
                                                            setHoveredCell(matchingDay);
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setTooltipPos({ x: rect.left, y: rect.top });
                                                        }}
                                                        onMouseLeave={() => setHoveredCell(null)}
                                                        style={{
                                                            width: '13px',
                                                            height: '13px',
                                                            borderRadius: '3px',
                                                            background: color,
                                                            cursor: 'pointer',
                                                            transition: 'transform 0.1s',
                                                            outline: isMarch ? '1px solid var(--color-risk-catastrophic)' : 'none',
                                                            outlineOffset: isMarch ? '1px' : '0',
                                                        }}
                                                        onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.4)'; }}
                                                        onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Tooltip */}
            {hoveredCell && (
                <div
                    style={{
                        position: 'fixed',
                        left: tooltipPos.x + 18,
                        top: tooltipPos.y - 60,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.78rem',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {hoveredCell.date}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        Value: <strong style={{ color: 'var(--accent-blue)' }}>{formatValue(hoveredCell.value)}</strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        Contracts: <strong style={{ color: 'var(--text-primary)' }}>{hoveredCell.contracts.toLocaleString()}</strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        Single-Bid Rate: <strong style={{ color: hoveredCell.singleBidRate > 10 ? 'var(--color-risk-catastrophic)' : 'var(--text-primary)' }}>{hoveredCell.singleBidRate}%</strong>
                    </div>
                    {hoveredCell.month === 3 && (
                        <div style={{ color: 'var(--color-risk-catastrophic)', fontWeight: '700', marginTop: '4px', fontSize: '0.72rem' }}>
                            ⚠️ Fiscal Close Rush
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}