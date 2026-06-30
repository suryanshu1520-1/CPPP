import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Helper function to prepare safe query strings for FTS5 with prefix wildcard support
function cleanFtsQuery(q) {
  const cleanQ = q.replace(/["'\\*:\-()+]/g, ' ').trim();
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map(t => `${t}*`).join(' AND ');
}

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
    const state = searchParams.get('state') || '';
    const sector = searchParams.get('sector') || '';
    const entity = searchParams.get('entity') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const offset = (page - 1) * limit;

    let sql = '';
    const params = [];

    if (query) {
      const cleanedQuery = cleanFtsQuery(query);
      sql = `
        SELECT 
          c.internal_id as internalId,
          c.tender_id as tenderId,
          c.org_name as department,
          c.title,
          c.contract_value as value,
          c.bids_received as bids,
          c.vendor_name as vendor,
          c.published_date as publishedDate,
          c.closing_date as closingDate,
          c.contract_date as contractDate,
          c.award_delay_days as awardDelay,
          c.bid_window_days as bidWindow
        FROM aoc_clean c
        JOIN aoc_fts f ON c.rowid = f.rowid
        WHERE aoc_fts MATCH ? AND c.contract_date != '9999-01-01 00:00:00' AND c.org_name != 'Unknown'
      `;
      params.push(cleanedQuery);
    } else {
      sql = `
        SELECT 
          c.internal_id as internalId,
          c.tender_id as tenderId,
          c.org_name as department,
          c.title,
          c.contract_value as value,
          c.bids_received as bids,
          c.vendor_name as vendor,
          c.published_date as publishedDate,
          c.closing_date as closingDate,
          c.contract_date as contractDate,
          c.award_delay_days as awardDelay,
          c.bid_window_days as bidWindow
        FROM aoc_clean c
        WHERE c.contract_date != '9999-01-01 00:00:00' AND c.org_name != 'Unknown'
      `;
    }

    if (minBids !== null) {
      sql += ` AND c.bids_received >= ?`;
      params.push(minBids);
    }
    if (maxBids !== null) {
      sql += ` AND c.bids_received <= ?`;
      params.push(maxBids);
    }
    if (minVal !== null) {
      sql += ` AND c.contract_value >= ?`;
      params.push(minVal * 10000000); // UI passes in Crores, DB stores absolute values
    }
    if (maxVal !== null) {
      sql += ` AND c.contract_value <= ?`;
      params.push(maxVal * 10000000);
    }

    if (state) {
      sql += ` AND c.org_name = ?`;
      params.push(state);
    }
    if (entity) {
      sql += ` AND c.org_name = ?`;
      params.push(entity);
    }
    if (sector) {
      if (sector === 'roads') {
        sql += ` AND (c.org_name LIKE '%highways%' OR c.org_name LIKE '%nhai%' OR c.org_name LIKE '%road%' OR c.org_name LIKE '%pwd%' OR c.org_name LIKE '%rwd%')`;
      } else if (sector === 'defense') {
        sql += ` AND (c.org_name LIKE '%military%' OR c.org_name LIKE '%mes%' OR c.org_name LIKE '%weapons%' OR c.org_name LIKE '%defence%')`;
      } else if (sector === 'energy') {
        sql += ` AND (c.org_name LIKE '%coalfields%' OR c.org_name LIKE '%lignite%' OR c.org_name LIKE '%power%' OR c.org_name LIKE '%bhel%')`;
      } else if (sector === 'petroleum') {
        sql += ` AND (c.org_name LIKE '%bpcl%' OR c.org_name LIKE '%indianoil%' OR c.org_name LIKE '%hpcl%' OR c.org_name LIKE '%petroleum%')`;
      } else if (sector === 'agriculture') {
        sql += ` AND (c.org_name LIKE '%mandi%' OR c.org_name LIKE '%agriculture%' OR c.org_name LIKE '%coop%')`;
      } else if (sector === 'aviation') {
        sql += ` AND (c.org_name LIKE '%airports%' OR c.org_name LIKE '%aai%')`;
      }
    }

    // Default order by contract date DESC to utilize index
    sql += ` ORDER BY c.contract_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const startTime = Date.now();
    const results = db.prepare(sql).all(...params);
    const queryTime = Date.now() - startTime;
    console.log(`Search query execute time: ${queryTime}ms`);

    // Let's get the total count for pagination (optimized to bypass heavy joins for simple text searches)
    let totalCount = 1000;
    if (query && (minBids === null && maxBids === null && minVal === null && maxVal === null && !state && !sector && !entity)) {
      // Fast path: direct FTS5 query count without joining raw awards table (takes ~4ms)
      const countRes = db.prepare("SELECT COUNT(*) as count FROM aoc_fts WHERE aoc_fts MATCH ?").get(cleanFtsQuery(query));
      totalCount = countRes.count;
    } else if (query || minBids || maxBids || minVal || maxVal || state || sector || entity) {
      // Slow path: join count needed because filters exist
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
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table') || error.message === 'DATABASE_UNAVAILABLE') {
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
