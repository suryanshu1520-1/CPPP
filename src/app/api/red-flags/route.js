import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET(request) {
  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const type = searchParams.get('type') || 'all';
    const org = searchParams.get('org') || '';
    const vendor = searchParams.get('vendor') || '';
    const minVal = searchParams.get('minVal') ? parseFloat(searchParams.get('minVal')) : null;

    let whereClause = "(bids_received = 1 OR (bid_window_days >= 0 AND bid_window_days < 7) OR award_delay_days > 180)";
    if (type === 'single_bid') {
      whereClause = "bids_received = 1";
    } else if (type === 'rush') {
      whereClause = "(bid_window_days >= 0 AND bid_window_days < 7)";
    } else if (type === 'delayed') {
      whereClause = "award_delay_days > 180";
    }

    let sql = `
      SELECT 
        contract_id as "contractId",
        tender_id as "tenderId",
        org_name as department,
        tender_title as title,
        contract_value as value,
        bids_received as bids,
        vendor_name as vendor,
        published_date as "publishedDate",
        closing_date as "closingDate",
        contract_date as "contractDate",
        award_delay_days as "awardDelay",
        bid_window_days as "bidWindow"
      FROM aoc_clean
      WHERE ${whereClause} AND contract_date IS NOT NULL AND org_name != 'Unknown'
    `;
    const params = [];
    let paramIndex = 1;

    if (org) {
      sql += ` AND org_name = $${paramIndex++}`;
      params.push(org);
    }
    if (vendor) {
      sql += ` AND vendor_name = $${paramIndex++}`;
      params.push(vendor);
    }
    if (minVal !== null) {
      sql += ` AND contract_value >= $${paramIndex++}`;
      params.push(minVal * 10000000);
    }

    sql += ` ORDER BY contract_date DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const startTime = Date.now();
    const tenders = await query(sql, params);
    const queryTime = Date.now() - startTime;
    console.log(`Red flag query executed in ${queryTime}ms`);

    return NextResponse.json({
      success: true,
      data: tenders
    });
  } catch (error) {
    console.error('Database query error in red-flags:', error);

    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      const mockAlerts = [
        {
          contractId: "mock-1", tenderId: "2026_CPWD_839021_1",
          department: "Central Public Works Department (CPWD)",
          title: "Construction of boundary wall and security cabins at NIT Campus",
          value: 45000000, bids: 1, vendor: "R. K. Builders & Co.",
          publishedDate: "2026-05-10", closingDate: "2026-05-12",
          contractDate: "2026-06-15", awardDelay: 36, bidWindow: 2
        },
        {
          contractId: "mock-2", tenderId: "2026_NHAI_930219_4",
          department: "National Highways Authority of India (NHAI)",
          title: "Consultancy services for preparation of DPR for 4-laning of NH-31",
          value: 125000000, bids: 1, vendor: "Vikas Infrastructure Consultants Ltd",
          publishedDate: "2026-04-12", closingDate: "2026-05-15",
          contractDate: "2026-11-20", awardDelay: 189, bidWindow: 33
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