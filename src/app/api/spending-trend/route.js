import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET() {
  try {
    // Use the materialized view for monthly summaries
    const trend = await query(`
      SELECT 
        TO_CHAR(month_start, 'YYYY-MM') as date,
        SUM(contract_count)::int as contracts,
        SUM(total_value)::bigint as value,
        AVG(avg_bids)::numeric(10,2) as "avgBids"
      FROM mv_monthly_summary
      WHERE month_start IS NOT NULL AND month_start >= '2011-01-01'
      GROUP BY TO_CHAR(month_start, 'YYYY-MM')
      ORDER BY date ASC
    `);

    return NextResponse.json({
      success: true,
      data: trend
    });
  } catch (error) {
    console.error('Database query error in spending-trend:', error);

    // Handle database unavailable
    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      const mockData = [];
      const startYear = 2018;
      const endYear = 2026;
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

      let baseValue = 500000000;
      for (let y = startYear; y <= endYear; y++) {
        for (const m of months) {
          if (y === 2026 && parseInt(m) > 6) break;
          baseValue += (Math.random() - 0.4) * 80000000;
          mockData.push({
            date: `${y}-${m}`,
            contracts: Math.floor(25000 + Math.random() * 15000),
            value: Math.max(100000000, Math.floor(baseValue)),
            avgBids: parseFloat((3.2 + Math.random() * 0.9).toFixed(2))
          });
        }
      }
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback spending data.",
        isLocked: true,
        data: mockData
      });
    }

    // If materialized view doesn't exist yet, fall back to direct aggregation
    try {
      const trend = await query(`
        SELECT 
          TO_CHAR(date_trunc('month', award_date), 'YYYY-MM') as date,
          COUNT(*)::int as contracts,
          SUM(contract_value)::bigint as value,
          AVG(bids_received)::numeric(10,2) as "avgBids"
        FROM aoc_clean
        WHERE award_date IS NOT NULL AND award_date >= '2011-01-01'
        GROUP BY date_trunc('month', award_date)
        ORDER BY date ASC
      `);

      return NextResponse.json({
        success: true,
        data: trend
      });
    } catch (fallbackError) {
      console.error('Fallback query also failed:', fallbackError);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
}