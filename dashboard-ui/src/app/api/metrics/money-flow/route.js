import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';
        const limit = parseInt(searchParams.get('limit') || '8');

        let nodes = [];
        let links = [];

        if (org) {
            const { data: vendorRows, error } = await supabase
                .from('money_flow_vendors')
                .select('vendor_name, total_value, contracts')
                .eq('org_name', org)
                .order('rank', { ascending: true })
                .limit(limit);

            if (error) throw new Error(error.message);

            if (!vendorRows || vendorRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org,
                    data: { nodes: [], links: [] }
                });
            }

            const totalValue = vendorRows.reduce((sum, r) => sum + Number(r.total_value), 0);
            nodes.push({ id: 'org', name: org, type: 'department', value: totalValue });

            vendorRows.forEach((r, idx) => {
                const vid = `v${idx}`;
                const vendorLabel = r.vendor_name.length > 30 ? r.vendor_name.substring(0, 28) + '...' : r.vendor_name;
                nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: Number(r.total_value), fullName: r.vendor_name, contracts: r.contracts });
                links.push({ source: 'org', target: vid, value: Number(r.total_value) });
            });

        } else {
            const { data: deptRows, error } = await supabase
                .from('org_stats')
                .select('org_name, total_value, total_contracts')
                .order('total_value', { ascending: false })
                .limit(limit);

            if (error) throw new Error(error.message);

            if (!deptRows || deptRows.length === 0) {
                return NextResponse.json({
                    success: true,
                    org: 'All Departments',
                    data: { nodes: [], links: [] }
                });
            }

            // one query for every department's top-3 vendors (rank <= 3)
            const deptNames = deptRows.map(d => d.org_name);
            const { data: vendorRows, error: vErr } = await supabase
                .from('money_flow_vendors')
                .select('org_name, vendor_name, total_value, rank')
                .in('org_name', deptNames)
                .lte('rank', 3);

            if (vErr) throw new Error(vErr.message);

            const vendorsByOrg = {};
            (vendorRows || []).forEach(v => {
                (vendorsByOrg[v.org_name] = vendorsByOrg[v.org_name] || []).push(v);
            });

            const grandTotal = deptRows.reduce((sum, r) => sum + Number(r.total_value), 0);
            nodes.push({ id: 'total', name: 'Total Procurement Budget', type: 'total', value: grandTotal });

            deptRows.forEach((d, dIdx) => {
                const did = `d${dIdx}`;
                const deptLabel = d.org_name.length > 25 ? d.org_name.substring(0, 23) + '...' : d.org_name;
                nodes.push({ id: did, name: deptLabel, type: 'department', value: Number(d.total_value), fullName: d.org_name, contracts: Number(d.total_contracts) });
                links.push({ source: 'total', target: did, value: Number(d.total_value) });

                const topVendors = (vendorsByOrg[d.org_name] || []).sort((a, b) => a.rank - b.rank);
                topVendors.forEach((v, vIdx) => {
                    const vid = `${did}_v${vIdx}`;
                    const vendorLabel = v.vendor_name.length > 22 ? v.vendor_name.substring(0, 20) + '...' : v.vendor_name;
                    nodes.push({ id: vid, name: vendorLabel, type: 'vendor', value: Number(v.total_value), fullName: v.vendor_name });
                    links.push({ source: did, target: vid, value: Number(v.total_value) });
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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
