import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/postgres';

export async function GET(request) {
  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const minBids = searchParams.get('minBids') ? parseInt(searchParams.get('minBids')) : null;
    const maxBids = searchParams.get('maxBids') ? parseInt(searchParams.get('maxBids')) : null;
    const minVal = searchParams.get('minVal') ? parseFloat(searchParams.get('minVal')) : null;
    const maxVal = searchParams.get('maxVal') ? parseFloat(searchParams.get('maxVal')) : null;
    const state = searchParams.get('state') || '';
    const sector = searchParams.get('sector') || '';
    const entity = searchParams.get('entity') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const offset = (page - 1) * limit;

    let sql = '';
    const params = [];
    let paramIndex = 1;

    if (q) {
      // Use PostgreSQL full-text search with the universal_search_query helper
      sql = `
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
          bid_window_days as "bidWindow",
          ts_rank(search_vector, universal_search_query($${paramIndex})) as rank
        FROM aoc_clean
        WHERE search_vector @@ universal_search_query($${paramIndex++})
          AND org_name != 'Unknown'
      `;
      params.push(q);
    } else {
      sql = `
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
        WHERE org_name != 'Unknown'
      `;
    }

    if (minBids !== null) {
      sql += ` AND bids_received >= $${paramIndex++}`;
      params.push(minBids);
    }
    if (maxBids !== null) {
      sql += ` AND bids_received <= $${paramIndex++}`;
      params.push(maxBids);
    }
    if (minVal !== null) {
      sql += ` AND contract_value >= $${paramIndex++}`;
      params.push(minVal * 10000000);
    }
    if (maxVal !== null) {
      sql += ` AND contract_value <= $${paramIndex++}`;
      params.push(maxVal * 10000000);
    }
    if (entity) {
      sql += ` AND org_name = $${paramIndex++}`;
      params.push(entity);
    }
    if (state) {
      sql += ` AND org_name = $${paramIndex++}`;
      params.push(state);
    }
    if (sector) {
      if (sector === 'roads') {
        sql += ` AND (org_name ILIKE '%highways%' OR org_name ILIKE '%nhai%' OR org_name ILIKE '%road%' OR org_name ILIKE '%pwd%' OR org_name ILIKE '%rwd%')`;
      } else if (sector === 'defense') {
        sql += ` AND (org_name ILIKE '%military%' OR org_name ILIKE '%mes%' OR org_name ILIKE '%weapons%' OR org_name ILIKE '%defence%')`;
      } else if (sector === 'energy') {
        sql += ` AND (org_name ILIKE '%coalfields%' OR org_name ILIKE '%lignite%' OR org_name ILIKE '%power%' OR org_name ILIKE '%bhel%')`;
      } else if (sector === 'petroleum') {
        sql += ` AND (org_name ILIKE '%bpcl%' OR org_name ILIKE '%indianoil%' OR org_name ILIKE '%hpcl%' OR org_name ILIKE '%petroleum%')`;
      } else if (sector === 'agriculture') {
        sql += ` AND (org_name ILIKE '%mandi%' OR org_name ILIKE '%agriculture%' OR org_name ILIKE '%coop%')`;
      } else if (sector === 'aviation') {
        sql += ` AND (org_name ILIKE '%airports%' OR org_name ILIKE '%aai%')`;
      }
    }

    // Order: by rank if FTS search, otherwise by contract date
    if (q) {
      sql += ` ORDER BY rank DESC, contract_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    } else {
      sql += ` ORDER BY contract_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    }
    params.push(limit, offset);

    const startTime = Date.now();
    const results = await query(sql, params);
    const queryTime = Date.now() - startTime;
    console.log(`Search query executed in ${queryTime}ms`);

    // Get total count for pagination
    let totalCount = 1000;
    if (q) {
      const countResult = await queryOne(`
        SELECT COUNT(*) as count FROM aoc_clean 
        WHERE search_vector @@ universal_search_query($1)
      `, [q]);
      totalCount = countResult?.count ? Number(countResult.count) : 1000;
    } else {
      const countResult = await queryOne(`SELECT COUNT(*) as count FROM aoc_clean`);
      totalCount = countResult?.count ? Number(countResult.count) : 4500000;
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

    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      const mockSearch = [
        {
          contractId: "mock-1", tenderId: "2026_CPWD_102901",
          department: "Central Public Works Department (CPWD)",
          title: "Maintenance of electrical installations at GPRA quarters, Sector 4, New Delhi",
          value: 1200000, bids: 3, vendor: "Electra Services India",
          publishedDate: "2026-05-12", closingDate: "2026-05-26",
          contractDate: "2026-06-10", awardDelay: 15, bidWindow: 14
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