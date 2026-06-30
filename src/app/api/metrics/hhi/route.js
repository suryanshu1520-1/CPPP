import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/postgres';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    if (!org) {
      return NextResponse.json({
        success: false,
        error: "Missing required parameter: 'org'"
      }, { status: 400 });
    }

    // Calculate HHI for the specified organization
    const hhiResults = await query(`
      WITH dept_total AS (
        SELECT SUM(contract_value) as total_val 
        FROM aoc_clean 
        WHERE org_name = $1 AND contract_value > 0
      ),
      vendor_shares AS (
        SELECT 
          vendor_name as vendor,
          SUM(contract_value) as vendor_val,
          (SUM(contract_value) * 100.0 / (SELECT total_val FROM dept_total)) as share,
          COUNT(*)::int as contracts
        FROM aoc_clean
        WHERE org_name = $1 AND contract_value > 0 AND vendor_name IS NOT NULL AND vendor_name != ''
        GROUP BY vendor_name
      )
      SELECT 
        vendor,
        vendor_val as value,
        share,
        contracts,
        (SELECT total_val FROM dept_total) as "totalValue",
        (SELECT SUM(share * share) FROM vendor_shares) as hhi
      FROM vendor_shares
      ORDER BY share DESC
    `, [org, org]);

    if (hhiResults.length === 0) {
      return NextResponse.json({
        success: true,
        org,
        hhi: 0,
        totalValue: 0,
        vendors: []
      });
    }

    const hhi = hhiResults[0].hhi ? parseFloat(Number(hhiResults[0].hhi).toFixed(2)) : 0;
    const totalValue = hhiResults[0].totalValue ? Number(hhiResults[0].totalValue) : 0;

    const vendors = hhiResults.map(r => ({
      vendor: r.vendor,
      value: r.value ? Number(r.value) : 0,
      share: r.share ? parseFloat(Number(r.share).toFixed(2)) : 0,
      contracts: r.contracts || 0
    }));

    let concentration = 'highly_unconcentrated';
    let riskLevel = 'low';
    if (hhi > 2500) {
      concentration = 'highly_concentrated';
      riskLevel = 'high';
    } else if (hhi >= 1500) {
      concentration = 'moderately_concentrated';
      riskLevel = 'medium';
    }

    return NextResponse.json({
      success: true,
      org,
      hhi,
      totalValue,
      concentration,
      riskLevel,
      vendors: vendors.slice(0, 10)
    });

  } catch (error) {
    console.error("Error in HHI API:", error);

    if (error.message?.includes('DATABASE_UNAVAILABLE') || error.code === 'ECONNREFUSED') {
      return NextResponse.json({
        success: false,
        message: "Database is locked or currently being rebuilt. Showing mock concentration metrics.",
        isLocked: true,
        hhi: 2854.20,
        totalValue: 184500000000,
        concentration: "highly_concentrated",
        riskLevel: "high",
        vendors: [
          { vendor: "Larsen & Toubro Limited (L&T)", value: 89000000000, share: 48.24, contracts: 120 },
          { vendor: "Dilip Buildcon Limited", value: 34000000000, share: 18.43, contracts: 45 }
        ]
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}