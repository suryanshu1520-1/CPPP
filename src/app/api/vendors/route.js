import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    // Query top 15 vendors by total contract value
    const query = `
      SELECT 
        vendor_name as vendor,
        total_contracts as contracts,
        total_value as value,
        single_bid_wins as singleBidWins,
        avg_bids as avgBids,
        (single_bid_wins * 100.0 / total_contracts) as singleBidRate
      FROM vendor_summary
      WHERE vendor_name IS NOT NULL AND vendor_name != '' AND vendor_name != 'Unknown'
      ORDER BY total_value DESC
      LIMIT 15
    `;

    const vendors = db.prepare(query).all();

    const data = vendors.map(v => ({
      ...v,
      value: v.value || 0,
      avgBids: v.avgBids ? parseFloat(v.avgBids.toFixed(2)) : 0,
      singleBidRate: v.singleBidRate ? parseFloat(v.singleBidRate.toFixed(1)) : 0
    }));

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Database query error in vendors:', error);

    // Fallback Mock data
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table') || error.message === 'DATABASE_UNAVAILABLE') {
      const mockVendors = [
        { vendor: "Larsen & Toubro Limited (L&T)", contracts: 1450, value: 345000000000, singleBidWins: 45, avgBids: 4.8, singleBidRate: 3.1 },
        { vendor: "Tata Projects Limited", contracts: 920, value: 182000000000, singleBidWins: 32, avgBids: 4.5, singleBidRate: 3.5 },
        { vendor: "Dilip Buildcon Limited", contracts: 1820, value: 145000000000, singleBidWins: 110, avgBids: 3.9, singleBidRate: 6.0 },
        { vendor: "Megha Engineering & Infrastructures Ltd (MEIL)", contracts: 720, value: 135000000000, singleBidWins: 65, avgBids: 3.2, singleBidRate: 9.0 },
        { vendor: "Afcons Infrastructure Limited", contracts: 380, value: 95000000000, singleBidWins: 12, avgBids: 4.1, singleBidRate: 3.2 },
        { vendor: "NCC Limited (Nagarjuna)", contracts: 1120, value: 89000000000, singleBidWins: 82, avgBids: 3.6, singleBidRate: 7.3 },
        { vendor: "Adani Enterprises Limited", contracts: 210, value: 78000000000, singleBidWins: 25, avgBids: 3.1, singleBidRate: 11.9 },
        { vendor: "Hindustan Construction Company (HCC)", contracts: 410, value: 74000000000, singleBidWins: 28, avgBids: 3.8, singleBidRate: 6.8 },
        { vendor: "Simplex Infrastructures Limited", contracts: 1340, value: 68000000000, singleBidWins: 105, avgBids: 3.3, singleBidRate: 7.8 },
        { vendor: "Bridge and Roof Co. (India) Ltd", contracts: 2240, value: 58000000000, singleBidWins: 202, avgBids: 3.1, singleBidRate: 9.0 }
      ].sort((a, b) => b.value - a.value);

      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback vendor leaderboard.",
        isLocked: true,
        data: mockVendors
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
