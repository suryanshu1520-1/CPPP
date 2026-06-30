import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * Money Flow Sankey Diagram API
 * Returns nodes and links for a Sankey diagram showing fund flow:
 *   Total Budget → Top Departments → Top Vendors (per department)
 * 
 * Data shape:
 * {
 *   nodes: [{ id, name, type, value }],
 *   links: [{ source, target, value }]
 * }
 * 
 * type: 'total' | 'department' | 'vendor'
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';
        const limit = parseInt(searchParams.get('limit') || '8'); // top N departments/vendors

        // 1. Fast Cache Path for Global View
        if (!org) {
            const cachePath = path.resolve(process.cwd(), 'src/app/api/metrics/money-flow/global_sankey.json');
            if (fs.existsSync(cachePath)) {
                const cacheContent = fs.readFileSync(cachePath, 'utf8');
                return NextResponse.json({
                    success: true,
                    org: 'All Departments',
                    data: JSON.parse(cacheContent)
                });
            }
        }

        // 2. Dynamic execution path
        const db = getDb();

        let nodes = [];
        let links = [];

        if (org) {
            // Per-organization: show flow from this org → its top vendors
            const vendorSql = `
                SELECT 
                    vendor_name as vendor,
                    SUM(contract_value) as value,
                    COUNT(*) as contracts
                FROM aoc_clean
                WHERE org_name = ?
                    AND contract_value > 0
                    AND vendor_name IS NOT NULL
                    AND vendor_name != ''
                    AND contract_date != '9999-01-01 00:00:00'
                GROUP BY vendor_name
                ORDER BY value DESC
                LIMIT ?
            `;
            const vendorRows = db.prepare(vendorSql).all(org, limit);

            if (vendorRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org,
                    data: { nodes: [], links: [] }
                });
            }

            const totalValue = vendorRows.reduce((sum, r) => sum + r.value, 0);

            // Source node: the organization
            nodes.push({ id: 'org', name: org, type: 'department', value: totalValue });

            // Vendor nodes + links
            vendorRows.forEach((r, idx) => {
                const vid = `v${idx}`;
                const vendorLabel = r.vendor.length > 30 ? r.vendor.substring(0, 28) + '...' : r.vendor;
                nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: r.value, fullName: r.vendor, contracts: r.contracts });
                links.push({ source: 'org', target: vid, value: r.value });
            });

        } else {
            // Global: Total Budget → Top Departments → Top Vendors per department
            // Step 1: Get top departments by total value
            const deptSql = `
                SELECT 
                    org_name as dept,
                    SUM(contract_value) as value,
                    COUNT(*) as contracts
                FROM aoc_clean
                WHERE contract_value > 0
                    AND org_name IS NOT NULL
                    AND org_name != 'Unknown'
                    AND org_name != ''
                    AND contract_date != '9999-01-01 00:00:00'
                GROUP BY org_name
                ORDER BY value DESC
                LIMIT ?
            `;
            const deptRows = db.prepare(deptSql).all(limit);

            if (deptRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org: 'All Departments',
                    data: { nodes: [], links: [] }
                });
            }

            const grandTotal = deptRows.reduce((sum, r) => sum + r.value, 0);

            // Root node: Total Budget
            nodes.push({ id: 'total', name: 'Total Procurement Budget', type: 'total', value: grandTotal });

            // For each top department, get its top 3 vendors
            const vendorSql = `
                SELECT 
                    vendor_name as vendor,
                    SUM(contract_value) as value
                FROM aoc_clean
                WHERE org_name = ?
                    AND contract_value > 0
                    AND vendor_name IS NOT NULL
                    AND vendor_name != ''
                    AND contract_date != '9999-01-01 00:00:00'
                GROUP BY vendor_name
                ORDER BY value DESC
                LIMIT 3
            `;

            deptRows.forEach((d, dIdx) => {
                const did = `d${dIdx}`;
                const deptLabel = d.dept.length > 25 ? d.dept.substring(0, 23) + '...' : d.dept;
                nodes.push({ id: did, name: deptLabel, type: 'department', value: d.value, fullName: d.dept, contracts: d.contracts });
                links.push({ source: 'total', target: did, value: d.value });

                // Get top vendors for this department
                const vendorRows = db.prepare(vendorSql).all(d.dept);
                vendorRows.forEach((v, vIdx) => {
                    const vid = `${did}_v${vIdx}`;
                    const vendorLabel = v.vendor.length > 22 ? v.vendor.substring(0, 20) + '...' : v.vendor;
                    nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: v.value, fullName: v.vendor });
                    links.push({ source: did, target: vid, value: v.value });
                });
            });
        }

        return NextResponse.json({
            success: true,
            org: org || 'All Departments',
            data: { nodes, links }
        });

    } catch (error) {
        console.error("Error in money-flow API:", error);

        // Fallback Mock data
        if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table') || error.message === 'DATABASE_UNAVAILABLE') {
            const mockData = generateMockSankeyData();
            return NextResponse.json({
                success: false,
                message: "Database is locked or optimizing. Showing fallback money flow data.",
                isLocked: true,
                data: mockData
            });
        }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * Generate mock Sankey data for fallback
 */
