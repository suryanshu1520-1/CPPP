"use client";

import React, { useState, useMemo } from 'react';

/**
 * MoneyFlowSankey — Custom SVG-based Sankey diagram showing fund flow
 * from Total Budget → Departments → Top Vendors.
 * 
 * Props:
 * - data: { nodes: [{ id, name, type, value, fullName? }], links: [{ source, target, value }] }
 * - formatValue: function to format currency
 */
export default function MoneyFlowSankey({ data, formatValue }) {
    const [hoveredLink, setHoveredLink] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });

    const { nodes, links } = data || { nodes: [], links: [] };

    // Layout configuration
    const width = 760;
    const nodeWidth = 160;
    const nodeHeight = 36;
    const nodeGap = 12;
    const linkOpacity = 0.4;
    const linkHoverOpacity = 0.7;

    // Color mapping by node type
    const nodeColors = {
        total: 'var(--accent-blue)',
        department: 'var(--accent-purple)',
        vendor: 'var(--color-risk-medium)',
    };

    const linkColors = {
        'total-department': 'var(--accent-blue)',
        'department-vendor': 'var(--accent-purple)',
    };

    // Calculate layout positions
    const layout = useMemo(() => {
        if (!nodes.length || !links.length) return null;

        // Determine column for each node
        // total = col 0, departments = col 1, vendors = col 2
        const nodeMap = {};
        nodes.forEach(n => { nodeMap[n.id] = { ...n, col: 0, links: [] }; });

        // Assign columns
        nodes.forEach(n => {
            if (n.type === 'total') nodeMap[n.id].col = 0;
            else if (n.type === 'department') nodeMap[n.id].col = 1;
            else if (n.type === 'vendor') nodeMap[n.id].col = 2;
        });

        // Group nodes by column
        const columns = { 0: [], 1: [], 2: [] };
        nodes.forEach(n => {
            const col = nodeMap[n.id].col;
            if (columns[col]) columns[col].push(nodeMap[n.id]);
        });

        // Sort each column by value descending
        Object.keys(columns).forEach(col => {
            columns[col].sort((a, b) => b.value - a.value);
        });

        // Calculate Y positions for each node within its column
        const colWidth = (width - nodeWidth * 3) / 2; // gap between columns
        const xPositions = { 0: 0, 1: nodeWidth + colWidth, 2: 2 * (nodeWidth + colWidth) };

        Object.keys(columns).forEach(col => {
            const colNodes = columns[col];
            const totalHeight = colNodes.length * (nodeHeight + nodeGap) - nodeGap;
            let y = 20;
            colNodes.forEach((n, idx) => {
                n.x = xPositions[col];
                n.y = y;
                n.index = idx;
                y += nodeHeight + nodeGap;
            });
        });

        // Calculate link paths
        const processedLinks = links.map(link => {
            const sourceNode = nodeMap[link.source];
            const targetNode = nodeMap[link.target];
            if (!sourceNode || !targetNode) return null;

            // Calculate link thickness proportional to value
            const maxValue = sourceNode.value;
            const thickness = Math.max(2, (link.value / maxValue) * nodeHeight * 0.8);

            // Source and target Y positions (center of the link on each node)
            const sourceY = sourceNode.y + nodeHeight / 2;
            const targetY = targetNode.y + nodeHeight / 2;
            const sourceX = sourceNode.x + nodeWidth;
            const targetX = targetNode.x;

            // Bezier curve control points
            const midX = (sourceX + targetX) / 2;
            const path = `M ${sourceX} ${sourceY - thickness / 2}
                    C ${midX} ${sourceY - thickness / 2}, ${midX} ${targetY - thickness / 2}, ${targetX} ${targetY - thickness / 2}
                    L ${targetX} ${targetY + thickness / 2}
                    C ${midX} ${targetY + thickness / 2}, ${midX} ${sourceY + thickness / 2}, ${sourceX} ${sourceY + thickness / 2}
                    Z`;

            return {
                ...link,
                path,
                thickness,
                sourceNode,
                targetNode,
                color: linkColors[`${sourceNode.type}-${targetNode.type}`] || 'var(--accent-blue)',
            };
        }).filter(Boolean);

        return {
            nodes: Object.values(nodeMap),
            links: processedLinks,
            columns,
            totalHeight: Math.max(
                ...Object.values(columns).map(col => col.length * (nodeHeight + nodeGap))
            ) + 40,
        };
    }, [nodes, links]);

    if (!layout || layout.nodes.length === 0) {
        return (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>No money flow data available</span>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', overflowX: 'auto' }}>
            <svg
                width={width}
                height={layout.totalHeight}
                style={{ display: 'block' }}
            >
                {/* Links (drawn first, behind nodes) */}
                {layout.links.map((link, idx) => (
                    <path
                        key={idx}
                        d={link.path}
                        fill={hoveredLink === idx ? link.color : link.color}
                        opacity={hoveredLink === idx ? linkHoverOpacity : linkOpacity}
                        onMouseEnter={(e) => {
                            setHoveredLink(idx);
                            setTooltip({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                content: {
                                    from: link.sourceNode.fullName || link.sourceNode.name,
                                    to: link.targetNode.fullName || link.targetNode.name,
                                    value: link.value,
                                    share: ((link.value / link.sourceNode.value) * 100).toFixed(1),
                                },
                            });
                        }}
                        onMouseMove={(e) => {
                            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                        }}
                        onMouseLeave={() => {
                            setHoveredLink(null);
                            setTooltip({ visible: false, x: 0, y: 0, content: null });
                        }}
                        style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                    />
                ))}

                {/* Nodes */}
                {layout.nodes.map((node) => (
                    <g
                        key={node.id}
                        onMouseEnter={(e) => {
                            setHoveredNode(node.id);
                            setTooltip({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                content: {
                                    name: node.fullName || node.name,
                                    value: node.value,
                                    type: node.type,
                                    contracts: node.contracts,
                                },
                            });
                        }}
                        onMouseMove={(e) => {
                            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                        }}
                        onMouseLeave={() => {
                            setHoveredNode(null);
                            setTooltip({ visible: false, x: 0, y: 0, content: null });
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <rect
                            x={node.x}
                            y={node.y}
                            width={nodeWidth}
                            height={nodeHeight}
                            rx={6}
                            fill={nodeColors[node.type] || 'var(--accent-blue)'}
                            opacity={hoveredNode === node.id ? 1 : 0.85}
                            style={{ transition: 'opacity 0.2s' }}
                        />
                        <text
                            x={node.x + nodeWidth / 2}
                            y={node.y + nodeHeight / 2 + 4}
                            textAnchor="middle"
                            fill="white"
                            fontSize="11px"
                            fontWeight="600"
                            fontFamily="var(--font-body)"
                        >
                            {node.name.length > 22 ? node.name.substring(0, 20) + '...' : node.name}
                        </text>
                    </g>
                ))}
            </svg>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: nodeColors.total }} />
                    Total Budget
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: nodeColors.department }} />
                    Departments
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: nodeColors.vendor }} />
                    Top Vendors
                </span>
            </div>

            {/* Tooltip */}
            {tooltip.visible && tooltip.content && (
                <div
                    style={{
                        position: 'fixed',
                        left: tooltip.x + 14,
                        top: tooltip.y - 50,
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
                    {tooltip.content.from ? (
                        // Link tooltip
                        <>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                Fund Flow
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                From: <strong style={{ color: 'var(--accent-blue)' }}>{tooltip.content.from}</strong>
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                To: <strong style={{ color: 'var(--accent-purple)' }}>{tooltip.content.to}</strong>
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                Value: <strong style={{ color: 'var(--text-primary)' }}>{formatValue(tooltip.content.value)}</strong>
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                Share: <strong style={{ color: 'var(--color-risk-medium)' }}>{tooltip.content.share}%</strong>
                            </div>
                        </>
                    ) : (
                        // Node tooltip
                        <>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {tooltip.content.name}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                Type: <strong style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>{tooltip.content.type}</strong>
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                Total Value: <strong style={{ color: 'var(--accent-blue)' }}>{formatValue(tooltip.content.value)}</strong>
                            </div>
                            {tooltip.content.contracts && (
                                <div style={{ color: 'var(--text-secondary)' }}>
                                    Contracts: <strong style={{ color: 'var(--text-primary)' }}>{tooltip.content.contracts.toLocaleString()}</strong>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}