import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    // 1. Fast Cache Path for Global Scatterplot
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

    // 2. Dynamic execution path
    let anomaliesSql = '';
    let normalSql = '';
    const params = [];

    if (org) {
      anomaliesSql = `
        SELECT 
          tender_id as label,
          tender_title as title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          1 as "isAnomaly"
        FROM aoc_clean
        WHERE org_name = $1
          AND bids_received <= 2
          AND award_delay_days > 30
          AND award_delay_days < 730
          AND contract_value > 0
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      normalSql = `
        SELECT 
          tender_id as label,
          tender_title as title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          0 as "isAnomaly"
        FROM aoc_clean
        WHERE org_name = $1
          AND bids_received >= 3
          AND award_delay_days >= 0 AND award_delay_days <= 90
          AND contract_value > 0
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      params.push(org);
    } else {
      anomaliesSql = `
        SELECT 
          tender_id as label,
          tender_title as title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          1 as "isAnomaly"
        FROM aoc_clean
        WHERE bids_received <= 2
          AND award_delay_days > 30
          AND award_delay_days < 730
          AND contract_value > 0
        ORDER BY contract_value DESC
        LIMIT 150
      `;
      normalSql = `
        SELECT 
          tender_id as label,
          tender_title as title,
          org_name as department,
          vendor_name as vendor,
          contract_value as value,
          award_delay_days as x,
          bids_received as y,
          0 as "isAnomaly"
        FROM aoc_clean
        WHERE bids_received >= 3
          AND award_delay_days >= 0 AND award_delay_days <= 90
          AND contract_value > 0
        ORDER BY contract_value DESC
        LIMIT 150
      `;
    }

    const anomalies = await query(anomaliesSql, org ? [org] : []);
    const normals = await query(normalSql, org ? [org] : []);

    const data = [...anomalies, ...normals].map(d => ({
      ...d,
      value: d.value ? Number(d.value) : 0,
      valueCr: d.value ? parseFloat((Number(d.value) / 10000000).toFixed(2)) : 0,
      x: d.x !== null ? Math.max(1, Math.round(Number(d.x))) : 1,
      y: d.y !== null ? Math.min(Number(d.y), 12) : 1
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
    if (error.message === 'DATABASE_UNAVAILABLE' || error.code === 'ECONNREFUSED') {
      return NextResponse.json({
        success: false,
        message: "Database is currently being built or optimized. Showing fallback scatterplot data.",
        isLocked: true,
        org: org || 'All Departments',
        anomaliesCount: 0, normalCount: 0, data: []
      });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}