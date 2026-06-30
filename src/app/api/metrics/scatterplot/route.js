import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    // 1. Fast Cache Path for Global Scatterplot (instant, 0ms database load)
    if (!org) {
      const cachePath = path.resolve(process.cwd(), 'src/app/api/metrics/scatterplot/global_scatterplot.json');
      if (fs.existsSync(cachePath)) {
        const cacheContent = fs.readFileSync(cachePath, 'utf8');
        return NextResponse.json({
          success: true,
          org: 'All Departments',
          data: JSON.parse(cacheContent)
        });
      }
    }

    // 2. Dynamic execution path for drill-downs
    // Axes: X = award_delay_days (0-365), Y = bids_received (1-10+)
    // Both fields are fully populated and give genuine 2D spread.
    // Anomaly: single/dual bid AND long award delay (corruption signature)
    // Normal: competitive bids (3+) with normal award delay (<60 days)
    const db = getDb();
    let anomaliesSql = '';
    let normalSql = '';
    const params = [];

    if (org) {
      anomaliesSql = `
        SELECT 
          tender_id as label,
          title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          1 as isAnomaly
        FROM aoc_clean
        WHERE org_name = ?
          AND bids_received <= 2
          AND award_delay_days > 30
          AND award_delay_days < 730
          AND contract_value > 0
          AND contract_date != '9999-01-01 00:00:00'
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      normalSql = `
        SELECT 
          tender_id as label,
          title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          0 as isAnomaly
        FROM aoc_clean
        WHERE org_name = ?
          AND bids_received >= 3
          AND award_delay_days >= 0 AND award_delay_days <= 90
          AND contract_value > 0
          AND contract_date != '9999-01-01 00:00:00'
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      params.push(org, org);
    } else {
      // Fallback query if JSON cache is missing
      anomaliesSql = `
        SELECT 
          tender_id as label,
          title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          1 as isAnomaly
        FROM aoc_clean
        WHERE bids_received <= 2
          AND award_delay_days > 30
          AND award_delay_days < 730
          AND contract_value > 0
          AND contract_date != '9999-01-01 00:00:00'
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      normalSql = `
        SELECT 
          tender_id as label,
          title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          0 as isAnomaly
        FROM aoc_clean
        WHERE bids_received >= 3
          AND award_delay_days >= 0 AND award_delay_days <= 90
          AND contract_value > 0
          AND contract_date != '9999-01-01 00:00:00'
        ORDER BY contract_value DESC
        LIMIT 150
      `;
    }

    // SQLite driver prepare execution
    const anomalies = org
      ? db.prepare(anomaliesSql).all(params[0])
      : db.prepare(anomaliesSql).all();

    const normals = org
      ? db.prepare(normalSql).all(params[1])
      : db.prepare(normalSql).all();

    // Combine data points
    const data = [...anomalies, ...normals].map(d => ({
      ...d,
      valueCr: parseFloat((d.value / 10000000).toFixed(2)),
      x: d.x !== null ? Math.max(1, Math.round(d.x)) : 1,
      y: d.y !== null ? Math.min(d.y, 12) : 1  // Cap at 12 for display, rare outliers
    }));

    return NextResponse.json({
      success: true,
      org: org || 'All Departments',
      anomaliesCount: anomalies.length,
      normalCount: normals.length,
      data
    });

  } catch (error) {
    console.error("Error in scatterplot API:", error);
    if (error.message === 'DATABASE_UNAVAILABLE') {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback scatterplot data.",
        isLocked: true,
        org: org || 'All Departments',
        anomaliesCount: 0,
        normalCount: 0,
        data: []
      });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
