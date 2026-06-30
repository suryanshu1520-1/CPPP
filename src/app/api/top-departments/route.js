import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET() {
  try {
    const departments = await query(`
      SELECT 
        a.org_name as department,
        COUNT(*)::int as contracts,
        SUM(a.contract_value)::bigint as value,
        AVG(a.bids_received)::numeric(10,2) as "avgBids",
        AVG(a.award_delay_days)::numeric(10,1) as "avgDelay",
        SUM(CASE WHEN a.bids_received = 1 THEN 1 ELSE 0 END)::int as "singleBidContracts",
        ROUND(SUM(CASE WHEN a.bids_received = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) as "singleBidRate"
      FROM aoc_clean a
      WHERE a.org_name IS NOT NULL AND a.org_name != 'Unknown' AND a.org_name != ''
      GROUP BY a.org_name
      ORDER BY SUM(a.contract_value) DESC
      LIMIT 15
    `);

    const data = departments.map(d => ({
      ...d,
      value: d.value ? Number(d.value) : 0,
      avgBids: d.avgBids ? parseFloat(Number(d.avgBids).toFixed(2)) : 0,
      avgDelay: d.avgDelay ? parseFloat(Number(d.avgDelay).toFixed(1)) : 0,
      singleBidRate: d.singleBidRate ? parseFloat(Number(d.singleBidRate).toFixed(1)) : 0
    }));

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Database query error in top-departments:', error);

    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      const mockDeps = [
        { department: "National Highways Authority of India (NHAI)", contracts: 12450, value: 184500000000, avgBids: 4.2, avgDelay: 45.2, singleBidContracts: 950, singleBidRate: 7.6 },
        { department: "Military Engineer Services (MES)", contracts: 45120, value: 92400000000, avgBids: 3.1, avgDelay: 32.8, singleBidContracts: 4820, singleBidRate: 10.7 },
        { department: "Central Public Works Department (CPWD)", contracts: 93940, value: 85200000000, avgBids: 3.4, avgDelay: 28.1, singleBidContracts: 6510, singleBidRate: 6.9 },
        { department: "Ministry of Railways", contracts: 154200, value: 145000000000, avgBids: 3.8, avgDelay: 60.5, singleBidContracts: 11200, singleBidRate: 7.3 },
        { department: "State Public Works Department - West Bengal", contracts: 78519, value: 68400000000, avgBids: 2.8, avgDelay: 41.3, singleBidContracts: 8900, singleBidRate: 11.3 },
        { department: "State Public Works Department - Maharashtra", contracts: 53769, value: 59100000000, avgBids: 3.2, avgDelay: 38.4, singleBidContracts: 5120, singleBidRate: 9.5 },
        { department: "Bharat Heavy Electricals Limited (BHEL)", contracts: 17356, value: 41200000000, avgBids: 3.9, avgDelay: 15.6, singleBidContracts: 820, singleBidRate: 4.7 },
        { department: "State Public Works Department - Kerala", contracts: 35879, value: 34500000000, avgBids: 2.5, avgDelay: 50.2, singleBidContracts: 5310, singleBidRate: 14.8 },
        { department: "Indian Oil Corporation Limited (IOCL)", contracts: 90796, value: 120400000000, avgBids: 4.5, avgDelay: 22.0, singleBidContracts: 3410, singleBidRate: 3.8 },
        { department: "Bharat Petroleum Corporation Limited (BPCL)", contracts: 11933, value: 89100000000, avgBids: 4.8, avgDelay: 20.4, singleBidContracts: 290, singleBidRate: 2.4 }
      ].sort((a, b) => b.value - a.value);

      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback top departments.",
        isLocked: true,
        data: mockDeps
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}