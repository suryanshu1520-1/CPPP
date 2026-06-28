import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const type = searchParams.get('type') || 'all'; // 'single_bid', 'rush', 'delayed', 'all'
    
    let whereClause = "bids_received = 1 OR bid_window_days < 7 OR award_delay_days > 180";
    if (type === 'single_bid') {
      whereClause = "bids_received = 1";
    } else if (type === 'rush') {
      whereClause = "bid_window_days >= 0 AND bid_window_days < 7";
    } else if (type === 'delayed') {
      whereClause = "award_delay_days > 180";
    }

    // Since aoc_clean is huge, we filter and order by contract_date DESC (which is indexed!)
    // Querying with an index on contract_date will be extremely fast!
    const query = `
      SELECT 
        internal_id as internalId,
        tender_id as tenderId,
        org_name as department,
        title,
        contract_value as value,
        bids_received as bids,
        vendor_name as vendor,
        published_date as publishedDate,
        closing_date as closingDate,
        contract_date as contractDate,
        award_delay_days as awardDelay,
        bid_window_days as bidWindow
      FROM aoc_clean
      WHERE (${whereClause}) AND contract_date IS NOT NULL
      ORDER BY contract_date DESC
      LIMIT ${limit}
    `;
    
    const startTime = Date.now();
    const tenders = db.prepare(query).all();
    const queryTime = Date.now() - startTime;
    console.log(`Red flag query executed in ${queryTime}ms`);
    
    return NextResponse.json({
      success: true,
      data: tenders
    });
  } catch (error) {
    console.error('Database query error in red-flags:', error);
    
    // Fallback Mock alerts
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      const mockAlerts = [
        {
          internalId: "AOC_1029410",
          tenderId: "2026_CPWD_839021_1",
          department: "Central Public Works Department (CPWD)",
          title: "Construction of boundary wall and security cabins at NIT Campus",
          value: 45000000, // 4.5 Cr
          bids: 1,
          vendor: "R. K. Builders & Co.",
          publishedDate: "2026-05-10 10:00:00",
          closingDate: "2026-05-12 10:00:00", // 2 day window!
          contractDate: "2026-06-15 12:00:00",
          awardDelay: 36,
          bidWindow: 2
        },
        {
          internalId: "AOC_904123",
          tenderId: "2026_NHAI_930219_4",
          department: "National Highways Authority of India (NHAI)",
          title: "Consultancy services for preparation of DPR for 4-laning of NH-31",
          value: 125000000, // 12.5 Cr
          bids: 1,
          vendor: "Vikas Infrastructure Consultants Ltd",
          publishedDate: "2026-04-12 09:00:00",
          closingDate: "2026-05-15 15:00:00",
          contractDate: "2026-11-20 12:00:00", // >6 months delay
          awardDelay: 189,
          bidWindow: 33
        },
        {
          internalId: "AOC_31920",
          tenderId: "2026_MES_182901_3",
          department: "Military Engineer Services (MES)",
          title: "Provision of solar power plant at military station, Jaipur",
          value: 78000000,
          bids: 1,
          vendor: "Urja Solutions Pvt Ltd",
          publishedDate: "2026-05-01 11:00:00",
          closingDate: "2026-05-05 11:00:00", // 4 day window
          contractDate: "2026-05-20 12:00:00",
          awardDelay: 15,
          bidWindow: 4
        },
        {
          internalId: "AOC_593210",
          tenderId: "2026_WBPWD_730219_2",
          department: "State Public Works Department - West Bengal",
          title: "Repair and renovation of administrative block, Malda District Hospital",
          value: 12000000,
          bids: 1,
          vendor: "Bengal Construction Agency",
          publishedDate: "2026-03-01 10:00:00",
          closingDate: "2026-03-03 10:00:00", // 2 day window
          contractDate: "2026-03-10 12:00:00",
          awardDelay: 7,
          bidWindow: 2
        },
        {
          internalId: "AOC_842013",
          tenderId: "2026_KRLGD_390211_5",
          department: "State Public Works Department - Kerala",
          title: "Tarring and drainage work for local Panchayat link road, Palakkad",
          value: 3500000,
          bids: 1,
          vendor: "K. M. Mathew Contractors",
          publishedDate: "2026-05-15 09:00:00",
          closingDate: "2026-05-20 14:00:00", // 5 day window
          contractDate: "2026-06-01 12:00:00",
          awardDelay: 12,
          bidWindow: 5
        }
      ];
      
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback red flags.",
        isLocked: true,
        data: mockAlerts
      });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
