import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const minBids = searchParams.get('minBids') ? parseInt(searchParams.get('minBids')) : null;
    const maxBids = searchParams.get('maxBids') ? parseInt(searchParams.get('maxBids')) : null;
    const minVal = searchParams.get('minVal') ? parseFloat(searchParams.get('minVal')) : null;
    const maxVal = searchParams.get('maxVal') ? parseFloat(searchParams.get('maxVal')) : null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const offset = (page - 1) * limit;

    let sql = `
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
      WHERE 1=1
    `;
    const params = [];

    if (query) {
      // Clean query and search in Title, Tender ID, Org, or Vendor
      sql += ` AND (title LIKE ? OR tender_id LIKE ? OR org_name LIKE ? OR vendor_name LIKE ?)`;
      const queryPattern = `%${query}%`;
      params.push(queryPattern, queryPattern, queryPattern, queryPattern);
    }

    if (minBids !== null) {
      sql += ` AND bids_received >= ?`;
      params.push(minBids);
    }
    if (maxBids !== null) {
      sql += ` AND bids_received <= ?`;
      params.push(maxBids);
    }
    if (minVal !== null) {
      sql += ` AND contract_value >= ?`;
      params.push(minVal * 10000000); // UI passes in Crores, DB stores absolute values
    }
    if (maxVal !== null) {
      sql += ` AND contract_value <= ?`;
      params.push(maxVal * 10000000);
    }

    // Default order by contract date DESC to utilize index
    sql += ` ORDER BY contract_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const startTime = Date.now();
    const results = db.prepare(sql).all(...params);
    const queryTime = Date.now() - startTime;
    console.log(`Search query execute time: ${queryTime}ms`);

    // Let's get the total count for pagination (only if query is small, else estimate)
    let totalCount = 1000;
    if (query || minBids || maxBids || minVal || maxVal) {
      // Fast count estimate, or simple limit count
      const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM').split('ORDER BY')[0];
      const countParams = params.slice(0, params.length - 2); // strip limit & offset
      const countRes = db.prepare(countSql).get(...countParams);
      totalCount = countRes.count;
    } else {
      // Get count from org_summary totals
      const countRes = db.prepare("SELECT SUM(total_contracts) as count FROM org_summary").get();
      totalCount = countRes.count || 4500000;
    }

    return NextResponse.json({
      success: true,
      data: results,
      total: totalCount,
      page,
      limit
    });
  } catch (error) {
    console.error('Database query error in search:', error);
    
    // Fallback Mock results
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      const mockSearch = [
        {
          internalId: "AOC_1",
          tenderId: "2026_CPWD_102901",
          department: "Central Public Works Department (CPWD)",
          title: "Maintenance of electrical installations at GPRA quarters, Sector 4, New Delhi",
          value: 1200000,
          bids: 3,
          vendor: "Electra Services India",
          publishedDate: "2026-05-12 11:00:00",
          closingDate: "2026-05-26 15:00:00",
          contractDate: "2026-06-10 12:00:00",
          awardDelay: 15,
          bidWindow: 14
        },
        {
          internalId: "AOC_2",
          tenderId: "2026_NHAI_209120",
          department: "National Highways Authority of India (NHAI)",
          title: "Four laning of Shimla-Solan section of NH-22 under NHDP Phase-III",
          value: 4500000000, // 450 Cr
          bids: 5,
          vendor: "Larsen & Toubro Limited",
          publishedDate: "2026-02-10 10:00:00",
          closingDate: "2026-03-30 17:00:00",
          contractDate: "2026-05-15 12:00:00",
          awardDelay: 46,
          bidWindow: 48
        },
        {
          internalId: "AOC_3",
          tenderId: "2026_MES_391029",
          department: "Military Engineer Services (MES)",
          title: "Provision of AC facilities and backup power at Command Hospital, Udhampur",
          value: 18500000,
          bids: 2,
          vendor: "Standard Coolers Pvt Ltd",
          publishedDate: "2026-04-01 09:00:00",
          closingDate: "2026-04-20 12:00:00",
          contractDate: "2026-05-12 12:00:00",
          awardDelay: 22,
          bidWindow: 19
        }
      ];
      
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback search results.",
        isLocked: true,
        data: mockSearch,
        total: mockSearch.length,
        page: 1,
        limit: 20
      });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
