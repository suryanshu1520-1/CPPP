import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    
    const trendQuery = `
      SELECT 
        year_month as date,
        total_contracts as contracts,
        total_value as value,
        avg_bids as avgBids
      FROM monthly_summary
      WHERE year_month IS NOT NULL AND year_month != '' AND year_month >= '2011-01'
      ORDER BY year_month ASC
    `;
    
    const trend = db.prepare(trendQuery).all();
    
    return NextResponse.json({
      success: true,
      data: trend
    });
  } catch (error) {
    console.error('Database query error in spending-trend:', error);
    
    // Handle database locked or tables not initialized yet
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      // Return high-quality mock trend data for styling/fallback
      const mockData = [];
      const startYear = 2018;
      const endYear = 2026;
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      
      let baseValue = 500000000; // 50 Cr
      for (let y = startYear; y <= endYear; y++) {
        for (const m of months) {
          if (y === 2026 && parseInt(m) > 6) break; // limit to current time
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
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
