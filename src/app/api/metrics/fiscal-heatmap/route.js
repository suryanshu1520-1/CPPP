import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * Fiscal Rush Heatmap API
 * Returns daily aggregate contract values for the calendar heatmap visualization.
 * 
 * Data shape: Array of { date, day, week, month, value, contracts, singleBidRate }
 * - date: YYYY-MM-DD
 * - day: day of week (0=Sun .. 6=Sat)
 * - week: ISO week number (1-53)
 * - month: month number (1-12)
 * - value: total contract value awarded that day
 * - contracts: number of contracts awarded
 * - singleBidRate: % of contracts with bids_received = 1
 * 
 * Uses monthly_summary for fast path, falls back to aoc_clean aggregation.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const org = searchParams.get('org') || '';
        const year = searchParams.get('year') || '';

        // 1. Fast Cache Path for Global View
        if (!org) {
            const cachePath = path.resolve(process.cwd(), 'src/app/api/metrics/fiscal-heatmap/global_heatmap.json');
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

        let sql;
        const params = [];

        if (org) {
            // Per-organization daily aggregation
            sql = `
        SELECT 
          contract_date as date,
          COUNT(*) as contracts,
          SUM(contract_value) as value,
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as singleBidCount
        FROM aoc_clean
        WHERE org_name = ?
          AND contract_date IS NOT NULL 
          AND contract_date != '9999-01-01 00:00:00'
          AND contract_date != ''
        GROUP BY contract_date
        ORDER BY contract_date ASC
      `;
            params.push(org);
        } else {
            // Global daily aggregation (fallback if cache missing)
            // Use a sample of recent years to keep it fast
            sql = `
        SELECT 
          contract_date as date,
          COUNT(*) as contracts,
          SUM(contract_value) as value,
          SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as singleBidCount
        FROM aoc_clean
        WHERE contract_date IS NOT NULL 
          AND contract_date != '9999-01-01 00:00:00'
          AND contract_date != ''
          AND contract_date >= '2024-01-01'
        GROUP BY contract_date
        ORDER BY contract_date ASC
      `;
        }

        const rows = db.prepare(sql).all(...params);

        // Transform into calendar heatmap format
        const data = rows.map(r => {
            const dateStr = r.date.split(' ')[0]; // Handle "YYYY-MM-DD HH:MM:SS"
            const parts = dateStr.split('-');
            if (parts.length < 3) return null;

            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const d = parseInt(parts[2]);

            // Calculate day of week (0=Sunday)
            const dateObj = new Date(y, m - 1, d);
            const dayOfWeek = dateObj.getDay();

            // Calculate ISO week number
            const onejan = new Date(y, 0, 1);
            const weekNum = Math.ceil(((dateObj - onejan) / 86400000 + onejan.getDay() + 1) / 7);

            const singleBidRate = r.contracts > 0 ? (r.singleBidCount / r.contracts) * 100 : 0;

            return {
                date: dateStr,
                day: dayOfWeek,
                week: weekNum,
                month: m,
                year: y,
                value: r.value || 0,
                contracts: r.contracts || 0,
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

        // Fallback Mock data
        if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table') || error.message === 'DATABASE_UNAVAILABLE') {
            const mockData = generateMockHeatmapData();
            return NextResponse.json({
                success: false,
                message: "Database is locked or optimizing. Showing fallback heatmap data.",
                isLocked: true,
                data: mockData
            });
        }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * Generate mock heatmap data for fallback (one year of data)
 */
function generateMockHeatmapData() {
    const data = [];
    const year = 2025;
    for (let m = 1; m <= 12; m++) {
        const daysInMonth = new Date(year, m, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, m - 1, d);
            const dayOfWeek = dateObj.getDay();
            const onejan = new Date(year, 0, 1);
            const weekNum = Math.ceil(((dateObj - onejan) / 86400000 + onejan.getDay() + 1) / 7);

            // Simulate March rush: March has 3x higher values
            const baseValue = m === 3 ? 500000000 + Math.random() * 2000000000 :
                m === 2 || m === 4 ? 200000000 + Math.random() * 500000000 :
                    100000000 + Math.random() * 300000000;
            const contracts = m === 3 ? Math.floor(200 + Math.random() * 400) :
                Math.floor(50 + Math.random() * 150);
            const singleBidRate = m === 3 ? 12 + Math.random() * 8 : 5 + Math.random() * 5;

            data.push({
                date: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                day: dayOfWeek,
                week: weekNum,
                month: m,
                year,
                value: baseValue,
                contracts,
                singleBidRate: parseFloat(singleBidRate.toFixed(1))
            });
        }
    }
    return data;
}