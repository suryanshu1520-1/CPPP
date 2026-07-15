import { NextResponse } from 'next/server';
import { fetchR2Json } from '@/lib/r2';

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

    const safeOrgName = org.replace(/\//g, "_").replace(/\\/g, "_");
    try {
      const orgProfile = await fetchR2Json(`orgs/${safeOrgName}.json`);
      
      const hhi = orgProfile.summary.hhi || 0;
      const totalValue = orgProfile.summary.value || 0;
      const vendors = orgProfile.vendors || [];

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
    } catch (e) {
      console.warn(`Org profile not found for ${org}, returning empty HHI.`, e);
      return NextResponse.json({
        success: true,
        org,
        hhi: 0,
        totalValue: 0,
        concentration: 'highly_unconcentrated',
        riskLevel: 'low',
        vendors: []
      });
    }
  } catch (error) {
    console.error("Error in HHI API:", error);
    return NextResponse.json({
      success: false,
      message: "Error fetching HHI data.",
      hhi: 0,
      totalValue: 0,
      vendors: []
    });
  }
}
