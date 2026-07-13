import { NextResponse } from 'next/server';
import { query } from '@/lib/turso';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';
        const limit = parseInt(searchParams.get('limit') || '8');

        let nodes = [];
        let links = [];

        if (org) {
            const vendorRows = await query(`
                SELECT 
                    vendor_name as vendor,
                    SUM(contract_value) as value,
                    COUNT(*) as contracts
                FROM aoc_clean
                WHERE org_name = $1
                    AND contract_value > 0
                    AND vendor_name IS NOT NULL
                    AND vendor_name != ''
                GROUP BY vendor_name
                ORDER BY SUM(contract_value) DESC
                LIMIT $2
            `, [org, limit]);

            if (vendorRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org,
                    data: { nodes: [], links: [] }
                });
            }

            const totalValue = vendorRows.reduce((sum, r) => sum + Number(r.value), 0);
            nodes.push({ id: 'org', name: org, type: 'department', value: totalValue });

            vendorRows.forEach((r, idx) => {
                const vid = `v${idx}`;
                const vendorLabel = r.vendor.length > 30 ? r.vendor.substring(0, 28) + '...' : r.vendor;
                nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: Number(r.value), fullName: r.vendor, contracts: r.contracts });
                links.push({ source: 'org', target: vid, value: Number(r.value) });
            });

        } else {
            const deptRows = await query(`
                SELECT 
                    org_name as dept,
                    SUM(contract_value) as value,
                    COUNT(*) as contracts
                FROM aoc_clean
                WHERE contract_value > 0
                    AND org_name IS NOT NULL
                    AND org_name != 'Unknown'
                    AND org_name != ''
                GROUP BY org_name
                ORDER BY SUM(contract_value) DESC
                LIMIT $1
            `, [limit]);

            if (deptRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org: 'All Departments',
                    data: { nodes: [], links: [] }
                });
            }

            const grandTotal = deptRows.reduce((sum, r) => sum + Number(r.value), 0);
            nodes.push({ id: 'total', name: 'Total Procurement Budget', type: 'total', value: grandTotal });

            for (let dIdx = 0; dIdx < deptRows.length; dIdx++) {
                const d = deptRows[dIdx];
                const did = `d${dIdx}`;
                const deptLabel = d.dept.length > 25 ? d.dept.substring(0, 23) + '...' : d.dept;
                nodes.push({ id: did, name: deptLabel, type: 'department', value: Number(d.value), fullName: d.dept, contracts: d.contracts });
                links.push({ source: 'total', target: did, value: Number(d.value) });

                const vendorRows = await query(`
                    SELECT 
                        vendor_name as vendor,
                        SUM(contract_value) as value
                    FROM aoc_clean
                    WHERE org_name = $1
                        AND contract_value > 0
                        AND vendor_name IS NOT NULL
                        AND vendor_name != ''
                    GROUP BY vendor_name
                    ORDER BY SUM(contract_value) DESC
                    LIMIT 3
                `, [d.dept]);

                vendorRows.forEach((v, vIdx) => {
                    const vid = `${did}_v${vIdx}`;
                    const vendorLabel = v.vendor.length > 22 ? v.vendor.substring(0, 20) + '...' : v.vendor;
                    nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: Number(v.value), fullName: v.vendor });
                    links.push({ source: did, target: vid, value: Number(v.value) });
                });
            }
        }

        return NextResponse.json({
            success: true,
            org: org || 'All Departments',
            data: { nodes, links }
        });

    } catch (error) {
        console.error("Error in money-flow API:", error);

        if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
            return NextResponse.json({
                success: false,
                message: "Database is locked or optimizing. Showing fallback money flow data.",
                isLocked: true,
                data: { nodes: [], links: [] }
            });
        }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}