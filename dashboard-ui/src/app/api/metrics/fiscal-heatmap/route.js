import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';

        // daily_awards holds 2024+ daily rollups; org_name = '' is the global rollup.
        // PostgREST caps responses at 1000 rows, so page until exhausted.
        const rows = [];
        for (let from = 0; ; from += 1000) {
            const { data: page, error } = await supabase
                .from('daily_awards')
                .select('award_date, contracts, total_value, single_bid_count')
                .eq('org_name', org)
                .order('award_date', { ascending: true })
                .range(from, from + 999);
            if (error) throw new Error(error.message);
            rows.push(...(page || []));
            if (!page || page.length < 1000) break;
        }

        // Transform into calendar heatmap format
        const data = (rows || []).map(r => {
            const dateStr = r.award_date;
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
            const singleBidRate = contracts > 0 ? (Number(r.single_bid_count) / contracts) * 100 : 0;

            return {
                date: dateStr,
                day: dayOfWeek,
                week: weekNum,
                month: m,
                year: y,
                value: r.total_value ? Number(r.total_value) : 0,
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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
