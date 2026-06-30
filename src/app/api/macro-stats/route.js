import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/postgres';

export async function GET() {
  try {
    // Aggregate macro stats from aoc_clean directly
    const stats = await queryOne(`
      SELECT 
        SUM(contract_value) as "totalValue",
        COUNT(*) as "totalContracts",
        SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as "totalSingleBid",
        AVG(bids_received) as "avgBids"
      FROM aoc_clean
    `);

    // Count rush jobs (bid window < 7 days)
    const rushResult = await queryOne(`
      SELECT COUNT(*) as count 
      FROM aoc_clean 
      WHERE bid_window_days IS NOT NULL AND bid_window_days < 7
    `);

    const totalSingleBid = stats?.totalSingleBid ? Number(stats.totalSingleBid) : 0;
    const rushJobsCount = rushResult?.count ? Number(rushResult.count) : 0;
    const criticalFlags = totalSingleBid + rushJobsCount;

    return NextResponse.json({
      success: true,
      totalValue: stats?.totalValue ? Number(stats.totalValue) : 0,
      totalContracts: stats?.totalContracts ? Number(stats.totalContracts) : 0,
      avgBids: stats?.avgBids ? parseFloat(Number(stats.avgBids).toFixed(2)) : 0,
      singleBidRate: stats?.totalContracts ? parseFloat(((totalSingleBid / Number(stats.totalContracts)) * 100).toFixed(2)) : 0,
      criticalFlags: criticalFlags || 0
    });
  } catch (error) {
    console.error('Database query error in macro-stats:', error);

    // Handle database unavailable
    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Please reload in a few minutes.",
        isLocked: true,
        totalValue: 74200000000,
        totalContracts: 8874151,
        avgBids: 3.69,
        singleBidRate: 7.8,
        criticalFlags: 654210
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}