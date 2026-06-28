import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    
    // 1. Get totals from org_summary
    const statsQuery = `
      SELECT 
        SUM(total_value) as totalValue,
        SUM(total_contracts) as totalContracts,
        SUM(single_bid_contracts) as totalSingleBid,
        SUM(total_contracts * avg_bids) / SUM(total_contracts) as avgBids
      FROM org_summary
    `;
    
    const stats = db.prepare(statsQuery).get();
    
    // 2. Count critical flags (e.g. single bid, short bid window < 7 days, or high award delay)
    // We can query this from aoc_clean using an optimized index or precomputed count.
    // Since aoc_clean is large, we can pre-calculate or run a quick count of anomalies.
    // For now, let's count from aoc_clean with a limit or use a pre-computed constant if the DB doesn't have a red_flags table yet.
    // Let's check how many single-bid contracts there are.
    const totalSingleBid = stats.totalSingleBid || 0;
    
    // Let's query a sample or quick count for other red flags (rush jobs)
    // To keep it fast, we can run a count on a subquery or a pre-computed estimate.
    const rushJobsQuery = `
      SELECT COUNT(*) as count 
      FROM aoc_clean 
      WHERE bid_window_days < 7
    `;
    let rushJobsCount = 0;
    try {
      const rushResult = db.prepare(rushJobsQuery).get();
      rushJobsCount = rushResult.count;
    } catch (e) {
      console.error('Error querying rush jobs:', e);
    }

    const criticalFlags = totalSingleBid + rushJobsCount;

    return NextResponse.json({
      success: true,
      totalValue: stats.totalValue || 0,
      totalContracts: stats.totalContracts || 0,
      avgBids: stats.avgBids ? parseFloat(stats.avgBids.toFixed(2)) : 0,
      singleBidRate: stats.totalContracts ? parseFloat(((totalSingleBid / stats.totalContracts) * 100).toFixed(2)) : 0,
      criticalFlags: criticalFlags || 0
    });
  } catch (error) {
    console.error('Database query error in macro-stats:', error);
    
    // Handle database locked or tables not initialized yet
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Please reload in a few minutes.",
        isLocked: true,
        // Mock data to prevent total UI collapse during initial setup
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
