import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const org = searchParams.get('org') || '';

    if (!org) {
      return NextResponse.json({
        success: false,
        error: "Missing required parameter: 'org'"
      }, { status: 400 });
    }

    // 1. Calculate dynamic HHI for the specified organization using the optimized index
    const hhiQuery = `
      WITH dept_total AS (
        SELECT SUM(contract_value) as total_val 
        FROM aoc_clean 
        WHERE org_name = ? AND contract_value > 0 AND contract_date != '9999-01-01 00:00:00'
      ),
      vendor_shares AS (
        SELECT 
          vendor_name as vendor,
          SUM(contract_value) as vendor_val,
          (SUM(contract_value) * 100.0 / (SELECT total_val FROM dept_total)) as share,
          COUNT(*) as contracts
        FROM aoc_clean
        WHERE org_name = ? AND contract_value > 0 AND vendor_name IS NOT NULL AND vendor_name != '' AND contract_date != '9999-01-01 00:00:00'
        GROUP BY vendor_name
      )
      SELECT 
        vendor,
        vendor_val as value,
        share,
        contracts,
        (SELECT total_val FROM dept_total) as totalValue,
        (SELECT SUM(share * share) FROM vendor_shares) as hhi
      FROM vendor_shares
      ORDER BY share DESC
    `;

    const results = db.prepare(hhiQuery).all(org, org);

    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        org,
        hhi: 0,
        totalValue: 0,
        vendors: []
      });
    }

    const hhi = results[0].hhi ? parseFloat(results[0].hhi.toFixed(2)) : 0;
    const totalValue = results[0].totalValue || 0;

    // Map vendor shares
    const vendors = results.map(r => ({
      vendor: r.vendor,
      value: r.value || 0,
      share: r.share ? parseFloat(r.share.toFixed(2)) : 0,
      contracts: r.contracts || 0
    }));

    // Categorize HHI concentration based on standard DOJ antitrust spectrums
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
      vendors: vendors.slice(0, 10) // Return top 10 vendors
    });

  } catch (error) {
    console.error("Error in HHI API:", error);
    
    // Fallback Mock results if DB locked or not updated yet
    if (error.code === 'SQLITE_BUSY' || error.message.includes('no such table')) {
      return NextResponse.json({
        success: false,
        message: "Database is locked or currently being rebuilt. Showing mock concentration metrics.",
        isLocked: true,
        org,
        hhi: 2854.20,
        totalValue: 184500000000,
        concentration: "highly_concentrated",
        riskLevel: "high",
        vendors: [
          { vendor: "Larsen & Toubro Limited (L&T)", value: 89000000000, share: 48.24, contracts: 120 },
          { vendor: "Dilip Buildcon Limited", value: 34000000000, share: 18.43, contracts: 45 },
          { vendor: "Tata Projects Limited", value: 12000000000, share: 6.50, contracts: 22 },
          { vendor: "Megha Engineering & Infrastructures Ltd", value: 9500000000, share: 5.15, contracts: 14 }
        ]
      });
    }
    
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
