import { NextResponse } from 'next/server';
import { query } from '@/lib/turso';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';
        const year = searchParams.get('year') || '';

        // Dynamic execution path
        let sql;
        const params = [];

        if (org) {
            sql = `
                SELECT 
                    strftime('%Y-%m-%d', contract_date) as date,
                    COUNT(*) as contracts,
                    SUM(contract_value) as value,
                    SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as "singleBidCount"
                FROM aoc_clean
                WHERE org_name = $1
                    AND contract_date IS NOT NULL
                GROUP BY strftime('%Y-%m-%d', contract_date)
                ORDER BY date ASC
            `;
            params.push(org);
        } else {
            sql = `
                SELECT 
                    strftime('%Y-%m-%d', contract_date) as date,
                    COUNT(*) as contracts,
                    SUM(contract_value) as value,
                    SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as "singleBidCount"
                FROM aoc_clean
                WHERE contract_date IS NOT NULL
                    AND contract_date >= '2024-01-01'
                GROUP BY strftime('%Y-%m-%d', contract_date)
                ORDER BY date ASC
            `;
        }

        const rows = await query(sql, params);

        // Transform into calendar heatmap format
        const data = rows.map(r => {
            const dateStr = r.date;
            const parts = dateStr.split('-');
            if (parts.length < 3) return null;

            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const d = parseInt(parts[2]);

            const dateObj = new Date(y, m - 1, d);
            const dayOfWeek = dateObj.getDay();
            const onejan = new Date(y, 0, 1);
            const weekNum = Math.ceil(((dateObj - onejan) / 86400000 + onejan.getDay() + 1) / 7);

            const contracts = Number(r.contracts);
            const singleBidRate = contracts > 0 ? (Number(r.singleBidCount) / contracts) * 100 : 0;

            return {
                date: dateStr,
                day: dayOfWeek,
                week: weekNum,
                month: m,
                year: y,
                value: r.value ? Number(r.value) : 0,
                contracts,
                singleBidRate: parseFloat(singleBidRate.toFixed(1))
            };
        }).filter(Boolean);

        return NextResponse.json({
            success: true,
            org: org || 'All Departments',
            data
        });

    } catch (error) {
        console.error("Error in fiscal-heatmap API:", error);

        if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
            return NextResponse.json({
                success: false,
                message: "Database is locked or optimizing. Showing fallback heatmap data.",
                isLocked: true,
                data: []
            });
        }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}