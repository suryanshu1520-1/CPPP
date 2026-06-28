import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    
    const query = `
      SELECT 
        org_name as department,
        total_contracts as contracts,
        total_value as value,
        avg_bids as avgBids,
        avg_delay_days as avgDelay,
        single_bid_contracts as singleBidContracts,
        (single_bid_contracts * 100.0 / total_contracts) as singleBidRate
      FROM org_summary
      WHERE org_name IS NOT NULL AND org_name != 'Unknown' AND org_name != ''
      ORDER BY total_value DESC
      LIMIT 15
    `;
    
    const departments = db.prepare(query).all();
    
    // Format values nicely
    const data = departments.map(d => ({
      ...d,
      value: d.value || 0,
      avgBids: d.avgBids ? parseFloat(d.avgBids.toFixed(2)) : 0,
      avgDelay: d.avgDelay ? parseFloat(d.avgDelay.toFixed(1)) : 0,
      singleBidRate: d.singleBidRate ? parseFloat(d.singleBidRate.toFixed(1)) : 0
    }));
    
    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Database query error in top-departments:', error);
    
    // Fallback Mock data
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
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
      ].sort((a,b) => b.value - a.value);
      
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