function generateMockSankeyData() {
    const nodes = [
        { id: 'total', name: 'Total Procurement Budget', type: 'total', value: 742000000000 },
        { id: 'd0', name: 'NHAI', type: 'department', value: 185000000000, fullName: 'National Highways Authority of India' },
        { id: 'd1', name: 'CPWD', type: 'department', value: 92000000000, fullName: 'Central Public Works Department' },
        { id: 'd2', name: 'MES', type: 'department', value: 68000000000, fullName: 'Military Engineer Services' },
        { id: 'd3', name: 'Railways', type: 'department', value: 54000000000, fullName: 'Ministry of Railways' },
        { id: 'd4', name: 'BHEL', type: 'department', value: 42000000000, fullName: 'Bharat Heavy Electricals Limited' },
        // Vendors for NHAI
        { id: 'd0_v0', name: 'L&T Limited', type: 'vendor', value: 89000000000, fullName: 'Larsen & Toubro Limited' },
        { id: 'd0_v1', name: 'Dilip Buildcon', type: 'vendor', value: 34000000000, fullName: 'Dilip Buildcon Limited' },
        { id: 'd0_v2', name: 'Tata Projects', type: 'vendor', value: 28000000000, fullName: 'Tata Projects Limited' },
        // Vendors for CPWD
        { id: 'd1_v0', name: 'Shapoorji Pallonji', type: 'vendor', value: 32000000000, fullName: 'Shapoorji Pallonji' },
        { id: 'd1_v1', name: 'Simplex Infra', type: 'vendor', value: 21000000000, fullName: 'Simplex Infrastructure' },
        // Vendors for MES
        { id: 'd2_v0', name: 'Standard Coolers', type: 'vendor', value: 18000000000, fullName: 'Standard Coolers Pvt Ltd' },
        { id: 'd2_v1', name: 'Military Supplies', type: 'vendor', value: 15000000000, fullName: 'Military Supplies Corp' },
        // Vendors for Railways
        { id: 'd3_v0', name: 'IRCON Intl', type: 'vendor', value: 22000000000, fullName: 'IRCON International' },
        { id: 'd3_v1', name: 'RVNL', type: 'vendor', value: 16000000000, fullName: 'Rail Vikas Nigam Limited' },
        // Vendors for BHEL
        { id: 'd4_v0', name: 'BHEL Direct', type: 'vendor', value: 28000000000, fullName: 'BHEL Internal' },
    ];

    const links = [
        { source: 'total', target: 'd0', value: 185000000000 },
        { source: 'total', target: 'd1', value: 92000000000 },
        { source: 'total', target: 'd2', value: 68000000000 },
        { source: 'total', target: 'd3', value: 54000000000 },
        { source: 'total', target: 'd4', value: 42000000000 },
        // NHAI vendors
        { source: 'd0', target: 'd0_v0', value: 89000000000 },
        { source: 'd0', target: 'd0_v1', value: 34000000000 },
        { source: 'd0', target: 'd0_v2', value: 28000000000 },
        // CPWD vendors
        { source: 'd1', target: 'd1_v0', value: 32000000000 },
        { source: 'd1', target: 'd1_v1', value: 21000000000 },
        // MES vendors
        { source: 'd2', target: 'd2_v0', value: 18000000000 },
        { source: 'd2', target: 'd2_v1', value: 15000000000 },
        // Railways vendors
        { source: 'd3', target: 'd3_v0', value: 22000000000 },
        { source: 'd3', target: 'd3_v1', value: 16000000000 },
        // BHEL vendors
        { source: 'd4', target: 'd4_v0', value: 28000000000 },
    ];

    return { nodes, links };
}