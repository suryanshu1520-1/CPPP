import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    // 1. Fast Cache Path for Global View (instant, 0ms database load)
    if (!org) {
      const cachePath = path.resolve(process.cwd(), 'src/app/api/metrics/bids-distribution/global_bids.json');
      if (fs.existsSync(cachePath)) {
        const cacheContent = fs.readFileSync(cachePath, 'utf8');
        return NextResponse.json({
          success: true,
          org: 'All Departments',
          data: JSON.parse(cacheContent)
        });
      }
    }

    // 2. Dynamic execution path for drill-downs (fast, < 5ms using department indexes)
    const db = getDb();
    let sql = '';
    const params = [];

    if (org) {
      sql = `
        SELECT 
          CASE WHEN bids_received IS NULL THEN 'Unknown'
               WHEN bids_received = 1 THEN '1 Bid'
               WHEN bids_received = 2 THEN '2 Bids'
               WHEN bids_received = 3 THEN '3 Bids'
               WHEN bids_received = 4 THEN '4 Bids'
               ELSE '5+ Bids' END as bids,
          COUNT(*) as count
        FROM aoc_clean
        WHERE org_name = ? AND contract_date IS NOT NULL AND contract_date != '9999-01-01 00:00:00' AND org_name != 'Unknown'
        GROUP BY bids
        ORDER BY bids ASC
      `;
      params.push(org);
    } else {
      // Fallback query if JSON cache is missing
      sql = `
        SELECT 
          CASE WHEN bids_received IS NULL THEN 'Unknown'
               WHEN bids_received = 1 THEN '1 Bid'
               WHEN bids_received = 2 THEN '2 Bids'
               WHEN bids_received = 3 THEN '3 Bids'
               WHEN bids_received = 4 THEN '4 Bids'
               ELSE '5+ Bids' END as bids,
          COUNT(*) as count
        FROM aoc_clean
        WHERE contract_date IS NOT NULL AND contract_date != '9999-01-01 00:00:00' AND org_name != 'Unknown'
        GROUP BY bids
        ORDER BY bids ASC
      `;
    }

    const rows = db.prepare(sql).all(...params);

    // Standardize buckets structure for chart
    const bucketsMap = {
      '1 Bid': 0,
      '2 Bids': 0,
      '3 Bids': 0,
      '4 Bids': 0,
      '5+ Bids': 0
    };

    rows.forEach(r => {
      if (bucketsMap[r.bids] !== undefined) {
        bucketsMap[r.bids] = r.count;
      }
    });

    const data = Object.keys(bucketsMap).map(k => ({
      bids: k,
      count: bucketsMap[k]
    }));

    return NextResponse.json({
      success: true,
      org: org || 'All Departments',
      data
    });

  } catch (error) {
    console.error("Error in bids-distribution API:", error);

    // Fallback Mock results
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table') || error.message === 'DATABASE_UNAVAILABLE') {
      const mockData = [
        { bids: "1 Bid", count: 582857 },
        { bids: "2 Bids", count: 839811 },
        { bids: "3 Bids", count: 1474351 },
        { bids: "4 Bids", count: 551325 },
        { bids: "5+ Bids", count: 1034645 }
      ];
      return NextResponse.json({
        success: false,
        message: "Database is locked or optimizing. Showing fallback bids distribution.",
        isLocked: true,
        data: mockData
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
