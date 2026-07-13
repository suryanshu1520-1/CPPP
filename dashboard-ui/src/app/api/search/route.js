import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/turso';

/**
 * Clean search string for SQLite FTS5 MATCH
 */
function cleanFtsQuery(q) {
  const cleanQ = q.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map(t => `${t}*`).join(' AND ');
}

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

    if (q) {
      const cleanedQuery = cleanFtsQuery(q);
      sql = `
        SELECT 
          tender_id as "contractId",
          tender_id as "tenderId",
          org_name as department,
          title as title,
          contract_value as value,
          bids_received as bids,
          vendor_name as vendor,
          closing_date as "publishedDate",
          closing_date as "closingDate",
          closing_date as "contractDate",
          0 as "awardDelay",
          0 as "bidWindow"
        FROM aoc_fts
        WHERE aoc_fts MATCH ? AND org_name != 'Unknown'
      `;
      params.push(cleanedQuery);
    } else {
      sql = `
        SELECT 
          tender_id as "contractId",
          tender_id as "tenderId",
          org_name as department,
          title as title,
          contract_value as value,
          bids_received as bids,
          vendor_name as vendor,
          closing_date as "publishedDate",
          closing_date as "closingDate",
          closing_date as "contractDate",
          0 as "awardDelay",
          0 as "bidWindow"
        FROM aoc_fts
        WHERE org_name != 'Unknown'
      `;
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
      params.push(minVal * 10000000); 
    }
    if (maxVal !== null) {
      sql += ` AND contract_value <= ?`;
      params.push(maxVal * 10000000);
    }

    if (state) {
      sql += ` AND org_name = ?`;
      params.push(state);
    }
    if (entity) {
      sql += ` AND org_name = ?`;
      params.push(entity);
    }
    if (sector) {
      if (sector === 'roads') {
        sql += ` AND (org_name LIKE '%highways%' OR org_name LIKE '%nhai%' OR org_name LIKE '%road%' OR org_name LIKE '%pwd%' OR org_name LIKE '%rwd%')`;
      } else if (sector === 'defense') {
        sql += ` AND (org_name LIKE '%military%' OR org_name LIKE '%mes%' OR org_name LIKE '%weapons%' OR org_name LIKE '%defence%')`;
      } else if (sector === 'energy') {
        sql += ` AND (org_name LIKE '%coalfields%' OR org_name LIKE '%lignite%' OR org_name LIKE '%power%' OR org_name LIKE '%bhel%')`;
      } else if (sector === 'petroleum') {
        sql += ` AND (org_name LIKE '%bpcl%' OR org_name LIKE '%indianoil%' OR org_name LIKE '%hpcl%' OR org_name LIKE '%petroleum%')`;
      } else if (sector === 'agriculture') {
        sql += ` AND (org_name LIKE '%mandi%' OR org_name LIKE '%agriculture%' OR org_name LIKE '%coop%')`;
      } else if (sector === 'aviation') {
        sql += ` AND (org_name LIKE '%airports%' OR org_name LIKE '%aai%')`;
      }
    }

    sql += ` ORDER BY closing_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await query(sql, params);

    let totalCount = 1000;
    if (q && (minBids === null && maxBids === null && minVal === null && maxVal === null && !state && !sector && !entity)) {
      const countRes = await queryOne("SELECT COUNT(*) as count FROM aoc_fts WHERE aoc_fts MATCH ?", [cleanFtsQuery(q)]);
      totalCount = countRes?.count || 1000;
    } else if (q || minBids || maxBids || minVal || maxVal || state || sector || entity) {
      const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM').split('ORDER BY')[0];
      const countParams = params.slice(0, params.length - 2);
      const countRes = await queryOne(countSql, countParams);
      totalCount = countRes?.count || 1000;
    } else {
      const countRes = await queryOne("SELECT SUM(total_contracts) as count FROM org_summary");
      totalCount = countRes?.count || 4500000;
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
